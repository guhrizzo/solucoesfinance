"use client";

// components/OnboardingModal.tsx

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  X, ChevronRight, Check, Building2,
  Store, Settings, Users,
  Briefcase, ArrowRight, Sparkles, ShoppingCart,
} from "lucide-react";

interface StepOption {
  /** valor GRAVADO no Firestore (não traduzir — a Navbar/PerfilTab comparam
   *  por string, ex.: `ramo.includes("Serviço")`). */
  value: string;
  /** chave de tradução: steps.<stepId>.options.<key> */
  key: string;
  icon?: React.ReactNode;
}

interface Step {
  id: string;
  type: "question" | "info";
  options?: StepOption[];
  multi?: boolean;
}

const STEPS: Step[] = [
  {
    id: "cargo",
    type: "question",
    options: [
      { value: "Funcionário",                key: "funcionario", icon: <Users size={16} /> },
      { value: "Dono / Sócio",               key: "dono",        icon: <Briefcase size={16} /> },
      { value: "Terceiro (Consultor, BPO…)", key: "terceiro",    icon: <Settings size={16} /> },
      { value: "Outros",                     key: "outros",      icon: <Sparkles size={16} /> },
    ],
  },
  {
    id: "faturamento",
    type: "question",
    options: [
      { value: "Até R$ 7 mil",             key: "ate7k" },
      { value: "De R$ 7 mil a R$ 30 mil",  key: "7a30k" },
      { value: "De R$ 30 mil a R$ 200 mil", key: "30a200k" },
      { value: "Acima de R$ 200 mil",      key: "acima200k" },
    ],
  },
  {
    id: "desafio",
    type: "question",
    options: [
      { value: "Tenho os dados, mas não sei como decidir",              key: "decidir" },
      { value: "Não sei por onde começar",                              key: "comecar" },
      { value: "Preciso de ajuda de um mentor financeiro",              key: "mentor" },
      { value: "Não sei se tenho lucro ou prejuízo",                    key: "lucroPrejuizo" },
      { value: "Quero que a gestão funcione sem depender só de mim",    key: "semDepender" },
      { value: "Registro tudo, mas não entendo os números",            key: "entenderNumeros" },
    ],
  },
  {
    id: "ramo",
    type: "question",
    options: [
      { value: "Comércio",   key: "comercio",  icon: <Store size={16} /> },
      { value: "E-commerce", key: "ecommerce", icon: <ShoppingCart size={16} /> },
      { value: "Indústria",  key: "industria", icon: <Building2 size={16} /> },
      { value: "Serviço",    key: "servico",   icon: <Settings size={16} /> },
    ],
  },
  { id: "boas_vindas", type: "info" },
];

function IllustrationInfo({ dark }: { dark: boolean }) {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="60" r="56" fill={dark ? "rgba(21,101,192,0.12)" : "#eff6ff"} />
      <rect x="34" y="28" width="38" height="50" rx="5" fill="#1565c0" opacity="0.15" />
      <rect x="38" y="32" width="30" height="4" rx="2" fill="#1565c0" opacity="0.4" />
      <rect x="38" y="40" width="22" height="3" rx="1.5" fill="#1565c0" opacity="0.3" />
      <rect x="38" y="47" width="26" height="3" rx="1.5" fill="#1565c0" opacity="0.3" />
      <rect x="38" y="54" width="18" height="3" rx="1.5" fill="#1565c0" opacity="0.3" />
      <circle cx="78" cy="72" r="18" fill="#1565c0" opacity="0.12" />
      <circle cx="78" cy="72" r="11" fill="#1565c0" opacity="0.2" />
      <path d="M73 72l3.5 3.5 7-7" stroke="#1565c0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export type OnboardingAnswers = Record<string, string[]>;

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
  onComplete?: (answers: OnboardingAnswers) => void;
}

