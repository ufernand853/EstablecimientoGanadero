"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getApiUrl } from "../lib/api-url";
import { PublicPlan, formatAnimalLimit, formatPlanPrice } from "../lib/billing";
import { withBasePath } from "../lib/base-path";

const API_URL = getApiUrl();
const WHATSAPP_URL = "https://wa.me/59898682749?text=Hola%2C%20quiero%20consultar%20por%20los%20planes%20de%20Linsse%20Ganader%C3%ADa";

const VISUALS: Record<string, { accent: string; badge: string }> = {
  BASIC: { accent: "from-emerald-400 via-lime-300 to-emerald-500", badge: "Arranque" },
  PRO: { accent: "from-amber-300 via-orange-300 to-emerald-400", badge: "Más elegido" },
  ENTERPRISE: { accent: "from-sky-300 via-cyan-300 to-emerald-300", badge: "A medida" },
};

export default function PricingPage() {
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
        if (!response.ok) throw new Error("No se pudieron cargar los planes.");
        setPlans(data);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los planes.");
      } finally {
        setLoading(false);
      }
    };
    loadPlans();
  }, []);

  const selfServicePlans = useMemo(() => plans.filter((plan) => plan.isSelfService), [plans]);
  const enterprisePlan = useMemo(() => plans.find((plan) => plan.code === "ENTERPRISE") ?? null, [plans]);

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
      if (!response.ok) throw new Error((data as { message?: string }).message ?? "No se pudo enviar la consulta.");
      event.currentTarget.reset();
      setContactState("sent");
    } catch (submitError) {
      setContactError(submitError instanceof Error ? submitError.message : "No se pudo enviar la consulta.");
      setContactState("idle");
    }
  }

  return (
    <main className="space-y-8 py-6">
      <section className="overflow-hidden rounded-[2rem] border border-emerald-900/60 bg-gradient-to-br from-emerald-950 via-slate-950 to-lime-950 px-6 py-10 shadow-2xl shadow-emerald-950/40 md:px-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl space-y-4">
            <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">
              Linsse Ganadería SaaS
            </span>
            <h1 className="max-w-2xl text-4xl font-black tracking-tight text-white md:text-5xl">
              Planes para digitalizar la operación ganadera con trazabilidad, campo e IA.
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-slate-200 md:text-base">
              Contratá por cantidad de animales, separá cada cliente por tenant y operá en la web con la misma lógica comercial de Linsse.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={withBasePath("/login")}
              className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-emerald-400"
            >
              Ya tengo cuenta
            </Link>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
            >
              Contactar por WhatsApp
            </a>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.6fr,1fr]">
        <div className="grid gap-5 md:grid-cols-2">
          {loading ? <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 text-slate-300">Cargando planes...</div> : null}
          {error ? <div className="rounded-3xl border border-rose-900 bg-rose-950/40 p-6 text-rose-200">{error}</div> : null}
          {selfServicePlans.map((plan) => {
            const visual = VISUALS[plan.code] ?? VISUALS.PRO;
            return (
              <article key={plan.code} className="rounded-[1.75rem] border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20">
                <div className={`mb-5 rounded-[1.5rem] bg-gradient-to-br ${visual.accent} p-5 text-slate-950`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-white/70 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em]">
                      {visual.badge}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-[0.24em]">{plan.code}</span>
                  </div>
                  <h2 className="mt-8 text-2xl font-black">{plan.name}</h2>
                  <p className="mt-2 text-sm font-medium text-slate-900/80">{plan.description}</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-3xl font-black text-white">{formatPlanPrice(plan)}</p>
                    <p className="mt-1 text-sm text-emerald-200">{formatAnimalLimit(plan.animalLimit)}</p>
                  </div>
                  <ul className="space-y-2 text-sm text-slate-300">
                    {plan.featureList.map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={withBasePath(`/registro?plan=${plan.code}`)}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-300"
                  >
                    {plan.ctaLabel}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>

        <aside className="rounded-[1.75rem] border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20">
          <div className={`rounded-[1.5rem] bg-gradient-to-br ${(enterprisePlan ? (VISUALS[enterprisePlan.code] ?? VISUALS.ENTERPRISE) : VISUALS.ENTERPRISE).accent} p-5 text-slate-950`}>
            <span className="rounded-full bg-white/70 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em]">
              Solución comercial
            </span>
            <h2 className="mt-8 text-2xl font-black">{enterprisePlan?.name ?? "Plan Empresa"}</h2>
            <p className="mt-2 text-sm font-medium text-slate-900/80">
              {enterprisePlan?.description ?? "Implementación acompañada, configuraciones a medida e integraciones."}
            </p>
          </div>
          <div className="mt-5 space-y-4">
            <p className="text-sm text-slate-300">
              Ideal para varios establecimientos, necesidades especiales de licenciamiento o despliegue asistido bajo `ganaderia.linsse.com`.
            </p>
            {enterprisePlan ? (
              <ul className="space-y-2 text-sm text-slate-300">
                {enterprisePlan.featureList.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-cyan-300" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <form className="space-y-3" onSubmit={handleEnterpriseSubmit}>
              <input name="company" required placeholder="Empresa" className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400" />
              <input name="contact" required placeholder="Contacto" className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400" />
              <input name="email" type="email" required placeholder="Email" className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400" />
              <input name="phone" placeholder="Teléfono / WhatsApp" className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400" />
              <textarea name="message" rows={4} placeholder="Comentanos cantidad de animales, establecimientos o necesidades de implementación" className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400" />
              <button type="submit" disabled={contactState === "sending"} className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-slate-100 disabled:opacity-70">
                {contactState === "sending" ? "Enviando..." : "Solicitar demo comercial"}
              </button>
            </form>
            {contactState === "sent" ? <p className="rounded-2xl border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">Consulta registrada. Te contactaremos para coordinar la demo.</p> : null}
            {contactError ? <p className="rounded-2xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">{contactError}</p> : null}
          </div>
        </aside>
      </section>
    </main>
  );
}
