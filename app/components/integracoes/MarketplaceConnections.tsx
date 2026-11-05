"use client";

// Cartões de conexão com os marketplaces (Mercado Livre, Shopee, TikTok Shop,
// Shein): canais disponíveis, contas conectadas com o estado do token,
// conectar/reconectar e desconectar. Extraído do modal de integrações do
// Estoque, que continua dono do modal e do botão que o abre; a aba
// Integrações de Configurações usa o mesmo componente ("duplicar, não mover").
//
// Os <img> são os logos estáticos de /public, iguais aos do Estoque.
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { RefreshCw, LogOut } from "lucide-react";
import ConfirmModal from "@/app/components/ConfirmModal";
import { authedFetch } from "@/lib/authedFetch";
import {
  SHOPEE_UI_VISIVEL,
  TIKTOKSHOP_UI_VISIVEL,
  SHEIN_UI_VISIVEL,
  type Plataforma,
} from "@/app/components/integracoes/flags";

// Mesma assinatura do showToast do Estoque e do useToast de Configurações
// ("info" é usado no aviso de permissões limitadas do retorno do OAuth).
export type ShowToast = (msg: string, type?: "success" | "error" | "info") => void;

interface Integracao {
  id: string;
  platform: Plataforma;
  accountId: string;
  accountName: string;
  accessToken: string;
  expiresAt: number;
  createdAt?: number;
  updatedAt?: number;
}

interface MarketplaceConnectionsProps {
  ownerUid: string;
  // Para onde o callback do OAuth volta (lista permitida em lib/oauthReturn.ts).
  returnTo: "/estoque" | "/configuracoes";
  showToast: ShowToast;
}

// Remove os parâmetros de retorno do OAuth da URL (sem recarregar a página).
const cleanUrlParams = () => {
  const newUrl = window.location.pathname;
  window.history.replaceState({}, document.title, newUrl);
};

