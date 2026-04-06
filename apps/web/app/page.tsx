import { withBasePath } from "./lib/base-path";
export default function HomePage() {
  const modules = [
    { href: withBasePath("/dashboard"), label: "Panel de control" },
    { href: withBasePath("/establishments"), label: "Establecimientos" },
    { href: withBasePath("/paddocks"), label: "Potreros" },
    { href: withBasePath("/herds"), label: "Lotes y categorías" },
    { href: withBasePath("/animals"), label: "Animales individuales" },
    { href: withBasePath("/operations"), label: "Operaciones" },
    { href: withBasePath("/health"), label: "Gestión sanitaria" },
    { href: withBasePath("/insemination"), label: "Inseminación (próximamente)" },
    { href: withBasePath("/masters/herd-categories"), label: "Categorías" },
    { href: withBasePath("/masters/consignors"), label: "Consignatarios" },
    { href: withBasePath("/masters/slaughterhouses"), label: "Frigoríficos" },
    { href: withBasePath("/slaughter-shipments"), label: "Consignaciones" },
    { href: withBasePath("/commands"), label: "Modo IA" },
    { href: withBasePath("/admin/ai-settings"), label: "Admin API key IA" },
  ];

  return (
    <main className="space-y-6">
      <section className="rounded-lg bg-slate-900 p-6 shadow">
        <h2 className="text-xl font-semibold">Inicio</h2>
        <p className="mt-2 text-slate-300">
          Selecciona un módulo para gestionar establecimientos, lotes, potreros y operaciones.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950"
            href={withBasePath("/dashboard")}
          >
            Ver panel de control
          </a>
          <a
            className="rounded bg-slate-800 px-4 py-2 text-sm text-slate-200"
            href={withBasePath("/commands")}
          >
            Abrir Modo IA
          </a>
        </div>
        <div className="mt-6 grid gap-2 md:grid-cols-2">
          {modules.map((module) => (
            <a
              key={module.href}
              className="rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-200 transition hover:border-emerald-500"
              href={module.href}
            >
              {module.label}
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
