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
  assignedRole: string | null;
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

const priorityStyles: Record<TaskPriority, { pill: string; border: string; dot: string; soft: string }> = {
  LOW: { pill: "bg-sky-500/15 text-sky-200 ring-sky-500/30", border: "border-sky-700/60", dot: "bg-sky-300", soft: "bg-sky-950/30" },
  MEDIUM: { pill: "bg-amber-500/15 text-amber-200 ring-amber-500/30", border: "border-amber-700/60", dot: "bg-amber-300", soft: "bg-amber-950/30" },
  HIGH: { pill: "bg-orange-500/15 text-orange-200 ring-orange-500/30", border: "border-orange-700/60", dot: "bg-orange-300", soft: "bg-orange-950/30" },
  URGENT: { pill: "bg-rose-500/15 text-rose-200 ring-rose-500/30", border: "border-rose-700/70", dot: "bg-rose-300", soft: "bg-rose-950/35" },
};

const statusStyles: Record<TaskStatus, string> = {
  PENDING: "bg-slate-700 text-slate-100",
  IN_PROGRESS: "bg-cyan-500/20 text-cyan-100",
  DONE: "bg-emerald-500/20 text-emerald-100",
  CANCELLED: "bg-slate-800 text-slate-400",
  OVERDUE: "bg-red-500/20 text-red-100",
};

const weekDayLabels = ["L", "M", "M", "J", "V", "S", "D"];

const padDatePart = (value: number) => value.toString().padStart(2, "0");

