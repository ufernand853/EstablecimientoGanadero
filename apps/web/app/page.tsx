import { withBasePath } from "./lib/base-path";

const menuGroups = [
  {
    title: "Inicio",
    description: "Resumen y seguimiento general de la operación.",
    links: [{ href: withBasePath("/dashboard"), label: "Panel de control" }],
  },
  {
    title: "Registrar",
    description: "Altas, cargas y acciones operativas del día a día.",
    links: [
      { href: withBasePath("/operations"), label: "Operaciones" },
      { href: withBasePath("/shipments"), label: "Embarques" },
      { href: withBasePath("/incidents"), label: "Incidentes" },
      { href: withBasePath("/slaughter-shipments"), label: "Consignaciones" },
      { href: withBasePath("/insemination"), label: "Reproducción" },
      { href: withBasePath("/traceability"), label: "Trazabilidad" },
    ],
  },
  {
    title: "Consultar",
    description: "Búsquedas y estado actual de establecimientos y animales.",
    links: [
      { href: withBasePath("/establishments"), label: "Establecimientos" },
      { href: withBasePath("/paddocks"), label: "Potreros" },
      { href: withBasePath("/herds"), label: "Stock" },
      { href: withBasePath("/animals"), label: "Animales" },
      { href: withBasePath("/health"), label: "Gestión sanitaria" },
    ],
  },
  {
    title: "Reportes",
    description: "Análisis, históricos y cambios recientes.",
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
    title: "Configuración",
    description: "Parámetros del sistema, maestros y API.",
    links: [
      { href: withBasePath("/masters/herd-categories"), label: "Categorías" },
      { href: withBasePath("/masters/consignors"), label: "Consignatarios" },
      { href: withBasePath("/masters/slaughterhouses"), label: "Frigoríficos" },
      { href: withBasePath("/admin/ai-settings"), label: "API y ajustes IA" },
    ],
  },
];

export default function HomePage() {
  return (
    <main className="space-y-6">
      <section className="rounded-lg bg-slate-900 p-6 shadow">
        <h2 className="text-xl font-semibold">Inicio</h2>
        <p className="mt-2 text-slate-300">Navegación simplificada por flujo de uso diario.</p>
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
            Ir a modo gestión
          </a>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {menuGroups.map((group) => (
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
