"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { LanguageSelector } from "../components/language-selector";
import { getApiUrl } from "../lib/api-url";
import { withBasePath } from "../lib/base-path";
import { PublicPlan } from "../lib/billing";
import { useI18n } from "../lib/i18n";

const API_URL = getApiUrl();
const WHATSAPP_URL = "https://wa.me/59898682749?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20Linsse%20Ganader%C3%ADa%20y%20sus%20planes";

const VISUALS: Record<string, { accent: string; badge: string }> = {
  BASIC: { accent: "from-emerald-400 via-lime-300 to-emerald-500", badge: "plans.badge.basic" },
  PRO: { accent: "from-amber-300 via-orange-300 to-emerald-400", badge: "plans.badge.pro" },
  ENTERPRISE: { accent: "from-sky-300 via-cyan-300 to-emerald-300", badge: "plans.badge.enterprise" },
};

const PLAN_TRANSLATIONS = {
  pt: {
    BASIC: {
      name: "Plano Basico",
      description: "Ideal para organizar o estabelecimento, registrar movimentacoes e comecar a trabalhar com rastreabilidade digital.",
      ctaLabel: "Contratar",
      featureList: [
        "Ate 250 animais",
        "Modo campo e modo gestao",
        "Rastreabilidade por brinco",
        "Suporte comercial por WhatsApp",
      ],
    },
    PRO: {
      name: "Plano Pro",
      description: "Pensado para operacoes que precisam de mais controle, mais acompanhamento e melhor leitura do negocio em tempo real.",
      ctaLabel: "Contratar",
      featureList: [
        "Ate 1000 animais",
        "Sanidade, insumos e tarefas programadas",
        "Rastreabilidade com historico por brinco",
        "Alertas e relatorios operacionais",
      ],
    },
    ENTERPRISE: {
      name: "Plano Empresa",
      description: "Para empresas que buscam implantacao acompanhada, integracoes e uma proposta comercial sob medida.",
      ctaLabel: "Solicitar contato",
      featureList: [
        "Animais ilimitados",
        "Integracoes e acompanhamento",
        "Configuracao operacional sob medida",
        "Prioridade de suporte",
      ],
    },
  },
} as const;

const formatPlanPrice = (plan: Pick<PublicPlan, "currency" | "priceAmount">, locale: string, customLabel: string) => {
  if (plan.priceAmount == null) return customLabel;
  const amount = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: plan.currency,
    maximumFractionDigits: plan.priceAmount % 1 === 0 ? 0 : 2,
  }).format(plan.priceAmount);
  return `${amount}/mes`;
};

const formatAnimalLimit = (animalLimit: number | null, locale: string, template: string, unlimitedLabel: string) => {
  if (animalLimit == null) return unlimitedLabel;
  return template.replace("{count}", animalLimit.toLocaleString(locale));
};

