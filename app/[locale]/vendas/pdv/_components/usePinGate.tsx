"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import PinModal from "@/app/components/PinModal";
import { loadPinHash, verifyPin, getPinLockStatus } from "@/app/hooks/usePin";

/**
 * Trava de PIN do PDV (abrir e fechar o caixa). O PIN conferido é o do
 * usuário LOGADO (authUid), como no resto do app — ver lib/audit.ts.
 *
 *   const pin = usePinGate(authUid, setErr);
 *   pin.pedir("Abrir caixa", "…", () => abrir());
 *   return <>{…}{pin.modal}</>;
 *
 * O `modal` deve ser renderizado FORA de qualquer <Modal> (o card do Modal tem
 * transform e vira containing block do position:fixed).
 */
export function usePinGate(authUid: string | null, onError: (msg: string) => void) {
  const tPin = useTranslations("common.pin");
  const [open, setOpen] = useState(false);
  const [textos, setTextos] = useState({ title: "", subtitle: "" });
  const acao = useRef<(() => void) | null>(null);

  async function pedir(title: string, subtitle: string, onOk: () => void) {
    if (!authUid) { onError(tPin("notConfigured")); return; }
    const hash = await loadPinHash(authUid);
    if (!hash) { onError(tPin("notConfigured")); return; }
    acao.current = onOk;
    setTextos({ title, subtitle });
    setOpen(true);
  }

  async function onSuccess(pin: string) {
    if (!authUid) return;
    const result = await verifyPin(authUid, pin);
    if (result === "locked" || (result === "wrong" && getPinLockStatus().locked)) {
      setOpen(false); onError(tPin("lockedRetry")); return;
    }
    if (result === "wrong") {
      (window as unknown as { __pinModalShake?: (m: string) => void }).__pinModalShake?.(tPin("wrong"));
      return;
    }
    if (result === "no_pin") { setOpen(false); onError(tPin("notConfigured")); return; }
    setOpen(false);
    const fn = acao.current;
    acao.current = null;
    fn?.();
  }

  const modal = (
    <PinModal
      open={open}
      title={textos.title}
      subtitle={textos.subtitle}
      onClose={() => { setOpen(false); acao.current = null; }}
      onSuccess={onSuccess}
    />
  );

  return { pedir, modal };
}
