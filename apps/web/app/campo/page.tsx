"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getApiUrl } from "../lib/api-url";
import { ScanWizard, type ScanContext, type Paddock } from "./ScanWizard";
import { offlineFetch, processQueue, getPendingCount } from "./offline-queue";

const API_URL = getApiUrl();

function cacheAnimalScan(establishmentId: string, earTag: string, ctx: ScanContext) {
  try { localStorage.setItem(`eg_scan_${establishmentId}_${earTag}`, JSON.stringify(ctx)); } catch {}
}

function lookupAnimalScan(establishmentId: string, earTag: string): ScanContext | null {
  try {
    const raw = localStorage.getItem(`eg_scan_${establishmentId}_${earTag}`);
    return raw ? (JSON.parse(raw) as ScanContext) : null;
  } catch { return null; }
}

type Establishment = { id: string; name: string };

type TraceabilityEventType =
  | "ASIGNACION_POTRERO"
  | "INSEMINACION"
  | "PREÑEZ_CONFIRMADA"
  | "VACUNACION_PENDIENTE"
  | "VACUNACION_REALIZADA"
  | "DESPARASITACION"
  | "TRATAMIENTO"
  | "PESAJE"
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
  PESAJE: "Pesaje",
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

type PendingAnimalRegistration = {
  animal: {
    establishmentId: string;
    earTag: string;
    name: string;
    sex?: "MACHO" | "HEMBRA" | "OTRO";
    category?: string | null;
    status?: "ACTIVO" | "VENDIDO" | "MUERTO";
    notes?: string | null;
  };
  traceabilityEvent: PendingEvent;
};
type PendingCommand = {
  establishmentId: string;
  confirmationToken: string;
  edits?: Record<string, unknown>;
};

type FieldTask = {
  id: string;
  establishmentId: string;
  title: string;
  description: string | null;
  type: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: "PENDING" | "IN_PROGRESS" | "DONE" | "CANCELLED" | "OVERDUE";
  scheduledAt: string | null;
  dueDate: string | null;
  earTag: string | null;
  paddockName: string | null;
  assignedRole: string | null;
  createdAt: string;
};

type FieldKpis = {
  totalAnimals: number;
  pregnantFemales: number;
  pendingTasks: number;
  urgentTasks: number;
};

type FieldConfirmationState = {
  token: string;
  message: string;
  title: string;
  sections: Array<{ label: string; value: string; severity?: "normal" | "warning" | "critical" }>;
  actionLabel: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
};

