"use client";

// app/components/AvatarUploader.tsx
//
// O único lugar onde a foto de perfil é editada (cabeçalho da /users).
// Exibe o <Avatar> grande com selo de câmera; ao escolher um arquivo, valida +
// reduz + envia (lib/profilePhoto) e chama refresh() do store compartilhado
// pra Navbar e Configurações atualizarem junto.

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Avatar } from "./ui";
import { useProfilePhoto } from "../hooks/useProfilePhoto";
import { AVATAR_ACCEPT, removeAvatar, uploadAvatar } from "@/lib/profilePhoto";

type ShowToast = (message: string, type?: "success" | "error" | "warning" | "info") => void;

const errMsg = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;

export function AvatarUploader({ showToast }: { showToast: ShowToast }) {
  const { src, initial, custom, refresh } = useProfilePhoto();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function currentUser() {
    const { getFirebase } = await import("@/lib/firebase");
    const { auth } = await getFirebase();
    if (!auth.currentUser) throw new Error("Sessão expirada. Recarregue a página.");
    return auth.currentUser;
  }

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busy) return;
    setBusy(true);
    try {
      await uploadAvatar(await currentUser(), file);
      await refresh();
      showToast("Foto atualizada.", "success");
    } catch (err) {
      showToast(errMsg(err, "Não foi possível enviar a foto."), "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (busy) return;
    setBusy(true);
    try {
      await removeAvatar(await currentUser());
      await refresh();
      showToast("Foto removida.", "info");
    } catch (err) {
      showToast(errMsg(err, "Não foi possível remover a foto."), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5 shrink-0">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label="Trocar foto de perfil"
        className="relative block rounded-2xl overflow-hidden cursor-pointer disabled:cursor-wait group"
      >
        <Avatar src={src} initial={initial} size={56} radius={16} />
        <span
          className="absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover:opacity-100"
          style={{ background: "rgba(0,0,0,0.42)" }}
        >
          <Camera size={16} className="text-white" />
        </span>
        {busy && (
          <span
            className="absolute inset-0 grid place-items-center"
            style={{ background: "rgba(0,0,0,0.5)" }}
          >
            <Loader2 size={16} className="text-white animate-spin" />
          </span>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={AVATAR_ACCEPT}
        hidden
        onChange={handlePick}
      />

      {custom && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={busy}
          className="text-[11px] font-semibold cursor-pointer disabled:opacity-50"
          style={{ color: "var(--db-text-3)" }}
        >
          Remover foto
        </button>
      )}
    </div>
  );
}
