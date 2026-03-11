"use client";

// components/OnboardingModal.tsx
// ─── Modal de onboarding em múltiplas etapas ──────────────────────────────────
// Uso:
//   import OnboardingModal from "@/components/OnboardingModal";
//   const [showOnboarding, setShowOnboarding] = useState(true);
//   <OnboardingModal open={showOnboarding} onClose={() => setShowOnboarding(false)} />

import { useState, useEffect } from "react";
import {
  X, ChevronRight, Check, Building2, TrendingUp,
  Lightbulb, Store, Settings, Users, BarChart3,
  Briefcase, ArrowRight, Sparkles,
} from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Step {
  id: string;
  type: "question" | "info";
  title: string;
  subtitle?: string;
  description?: string;
  icon?: React.ReactNode;
  options?: { label: string; icon?: React.ReactNode }[];
  multi?: boolean; // permite múltipla escolha
}

// ─── Etapas do onboarding ─────────────────────────────────────────────────────

const STEPS: Step[] = [
  {
    id: "cargo",
    type: "question",
    title: "Qual o seu cargo na empresa?",
    subtitle: "Selecione uma opção:",
    options: [
      { label: "Funcionário",                  icon: <Users size={16} /> },
      { label: "Dono / Sócio",                 icon: <Briefcase size={16} /> },
      { label: "Terceiro (Consultor, BPO…)",   icon: <Settings size={16} /> },
      { label: "Outros",                        icon: <Sparkles size={16} /> },
    ],
  },
  {
    id: "faturamento",
    type: "question",
    title: "Qual é o faturamento mensal médio da sua empresa?",
    subtitle: "Selecione uma opção:",
    options: [
      { label: "Até R$ 7 mil" },
      { label: "De R$ 7 mil a R$ 30 mil" },
      { label: "De R$ 30 mil a R$ 200 mil" },
      { label: "Acima de R$ 200 mil" },
    ],
  },
  {
    id: "desafio",
    type: "question",
    title: "Qual é o seu maior desafio com a gestão financeira?",
    subtitle: "Selecione uma opção:",
    options: [
      { label: "Tenho os dados, mas não sei como decidir" },
      { label: "Não sei por onde começar" },
      { label: "Preciso de ajuda de um mentor financeiro" },
      { label: "Não sei se tenho lucro ou prejuízo" },
      { label: "Quero que a gestão funcione sem depender só de mim" },
      { label: "Registro tudo, mas não entendo os números" },
    ],
  },
  {
    id: "ramo",
    type: "question",
    title: "Definindo seu ramo de atuação",
    subtitle: "Qual área representa a maior parte da operação do seu negócio?",
    options: [
      { label: "Comércio",  icon: <Store size={16} /> },
      { label: "Serviço",   icon: <Settings size={16} /> },
      { label: "Indústria", icon: <Building2 size={16} /> },
    ],
  },
  {
    id: "boas_vindas",
    type: "info",
    title: "Tudo pronto! 🎉",
    icon: <BarChart3 size={48} strokeWidth={1.5} className="text-blue-500" />,
    description:
      "Seu perfil foi configurado. Agora o NexusFi vai personalizar relatórios, metas e insights financeiros de acordo com o seu negócio. Vamos começar?",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Ícone SVG de "pessoa com documento" para etapas de info
function IllustrationInfo() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="60" r="56" fill="#eff6ff" />
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

// ─── Componente principal ─────────────────────────────────────────────────────

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
}

export default function OnboardingModal({ open, onClose }: OnboardingModalProps) {
  const [step, setStep]         = useState(0);
  const [answers, setAnswers]   = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [visible, setVisible]   = useState(false);
  const [animating, setAnimating] = useState(false);

  // controla animação de entrada/saída
  useEffect(() => {
    if (open) {
      setTimeout(() => setVisible(true), 10);
    } else {
      setVisible(false);
    }
  }, [open]);

  if (!open) return null;

  const current    = STEPS[step];
  const isLast     = step === STEPS.length - 1;
  const progress   = ((step) / (STEPS.length - 1)) * 100;
  const hasAnswer  = selected.length > 0 || current.type === "info";

  const toggleOption = (label: string) => {
    if (current.multi) {
      setSelected((prev) =>
        prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
      );
    } else {
      setSelected([label]);
    }
  };

  const goNext = () => {
    if (animating) return;
    if (current.type === "question") {
      setAnswers((prev) => ({ ...prev, [current.id]: selected }));
    }

    if (isLast) {
      // fecha com animação
      setVisible(false);
      setTimeout(onClose, 300);
      return;
    }

    setAnimating(true);
    setTimeout(() => {
      setStep((s) => s + 1);
      setSelected([]);
      setAnimating(false);
    }, 220);
  };

  const goBack = () => {
    if (step === 0 || animating) return;
    setAnimating(true);
    setTimeout(() => {
      setStep((s) => s - 1);
      setSelected(answers[STEPS[step - 1].id] ?? []);
      setAnimating(false);
    }, 220);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap');

        .ob-overlay {
          background: rgba(10, 22, 40, 0.6);
          backdrop-filter: blur(4px);
          transition: opacity 0.3s ease;
        }
        .ob-overlay.visible { opacity: 1; }
        .ob-overlay.hidden  { opacity: 0; }

        .ob-modal {
          font-family: 'Sora', sans-serif;
          background: #fff;
          border-radius: 20px;
          box-shadow: 0 32px 80px rgba(10,22,40,0.25), 0 8px 24px rgba(10,22,40,0.12);
          transition: opacity 0.3s ease, transform 0.3s cubic-bezier(.22,.68,0,1.2);
          width: min(520px, calc(100vw - 32px));
          max-height: calc(100vh - 64px);
          overflow-y: auto;
        }
        .ob-modal.visible { opacity: 1; transform: translateY(0) scale(1); }
        .ob-modal.hidden  { opacity: 0; transform: translateY(24px) scale(0.97); }
        .ob-modal-anim    { opacity: 0; animation: obSlide 0.3s ease forwards; }
        @keyframes obSlide {
          from { opacity: 0; transform: translateX(12px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        .ob-option {
          border: 1.5px solid #e8eef8;
          border-radius: 12px;
          background: #fff;
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
          color: #1e293b;
        }
        .ob-option:hover {
          border-color: #42a5f5;
          background: #f0f8ff;
        }
        .ob-option.selected {
          border-color: #1565c0;
          background: #eff6ff;
          color: #1565c0;
          font-weight: 600;
        }
        .ob-option .ob-icon {
          width: 32px; height: 32px;
          border-radius: 8px;
          background: #f1f5fb;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          color: #64748b;
          transition: all 0.15s;
        }
        .ob-option.selected .ob-icon {
          background: #1565c0;
          color: #fff;
        }
        .ob-check {
          margin-left: auto;
          width: 20px; height: 20px;
          border-radius: 50%;
          border: 1.5px solid #cbd5e1;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          transition: all 0.15s;
        }
        .ob-option.selected .ob-check {
          background: #1565c0;
          border-color: #1565c0;
        }

        .ob-progress-track {
          background: #e8eef8;
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
        .ob-btn-ghost {
          background: none;
          border: 1.5px solid #e8eef8;
          border-radius: 12px;
          padding: 12px 20px;
          font-family: 'Sora', sans-serif;
          font-size: 14px;
          color: #64748b;
          cursor: pointer;
          transition: all 0.15s;
        }
        .ob-btn-ghost:hover { border-color: #94a3b8; color: #1e293b; }

        .ob-step-dots {
          display: flex; gap: 6px; align-items: center;
        }
        .ob-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #e2e8f0;
          transition: all 0.3s ease;
        }
        .ob-dot.active {
          width: 20px;
          border-radius: 3px;
          background: #1565c0;
        }
        .ob-dot.done { background: #42a5f5; }

        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #d0daf0; border-radius: 4px; }
      `}</style>

      {/* Overlay */}
      <div
        className={`ob-overlay fixed inset-0 z-50 flex items-center justify-center p-4 ${visible ? "visible" : "hidden"}`}
        onClick={(e) => { if (e.target === e.currentTarget) { setVisible(false); setTimeout(onClose, 300); } }}
      >
        {/* Modal */}
        <div className={`ob-modal ${visible ? "visible" : "hidden"}`}>

          {/* Header */}
          <div style={{ padding: "20px 24px 0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              {/* Step dots */}
              <div className="ob-step-dots">
                {STEPS.map((_, i) => (
                  <div key={i} className={`ob-dot ${i === step ? "active" : i < step ? "done" : ""}`} />
                ))}
              </div>

              {/* Close */}
              <button
                onClick={() => { setVisible(false); setTimeout(onClose, 300); }}
                style={{ background: "#f1f5fb", border: "none", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#64748b" }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Progress bar */}
            <div className="ob-progress-track">
              <div className="ob-progress-fill" style={{ width: `${progress}%` }} />
            </div>

            <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 8, fontFamily: "Sora, sans-serif" }}>
              Etapa {step + 1} de {STEPS.length}
            </p>
          </div>

          {/* Body */}
          <div key={step} className={animating ? "" : "ob-modal-anim"} style={{ padding: "20px 24px 24px" }}>

            {current.type === "info" ? (
              /* ── Tela de informação ── */
              <div style={{ textAlign: "center", paddingTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                  <IllustrationInfo />
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0d2247", margin: "0 0 12px", fontFamily: "Sora, sans-serif" }}>
                  {current.title}
                </h2>
                <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, margin: "0 0 28px", fontFamily: "Sora, sans-serif" }}>
                  {current.description}
                </p>
              </div>
            ) : (
              /* ── Pergunta ── */
              <>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0d2247", margin: "0 0 4px", fontFamily: "Sora, sans-serif", lineHeight: 1.3 }}>
                  {current.title}
                </h2>
                {current.subtitle && (
                  <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 16px", fontFamily: "Sora, sans-serif" }}>
                    {current.subtitle}
                  </p>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {current.options?.map((opt) => (
                    <button
                      key={opt.label}
                      className={`ob-option ${selected.includes(opt.label) ? "selected" : ""}`}
                      onClick={() => toggleOption(opt.label)}
                    >
                      {opt.icon && (
                        <span className="ob-icon">{opt.icon}</span>
                      )}
                      <span style={{ flex: 1 }}>{opt.label}</span>
                      <span className="ob-check">
                        {selected.includes(opt.label) && <Check size={11} color="#fff" strokeWidth={3} />}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Footer */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24, gap: 12 }}>
              {step > 0 ? (
                <button className="ob-btn-ghost" onClick={goBack}>
                  Voltar
                </button>
              ) : (
                <div />
              )}

              <button
                className="ob-btn-primary"
                onClick={goNext}
                disabled={!hasAnswer}
              >
                {isLast ? (
                  <>Acessar o painel <ArrowRight size={15} /></>
                ) : (
                  <>Próximo <ChevronRight size={15} /></>
                )}
              </button>
            </div>

            {/* Skip link */}
            {!isLast && (
              <div style={{ textAlign: "center", marginTop: 12 }}>
                <button
                  onClick={() => { setVisible(false); setTimeout(onClose, 300); }}
                  style={{ background: "none", border: "none", fontSize: 12, color: "#94a3b8", cursor: "pointer", fontFamily: "Sora, sans-serif" }}
                >
                  Pular configuração por agora
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}