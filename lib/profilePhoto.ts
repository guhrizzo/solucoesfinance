// lib/profilePhoto.ts
//
// Foto de perfil do usuário. Fonte única da verdade: `photoURL` do Firebase
// Auth (mesmo mecanismo do nome de exibição — updateProfile()). Sem Firestore.
//
// Precedência ao resolver o avatar:
//   1. user.photoURL            — foto própria enviada, ou a do Google quando
//                                 o usuário nunca enviou uma
//   2. foto do Google em providerData  — fallback se photoURL foi limpo mas o
//                                        Google segue vinculado
//   3. null → o componente <Avatar> desenha a inicial sobre fundo azul
//
// O upload reduz qualquer imagem a um JPEG quadrado de 256px (~20-30 KB, sem
// EXIF) e grava em Storage `users/{uid}/avatar/photo_{ts}.jpg`.

import type { User } from "firebase/auth";

export const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp";
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_SIZE_PX = 256;

const UPLOAD_TIMEOUT_MS = 15_000;

/** Foto do provedor Google vinculado, se houver. */
export function googlePhotoURL(user: User): string | null {
  return user.providerData.find((p) => p?.providerId === "google.com")?.photoURL ?? null;
}

/** Inicial usada no avatar de fallback (nome → e-mail → "U"). */
export function avatarInitial(user: User | null): string {
  const raw = user?.displayName?.trim() || user?.email?.trim() || "U";
  return raw.charAt(0).toUpperCase();
}

/** Resolve o que o <Avatar> deve mostrar para este usuário. */
export function resolveAvatar(user: User | null): { src: string | null; initial: string } {
  const initial = avatarInitial(user);
  if (!user) return { src: null, initial };
  if (user.photoURL) return { src: user.photoURL, initial };
  return { src: googlePhotoURL(user), initial };
}

/** true quando existe foto enviada pelo próprio usuário (≠ da foto do Google). */
export function hasCustomPhoto(user: User): boolean {
  return !!user.photoURL && user.photoURL !== googlePhotoURL(user);
}

/**
 * Carrega o arquivo, recorta o quadrado central e devolve um JPEG 256×256.
 * Usa <img> + <canvas> (compatível com qualquer navegador que o app suporta).
 */
export async function downscaleToSquare(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("Não foi possível ler a imagem."));
      im.src = url;
    });

    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error("Não foi possível processar a imagem.");
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE_PX;
    canvas.height = AVATAR_SIZE_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível processar a imagem.");
    ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE_PX, AVATAR_SIZE_PX);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85),
    );
    if (!blob) throw new Error("Não foi possível processar a imagem.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Best-effort: apaga todos os arquivos de `users/{uid}/avatar` exceto `keepPath`. */
async function cleanupAvatarDir(uid: string, keepPath: string | null): Promise<void> {
  try {
    const [{ getFirebase }, { ref, listAll, deleteObject }] = await Promise.all([
      import("@/lib/firebase"),
      import("firebase/storage"),
    ]);
    const { storage } = await getFirebase();
    const listing = await listAll(ref(storage, `users/${uid}/avatar`));
    await Promise.all(
      listing.items
        .filter((item) => item.fullPath !== keepPath)
        .map((item) => deleteObject(item).catch(() => {})),
    );
  } catch {
    /* sem permissão de list / pasta inexistente — ignora */
  }
}

/**
 * Valida, processa e envia a foto; grava a URL em `photoURL` do Auth.
 * Lança `Error` com mensagem em PT-BR em qualquer falha.
 */
export async function uploadAvatar(user: User, file: File): Promise<string> {
  if (!AVATAR_ACCEPT.split(",").includes(file.type)) {
    throw new Error("Escolha uma imagem PNG, JPEG ou WebP.");
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw new Error("A imagem precisa ter no máximo 5 MB.");
  }

  const blob = await downscaleToSquare(file);

  const run = async (): Promise<string> => {
    const [{ getFirebase }, { ref, uploadBytes, getDownloadURL }, { updateProfile }] =
      await Promise.all([
        import("@/lib/firebase"),
        import("firebase/storage"),
        import("firebase/auth"),
      ]);
    const { storage } = await getFirebase();

    const path = `users/${user.uid}/avatar/photo_${Date.now()}.jpg`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
    const url = await getDownloadURL(storageRef);
    await updateProfile(user, { photoURL: url });
    void cleanupAvatarDir(user.uid, path);
    return url;
  };

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("Não foi possível enviar a foto. Tente novamente.")),
      UPLOAD_TIMEOUT_MS,
    ),
  );

  return Promise.race([run(), timeout]);
}

/** Remove a foto própria: volta pra do Google (se houver) ou pra inicial. */
export async function removeAvatar(user: User): Promise<void> {
  const { updateProfile } = await import("firebase/auth");
  await updateProfile(user, { photoURL: googlePhotoURL(user) ?? "" });
  void cleanupAvatarDir(user.uid, null);
}
