"use client";

import { useEffect, useRef, useState } from "react";
import { getApiUrl } from "../lib/api-url";
import { withBasePath } from "../lib/base-path";

const API_URL = getApiUrl();

type Establishment = { id: string; name: string };

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

type RecentEvent = {
  id: string;
  earTag: string;
  type: TraceabilityEventType;
  occurredAt: string;
  notes: string | null;
};

type PendingEvent = {
  establishmentId: string;
  earTag: string;
  type: TraceabilityEventType;
  paddockName: string | null;
  product: string | null;
  dose: string | null;
  notes: string | null;
  source: "COMANDO_IA";
  occurredAt: string;
};
type FieldTask = {
  id: string;
  establishmentId: string;
  title: string;
  notes: string;
  earTag: string | null;
  status: "PENDIENTE" | "COMPLETADA";
  createdAt: string;
};

type Feedback = { kind: "success" | "info" | "error"; text: string };

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: { transcript: string }[][] }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const getSpeechRecognition = (): SpeechRecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const formatTaskOptionLabel = (task: FieldTask) => {
  const detailParts = [
    task.earTag ? `Animal ${task.earTag}` : "Para cualquier animal",
    task.notes ? `Qué hacer: ${task.notes}` : null,
  ].filter(Boolean);
  return `${task.title} — ${detailParts.join(" · ")}`;
};

