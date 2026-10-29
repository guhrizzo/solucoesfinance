"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import PinModal from "@/app/components/PinModal";
import { getPinLockStatus, loadPinHash, verifyPin } from "@/app/hooks/usePin";
import { registrarSolicitadorPin } from "./shared";

/**
 * Toda ação do RH pede o PIN de 4 dígitos do usuário LOGADO (authUid), o mesmo
 * do resto do app. Este provedor registra o solicitador usado por rhApi/rhFetch
 * (shared.tsx) e desenha o PinModal na raiz da página — FORA de qualquer
 * <Modal>, porque o card do Modal tem transform e prende o position:fixed.
 * O servidor confere o PIN de novo em cada chamada (lib/rh/server.ts).
 */
export function RhPinProvider({ authUid, children }: { authUid: string; children: ReactNode }) {
  const t = useTranslations("rh.pin");
  const tPin = useTranslations("common.pin");
  const [open, setOpen] = useState(false);
  const espera = useRef<{ resolve: (pin: string | null) => void; reject: (e: Error) => void } | null>(null);

  useEffect(() => {
    registrarSolicitadorPin(async () => {
      const hash = await loadPinHash(authUid);
      if (!hash) throw new Error(tPin("notConfigured"));
      if (getPinLockStatus().locked) throw new Error(tPin("lockedRetry"));
      return new Promise<string | null>((resolve, reject) => {
        espera.current?.resolve(null);
        espera.current = { resolve, reject };
        setOpen(true);
      });
    });
    return () => registrarSolicitadorPin(null);
  }, [authUid, tPin]);

  async function aoDigitar(pin: string) {
    const r = await verifyPin(authUid, pin);
    if (r === "wrong" && !getPinLockStatus().locked) {
      (window as unknown as { __pinModalShake?: (m: string) => void }).__pinModalShake?.(tPin("wrong"));
      return;
    }
    const w = espera.current;
    espera.current = null;
    setOpen(false);
    if (r === "ok") w?.resolve(pin);
    else if (r === "no_pin") w?.reject(new Error(tPin("notConfigured")));
    else w?.reject(new Error(tPin("lockedRetry")));
  }

  return (
    <>
      {children}
      <PinModal
        open={open}
        title={t("titulo")}
        subtitle={t("subtitulo")}
        onClose={() => { espera.current?.resolve(null); espera.current = null; setOpen(false); }}
        onSuccess={aoDigitar}
      />
    </>
  );
}
