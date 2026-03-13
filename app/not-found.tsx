"use client";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 overflow-hidden relative">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap');

        * { font-family: 'Sora', sans-serif; box-sizing: border-box; margin: 0; padding: 0; }
        .mono { font-family: 'JetBrains Mono', monospace; }

        body { background: #060e1e; }

        .bg-scene {
          position: fixed;
          inset: 0;
          background: #060e1e;
          z-index: 0;
          overflow: hidden;
        }

        /* Grid de linhas */
        .grid-lines {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(66,165,245,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(66,165,245,0.04) 1px, transparent 1px);
          background-size: 48px 48px;
          animation: gridDrift 20s linear infinite;
        }
        @keyframes gridDrift {
          from { transform: translateY(0); }
          to   { transform: translateY(48px); }
        }

        /* Bolas de luz */
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          animation: orbPulse 6s ease-in-out infinite alternate;
        }
        .orb-1 {
          width: 400px; height: 400px;
          background: rgba(21,101,192,0.25);
          top: -100px; left: -100px;
          animation-delay: 0s;
        }
        .orb-2 {
          width: 300px; height: 300px;
          background: rgba(66,165,245,0.15);
          bottom: -80px; right: -80px;
          animation-delay: -3s;
        }
        .orb-3 {
          width: 200px; height: 200px;
          background: rgba(14,51,114,0.4);
          top: 40%; left: 50%;
          transform: translate(-50%,-50%);
          animation-delay: -1.5s;
        }
        @keyframes orbPulse {
          from { opacity: 0.6; transform: scale(1); }
          to   { opacity: 1;   transform: scale(1.15); }
        }

        /* Partículas flutuantes */
        .particles {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .particle {
          position: absolute;
          width: 2px; height: 2px;
          background: rgba(66,165,245,0.6);
          border-radius: 50%;
          animation: floatUp linear infinite;
        }
        @keyframes floatUp {
          0%   { opacity: 0; transform: translateY(0) translateX(0); }
          10%  { opacity: 1; }
          90%  { opacity: 0.5; }
          100% { opacity: 0; transform: translateY(-100vh) translateX(20px); }
        }

        /* Conteúdo */
        .content {
          position: relative;
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 0;
          animation: fadeUp .8s cubic-bezier(.22,.68,0,1.2) both;
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(32px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* 404 gigante */
        .big-404 {
          font-size: clamp(120px, 22vw, 220px);
          font-weight: 800;
          line-height: 1;
          letter-spacing: -4px;
          background: linear-gradient(135deg, #1565c0 0%, #42a5f5 50%, #0d2247 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          position: relative;
          animation: fadeUp .6s .1s both;
          filter: drop-shadow(0 0 40px rgba(66,165,245,0.3));
        }
        .big-404::after {
          content: '404';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(21,101,192,0.2), rgba(66,165,245,0.1));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          filter: blur(12px);
          z-index: -1;
        }

        /* Linha divisória */
        .divider {
          width: 80px;
          height: 2px;
          background: linear-gradient(90deg, transparent, #42a5f5, transparent);
          margin: 16px 0 24px;
          animation: fadeUp .6s .25s both;
        }

        /* Badge de status */
        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(66,165,245,0.08);
          border: 1px solid rgba(66,165,245,0.2);
          border-radius: 100px;
          padding: 6px 16px 6px 10px;
          margin-bottom: 20px;
          animation: fadeUp .6s .2s both;
        }
        .status-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #42a5f5;
          box-shadow: 0 0 8px #42a5f5;
          animation: blink 2s ease-in-out infinite;
        }
        @keyframes blink {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.3; }
        }
        .status-text {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #42a5f5;
        }

        /* Título */
        .title {
          font-size: clamp(20px, 4vw, 28px);
          font-weight: 700;
          color: #e8f0fe;
          margin-bottom: 12px;
          animation: fadeUp .6s .3s both;
        }

        /* Subtítulo */
        .subtitle {
          font-size: 14px;
          color: rgba(148,163,184,0.8);
          max-width: 360px;
          line-height: 1.7;
          margin-bottom: 36px;
          animation: fadeUp .6s .35s both;
        }

        /* Botões */
        .btn-group {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: center;
          animation: fadeUp .6s .45s both;
        }

        .btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 24px;
          background: linear-gradient(135deg, #1565c0, #1976d2);
          color: white;
          font-size: 14px;
          font-weight: 700;
          border-radius: 12px;
          text-decoration: none;
          border: none;
          cursor: pointer;
          transition: all .2s;
          box-shadow: 0 8px 24px rgba(21,101,192,0.4);
        }
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 32px rgba(21,101,192,0.55);
          background: linear-gradient(135deg, #1976d2, #1e88e5);
        }

        .btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 24px;
          background: rgba(255,255,255,0.04);
          color: rgba(148,163,184,0.9);
          font-size: 14px;
          font-weight: 600;
          border-radius: 12px;
          text-decoration: none;
          border: 1px solid rgba(255,255,255,0.08);
          cursor: pointer;
          transition: all .2s;
        }
        .btn-secondary:hover {
          background: rgba(255,255,255,0.08);
          color: #e8f0fe;
          border-color: rgba(66,165,245,0.3);
          transform: translateY(-2px);
        }

        /* Code snippet */
        .code-hint {
          margin-top: 40px;
          padding: 12px 20px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 10px;
          animation: fadeUp .6s .55s both;
        }
        .code-hint p {
          font-size: 11px;
          color: rgba(100,116,139,0.8);
          margin-bottom: 4px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .code-hint code {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          color: #42a5f5;
        }

        /* Logo */
        .logo {
          position: fixed;
          top: 24px;
          left: 28px;
          z-index: 20;
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          animation: fadeUp .5s .05s both;
        }
        .logo-icon {
          width: 36px; height: 36px;
          background: linear-gradient(135deg, #1565c0, #42a5f5);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 800;
          color: white;
          box-shadow: 0 4px 16px rgba(21,101,192,0.4);
        }
        .logo-name {
          font-size: 16px;
          font-weight: 700;
          color: white;
        }
        .logo-name span {
          color: #42a5f5;
        }
      `}</style>

      {/* Background */}
      <div className="bg-scene">
        <div className="grid-lines" />
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />

        {/* Partículas */}
        <div className="particles">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="particle" style={{
              left: `${(i * 5.7 + 3) % 100}%`,
              bottom: `-${(i * 13) % 30}px`,
              animationDuration: `${6 + (i * 1.3) % 8}s`,
              animationDelay: `${(i * 0.7) % 5}s`,
              width: i % 3 === 0 ? "3px" : "2px",
              height: i % 3 === 0 ? "3px" : "2px",
              opacity: 0.4 + (i % 4) * 0.15,
            }} />
          ))}
        </div>
      </div>

      {/* Logo */}
      <a href="/dashboard" className="logo">
        <div className="logo-icon">N</div>
        <span className="logo-name">Nexus<span>Fi</span></span>
      </a>

      {/* Conteúdo central */}
      <div className="content">
        <div className="big-404">404</div>
        <div className="divider" />

        <div className="status-badge">
          <div className="status-dot" />
          <span className="status-text">Página não encontrada</span>
        </div>

        <h1 className="title">Você se perdeu no sistema</h1>
        <p className="subtitle">
          A rota que você tentou acessar não existe ou foi movida.
          Verifique o endereço ou volte para o início.
        </p>

        <div className="btn-group">
          <a href="/dashboard" className="btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            Ir para o Dashboard
          </a>
          <button onClick={() => window.history.back()} className="btn-secondary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>
            </svg>
            Voltar
          </button>
        </div>

        <div className="code-hint">
          <p>rota solicitada</p>
          <code>{typeof window !== "undefined" ? window.location.pathname : "/rota-inexistente"}</code>
        </div>
      </div>
    </div>
  );
}