const toDateKey = (date: Date) => `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;

const getTaskDate = (task: FieldTask) => new Date(task.scheduledAt ?? task.dueDate ?? task.createdAt);

const getTaskDateKey = (task: FieldTask) => toDateKey(getTaskDate(task));

const getCalendarDays = (monthDate: Date) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - firstWeekday);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
};

const toDateTimeLocalValue = (date: Date) => {
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  const hours = padDatePart(date.getHours());
  const minutes = padDatePart(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const formatCalendarTitle = (date: Date) => date.toLocaleDateString("es-UY", { month: "long", year: "numeric" });

const formatTaskDate = (task: FieldTask) => getTaskDate(task).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function GestionTareasPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [tasks, setTasks] = useState<FieldTask[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [scheduledAtLocal, setScheduledAtLocal] = useState(() => toDateTimeLocalValue(new Date()));
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDateKey, setSelectedDateKey] = useState(() => toDateKey(new Date()));
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
  const calendarDays = useMemo(() => getCalendarDays(calendarMonth), [calendarMonth]);
  const tasksByDate = useMemo(() => visibleTasks.reduce<Record<string, FieldTask[]>>((groups, task) => {
    const key = getTaskDateKey(task);
    groups[key] = [...(groups[key] ?? []), task];
    return groups;
  }, {}), [visibleTasks]);
  const selectedTasks = useMemo(() => tasksByDate[selectedDateKey] ?? [], [selectedDateKey, tasksByDate]);
  const selectedDateLabel = useMemo(() => {
    const [year, month, day] = selectedDateKey.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("es-UY", { weekday: "long", day: "numeric", month: "long" });
  }, [selectedDateKey]);

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
          scheduledAt: scheduledAtLocal ? new Date(scheduledAtLocal).toISOString() : new Date().toISOString(),
          dueDate: scheduledAtLocal ? new Date(scheduledAtLocal).toISOString() : new Date().toISOString(),
          type: "FIELD_CHECK",
          source: "MANUAL",
        }),
      });
      if (!response.ok) throw new Error("No se pudo crear la tarea.");
      setTitle("");
      setDescription("");
      setPriority("MEDIUM");
      const nextDate = scheduledAtLocal ? new Date(scheduledAtLocal) : new Date();
      setSelectedDateKey(toDateKey(nextDate));
      setCalendarMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
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
          <p className="mt-1 text-sm text-slate-400">Creá, priorizá y cerrá tareas operativas en una vista calendario compacta para usar desde el celular.</p>
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

      <section className="rounded-lg bg-slate-900 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold">Crear tarea manual</h3>
            <p className="text-sm text-slate-400">Elegí día y hora para que la tarea quede ubicada en el calendario.</p>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">Alta rápida</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_190px]">
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej: Verificar Potrero 1" className="rounded bg-slate-800 px-3 py-2 text-sm text-white" />
          <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} className="rounded bg-slate-800 px-3 py-2 text-sm text-white">
            {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input
            type="datetime-local"
            value={scheduledAtLocal}
            onChange={(event) => {
              setScheduledAtLocal(event.target.value);
              if (event.target.value) {
                const nextDate = new Date(event.target.value);
                setSelectedDateKey(toDateKey(nextDate));
                setCalendarMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
              }
            }}
            className="rounded bg-slate-800 px-3 py-2 text-sm text-white"
          />
        </div>
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Detalle opcional" className="mt-3 min-h-16 w-full rounded bg-slate-800 px-3 py-2 text-sm text-white" />
        <button type="button" onClick={createTask} disabled={saving || !title.trim()} className="mt-3 w-full rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50 sm:w-auto">{saving ? "Guardando..." : "Crear tarea en calendario"}</button>
      </section>

      <section className="rounded-lg bg-slate-900 p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Calendario de tareas</h3>
            <p className="text-sm text-slate-400">Vista compacta por día. Los colores indican prioridad y estado.</p>
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

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <button type="button" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} className="rounded border border-slate-700 px-3 py-1 text-sm text-slate-300">←</button>
              <div className="text-center">
                <p className="text-sm font-semibold capitalize text-slate-100">{formatCalendarTitle(calendarMonth)}</p>
                <p className="text-xs text-slate-500">{visibleTasks.length} tarea(s) en el filtro</p>
              </div>
              <button type="button" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} className="rounded border border-slate-700 px-3 py-1 text-sm text-slate-300">→</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-slate-500">
              {weekDayLabels.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {calendarDays.map((date) => {
                const dateKey = toDateKey(date);
                const dayTasks = tasksByDate[dateKey] ?? [];
                const isSelected = dateKey === selectedDateKey;
                const isCurrentMonth = date.getMonth() === calendarMonth.getMonth();
                const isToday = dateKey === toDateKey(new Date());
                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => {
                      setSelectedDateKey(dateKey);
                      const currentTime = scheduledAtLocal?.split("T")[1] ?? "08:00";
                      setScheduledAtLocal(`${dateKey}T${currentTime}`);
                    }}
                    className={`min-h-[58px] rounded-lg border p-1 text-left transition ${isSelected ? "border-emerald-400 bg-emerald-500/15" : "border-slate-800 bg-slate-900/70"} ${!isCurrentMonth ? "opacity-40" : ""}`}
                    aria-label={`Ver tareas del ${date.toLocaleDateString("es-UY")}`}
                  >
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${isToday ? "bg-emerald-500 text-slate-950" : "text-slate-300"}`}>{date.getDate()}</span>
                    <span className="mt-1 flex flex-wrap gap-0.5">
                      {dayTasks.slice(0, 4).map((task) => <span key={task.id} className={`h-1.5 w-1.5 rounded-full ${task.status === "DONE" ? "bg-emerald-300" : priorityStyles[task.priority].dot}`} />)}
                      {dayTasks.length > 4 ? <span className="text-[9px] leading-none text-slate-400">+{dayTasks.length - 4}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
              {Object.entries(priorityLabels).map(([value, label]) => <span key={value} className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${priorityStyles[value as TaskPriority].dot}`} />{label}</span>)}
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-300" />Hecha</span>
            </div>
          </div>

          <aside className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-widest text-emerald-400">Día seleccionado</p>
                <h4 className="mt-1 text-base font-semibold capitalize text-slate-100">{selectedDateLabel}</h4>
              </div>
              <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">{selectedTasks.length}</span>
            </div>
            <div className="space-y-2">
              {selectedTasks.map((task) => (
                <article key={task.id} className={`rounded-lg border p-3 ${priorityStyles[task.priority].border} ${task.status === "DONE" ? "bg-emerald-950/20" : priorityStyles[task.priority].soft}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-100">{task.title}</p>
                      {task.description ? <p className="mt-1 line-clamp-2 text-xs text-slate-300">{task.description}</p> : null}
                    </div>
                    {task.status !== "DONE" ? <button type="button" disabled={saving} onClick={() => completeTask(task.id)} className="shrink-0 rounded bg-emerald-500 px-2 py-1 text-[11px] font-semibold text-slate-950 disabled:opacity-50">Hecha</button> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                    <span className={`rounded-full px-2 py-0.5 ring-1 ${priorityStyles[task.priority].pill}`}>{priorityLabels[task.priority]}</span>
                    <span className={`rounded-full px-2 py-0.5 ${statusStyles[task.status]}`}>{statusLabels[task.status]}</span>
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">{formatTaskDate(task)}</span>
                    {task.assignedRole ? <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">{task.assignedRole}</span> : null}
                    {task.paddockName ? <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">{task.paddockName}</span> : null}
                    {task.earTag ? <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">{task.earTag}</span> : null}
                  </div>
                </article>
              ))}
              {!selectedTasks.length && !loading ? <p className="rounded-lg border border-dashed border-slate-800 p-4 text-sm text-slate-500">No hay tareas para este día con el filtro actual.</p> : null}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
