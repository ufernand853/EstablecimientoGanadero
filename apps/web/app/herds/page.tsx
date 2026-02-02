const herds = [
  { code: "VAC-2025-01", category: "Vacas", qty: 120, paddock: "Potrero 2" },
  { code: "TERN-2025-03", category: "Terneros", qty: 85, paddock: "Potrero 4" },
  { code: "NOV-2024-02", category: "Novillos", qty: 40, paddock: "Potrero 1" },
];

export default function HerdsPage() {
  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Lotes</h2>
        <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950">
          Nuevo lote
        </button>
      </header>
      <div className="rounded-lg bg-slate-900 p-4">
        <div className="grid gap-3">
          {herds.map((herd) => (
            <div key={herd.code} className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <p className="font-semibold">{herd.code}</p>
                <p className="text-sm text-slate-400">{herd.category} · {herd.paddock}</p>
              </div>
              <span className="text-sm font-semibold">{herd.qty} cabezas</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
