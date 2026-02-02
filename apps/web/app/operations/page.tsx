const operations = [
  { type: "MOVE", summary: "120 terneros a Potrero 7", date: "Hoy" },
  { type: "VACCINATION", summary: "Vaquillonas aftosa 2ml", date: "2026-02-01" },
  { type: "WEANING", summary: "Destete lote VAC-2025-01", date: "2026-03-01" },
];

export default function OperationsPage() {
  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Operaciones</h2>
        <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950">
          Nueva operación
        </button>
      </header>
      <div className="rounded-lg bg-slate-900 p-4">
        <div className="grid gap-3">
          {operations.map((operation) => (
            <div key={operation.summary} className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <p className="font-semibold">{operation.type}</p>
                <p className="text-sm text-slate-400">{operation.summary}</p>
              </div>
              <span className="text-xs text-slate-300">{operation.date}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