function MiniScreen({
  badge,
  title,
  description,
  lines,
}: {
  badge: string;
  title: string;
  description: string;
  lines: string[];
}) {
  return (
    <article className="rounded-[1.75rem] border border-slate-800 bg-slate-950/80 p-4 shadow-xl shadow-slate-950/30">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-emerald-200">
          {badge}
        </span>
        <div className="flex gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </div>
      </div>
      <div className="mt-4 rounded-[1.4rem] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-emerald-950/60 p-4">
        <h3 className="text-lg font-black text-white">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-300">{description}</p>
        <div className="mt-4 grid gap-2">
          {lines.map((line) => (
            <div key={line} className="rounded-2xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-200">
              {line}
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

export default function PricingPage() {
  const { t, language, locale } = useI18n();
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contactState, setContactState] = useState<"idle" | "sending" | "sent">("idle");
  const [contactError, setContactError] = useState<string | null>(null);

  useEffect(() => {
    const loadPlans = async () => {
      try {
        const response = await fetch(`${API_URL}/public/plans`, { cache: "no-store" });
        const data = (await response.json()) as PublicPlan[];
        if (!response.ok) throw new Error(t("plans.loadError"));
        setPlans(data);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : t("plans.loadError"));
      } finally {
        setLoading(false);
      }
    };
    void loadPlans();
  }, [t]);

  const selfServicePlans = useMemo(() => plans.filter((plan) => plan.isSelfService), [plans]);
  const enterprisePlan = useMemo(() => plans.find((plan) => plan.code === "ENTERPRISE") ?? null, [plans]);
  const featureStories = [t("plans.feature.1"), t("plans.feature.2"), t("plans.feature.3"), t("plans.feature.4")];
  const commercialPillars = [
    { title: t("plans.pillar.1.title"), text: t("plans.pillar.1.body") },
    { title: t("plans.pillar.2.title"), text: t("plans.pillar.2.body") },
    { title: t("plans.pillar.3.title"), text: t("plans.pillar.3.body") },
  ];

  const getLocalizedPlan = (plan: PublicPlan) => {
    const translationSet = PLAN_TRANSLATIONS[language as "pt"]?.[plan.code as keyof typeof PLAN_TRANSLATIONS.pt];
    if (!translationSet) return plan;
    return {
      ...plan,
      ...translationSet,
    };
  };

  async function handleEnterpriseSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setContactError(null);
    setContactState("sending");
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    try {
      const response = await fetch(`${API_URL}/public/enterprise-contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((data as { message?: string }).message ?? t("plans.contactError"));
      event.currentTarget.reset();
      setContactState("sent");
    } catch (submitError) {
      setContactError(submitError instanceof Error ? submitError.message : t("plans.contactError"));
      setContactState("idle");
    }
  }

  return (
    <main className="space-y-8 py-6">
      <section className="overflow-hidden rounded-[2rem] border border-emerald-900/60 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.2),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(253,224,71,0.12),transparent_24%),linear-gradient(135deg,#022c22_0%,#020617_42%,#14532d_100%)] px-6 py-10 shadow-2xl shadow-emerald-950/40 md:px-10">
        <div className="grid gap-8 lg:grid-cols-[1.2fr,0.8fr]">
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">
                {t("plans.brand")}
              </span>
              <LanguageSelector />
            </div>
            <h1 className="max-w-3xl text-4xl font-black tracking-tight text-white md:text-5xl">
              {t("plans.heroTitle")}
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-slate-200 md:text-base">
              {t("plans.heroBody")}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={withBasePath("/registro?plan=PRO")}
                className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-300"
              >
                {t("plans.startNow")}
              </Link>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-slate-600 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-emerald-400"
              >
                {t("plans.whatsapp")}
              </a>
            </div>
          </div>

          <div className="grid gap-3 rounded-[1.75rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
            {commercialPillars.map((pillar) => (
              <div key={pillar.title} className="rounded-[1.25rem] border border-white/10 bg-slate-950/60 p-4">
                <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-200">{pillar.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{pillar.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 rounded-[1.5rem] border border-slate-800 bg-slate-900/60 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">{t("plans.features")}</p>
            <h2 className="mt-2 text-2xl font-black text-white">{t("plans.featuresTitle")}</h2>
          </div>
          <Link
            href={withBasePath("/login")}
            className="inline-flex items-center justify-center rounded-full border border-emerald-400 px-5 py-3 text-sm font-bold text-emerald-100 transition hover:bg-emerald-400 hover:text-slate-950"
          >
            {t("plans.goLogin")}
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {featureStories.map((item) => (
            <article key={item} className="rounded-[1.5rem] border border-slate-800 bg-slate-900/75 p-5 text-sm leading-6 text-slate-200 shadow-lg shadow-slate-950/20">
              {item}
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-slate-950/20">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">{t("plans.productEyebrow")}</p>
            <h2 className="mt-2 text-3xl font-black text-white">{t("plans.productTitle")}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">
              {t("plans.productBody")}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <MiniScreen
            badge={t("plans.screen.register.badge")}
            title={t("plans.screen.register.title")}
            description={t("plans.screen.register.body")}
            lines={[
              t("plans.screen.register.1"),
              t("plans.screen.register.2"),
              t("plans.screen.register.3"),
              t("plans.screen.register.4"),
            ]}
          />
          <MiniScreen
            badge={t("plans.screen.control.badge")}
            title={t("plans.screen.control.title")}
            description={t("plans.screen.control.body")}
            lines={[
              t("plans.screen.control.1"),
              t("plans.screen.control.2"),
              t("plans.screen.control.3"),
              t("plans.screen.control.4"),
            ]}
          />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.6fr,1fr]">
        <div className="grid gap-5 md:grid-cols-2">
          {loading ? <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 text-slate-300">{t("plans.loading")}</div> : null}
          {error ? <div className="rounded-3xl border border-rose-900 bg-rose-950/40 p-6 text-rose-200">{error}</div> : null}
          {selfServicePlans.map((plan) => {
            const visual = VISUALS[plan.code] ?? VISUALS.PRO;
            const localizedPlan = getLocalizedPlan(plan);
            return (
              <article key={localizedPlan.code} className="rounded-[1.75rem] border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20">
                <div className={`mb-5 rounded-[1.5rem] bg-gradient-to-br ${visual.accent} p-5 text-slate-950`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-white/70 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em]">
                      {t(visual.badge as keyof typeof import("../lib/i18n/es").es)}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-[0.24em]">{localizedPlan.code}</span>
                  </div>
                  <h2 className="mt-8 text-2xl font-black">{localizedPlan.name}</h2>
                  <p className="mt-2 text-sm font-medium text-slate-900/80">{localizedPlan.description}</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-3xl font-black text-white">{formatPlanPrice(localizedPlan, locale, t("plans.price.custom"))}</p>
                    <p className="mt-1 text-sm text-emerald-200">{formatAnimalLimit(localizedPlan.animalLimit, locale, t("plans.animals.until"), t("plans.animals.unlimited"))}</p>
                  </div>
                  <ul className="space-y-2 text-sm text-slate-300">
                    {localizedPlan.featureList.map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={withBasePath(`/registro?plan=${localizedPlan.code}`)}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-300"
                  >
                    {localizedPlan.ctaLabel}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>

        <aside className="rounded-[1.75rem] border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20">
          <div className={`rounded-[1.5rem] bg-gradient-to-br ${(enterprisePlan ? (VISUALS[enterprisePlan.code] ?? VISUALS.ENTERPRISE) : VISUALS.ENTERPRISE).accent} p-5 text-slate-950`}>
            <span className="rounded-full bg-white/70 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em]">
              {t("plans.enterpriseBadge")}
            </span>
            <h2 className="mt-8 text-2xl font-black">{getLocalizedPlan(enterprisePlan ?? { code: "ENTERPRISE", name: t("plans.enterpriseTitle"), description: t("plans.enterpriseBody"), ctaLabel: "", featureList: [], amountCents: 0, animalLimit: null, billingPeriodDays: 30, currency: "USD", isDemo: false, isSelfService: false, priceAmount: null, trialDays: 0 }).name}</h2>
            <p className="mt-2 text-sm font-medium text-slate-900/80">
              {enterprisePlan ? getLocalizedPlan(enterprisePlan).description : t("plans.enterpriseBody")}
            </p>
          </div>
          <div className="mt-5 space-y-4">
            <p className="text-sm text-slate-300">
              {t("plans.enterpriseCopy")}
            </p>
            {enterprisePlan ? (
              <ul className="space-y-2 text-sm text-slate-300">
                {getLocalizedPlan(enterprisePlan).featureList.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-cyan-300" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <form className="space-y-3" onSubmit={handleEnterpriseSubmit}>
              <input name="company" required placeholder={t("plans.form.company")} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400" />
              <input name="contact" required placeholder={t("plans.form.contact")} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400" />
              <input name="email" type="email" required placeholder={t("plans.form.email")} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400" />
              <input name="phone" placeholder={t("plans.form.phone")} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400" />
              <textarea name="message" rows={4} placeholder={t("plans.form.message")} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400" />
              <button type="submit" disabled={contactState === "sending"} className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-slate-100 disabled:opacity-70">
                {contactState === "sending" ? t("plans.contactSending") : t("plans.contactSubmit")}
              </button>
            </form>
            {contactState === "sent" ? <p className="rounded-2xl border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">{t("plans.contactSent")}</p> : null}
            {contactError ? <p className="rounded-2xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">{contactError}</p> : null}
          </div>
        </aside>
      </section>
    </main>
  );
}
