"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { PageLoader } from "@/app/components/ui";

// O módulo Restaurante agora é uma aba dentro de /estoque. Esta rota só
// redireciona (links e favoritos antigos continuam funcionando).
export default function RestaurantePage() {
  const router = useRouter();
  useEffect(() => { router.replace("/estoque?aba=restaurante"); }, [router]);
  return <PageLoader />;
}
