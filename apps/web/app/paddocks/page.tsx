"use client";

import { FormEvent, useEffect, useState } from "react";
import { getApiUrl } from "../lib/api-url";

const API_URL = getApiUrl();

type Establishment = {
  id: string;
  name: string;
};

type Paddock = {
  id: string;
  establishmentId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export default function PaddocksPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEstablishments = async () => {
    const response = await fetch(`${API_URL}/establishments`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("No se pudieron cargar los establecimientos.");
    }
    const data = (await response.json()) as { establishments: Establishment[] };
    setEstablishments(data.establishments);
    if (!establishmentId && data.establishments.length > 0) {
      setEstablishmentId(data.establishments[0]?.id ?? "");
    }
  };

  const loadPaddocks = async (selectedEstablishmentId: string) => {
    if (!selectedEstablishmentId) {
      setPaddocks([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_URL}/paddocks?establishmentId=${encodeURIComponent(selectedEstablishmentId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error("No se pudieron cargar los potreros.");
      }
      const data = (await response.json()) as { paddocks: Paddock[] };
      setPaddocks(data.paddocks);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await loadEstablishments();
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Error inesperado.");
      }
    };
    bootstrap();
  }, []);

  useEffect(() => {
    loadPaddocks(establishmentId);
  }, [establishmentId]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!establishmentId) {
      setError("Seleccioná un establecimiento.");
      return;
    }
    if (!name.trim()) {
      setError("Ingresá un nombre de potrero.");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/paddocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ establishmentId, name: name.trim() }),
      });
      if (!response.ok) {
        throw new Error("No se pudo crear el potrero.");
      }
      setName("");
      await loadPaddocks(establishmentId);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Error inesperado.");
    }
  };

  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Potreros</h2>
        <button
          className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950"
          type="button"
          onClick={() => loadPaddocks(establishmentId)}
          disabled={loading}
        >
          {loading ? "Cargando..." : "Cargar potreros"}
        </button>
      </header>

      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Filtro</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
          <select
            className="rounded bg-slate-800 p-2 text-sm"
            value={establishmentId}
            onChange={(event) => setEstablishmentId(event.target.value)}
          >
            {establishments.length === 0 && <option value="">No hay establecimientos</option>}
            {establishments.map((establishment) => (
              <option key={establishment.id} value={establishment.id}>
                {establishment.name}
              </option>
            ))}
          </select>
          <button className="rounded bg-slate-700 px-4 py-2 text-sm" type="button" onClick={() => loadPaddocks(establishmentId)}>
            Aplicar
          </button>
        </div>
      </section>

      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Nuevo potrero</h3>
        <form className="mt-3 flex gap-3" onSubmit={handleCreate}>
          <input
            className="flex-1 rounded bg-slate-800 p-2 text-sm"
            placeholder="Nombre del potrero"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">
            Crear
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </section>

      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Listado</h3>
        <div className="mt-3 grid gap-3">
          {!loading && paddocks.length === 0 && <p className="text-sm text-slate-400">No hay potreros para el establecimiento seleccionado.</p>}
          {paddocks.map((paddock) => (
            <div key={paddock.id} className="flex items-center justify-between border-b border-slate-800 pb-3">
              <p className="font-semibold">{paddock.name}</p>
              <span className="text-xs text-slate-400">{paddock.id}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
