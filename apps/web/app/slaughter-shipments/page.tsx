"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Establishment = { id: string; name: string };
type Confirmation = {
  confirmationToken?: string;
  parsedIntent?: string;
  confirmedAt?: string;
  edits?: {
    text?: string;
    parsed?: { proposedOperations?: Array<{ payload?: { items?: Array<{ category?: string; qty?: number }> } }> };
  };
};

export default function SlaughterShipmentsPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [confirmations, setConfirmations] = useState<Confirmation[]>([]);

  const load = async (selectedEstablishmentId?: string) => {
    const estResp = await fetch(`${API_URL}/establishments`, { cache: "no-store" });
    const estData = (await estResp.json()) as { establishments: Establishment[] };
    setEstablishments(estData.establishments);
    const current = selectedEstablishmentId || establishmentId || estData.establishments[0]?.id || "";
    if (!current) return;
    setEstablishmentId(current);
    const response = await fetch(`${API_URL}/confirmations?establishmentId=${current}`, { cache: "no-store" });
    const data = (await response.json()) as { confirmations: Confirmation[] };
    setConfirmations(data.confirmations.filter((item) => item.parsedIntent === "SLAUGHTER_SHIPMENT"));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Consignaciones a frigorífico</h2>
        <select className="rounded bg-slate-800 p-2 text-sm" value={establishmentId} onChange={(e) => load(e.target.value)}>
          {establishments.map((est) => <option key={est.id} value={est.id}>{est.name}</option>)}
        </select>
      </header>
      <section className="rounded-lg bg-slate-900 p-4">
        <p className="text-sm text-slate-300">Estas consignaciones provienen de comandos de texto confirmados.</p>
        <div className="mt-3 grid gap-3">
          {confirmations.map((item) => (
            <div key={item.confirmationToken} className="rounded border border-slate-800 p-3">
              <p className="font-semibold">{item.edits?.text ?? "Consignación"}</p>
              <p className="text-xs text-slate-400">{item.confirmedAt ? new Date(item.confirmedAt).toLocaleString() : "Sin fecha"}</p>
              <p className="mt-1 text-sm text-slate-300">Ítems: {item.edits?.parsed?.proposedOperations?.[0]?.payload?.items?.length ?? 0}</p>
            </div>
          ))}
          {confirmations.length === 0 && <p className="text-sm text-slate-400">No hay consignaciones confirmadas.</p>}
        </div>
      </section>
    </main>
  );
}