// Capturar retornos de OAuth (parâmetros da URL): ?integration=…&message=…
// &imported=…&warning=… — mostra o toast e limpa a URL.
export function useIntegrationReturnToast(showToast: ShowToast): void {
  const t = useTranslations("estoque");

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
    } else if (integration === "tiktok_success") {
      if (warning === "limited_permissions") {
        showToast(t("toast.tiktokConnectedLimited"), "info");
      } else {
        showToast(
          imported && imported !== "0"
            ? t("toast.tiktokIntegratedImported", { count: imported })
            : t("toast.tiktokIntegrated"),
          "success"
        );
      }
      cleanUrlParams();
    } else if (integration === "shein_success") {
      if (warning === "limited_permissions") {
        showToast(t("toast.sheinConnectedLimited"), "info");
      } else {
        showToast(
          imported && imported !== "0"
            ? t("toast.sheinIntegratedImported", { count: imported })
            : t("toast.sheinIntegrated"),
          "success"
        );
      }
      cleanUrlParams();
    } else if (integration === "ml_error" || integration === "shopee_error" || integration === "tiktok_error" || integration === "shein_error") {
      showToast(t("toast.integrationError", { message: message || t("toast.integrationErrorGeneric") }), "error");
      cleanUrlParams();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// Páginas que não são o Estoque devem chamar useIntegrationReturnToast elas mesmas (o componente não chama).
export default function MarketplaceConnections({ ownerUid, returnTo, showToast }: MarketplaceConnectionsProps) {
  const t = useTranslations("estoque");
  const locale = useLocale();

  const platformLabel = (p: Plataforma) => t(`platformName.${p}`);

  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  // Só depois do 1º snapshot se sabe quais canais já estão conectados.
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

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

  // Ouvir integrações de contas do dono (mesma consulta do Estoque).
  useEffect(() => {
    if (!ownerUid) return;

    let unsubIntegracoes: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { getFirebase } = await import("@/lib/firebase");
        const { db } = await getFirebase();
        const { collection, onSnapshot, query, where } = await import("firebase/firestore");
        if (cancelled) return;

        const qIntegracoes = query(collection(db, "integracoes"), where("userId", "==", ownerUid));
        unsubIntegracoes = onSnapshot(
          qIntegracoes,
          (snap) => {
            const list: Integracao[] = [];
            snap.forEach((doc) => {
              list.push({ id: doc.id, ...doc.data() } as Integracao);
            });
            setIntegracoes(list);
            setLoadError(false);
            setLoaded(true);
          },
          () => {
            console.error("Erro ao ouvir integrações");
            setLoadError(true);
          }
        );
      } catch (err) {
        console.error("Erro ao ouvir integrações:", err);
        setLoadError(true);
      }
    })();

    return () => {
      cancelled = true;
      unsubIntegracoes?.();
    };
  }, [ownerUid]);

  // Resumo de identidade da(s) conta(s) de um canal, pro badge do cartão.
  const resumoContas = (platform: Plataforma) => {
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

  // Desconectar Integração
  const handleDisconnect = (id: string, platform: Plataforma) => {
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

  // Redirecionamento OAuth das Plataformas. O `returnTo` só vai na URL quando
  // não é o padrão (/estoque), pra manter as URLs do Estoque como sempre foram.
  const handleConnectAccount = async (platform: Plataforma) => {
    // O Estoque checava `user`; aqui o equivalente é ter o dono resolvido
    // (o componente só aparece depois do login e do accountScope).
    if (!ownerUid) return;

    const returnQuery = returnTo !== "/estoque" ? `returnTo=${encodeURIComponent(returnTo)}` : "";

    // Shopee/TikTok Shop/Shein: rota autenticada (POST) — o ownerUid sai do
    // ID token, não da URL.
    if (platform === "shopee" || platform === "tiktokshop" || platform === "shein") {
      const failKey = platform === "shopee" ? "shopeeConnectFail" : platform === "tiktokshop" ? "tiktokConnectFail" : "sheinConnectFail";
      const errKey = platform === "shopee" ? "shopeeConnectError" : platform === "tiktokshop" ? "tiktokConnectError" : "sheinConnectError";
      try {
        const res = await authedFetch(
          `/api/auth/${platform}/redirect${returnQuery ? `?${returnQuery}` : ""}`,
          { method: "POST" }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.authUrl) {
          showToast(data.error || t(`toast.${failKey}`), "error");
          return;
        }
        // TikTok Shop abre em nova guia (pedido do usuário) — o fluxo de
        // autorização dele tende a travar/perder a sessão do Nexus quando
        // navega na mesma guia. ML/Shopee continuam navegando na mesma guia.
        if (platform === "tiktokshop") {
          window.open(data.authUrl, "_blank", "noopener,noreferrer");
        } else {
          window.location.href = data.authUrl;
        }
      } catch (err) {
        console.error(err);
        showToast(err instanceof Error ? err.message : t(`toast.${errKey}`), "error");
      }
      return;
    }

    // TODO: migrar o ML pro mesmo fluxo autenticado (hoje ainda é GET com userId na URL).
    window.location.href = `/api/auth/${platform}/redirect?userId=${ownerUid}${returnQuery ? `&${returnQuery}` : ""}`;
  };

  return (
    <div className="space-y-6">
      {/* Confirmação renderizada no body (fora do modal/aba que contém este
          componente), como era no Estoque. */}
      {confirmDialog &&
        createPortal(
          <ConfirmModal
            open
            title={confirmDialog.title}
            message={confirmDialog.message}
            confirmText={confirmDialog.confirmText}
            isDangerous
            loading={confirmLoading}
            onConfirm={runConfirm}
            onCancel={() => setConfirmDialog(null)}
          />,
          document.body
        )}

      {loadError && (
        <p role="alert" className="text-xs" style={{ color: "var(--neg)" }}>{t("integrationsModal.loadError")}</p>
      )}
      {!loaded && !loadError && (
        <p className="text-xs" style={{ color: "var(--cf-text-3)" }}>{t("integrationsModal.loading")}</p>
      )}

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
              disabled={!loaded}
              className="px-3.5 py-2 rounded-lg text-xs font-bold border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "var(--primary)", color: "white" }}
            >
              {t("integrationsModal.connectAccount")}
            </button>
          )}
        </div>

        {/* Canal 2: Shopee — oculto da interface (ver SHOPEE_UI_VISIVEL em flags.ts). */}
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
              disabled={!loaded}
              className="px-3.5 py-2 rounded-lg text-xs font-bold border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "var(--primary)", color: "white" }}
            >
              {t("integrationsModal.connectAccount")}
            </button>
          )}
        </div>
        )}

        {/* Canal 3: TikTok Shop */}
        {TIKTOKSHOP_UI_VISIVEL && (
        <div className="flex items-center justify-between p-4 rounded-xl" style={{ border: "1px solid var(--cf-border)", background: "var(--cf-card-2)" }}>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center gap-2">
              <img src="/TikTokShop.svg" alt="TikTok Shop" style={{ height: "40px", objectFit: "contain" }} />
              <div className="text-center">
                <div className="text-[10px]" style={{ color: "var(--cf-text-3)" }}>{t("integrationsModal.tiktokDesc")}</div>
              </div>
            </div>
          </div>

          {resumoContas("tiktokshop") ? (
            <span className="text-xs font-bold text-emerald-500 flex items-center gap-1.5 text-right">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0"></span>
              {resumoContas("tiktokshop")}
            </span>
          ) : (
            <button
              onClick={() => handleConnectAccount("tiktokshop")}
              disabled={!loaded}
              className="px-3.5 py-2 rounded-lg text-xs font-bold border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "var(--primary)", color: "white" }}
            >
              {t("integrationsModal.connectAccount")}
            </button>
          )}
        </div>
        )}

        {/* Canal 4: Shein */}
        {SHEIN_UI_VISIVEL && (
        <div className="flex items-center justify-between p-4 rounded-xl" style={{ border: "1px solid var(--cf-border)", background: "var(--cf-card-2)" }}>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center gap-2">
              <img src="/Shein.svg" alt="Shein" style={{ height: "40px", objectFit: "contain" }} />
              <div className="text-center">
                <div className="text-[10px]" style={{ color: "var(--cf-text-3)" }}>{t("integrationsModal.sheinDesc")}</div>
              </div>
            </div>
          </div>

          {resumoContas("shein") ? (
            <span className="text-xs font-bold text-emerald-500 flex items-center gap-1.5 text-right">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0"></span>
              {resumoContas("shein")}
            </span>
          ) : (
            <button
              onClick={() => handleConnectAccount("shein")}
              disabled={!loaded}
              className="px-3.5 py-2 rounded-lg text-xs font-bold border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                      src={
                        item.platform === "mercadolivre"
                          ? "/Logotipo_MercadoLivre.png"
                          : item.platform === "shopee"
                          ? "/Shopee.svg"
                          : item.platform === "tiktokshop"
                          ? "/TikTokShop.svg"
                          : "/Shein.svg"
                      }
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
  );
}
