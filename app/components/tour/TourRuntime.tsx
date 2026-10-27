"use client";

// Orquestra o tour guiado: estado persistido (Firestore, por login), oferta de
// primeiro acesso, navegação entre etapas, áudio e botão de ajuda permanente.
// Renderizado só nas rotas internas (ver AppShell).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useAccountScope } from "@/app/hooks/useAccountScope";
import { useSubscription } from "@/app/hooks/useSubscription";
import { getStep, stepForPath, visibleSteps, TOUR_STEP_IDS, type TourAccess } from "@/lib/tour/catalog";
import { DEFAULT_TOUR_STATE, neighbor, normalizeTourState, shouldAutoOffer, type TourState } from "@/lib/tour/state";
import { useSpotRect } from "./TourSpotlight";
import { CompletionDialog, StepDialog, WelcomeDialog } from "./TourModal";
import { TourHelpMenu } from "./TourHelpMenu";

type View = "closed" | "welcome" | "step" | "completion";
const SESSION_FLAG = "nexusfi-tour-offered";

export function TourRuntime() {
  const pathname = usePathname();
  const router = useRouter();
  const scope = useAccountScope();
  const sub = useSubscription();

  const [state, setState] = useState<TourState | null>(null);
  const [setupDone, setSetupDone] = useState(false);
  const [view, setView] = useState<View>("closed");
  const [mode, setMode] = useState<"tour" | "single">("tour");
  const [stepId, setStepId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const uidRef = useRef("");

  const access: TourAccess = useMemo(
    () => ({ isOwner: scope.isOwner, permissions: scope.permissions }),
    [scope.isOwner, scope.permissions]
  );
  const steps = useMemo(() => visibleSteps(access), [access]);
  const ids = useMemo(() => steps.map((s) => s.id), [steps]);
  const step = getStep(stepId);
  const ready = !scope.loading && !!scope.uid;

  /* ── Estado persistido (por login) e pré-requisito do questionário inicial ── */
  useEffect(() => {
    if (!ready) return;
    uidRef.current = scope.uid;
    let unsubs: Array<() => void> = [];
    let dead = false;
    (async () => {
      try {
        const [{ getFirebase }, { doc, onSnapshot }] = await Promise.all([import("@/lib/firebase"), import("firebase/firestore")]);
        const { db } = await getFirebase();
        if (dead) return;
        unsubs.push(
          onSnapshot(
            doc(db, "users", scope.uid, "profile", "tour"),
            (snap) => setState(normalizeTourState(snap.exists() ? snap.data() : null, TOUR_STEP_IDS)),
            () => setState({ ...DEFAULT_TOUR_STATE, status: "completed" }) // sem leitura: nunca interrompe
          )
        );
        if (scope.isOwner) {
          unsubs.push(
            onSnapshot(
              doc(db, "users", scope.ownerUid, "profile", "onboarding"),
              (snap) => setSetupDone(snap.exists() && !!snap.data()?.completed),
              () => setSetupDone(false)
            )
          );
        } else {
          setSetupDone(true); // membro não responde o questionário do negócio
        }
      } catch {
        /* Firebase indisponível: o botão de ajuda continua funcionando sem estado */
      }
    })();
    return () => { dead = true; unsubs.forEach((u) => u()); unsubs = []; };
  }, [ready, scope.uid, scope.ownerUid, scope.isOwner]);

  const persist = useCallback(async (patch: Partial<TourState>) => {
    const uid = uidRef.current;
    if (!uid) return;
    setState((prev) => ({ ...(prev ?? DEFAULT_TOUR_STATE), ...patch, updatedAt: Date.now() }));
    try {
      const [{ getFirebase }, { doc, setDoc }] = await Promise.all([import("@/lib/firebase"), import("firebase/firestore")]);
      const { db } = await getFirebase();
      await setDoc(doc(db, "users", uid, "profile", "tour"), { ...patch, updatedAt: Date.now() }, { merge: true });
    } catch {
      console.warn("[tour] não foi possível salvar o progresso");
    }
  }, []);

  /* ── Oferta automática de primeiro acesso ── */
  useEffect(() => {
    if (view !== "closed" || !state || !ready || sub.loading) return;
    const accessActive = !sub.signedOut && sub.isActive;
    if (!shouldAutoOffer(state, { setupDone, accessActive, now: Date.now() })) return;
    try {
      if (sessionStorage.getItem(SESSION_FLAG) === uidRef.current) return;
      sessionStorage.setItem(SESSION_FLAG, uidRef.current);
    } catch { /* sem sessionStorage: a regra do Firestore já evita repetir */ }
    setView("welcome");
  }, [state, setupDone, ready, sub.loading, sub.signedOut, sub.isActive, view]);

  /* ── Navegação ── */
  const goToRoute = useCallback((id: string) => {
    const route = getStep(id)?.route;
    const norm = pathname.replace(/\/+$/, "") || "/";
    if (route && norm !== route) router.push(route);
  }, [pathname, router]);

  const showStep = useCallback((id: string, nextMode: "tour" | "single") => {
    setMenuOpen(false);
    setMode(nextMode);
    setStepId(id);
    setView("step");
    if (nextMode === "tour") {
      void persist({ status: "in_progress", lastStepId: id });
      goToRoute(id);
    }
  }, [goToRoute, persist]);

  const startTour = useCallback((from?: string | null) => {
    const first = from && ids.includes(from) ? from : ids[0];
    if (first) showStep(first, "tour");
  }, [ids, showStep]);

  const closeAll = useCallback(() => {
    setView("closed");
    setMenuOpen(false);
  }, []);

  const finish = useCallback(() => {
    void persist({ status: "completed", lastStepId: null });
    setView("completion");
  }, [persist]);

  const dismiss = useCallback(() => {
    closeAll();
    void persist({ status: "dismissed", lastStepId: null, dismissCount: (state?.dismissCount ?? 0) + 1 });
  }, [closeAll, persist, state?.dismissCount]);

  const onNext = useCallback(() => {
    const n = stepId ? neighbor(ids, stepId, 1) : null;
    if (n) showStep(n, "tour"); else finish();
  }, [finish, ids, showStep, stepId]);

  const onBack = useCallback(() => {
    const n = stepId ? neighbor(ids, stepId, -1) : null;
    if (n) showStep(n, "tour");
  }, [ids, showStep, stepId]);

  /* ── Destaque do elemento real ── */
  const rect = useSpotRect(step?.target ?? null, view === "step");

  /* ── Rota deixou de existir pro usuário (permissão mudou): fecha ── */
  useEffect(() => {
    if (view === "step" && stepId && !ids.includes(stepId)) {
      closeAll();
    }
  }, [ids, stepId, view, closeAll]);

  const currentStep = stepForPath(pathname, access);
  const resumeId = state?.status === "in_progress" && state.lastStepId && ids.includes(state.lastStepId) ? state.lastStepId : null;

  if (!ready) return null;

  return (
    <>
      {view === "closed" && (
        <TourHelpMenu
          open={menuOpen}
          steps={steps}
          currentStep={currentStep}
          canResume={!!resumeId}
          onToggle={() => setMenuOpen((o) => !o)}
          onClose={() => setMenuOpen(false)}
          onPick={(id) => showStep(id, "single")}
          onRestart={() => startTour()}
          onResume={() => startTour(resumeId)}
        />
      )}

      {view === "welcome" && (
        <WelcomeDialog
          onStart={() => startTour()}
          onExplore={dismiss}
        />
      )}

      {view === "step" && step && (
        <StepDialog
          step={step}
          mode={mode}
          index={Math.max(0, ids.indexOf(step.id))}
          total={ids.length}
          rect={rect}
          onNext={onNext}
          onBack={onBack}
          onSkip={dismiss}
          onEnd={closeAll}
          onMenu={() => { closeAll(); setMenuOpen(true); }}
          onOpenPage={step.route && (pathname.replace(/\/+$/, "") || "/") !== step.route ? () => { closeAll(); goToRoute(step.id); } : undefined}
        />
      )}

      {view === "completion" && (
        <CompletionDialog onDone={closeAll} onRestart={() => startTour()} />
      )}
    </>
  );
}
