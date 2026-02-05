export default function HomePage() {
  const modules = [
    { href: "/dashboard", label: "Panel de control" },
    { href: "/establishments", label: "Establecimientos" },
    { href: "/paddocks", label: "Potreros" },
    { href: "/herds", label: "Lotes y categorías" },
    { href: "/operations", label: "Operaciones" },
    { href: "/commands", label: "Movimientos por texto" },
    { href: "/masters/consignors", label: "Consignatarios" },
    { href: "/masters/slaughterhouses", label: "Frigoríficos" },
    { href: "/slaughter-shipments", label: "Consignaciones" },
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
            href="/dashboard"
          >
            Ver panel de control
          </a>
          <a
            className="rounded bg-slate-800 px-4 py-2 text-sm text-slate-200"
            href="/commands"
          >
            Cargar movimiento por texto
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
