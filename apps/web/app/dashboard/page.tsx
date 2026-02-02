const cards = [
  { title: "Stock por categoría", value: "1.240 cabezas" },
  { title: "Potreros ocupados", value: "5 / 8" },
  { title: "Operaciones próximas", value: "3" },
];

export default function DashboardPage() {
  return (
    <main className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <div key={card.title} className="rounded-lg bg-slate-900 p-4">
            <p className="text-sm text-slate-400">{card.title}</p>
            <p className="text-2xl font-semibold">{card.value}</p>
          </div>
        ))}
      </section>
      <section className="rounded-lg bg-slate-900 p-6">
        <h2 className="text-lg font-semibold">Establecimiento activo</h2>
        <p className="mt-2 text-slate-300">Estancia La Laguna · UTC-3</p>
      </section>
    </main>
  );
}
