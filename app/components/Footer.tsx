import {
  TrendingDown,
  DollarSign,
  BarChart2,
  Shield,
  Zap,
  ArrowRight,
  ChevronRight,
  Bell,
  Menu,
  X,
  Globe,
  PieChart,
  Activity,
  Star,
} from "lucide-react";

export default function Footer() {
    return(
        <footer className="bg-blue-950 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-10 mb-12">
            <div>
              <div className="flex items-center mb-4">
                <img src="/nexus_fi_logo_branco.png" alt="NexusFi" className="h-9 w-auto" />
              </div>
              <p className="text-blue-300/50 text-sm leading-relaxed">
                Plataforma de investimentos para o Brasil e o mundo.
              </p>
            </div>
            {[
              { title: "Produto", links: ["Mercados", "Portfólio", "Análises", "API"] },
              { title: "Empresa", links: ["Sobre", "Blog", "Carreiras", "Imprensa"] },
              { title: "Suporte", links: ["Central de ajuda", "Contato", "Status", "Segurança"] },
            ].map((col) => (
              <div key={col.title}>
                <p className="text-white font-semibold text-sm mb-4">{col.title}</p>
                <ul className="space-y-2">
                  {col.links.map((l) => (
                    <li key={l}>
                      <a 
                        href={l === "API" ? "/developer" : "#"} 
                        className="text-blue-300/50 hover:text-white text-sm transition-colors"
                      >
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-blue-300/30 text-center text-xs">© {new Date().getFullYear()} NexusFi. Todos os direitos reservados. Investimentos sujeitos a riscos.</p>
            <div className="flex items-center gap-1 text-blue-300/30 text-xs">
              <Shield size={12} /> Regulado pelo Banco Central do Brasil
            </div>
          </div>
        </div>
      </footer>
    )
}