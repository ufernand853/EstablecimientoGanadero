const paddocks = [
  { name: "Potrero 1", area: "45 ha", type: "Campo natural", status: "Activo" },
  { name: "Potrero 2", area: "32 ha", type: "Pradera", status: "Activo" },
  { name: "Potrero 3", area: "28 ha", type: "Verdeo", status: "Inactivo" },
];

export default function PaddocksPage() {
  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Potreros</h2>
        <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950">
          Nuevo potrero
        </button>
      </header>
      <div className="rounded-lg bg-slate-900 p-4">
        <div className="grid gap-3">
          {paddocks.map((paddock) => (
            <div key={paddock.name} className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <p className="font-semibold">{paddock.name}</p>
                <p className="text-sm text-slate-400">{paddock.area} · {paddock.type}</p>
              </div>
              <span className="rounded bg-slate-800 px-3 py-1 text-xs text-slate-200">{paddock.status}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