type Feedback = { kind: "success" | "info" | "error"; text: string };

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

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
    task.paddockName ? `Potrero: ${task.paddockName}` : null,
    task.assignedRole ? `Responsable: ${task.assignedRole}` : "Sin responsable",
    task.scheduledAt ? `Fecha: ${new Date(task.scheduledAt).toLocaleString("es-UY")}` : null,
    task.description ? `Qué hacer: ${task.description}` : null,
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
  const [pendingAnimalRegistration, setPendingAnimalRegistration] = useState<PendingAnimalRegistration | null>(null);
  const [pendingHerdResponse, setPendingHerdResponse] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<PendingCommand | null>(null);
  const [pendingFieldConfirmation, setPendingFieldConfirmation] = useState<FieldConfirmationState | null>(null);
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [fieldKpis, setFieldKpis] = useState<FieldKpis | null>(null);
  const [tasks, setTasks] = useState<FieldTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [scanInput, setScanInput] = useState("");
  const [scanLoading, setScanLoading] = useState(false);
  const [scanContext, setScanContext] = useState<ScanContext | null>(null);
  const [scanWizardOpen, setScanWizardOpen] = useState(false);
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done">("idle");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);

  // Load establishments — try cache first, then network
  useEffect(() => {
    try {
      const cached = localStorage.getItem("eg_establishments");
      if (cached) {
        const data = JSON.parse(cached) as Establishment[];
        if (Array.isArray(data) && data.length > 0) {
          setEstablishments(data);
          setEstablishment(data[0]);
        }
      }
    } catch {}

    fetch(`${API_URL}/establishments`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.establishments) && data.establishments.length > 0) {
          setEstablishments(data.establishments);
          setEstablishment(data.establishments[0]);
          try { localStorage.setItem("eg_establishments", JSON.stringify(data.establishments)); } catch {}
        }
      })
      .catch(() => {});
  }, []);

  // Load recent events when establishment changes — try cache first
  useEffect(() => {
    if (!establishment) return;
    try {
      const cached = localStorage.getItem(`eg_events_${establishment.id}`);
      if (cached) setRecentEvents(JSON.parse(cached) as RecentEvent[]);
    } catch {}

    fetch(`${API_URL}/traceability/events?establishmentId=${establishment.id}&limit=5`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.events)) {
          setRecentEvents(data.events as RecentEvent[]);
          try { localStorage.setItem(`eg_events_${establishment.id}`, JSON.stringify(data.events)); } catch {}
        }
      })
      .catch(() => {});
  }, [establishment]);

  const refreshFieldData = useCallback(() => {
    if (!establishment) return;

    // Seed from cache so UI is usable offline immediately
    try {
      const cachedKpis = localStorage.getItem(`eg_kpis_${establishment.id}`);
      if (cachedKpis) setFieldKpis(JSON.parse(cachedKpis) as FieldKpis);
      const cachedTasks = localStorage.getItem(`eg_tasks_${establishment.id}`);
      if (cachedTasks) setTasks(JSON.parse(cachedTasks) as FieldTask[]);
      const cachedPaddocks = localStorage.getItem(`eg_paddocks_${establishment.id}`);
      if (cachedPaddocks) setPaddocks(JSON.parse(cachedPaddocks) as Paddock[]);
    } catch {}

    const query = `establishmentId=${encodeURIComponent(establishment.id)}`;
    Promise.all([
      fetch(`${API_URL}/field/day-start?${query}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`${API_URL}/tasks?${query}&limit=5`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`${API_URL}/paddocks?${query}`, { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([dashboard, taskData, paddockData]) => {
        if (dashboard?.kpis) {
          setFieldKpis(dashboard.kpis as FieldKpis);
          try { localStorage.setItem(`eg_kpis_${establishment.id}`, JSON.stringify(dashboard.kpis)); } catch {}
        }
        if (Array.isArray(taskData.tasks)) {
          const filtered = (taskData.tasks as FieldTask[]).filter((task) => task.status === "PENDING" || task.status === "IN_PROGRESS" || task.status === "OVERDUE");
          setTasks(filtered);
          try { localStorage.setItem(`eg_tasks_${establishment.id}`, JSON.stringify(filtered)); } catch {}
        }
        if (Array.isArray(paddockData.paddocks)) {
          setPaddocks(paddockData.paddocks as Paddock[]);
          try { localStorage.setItem(`eg_paddocks_${establishment.id}`, JSON.stringify(paddockData.paddocks)); } catch {}
        }
      })
      .catch(() => {});
  }, [establishment]);

  useEffect(() => {
    refreshFieldData();
  }, [refreshFieldData]);

  useEffect(() => {
    setChatHistory([]);
  }, [establishment?.id]);

  const refreshRecentEvents = useCallback(() => {
    if (!establishment) return;
    fetch(`${API_URL}/traceability/events?establishmentId=${establishment.id}&limit=5`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.events)) {
          setRecentEvents(data.events as RecentEvent[]);
          try { localStorage.setItem(`eg_events_${establishment.id}`, JSON.stringify(data.events)); } catch {}
        }
      })
      .catch(() => {});
  }, [establishment]);

  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  }, []);

  const syncQueue = useCallback(async () => {
    setSyncStatus("syncing");
    const { processed } = await processQueue(API_URL);
    await refreshPendingCount();
    setSyncStatus("done");
    if (processed > 0) {
      refreshRecentEvents();
      refreshFieldData();
    }
    setTimeout(() => setSyncStatus((s) => (s === "done" ? "idle" : s)), 3000);
  }, [refreshPendingCount, refreshRecentEvents, refreshFieldData]);

  // Warm animal cache when online so scans work offline
  useEffect(() => {
    if (!establishment || !isOnline) return;
    fetch(`${API_URL}/animals?establishmentId=${establishment.id}&limit=500`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data.animals)) return;
        for (const a of data.animals as Array<{ id: string; earTag: string; status: string; category?: string; sex?: string }>) {
          // Preserve richer cached entries (those have lastKnownPaddock / lastEvent from scan)
          const existing = lookupAnimalScan(establishment.id, a.earTag);
          if (!existing) {
            cacheAnimalScan(establishment.id, a.earTag, {
              earTag: a.earTag,
              animal: { exists: true, id: a.id, status: a.status, category: a.category, sex: a.sex, lastKnownPaddock: null, lastEvent: null },
            });
          }
        }
      })
      .catch(() => {});
  }, [establishment, isOnline]);

  // Track online/offline and auto-sync on reconnect
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      getPendingCount().then((count) => {
        if (count > 0) syncQueue();
      });
    };
    const handleOffline = () => setIsOnline(false);
    setIsOnline(navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    getPendingCount().then(setPendingCount);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncQueue]);

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
    setPendingCommand(null);
    setPendingAnimalRegistration(null);
    setPendingFieldConfirmation(null);

    try {
      const previousHistory = chatHistory.slice(-20);
      setChatHistory((prev) => [...prev, { role: "user", content: prompt }]);

      const res = await fetch(`${API_URL}/field/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ establishmentId: establishment.id, prompt, history: previousHistory }),
      });

      const data = (await res.json()) as {
        response?: string;
        message?: string;
        earTag?: string;
        detectedEventType?: string;
        task?: FieldTask;
        confirmation?: { token: string; actionLabel: string; riskLevel: "LOW" | "MEDIUM" | "HIGH" };
        preview?: { title: string; sections: Array<{ label: string; value: string; severity?: "normal" | "warning" | "critical" }> };
        suggestedApiCall?: {
          endpoint: string;
          requestPreview?: PendingEvent | PendingCommand | PendingAnimalRegistration;
        };
      };

      const assistantMessage = data.message ?? data.response ?? "Sin respuesta.";

      if (data.confirmation) {
        setChatHistory((prev) => [...prev, { role: "assistant", content: assistantMessage }]);
        setPendingFieldConfirmation({
          token: data.confirmation.token,
          message: assistantMessage,
          title: data.preview?.title ?? "Confirmar acción",
          sections: data.preview?.sections ?? [],
          actionLabel: data.confirmation.actionLabel,
          riskLevel: data.confirmation.riskLevel,
        });
      } else if (data.earTag && data.suggestedApiCall?.endpoint === "/animals + /traceability/events" && data.suggestedApiCall.requestPreview) {
        setChatHistory((prev) => [...prev, { role: "assistant", content: assistantMessage }]);
        setPendingAnimalRegistration(data.suggestedApiCall.requestPreview as PendingAnimalRegistration);
      } else if (data.earTag && data.suggestedApiCall?.endpoint === "/traceability/events" && data.suggestedApiCall.requestPreview) {
        setChatHistory((prev) => [...prev, { role: "assistant", content: assistantMessage }]);
        setPendingEvent(data.suggestedApiCall.requestPreview as PendingEvent);
      } else if (data.suggestedApiCall?.endpoint === "/commands/confirm") {
        setChatHistory((prev) => [...prev, { role: "assistant", content: assistantMessage }]);
        setPendingHerdResponse(assistantMessage);
        setPendingCommand((data.suggestedApiCall.requestPreview as PendingCommand | undefined) ?? null);
      } else {
        setChatHistory((prev) => [...prev, { role: "assistant", content: assistantMessage }]);
        if (data.task) {
          setFeedback({ kind: "success", text: assistantMessage });
          refreshFieldData();
        }
      }
    } catch {
      setFeedback({ kind: "error", text: "No se pudo conectar con el servidor." });
      setChatHistory((prev) => [...prev, { role: "assistant", content: "No se pudo conectar con el servidor." }]);
    } finally {
      setStatus("idle");
    }
  };

  const completeTask = async (taskId: string) => {
    setStatus("sending");
    try {
      const res = await fetch(`${API_URL}/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Cerrada desde modo campo." }),
      });
      if (!res.ok) throw new Error("No se pudo marcar la tarea como cumplida.");
      setFeedback({ kind: "success", text: "Tarea marcada como cumplida." });
      refreshFieldData();
    } catch (completeError) {
      setFeedback({ kind: "error", text: completeError instanceof Error ? completeError.message : "No se pudo marcar la tarea como cumplida." });
    } finally {
      setStatus("idle");
    }
  };

  const confirmEvent = async () => {
    if (!pendingEvent) return;
    setStatus("sending");

    try {
      const result = await offlineFetch(
        API_URL,
        "/traceability/events",
        "POST",
        pendingEvent,
        `${EVENT_LABELS[pendingEvent.type]} ${pendingEvent.earTag}`,
      );

      if (result.ok) {
        if (result.queued) {
          await refreshPendingCount();
        }
        if (selectedTaskId && !result.queued) {
          try {
            await fetch(`${API_URL}/tasks/${selectedTaskId}/complete`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ notes: `Cerrada al confirmar ${EVENT_LABELS[pendingEvent.type]} de ${pendingEvent.earTag}` }),
            });
            setSelectedTaskId("");
          } catch {
            // ignore task completion issues
          }
        }
        setFeedback({
          kind: "success",
          text: result.queued
            ? `${pendingEvent.earTag} — ${EVENT_LABELS[pendingEvent.type]} en cola (sin conexión).`
            : `${pendingEvent.earTag} — ${EVENT_LABELS[pendingEvent.type]} guardado.`,
        });
        if (!result.queued) {
          refreshRecentEvents();
          refreshFieldData();
        }
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

  const confirmAnimalRegistration = async () => {
    if (!pendingAnimalRegistration) return;
    setStatus("sending");

    try {
      const animalResult = await offlineFetch(
        API_URL,
        "/animals",
        "POST",
        pendingAnimalRegistration.animal,
        `Alta ${pendingAnimalRegistration.animal.earTag}`,
      );
      if (!animalResult.ok) throw new Error("No se pudo dar de alta el animal.");

      const eventResult = await offlineFetch(
        API_URL,
        "/traceability/events",
        "POST",
        pendingAnimalRegistration.traceabilityEvent,
        `Potrero ${pendingAnimalRegistration.animal.earTag}`,
      );
      if (!eventResult.ok) throw new Error("El animal fue dado de alta, pero no se pudo asociar el potrero.");

      const queued = animalResult.queued || eventResult.queued;
      if (queued) await refreshPendingCount();

      const summary = queued
        ? `${pendingAnimalRegistration.animal.earTag} — alta en cola (sin conexión).`
        : `${pendingAnimalRegistration.animal.earTag} — alta guardada y asociada a ${pendingAnimalRegistration.traceabilityEvent.paddockName ?? "Temporal"}.`;
      setFeedback({ kind: "success", text: summary });
      setChatHistory((prev) => [...prev, { role: "assistant", content: summary }]);
      if (!queued) {
        refreshRecentEvents();
        refreshFieldData();
      }
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "No se pudo confirmar el alta del animal." });
    } finally {
      setPendingAnimalRegistration(null);
      setStatus("idle");
    }
  };

  const confirmFieldAction = async () => {
    if (!pendingFieldConfirmation || !establishment) return;
    setStatus("sending");
    try {
      const res = await fetch(`${API_URL}/field/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ establishmentId: establishment.id, confirmationToken: pendingFieldConfirmation.token }),
      });
      if (!res.ok) throw new Error("No se pudo confirmar la acción.");
      const data = (await res.json()) as { summary?: string };
      setFeedback({ kind: "success", text: data.summary ?? "Acción confirmada." });
      setChatHistory((prev) => [...prev, { role: "assistant", content: data.summary ?? "Acción confirmada." }]);
      setPendingFieldConfirmation(null);
      refreshRecentEvents();
      refreshFieldData();
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "No se pudo confirmar." });
    } finally {
      setStatus("idle");
    }
  };

  const cancelPending = () => {
    setPendingEvent(null);
    setPendingHerdResponse(null);
    setPendingCommand(null);
    setPendingAnimalRegistration(null);
    setPendingFieldConfirmation(null);
    setFeedback(null);
  };

  const handleScan = async () => {
    const code = scanInput.trim().toUpperCase();
    if (!code || !establishment || scanLoading) return;
    setScanLoading(true);
    setFeedback(null);

    // Offline path: resolve from local cache
    if (!navigator.onLine) {
      const cached = lookupAnimalScan(establishment.id, code);
      if (cached) {
        setScanContext(cached);
        setFeedback({ kind: "info", text: "Sin conexión — datos en caché. El registro se guardará localmente." });
      } else {
        setScanContext({ earTag: code, animal: { exists: false } });
        setFeedback({ kind: "info", text: "Sin conexión — animal desconocido. El registro se guardará localmente." });
      }
      setScanWizardOpen(true);
      setScanInput("");
      setScanLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/field/scans/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ establishmentId: establishment.id, rawCode: code, source: "RFID_SCANNER" }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(d?.message ?? "No se pudo consultar la caravana.");
      }
      const data = (await res.json()) as { earTag: string; animal: ScanContext["animal"] };
      const ctx: ScanContext = { earTag: data.earTag, animal: data.animal };
      // Cache for future offline use
      cacheAnimalScan(establishment.id, data.earTag, ctx);
      setScanContext(ctx);
      setScanWizardOpen(true);
      setScanInput("");
    } catch {
      // Network failed mid-request — fall back to cache
      const cached = lookupAnimalScan(establishment.id, code);
      if (cached) {
        setScanContext(cached);
        setScanWizardOpen(true);
        setScanInput("");
        setFeedback({ kind: "info", text: "Sin conexión — datos en caché. El registro se guardará localmente." });
      } else {
        setScanContext({ earTag: code, animal: { exists: false } });
        setScanWizardOpen(true);
        setScanInput("");
        setFeedback({ kind: "info", text: "Sin conexión — caravana no encontrada en caché. Podés registrar igual." });
      }
    } finally {
      setScanLoading(false);
    }
  };


  const confirmHerdOperation = async () => {
    if (!pendingCommand) return;
    setStatus("sending");
    try {
      const res = await fetch(`${API_URL}/commands/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingCommand),
      });
      const data = (await res.json().catch(() => null)) as { summary?: string; message?: string } | null;
      if (res.ok) {
        setFeedback({ kind: "success", text: data?.summary ?? "Operación de lote confirmada." });
      } else {
        setFeedback({ kind: "error", text: data?.message ?? "No se pudo confirmar la operación de lote." });
      }
    } catch {
      setFeedback({ kind: "error", text: "Error de conexión al confirmar la operación de lote." });
    } finally {
      setPendingHerdResponse(null);
      setPendingCommand(null);
      setPendingAnimalRegistration(null);
      setPendingFieldConfirmation(null);
      setStatus("idle");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const isBusy = status === "sending";
  const hasPending = pendingEvent !== null || pendingAnimalRegistration !== null || pendingHerdResponse !== null || pendingFieldConfirmation !== null;
  const quickPrompts = [
    "Que tareas tengo hoy?",
    "Registrar observacion para la caravana 858001001001",
    "Necesito revisar terneros en Potrero Norte",
  ];

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
      </header>

      {fieldKpis ? (
        <section className="grid grid-cols-4 gap-2 px-4 pt-4">
          {[
            ["RODEO", fieldKpis.totalAnimals],
            ["PREÑEZ", fieldKpis.pregnantFemales],
            ["PEND.", fieldKpis.pendingTasks],
            ["URG.", fieldKpis.urgentTasks],
          ].map(([label, value]) => (
            <div key={label} className={`rounded-lg p-3 ${label === "URG." && Number(value) > 0 ? "bg-red-950/70" : label === "PEND." && Number(value) > 0 ? "bg-amber-950/70" : "bg-emerald-950/40"}`}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{label}</p>
              <p className="text-xl font-bold text-emerald-300">{value}</p>
            </div>
          ))}
        </section>
      ) : null}

      <section className="px-4 pt-4">
        <div className="grid gap-3 md:grid-cols-3">
          <article className="rounded-xl border border-emerald-800/60 bg-emerald-950/20 p-4">
            <p className="text-xs uppercase tracking-widest text-emerald-300">Modo Campo</p>
            <p className="mt-2 text-sm text-slate-200">Pensado para usar con el telefono en recorrida, manga o potrero.</p>
          </article>
          <article className="rounded-xl border border-slate-800 bg-slate-900 p-4 md:col-span-2">
            <p className="text-xs uppercase tracking-widest text-slate-400">Explorar la demo</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 transition hover:border-emerald-500"
                  onClick={() => {
                    setInput(prompt);
                    inputRef.current?.focus();
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </article>
        </div>
      </section>

      {/* Offline / sync banner */}
      {!isOnline ? (
        <div className="mx-4 mt-3 flex items-center justify-between rounded-lg border border-amber-700 bg-amber-950/40 px-3 py-2">
          <p className="text-xs font-semibold text-amber-200">
            Sin conexión
            {pendingCount > 0 ? ` — ${pendingCount} operación${pendingCount === 1 ? "" : "es"} en cola` : " — las acciones se guardarán localmente"}
          </p>
        </div>
      ) : syncStatus === "syncing" ? (
        <div className="mx-4 mt-3 rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2">
          <p className="text-xs font-semibold text-emerald-300">Sincronizando operaciones pendientes...</p>
        </div>
      ) : syncStatus === "done" ? (
        <div className="mx-4 mt-3 flex items-center justify-between rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2">
          <p className="text-xs font-semibold text-emerald-300">Sincronizado correctamente.</p>
        </div>
      ) : pendingCount > 0 ? (
        <div className="mx-4 mt-3 flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
          <p className="text-xs text-slate-400">{pendingCount} operación{pendingCount === 1 ? "" : "es"} pendiente{pendingCount === 1 ? "" : "s"} de sincronizar</p>
          <button
            type="button"
            onClick={syncQueue}
            className="rounded bg-emerald-700 px-2 py-1 text-[10px] font-semibold text-white"
          >
            Sincronizar
          </button>
        </div>
      ) : null}

      {/* Scanner section */}
      <section className="px-4 pt-4">
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
          <p className="mb-2 text-xs uppercase tracking-widest text-slate-500">Bastón / Escáner RFID</p>
          <div className="flex gap-2">
            <input
              ref={scanInputRef}
              type="text"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleScan(); } }}
              placeholder="Pegá o escribí la caravana..."
              disabled={!establishment || scanLoading}
              className="flex-1 rounded-lg bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
              autoComplete="off"
              autoCapitalize="off"
            />
            <button
              type="button"
              onClick={handleScan}
              disabled={!establishment || scanLoading || !scanInput.trim()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {scanLoading ? "..." : "Leer"}
            </button>
          </div>
          {scanContext && !scanWizardOpen ? (
            <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-950/40 px-3 py-2">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-emerald-400">Última lectura</p>
                <p className="text-sm font-bold text-white">{scanContext.earTag}</p>
                {scanContext.animal.category ? (
                  <p className="text-xs capitalize text-slate-400">
                    {scanContext.animal.category}
                    {scanContext.animal.lastKnownPaddock ? ` — ${scanContext.animal.lastKnownPaddock}` : ""}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setScanWizardOpen(true)}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
                >
                  Registrar
                </button>
                <button
                  type="button"
                  onClick={() => setScanContext(null)}
                  className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-400"
                >
                  ✕
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* Tareas pendientes — colapsable */}
      <section className="px-4 pt-4">
        <div className="rounded-xl border border-amber-800 bg-amber-950/20">
          <div className="flex items-center gap-2 px-4 py-3">
            <button
              type="button"
              onClick={() => setTasksOpen((o) => !o)}
              className="flex flex-1 items-center gap-2 text-left"
            >
              <span className="text-xs font-semibold uppercase tracking-widest text-amber-400">Tareas pendientes</span>
              {tasks.length > 0 ? (
                <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">{tasks.length}</span>
              ) : null}
              <span className="ml-auto text-xs text-amber-500">{tasksOpen ? "▲" : "▼"}</span>
            </button>
            <button
              type="button"
              onClick={refreshFieldData}
              className="shrink-0 rounded border border-slate-700 px-2 py-1 text-xs text-slate-400"
              title="Actualizar"
            >
              ↺
            </button>
          </div>
          {tasksOpen ? (
            <div className="space-y-2 px-4 pb-4">
              {tasks.length ? tasks.map((task) => (
                <article key={task.id} className="rounded-lg bg-slate-900 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{task.title}</p>
                      {task.description ? <p className="mt-1 text-xs text-slate-400">{task.description}</p> : null}
                      <p className="mt-2 text-xs text-slate-500">
                        {task.scheduledAt ? `Fecha: ${new Date(task.scheduledAt).toLocaleString("es-UY")}` : "Sin fecha"}
                        {task.assignedRole ? ` · Responsable: ${task.assignedRole}` : " · Sin responsable"}
                        {task.paddockName ? ` · ${task.paddockName}` : ""}
                        {task.earTag ? ` · ${task.earTag}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => completeTask(task.id)}
                      disabled={isBusy}
                      className="shrink-0 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"
                    >
                      Cumplida
                    </button>
                  </div>
                </article>
              )) : <p className="text-sm text-slate-500">No hay tareas pendientes.</p>}
            </div>
          ) : null}
        </div>
      </section>

      {/* Últimas acciones — colapsable */}
      <section className="px-4 pt-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50">
          <button
            type="button"
            onClick={() => setEventsOpen((o) => !o)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left"
          >
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Últimas acciones</span>
            {recentEvents.length > 0 ? (
              <span className="rounded-full bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold text-slate-200">{recentEvents.length}</span>
            ) : null}
            <span className="ml-auto text-xs text-slate-500">{eventsOpen ? "▲" : "▼"}</span>
          </button>
          {eventsOpen ? (
            <div className="space-y-2 px-4 pb-4">
              {recentEvents.length > 0 ? recentEvents.map((ev) => (
                <div key={ev.id} className="flex items-baseline justify-between rounded-lg bg-slate-800 px-3 py-2">
                  <div>
                    <span className="text-sm font-semibold text-emerald-300">{ev.earTag}</span>
                    <span className="ml-2 text-sm text-slate-200">{EVENT_LABELS[ev.type]}</span>
                    {ev.notes ? <span className="ml-2 text-xs text-slate-400">{ev.notes}</span> : null}
                  </div>
                  <time className="ml-4 shrink-0 text-xs text-slate-500">
                    {new Date(ev.occurredAt).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}
                  </time>
                </div>
              )) : <p className="text-xs text-slate-600">Sin acciones recientes.</p>}
            </div>
          ) : null}
        </div>
      </section>

      {chatHistory.length > 0 ? (
        <section className="mx-4 mt-4 space-y-2">
          <p className="text-xs uppercase tracking-widest text-slate-500">Conversación reciente</p>
          {chatHistory.slice(-6).map((item, index) => (
            <div
              key={`${item.role}-${index}-${item.content.slice(0, 12)}`}
              className={`rounded-lg px-3 py-2 text-sm ${
                item.role === "user"
                  ? "ml-8 bg-emerald-950/40 text-emerald-100 border border-emerald-800"
                  : "mr-8 bg-slate-900 text-slate-200 border border-slate-700"
              }`}
            >
              <p className="text-[10px] uppercase tracking-widest opacity-70">{item.role === "user" ? "Vos" : "IA"}</p>
              <p className="mt-1 whitespace-pre-wrap">{item.content}</p>
            </div>
          ))}
        </section>
      ) : null}

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

      {pendingFieldConfirmation ? (
        <div className={`mx-4 mt-4 rounded-xl border-2 p-5 ${pendingFieldConfirmation.riskLevel === "HIGH" ? "border-red-700 bg-red-950/30" : "border-emerald-700 bg-slate-900"}`}>
          <p className="text-xs uppercase tracking-widest text-emerald-400">Confirmar acción</p>
          <p className="mt-3 text-xl font-bold text-white">{pendingFieldConfirmation.title}</p>
          <p className="mt-2 text-sm text-slate-300">{pendingFieldConfirmation.message}</p>
          <div className="mt-4 space-y-2">
            {pendingFieldConfirmation.sections.map((section) => (
              <div key={`${section.label}-${section.value}`} className={`flex justify-between rounded-lg px-3 py-2 text-sm ${section.severity === "critical" ? "bg-red-950/70 text-red-100" : section.severity === "warning" ? "bg-amber-950/70 text-amber-100" : "bg-slate-800 text-slate-200"}`}>
                <span className="text-slate-400">{section.label}</span>
                <span className="font-semibold">{section.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={confirmFieldAction}
              disabled={isBusy}
              className="flex-1 rounded-xl bg-emerald-500 py-3 text-base font-bold text-slate-950 disabled:opacity-50"
            >
              {isBusy ? "Confirmando..." : pendingFieldConfirmation.actionLabel}
            </button>
            <button type="button" onClick={cancelPending} className="rounded-xl border border-slate-600 px-5 py-3 text-base text-slate-300">
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {/* Pending animal registration */}
      {pendingAnimalRegistration ? (
        <div className="mx-4 mt-4 rounded-xl border-2 border-emerald-700 bg-slate-900 p-5">
          <p className="text-xs uppercase tracking-widest text-emerald-400">Confirmar alta</p>
          <p className="mt-3 text-2xl font-bold text-white">{pendingAnimalRegistration.animal.earTag}</p>
          <p className="mt-1 text-lg text-emerald-300">Alta de animal y asignación a potrero</p>
          <div className="mt-4 space-y-2">
            <div className="flex justify-between rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-200">
              <span className="text-slate-400">Categoría</span>
              <span className="font-semibold">{pendingAnimalRegistration.animal.category ?? "Sin informar"}</span>
            </div>
            <div className="flex justify-between rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-200">
              <span className="text-slate-400">Potrero</span>
              <span className="font-semibold">{pendingAnimalRegistration.traceabilityEvent.paddockName ?? "Temporal"}</span>
            </div>
          </div>
          {pendingAnimalRegistration.animal.notes ? <p className="mt-3 text-sm text-slate-400">{pendingAnimalRegistration.animal.notes}</p> : null}
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={confirmAnimalRegistration}
              disabled={isBusy}
              className="flex-1 rounded-xl bg-emerald-500 py-3 text-base font-bold text-slate-950 disabled:opacity-50"
            >
              {isBusy ? "Guardando..." : "Confirmar alta"}
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
          <div className="mt-3 flex gap-4">
            <button
              type="button"
              onClick={confirmHerdOperation}
              disabled={isBusy || !pendingCommand}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"
            >
              {isBusy ? "Confirmando..." : "Confirmar lote"}
            </button>
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

      {scanContext && scanWizardOpen ? (
        <ScanWizard
          context={scanContext}
          establishmentId={establishment?.id ?? ""}
          paddocks={paddocks}
          onDone={(summary) => {
            setScanWizardOpen(false);
            setScanContext(null);
            setFeedback({ kind: "success", text: summary });
            // Refresh pending count in case we queued something
            refreshPendingCount();
            if (isOnline) {
              refreshRecentEvents();
              refreshFieldData();
            }
          }}
          onCancel={() => setScanWizardOpen(false)}
        />
      ) : null}
    </main>
  );
}
