"use client";

import { FormEvent, useEffect, useState } from "react";
import { getApiUrl } from "../lib/api-url";

const API_URL = getApiUrl();

type Establishment = {
  id: string;
  name: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
};

export default function EstablishmentsPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("UTC-3");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadEstablishments = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/establishments`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("No se pudieron cargar los establecimientos.");
      }
      const data = (await response.json()) as { establishments: Establishment[] };
      setEstablishments(data.establishments);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEstablishments();
  }, []);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (!name.trim()) {
      setError("Ingresá un nombre de establecimiento.");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/establishments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), timezone: timezone.trim() || "UTC-3" }),
      });
      if (!response.ok) {
        throw new Error("No se pudo crear el establecimiento.");
      }
      setName("");
      setTimezone("UTC-3");
      setSuccess("Establecimiento creado correctamente.");
      await loadEstablishments();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Error inesperado.");
    }
  };

  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Establecimientos</h2>
        <button
          className="rounded bg-slate-700 px-4 py-2 text-sm"
          type="button"
          onClick={loadEstablishments}
          disabled={loading}
        >
          {loading ? "Cargando..." : "Recargar"}
        </button>
      </header>

      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Nuevo establecimiento</h3>
        <form className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_auto]" onSubmit={handleCreate}>
          <input
            className="rounded bg-slate-800 p-2 text-sm"
            placeholder="Nombre"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <input
            className="rounded bg-slate-800 p-2 text-sm"
            placeholder="Timezone"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
          />
          <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">
            Crear
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {success && <p className="mt-3 text-sm text-emerald-300">{success}</p>}
      </section>

      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Listado</h3>
        <div className="mt-3 grid gap-3">
          {establishments.length === 0 && <p className="text-sm text-slate-400">No hay establecimientos cargados.</p>}
          {establishments.map((establishment) => (
            <div key={establishment.id} className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <p className="font-semibold">{establishment.name}</p>
                <p className="text-xs text-slate-400">{establishment.timezone}</p>
              </div>
              <span className="text-xs text-slate-400">{establishment.id}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
