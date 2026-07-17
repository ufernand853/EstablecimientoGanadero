"use client";

import { FormEvent, useEffect, useState } from "react";
import { getApiUrl } from "../../lib/api-url";
import { useI18n } from "../../lib/i18n";

const API_URL = getApiUrl();

type Establishment = { id: string; name: string };
type MovementType = {
  id: string;
  establishmentId: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
};

export default function MovementTypesPage() {
  const { t } = useI18n();
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [movementTypes, setMovementTypes] = useState<MovementType[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async (selectedEstablishmentId?: string) => {
    const estResp = await fetch(`${API_URL}/establishments`, { cache: "no-store" });
    const estData = (await estResp.json()) as { establishments: Establishment[] };
    setEstablishments(estData.establishments);
    const current = selectedEstablishmentId || establishmentId || estData.establishments[0]?.id || "";
    if (!current) return;
    setEstablishmentId(current);
    const response = await fetch(`${API_URL}/movement-types?establishmentId=${current}`, { cache: "no-store" });
    const data = (await response.json()) as { movementTypes: MovementType[] };
    setMovementTypes(data.movementTypes);
  };

  useEffect(() => {
    load().catch(() => setError(t("masters.loadError")));
  }, [t]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setError(null);
    const response = await fetch(`${API_URL}/movement-types`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ establishmentId, name: name.trim(), status: "ACTIVE" }),
    });
    if (!response.ok) {
      setError(t("masters.saveError"));
      return;
    }
    setName("");
    await load(establishmentId);
  };

  const toggleStatus = async (movementType: MovementType) => {
    const response = await fetch(`${API_URL}/movement-types/${movementType.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: movementType.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }),
    });
    if (response.ok) await load(establishmentId);
  };

  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t("masters.movementTypes.title")}</h2>
        <select className="rounded bg-slate-800 p-2 text-sm" value={establishmentId} onChange={(e) => load(e.target.value)}>
          {establishments.map((est) => <option key={est.id} value={est.id}>{est.name}</option>)}
        </select>
      </header>
      <section className="rounded-lg bg-slate-900 p-4">
        <form className="flex gap-3" onSubmit={handleCreate}>
          <input className="flex-1 rounded bg-slate-800 p-2 text-sm" placeholder={t("masters.movementTypes.placeholder")} value={name} onChange={(e) => setName(e.target.value.toUpperCase())} />
          <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">{t("masters.create")}</button>
        </form>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </section>
      <section className="rounded-lg bg-slate-900 p-4 grid gap-2">
        {movementTypes.map((movementType) => (
          <div key={movementType.id} className="flex items-center justify-between border-b border-slate-800 pb-2">
            <p className="font-semibold">{movementType.name}</p>
            <button className="rounded bg-slate-700 px-3 py-1 text-xs" onClick={() => toggleStatus(movementType)}>
              {movementType.status}
            </button>
          </div>
        ))}
        {movementTypes.length === 0 && <p className="text-sm text-slate-400">{t("masters.empty")}</p>}
      </section>
    </main>
  );
}