export default function OnboardingModal({ open, onClose, onComplete }: OnboardingModalProps) {
  const tr = useTranslations("onboarding");
  const [step, setStep]           = useState(0);
  const [answers, setAnswers]     = useState<Record<string, string[]>>({});
  const [selected, setSelected]   = useState<string[]>([]);
  const [visible, setVisible]     = useState(false);
  const [animating, setAnimating] = useState(false);

  // Lê o tema direto do atributo — sem hook, sem re-render extra
  const dark = typeof document !== "undefined"
    ? document.documentElement.getAttribute("data-theme") === "dark"
    : false;

  useEffect(() => {
    if (open) setTimeout(() => setVisible(true), 10);
    else setVisible(false);
  }, [open]);

  if (!open) return null;

  const current   = STEPS[step];
  const isLast    = step === STEPS.length - 1;
  const progress  = (step / (STEPS.length - 1)) * 100;
  const hasAnswer = selected.length > 0 || current.type === "info";

  const toggleOption = (value: string) => {
    if (current.multi) {
      setSelected((prev) =>
        prev.includes(value) ? prev.filter((l) => l !== value) : [...prev, value]
      );
    } else {
      setSelected([value]);
    }
  };

  const goNext = () => {
    if (animating) return;
    if (current.type === "question") setAnswers((prev) => ({ ...prev, [current.id]: selected }));
    if (isLast) {
      setVisible(false);
      setTimeout(() => {
        onComplete?.(answers);
        onClose();
      }, 300);
      return;
    }
    setAnimating(true);
    setTimeout(() => { setStep((s) => s + 1); setSelected([]); setAnimating(false); }, 220);
  };

  const goBack = () => {
    if (step === 0 || animating) return;
    setAnimating(true);
    setTimeout(() => { setStep((s) => s - 1); setSelected(answers[STEPS[step - 1].id] ?? []); setAnimating(false); }, 220);
  };

  // ── Tokens de cor baseados no tema ──────────────────────────────────────────
  const t = dark ? {
    overlay:       "rgba(0, 0, 0, 0.7)",
    modal:         "#1c2230",
    border:        "#2a3548",
    text:          "#e2e8f0",
    text2:         "#8899b4",
    text3:         "#828fac", // WCAG AA: contraste ~4.95:1 sobre modal escuro #1c2230 (era #4a5568, ~2.11:1)
    optionBg:      "#1c2230",
    optionHoverBg: "#1e2a3a",
    optionHoverBorder: "#42a5f5",
    optionSelBg:   "rgba(21,101,192,0.2)",
    optionSelBorder: "#1565c0",
    optionSelText: "#60a5fa",
    iconBg:        "#243040",
    iconColor:     "#8899b4",
    iconSelBg:     "#1565c0",
    checkBorder:   "#4a5568",
    progressTrack: "#2a3548",
    closeBg:       "#243040",
    closeColor:    "#8899b4",
    ghostBorder:   "#2a3548",
    ghostColor:    "#8899b4",
    ghostHoverBorder: "#4a5568",
    ghostHoverColor:  "#e2e8f0",
    skipColor:     "#828fac", // WCAG AA: contraste ~4.95:1 sobre modal escuro #1c2230 (era #4a5568, ~2.11:1)
    scrollThumb:   "#2a3548",
    shadow:        "0 32px 80px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.3)",
  } : {
    overlay:       "rgba(10, 22, 40, 0.6)",
    modal:         "#ffffff",
    border:        "#e8eef8",
    text:          "#0d2247",
    text2:         "#64748b",
    text3:         "#64748b", // WCAG AA: contraste ~4.76:1 sobre modal claro #ffffff (era #94a3b8, ~2.56:1)
    optionBg:      "#ffffff",
    optionHoverBg: "#f0f8ff",
    optionHoverBorder: "#42a5f5",
    optionSelBg:   "#eff6ff",
    optionSelBorder: "#1565c0",
    optionSelText: "#1565c0",
    iconBg:        "#f1f5fb",
    iconColor:     "#64748b",
    iconSelBg:     "#1565c0",
    checkBorder:   "#cbd5e1",
    progressTrack: "#e8eef8",
    closeBg:       "#f1f5fb",
    closeColor:    "#64748b",
    ghostBorder:   "#e8eef8",
    ghostColor:    "#64748b",
    ghostHoverBorder: "#94a3b8",
    ghostHoverColor:  "#1e293b",
    skipColor:     "#64748b", // WCAG AA: contraste ~4.76:1 sobre modal claro #ffffff (era #94a3b8, ~2.56:1)
    scrollThumb:   "#d0daf0",
    shadow:        "0 32px 80px rgba(10,22,40,0.25), 0 8px 24px rgba(10,22,40,0.12)",
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap');

        .ob-overlay {
          backdrop-filter: blur(4px);
          transition: opacity 0.3s ease;
        }
        .ob-overlay.visible { opacity: 1; }
        .ob-overlay.hidden  { opacity: 0; }

        .ob-modal {
          font-family: 'Sora', sans-serif;
          border-radius: 20px;
          transition: opacity 0.3s ease, transform 0.3s cubic-bezier(.22,.68,0,1.2);
          width: min(520px, calc(100vw - 32px));
          max-height: calc(100vh - 64px);
          overflow-y: auto;
        }
        .ob-modal.visible { opacity: 1; transform: translateY(0) scale(1); }
        .ob-modal.hidden  { opacity: 0; transform: translateY(24px) scale(0.97); }
        .ob-modal-anim { opacity: 0; animation: obSlide 0.3s ease forwards; }
        @keyframes obSlide {
          from { opacity: 0; transform: translateX(12px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        .ob-option {
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          width: 100%;
          text-align: left;
          font-family: 'Sora', sans-serif;
          font-size: 14px;
        }
        .ob-check {
          margin-left: auto;
          width: 20px; height: 20px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          transition: all 0.15s;
        }
        .ob-progress-track {
          border-radius: 999px;
          height: 4px;
          overflow: hidden;
        }
        .ob-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #1565c0, #42a5f5);
          border-radius: 999px;
          transition: width 0.4s cubic-bezier(.22,.68,0,1.2);
        }
        .ob-btn-primary {
          background: linear-gradient(135deg, #1565c0, #0d47a1);
          color: #fff;
          border: none;
          border-radius: 12px;
          padding: 12px 24px;
          font-family: 'Sora', sans-serif;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          display: flex; align-items: center; gap: 6px;
          transition: all 0.2s ease;
        }
        .ob-btn-primary:hover:not(:disabled) {
          box-shadow: 0 8px 24px rgba(21,101,192,0.4);
          transform: translateY(-1px);
        }
        .ob-btn-primary:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
        .ob-step-dots { display: flex; gap: 6px; align-items: center; }
        .ob-dot {
          width: 6px; height: 6px; border-radius: 50%;
          transition: all 0.3s ease;
        }
        .ob-dot.active { width: 20px; border-radius: 3px; background: #1565c0 !important; }
        .ob-dot.done   { background: #42a5f5 !important; }
      `}</style>

      {/* Overlay */}
      <div
        className={`ob-overlay fixed inset-0 z-990 flex items-center justify-center p-4 ${visible ? "visible" : "hidden"}`}
        style={{ background: t.overlay }}
        onClick={(e) => { if (e.target === e.currentTarget) { setVisible(false); setTimeout(onClose, 300); } }}
      >
        {/* Modal */}
        <div
          className={`ob-modal ${visible ? "visible" : "hidden"}`}
          style={{ background: t.modal, boxShadow: t.shadow }}
        >
          {/* Header */}
          <div style={{ padding: "20px 24px 0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div className="ob-step-dots">
                {STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`ob-dot ${i === step ? "active" : i < step ? "done" : ""}`}
                    style={{ background: i >= step && i !== step ? t.progressTrack : undefined }}
                  />
                ))}
              </div>
              <button
                onClick={() => { setVisible(false); setTimeout(onClose, 300); }}
                aria-label={tr("close")}
                style={{ background: t.closeBg, border: "none", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: t.closeColor }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="ob-progress-track" style={{ background: t.progressTrack }}>
              <div className="ob-progress-fill" style={{ width: `${progress}%` }} />
            </div>

            <p style={{ fontSize: 11, color: t.text3, marginTop: 8, fontFamily: "Sora, sans-serif" }}>
              {tr("stepOf", { current: step + 1, total: STEPS.length })}
            </p>
          </div>

          {/* Body */}
          <div key={step} className={animating ? "" : "ob-modal-anim"} style={{ padding: "20px 24px 24px" }}>
            {current.type === "info" ? (
              <div style={{ textAlign: "center", paddingTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                  <IllustrationInfo dark={dark} />
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: t.text, margin: "0 0 12px", fontFamily: "Sora, sans-serif" }}>
                  {tr("steps.boas_vindas.title")}
                </h2>
                <p style={{ fontSize: 14, color: t.text2, lineHeight: 1.6, margin: "0 0 28px", fontFamily: "Sora, sans-serif" }}>
                  {tr("steps.boas_vindas.description")}
                </p>
              </div>
            ) : (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: t.text, margin: "0 0 4px", fontFamily: "Sora, sans-serif", lineHeight: 1.3 }}>
                  {tr(`steps.${current.id}.title`)}
                </h2>
                <p style={{ fontSize: 12, color: t.text3, margin: "0 0 16px", fontFamily: "Sora, sans-serif" }}>
                  {tr(`steps.${current.id}.subtitle`)}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {current.options?.map((opt) => {
                    const isSel = selected.includes(opt.value);
                    const label = tr(`steps.${current.id}.options.${opt.key}`);
                    return (
                      <button
                        key={opt.key}
                        className="ob-option"
                        style={{
                          border: `1.5px solid ${isSel ? t.optionSelBorder : t.border}`,
                          background: isSel ? t.optionSelBg : t.optionBg,
                          color: isSel ? t.optionSelText : t.text,
                          fontWeight: isSel ? 600 : 400,
                        }}
                        onMouseEnter={(e) => {
                          if (!isSel) {
                            e.currentTarget.style.borderColor = t.optionHoverBorder;
                            e.currentTarget.style.background  = t.optionHoverBg;
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSel) {
                            e.currentTarget.style.borderColor = t.border;
                            e.currentTarget.style.background  = t.optionBg;
                          }
                        }}
                        onClick={() => toggleOption(opt.value)}
                      >
                        {opt.icon && (
                          <span style={{
                            width: 32, height: 32, borderRadius: 8,
                            background: isSel ? t.iconSelBg : t.iconBg,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0,
                            color: isSel ? "#fff" : t.iconColor,
                            transition: "all 0.15s",
                          }}>
                            {opt.icon}
                          </span>
                        )}
                        <span style={{ flex: 1 }}>{label}</span>
                        <span style={{
                          marginLeft: "auto",
                          width: 20, height: 20, borderRadius: "50%",
                          border: `1.5px solid ${isSel ? "#1565c0" : t.checkBorder}`,
                          background: isSel ? "#1565c0" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0, transition: "all 0.15s",
                        }}>
                          {isSel && <Check size={11} color="#fff" strokeWidth={3} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {current.id === "ramo" && selected.includes("Serviço") && (
                  <div style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: dark ? "rgba(245, 158, 11, 0.1)" : "#fef3c7",
                    border: `1px solid ${dark ? "rgba(245, 158, 11, 0.2)" : "#fde68a"}`,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                  }}>
                    <span style={{ color: "#d97706", fontSize: 16, lineHeight: 1 }}>⚠️</span>
                    <p style={{ margin: 0, fontSize: 11, color: dark ? "#fbbf24" : "#b45309", lineHeight: 1.4, fontFamily: "Sora, sans-serif" }}>
                      {tr.rich("serviceWarning", { b: (c) => <strong>{c}</strong> })}
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Footer */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24, gap: 12 }}>
              {step > 0 ? (
                <button
                  onClick={goBack}
                  style={{
                    background: "none",
                    border: `1.5px solid ${t.ghostBorder}`,
                    borderRadius: 12, padding: "12px 20px",
                    fontFamily: "Sora, sans-serif", fontSize: 14,
                    color: t.ghostColor, cursor: "pointer", transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = t.ghostHoverBorder; e.currentTarget.style.color = t.ghostHoverColor; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = t.ghostBorder; e.currentTarget.style.color = t.ghostColor; }}
                >
                  {tr("back")}
                </button>
              ) : (
                <div />
              )}

              <button className="ob-btn-primary" onClick={goNext} disabled={!hasAnswer}>
                {isLast ? <><span>{tr("goToDashboard")}</span> <ArrowRight size={15} /></> : <><span>{tr("next")}</span> <ChevronRight size={15} /></>}
              </button>
            </div>

            {!isLast && (
              <div style={{ textAlign: "center", marginTop: 12 }}>
                <button
                  onClick={() => { setVisible(false); setTimeout(onClose, 300); }}
                  style={{ background: "none", border: "none", fontSize: 12, color: t.skipColor, cursor: "pointer", fontFamily: "Sora, sans-serif" }}
                >
                  {tr("skip")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}