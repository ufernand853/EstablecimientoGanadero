const consignors = [
  { name: "Pérez", status: "Activo" },
  { name: "San Miguel", status: "Activo" },
];

export default function ConsignorsPage() {
  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Consignatarios</h2>
        <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950">
          Nuevo consignatario
        </button>
      </header>
      <div className="rounded-lg bg-slate-900 p-4">
        <div className="grid gap-3">
          {consignors.map((consignor) => (
            <div key={consignor.name} className="flex items-center justify-between border-b border-slate-800 pb-3">
              <p className="font-semibold">{consignor.name}</p>
              <span className="text-xs text-slate-300">{consignor.status}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
