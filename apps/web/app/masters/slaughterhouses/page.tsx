const slaughterhouses = [
  { name: "Las Moras", status: "Activo" },
  { name: "Frigo Sur", status: "Activo" },
];

export default function SlaughterhousesPage() {
  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Frigoríficos</h2>
        <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950">
          Nuevo frigorífico
        </button>
      </header>
      <div className="rounded-lg bg-slate-900 p-4">
        <div className="grid gap-3">
          {slaughterhouses.map((house) => (
            <div key={house.name} className="flex items-center justify-between border-b border-slate-800 pb-3">
              <p className="font-semibold">{house.name}</p>
              <span className="text-xs text-slate-300">{house.status}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
