"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getApiUrl } from "../lib/api-url";

const API_URL = getApiUrl();

type CaptureSource = "MANUAL" | "FOTO" | "RFID";
type TraceabilityEventType =
  | "ASIGNACION_POTRERO"
  | "INSEMINACION"
  | "PREÑEZ_CONFIRMADA"
  | "VACUNACION_PENDIENTE"
  | "VACUNACION_REALIZADA"
  | "DESPARASITACION"
  | "TRATAMIENTO"
  | "TRASLADO"
  | "MUERTE"
  | "ENVIO_FRIGORIFICO"
  | "OBSERVACION";

type TraceabilityEvent = {
  id: string;
  caravan: string;
  type: TraceabilityEventType;
  occurredAt: string;
  source: CaptureSource;
  user: string;
  notes?: string;
};

type Establishment = { id: string; name: string };

const EVENT_LABELS: Record<TraceabilityEventType, string> = {
  ASIGNACION_POTRERO: "Asignación a potrero",
  INSEMINACION: "Inseminación",
  "PREÑEZ_CONFIRMADA": "Preñez confirmada",
  VACUNACION_PENDIENTE: "Pendiente de vacunación",
  VACUNACION_REALIZADA: "Vacunación realizada",
  DESPARASITACION: "Desparasitación",
  TRATAMIENTO: "Tratamiento",
  TRASLADO: "Traslado",
  MUERTE: "Muerte",
  ENVIO_FRIGORIFICO: "Envío a frigorífico",
  OBSERVACION: "Observación",
};

const ACTION_OPTIONS: TraceabilityEventType[] = [
  "ASIGNACION_POTRERO",
  "INSEMINACION",
  "PREÑEZ_CONFIRMADA",
  "VACUNACION_PENDIENTE",
  "VACUNACION_REALIZADA",
  "DESPARASITACION",
  "TRATAMIENTO",
  "TRASLADO",
  "MUERTE",
  "ENVIO_FRIGORIFICO",
  "OBSERVACION",
];

function buildAiSummary(events: TraceabilityEvent[], caravan: string) {
  if (!events.length) {
    return `No se encontraron eventos para la caravana ${caravan}.`;
  }

  const latest = events[0];
  const insemination = events.find((event) => event.type === "INSEMINACION");
  const pregnancy = events.find((event) => event.type === "PREÑEZ_CONFIRMADA");
  const pendingVaccination = events.find((event) => event.type === "VACUNACION_PENDIENTE");

  return [
    `La caravana ${caravan} tiene ${events.length} eventos registrados en el histórico reciente.`,
    insemination ? `Figura una inseminación el ${new Date(insemination.occurredAt).toLocaleDateString("es-UY")}.` : "No figura inseminación registrada.",
    pregnancy ? `La preñez fue confirmada el ${new Date(pregnancy.occurredAt).toLocaleDateString("es-UY")}.` : "No hay confirmación de preñez en el período filtrado.",
    pendingVaccination ? "Tiene al menos una tarea sanitaria pendiente." : "No se detectan pendientes sanitarias activas.",
    `El último evento es ${EVENT_LABELS[latest.type].toLowerCase()} (${new Date(latest.occurredAt).toLocaleString("es-UY")}).`,
  ].join(" ");
}

function mapApiEventToLocal(e: Record<string, unknown>): TraceabilityEvent {
  const apiSource = e.source as string;
  const source: CaptureSource = apiSource === "RFID" ? "RFID" : apiSource === "FOTO" ? "FOTO" : "MANUAL";
  return {
    id: e.id as string,
    caravan: e.earTag as string,
    type: e.type as TraceabilityEventType,
    occurredAt: e.occurredAt as string,
    source,
    user: (e.createdBy as string) || "Sistema",
    notes: (e.notes as string) || undefined,
  };
}

