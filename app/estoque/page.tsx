"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../hooks/useAuth";
import Navbar from "../components/Navbar";
import {
  Plus, Search, Edit3, Trash2, Link as LinkIcon, RefreshCw, AlertTriangle,
  Settings, LogOut, Check, Globe, HelpCircle, AlertCircle, ShoppingBag,
  Zap, Loader2, ArrowRight, Package, X, CheckCircle
} from "lucide-react";

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

export default function EstoquePage() {
  const { user, loading: authLoading } = useAuth();

  // Estados do Banco de Dados
  const [produtos, setProdutos] = useState<ProdutoEstoque[]>([]);
  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [dbLoading, setDbLoading] = useState(true);

  // Estados de UI/Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"todos" | "mercadolivre" | "shopee" | "local" | "baixo">("todos");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Estados de Modais
  const [modalProdutoOpen, setModalProdutoOpen] = useState(false);
  const [editingProduto, setEditingProduto] = useState<ProdutoEstoque | null>(null);
  const [modalIntegracoesOpen, setModalIntegracoesOpen] = useState(false);
  const [modalVinculosOpen, setModalVinculosOpen] = useState(false);
  const [selectedProdutoSku, setSelectedProdutoSku] = useState<string | null>(null);
  const [modalSimuladorOpen, setModalSimuladorOpen] = useState(false);

  // Formulário Produto
  const [formSku, setFormSku] = useState("");
  const [formName, setFormName] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formQuantity, setFormQuantity] = useState("");
  const [formMinQuantity, setFormMinQuantity] = useState("10");
  const [formSaving, setFormSaving] = useState(false);

  // Formulário Vínculo Manual
  const [formVinculoPlatform, setFormVinculoPlatform] = useState<"mercadolivre" | "shopee">("mercadolivre");
  const [formVinculoAdId, setFormVinculoAdId] = useState("");
  const [formVinculoTitle, setFormVinculoTitle] = useState("");
  const [formVinculoPrice, setFormVinculoPrice] = useState("");
  const [formVinculoQuantity, setFormVinculoQuantity] = useState("");
  const [formVinculoSaving, setFormVinculoSaving] = useState(false);

  // Formulário Simulador Vendas
  const [simSelectedVinculoId, setSimSelectedVinculoId] = useState("");
  const [simQuantity, setSimQuantity] = useState("1");
  const [simRunning, setSimRunning] = useState(false);

  // Sistema de Toast
  const showToast = (msg: string, type: "success" | "error" | "info" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Carregar dados em tempo real do Firestore
  useEffect(() => {
    if (!user) return;

    let unsubEstoque: () => void;
    let unsubIntegracoes: () => void;
    let unsubVinculos: () => void;

    (async () => {
      try {
        const { getFirebase } = await import("@/lib/firebase");
        const { db } = await getFirebase();
        const { collection, onSnapshot, query, where } = await import("firebase/firestore");

        // 1. Ouvir estoque central
        const qEstoque = query(collection(db, "estoque"), where("userId", "==", user.uid));
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
        const qIntegracoes = query(collection(db, "integracoes"), where("userId", "==", user.uid));
        unsubIntegracoes = onSnapshot(qIntegracoes, (snap) => {
          const list: Integracao[] = [];
          snap.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() } as Integracao);
          });
          setIntegracoes(list);
        });

        // 3. Ouvir vínculos de anúncios
        const qVinculos = query(collection(db, "vinculos"), where("userId", "==", user.uid));
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
  }, [user]);

  // Capturar retornos de OAuth (parâmetros da URL)
  useEffect(() => {
    const url = new URL(window.location.href);
    const integration = url.searchParams.get("integration");
    const message = url.searchParams.get("message");

    if (integration === "ml_success") {
      showToast("Conta do Mercado Livre integrada e anúncios importados!", "success");
      cleanUrlParams();
    } else if (integration === "shopee_success") {
      showToast("Conta da Shopee integrada e anúncios importados!", "success");
      cleanUrlParams();
    } else if (integration === "ml_error" || integration === "shopee_error") {
      showToast(`Erro na integração: ${message || "Verifique suas credenciais"}`, "error");
      cleanUrlParams();
    }
  }, []);

  const cleanUrlParams = () => {
    const newUrl = window.location.pathname;
    window.history.replaceState({}, document.title, newUrl);
  };

  // Controlar classe modal-open no body para efeito de desfoque (blur) na navbar
  useEffect(() => {
    const anyModalOpen = modalProdutoOpen || modalIntegracoesOpen || modalVinculosOpen || modalSimuladorOpen;
    if (anyModalOpen) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [modalProdutoOpen, modalIntegracoesOpen, modalVinculosOpen, modalSimuladorOpen]);

  // Sincronizar Estoque Manualmente
  const handleSincronizarManual = async (platformFilter?: "mercadolivre" | "shopee") => {
    if (!user || syncing) return;
    setSyncing(true);
    showToast("Sincronizando estoque com as plataformas...", "info");

    try {
      const res = await fetch("/api/estoque/sincronizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.uid, platform: platformFilter }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || "Sincronização completa!", "success");
      } else {
        showToast(data.error || "Falha na sincronização", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Erro ao conectar ao servidor de sincronização", "error");
    } finally {
      setSyncing(false);
    }
  };

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
        const snapVinculos = await getDocs(query(collection(db, "vinculos"), where("userId", "==", user.uid), where("sku", "==", editingProduto.sku)));
        for (const d of snapVinculos.docs) {
          await updateDoc(doc(db, "vinculos", d.id), {
            quantity: parsedQuantity,
            updatedAt: Date.now()
          });
        }

        showToast("Produto atualizado com sucesso!");
      } else {
        // Criando novo produto
        // Verificar SKU duplicado
        const qSku = query(collection(db, "estoque"), where("userId", "==", user.uid), where("sku", "==", formSku.trim().toUpperCase()));
        const snapSku = await getDocs(qSku);
        if (!snapSku.empty) {
          showToast("Este SKU já está sendo utilizado em outro produto!", "error");
          setFormSaving(false);
          return;
        }

        await addDoc(collection(db, "estoque"), {
          ...produtoData,
          userId: user.uid,
          createdAt: Date.now(),
        });
        showToast("Produto cadastrado com sucesso!");
      }

      setModalProdutoOpen(false);
      resetProdutoForm();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Erro ao salvar produto", "error");
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
  const handleDeleteProduto = async (id: string, sku: string) => {
    if (!confirm(`Deseja realmente remover o produto ${sku} e todos os seus vínculos com anúncios?`)) return;

    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { doc, deleteDoc, collection, query, where, getDocs } = await import("firebase/firestore");

      // Remover produto
      await deleteDoc(doc(db, "estoque", id));

      // Remover vínculos desse SKU
      const qVinculos = query(collection(db, "vinculos"), where("userId", "==", user!.uid), where("sku", "==", sku));
      const snapVinculos = await getDocs(qVinculos);
      for (const d of snapVinculos.docs) {
        await deleteDoc(doc(db, "vinculos", d.id));
      }

      showToast("Produto e seus vínculos removidos com sucesso!", "success");
    } catch (err) {
      console.error(err);
      showToast("Erro ao remover produto", "error");
    }
  };

  // Desconectar Integração
  const handleDisconnect = async (id: string, platform: string) => {
    if (!confirm(`Deseja desconectar a conta integrada da plataforma ${platform}? Seus anúncios vinculados não serão mais sincronizados.`)) return;

    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { doc, deleteDoc, collection, query, where, getDocs } = await import("firebase/firestore");

      // Remover integração
      await deleteDoc(doc(db, "integracoes", id));

      // Remover vínculos associados a essa integração
      const qVinculos = query(collection(db, "vinculos"), where("userId", "==", user!.uid), where("connectionId", "==", id));
      const snapVinculos = await getDocs(qVinculos);
      for (const d of snapVinculos.docs) {
        await deleteDoc(doc(db, "vinculos", d.id));
      }

      showToast("Integração e vínculos removidos.", "success");
    } catch (err) {
      console.error(err);
      showToast("Erro ao desconectar conta", "error");
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
        where("userId", "==", user.uid),
        where("platform", "==", formVinculoPlatform),
        where("adId", "==", formVinculoAdId.trim())
      );
      const snapExistente = await getDocs(qExistente);
      if (!snapExistente.empty) {
        showToast("Este anúncio já está vinculado a um SKU do seu estoque!", "error");
        setFormVinculoSaving(false);
        return;
      }

      // Achar a conexão ID correspondente à plataforma
      const qConexao = query(collection(db, "integracoes"), where("userId", "==", user.uid), where("platform", "==", formVinculoPlatform));
      const snapConexao = await getDocs(qConexao);

      const connectionId = !snapConexao.empty ? snapConexao.docs[0].id : "mock_manual_connection";

      await addDoc(collection(db, "vinculos"), {
        userId: user.uid,
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

      showToast("Anúncio vinculado com sucesso!");
      resetVinculoForm();
    } catch (err) {
      console.error(err);
      showToast("Erro ao adicionar vínculo", "error");
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
  const handleRemoveVinculo = async (id: string) => {
    if (!confirm("Deseja realmente desvincular este anúncio do produto central?")) return;

    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { doc, deleteDoc } = await import("firebase/firestore");

      await deleteDoc(doc(db, "vinculos", id));
      showToast("Vínculo removido.", "success");
    } catch (err) {
      console.error(err);
      showToast("Erro ao remover vínculo", "error");
    }
  };

  // Simular Venda via Webhook
  const handleSimularVenda = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !simSelectedVinculoId || !simQuantity) return;

    setSimRunning(true);
    showToast("Disparando webhook de venda...", "info");

    try {
      // Buscar dados do vínculo selecionado
      const vinculo = vinculos.find((v) => v.id === simSelectedVinculoId);
      if (!vinculo) throw new Error("Vínculo não encontrado");

      const webhookUrl = vinculo.platform === "mercadolivre"
        ? "/api/webhooks/mercadolivre"
        : "/api/webhooks/shopee";

      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mock: true,
          adId: vinculo.adId,
          quantitySold: parseInt(simQuantity),
          userId: user.uid
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || "Venda simulada com sucesso! O estoque foi sincronizado.", "success");
        setModalSimuladorOpen(false);
      } else {
        showToast(data.error || "Erro no processamento da simulação", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Falha ao disparar simulador de venda", "error");
    } finally {
      setSimRunning(false);
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
  const handleConnectAccount = (platform: "mercadolivre" | "shopee") => {
    if (!user) return;
    const url = `/api/auth/${platform}/redirect?userId=${user.uid}`;
    window.location.href = url;
  };

  // Se estiver carregando sessão
  if (authLoading || (user && dbLoading)) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center" style={{ background: "var(--db-bg)" }}>
        <Loader2 className="animate-spin text-primary mb-4" size={40} />
        <p className="text-sm font-semibold" style={{ color: "var(--db-text-2)" }}>Carregando seu painel de estoque...</p>
      </div>
    );
  }

  // Se não estiver logado, o useAuth já fará o redirecionamento, mas mostramos uma proteção
  if (!user) return null;

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--db-bg)" }}>
      <Navbar activePath="/estoque" user={user} />

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

      <main className="px-6 py-8 max-w-7xl mx-auto space-y-8 pb-20">

        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold tracking-tight" style={{ color: "var(--db-text)" }}>
              Estoque Centralizado
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--db-text-3)" }}>
              Gerencie seu saldo de forma centralizada e integre com Mercado Livre e Shopee.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setModalSimuladorOpen(true)}
              className="btn-success flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider"
              style={{ background: "linear-gradient(135deg, #10b981, #059669)", cursor: "pointer" }}
            >
              <Zap size={15} /> Simular Venda (Teste)
            </button>

            <button
              onClick={() => setModalIntegracoesOpen(true)}
              className="btn-secondary flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider"
              style={{ cursor: "pointer" }}
            >
              <Settings size={15} /> Integrações ({kpis.totalIntegracoes})
            </button>

            <button
              onClick={() => {
                resetProdutoForm();
                setModalProdutoOpen(true);
              }}
              className="btn-primary flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider"
              style={{ cursor: "pointer" }}
            >
              <Plus size={15} /> Novo Produto
            </button>
          </div>
        </div>

        {/* Painel de KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* KPI 1 */}
          <div className="cf-kpi p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>Total em Estoque</p>
              <h3 className="font-heading text-2xl font-bold mt-1.5 mono" style={{ color: "var(--cf-text)" }}>
                {kpis.totalItens}
              </h3>
              <p className="text-[11px] mt-1" style={{ color: "var(--cf-text-3)" }}>Unidades físicas</p>
            </div>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-blue-500/10 text-primary">
              <Package size={22} />
            </div>
          </div>

          {/* KPI 2 */}
          <div className="cf-kpi p-5 flex items-center justify-between" style={{ borderColor: kpis.baixoEstoque > 0 ? "rgba(239, 68, 68, 0.4)" : "" }}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>Estoque Baixo</p>
              <h3 className="font-heading text-2xl font-bold mt-1.5 mono" style={{ color: kpis.baixoEstoque > 0 ? "var(--danger)" : "var(--cf-text)" }}>
                {kpis.baixoEstoque}
              </h3>
              <p className="text-[11px] mt-1" style={{ color: "var(--cf-text-3)" }}>Produtos precisando reposição</p>
            </div>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${kpis.baixoEstoque > 0 ? "bg-red-500/10 text-danger" : "bg-gray-500/10 text-gray-400"}`}>
              <AlertTriangle size={22} />
            </div>
          </div>

          {/* KPI 3 */}
          <div className="cf-kpi p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>Anúncios Vinculados</p>
              <h3 className="font-heading text-2xl font-bold mt-1.5 mono" style={{ color: "var(--cf-text)" }}>
                {kpis.totalAnuncios}
              </h3>
              <p className="text-[11px] mt-1" style={{ color: "var(--cf-text-3)" }}>Nas plataformas ativas</p>
            </div>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-purple-500/10 text-purple-500">
              <ShoppingBag size={22} />
            </div>
          </div>

          {/* KPI 4 */}
          <div className="cf-kpi p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>Canais Ativos</p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <h3 className="font-heading text-xl font-bold mono" style={{ color: "var(--cf-text)" }}>
                  {integracoes.length > 0 ? `${integracoes.length} Conectados` : "Nenhum"}
                </h3>
              </div>
              <p className="text-[11px] mt-1" style={{ color: "var(--cf-text-3)" }}>Mercado Livre & Shopee</p>
            </div>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-emerald-500/10 text-emerald-500">
              <Globe size={22} />
            </div>
          </div>
        </div>

        {/* Tabela de Produtos, Filtros e Busca */}
        <div className="cf-card overflow-hidden">

          {/* Header da Tabela com Filtros */}
          <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4" style={{ borderBottom: "1px solid var(--cf-border)" }}>

            {/* Abas */}
            <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
              {[
                { id: "todos", label: "Todos", icon: null },
                { id: "mercadolivre", label: "", image: "/Logotipo_MercadoLivre.png" },
                { id: "shopee", label: "", image: "/Shopee.svg" },
                { id: "local", label: "Apenas Local", icon: null },
                { id: "baixo", label: "Estoque Baixo", icon: AlertTriangle }
              ].map((tab) => {
                const IconComponent = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold border-none transition-all cursor-pointer whitespace-nowrap flex items-center gap-2"
                    style={activeTab === tab.id
                      ? { background: "var(--primary)", color: "white" }
                      : { background: "var(--cf-input)", color: "var(--cf-text-2)" }
                    }
                  >
                    {tab.image && <img src={tab.image} alt={tab.label} style={{ height: "16px", objectFit: "contain" }} />}
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
                  placeholder="Buscar por SKU ou Nome..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs outline-none"
                  style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }}
                />
              </div>

              <button
                onClick={() => handleSincronizarManual()}
                disabled={syncing}
                title="Sincronizar estoque agora"
                className="p-2.5 rounded-xl cursor-pointer flex items-center justify-center border-none"
                style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}
              >
                <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
              </button>
            </div>

          </div>

          {/* Tabela */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr style={{ background: "var(--cf-txhdr)", borderBottom: "1px solid var(--cf-border)" }}>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>Código/SKU</th>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>Produto</th>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>Preço Base</th>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>Quantidade</th>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>Canais Ativos</th>
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wider text-right" style={{ color: "var(--cf-text-2)" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {produtosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-sm" style={{ color: "var(--cf-text-3)" }}>
                      Nenhum produto cadastrado ou correspondente ao filtro.
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
                            Última atualização: {new Date(p.updatedAt).toLocaleDateString("pt-BR")} às {new Date(p.updatedAt).toLocaleTimeString("pt-BR")}
                          </div>
                        </td>

                        {/* Preço */}
                        <td className="px-5 py-4 text-xs font-bold mono" style={{ color: "var(--cf-text)" }}>
                          {p.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </td>

                        {/* Quantidade */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold mono" style={{ color: isEstoqueBaixo ? "var(--danger)" : "var(--cf-text)" }}>
                              {p.quantity} un
                            </span>
                            {isEstoqueBaixo && (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase" style={{ background: "rgba(239, 68, 68, 0.1)", color: "var(--danger)" }}>
                                Baixo
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
                                Apenas Local
                              </span>
                            ) : (
                              skusVinculados.map((v) => {
                                if (v.platform === "mercadolivre") {
                                  return (
                                    <span key={v.id} className="text-[9px] font-extrabold px-2 py-0.5 rounded-full" style={{ background: "#FFF159", color: "#111", border: "1px solid #FFE01A" }}>
                                      ML · {v.adId}
                                    </span>
                                  );
                                } else {
                                  return (
                                    <span key={v.id} className="text-[9px] font-extrabold px-2 py-0.5 rounded-full text-white" style={{ background: "#FF5722", border: "1px solid #E64A19" }}>
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
                              title="Gerenciar Vínculos de Anúncio"
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
                              title="Editar Produto"
                              className="p-1.5 rounded-lg border-none cursor-pointer"
                              style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}
                            >
                              <Edit3 size={13} />
                            </button>

                            <button
                              onClick={() => handleDeleteProduto(p.id, p.sku)}
                              title="Excluir Produto"
                              className="p-1.5 rounded-lg border-none cursor-pointer"
                              style={{ background: "#FEE2E2", color: "#DC2626" }}
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
                {editingProduto ? "Editar Produto" : "Novo Produto no Estoque"}
              </h3>
              <button
                onClick={() => setModalProdutoOpen(false)}
                className="p-1.5 rounded-lg cursor-pointer border-none"
                style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleSaveProduto} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>Código / SKU</label>
                <input
                  type="text"
                  value={formSku}
                  onChange={(e) => setFormSku(e.target.value)}
                  disabled={!!editingProduto}
                  placeholder="EX: PROD-1001"
                  required
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none mono"
                  style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>Nome do Produto</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="EX: Fone de Ouvido SoundMax"
                  required
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>Preço Base (R$)</label>
                  <input
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
                  <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>Quantidade Física</label>
                  <input
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
                <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>Alerta de Estoque Baixo (Quantidade Mínima)</label>
                <input
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
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="btn-primary px-4 py-2.5 rounded-xl text-xs font-bold border-none cursor-pointer flex items-center gap-1.5"
                >
                  {formSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Salvar
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
                Gerenciar Integrações de Canais
              </h3>
              <button
                onClick={() => setModalIntegracoesOpen(false)}
                className="p-1.5 rounded-lg cursor-pointer border-none"
                style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}
              >
                <X size={15} />
              </button>
            </div>

            <div className="p-5 space-y-6">

              {/* Canais Disponíveis */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>Disponíveis para Integração</h4>

                {/* Canal 1: Mercado Livre */}
                <div className="flex items-center justify-between p-4 rounded-xl" style={{ border: "1px solid var(--cf-border)", background: "var(--cf-card-2)" }}>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-center gap-2">
                      <img src="/Logotipo_MercadoLivre.png" alt="Mercado Livre" style={{ height: "40px", objectFit: "contain" }} />
                      <div className="text-center">
                        <div className="text-[10px]" style={{ color: "var(--cf-text-3)" }}>Integração real via OAuth2.0</div>
                      </div>
                    </div>
                  </div>
                  
                  {integracoes.some((i) => i.platform === "mercadolivre") ? (
                    <span className="text-xs font-bold text-emerald-500 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500"></span> Conectado
                    </span>
                  ) : (
                    <button
                      onClick={() => handleConnectAccount("mercadolivre")}
                      className="px-3.5 py-2 rounded-lg text-xs font-bold border-none cursor-pointer"
                      style={{ background: "var(--primary)", color: "white" }}
                    >
                      Conectar Conta
                    </button>
                  )}
                </div>

                {/* Canal 2: Shopee */}
                <div className="flex items-center justify-between p-4 rounded-xl" style={{ border: "1px solid var(--cf-border)", background: "var(--cf-card-2)" }}>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-center gap-2">
                      <img src="/Shopee.svg" alt="Shopee" style={{ height: "40px", objectFit: "contain" }} />
                      <div className="text-center">
                        <div className="text-[10px]" style={{ color: "var(--cf-text-3)" }}>Integração real de anúncios e vendas</div>
                      </div>
                    </div>
                  </div>
                  
                  {integracoes.some((i) => i.platform === "shopee") ? (
                    <span className="text-xs font-bold text-emerald-500 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500"></span> Conectado
                    </span>
                  ) : (
                    <button
                      disabled
                      title="Esta integração está em construção"
                      className="px-3.5 py-2 rounded-lg text-xs font-bold border-none cursor-not-allowed opacity-50"
                      style={{ background: "var(--primary)", color: "white" }}
                    >
                      Em Construção
                    </button>
                  )}
                </div>

              </div>

              {/* Contas Conectadas */}
              <div className="space-y-3 pt-2" style={{ borderTop: "1px solid var(--cf-border)" }}>
                <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>Suas Contas Integradas ({integracoes.length})</h4>

                {integracoes.length === 0 ? (
                  <div className="text-center py-4 text-xs" style={{ color: "var(--cf-text-3)" }}>
                    Nenhuma conta conectada no momento.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {integracoes.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-3 rounded-lg text-xs" style={{ background: "var(--cf-input)" }}>
                        <div className="flex items-center gap-2">
                          <img
                            src={item.platform === "mercadolivre" ? "/Logotipo_MercadoLivre.png" : "/Shopee.svg"}
                            alt={item.platform}
                            style={{ height: "20px", objectFit: "contain" }}
                          />
                          <span className="font-semibold" style={{ color: "var(--cf-text)" }}>{item.accountName}</span>
                          <span className="text-[10px]" style={{ color: "var(--cf-text-3)" }}>({item.accountId})</span>
                        </div>
                        <button
                          onClick={() => handleDisconnect(item.id, item.platform)}
                          className="p-1 px-2 rounded hover:bg-red-500/10 cursor-pointer border-none text-red-500 font-bold"
                          style={{ background: "transparent" }}
                        >
                          <LogOut size={12} className="inline mr-1" /> Desconectar
                        </button>
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
                  Vínculos Multi-canal do SKU: <span className="mono text-primary font-bold">{selectedProdutoSku}</span>
                </h3>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--cf-text-3)" }}>
                  Conecte anúncios de suas contas integradas a este código para sincronização automática.
                </p>
              </div>
              <button
                onClick={() => setModalVinculosOpen(false)}
                className="p-1.5 rounded-lg cursor-pointer border-none"
                style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}
              >
                <X size={15} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2">

              {/* Lado Esquerdo: Lista de Anúncios Vinculados */}
              <div className="p-5 space-y-4" style={{ borderRight: "1px solid var(--cf-border)" }}>
                <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>Anúncios Vinculados</h4>

                {vinculos.filter((v) => v.sku === selectedProdutoSku).length === 0 ? (
                  <div className="h-60 flex flex-col justify-center items-center text-center p-4" style={{ color: "var(--cf-text-3)" }}>
                    <LinkIcon size={24} className="mb-2 opacity-50" />
                    <p className="text-xs font-semibold">Nenhum anúncio vinculado a este produto.</p>
                    <p className="text-[10px] mt-1 max-w-[180px]">Vincule um anúncio no formulário ao lado para sincronizar o estoque.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {vinculos.filter((v) => v.sku === selectedProdutoSku).map((vin) => (
                      <div key={vin.id} className="p-3 rounded-xl space-y-2 text-xs" style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)" }}>
                        <div className="flex items-center justify-between">
                          <span
                            className="font-extrabold px-2 py-0.5 rounded text-[8px]"
                            style={{
                              background: vin.platform === "mercadolivre" ? "#FFF159" : "#FF5722",
                              color: vin.platform === "mercadolivre" ? "#111" : "#fff"
                            }}
                          >
                            {vin.platform === "mercadolivre" ? "MERCADO LIVRE" : "SHOPEE"}
                          </span>
                          <button
                            onClick={() => handleRemoveVinculo(vin.id)}
                            className="p-1 rounded cursor-pointer border-none text-red-500 hover:bg-red-500/10"
                            style={{ background: "transparent" }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <div className="font-semibold font-heading" style={{ color: "var(--cf-text)" }}>{vin.title}</div>
                        <div className="flex items-center justify-between font-mono text-[10px]" style={{ color: "var(--cf-text-3)" }}>
                          <span>ID: {vin.adId}</span>
                          <span className="font-bold text-right" style={{ color: "var(--cf-text)" }}>
                            {vin.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Lado Direito: Formulário Vincular Novo Anúncio */}
              <div className="p-5 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>Vincular Novo Anúncio</h4>

                <form onSubmit={handleAddVinculo} className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>Plataforma</label>
                    <select
                      value={formVinculoPlatform}
                      onChange={(e) => setFormVinculoPlatform(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl text-xs outline-none cursor-pointer"
                      style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }}
                    >
                      <option value="mercadolivre">Mercado Livre</option>
                      <option value="shopee">Shopee</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>ID do Anúncio</label>
                    <input
                      type="text"
                      value={formVinculoAdId}
                      onChange={(e) => setFormVinculoAdId(e.target.value)}
                      placeholder="EX: MLB40001001"
                      required
                      className="w-full px-3 py-2 rounded-xl text-xs outline-none mono"
                      style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>Título do Anúncio</label>
                    <input
                      type="text"
                      value={formVinculoTitle}
                      onChange={(e) => setFormVinculoTitle(e.target.value)}
                      placeholder="EX: Fone Bluetooth SoundMax Pro"
                      required
                      className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                      style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>Preço no Canal (R$)</label>
                      <input
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
                      <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>Estoque Atual</label>
                      <input
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
                    Vincular Anúncio
                  </button>
                </form>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 4: SIMULADOR DE VENDA (TESTE WEBHOOKS) ── */}
      {modalSimuladorOpen && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "var(--db-overlay)", backdropFilter: "blur(5px)", zIndex: 9999 }}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-fade-in" style={{ background: "var(--cf-card)" }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--cf-border)" }}>
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-emerald-500" />
                <h3 className="font-heading font-bold text-base" style={{ color: "var(--cf-text)" }}>
                  Simulador de Vendas
                </h3>
              </div>
              <button
                onClick={() => setModalSimuladorOpen(false)}
                className="p-1.5 rounded-lg cursor-pointer border-none"
                style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleSimularVenda} className="p-5 space-y-4">

              <div className="rounded-xl px-4 py-3 text-[11px] leading-relaxed space-y-1.5" style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", color: "var(--success)" }}>
                <p className="font-bold flex items-center gap-1"><CheckCircle size={12} /> Como Testar a Sincronização:</p>
                <p>1. Crie ou importe o mesmo SKU nas duas plataformas (ex: conecte as duas plataformas mockadas ou crie dois anúncios vinculados ao mesmo SKU).</p>
                <p>2. Simule uma venda em uma plataforma.</p>
                <p>3. O sistema receberá o webhook, decrementará o estoque central no Firestore e enviará a nova quantidade de volta para todas as outras plataformas vinculadas!</p>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>Selecione o Anúncio Vendido</label>
                <select
                  value={simSelectedVinculoId}
                  onChange={(e) => setSimSelectedVinculoId(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 rounded-xl text-xs outline-none cursor-pointer"
                  style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }}
                >
                  <option value="">-- Escolha um anúncio vinculado --</option>
                  {vinculos.map((v) => (
                    <option key={v.id} value={v.id}>
                      [{v.platform === "mercadolivre" ? "ML" : "SHP"}] {v.title} (SKU: {v.sku} | Estoque: {v.quantity})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>Quantidade Vendida</label>
                <input
                  type="number"
                  value={simQuantity}
                  onChange={(e) => setSimQuantity(e.target.value)}
                  min="1"
                  required
                  className="w-full px-3 py-2.5 rounded-xl text-xs outline-none mono"
                  style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)", color: "var(--cf-text)" }}
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalSimuladorOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold border-none cursor-pointer"
                  style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  disabled={simRunning || !simSelectedVinculoId}
                  className="btn-success px-4 py-2.5 rounded-xl text-xs font-bold border-none cursor-pointer flex items-center gap-1.5"
                  style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}
                >
                  {simRunning ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                  Simular Pedido Recebido
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
