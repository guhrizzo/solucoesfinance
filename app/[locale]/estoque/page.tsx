"use client";

import { useState, useEffect, useMemo, useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/app/hooks/useAuth";
import Navbar from "@/app/components/Navbar";
import AccessDenied from "@/app/components/AccessDenied";
import { PageLoader } from "@/app/components/ui";
import ConfirmModal from "@/app/components/ConfirmModal";
import {
  Plus, Search, Edit3, Trash2, Link as LinkIcon, RefreshCw, AlertTriangle,
  Settings, LogOut, Check, Globe, HelpCircle, AlertCircle, ShoppingBag,
  Loader2, ArrowRight, Package, X, CheckCircle, Download
} from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { formatMoney } from "@/lib/format";

// ─────────────────────────────────────────────────────────────────────────────
// Shopee OCULTA da interface por enquanto. A integração de backend continua
// existindo (rotas /api/shopee/*, lib/shopee.ts, webhooks, tipos) — só
// escondemos os pontos de entrada visíveis no Estoque: aba de filtro, painel
// "Resumo Shopee", o canal "Shopee" no modal de integrações e a opção Shopee
// no vínculo manual.
// Para voltar a exibir a Shopee, troque para `true`.
const SHOPEE_UI_VISIVEL = false;

// Interfaces de Dados
interface ProdutoEstoque {
  id: string;
  sku: string;
  name: string;
  price: number;
  quantity: number;
  minQuantity: number;
  updatedAt: number;
}

interface Integracao {
  id: string;
  platform: "mercadolivre" | "shopee";
  accountId: string;
  accountName: string;
  accessToken: string;
  expiresAt: number;
  createdAt?: number;
  updatedAt?: number;
}

interface Vinculo {
  id: string;
  sku: string;
  platform: "mercadolivre" | "shopee";
  adId: string;
  title: string;
  price: number;
  quantity: number;
}

const toBRL = (n: number, locale: string) => formatMoney(n, locale);

export default function EstoquePage() {
  const t = useTranslations("estoque");
  const tc = useTranslations("common");
  const tNav = useTranslations("nav");
  const locale = useLocale();
  const { user, loading: authLoading } = useAuth();

  const platformLabel = (p: "mercadolivre" | "shopee") => t(`platformName.${p}`);

  // Resolve de quem são os dados que este login deve ver: o próprio uid
  // (dono) ou o do dono da conta (membro convidado) — ver
  // lib/accountScope.ts. Todo o resto do arquivo já usa `ownerUid` (não
  // `user.uid` diretamente) pra ler/escrever estoque, integrações e
  // vínculos. Membro sem "estoque" liberado nem chega a assinar as
  // coleções abaixo (os efeitos de carga ficam parados até `ownerUid`
  // resolver, ver os `if (!user || !ownerUid) return;` logo adiante).
  const [ownerUid, setOwnerUid] = useState("");
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { resolveAccountScope, hasPermission } = await import("@/lib/accountScope");
      const scope = await resolveAccountScope(db, user.uid);
      if (cancelled) return;
      if (!hasPermission(scope, "estoque")) { setBlocked(true); return; }
      setOwnerUid(scope.ownerUid);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // ── Logout ─────────────────────────────────────────────────────────────────
  async function handleLogout() {
    const { getFirebase } = await import("@/lib/firebase");
    const { signOut } = await import("firebase/auth");
    const { auth } = await getFirebase();
    await signOut(auth);
    window.location.href = "/login";
  }

  // Estados do Banco de Dados
  const [produtos, setProdutos] = useState<ProdutoEstoque[]>([]);
  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [dbLoading, setDbLoading] = useState(true);

  // Estados de UI/Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"todos" | "mercadolivre" | "shopee" | "local" | "baixo">("todos");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);

  // Confirmação no estilo NexusFi (substitui o confirm() nativo do navegador).
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmText: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const runConfirm = async () => {
    if (!confirmDialog) return;
    setConfirmLoading(true);
    try {
      await confirmDialog.onConfirm();
    } finally {
      setConfirmLoading(false);
      setConfirmDialog(null);
    }
  };
  const [syncing, setSyncing] = useState(false);

  // Estados de Modais
  const [modalProdutoOpen, setModalProdutoOpen] = useState(false);
  const [editingProduto, setEditingProduto] = useState<ProdutoEstoque | null>(null);
  const [modalIntegracoesOpen, setModalIntegracoesOpen] = useState(false);
  const [modalVinculosOpen, setModalVinculosOpen] = useState(false);
  const [selectedProdutoSku, setSelectedProdutoSku] = useState<string | null>(null);

  // Formulário Produto
  const [formSku, setFormSku] = useState("");
  const [formName, setFormName] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formQuantity, setFormQuantity] = useState("");
  const [formMinQuantity, setFormMinQuantity] = useState("10");
  // ids dos campos dos formulários desta página (rótulos ↔ controles) —
  // gerados uma vez aqui, não a cada abertura de modal.
  const formSkuId = useId();
  const formNameId = useId();
  const formPriceId = useId();
  const formQuantityId = useId();
  const formMinQuantityId = useId();
  const vinculoPlatformId = useId();
  const vinculoAdIdId = useId();
  const vinculoTitleId = useId();
  const vinculoPriceId = useId();
  const vinculoQuantityId = useId();
  const [formSaving, setFormSaving] = useState(false);

  // Formulário Vínculo Manual
  const [formVinculoPlatform, setFormVinculoPlatform] = useState<"mercadolivre" | "shopee">("mercadolivre");
  const [formVinculoAdId, setFormVinculoAdId] = useState("");
  const [formVinculoTitle, setFormVinculoTitle] = useState("");
  const [formVinculoPrice, setFormVinculoPrice] = useState("");
  const [formVinculoQuantity, setFormVinculoQuantity] = useState("");
  const [formVinculoSaving, setFormVinculoSaving] = useState(false);

  // Resumo Shopee: nº de itens/unidades cadastrados + valor líquido a receber
  // (escrow). Carregado sob demanda de /api/shopee/repasse.
  interface ShopeeResumo {
    mock: boolean;
    estoque: { itens: number; unidades: number; skus: number };
    repasse: { pendente: number; liberado: number; taxas: number; pedidosLidos: number; truncado: boolean };
    aviso?: string;
  }
  const [shopeeResumo, setShopeeResumo] = useState<ShopeeResumo | null>(null);
  const [shopeeResumoLoading, setShopeeResumoLoading] = useState(false);

  // Sistema de Toast
  const showToast = (msg: string, type: "success" | "error" | "info" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Redireciona usuários do ramo de Serviço para o dashboard (bloqueio de rota)
  useEffect(() => {
    if (!user || !ownerUid) return;

    const cached = localStorage.getItem(`onboarding_ramo_${ownerUid}`);
    if (cached) {
      try {
        const ramo = JSON.parse(cached);
        if (ramo.includes("Serviço")) {
          window.location.href = "/dashboard";
          return;
        }
      } catch (e) {}
    }

    (async () => {
      try {
        const { getFirebase } = await import("@/lib/firebase");
        const { db } = await getFirebase();
        const { doc, getDoc } = await import("firebase/firestore");
        const snap = await getDoc(doc(db, "users", ownerUid, "profile", "onboarding"));
        if (snap.exists()) {
          const answers = snap.data()?.answers;
          if (answers?.ramo?.includes("Serviço")) {
            window.location.href = "/dashboard";
          }
        }
      } catch (err) {
        console.error("Erro ao verificar ramo em estoque:", err);
      }
    })();
  }, [user, ownerUid]);

  // Carregar dados em tempo real do Firestore
  useEffect(() => {
    if (!user || !ownerUid) return;

    let unsubEstoque: () => void;
    let unsubIntegracoes: () => void;
    let unsubVinculos: () => void;

    (async () => {
      try {
        const { getFirebase } = await import("@/lib/firebase");
        const { db } = await getFirebase();
        const { collection, onSnapshot, query, where } = await import("firebase/firestore");

        // 1. Ouvir estoque central
        const qEstoque = query(collection(db, "estoque"), where("userId", "==", ownerUid));
        unsubEstoque = onSnapshot(qEstoque, (snap) => {
          const list: ProdutoEstoque[] = [];
          snap.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as ProdutoEstoque);
          });
          setProdutos(list.sort((a, b) => b.updatedAt - a.updatedAt));
          setDbLoading(false);
        }, (err) => {
          console.error("Erro estoque snap:", err);
          setDbLoading(false);
        });

        // 2. Ouvir integrações de contas
        const qIntegracoes = query(collection(db, "integracoes"), where("userId", "==", ownerUid));
        unsubIntegracoes = onSnapshot(qIntegracoes, (snap) => {
          const list: Integracao[] = [];
          snap.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as Integracao);
          });
          setIntegracoes(list);
        });

        // 3. Ouvir vínculos de anúncios
        const qVinculos = query(collection(db, "vinculos"), where("userId", "==", ownerUid));
        unsubVinculos = onSnapshot(qVinculos, (snap) => {
          const list: Vinculo[] = [];
          snap.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as Vinculo);
          });
          setVinculos(list);
        });

      } catch (err) {
        console.error("Erro ao configurar listeners do Firestore:", err);
        setDbLoading(false);
      }
    })();

    return () => {
      unsubEstoque?.();
      unsubIntegracoes?.();
      unsubVinculos?.();
    };
  }, [user, ownerUid]);

  // Capturar retornos de OAuth (parâmetros da URL)
  useEffect(() => {
    const url = new URL(window.location.href);
    const integration = url.searchParams.get("integration");
    const message = url.searchParams.get("message");
    const imported = url.searchParams.get("imported");
    const warning = url.searchParams.get("warning");

    if (integration === "ml_success") {
      if (warning === "limited_permissions") {
        showToast(t("toast.mlConnectedLimited"), "info");
      } else {
        showToast(
          imported && imported !== "0"
            ? t("toast.mlIntegratedImported", { count: imported })
            : t("toast.mlIntegrated"),
          "success"
        );
      }
      cleanUrlParams();
    } else if (integration === "shopee_success") {
      if (warning === "limited_permissions") {
        showToast(t("toast.shopeeConnectedLimited"), "info");
      } else {
        showToast(
          imported && imported !== "0"
            ? t("toast.shopeeIntegratedImported", { count: imported })
            : t("toast.shopeeIntegrated"),
          "success"
        );
      }
      cleanUrlParams();
    } else if (integration === "ml_error" || integration === "shopee_error") {
      showToast(t("toast.integrationError", { message: message || t("toast.integrationErrorGeneric") }), "error");
      cleanUrlParams();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanUrlParams = () => {
    const newUrl = window.location.pathname;
    window.history.replaceState({}, document.title, newUrl);
  };

  // Controlar classe modal-open no body para efeito de desfoque (blur) na navbar
  useEffect(() => {
    const anyModalOpen = modalProdutoOpen || modalIntegracoesOpen || modalVinculosOpen;
    if (anyModalOpen) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [modalProdutoOpen, modalIntegracoesOpen, modalVinculosOpen]);

  // Sincronizar Estoque Manualmente.
  // direction "pull" = puxa estoque/preço do canal pro central (canal manda).
  const handleSincronizarManual = async (
    platformFilter?: "mercadolivre" | "shopee",
    direction?: "push" | "pull"
  ) => {
    if (!user || syncing) return;
    setSyncing(true);
    showToast(
      direction === "pull" ? t("sync.pullingML") : t("sync.syncing"),
      "info"
    );

    try {
      const res = await authedFetch("/api/estoque/sincronizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: platformFilter, direction }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || t("sync.complete"), "success");
      } else {
        showToast(data.error || t("sync.failed"), "error");
      }
    } catch (err) {
      console.error(err);
      showToast(t("sync.serverError"), "error");
    } finally {
      setSyncing(false);
    }
  };

  // Carrega o resumo da Shopee (itens cadastrados + valor líquido a receber).
  const carregarShopeeResumo = async () => {
    if (!ownerUid) return;
    setShopeeResumoLoading(true);
    try {
      const res = await authedFetch("/api/shopee/repasse");
      const data = await res.json();
      if (res.ok) setShopeeResumo(data);
      else showToast(data.error || t("toast.shopeeRepasseFail"), "error");
    } catch (err) {
      console.error(err);
      showToast(t("toast.shopeeRepasseError"), "error");
    } finally {
      setShopeeResumoLoading(false);
    }
  };

  const temShopee = useMemo(
    () => integracoes.some((i) => i.platform === "shopee"),
    [integracoes]
  );

  const temMercadoLivre = useMemo(
    () => integracoes.some((i) => i.platform === "mercadolivre"),
    [integracoes]
  );

  // Resumo de identidade da(s) conta(s) de um canal, pro badge do modal.
  const resumoContas = (platform: "mercadolivre" | "shopee") => {
    const contas = integracoes.filter((i) => i.platform === platform);
    if (contas.length === 0) return null;
    if (contas.length === 1) return t("accountsSummary.one", { name: contas[0].accountName });
    return t("accountsSummary.many", { count: contas.length });
  };

  // Estado do token de uma integração — texto transparente, sem alarme falso
  // (o access token renova sozinho na próxima chamada via getValidAccessToken).
  const statusToken = (i: Integracao) => {
    if (!i.accessToken || i.accessToken.startsWith("mock_")) return t("tokenStatus.simMode");
    if (!i.expiresAt) return t("tokenStatus.connected");
    return i.expiresAt > Date.now()
      ? t("tokenStatus.validUntil", {
          date: new Date(i.expiresAt).toLocaleString(locale, {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          }),
        })
      : t("tokenStatus.renewsNext");
  };

  // Puxa o resumo quando há loja Shopee conectada (na carga e ao abrir o modal).
  useEffect(() => {
    if (temShopee && ownerUid && !shopeeResumo && !shopeeResumoLoading) {
      carregarShopeeResumo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temShopee, ownerUid]);

  // Salvar Produto Centralizado (Novo ou Editando)
  const handleSaveProduto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formSku || !formName || !formPrice || !formQuantity) return;

    setFormSaving(true);
    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { collection, addDoc, updateDoc, doc, query, where, getDocs } = await import("firebase/firestore");

      const parsedPrice = parseFloat(formPrice.replace(",", "."));
      const parsedQuantity = parseInt(formQuantity);
      const parsedMinQuantity = parseInt(formMinQuantity) || 10;

      const produtoData = {
        sku: formSku.trim().toUpperCase(),
        name: formName.trim(),
        price: parsedPrice,
        quantity: parsedQuantity,
        minQuantity: parsedMinQuantity,
        updatedAt: Date.now(),
      };

      if (editingProduto) {
        // Atualizando produto existente
        await updateDoc(doc(db, "estoque", editingProduto.id), produtoData);

        // Também atualizar o estoque registrado em todos os vínculos desse SKU
        const snapVinculos = await getDocs(query(collection(db, "vinculos"), where("userId", "==", ownerUid), where("sku", "==", editingProduto.sku)));
        for (const d of snapVinculos.docs) {
          await updateDoc(doc(db, "vinculos", d.id), {
            quantity: parsedQuantity,
            updatedAt: Date.now()
          });
        }

        showToast(t("toast.productUpdated"));
      } else {
        // Criando novo produto
        // Verificar SKU duplicado
        const qSku = query(collection(db, "estoque"), where("userId", "==", ownerUid), where("sku", "==", formSku.trim().toUpperCase()));
        const snapSku = await getDocs(qSku);
        if (!snapSku.empty) {
          showToast(t("toast.skuInUse"), "error");
          setFormSaving(false);
          return;
        }

        await addDoc(collection(db, "estoque"), {
          ...produtoData,
          userId: ownerUid,
          createdAt: Date.now(),
        });
        showToast(t("toast.productCreated"));
      }

      setModalProdutoOpen(false);
      resetProdutoForm();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || t("toast.productSaveError"), "error");
    } finally {
      setFormSaving(false);
    }
  };

  const resetProdutoForm = () => {
    setFormSku("");
    setFormName("");
    setFormPrice("");
    setFormQuantity("");
    setFormMinQuantity("10");
    setEditingProduto(null);
  };

  // Excluir Produto
  const handleDeleteProduto = (id: string, sku: string) => {
    setConfirmDialog({
      title: t("confirm.removeProductTitle"),
      message: t("confirm.removeProductMsg", { sku }),
      confirmText: t("confirm.removeProductAction"),
      onConfirm: () => doDeleteProduto(id, sku),
    });
  };

  const doDeleteProduto = async (id: string, sku: string) => {
    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { doc, deleteDoc, collection, query, where, getDocs } = await import("firebase/firestore");

      // Remover produto
      await deleteDoc(doc(db, "estoque", id));

      // Remover vínculos desse SKU
      const qVinculos = query(collection(db, "vinculos"), where("userId", "==", ownerUid), where("sku", "==", sku));
      const snapVinculos = await getDocs(qVinculos);
      for (const d of snapVinculos.docs) {
        await deleteDoc(doc(db, "vinculos", d.id));
      }

      showToast(t("toast.productRemoved"), "success");
    } catch (err) {
      console.error(err);
      showToast(t("toast.productRemoveError"), "error");
    }
  };

  // Desconectar Integração
  const handleDisconnect = (id: string, platform: "mercadolivre" | "shopee") => {
    setConfirmDialog({
      title: t("confirm.disconnectTitle"),
      message: t("confirm.disconnectMsg", { platform: platformLabel(platform) }),
      confirmText: t("confirm.disconnectAction"),
      onConfirm: () => doDisconnect(id),
    });
  };

  const doDisconnect = async (id: string) => {
    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { doc, deleteDoc, collection, query, where, getDocs } = await import("firebase/firestore");

      // Remover integração
      await deleteDoc(doc(db, "integracoes", id));

      // Remover vínculos associados a essa integração
      const qVinculos = query(collection(db, "vinculos"), where("userId", "==", ownerUid), where("connectionId", "==", id));
      const snapVinculos = await getDocs(qVinculos);
      for (const d of snapVinculos.docs) {
        await deleteDoc(doc(db, "vinculos", d.id));
      }

      showToast(t("toast.integrationRemoved"), "success");
    } catch (err) {
      console.error(err);
      showToast(t("toast.disconnectError"), "error");
    }
  };

  // Adicionar Vínculo Manual
  const handleAddVinculo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedProdutoSku || !formVinculoAdId || !formVinculoTitle || !formVinculoPrice || !formVinculoQuantity) return;

    setFormVinculoSaving(true);
    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { collection, addDoc, getDocs, query, where } = await import("firebase/firestore");

      // Verificar se já existe vínculo para este anúncio específico
      const qExistente = query(
        collection(db, "vinculos"),
        where("userId", "==", ownerUid),
        where("platform", "==", formVinculoPlatform),
        where("adId", "==", formVinculoAdId.trim())
      );
      const snapExistente = await getDocs(qExistente);
      if (!snapExistente.empty) {
        showToast(t("toast.adAlreadyLinked"), "error");
        setFormVinculoSaving(false);
        return;
      }

      // Achar a conexão ID correspondente à plataforma
      const qConexao = query(collection(db, "integracoes"), where("userId", "==", ownerUid), where("platform", "==", formVinculoPlatform));
      const snapConexao = await getDocs(qConexao);

      const connectionId = !snapConexao.empty ? snapConexao.docs[0].id : "mock_manual_connection";

      await addDoc(collection(db, "vinculos"), {
        userId: ownerUid,
        sku: selectedProdutoSku,
        platform: formVinculoPlatform,
        adId: formVinculoAdId.trim(),
        title: formVinculoTitle.trim(),
        price: parseFloat(formVinculoPrice.replace(",", ".")),
        quantity: parseInt(formVinculoQuantity),
        connectionId,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      showToast(t("toast.adLinked"));
      resetVinculoForm();
    } catch (err) {
      console.error(err);
      showToast(t("toast.adLinkError"), "error");
    } finally {
      setFormVinculoSaving(false);
    }
  };

  const resetVinculoForm = () => {
    setFormVinculoAdId("");
    setFormVinculoTitle("");
    setFormVinculoPrice("");
    setFormVinculoQuantity("");
  };

  // Remover Vínculo Individual
  const handleRemoveVinculo = (id: string) => {
    setConfirmDialog({
      title: t("confirm.unlinkTitle"),
      message: t("confirm.unlinkMsg"),
      confirmText: t("confirm.unlinkAction"),
      onConfirm: () => doRemoveVinculo(id),
    });
  };

  const doRemoveVinculo = async (id: string) => {
    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { doc, deleteDoc } = await import("firebase/firestore");

      await deleteDoc(doc(db, "vinculos", id));
      showToast(t("toast.linkRemoved"), "success");
    } catch (err) {
      console.error(err);
      showToast(t("toast.linkRemoveError"), "error");
    }
  };

  // Mapeia quais SKU têm quais plataformas vinculadas
  const vinculosPorSku = useMemo(() => {
    const map: Record<string, { platform: "mercadolivre" | "shopee"; id: string; adId: string }[]> = {};
    vinculos.forEach((v) => {
      if (!map[v.sku]) map[v.sku] = [];
      map[v.sku].push({ platform: v.platform, id: v.id, adId: v.adId });
    });
    return map;
  }, [vinculos]);

  // Filtragem e Busca de Produtos
  const produtosFiltrados = useMemo(() => {
    return produtos.filter((p) => {
      const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchSearch) return false;

      const skusVinculados = vinculosPorSku[p.sku] || [];

      if (activeTab === "todos") return true;
      if (activeTab === "mercadolivre") return skusVinculados.some((v) => v.platform === "mercadolivre");
      if (activeTab === "shopee") return skusVinculados.some((v) => v.platform === "shopee");
      if (activeTab === "local") return skusVinculados.length === 0;
      if (activeTab === "baixo") return p.quantity <= p.minQuantity && p.quantity > 0;

      return true;
    });
  }, [produtos, searchTerm, activeTab, vinculosPorSku]);

  // Cálculos de KPIs
  const kpis = useMemo(() => {
    let totalItens = 0;
    let baixoEstoque = 0;
    let totalAnuncios = vinculos.length;

    produtos.forEach((p) => {
      totalItens += p.quantity;
      if (p.quantity <= p.minQuantity) {
        baixoEstoque++;
      }
    });

    return {
      totalItens,
      baixoEstoque,
      totalAnuncios,
      totalIntegracoes: integracoes.length
    };
  }, [produtos, integracoes, vinculos]);

  // Redirecionamento OAuth das Plataformas
  const handleConnectAccount = async (platform: "mercadolivre" | "shopee") => {
    if (!user) return;

    // Shopee: rota autenticada (POST) — o ownerUid sai do ID token, não da URL.
    if (platform === "shopee") {
      try {
        const res = await authedFetch("/api/auth/shopee/redirect", { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.authUrl) {
          showToast(data.error || t("toast.shopeeConnectFail"), "error");
          return;
        }
        window.location.href = data.authUrl;
      } catch (err) {
        console.error(err);
        showToast(err instanceof Error ? err.message : t("toast.shopeeConnectError"), "error");
      }
      return;
    }

    // TODO: migrar o ML pro mesmo fluxo autenticado (hoje ainda é GET com userId na URL).
    window.location.href = `/api/auth/${platform}/redirect?userId=${ownerUid}`;
  };

  if (blocked) return <AccessDenied category={tNav("items.estoque")} />;

  // Se estiver carregando sessão
  if (authLoading || (user && !blocked && dbLoading)) {
    return <PageLoader />;
  }

  // Se não estiver logado, o useAuth já fará o redirecionamento, mas mostramos uma proteção
  if (!user) return null;

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--db-bg)" }}>
      <Navbar activePath="/estoque" user={user} onLogout={handleLogout} hidePeriod />

      {/* Sistema de Toasts */}
      {toast && (
        <div className="fixed top-4 right-4 z-999999999 px-5 py-3.5 rounded-2xl flex items-center gap-3 shadow-2xl text-sm font-semibold text-white pointer-events-auto animate-fade-in"
          style={{
            background: toast.type === "success" ? "var(--success)" : toast.type === "error" ? "var(--danger)" : "var(--primary)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.2)"
          }}>
          {toast.type === "success" && <CheckCircle size={18} />}
          {toast.type === "error" && <AlertCircle size={18} />}
          {toast.type === "info" && <Loader2 size={18} className="animate-spin" />}
          {toast.msg}
        </div>
      )}

      <ConfirmModal
        open={!!confirmDialog}
        title={confirmDialog?.title ?? ""}
        message={confirmDialog?.message ?? ""}
        confirmText={confirmDialog?.confirmText}
        isDangerous
        loading={confirmLoading}
        onConfirm={runConfirm}
        onCancel={() => setConfirmDialog(null)}
      />

      <main className="px-6 py-8 max-w-7xl mx-auto space-y-8 pb-20">

        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold tracking-tight" style={{ color: "var(--db-text)" }}>
              {t("meta.title")}
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--db-text-3)" }}>
              {t("meta.subtitle")}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setModalIntegracoesOpen(true)}
              className="btn-secondary flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider"
              style={{ cursor: "pointer" }}
            >
              <Settings size={15} /> {t("actions.integrations", { count: kpis.totalIntegracoes })}
            </button>

            <button
              onClick={() => {
                resetProdutoForm();
                setModalProdutoOpen(true);
              }}
              className="btn-primary flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider"
              style={{ cursor: "pointer" }}
            >
              <Plus size={15} /> {t("actions.newProduct")}
            </button>
          </div>
        </div>

        {/* Painel de KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* KPI 1 */}
          <div className="cf-kpi p-5 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>{t("kpi.total")}</h2>
              <p className="font-heading text-2xl font-bold mt-1.5 mono" style={{ color: "var(--cf-text)" }}>
                {kpis.totalItens}
              </p>
              <p className="text-[11px] mt-1" style={{ color: "var(--cf-text-3)" }}>{t("kpi.totalHint")}</p>
            </div>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-blue-500/10 text-primary">
              <Package size={22} />
            </div>
          </div>

          {/* KPI 2 */}
          <div className="cf-kpi p-5 flex items-center justify-between" style={{ borderColor: kpis.baixoEstoque > 0 ? "rgba(239, 68, 68, 0.4)" : "" }}>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>{t("kpi.lowStock")}</h2>
              <p className="font-heading text-2xl font-bold mt-1.5 mono" style={{ color: kpis.baixoEstoque > 0 ? "var(--danger)" : "var(--cf-text)" }}>
                {kpis.baixoEstoque}
              </p>
              <p className="text-[11px] mt-1" style={{ color: "var(--cf-text-3)" }}>{t("kpi.lowStockHint")}</p>
            </div>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${kpis.baixoEstoque > 0 ? "bg-red-500/10 text-danger" : "bg-gray-500/10 text-gray-400"}`}>
              <AlertTriangle size={22} />
            </div>
          </div>

          {/* KPI 3 */}
          <div className="cf-kpi p-5 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>{t("kpi.linkedAds")}</h2>
              <p className="font-heading text-2xl font-bold mt-1.5 mono" style={{ color: "var(--cf-text)" }}>
                {kpis.totalAnuncios}
              </p>
              <p className="text-[11px] mt-1" style={{ color: "var(--cf-text-3)" }}>{t("kpi.linkedAdsHint")}</p>
            </div>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-purple-500/10 text-purple-500">
              <ShoppingBag size={22} />
            </div>
          </div>

          {/* KPI 4 */}
          <div className="cf-kpi p-5 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>{t("kpi.activeChannels")}</h2>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <p className="font-heading text-xl font-bold mono" style={{ color: "var(--cf-text)" }}>
                  {integracoes.length > 0 ? t("kpi.channelsConnected", { count: integracoes.length }) : t("kpi.channelsNone")}
                </p>
              </div>
              <p className="text-[11px] mt-1" style={{ color: "var(--cf-text-3)" }}>{t("kpi.channelsHint")}</p>
            </div>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-emerald-500/10 text-emerald-500">
              <Globe size={22} />
            </div>
          </div>
        </div>

        {/* Painel Shopee: estoque cadastrado + valor líquido a receber */}
        {/* Oculto da interface (ver SHOPEE_UI_VISIVEL no topo do arquivo). */}
        {SHOPEE_UI_VISIVEL && temShopee && (
          <div className="cf-card p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <img src="/Shopee.svg" alt="Shopee" style={{ height: "22px", objectFit: "contain" }} />
                <h2 className="font-heading font-bold text-sm" style={{ color: "var(--cf-text)" }}>
                  {t("shopeePanel.title")}
                </h2>
                {shopeeResumo?.mock && (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--cf-input)", color: "var(--cf-text-3)" }}>
                    {t("shopeePanel.simulated")}
                  </span>
                )}
              </div>
              <button
                onClick={carregarShopeeResumo}
                disabled={shopeeResumoLoading}
                className="p-2 rounded-lg cursor-pointer flex items-center gap-1.5 border-none text-[11px] font-bold"
                style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}
              >
                <RefreshCw size={13} className={shopeeResumoLoading ? "animate-spin" : ""} />
                {t("shopeePanel.refresh")}
              </button>
            </div>

            {!shopeeResumo && shopeeResumoLoading ? (
              <p className="text-xs py-4 text-center" style={{ color: "var(--cf-text-3)" }}>{t("shopeePanel.loading")}</p>
            ) : !shopeeResumo ? (
              <p className="text-xs py-4 text-center" style={{ color: "var(--cf-text-3)" }}>{t("shopeePanel.empty")}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>{t("shopeePanel.itemsRegistered")}</p>
                    <p className="font-heading text-xl font-bold mono mt-1" style={{ color: "var(--cf-text)" }}>{shopeeResumo.estoque.itens}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--cf-text-3)" }}>{t("shopeePanel.skus", { count: shopeeResumo.estoque.skus })}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>{t("shopeePanel.unitsShopee")}</p>
                    <p className="font-heading text-xl font-bold mono mt-1" style={{ color: "var(--cf-text)" }}>{shopeeResumo.estoque.unidades}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>{t("shopeePanel.netReceivable")}</p>
                    <p className="font-heading text-xl font-bold mono mt-1" style={{ color: "var(--success)" }}>
                      {toBRL(shopeeResumo.repasse.pendente, locale)}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--cf-text-3)" }}>{t("shopeePanel.escrowNote")}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>{t("shopeePanel.released60d")}</p>
                    <p className="font-heading text-xl font-bold mono mt-1" style={{ color: "var(--cf-text)" }}>
                      {toBRL(shopeeResumo.repasse.liberado, locale)}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--cf-text-3)" }}>
                      {t("shopeePanel.fees", { value: toBRL(shopeeResumo.repasse.taxas, locale) })}
                    </p>
                  </div>
                </div>
                {shopeeResumo.aviso && (
                  <p className="text-[10px] mt-3 pt-3" style={{ color: "var(--cf-text-3)", borderTop: "1px solid var(--cf-border)" }}>
                    {shopeeResumo.aviso}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Tabela de Produtos, Filtros e Busca */}
        <div className="cf-card overflow-hidden">

          {/* Header da Tabela com Filtros */}
          <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4" style={{ borderBottom: "1px solid var(--cf-border)" }}>

            {/* Abas */}
            <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
              {[
                { id: "todos", label: t("tabs.todos"), icon: null },
                { id: "mercadolivre", label: "", ariaLabel: t("tabs.filterML"), image: "/Logotipo_MercadoLivre.png" },
                { id: "shopee", label: "", ariaLabel: t("tabs.filterShopee"), image: "/Shopee.svg" },
                { id: "local", label: t("tabs.local"), icon: null },
                { id: "baixo", label: t("tabs.lowStock"), icon: AlertTriangle }
              ]
                // Shopee oculta da interface (ver SHOPEE_UI_VISIVEL no topo do arquivo).
                .filter((tab) => SHOPEE_UI_VISIVEL || tab.id !== "shopee")
                .map((tab) => {
                const IconComponent = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    aria-label={tab.label ? undefined : tab.ariaLabel}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold border-none transition-all cursor-pointer whitespace-nowrap flex items-center gap-2"
                    style={activeTab === tab.id
                      ? { background: "var(--primary)", color: "white" }
                      : { background: "var(--cf-input)", color: "var(--cf-text-2)" }
                    }
                  >
                    {tab.image && <img src={tab.image} alt="" style={{ height: "16px", objectFit: "contain" }} />}
                    {IconComponent && <IconComponent size={14} />}
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Busca + Sync manual */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--cf-text-3)" }} />
                <input
                  type="text"
                  placeholder={t("search.placeholder")}
                  aria-label={t("search.aria")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs outline-none"
                  style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }}
                />
              </div>

              {temMercadoLivre && (
                <button
                  onClick={() => handleSincronizarManual("mercadolivre", "pull")}
                  disabled={syncing}
                  title={t("sync.pullMLTitle")}
                  className="px-3 py-2.5 rounded-xl cursor-pointer flex items-center gap-1.5 border-none text-[11px] font-bold whitespace-nowrap disabled:opacity-50"
                  style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}
                >
                  <Download size={14} className={syncing ? "animate-pulse" : ""} />
                  {t("sync.pullML")}
                </button>
              )}

              <button
                onClick={() => handleSincronizarManual()}
                disabled={syncing}
                title={t("sync.syncTitle")}
                aria-label={t("sync.syncAria")}
                className="p-2.5 rounded-xl cursor-pointer flex items-center justify-center border-none disabled:opacity-50"
                style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}
              >
                <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
              </button>
            </div>

          </div>

          {/* Identidade da conta do canal filtrado */}
          {(activeTab === "mercadolivre" || activeTab === "shopee") && (() => {
            const contas = integracoes.filter((i) => i.platform === activeTab);
            if (contas.length === 0) return null;
            const n = vinculos.filter((v) => v.platform === activeTab).length;
            return (
              <div
                className="px-5 py-2 text-[11px]"
                style={{ borderBottom: "1px solid var(--cf-border)", color: "var(--cf-text-3)" }}
              >
                {t("channelAccount.label")}{" "}
                <span style={{ color: "var(--cf-text-2)", fontWeight: 700 }}>
                  {contas.map((c) => c.accountName).join(" · ")}
                </span>{" "}
                · {t("channelAccount.adsLinked", { count: n })}
              </div>
            );
          })()}

          {/* Tabela */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr style={{ background: "var(--cf-txhdr)", borderBottom: "1px solid var(--cf-border)" }}>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>{t("table.colSku")}</th>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>{t("table.colProduct")}</th>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>{t("table.colBasePrice")}</th>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>{t("table.colQty")}</th>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>{t("table.colChannels")}</th>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider text-right" style={{ color: "var(--cf-text-2)" }}>{t("table.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {produtosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-sm" style={{ color: "var(--cf-text-3)" }}>
                      {t("table.empty")}
                    </td>
                  </tr>
                ) : (
                  produtosFiltrados.map((p) => {
                    const skusVinculados = vinculosPorSku[p.sku] || [];
                    const isEstoqueBaixo = p.quantity <= p.minQuantity;

                    return (
                      <tr key={p.id} className="cf-tx" style={{ borderBottom: "1px solid var(--cf-border)" }}>
                        {/* SKU */}
                        <td className="px-5 py-4 text-xs font-bold mono" style={{ color: "var(--cf-text)" }}>
                          {p.sku}
                        </td>

                        {/* Nome */}
                        <td className="px-5 py-4">
                          <div className="text-sm font-semibold" style={{ color: "var(--cf-text)" }}>{p.name}</div>
                          <div className="text-[10px]" style={{ color: "var(--cf-text-3)" }}>
                            {t("table.lastUpdate", {
                              date: new Date(p.updatedAt).toLocaleDateString(locale),
                              time: new Date(p.updatedAt).toLocaleTimeString(locale),
                            })}
                          </div>
                        </td>

                        {/* Preço */}
                        <td className="px-5 py-4 text-xs font-bold mono" style={{ color: "var(--cf-text)" }}>
                          {toBRL(p.price, locale)}
                        </td>

                        {/* Quantidade */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold mono" style={{ color: isEstoqueBaixo ? "var(--danger)" : "var(--cf-text)" }}>
                              {t("table.unitsShort", { count: p.quantity })}
                            </span>
                            {isEstoqueBaixo && (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase" style={{ background: "rgba(239, 68, 68, 0.1)", color: "var(--danger)" }}>
                                {t("table.lowBadge")}
                              </span>
                            )}
                          </div>

                          {/* Barra de progresso de estoque (máx simulado de 100 para a barra) */}
                          <div className="cf-progress w-24">
                            <div
                              className="cf-progress-fill"
                              style={{
                                width: `${Math.min(100, (p.quantity / 100) * 100)}%`,
                                background: isEstoqueBaixo ? "var(--danger)" : "var(--success)"
                              }}
                            />
                          </div>
                        </td>

                        {/* Canais Vinculados */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {skusVinculados.length === 0 ? (
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--cf-input)", color: "var(--cf-text-2)", border: "1px solid var(--cf-border)" }}>
                                {t("table.localOnly")}
                              </span>
                            ) : (
                              skusVinculados.map((v) => {
                                if (v.platform === "mercadolivre") {
                                  return (
                                    <span key={v.id} className="text-[9px] font-extrabold px-2 py-0.5 rounded-full" style={{ background: "var(--brand-ml-bg)", color: "var(--brand-ml-fg)", border: "1px solid var(--brand-ml-solid)" }}>
                                      ML · {v.adId}
                                    </span>
                                  );
                                } else {
                                  return (
                                    <span key={v.id} className="text-[9px] font-extrabold px-2 py-0.5 rounded-full text-white" style={{ background: "var(--brand-shopee-bg)", border: "1px solid var(--brand-shopee-bg)" }}>
                                      Shopee · {v.adId}
                                    </span>
                                  );
                                }
                              })
                            )}
                          </div>
                        </td>

                        {/* Ações */}
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setSelectedProdutoSku(p.sku);
                                setModalVinculosOpen(true);
                              }}
                              title={t("table.manageLinks")}
                              aria-label={t("table.manageLinksAria", { name: p.name })}
                              className="p-1.5 rounded-lg border-none cursor-pointer"
                              style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}
                            >
                              <LinkIcon size={13} />
                            </button>

                            <button
                              onClick={() => {
                                setEditingProduto(p);
                                setFormSku(p.sku);
                                setFormName(p.name);
                                setFormPrice(p.price.toString().replace(".", ","));
                                setFormQuantity(p.quantity.toString());
                                setFormMinQuantity(p.minQuantity.toString());
                                setModalProdutoOpen(true);
                              }}
                              title={t("table.editProduct")}
                              aria-label={t("table.editAria", { name: p.name })}
                              className="p-1.5 rounded-lg border-none cursor-pointer"
                              style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}
                            >
                              <Edit3 size={13} />
                            </button>

                            <button
                              onClick={() => handleDeleteProduto(p.id, p.sku)}
                              title={t("table.deleteProduct")}
                              aria-label={t("table.deleteAria", { name: p.name })}
                              className="p-1.5 rounded-lg border-none cursor-pointer"
                              style={{ background: "var(--neg-weak)", color: "var(--neg)" }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>

                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

        </div>

      </main>

      {/* ── MODAL 1: PRODUTO (NOVO OU EDITAR) ── */}
      {modalProdutoOpen && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "var(--db-overlay)", backdropFilter: "blur(5px)", zIndex: 9999 }}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-fade-in" style={{ background: "var(--cf-card)" }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--cf-border)" }}>
              <h3 className="font-heading font-bold text-base" style={{ color: "var(--cf-text)" }}>
                {editingProduto ? t("productModal.editTitle") : t("productModal.newTitle")}
              </h3>
              <button
                onClick={() => setModalProdutoOpen(false)}
                aria-label={tc("close")}
                className="p-1.5 rounded-lg cursor-pointer border-none"
                style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleSaveProduto} className="p-5 space-y-4">
              <div className="space-y-1">
                <label htmlFor={formSkuId} className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>{t("productModal.sku")}</label>
                <input
                  id={formSkuId}
                  type="text"
                  value={formSku}
                  onChange={(e) => setFormSku(e.target.value)}
                  disabled={!!editingProduto}
                  placeholder={t("productModal.skuPlaceholder")}
                  required
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none mono"
                  style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor={formNameId} className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>{t("productModal.name")}</label>
                <input
                  id={formNameId}
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t("productModal.namePlaceholder")}
                  required
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor={formPriceId} className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>{t("productModal.basePrice")}</label>
                  <input
                    id={formPriceId}
                    type="text"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    placeholder="0,00"
                    required
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none mono"
                    style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }}
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor={formQuantityId} className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>{t("productModal.quantity")}</label>
                  <input
                    id={formQuantityId}
                    type="number"
                    value={formQuantity}
                    onChange={(e) => setFormQuantity(e.target.value)}
                    placeholder="0"
                    required
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none mono"
                    style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor={formMinQuantityId} className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>{t("productModal.minQuantity")}</label>
                <input
                  id={formMinQuantityId}
                  type="number"
                  value={formMinQuantity}
                  onChange={(e) => setFormMinQuantity(e.target.value)}
                  placeholder="10"
                  required
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none mono"
                  style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }}
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalProdutoOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold border-none cursor-pointer"
                  style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}
                >
                  {t("productModal.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="btn-primary px-4 py-2.5 rounded-xl text-xs font-bold border-none cursor-pointer flex items-center gap-1.5"
                >
                  {formSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  {t("productModal.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 2: GERENCIAR INTEGRAÇÕES ── */}
      {modalIntegracoesOpen && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "var(--db-overlay)", backdropFilter: "blur(5px)", zIndex: 99900 }}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl animate-fade-in" style={{ background: "var(--cf-card)" }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--cf-border)" }}>
              <h3 className="font-heading font-bold text-base" style={{ color: "var(--cf-text)" }}>
                {t("integrationsModal.title")}
              </h3>
              <button
                onClick={() => setModalIntegracoesOpen(false)}
                aria-label={tc("close")}
                className="p-1.5 rounded-lg cursor-pointer border-none"
                style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}
              >
                <X size={15} />
              </button>
            </div>

            <div className="p-5 space-y-6">

              {/* Canais Disponíveis */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>{t("integrationsModal.available")}</h4>

                {/* Canal 1: Mercado Livre */}
                <div className="flex items-center justify-between p-4 rounded-xl" style={{ border: "1px solid var(--cf-border)", background: "var(--cf-card-2)" }}>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-center gap-2">
                      <img src="/Logotipo_MercadoLivre.png" alt="Mercado Livre" style={{ height: "40px", objectFit: "contain" }} />
                      <div className="text-center">
                        <div className="text-[10px]" style={{ color: "var(--cf-text-3)" }}>{t("integrationsModal.mlDesc")}</div>
                      </div>
                    </div>
                  </div>

                  {resumoContas("mercadolivre") ? (
                    <span className="text-xs font-bold text-emerald-500 flex items-center gap-1.5 text-right">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0"></span>
                      {resumoContas("mercadolivre")}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleConnectAccount("mercadolivre")}
                      className="px-3.5 py-2 rounded-lg text-xs font-bold border-none cursor-pointer"
                      style={{ background: "var(--primary)", color: "white" }}
                    >
                      {t("integrationsModal.connectAccount")}
                    </button>
                  )}
                </div>

                {/* Canal 2: Shopee — oculto da interface (ver SHOPEE_UI_VISIVEL no topo do arquivo). */}
                {SHOPEE_UI_VISIVEL && (
                <div className="flex items-center justify-between p-4 rounded-xl" style={{ border: "1px solid var(--cf-border)", background: "var(--cf-card-2)" }}>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-center gap-2">
                      <img src="/Shopee.svg" alt="Shopee" style={{ height: "40px", objectFit: "contain" }} />
                      <div className="text-center">
                        <div className="text-[10px]" style={{ color: "var(--cf-text-3)" }}>{t("integrationsModal.shopeeDesc")}</div>
                      </div>
                    </div>
                  </div>

                  {resumoContas("shopee") ? (
                    <span className="text-xs font-bold text-emerald-500 flex items-center gap-1.5 text-right">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0"></span>
                      {resumoContas("shopee")}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleConnectAccount("shopee")}
                      className="px-3.5 py-2 rounded-lg text-xs font-bold border-none cursor-pointer"
                      style={{ background: "var(--primary)", color: "white" }}
                    >
                      {t("integrationsModal.connectAccount")}
                    </button>
                  )}
                </div>
                )}

              </div>

              {/* Contas Conectadas */}
              <div className="space-y-3 pt-2" style={{ borderTop: "1px solid var(--cf-border)" }}>
                <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>{t("integrationsModal.yourAccounts", { count: integracoes.length })}</h4>

                {integracoes.length === 0 ? (
                  <div className="text-center py-4 text-xs" style={{ color: "var(--cf-text-3)" }}>
                    {t("integrationsModal.noneConnected")}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {integracoes.map((item) => (
                      <div key={item.id} className="p-3 rounded-lg text-xs" style={{ background: "var(--cf-input)" }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <img
                              src={item.platform === "mercadolivre" ? "/Logotipo_MercadoLivre.png" : "/Shopee.svg"}
                              alt={item.platform}
                              style={{ height: "20px", objectFit: "contain" }}
                            />
                            <span className="font-semibold truncate" style={{ color: "var(--cf-text)" }}>{item.accountName}</span>
                            <span className="text-[10px] shrink-0" style={{ color: "var(--cf-text-3)" }}>({item.accountId})</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleConnectAccount(item.platform)}
                              className="p-1 px-2 rounded hover:bg-black/5 cursor-pointer border-none font-bold"
                              style={{ background: "transparent", color: "var(--cf-text-2)" }}
                              title={t("integrationsModal.reconnectTitle")}
                            >
                              <RefreshCw size={12} className="inline mr-1" /> {t("integrationsModal.reconnect")}
                            </button>
                            <button
                              onClick={() => handleDisconnect(item.id, item.platform)}
                              className="p-1 px-2 rounded hover:bg-red-500/10 cursor-pointer border-none text-red-500 font-bold"
                              style={{ background: "transparent" }}
                            >
                              <LogOut size={12} className="inline mr-1" /> {t("integrationsModal.disconnect")}
                            </button>
                          </div>
                        </div>
                        <div className="mt-1.5 pl-7 text-[10px] leading-relaxed" style={{ color: "var(--cf-text-3)" }}>
                          {statusToken(item)}
                          {item.createdAt ? t("integrationsModal.connectedOn", { date: new Date(item.createdAt).toLocaleDateString(locale) }) : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 3: GERENCIAR VÍNCULOS DE PRODUTOS ── */}
      {modalVinculosOpen && selectedProdutoSku && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "var(--db-overlay)", backdropFilter: "blur(5px)", zIndex: 9999 }}>
          <div className="w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl animate-fade-in animate-duration-300" style={{ background: "var(--cf-card)" }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--cf-border)" }}>
              <div>
                <h3 className="font-heading font-bold text-base" style={{ color: "var(--cf-text)" }}>
                  {t("linksModal.title")} <span className="mono text-primary font-bold">{selectedProdutoSku}</span>
                </h3>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--cf-text-3)" }}>
                  {t("linksModal.subtitle")}
                </p>
              </div>
              <button
                onClick={() => setModalVinculosOpen(false)}
                aria-label={tc("close")}
                className="p-1.5 rounded-lg cursor-pointer border-none"
                style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}
              >
                <X size={15} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2">

              {/* Lado Esquerdo: Lista de Anúncios Vinculados */}
              <div className="p-5 space-y-4" style={{ borderRight: "1px solid var(--cf-border)" }}>
                <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>{t("linksModal.linkedAds")}</h4>

                {vinculos.filter((v) => v.sku === selectedProdutoSku).length === 0 ? (
                  <div className="h-60 flex flex-col justify-center items-center text-center p-4" style={{ color: "var(--cf-text-3)" }}>
                    <LinkIcon size={24} className="mb-2 opacity-50" />
                    <p className="text-xs font-semibold">{t("linksModal.noneLinked")}</p>
                    <p className="text-[10px] mt-1 max-w-[180px]">{t("linksModal.noneLinkedHint")}</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {vinculos.filter((v) => v.sku === selectedProdutoSku).map((vin) => (
                      <div key={vin.id} className="p-3 rounded-xl space-y-2 text-xs" style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)" }}>
                        <div className="flex items-center justify-between">
                          <span
                            className="font-extrabold px-2 py-0.5 rounded text-[8px]"
                            style={{
                              background: vin.platform === "mercadolivre" ? "var(--brand-ml-bg)" : "var(--brand-shopee-bg)",
                              color: vin.platform === "mercadolivre" ? "var(--brand-ml-fg)" : "var(--brand-shopee-fg)"
                            }}
                          >
                            {vin.platform === "mercadolivre" ? "MERCADO LIVRE" : "SHOPEE"}
                          </span>
                          <button
                            onClick={() => handleRemoveVinculo(vin.id)}
                            aria-label={t("linksModal.removeLinkAria", { platform: platformLabel(vin.platform) })}
                            className="p-1 rounded cursor-pointer border-none text-red-500 hover:bg-red-500/10"
                            style={{ background: "transparent" }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <div className="font-semibold font-heading" style={{ color: "var(--cf-text)" }}>{vin.title}</div>
                        <div className="flex items-center justify-between font-mono text-[10px]" style={{ color: "var(--cf-text-3)" }}>
                          <span>{t("linksModal.idLabel", { id: vin.adId })}</span>
                          <span className="font-bold text-right" style={{ color: "var(--cf-text)" }}>
                            {toBRL(vin.price, locale)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Lado Direito: Formulário Vincular Novo Anúncio */}
              <div className="p-5 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>{t("linksModal.newLink")}</h4>

                <form onSubmit={handleAddVinculo} className="space-y-3.5">
                  <div className="space-y-1">
                    <label htmlFor={vinculoPlatformId} className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>{t("linksModal.platform")}</label>
                    <select
                      id={vinculoPlatformId}
                      value={formVinculoPlatform}
                      onChange={(e) => setFormVinculoPlatform(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl text-xs outline-none cursor-pointer"
                      style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }}
                    >
                      <option value="mercadolivre">Mercado Livre</option>
                      {/* Shopee oculta da interface (ver SHOPEE_UI_VISIVEL no topo do arquivo). */}
                      {SHOPEE_UI_VISIVEL && <option value="shopee">Shopee</option>}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor={vinculoAdIdId} className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>{t("linksModal.adId")}</label>
                    <input
                      id={vinculoAdIdId}
                      type="text"
                      value={formVinculoAdId}
                      onChange={(e) => setFormVinculoAdId(e.target.value)}
                      placeholder={t("linksModal.adIdPlaceholder")}
                      required
                      className="w-full px-3 py-2 rounded-xl text-xs outline-none mono"
                      style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }}
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor={vinculoTitleId} className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>{t("linksModal.adTitle")}</label>
                    <input
                      id={vinculoTitleId}
                      type="text"
                      value={formVinculoTitle}
                      onChange={(e) => setFormVinculoTitle(e.target.value)}
                      placeholder={t("linksModal.adTitlePlaceholder")}
                      required
                      className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                      style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor={vinculoPriceId} className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>{t("linksModal.channelPrice")}</label>
                      <input
                        id={vinculoPriceId}
                        type="text"
                        value={formVinculoPrice}
                        onChange={(e) => setFormVinculoPrice(e.target.value)}
                        placeholder="0,00"
                        required
                        className="w-full px-3 py-2 rounded-xl text-xs outline-none mono"
                        style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }}
                      />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor={vinculoQuantityId} className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>{t("linksModal.currentStock")}</label>
                      <input
                        id={vinculoQuantityId}
                        type="number"
                        value={formVinculoQuantity}
                        onChange={(e) => setFormVinculoQuantity(e.target.value)}
                        placeholder="0"
                        required
                        className="w-full px-3 py-2 rounded-xl text-xs outline-none mono"
                        style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={formVinculoSaving}
                    className="w-full btn-primary py-2.5 rounded-xl text-xs font-bold border-none cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {formVinculoSaving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                    {t("linksModal.linkAd")}
                  </button>
                </form>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
