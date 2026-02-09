"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Establishment = {
  id: string;
  name: string;
  timezone: string;
};

type ParseResult = {
  intent: string;
  confidence: number;
  proposedOperations: { type: string; occurredAt: string; payload: Record<string, unknown> }[];
  warnings: string[];
  errors: string[];
  editsNeeded?: string[];
  confirmationToken: string;
};

export default function CommandsPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [status, setStatus] = useState<"idle" | "parsing" | "confirming">("idle");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const loadEstablishments = async () => {
      try {
        const response = await fetch(`${API_URL}/establishments`);
        if (!response.ok) {
          throw new Error("No se pudieron cargar los establecimientos.");
        }
        const data = (await response.json()) as { establishments: Establishment[] };
        setEstablishments(data.establishments);
        if (data.establishments.length) {
          setEstablishmentId(data.establishments[0]?.id ?? "");
        }
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Error inesperado.");
      }
    };

    loadEstablishments();
  }, []);

  const handlePreview = async () => {
    setError(null);
    setSuccess(null);
    if (!establishmentId) {
      setError("Seleccioná un establecimiento antes de previsualizar.");
      return;
    }
    if (!text.trim()) {
      setError("Ingresá un comando para continuar.");
      return;
    }
    setStatus("parsing");
    try {
      const response = await fetch(`${API_URL}/commands/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          establishmentId,
          text,
        }),
      });
      if (!response.ok) {
        throw new Error("No se pudo previsualizar el comando.");
      }
      const data = (await response.json()) as ParseResult;
      setParsed(data);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Error inesperado.");
    } finally {
      setStatus("idle");
    }
  };

  const handleConfirm = async () => {
    setError(null);
    setSuccess(null);
    if (!parsed) {
      setError("Primero previsualizá el comando.");
      return;
    }
    setStatus("confirming");
    try {
      const response = await fetch(`${API_URL}/commands/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          establishmentId,
          confirmationToken: parsed.confirmationToken,
          edits: {
            text,
            parsed,
          },
        }),
      });
      if (!response.ok) {
        throw new Error("No se pudo confirmar el comando.");
      }
      setSuccess("Comando confirmado y guardado.");
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "Error inesperado.");
    } finally {
      setStatus("idle");
    }
  };

  return (
    <main className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">Comandos en español</h2>
        <p className="text-sm text-slate-300">
          Ingresá una instrucción y revisá la previsualización antes de confirmar.
        </p>
      </header>
      <div className="rounded-lg bg-slate-900 p-6">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Establecimiento
          <select
            className="mt-2 w-full rounded bg-slate-800 p-2 text-sm text-slate-200"
            value={establishmentId}
            onChange={(event) => setEstablishmentId(event.target.value)}
          >
            {establishments.length === 0 && (
              <option value="">No hay establecimientos cargados</option>
            )}
            {establishments.map((establishment) => (
              <option key={establishment.id} value={establishment.id}>
                {establishment.name}
              </option>
            ))}
          </select>
        </label>
        <textarea
          className="mt-4 h-32 w-full rounded bg-slate-800 p-3 text-sm"
          placeholder="Ej: Mover 120 terneros del Potrero Norte al Potrero Sur hoy 16:00"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="mt-4 flex gap-3">
          <button
            className="rounded bg-slate-700 px-4 py-2 text-sm"
            onClick={handlePreview}
            disabled={status === "parsing"}
          >
            {status === "parsing" ? "Previsualizando..." : "Previsualizar"}
          </button>
          <button
            className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950"
            onClick={handleConfirm}
            disabled={status === "confirming"}
          >
            {status === "confirming" ? "Confirmando..." : "Confirmar"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {success && <p className="mt-3 text-sm text-emerald-300">{success}</p>}
      </div>
      <div className="rounded-lg bg-slate-900 p-6">
        <h3 className="text-lg font-semibold">Previsualización</h3>
        {!parsed && (
          <p className="mt-3 text-sm text-slate-400">
            Todavía no se generó una previsualización.
          </p>
        )}
        {parsed && (
          <div className="mt-3 space-y-4 text-sm text-slate-300">
            <div className="rounded bg-slate-800/60 p-3">
              <p className="font-semibold">Intención detectada</p>
              <p>
                {parsed.intent} · Confianza {(parsed.confidence * 100).toFixed(0)}%
              </p>
            </div>
            {parsed.warnings.length > 0 && (
              <div className="rounded bg-amber-500/10 p-3 text-amber-200">
                <p className="font-semibold">Advertencias</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {parsed.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            {parsed.errors.length > 0 && (
              <div className="rounded bg-red-500/10 p-3 text-red-200">
                <p className="font-semibold">Errores</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {parsed.errors.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="rounded bg-slate-800/60 p-3">
              <p className="font-semibold">Operaciones propuestas</p>
              <ul className="mt-2 space-y-3">
                {parsed.proposedOperations.map((operation, index) => (
                  <li key={`${operation.type}-${index}`} className="space-y-1">
                    <p className="font-semibold">{operation.type}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(operation.occurredAt).toLocaleString()}
                    </p>
                    <pre className="rounded bg-slate-900/80 p-2 text-xs text-slate-200">
                      {JSON.stringify(operation.payload, null, 2)}
                    </pre>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