export default function TraceabilityPilotPage() {
  const [caravanSearch, setCaravanSearch] = useState("UY-10452");
  const [manualInput, setManualInput] = useState("UY-10452");
  const [photoDetectedInput, setPhotoDetectedInput] = useState("UY-10452");
  const [rfidBatchInput, setRfidBatchInput] = useState("");
  const [selectedAction, setSelectedAction] = useState<TraceabilityEventType>("ASIGNACION_POTRERO");
  const [notes, setNotes] = useState("Potrero 7");
  const [events, setEvents] = useState<TraceabilityEvent[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState<string>("");
  const [loadingEvents, setLoadingEvents] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/establishments`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.establishments)) {
          setEstablishments(data.establishments);
          if (data.establishments[0]) setEstablishmentId(data.establishments[0].id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!establishmentId) return;
    setLoadingEvents(true);
    fetch(`${API_URL}/traceability/events?establishmentId=${establishmentId}&limit=300`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.events)) setEvents(data.events.map(mapApiEventToLocal));
      })
      .catch(() => {})
      .finally(() => setLoadingEvents(false));
  }, [establishmentId]);

  const filteredEvents = useMemo(
    () => events.filter((event) => event.caravan.toLowerCase().includes(caravanSearch.toLowerCase())).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)),
    [events, caravanSearch],
  );

  const aiSummary = useMemo(() => buildAiSummary(filteredEvents, caravanSearch), [filteredEvents, caravanSearch]);

  const registerEvent = async (source: CaptureSource, caravan: string, eventType?: TraceabilityEventType) => {
    const normalizedCaravan = caravan.trim().toUpperCase();
    if (!normalizedCaravan) {
      setMessage("Ingresá o detectá una caravana válida para registrar el evento.");
      return;
    }

    const type = eventType ?? selectedAction;
    const tempId = `evt-${Date.now()}`;
    const nextEvent: TraceabilityEvent = {
      id: tempId,
      caravan: normalizedCaravan,
      type,
      occurredAt: new Date().toISOString(),
      source,
      user: "Usuario actual",
      notes: notes.trim() || undefined,
    };

    setEvents((current) => [nextEvent, ...current]);
    setCaravanSearch(normalizedCaravan);
    setMessage(`Se registró ${EVENT_LABELS[type].toLowerCase()} para ${normalizedCaravan} (origen ${source}).`);

    if (establishmentId) {
      try {
        const apiSource = source === "RFID" ? "RFID" : source === "FOTO" ? "FOTO" : "MANUAL";
        const res = await fetch(`${API_URL}/traceability/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            establishmentId,
            earTag: normalizedCaravan,
            type,
            notes: notes.trim() || null,
            source: apiSource,
            occurredAt: new Date().toISOString(),
          }),
        });
        if (res.ok) {
          const saved = (await res.json()) as { id: string };
          setEvents((prev) => prev.map((e) => (e.id === tempId ? { ...e, id: saved.id } : e)));
        }
      } catch {
        // keep optimistic update
      }
    }
  };

  const handleBulkRfid = async (event: FormEvent) => {
    event.preventDefault();
    const validReads = Array.from(
      new Set(
        rfidBatchInput
          .split(/\r?\n/)
          .map((item) => item.trim().toUpperCase())
          .filter((item) => item.length > 0),
      ),
    );
    if (validReads.length === 0) {
      setMessage("Ingresá al menos una caravana en el lote RFID.");
      return;
    }
    const nextEvents: TraceabilityEvent[] = validReads.map((caravan, index) => ({
      id: `rfid-${Date.now()}-${index}`,
      caravan,
      type: selectedAction,
      occurredAt: new Date().toISOString(),
      source: "RFID" as const,
      user: "Carga masiva",
      notes: notes.trim() || undefined,
    }));

    setEvents((current) => [...nextEvents, ...current]);
    setMessage(`Se aplicó ${EVENT_LABELS[selectedAction].toLowerCase()} a ${nextEvents.length} lecturas RFID válidas.`);

    if (establishmentId) {
      await Promise.allSettled(
        nextEvents.map((e) =>
          fetch(`${API_URL}/traceability/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              establishmentId,
              earTag: e.caravan,
              type: e.type,
              notes: e.notes || null,
              source: "RFID",
              occurredAt: e.occurredAt,
            }),
          }),
        ),
      );
    }
  };

  return (
    <main className="space-y-6">
      <header className="rounded-lg bg-slate-900 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Piloto funcional</p>
            <h2 className="mt-2 text-xl font-semibold">Trazabilidad por caravana</h2>
            <p className="mt-2 text-sm text-slate-300">
              Identificación individual (manual/foto/RFID), acciones operativas y consulta histórica asistida por IA.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {establishments.length > 0 ? (
              <select
                className="rounded bg-slate-800 px-3 py-2 text-sm"
                value={establishmentId}
                onChange={(e) => setEstablishmentId(e.target.value)}
              >
                {establishments.map((est) => (
                  <option key={est.id} value={est.id}>{est.name}</option>
                ))}
              </select>
            ) : null}
            <span className="text-xs text-emerald-400">
              {loadingEvents ? "Cargando datos..." : "● Datos en tiempo real"}
            </span>
          </div>
        </div>
      </header>

      {message ? <p className="rounded border border-emerald-600 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">{message}</p> : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-lg bg-slate-900 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">1) Ingreso manual</h3>
          <input
            className="mt-3 w-full rounded bg-slate-800 p-2 text-sm"
            value={manualInput}
            onChange={(event) => setManualInput(event.target.value)}
            placeholder="Ej: UY-10452"
          />
          <button
            type="button"
            onClick={() => registerEvent("MANUAL", manualInput)}
            className="mt-3 w-full rounded bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950"
          >
            Identificar + registrar acción
          </button>
        </article>

        <article className="rounded-lg bg-slate-900 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">2) Ingreso por foto (simulado)</h3>
          <p className="mt-2 text-xs text-slate-400">Carga OCR con confirmación humana previa al guardado.</p>
          <input
            className="mt-3 w-full rounded bg-slate-800 p-2 text-sm"
            value={photoDetectedInput}
            onChange={(event) => setPhotoDetectedInput(event.target.value)}
            placeholder="Número detectado por OCR"
          />
          <button
            type="button"
            onClick={() => registerEvent("FOTO", photoDetectedInput)}
            className="mt-3 w-full rounded border border-slate-700 px-3 py-2 text-sm"
          >
            Confirmar lectura de foto
          </button>
        </article>

        <article className="rounded-lg bg-slate-900 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">3) Lector RFID</h3>
          <p className="mt-2 text-xs text-slate-400">Pegá una caravana por línea para importar la sesión.</p>
          <textarea
            className="mt-3 min-h-24 w-full rounded bg-slate-800 p-2 text-sm"
            value={rfidBatchInput}
            onChange={(event) => setRfidBatchInput(event.target.value)}
            placeholder={"UY-10452\nUY-9981"}
          />
          <form className="mt-3" onSubmit={handleBulkRfid}>
            <button type="submit" className="w-full rounded border border-slate-700 px-3 py-2 text-sm">
              Aplicar acción al lote RFID válido
            </button>
          </form>
        </article>
      </section>

      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Acción rápida</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <select className="rounded bg-slate-800 p-2 text-sm" value={selectedAction} onChange={(event) => setSelectedAction(event.target.value as TraceabilityEventType)}>
            {ACTION_OPTIONS.map((action) => (
              <option key={action} value={action}>{EVENT_LABELS[action]}</option>
            ))}
          </select>
          <input
            className="rounded bg-slate-800 p-2 text-sm md:col-span-2"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Detalle (potrero, dosis, observación, etc.)"
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-lg bg-slate-900 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Historial por caravana</h3>
            <input
              className="rounded bg-slate-800 p-2 text-sm"
              value={caravanSearch}
              onChange={(event) => setCaravanSearch(event.target.value)}
              placeholder="Buscar caravana"
            />
          </div>

          <div className="mt-3 space-y-2">
            {filteredEvents.map((event) => (
              <div key={event.id} className="rounded border border-slate-800 bg-slate-950/50 p-3">
                <p className="text-sm font-semibold text-emerald-300">{event.caravan} · {EVENT_LABELS[event.type]}</p>
                <p className="text-xs text-slate-400">
                  {new Date(event.occurredAt).toLocaleString("es-UY")} · {event.user} · origen {event.source}
                </p>
                {event.notes ? <p className="mt-1 text-sm text-slate-200">{event.notes}</p> : null}
              </div>
            ))}
            {filteredEvents.length === 0 ? <p className="text-sm text-slate-400">Sin eventos para esa caravana.</p> : null}
          </div>
        </article>

        <article className="rounded-lg bg-slate-900 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Consulta IA (con evidencia)</h3>
          <p className="mt-2 text-sm text-slate-200">{aiSummary}</p>
          <div className="mt-4 rounded border border-slate-700 bg-slate-950/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Eventos usados como evidencia</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-300">
              {filteredEvents.slice(0, 5).map((event) => (
                <li key={`evidence-${event.id}`}>
                  {new Date(event.occurredAt).toLocaleDateString("es-UY")}: {EVENT_LABELS[event.type]} ({event.source})
                </li>
              ))}
              {filteredEvents.length === 0 ? <li>No hay evidencia disponible para el filtro actual.</li> : null}
            </ul>
          </div>
        </article>
      </section>
    </main>
  );
}