export default function CampoPage() {
  const [establishment, setEstablishment] = useState<Establishment | null>(null);
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "sending">("idle");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pendingEvent, setPendingEvent] = useState<PendingEvent | null>(null);
  const [pendingHerdResponse, setPendingHerdResponse] = useState<string | null>(null);
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [tasks, setTasks] = useState<FieldTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const tasksStorageKey = "eg-field-tasks-v1";

  // Load establishments
  useEffect(() => {
    fetch(`${API_URL}/establishments`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.establishments) && data.establishments.length > 0) {
          setEstablishments(data.establishments);
          setEstablishment(data.establishments[0]);
        }
      })
      .catch(() => {});
  }, []);

  // Load recent events when establishment changes
  useEffect(() => {
    if (!establishment) return;
    fetch(`${API_URL}/traceability/events?establishmentId=${establishment.id}&limit=5`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data.events)) setRecentEvents(data.events); })
      .catch(() => {});
  }, [establishment]);

  useEffect(() => {
    if (!establishment) return;
    try {
      const raw = localStorage.getItem(tasksStorageKey);
      const parsed = raw ? (JSON.parse(raw) as FieldTask[]) : [];
      setTasks(parsed.filter((task) => task.establishmentId === establishment.id && task.status === "PENDIENTE"));
    } catch {
      setTasks([]);
    }
  }, [establishment]);

  const refreshRecentEvents = () => {
    if (!establishment) return;
    fetch(`${API_URL}/traceability/events?establishmentId=${establishment.id}&limit=5`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data.events)) setRecentEvents(data.events); })
      .catch(() => {});
  };

  const startVoice = () => {
    setVoiceError(null);
    const SR = getSpeechRecognition();
    if (!SR) { setVoiceError("Tu navegador no soporta voz."); return; }

    const rec = new SR();
    rec.lang = "es-AR";
    rec.continuous = false;
    rec.interimResults = false;

    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? "";
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    rec.onerror = (e) => {
      setVoiceError(e.error === "not-allowed" ? "Permiso de micrófono denegado." : "Error al escuchar.");
      setIsListening(false);
    };
    rec.onend = () => setIsListening(false);

    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
  };

  const stopVoice = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const sendMessage = async () => {
    const prompt = input.trim();
    if (!prompt || !establishment || status === "sending") return;

    setInput("");
    setStatus("sending");
    setFeedback(null);
    setPendingEvent(null);
    setPendingHerdResponse(null);

    try {
      const res = await fetch(`${API_URL}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ establishmentId: establishment.id, prompt }),
      });

      const data = (await res.json()) as {
        response?: string;
        earTag?: string;
        detectedEventType?: string;
        suggestedApiCall?: {
          endpoint: string;
          requestPreview?: PendingEvent;
        };
      };

      if (data.earTag && data.suggestedApiCall?.endpoint === "/traceability/events" && data.suggestedApiCall.requestPreview) {
        setPendingEvent(data.suggestedApiCall.requestPreview);
      } else if (data.suggestedApiCall?.endpoint === "/commands/confirm") {
        setPendingHerdResponse(data.response ?? "Operación de lote detectada.");
      } else {
        setFeedback({ kind: "info", text: data.response ?? "Sin respuesta." });
      }
    } catch {
      setFeedback({ kind: "error", text: "No se pudo conectar con el servidor." });
    } finally {
      setStatus("idle");
    }
  };

  const confirmEvent = async () => {
    if (!pendingEvent) return;
    setStatus("sending");

    try {
      const res = await fetch(`${API_URL}/traceability/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingEvent),
      });

      if (res.ok) {
        if (selectedTaskId && establishment) {
          try {
            const raw = localStorage.getItem(tasksStorageKey);
            const parsed = raw ? (JSON.parse(raw) as FieldTask[]) : [];
            const updated = parsed.map((task) => (
              task.id === selectedTaskId && task.establishmentId === establishment.id
                ? { ...task, status: "COMPLETADA" as const }
                : task
            ));
            localStorage.setItem(tasksStorageKey, JSON.stringify(updated));
            setTasks(updated.filter((task) => task.establishmentId === establishment.id && task.status === "PENDIENTE"));
            setSelectedTaskId("");
          } catch {
            // ignore storage issues
          }
        }
        setFeedback({
          kind: "success",
          text: `${pendingEvent.earTag} — ${EVENT_LABELS[pendingEvent.type]} guardado.`,
        });
        refreshRecentEvents();
      } else {
        setFeedback({ kind: "error", text: "No se pudo guardar el evento." });
      }
    } catch {
      setFeedback({ kind: "error", text: "Error de conexión al guardar." });
    } finally {
      setPendingEvent(null);
      setStatus("idle");
    }
  };

  const cancelPending = () => {
    setPendingEvent(null);
    setPendingHerdResponse(null);
    setFeedback(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const isBusy = status === "sending";
  const hasPending = pendingEvent !== null || pendingHerdResponse !== null;

  return (
    <main className="flex min-h-[calc(100vh-5rem)] flex-col bg-slate-950">

      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-wide text-emerald-400">Modo Campo</span>
          {establishment ? (
            <select
              className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300"
              value={establishment.id}
              onChange={(e) => {
                const found = establishments.find((est) => est.id === e.target.value);
                if (found) setEstablishment(found);
              }}
            >
              {establishments.map((est) => (
                <option key={est.id} value={est.id}>{est.name}</option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-slate-500">Cargando...</span>
          )}
        </div>
        <a
          href={withBasePath("/commands")}
          className="text-xs text-slate-400 underline-offset-2 hover:text-emerald-400 hover:underline"
        >
          Modo IA completo
        </a>
      </header>

      {/* Recent events */}
      <section className="px-4 pt-4">
        {recentEvents.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-slate-500">Últimas acciones</p>
            {recentEvents.map((ev) => (
              <div key={ev.id} className="flex items-baseline justify-between rounded-lg bg-slate-900 px-3 py-2">
                <div>
                  <span className="text-sm font-semibold text-emerald-300">{ev.earTag}</span>
                  <span className="ml-2 text-sm text-slate-200">{EVENT_LABELS[ev.type]}</span>
                  {ev.notes ? <span className="ml-2 text-xs text-slate-400">{ev.notes}</span> : null}
                </div>
                <time className="ml-4 shrink-0 text-xs text-slate-500">
                  {new Date(ev.occurredAt).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}
                </time>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-600">Sin acciones recientes.</p>
        )}
      </section>

      {/* Feedback */}
      {feedback ? (
        <div className={`mx-4 mt-4 rounded-lg p-4 text-base font-semibold ${
          feedback.kind === "success"
            ? "border border-emerald-600 bg-emerald-950/60 text-emerald-200"
            : feedback.kind === "error"
              ? "border border-red-700 bg-red-950/60 text-red-200"
              : "border border-slate-700 bg-slate-900 text-slate-200"
        }`}>
          {feedback.text}
        </div>
      ) : null}

      {/* Pending individual animal event */}
      {pendingEvent ? (
        <div className="mx-4 mt-4 rounded-xl border-2 border-emerald-700 bg-slate-900 p-5">
          <p className="text-xs uppercase tracking-widest text-emerald-400">Confirmar acción</p>
          <p className="mt-3 text-2xl font-bold text-white">{pendingEvent.earTag}</p>
          <p className="mt-1 text-lg text-emerald-300">{EVENT_LABELS[pendingEvent.type]}</p>
          {pendingEvent.paddockName ? <p className="mt-1 text-sm text-slate-300">Potrero: {pendingEvent.paddockName}</p> : null}
          {pendingEvent.product ? <p className="mt-1 text-sm text-slate-300">Producto: {pendingEvent.product}{pendingEvent.dose ? ` · ${pendingEvent.dose}` : ""}</p> : null}
          {pendingEvent.notes ? <p className="mt-1 text-sm text-slate-400">{pendingEvent.notes}</p> : null}
          <div className="mt-3">
            <p className="text-xs text-slate-300">Asociar tarea (opcional)</p>
            <p className="mt-1 text-xs text-slate-400">
              Elegí la tarea que estás realizando ahora. Leé el texto completo para saber exactamente qué hacer.
            </p>
            <select className="mt-1 w-full rounded bg-slate-800 px-2 py-2 text-sm text-slate-200" value={selectedTaskId} onChange={(e) => setSelectedTaskId(e.target.value)}>
              <option value="">No asociar tarea en este registro</option>
              {tasks.filter((task) => !task.earTag || task.earTag === pendingEvent.earTag).map((task) => (
                <option key={task.id} value={task.id}>{formatTaskOptionLabel(task)}</option>
              ))}
            </select>
          </div>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={confirmEvent}
              disabled={isBusy}
              className="flex-1 rounded-xl bg-emerald-500 py-3 text-base font-bold text-slate-950 disabled:opacity-50"
            >
              {isBusy ? "Guardando..." : "Confirmar"}
            </button>
            <button
              type="button"
              onClick={cancelPending}
              className="rounded-xl border border-slate-600 px-5 py-3 text-base text-slate-300"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {/* Pending herd operation — redirect to full mode */}
      {pendingHerdResponse ? (
        <div className="mx-4 mt-4 rounded-xl border border-amber-700 bg-amber-950/40 p-4">
          <p className="text-sm font-semibold text-amber-300">Operación de lote detectada</p>
          <p className="mt-1 text-sm text-slate-200">{pendingHerdResponse}</p>
          <div className="mt-3 flex gap-3">
            <a
              href={withBasePath("/commands")}
              className="inline-block rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Abrir Modo IA completo
            </a>
            <button type="button" onClick={cancelPending} className="text-sm text-slate-400">
              Ignorar
            </button>
          </div>
        </div>
      ) : null}

      {/* Input area */}
      <div className="border-t border-slate-800 bg-slate-950 px-4 pb-6 pt-4">
        {!establishment ? (
          <p className="text-center text-sm text-slate-500">Cargando establecimiento...</p>
        ) : (
          <>
            <div className="mb-3 rounded-lg border border-emerald-700/60 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200">
              Interfaz IA activa por defecto: podés escribir o dictar para cargar acciones.
            </div>
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.focus()}
                className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200 hover:border-emerald-500"
              >
                ✍️ Escribir
              </button>
              <button
                type="button"
                onClick={isListening ? stopVoice : startVoice}
                className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200 hover:border-emerald-500"
              >
                🎙️ {isListening ? "Detener dictado" : "Dictar"}
              </button>
            </div>
            {voiceError ? <p className="mb-2 text-xs text-red-400">{voiceError}</p> : null}
            <div className="flex items-end gap-3">
              <textarea
                ref={inputRef}
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? "Escuchando..." : "Escribí o hablá: UY-10452 vacuna aftosa..."}
                className="flex-1 resize-none rounded-xl bg-slate-800 px-4 py-3 text-base text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                disabled={isBusy}
              />
              <button
                type="button"
                onClick={isListening ? stopVoice : startVoice}
                className={`rounded-xl p-3 text-xl transition ${
                  isListening
                    ? "bg-red-600 text-white"
                    : "border border-slate-600 text-slate-300 hover:border-emerald-500"
                }`}
                title={isListening ? "Detener voz" : "Hablar"}
              >
                {isListening ? "⏹" : "🎤"}
              </button>
            </div>
            <button
              type="button"
              onClick={sendMessage}
              disabled={isBusy || !input.trim()}
              className="mt-3 w-full rounded-xl bg-emerald-500 py-3 text-base font-bold text-slate-950 disabled:opacity-40"
            >
              {isBusy ? "Procesando..." : "Enviar"}
            </button>
          </>
        )}
      </div>

      {tasks.length > 0 ? (
        <section className="mx-4 mt-4 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs uppercase tracking-widest text-slate-400">Tareas pendientes</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            {tasks.slice(0, 5).map((task) => (
              <li key={task.id}>• {task.title}{task.earTag ? ` (${task.earTag})` : ""}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
