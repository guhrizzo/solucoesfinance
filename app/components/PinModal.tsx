"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Shield, Lock, AlertTriangle, X } from "lucide-react";
import { getPinLockStatus, usePinState } from "../hooks/usePin";

interface PinModalProps {
    open: boolean;
    title?: string;
    subtitle?: string;
    onClose: () => void;
    onSuccess: (pin: string) => void;
    /** Se true, não verifica o PIN — apenas coleta 4 dígitos (usado para cadastro) */
    collectOnly?: boolean;
}

export default function PinModal({
    open,
    title = "Digite seu PIN",
    subtitle = "Insira os 4 dígitos para confirmar",
    onClose,
    onSuccess,
    collectOnly = false,
}: PinModalProps) {
    const [digits, setDigits] = useState(["", "", "", ""]);
    const [error, setError] = useState("");
    const [shake, setShake] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const refs = [
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
    ];
    const { lockStatus, refresh } = usePinState();

    // Reset ao abrir
    useEffect(() => {
        if (!open) return;
        setDigits(["", "", "", ""]);
        setError("");
        setShake(false);
        // Foca o primeiro campo após animação
        setTimeout(() => refs[0].current?.focus(), 120);
    }, [open]);

    // Contador de bloqueio
    useEffect(() => {
        if (!lockStatus.locked) { setCountdown(0); return; }
        setCountdown(Math.ceil(lockStatus.remainingMs / 1000));
        const interval = setInterval(() => {
            const { locked, remainingMs } = getPinLockStatus();
            if (!locked) { setCountdown(0); refresh(); clearInterval(interval); return; }
            setCountdown(Math.ceil(remainingMs / 1000));
        }, 1000);
        return () => clearInterval(interval);
    }, [lockStatus.locked]);

    const handleDigitChange = useCallback((index: number, value: string) => {
        if (!/^\d*$/.test(value)) return;
        const v = value.slice(-1); // Aceita só o último dígito
        const next = [...digits];
        next[index] = v;
        setDigits(next);
        setError("");

        if (v && index < 3) {
            refs[index + 1].current?.focus();
        }

        // Quando completar os 4 dígitos
        if (v && index === 3) {
            const pin = [...next].join("");
            if (pin.length === 4) {
                if (collectOnly) {
                    onSuccess(pin);
                }
                // Se não for collectOnly, o pai precisa chamar onSuccess com verificação
            }
        }
    }, [digits, collectOnly, onSuccess]);

    const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Backspace" && !digits[index] && index > 0) {
            refs[index - 1].current?.focus();
        }
        if (e.key === "Enter") {
            const pin = digits.join("");
            if (pin.length === 4) handleSubmit(pin);
        }
    }, [digits]);

    const handleSubmit = useCallback((pinOverride?: string) => {
        const pin = pinOverride ?? digits.join("");
        if (pin.length < 4) { setError("Digite os 4 dígitos"); return; }
        onSuccess(pin);
    }, [digits, onSuccess]);

    const triggerShake = useCallback((msg: string) => {
        setError(msg);
        setShake(true);
        setDigits(["", "", "", ""]);
        setTimeout(() => {
            setShake(false);
            refs[0].current?.focus();
        }, 500);
    }, []);

    // Expõe o triggerShake para o pai via ref não — usamos um padrão de callback aqui
    // O pai chama onSuccess e se der errado chama de volta um setter
    useEffect(() => {
        // Expõe globalmente para que o pai possa chamar
        (window as any).__pinModalShake = triggerShake;
        return () => { delete (window as any).__pinModalShake; };
    }, [triggerShake]);

    if (!open) return null;

    const pin = digits.join("");
    const isLocked = lockStatus.locked || countdown > 0;
    const minutes = Math.floor(countdown / 60);
    const seconds = countdown % 60;

    return (
        <div
            className="fixed inset-0 z-[1100] flex items-center justify-center p-4"
            style={{ background: "rgba(13,17,23,0.7)", backdropFilter: "blur(12px)" }}
        >
            <div
                className="w-full max-w-xs rounded-2xl overflow-hidden"
                style={{
                    background: "var(--cf-card)",
                    boxShadow: "0 32px 64px rgba(0,0,0,0.3)",
                    animation: "slideUp .3s cubic-bezier(.34,.1,.64,.88)",
                    border: "1px solid var(--cf-border)",
                }}
            >
                {/* Header */}
                <div className="px-5 pt-5 pb-4 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: "linear-gradient(135deg, var(--brand), var(--brand))" }}
                        >
                            {isLocked ? <Lock size={18} color="white" /> : <Shield size={18} color="white" />}
                        </div>
                        <div>
                            <p className="font-bold text-sm" style={{ color: "var(--cf-text)" }}>{title}</p>
                            <p className="text-xs mt-0.5" style={{ color: "var(--cf-text-2)" }}>{subtitle}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg cursor-pointer"
                        style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}
                        aria-label="Fechar"
                    >
                        <X size={15} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-5 pb-6">
                    {/* Bloqueado */}
                    {isLocked ? (
                        <div
                            className="rounded-xl p-4 text-center"
                            style={{ background: "var(--neg-weak)", border: "1px solid var(--neg-weak)" }}
                        >
                            <Lock size={24} className="mx-auto mb-2" style={{ color: "var(--neg)" }} />
                            <p className="text-sm font-bold" style={{ color: "var(--neg)" }}>PIN bloqueado</p>
                            <p className="text-xs mt-1" style={{ color: "var(--neg)" }}>
                                Muitas tentativas incorretas. Aguarde{" "}
                                <strong>{minutes > 0 ? `${minutes}m ` : ""}{String(seconds).padStart(2, "0")}s</strong>
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* 4 inputs de dígito */}
                            <div
                                className="flex justify-center gap-3 mb-4"
                                style={{ animation: shake ? "pinShake .4s ease" : undefined }}
                            >
                                {digits.map((d, i) => (
                                    <input
                                        key={i}
                                        ref={refs[i]}
                                        type="password"
                                        inputMode="numeric"
                                        maxLength={1}
                                        value={d}
                                        onChange={e => handleDigitChange(i, e.target.value)}
                                        onKeyDown={e => handleKeyDown(i, e)}
                                        className="w-14 h-14 text-center text-2xl font-bold rounded-xl outline-none"
                                        style={{
                                            background: "var(--cf-input)",
                                            border: `2px solid ${d ? "var(--brand)" : "var(--cf-border)"}`,
                                            color: "var(--cf-text)",
                                            fontSize: d ? "28px" : "14px",
                                            transition: "border-color .15s",
                                        }}
                                        placeholder="·"
                                    />
                                ))}
                            </div>

                            {/* Erro */}
                            {error && (
                                <div
                                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 mb-3 text-xs"
                                    style={{ background: "var(--neg-weak)", color: "var(--neg)", border: "1px solid var(--neg-weak)" }}
                                >
                                    <AlertTriangle size={13} />
                                    {error}
                                </div>
                            )}

                            {/* Botão confirmar */}
                            <button
                                onClick={() => handleSubmit()}
                                disabled={pin.length < 4}
                                className="w-full py-3 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                style={{
                                    background: "linear-gradient(135deg, var(--brand), var(--brand))",
                                    color: "white",
                                    boxShadow: pin.length === 4 ? "0 4px 16px rgba(59,130,246,0.4)" : "none",
                                }}
                            >
                                Confirmar
                            </button>
                        </>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes pinShake {
                    0%,100% { transform: translateX(0); }
                    20% { transform: translateX(-8px); }
                    40% { transform: translateX(8px); }
                    60% { transform: translateX(-6px); }
                    80% { transform: translateX(6px); }
                }
            `}</style>
        </div>
    );
}
