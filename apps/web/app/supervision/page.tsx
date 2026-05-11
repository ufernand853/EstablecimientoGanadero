"use client";

import { useEffect, useMemo, useState } from "react";
import { getApiUrl } from "../lib/api-url";
import { withBasePath } from "../lib/base-path";

const API_URL = getApiUrl();

type Establishment = { id: string; name: string };
type FieldTask = { id: string; title: string; description: string | null; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; status: string; dueDate: string | null; scheduledAt: string | null; assignedRole: string | null; paddockName: string | null; earTag: string | null };
type Notification = { id: string; severity: "INFO" | "WARNING" | "CRITICAL" | string; title: string; message: string; dueDate: string; sourceId: string; type: string };
type Kpis = { totalAnimals: number; pregnantFemales: number; pendingTasks: number; urgentTasks: number };

const priorityClass = (priority: string) => {
  if (priority === "URGENT") return "bg-rose-500 text-white";
  if (priority === "HIGH") return "bg-amber-500 text-slate-950";
  if (priority === "LOW") return "bg-slate-700 text-slate-100";
  return "bg-emerald-500 text-slate-950";
};

const severityClass = (severity: string) => {
  if (severity === "CRITICAL") return "border-rose-700 bg-rose-950/40";
  if (severity === "WARNING") return "border-amber-700 bg-amber-950/40";
  return "border-sky-700 bg-sky-950/40";
};

