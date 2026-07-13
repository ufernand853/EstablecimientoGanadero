"use client";

import { useEffect, useMemo, useState } from "react";
import { getApiUrl } from "./lib/api-url";
import { withBasePath } from "./lib/base-path";
import { canSeeLink, isCommercialDemoUser } from "./lib/roles";

const API_URL = getApiUrl();

const menuGroups = [
  {
    title: "Inicio",
    description: "Resumen y seguimiento general de la operacion.",
    links: [{ href: withBasePath("/dashboard"), label: "Panel de control" }, { href: withBasePath("/supervision"), label: "Supervision" }],
  },
  {
    title: "Registrar",
    description: "Altas, cargas y acciones operativas del dia a dia.",
    links: [
      { href: withBasePath("/operations"), label: "Operaciones" },
      { href: withBasePath("/shipments"), label: "Embarques" },
      { href: withBasePath("/incidents"), label: "Incidentes" },
      { href: withBasePath("/slaughter-shipments"), label: "Consignaciones" },
      { href: withBasePath("/insemination"), label: "Reproduccion" },
      { href: withBasePath("/traceability"), label: "Trazabilidad" },
    ],
  },
  {
    title: "Consultar",
    description: "Busquedas y estado actual de establecimientos y animales.",
    links: [
      { href: withBasePath("/establishments"), label: "Establecimientos" },
      { href: withBasePath("/paddocks"), label: "Potreros" },
      { href: withBasePath("/herds"), label: "Stock" },
      { href: withBasePath("/animals"), label: "Animales" },
      { href: withBasePath("/health"), label: "Gestion sanitaria" },
      { href: withBasePath("/insumos"), label: "Insumos" },
    ],
  },
  {
    title: "Reportes",
    description: "Analisis, historicos y cambios recientes.",
    links: [
      { href: withBasePath("/dashboard"), label: "Indicadores" },
      { href: withBasePath("/commands/changes"), label: "Cambios IA" },
      { href: withBasePath("/traceability/dashboard"), label: "Panel trazabilidad" },
    ],
  },
  {
    title: "Modo IA",
    description: "Interfaz de lenguaje natural para operaciones de lote y consultas.",
    links: [
      { href: withBasePath("/commands"), label: "Modo IA completo" },
      { href: withBasePath("/campo"), label: "Modo Campo (operario)" },
    ],
  },
  {
    title: "Configuracion",
    description: "Parametros del sistema, maestros y API.",
    links: [
      { href: withBasePath("/masters/herd-categories"), label: "Categorias" },
      { href: withBasePath("/masters/consignors"), label: "Consignatarios" },
      { href: withBasePath("/masters/slaughterhouses"), label: "Frigorificos" },
      { href: withBasePath("/admin/ai-settings"), label: "API y ajustes IA" },
    ],
  },
];

export default function HomePage() {
  const [sessionRole, setSessionRole] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const response = await fetch(`${API_URL}/auth/session`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { user?: { role?: string; email?: string } };
        setSessionRole(data.user?.role ?? null);
        setSessionEmail(data.user?.email ?? null);
      } catch {
        setSessionRole(null);
        setSessionEmail(null);
      }
    };
    loadSession();
  }, []);

  const visibleMenuGroups = useMemo(
    () =>
      menuGroups
        .map((group) => ({
          ...group,
          links: group.links.filter((link) => canSeeLink(sessionRole, link.href, sessionEmail)),
        }))
        .filter((group) => group.links.length > 0),
    [sessionEmail, sessionRole],
  );

  const isDemoUser = isCommercialDemoUser(sessionEmail);

  return (
    <main className="space-y-6">
      <section className="rounded-lg bg-slate-900 p-6 shadow">
        <h2 className="text-xl font-semibold">Inicio</h2>
        <p className="mt-2 text-slate-300">
          {isDemoUser
            ? "Recorrido comercial simplificado para mostrar la operacion diaria y la gestion del establecimiento."
            : "Navegacion simplificada por flujo de uso diario."}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            href={withBasePath("/campo")}
          >
            Ir a modo campo
          </a>
          <a
            className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-emerald-500"
            href={withBasePath("/traceability/dashboard")}
          >
            Ir a modo gestion
          </a>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border border-emerald-800/70 bg-emerald-950/20 p-5">
            <h3 className="text-base font-semibold text-emerald-300">Modo Campo</h3>
            <p className="mt-2 text-sm leading-6 text-slate-200">
              Pensado para el operario o capataz en el terreno. Permite registrar caravanas, ejecutar tareas,
              cargar novedades y trabajar con una interfaz rapida desde el celular.
            </p>
          </article>
          <article className="rounded-xl border border-sky-800/70 bg-sky-950/20 p-5">
            <h3 className="text-base font-semibold text-sky-300">Modo Gestion</h3>
            <p className="mt-2 text-sm leading-6 text-slate-200">
              Enfocado en supervision y toma de decisiones. Reune indicadores, trazabilidad, tareas, stock e
              historial para ordenar la operacion y mostrar resultados.
            </p>
          </article>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {visibleMenuGroups.map((group) => (
            <article key={group.title} className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
              <h3 className="text-base font-semibold text-emerald-300">{group.title}</h3>
              <p className="mt-1 text-sm text-slate-300">{group.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {group.links.map((link) => (
                  <a
                    key={link.href}
                    className="rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-200 transition hover:border-emerald-500"
                    href={link.href}
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
