"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";

export default function FirebaseDebug() {
  const [log, setLog] = useState<{ time: string; type: "info" | "ok" | "error" | "warn"; msg: string }[]>([]);
  const [running, setRunning] = useState(false);

  function add(type: "info" | "ok" | "error" | "warn", msg: string) {
    const time = new Date().toLocaleTimeString("pt-BR", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 } as any);
    setLog((l) => [...l, { time, type, msg }]);
  }

  async function runDiag() {
    setLog([]);
    setRunning(true);

    // ── 1. Env vars ──────────────────────────────────────────────────────────
    add("info", "── Verificando variáveis de ambiente ──");
    const vars = [
      "NEXT_PUBLIC_FIREBASE_API_KEY",
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
      "NEXT_PUBLIC_FIREBASE_APP_ID",
    ] as const;

    let envOk = true;
    for (const v of vars) {
      const val = process.env[v];
      if (!val) {
        add("error", `${v} → AUSENTE ❌`);
        envOk = false;
      } else {
        // Mostra só os primeiros/últimos chars para segurança
        const preview = val.length > 12
          ? `${val.slice(0, 6)}…${val.slice(-4)}`
          : val;
        add("ok", `${v} → ${preview} ✓`);
      }
    }
    if (!envOk) {
      add("error", "Variáveis ausentes — verifique a Vercel e faça redeploy");
      setRunning(false);
      return;
    }

    // ── 2. Import firebase ───────────────────────────────────────────────────
    add("info", "── Importando módulos Firebase ──");
    let getFirebase: any;
    try {
      const mod = await import("../lib/firebase");
      getFirebase = mod.getFirebase;
      add("ok", "import('@/lib/firebase') ✓");
    } catch (e: any) {
      add("error", `import firebase falhou: ${e.message}`);
      setRunning(false);
      return;
    }

    // ── 3. Init app ──────────────────────────────────────────────────────────
    add("info", "── Inicializando Firebase App ──");
    let auth: any;
    try {
      const fb = await getFirebase();
      auth = fb.auth;
      add("ok", `App inicializado — projectId: ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}`);
      add("ok", `Auth domain: ${process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}`);
    } catch (e: any) {
      add("error", `getFirebase() falhou: ${e.message}`);
      setRunning(false);
      return;
    }

    // ── 4. Testar login com email/senha fictícios ─────────────────────────────
    add("info", "── Testando Auth (email/senha) ──");
    try {
      const { signInWithEmailAndPassword } = await import("firebase/auth");
      await signInWithEmailAndPassword(auth, "debug-test-404@nexusfi.dev", "wrongpassword123");
      add("warn", "Login retornou sucesso inesperadamente");
    } catch (e: any) {
      const code: string = e.code ?? "sem-codigo";
      if (code === "auth/user-not-found" || code === "auth/invalid-credential" || code === "auth/wrong-password") {
        add("ok", `Auth funcionando — erro esperado: ${code} ✓`);
      } else if (code === "auth/operation-not-allowed") {
        add("error", `${code} → Email/senha NÃO está habilitado no Firebase Console ❌`);
        add("error", "Vá em: Authentication → Sign-in method → Email/senha → Ativar");
      } else if (code === "auth/configuration-not-found") {
        add("error", `${code} → Configuração do Firebase inválida ❌`);
        add("error", "As env vars podem estar apontando para o projeto errado");
      } else if (code === "auth/network-request-failed") {
        add("error", `${code} → Falha de rede — verifique o CSP/firewall ❌`);
      } else if (code === "auth/api-key-not-valid") {
        add("error", `${code} → API Key inválida ❌ — verifique NEXT_PUBLIC_FIREBASE_API_KEY`);
      } else {
        add("error", `Código inesperado: ${code}`);
        add("warn", `Mensagem completa: ${e.message}`);
      }
    }

    // ── 5. Testar Firestore ──────────────────────────────────────────────────
    add("info", "── Testando Firestore ──");
    try {
      const { getFirebase: gf } = await import("../lib/firebase");
      const { db } = await gf();
      const { doc, getDoc } = await import("firebase/firestore");
      await getDoc(doc(db, "_debug_", "ping"));
      add("ok", "Firestore acessível ✓");
    } catch (e: any) {
      const code = e.code ?? "";
      if (code === "permission-denied") {
        add("ok", "Firestore acessível (permission-denied = regras ok, sem auth) ✓");
      } else if (code.includes("unavailable") || code.includes("failed")) {
        add("error", `Firestore indisponível: ${code}`);
      } else {
        add("warn", `Firestore: ${code} — ${e.message}`);
      }
    }

    // ── 6. Domínio atual ─────────────────────────────────────────────────────
    add("info", "── Informações do ambiente ──");
    add("info", `Domínio atual: ${window.location.hostname}`);
    add("info", `URL completa: ${window.location.href}`);
    add("warn", `Verifique se "${window.location.hostname}" está em Firebase → Authentication → Authorized domains`);

    add("info", "── Diagnóstico concluído ──");
    setRunning(false);
  }

  const colors = {
    info:  { bg: "#1e293b", text: "#94a3b8", prefix: "·" },
    ok:    { bg: "#052e16", text: "#4ade80", prefix: "✓" },
    error: { bg: "#2d0a0a", text: "#f87171", prefix: "✗" },
    warn:  { bg: "#1c1408", text: "#fbbf24", prefix: "⚠" },
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0f172a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      fontFamily: "monospace",
    }}>
      <div style={{ width: "100%", maxWidth: 680 }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: "linear-gradient(135deg,#1565c0,#42a5f5)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 800, color: "white",
            }}>N</div>
            <span style={{ color: "white", fontWeight: 700, fontSize: 16 }}>
              NexusFi <span style={{ color: "#42a5f5" }}>Firebase Debugger</span>
            </span>
          </div>
          <p style={{ color: "#64748b", fontSize: 12, margin: 0 }}>
            Diagnostica env vars, Auth e Firestore em tempo real
          </p>
        </div>

        {/* Terminal */}
        <div style={{
          background: "#0a0f1a",
          border: "1px solid #1e293b",
          borderRadius: 14,
          overflow: "hidden",
          marginBottom: 16,
        }}>
          {/* Barra do terminal */}
          <div style={{
            background: "#111827",
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderBottom: "1px solid #1e293b",
          }}>
            {["#ef4444","#f59e0b","#22c55e"].map(c => (
              <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />
            ))}
            <span style={{ color: "#475569", fontSize: 11, marginLeft: 8 }}>firebase-debug — bash</span>
          </div>

          {/* Output */}
          <div style={{ padding: "16px", minHeight: 240, maxHeight: 480, overflowY: "auto" }}>
            {log.length === 0 && (
              <p style={{ color: "#334155", fontSize: 12, margin: 0 }}>
                $ Clique em "Rodar diagnóstico" para iniciar...
              </p>
            )}
            {log.map((l, i) => (
              <div key={i} style={{
                display: "flex",
                gap: 10,
                padding: "3px 8px",
                borderRadius: 4,
                marginBottom: 2,
                background: colors[l.type].bg,
              }}>
                <span style={{ color: "#475569", fontSize: 10, flexShrink: 0, paddingTop: 1 }}>{l.time}</span>
                <span style={{ color: colors[l.type].text, fontSize: 11, flexShrink: 0 }}>{colors[l.type].prefix}</span>
                <span style={{ color: colors[l.type].text, fontSize: 11, wordBreak: "break-all" }}>{l.msg}</span>
              </div>
            ))}
            {running && (
              <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 8px" }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: "#42a5f5",
                  animation: "pulse 1s ease-in-out infinite",
                }} />
                <span style={{ color: "#42a5f5", fontSize: 11 }}>executando...</span>
              </div>
            )}
          </div>
        </div>

        {/* Botão */}
        <button
          onClick={runDiag}
          disabled={running}
          style={{
            width: "100%",
            padding: "14px",
            background: running ? "#1e293b" : "linear-gradient(135deg,#1565c0,#1976d2)",
            color: running ? "#475569" : "white",
            border: "none",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 700,
            cursor: running ? "not-allowed" : "pointer",
            fontFamily: "monospace",
            transition: "all .2s",
          }}
        >
          {running ? "⏳ Rodando diagnóstico..." : "▶ Rodar diagnóstico"}
        </button>

        <p style={{ color: "#1e293b", fontSize: 11, textAlign: "center", marginTop: 12 }}>
          Remova esta página após o debug • app/debug/page.tsx
        </p>
      </div>

      <style>{`
        @keyframes pulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:.4; transform:scale(.8); }
        }
      `}</style>
    </div>
  );
}