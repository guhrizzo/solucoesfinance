"use client";

// Porta do PIN para ações sensíveis (emitir/cancelar boleto): mesmo padrão da
// página (PinModal + verifyPin + getPinLockStatus). O PIN é do login atual
// (authUid), não do dono dos dados.

import { useTranslations } from "next-intl";
import PinModal from "@/app/components/PinModal";
import { verifyPin, loadPinHash, getPinLockStatus } from "@/app/hooks/usePin";

/** true se o login atual já cadastrou um PIN. */
export async function hasPin(pinUid: string): Promise<boolean> {
  return !!(await loadPinHash(pinUid));
}

export function PinGate({
  open,
  title,
  subtitle,
  pinUid,
  onClose,
  onVerified,
  onError,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  pinUid: string;
  onClose: () => void;
  /** PIN correto: a ação segue (o gate já se fechou). */
  onVerified: () => void;
  /** PIN bloqueado/ausente: mensagem pronta para mostrar. */
  onError: (message: string) => void;
}) {
  const tPin = useTranslations("common.pin");

  async function handleSuccess(pin: string) {
    const result = await verifyPin(pinUid, pin);
    if (result === "ok") {
      onClose();
      onVerified();
    } else if (result === "locked") {
      onClose();
      onError(tPin("lockedRetry"));
    } else if (result === "wrong") {
      if (getPinLockStatus().locked) {
        onClose();
        onError(tPin("lockedRetry"));
      } else {
        (window as unknown as { __pinModalShake?: (m: string) => void }).__pinModalShake?.(tPin("wrong"));
      }
    } else {
      onClose();
      onError(tPin("notConfigured"));
    }
  }

  return <PinModal open={open} title={title} subtitle={subtitle} onClose={onClose} onSuccess={handleSuccess} />;
}
