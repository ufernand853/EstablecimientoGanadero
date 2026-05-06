"use client";

import { useEffect, useMemo, useState } from "react";
import { getApiUrl } from "../../lib/api-url";

const API_URL = getApiUrl();

type Establishment = { id: string; name: string };
type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type TaskStatus = "PENDING" | "IN_PROGRESS" | "DONE" | "CANCELLED" | "OVERDUE";

type FieldTask = {
  id: string;
  establishmentId: string;
  title: string;
  description: string | null;
  type: string;
  priority: TaskPriority;
  status: TaskStatus;
  scheduledAt: string | null;
  dueDate: string | null;
  completedAt: string | null;
  earTag: string | null;
  paddockName: string | null;
  createdAt: string;
};

const priorityLabels: Record<TaskPriority, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  URGENT: "Urgente",
};

const statusLabels: Record<TaskStatus, string> = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En curso",
  DONE: "Hecha",
  CANCELLED: "Cancelada",
  OVERDUE: "Vencida",
};

export default function GestionTareasPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [tasks, setTasks] = useState<FieldTask[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [visibleFilter, setVisibleFilter] = useState<"PENDING" | "DONE" | "ALL">("PENDING");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeTasks = useMemo(() => tasks.filter((task) => task.status !== "DONE" && task.status !== "CANCELLED"), [tasks]);
  const doneTasks = useMemo(() => tasks.filter((task) => task.status === "DONE"), [tasks]);
  const visibleTasks = useMemo(() => {
    if (visibleFilter === "PENDING") return activeTasks;
    if (visibleFilter === "DONE") return doneTasks;
    return tasks;
  }, [activeTasks, doneTasks, tasks, visibleFilter]);

  const loadTasks = async (targetEstablishmentId = establishmentId) => {
    if (!targetEstablishmentId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/tasks?establishmentId=${encodeURIComponent(targetEstablishmentId)}&limit=200`, { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudieron cargar las tareas.");
      const data = (await response.json()) as { tasks: FieldTask[] };
      setTasks(data.tasks ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch(`${API_URL}/establishments`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { establishments?: Establishment[] }) => {
        const list = data.establishments ?? [];
        setEstablishments(list);
        if (list[0]) {
          setEstablishmentId(list[0].id);
          return loadTasks(list[0].id);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("No se pudieron cargar los establecimientos.");
        setLoading(false);
      });
  }, []);

  const createTask = async () => {
    if (!establishmentId || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          establishmentId,
          title: title.trim(),
          description: description.trim() || null,
          priority,
          type: "FIELD_CHECK",
          source: "MANUAL",
        }),
      });
      if (!response.ok) throw new Error("No se pudo crear la tarea.");
      setTitle("");
      setDescription("");
      setPriority("MEDIUM");
      await loadTasks(establishmentId);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  };

  const createTaskWithAi = async () => {
    if (!establishmentId || !aiPrompt.trim()) return;
    setSaving(true);
    setError(null);
    setAiResponse(null);
    try {
      const response = await fetch(`${API_URL}/field/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ establishmentId, prompt: aiPrompt.trim() }),
      });
      if (!response.ok) throw new Error("No se pudo procesar la instrucción IA.");
      const data = (await response.json()) as { message?: string; task?: FieldTask; mode?: string };
      setAiResponse(data.message ?? "Instrucción procesada.");
      if (data.task) {
        setAiPrompt("");
        setVisibleFilter("PENDING");
        await loadTasks(establishmentId);
      }
    } catch (aiError) {
      setError(aiError instanceof Error ? aiError.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  };

  const completeTask = async (taskId: string) => {
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/tasks/${taskId}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes: "Cerrada desde modo gestión." }) });
      if (!response.ok) throw new Error("No se pudo cerrar la tarea.");
      await loadTasks(establishmentId);
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-widest text-emerald-400">Modo gestión</p>
          <h2 className="text-2xl font-semibold">Tareas del establecimiento</h2>
          <p className="mt-1 text-sm text-slate-400">Creá, priorizá y cerrá tareas operativas que también aparecen en modo campo. Las pendientes se muestran abajo por defecto.</p>
        </div>
        <select
          className="rounded bg-slate-900 px-3 py-2 text-sm text-slate-200"
          value={establishmentId}
          onChange={(event) => {
            setEstablishmentId(event.target.value);
            loadTasks(event.target.value);
          }}
        >
          {establishments.map((establishment) => <option key={establishment.id} value={establishment.id}>{establishment.name}</option>)}
        </select>
      </header>

      {error ? <section className="rounded border border-red-800 bg-red-950/50 p-4 text-sm text-red-200">{error}</section> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-widest text-slate-500">Pendientes</p>
          <p className="mt-2 text-3xl font-bold text-emerald-300">{activeTasks.length}</p>
        </div>
        <div className="rounded-lg bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-widest text-slate-500">Urgentes</p>
          <p className="mt-2 text-3xl font-bold text-red-300">{activeTasks.filter((task) => task.priority === "URGENT").length}</p>
        </div>
        <div className="rounded-lg bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-widest text-slate-500">Hechas</p>
          <p className="mt-2 text-3xl font-bold text-slate-200">{doneTasks.length}</p>
        </div>
      </section>

      <section className="rounded-lg border border-emerald-800 bg-emerald-950/20 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-emerald-400">Interfaz IA de gestión</p>
            <h3 className="mt-1 text-lg font-semibold">Cargar tareas por lenguaje natural</h3>
            <p className="mt-1 text-sm text-emerald-100/80">Ejemplos: “Crear tarea urgente verificar Potrero 1 mañana 8 hs” o “Agendar chequeo veterinario cría 858204790112”.</p>
          </div>
          <span className="rounded bg-slate-950 px-3 py-1 text-xs text-emerald-300">También queda visible en modo campo</span>
        </div>
        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          <textarea
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            placeholder="Escribí una instrucción para crear/cerrar tareas..."
            className="min-h-20 flex-1 rounded bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500"
          />
          <button type="button" onClick={createTaskWithAi} disabled={saving || !aiPrompt.trim()} className="rounded bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50">
            {saving ? "Procesando..." : "Crear con IA"}
          </button>
        </div>
        {aiResponse ? <p className="mt-3 whitespace-pre-wrap rounded border border-emerald-900 bg-slate-950 p-3 text-sm text-emerald-100">{aiResponse}</p> : null}
      </section>

      <section className="rounded-lg bg-slate-900 p-5">
        <h3 className="text-lg font-semibold">Crear tarea manual</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px]">
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej: Verificar Potrero 1" className="rounded bg-slate-800 px-3 py-2 text-sm text-white" />
          <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} className="rounded bg-slate-800 px-3 py-2 text-sm text-white">
            {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Detalle opcional" className="mt-3 min-h-20 w-full rounded bg-slate-800 px-3 py-2 text-sm text-white" />
        <button type="button" onClick={createTask} disabled={saving || !title.trim()} className="mt-3 rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{saving ? "Guardando..." : "Crear tarea"}</button>
      </section>

      <section className="rounded-lg bg-slate-900 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Tareas visibles</h3>
            <p className="text-sm text-slate-400">Por defecto ves solo pendientes/en curso/vencidas.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ["PENDING", `Pendientes (${activeTasks.length})`],
              ["DONE", `Hechas (${doneTasks.length})`],
              ["ALL", `Todas (${tasks.length})`],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setVisibleFilter(value as "PENDING" | "DONE" | "ALL")}
                className={`rounded px-3 py-1 text-xs ${visibleFilter === value ? "bg-emerald-500 font-semibold text-slate-950" : "border border-slate-700 text-slate-300"}`}
              >
                {label}
              </button>
            ))}
            <button type="button" onClick={() => loadTasks(establishmentId)} className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300">{loading ? "Cargando..." : "Recargar"}</button>
          </div>
        </div>
        <div className="space-y-2">
          {visibleTasks.map((task) => (
            <article key={task.id} className={`rounded-lg border p-4 ${task.priority === "URGENT" && task.status !== "DONE" ? "border-red-800 bg-red-950/30" : "border-slate-800 bg-slate-950/60"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-100">{task.title}</p>
                  {task.description ? <p className="mt-1 text-sm text-slate-400">{task.description}</p> : null}
                  <p className="mt-2 text-xs text-slate-500">{priorityLabels[task.priority]} · {statusLabels[task.status]}{task.paddockName ? ` · ${task.paddockName}` : ""}{task.earTag ? ` · ${task.earTag}` : ""}</p>
                </div>
                {task.status !== "DONE" ? <button type="button" disabled={saving} onClick={() => completeTask(task.id)} className="rounded bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">Marcar hecha</button> : null}
              </div>
            </article>
          ))}
          {!visibleTasks.length && !loading ? <p className="text-sm text-slate-500">No hay tareas para este filtro.</p> : null}
        </div>
      </section>
    </main>
  );
}
