import { Shield } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";

export default function Footer() {
  const t = useTranslations("landing.footer");
  const year = String(new Date().getFullYear());

  const columns = [
    {
      title: t("colProduct"),
      links: [
        { label: t("product.cashFlow"), href: "#" },
        { label: t("product.payables"), href: "#" },
        { label: t("product.reports"), href: "#" },
        { label: t("product.api"), href: "/developer" as const },
      ],
    },
    {
      title: t("colCompany"),
      links: [
        { label: t("company.about"), href: "#" },
        { label: t("company.blog"), href: "#" },
        { label: t("company.careers"), href: "#" },
        { label: t("company.press"), href: "#" },
      ],
    },
    {
      title: t("colSupport"),
      links: [
        { label: t("support.privacy"), href: "/privacidade" as const },
        { label: t("support.accessibility"), href: "/acessibilidade" as const },
        { label: t("support.help"), href: "#" },
        { label: t("support.contact"), href: "#" },
        { label: t("support.status"), href: "#" },
      ],
    },
  ];

  return (
    <footer className="bg-blue-950 py-16">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-4 gap-10 mb-12">
          <div>
            <div className="flex items-center mb-4">
              <img src="/nexus_fi_logo_branco.png" alt="NexusFi" className="h-9 w-auto" />
            </div>
            <p className="text-blue-300/75 text-sm leading-relaxed">{t("tagline")}</p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <p className="text-white font-semibold text-sm mb-4">{col.title}</p>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.href.startsWith("/") ? (
                      <Link
                        href={l.href}
                        className="text-blue-300/75 hover:text-white text-sm transition-colors"
                      >
                        {l.label}
                      </Link>
                    ) : (
                      <a
                        href={l.href}
                        className="text-blue-300/75 hover:text-white text-sm transition-colors"
                      >
                        {l.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-blue-300/75 text-center text-xs">{t("rights", { year })}</p>
          <div className="flex items-center gap-4">
            <LocaleSwitcher className="text-blue-200" />
            <div className="flex items-center gap-1 text-blue-300/75 text-xs">
              <Shield size={12} /> {t("lgpd")}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
