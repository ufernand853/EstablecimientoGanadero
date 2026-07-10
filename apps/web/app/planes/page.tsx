"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getApiUrl } from "../lib/api-url";
import { PublicPlan, formatAnimalLimit, formatPlanPrice } from "../lib/billing";
import { withBasePath } from "../lib/base-path";

const API_URL = getApiUrl();
const WHATSAPP_URL = "https://wa.me/59898682749?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20Linsse%20Ganader%C3%ADa%20y%20sus%20planes";

const VISUALS: Record<string, { accent: string; badge: string }> = {
  BASIC: { accent: "from-emerald-400 via-lime-300 to-emerald-500", badge: "Arranque" },
  PRO: { accent: "from-amber-300 via-orange-300 to-emerald-400", badge: "Mas elegido" },
  ENTERPRISE: { accent: "from-sky-300 via-cyan-300 to-emerald-300", badge: "A medida" },
};

const COMMERCIAL_PILLARS = [
  {
    title: "Trazabilidad que se entiende",
    text: "Consultá el historial por caravana, registrá movimientos y seguí cada animal con una lectura simple y clara.",
  },
  {
    title: "Trabajo real en campo",
    text: "El operario puede cargar datos desde modo campo y el responsable ve todo ordenado en modo gestión.",
  },
  {
    title: "Sanidad, insumos y tareas",
    text: "Planificá vacunaciones, tratamientos, vencimientos y tareas programadas sin depender de planillas sueltas.",
  },
];

const FEATURE_STORIES = [
  "Lectura y consulta de caravanas con foco en trazabilidad individual.",
  "Seguimiento de movimientos, pesajes, tratamientos, partos y bajas.",
  "Tareas programadas visibles tanto en campo como en gestión.",
  "Gestión sanitaria e insumos con alertas y control de lotes.",
];

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
      <section className="overflow-hidden rounded-[2rem] border border-emerald-900/60 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.2),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(253,224,71,0.12),transparent_24%),linear-gradient(135deg,#022c22_0%,#020617_42%,#14532d_100%)] px-6 py-10 shadow-2xl shadow-emerald-950/40 md:px-10">
        <div className="grid gap-8 lg:grid-cols-[1.2fr,0.8fr]">
          <div className="space-y-5">
            <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">
              Linsse Ganaderia
            </span>
            <h1 className="max-w-3xl text-4xl font-black tracking-tight text-white md:text-5xl">
              Menos planillas, mas control del rodeo y una trazabilidad que el cliente percibe enseguida.
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-slate-200 md:text-base">
              Mostrale al productor una herramienta que ordena el trabajo diario, mejora la gestión sanitaria, organiza las tareas y le da valor real a cada lectura de caravana.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={withBasePath("/registro?plan=PRO")}
                className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-300"
              >
                Empezar ahora
              </Link>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-slate-600 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-emerald-400"
              >
                Hablar por WhatsApp
              </a>
            </div>
          </div>

          <div className="grid gap-3 rounded-[1.75rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
            {COMMERCIAL_PILLARS.map((pillar) => (
              <div key={pillar.title} className="rounded-[1.25rem] border border-white/10 bg-slate-950/60 p-4">
                <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-200">{pillar.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{pillar.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {FEATURE_STORIES.map((item) => (
          <article key={item} className="rounded-[1.5rem] border border-slate-800 bg-slate-900/75 p-5 text-sm leading-6 text-slate-200 shadow-lg shadow-slate-950/20">
            {item}
          </article>
        ))}
      </section>

      <section className="rounded-[2rem] border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-slate-950/20">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Mini demo visual</p>
            <h2 className="mt-2 text-3xl font-black text-white">Dos formas de trabajar, una misma operación ordenada</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">
              La propuesta comercial gana fuerza cuando el cliente ve que el operario puede resolver en campo y que la administración recibe todo listo para controlar, decidir y vender mejor.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <MiniScreen
            badge="Modo campo"
            title="Carga rapida, lectura clara"
            description="Pensado para recorrer, registrar y confirmar acciones sin fricción. Ideal para trabajo con caravanas, tratamientos, nacimientos, pesajes y tareas del día."
            lines={[
              "Buscar caravana o pegar lectura del lector",
              "Registrar tratamiento, pesaje o baja en segundos",
              "Ver tareas pendientes por potrero",
              "Confirmar trabajo realizado desde el campo",
            ]}
          />
          <MiniScreen
            badge="Modo gestion"
            title="Panel para decidir mejor"
            description="El responsable visualiza trazabilidad, sanidad, tareas, stock e insumos en una sola vista, con información más ordenada y más útil para seguir el establecimiento."
            lines={[
              "Historial por caravana y por lote",
              "Tareas programadas y seguimiento operativo",
              "Sanidad e insumos con vencimientos y alertas",
              "Indicadores para control diario y comercial",
            ]}
          />
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
              Propuesta comercial
            </span>
            <h2 className="mt-8 text-2xl font-black">{enterprisePlan?.name ?? "Plan Empresa"}</h2>
            <p className="mt-2 text-sm font-medium text-slate-900/80">
              {enterprisePlan?.description ?? "Implementación acompañada, configuraciones a medida e integraciones."}
            </p>
          </div>
          <div className="mt-5 space-y-4">
            <p className="text-sm text-slate-300">
              Si el cliente necesita más volumen, más acompañamiento o una propuesta adaptada a su operación, lo podés canalizar desde acá.
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
              <input name="phone" placeholder="Telefono / WhatsApp" className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400" />
              <textarea name="message" rows={4} placeholder="Contanos cantidad de animales, tipo de operación o qué querés mostrarle al cliente" className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400" />
              <button type="submit" disabled={contactState === "sending"} className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-slate-100 disabled:opacity-70">
                {contactState === "sending" ? "Enviando..." : "Solicitar contacto comercial"}
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
