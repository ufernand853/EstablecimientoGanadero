"use client";

import { useEffect, useState } from "react";
import { getApiUrl } from "../../lib/api-url";
import { withBasePath } from "../../lib/base-path";

const API_URL = getApiUrl();

type Establishment = {
  id: string;
  name: string;
};

type ConfirmedChange = {
  id: string;
  establishmentId: string;
  parsedIntent: string | null;
  createdEventIds: string[];
  confirmationToken: string;
  confirmedAt: string;
  undoneAt?: string;
};

export default function IAChangesPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [changes, setChanges] = useState<ConfirmedChange[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const loadChanges = async (estId: string) => {
    if (!estId) {
      setChanges([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/commands/confirmed-changes?establishmentId=${estId}&limit=50`);
      if (!response.ok) {
        throw new Error("No se pudo cargar el historial de cambios confirmados.");
      }
      const data = (await response.json()) as { changes: ConfirmedChange[] };
      setChanges(data.changes ?? []);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadEstablishments = async () => {
      try {
        const response = await fetch(`${API_URL}/establishments`);
        if (!response.ok) {
          throw new Error("No se pudieron cargar los establecimientos.");
        }
        const data = (await response.json()) as { establishments: Establishment[] };
        setEstablishments(data.establishments);
        const nextId = data.establishments[0]?.id ?? "";
        setEstablishmentId(nextId);
        await loadChanges(nextId);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Error inesperado.");
      }
    };

    void loadEstablishments();
  }, []);

  const handleUndo = async (changeId: string) => {
    if (!establishmentId) {
      return;
    }
    setUndoingId(changeId);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/commands/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          establishmentId,
          confirmationId: changeId,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        throw new Error(data.message || "No se pudo deshacer la operación.");
      }

      await loadChanges(establishmentId);
    } catch (undoError) {
      setError(undoError instanceof Error ? undoError.message : "Error inesperado al deshacer.");
    } finally {
      setUndoingId(null);
    }
  };

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Log de cambios IA</h2>
          <p className="text-sm text-slate-300">
            Lista de operaciones confirmadas en Modo IA que impactaron base de datos, con opción de deshacer.
          </p>
        </div>
        <a
          href={withBasePath("/commands")}
          className="rounded bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-100"
        >
          Volver a Modo IA
        </a>
      </header>

      <section className="rounded-lg bg-slate-900 p-4">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Establecimiento
          <select
            className="mt-2 w-full rounded bg-slate-800 p-2 text-sm text-slate-200"
            value={establishmentId}
            onChange={(event) => {
              const nextId = event.target.value;
              setEstablishmentId(nextId);
              void loadChanges(nextId);
            }}
          >
            {establishments.map((establishment) => (
              <option key={establishment.id} value={establishment.id}>{establishment.name}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="rounded-lg bg-slate-900 p-4">
        {loading ? <p className="text-sm text-slate-300">Cargando cambios...</p> : null}
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}

        <div className="mt-2 max-h-[500px] space-y-3 overflow-y-auto">
          {!loading && changes.length === 0 ? (
            <p className="text-sm text-slate-400">No hay cambios confirmados con impacto en BD para este establecimiento.</p>
          ) : null}

          {changes.map((change) => (
            <article key={change.id} className="rounded border border-slate-800 bg-slate-950/60 p-3 text-sm">
              <p className="font-semibold text-slate-200">
                {change.parsedIntent ?? "SIN_INTENT"} · {change.createdEventIds.length} evento(s)
              </p>
              <p className="text-xs text-slate-400">
                Confirmado: {new Date(change.confirmedAt).toLocaleString("es-AR")} · Token: {change.confirmationToken}
              </p>
              {change.undoneAt ? (
                <p className="mt-2 text-xs font-semibold text-amber-300">
                  Deshecho: {new Date(change.undoneAt).toLocaleString("es-AR")}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleUndo(change.id)}
                  disabled={undoingId === change.id}
                  className="mt-2 rounded bg-rose-500 px-3 py-1 text-xs font-semibold text-slate-950 disabled:opacity-70"
                >
                  {undoingId === change.id ? "Deshaciendo..." : "Deshacer operación"}
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