export default function SupervisionPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [tasks, setTasks] = useState<FieldTask[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const overdueTasks = useMemo(() => tasks.filter((task) => task.dueDate && new Date(task.dueDate).getTime() < Date.now() && task.status !== "DONE"), [tasks]);
  const urgentTasks = useMemo(() => tasks.filter((task) => task.priority === "URGENT" || task.priority === "HIGH"), [tasks]);

  const loadData = async (targetEstablishmentId = establishmentId) => {
    if (!targetEstablishmentId) return;
    setError(null);
    const query = `establishmentId=${encodeURIComponent(targetEstablishmentId)}`;
    const [tasksRes, notificationsRes, kpisRes] = await Promise.all([
      fetch(`${API_URL}/tasks?${query}&limit=50`, { cache: "no-store" }),
      fetch(`${API_URL}/notifications?${query}&days=30`, { cache: "no-store" }),
      fetch(`${API_URL}/field/day-start?${query}`, { cache: "no-store" }),
    ]);
    if (!tasksRes.ok || !notificationsRes.ok || !kpisRes.ok) throw new Error("No se pudo cargar supervisión.");
    const taskData = (await tasksRes.json()) as { tasks: FieldTask[] };
    const notificationData = (await notificationsRes.json()) as { notifications: Notification[] };
    const kpiData = (await kpisRes.json()) as { kpis?: Kpis };
    setTasks((taskData.tasks ?? []).filter((task) => task.status !== "DONE" && task.status !== "CANCELLED"));
    setNotifications(notificationData.notifications ?? []);
    setKpis(kpiData.kpis ?? null);
  };

  useEffect(() => {
    fetch(`${API_URL}/establishments`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { establishments?: Establishment[] }) => {
        const list = data.establishments ?? [];
        setEstablishments(list);
        if (list[0]) {
          setEstablishmentId(list[0].id);
          return loadData(list[0].id);
        }
        return undefined;
      })
      .catch(() => setError("No se pudieron cargar establecimientos."));
  }, []);

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
      const data = (await response.json()) as { message?: string; response?: string; task?: FieldTask };
      setAiResponse(data.message ?? data.response ?? "Instrucción procesada.");
      setAiPrompt("");
      await loadData(establishmentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  };

  const completeTask = async (taskId: string) => {
    const response = await fetch(`${API_URL}/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Cerrada desde supervisión." }),
    });
    if (!response.ok) {
      setError("No se pudo cerrar la tarea.");
      return;
    }
    await loadData(establishmentId);
  };

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-widest text-emerald-400">Supervisor</p>
          <h2 className="text-2xl font-semibold">Modo IA, tareas y vencimientos</h2>
          <p className="mt-1 text-sm text-slate-400">Asigná tareas, controlá vencimientos y monitoreá notificaciones operativas.</p>
        </div>
        <select className="rounded bg-slate-900 px-3 py-2 text-sm" value={establishmentId} onChange={(event) => { setEstablishmentId(event.target.value); loadData(event.target.value).catch(() => setError("No se pudo cargar supervisión.")); }}>
          {establishments.map((establishment) => <option key={establishment.id} value={establishment.id}>{establishment.name}</option>)}
        </select>
      </header>

      {error ? <p className="rounded border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</p> : null}

      <section className="grid gap-3 md:grid-cols-4">
        <article className="rounded-lg bg-slate-900 p-4"><p className="text-xs text-slate-400">Animales</p><p className="text-2xl font-semibold">{kpis?.totalAnimals ?? "—"}</p></article>
        <article className="rounded-lg bg-slate-900 p-4"><p className="text-xs text-slate-400">Preñadas</p><p className="text-2xl font-semibold">{kpis?.pregnantFemales ?? "—"}</p></article>
        <article className="rounded-lg bg-slate-900 p-4"><p className="text-xs text-slate-400">Tareas pendientes</p><p className="text-2xl font-semibold">{kpis?.pendingTasks ?? tasks.length}</p></article>
        <article className="rounded-lg bg-slate-900 p-4"><p className="text-xs text-slate-400">Urgentes</p><p className="text-2xl font-semibold">{kpis?.urgentTasks ?? urgentTasks.length}</p></article>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-lg bg-slate-900 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-emerald-300">Asignar y consultar con IA</h3>
            <a className="rounded border border-slate-700 px-3 py-1 text-xs" href={withBasePath("/commands")}>Abrir Modo IA completo</a>
          </div>
          <textarea className="mt-3 min-h-28 w-full rounded bg-slate-800 p-3 text-sm" placeholder="Ej: Creá una tarea urgente para revisar vaquillonas mañana a las 8. O: qué insumos vencen esta semana?" value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} />
          <button className="mt-3 rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950" onClick={createTaskWithAi} disabled={saving}>{saving ? "Procesando..." : "Procesar con IA"}</button>
          {aiResponse ? <p className="mt-3 rounded border border-emerald-800 bg-emerald-950/40 p-3 text-sm text-emerald-100">{aiResponse}</p> : null}
        </article>

        <article className="rounded-lg bg-slate-900 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-emerald-300">Notificaciones</h3>
            <a className="rounded border border-slate-700 px-3 py-1 text-xs" href={withBasePath("/insumos")}>Ver insumos</a>
          </div>
          <div className="mt-3 grid gap-2">
            {notifications.length === 0 ? <p className="text-sm text-slate-400">Sin alertas próximas.</p> : null}
            {notifications.slice(0, 6).map((notification) => (
              <div key={notification.id} className={`rounded border p-3 text-sm ${severityClass(notification.severity)}`}>
                <p className="font-semibold">{notification.title}</p>
                <p className="text-slate-300">{notification.message}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg bg-slate-900 p-4">
          <h3 className="font-semibold text-emerald-300">Vencidas</h3>
          <div className="mt-3 grid gap-2">
            {overdueTasks.length === 0 ? <p className="text-sm text-slate-400">No hay tareas vencidas.</p> : null}
            {overdueTasks.map((task) => <TaskCard key={task.id} task={task} onComplete={() => completeTask(task.id)} />)}
          </div>
        </article>
        <article className="rounded-lg bg-slate-900 p-4">
          <h3 className="font-semibold text-emerald-300">Pendientes priorizadas</h3>
          <div className="mt-3 grid gap-2">
            {tasks.slice(0, 8).map((task) => <TaskCard key={task.id} task={task} onComplete={() => completeTask(task.id)} />)}
          </div>
        </article>
      </section>
    </main>
  );
}

function TaskCard({ task, onComplete }: { task: FieldTask; onComplete: () => void }) {
  return (
    <div className="rounded border border-slate-800 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{task.title}</p>
          <p className="text-slate-400">{task.description ?? "Sin descripción"}</p>
          <p className="text-xs text-slate-500">{task.dueDate ? `Vence: ${new Date(task.dueDate).toLocaleString("es-UY")}` : "Sin vencimiento"}{task.assignedRole ? ` · Responsable: ${task.assignedRole}` : ""}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${priorityClass(task.priority)}`}>{task.priority}</span>
      </div>
      <button className="mt-2 rounded border border-slate-700 px-3 py-1 text-xs" onClick={onComplete}>Cerrar</button>
    </div>
  );
}
