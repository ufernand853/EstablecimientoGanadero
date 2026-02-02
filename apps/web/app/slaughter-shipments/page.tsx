const shipments = [
  { id: "SS-2024-01", consignor: "Pérez", slaughterhouse: "Las Moras", status: "DRAFT", total: "USD 24.600" },
  { id: "SS-2024-02", consignor: "San Miguel", slaughterhouse: "Frigo Sur", status: "CONFIRMED", total: "UYU 1.120.000" },
];

export default function SlaughterShipmentsPage() {
  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Consignaciones a frigorífico</h2>
        <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950">
          Nueva consignación
        </button>
      </header>
      <div className="rounded-lg bg-slate-900 p-4">
        <div className="grid gap-3">
          {shipments.map((shipment) => (
            <div key={shipment.id} className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <p className="font-semibold">{shipment.id}</p>
                <p className="text-sm text-slate-400">
                  {shipment.consignor} → {shipment.slaughterhouse}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-300">{shipment.status}</p>
                <p className="text-sm font-semibold">{shipment.total}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
