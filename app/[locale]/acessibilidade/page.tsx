import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { alternatesFor } from "@/lib/seo";

const CONTACT_EMAIL = "privacidade@nexusfi.com.br";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.accessibility.meta" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: alternatesFor(locale, "/acessibilidade"),
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-heading text-lg font-semibold text-[var(--text)]">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-[var(--text-muted)]">
        {children}
      </div>
    </section>
  );
}

export default async function AcessibilidadePage() {
  const t = await getTranslations("legal");
  const ta = await getTranslations("legal.accessibility");

  const rich = { b: (c: React.ReactNode) => <strong className="font-semibold text-[var(--text)]">{c}</strong> };

  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--brand)]"
      >
        <ArrowLeft size={15} />
        {t("back")}
      </Link>

      <h1 className="font-heading mt-6 text-2xl font-bold text-[var(--text)] sm:text-3xl">
        {ta("title")}
      </h1>
      <p className="mt-2 text-xs text-[var(--text-subtle)]">
        {ta("lastUpdated", { date: ta("lastUpdatedValue") })}
      </p>
      <p className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-subtle)]">
        {t("prevailNotice")}
      </p>

      <p className="mt-6 text-sm leading-relaxed text-[var(--text-muted)]">
        {ta.rich("intro", rich)}
      </p>

      <Section title={ta("standard.title")}>
        <p>{ta.rich("standard.body", rich)}</p>
      </Section>

      <Section title={ta("done.title")}>
        <p>{ta("done.intro")}</p>
        <ul className="list-disc space-y-1.5 pl-5">
          {(ta.raw("done.items") as string[]).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </Section>

      <Section title={ta("limitations.title")}>
        <ul className="list-disc space-y-1.5 pl-5">
          {(ta.raw("limitations.items") as string[]).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </Section>

      <Section title={ta("report.title")}>
        <p>
          {ta.rich("report.body", {
            mail: (c) => (
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-semibold text-[var(--brand)] underline underline-offset-2"
              >
                {c}
              </a>
            ),
            email: CONTACT_EMAIL,
          })}
        </p>
      </Section>
    </main>
  );
}
