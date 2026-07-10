"use client";

import { useEffect, useState } from "react";
import { getApiUrl } from "../../lib/api-url";

const API_URL = getApiUrl();

type AdminUser = {
  id: string;
  email: string;
  fullName: string;
  status: string;
  role: string;
  tenantId: string;
  lastLoginAt: string | null;
};

type AccessLog = {
  id: string;
  email: string;
  event: string;
  status: string;
  ip: string | null;
  userAgent: string | null;
  message: string | null;
  createdAt: string;
};

type DemoActivityLog = {
  id: string;
  email: string;
  role: string;
  method: string;
  path: string;
  action: string;
  statusCode: number;
  blocked: boolean;
  ip: string | null;
  userAgent: string | null;
  message: string | null;
  createdAt: string;
};

const formatDate = (value: string | null) => {
  if (!value) return "Sin dato";
  return new Date(value).toLocaleString("es-UY");
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [demoActivity, setDemoActivity] = useState<DemoActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAdminData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [usersResponse, activityResponse] = await Promise.all([
          fetch(`${API_URL}/admin/users`, { credentials: "include", cache: "no-store" }),
          fetch(`${API_URL}/admin/activity`, { credentials: "include", cache: "no-store" }),
        ]);

        const usersData = (await usersResponse.json().catch(() => ({}))) as { users?: AdminUser[]; message?: string };
        const activityData = (await activityResponse.json().catch(() => ({}))) as {
          accessLogs?: AccessLog[];
          demoActivity?: DemoActivityLog[];
          message?: string;
        };

        if (!usersResponse.ok) {
          throw new Error(usersData.message || "No se pudieron cargar los usuarios.");
        }

        if (!activityResponse.ok) {
          throw new Error(activityData.message || "No se pudo cargar la actividad.");
        }

        setUsers(usersData.users ?? []);
        setAccessLogs(activityData.accessLogs ?? []);
        setDemoActivity(activityData.demoActivity ?? []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los datos de admin.");
      } finally {
        setLoading(false);
      }
    };

    void loadAdminData();
  }, []);

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-xl font-semibold">Usuarios y auditoria</h2>
        <p className="text-sm text-slate-300">
          Vista admin para controlar accesos, ultimos ingresos y trazas de uso sobre las cuentas de prueba.
        </p>
      </header>

      {loading ? <p className="text-sm text-slate-400">Cargando datos...</p> : null}
      {error ? <p className="rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">{error}</p> : null}

      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Usuarios del tenant</h3>
            <p className="text-sm text-slate-400">Incluye rol actual y ultimo login.</p>
          </div>
          <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">{users.length} usuarios</span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr className="border-b border-slate-800">
                <th className="px-3 py-2 font-medium">Usuario</th>
                <th className="px-3 py-2 font-medium">Rol</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Ultimo login</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-slate-900/80 align-top text-slate-200">
                  <td className="px-3 py-3">
                    <p className="font-medium text-white">{user.fullName}</p>
                    <p className="text-xs text-slate-400">{user.email}</p>
                  </td>
                  <td className="px-3 py-3">{user.role}</td>
                  <td className="px-3 py-3">{user.status}</td>
                  <td className="px-3 py-3">{formatDate(user.lastLoginAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div>
          <h3 className="text-lg font-semibold text-white">Log de entradas</h3>
          <p className="text-sm text-slate-400">Ingresos, fallos de autenticacion y cierres de sesion recientes.</p>
        </div>

        <div className="mt-4 grid gap-3">
          {accessLogs.map((entry) => (
            <article key={entry.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{entry.email}</p>
                  <p className="text-xs text-slate-400">{entry.event} · {entry.status}</p>
                </div>
                <p className="text-xs text-slate-400">{formatDate(entry.createdAt)}</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                <span>IP: {entry.ip ?? "Sin dato"}</span>
                <span>{entry.message ?? "Sin detalle"}</span>
              </div>
            </article>
          ))}
          {!loading && accessLogs.length === 0 ? <p className="text-sm text-slate-400">Todavia no hay ingresos registrados.</p> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div>
          <h3 className="text-lg font-semibold text-white">Trace demo / prueba</h3>
          <p className="text-sm text-slate-400">Seguimiento de lo que hace la cuenta demo y de los intentos bloqueados por solo lectura.</p>
        </div>

        <div className="mt-4 grid gap-3">
          {demoActivity.map((entry) => (
            <article key={entry.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{entry.email}</p>
                  <p className="text-xs text-slate-400">{entry.action} · {entry.method} · {entry.path}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">{formatDate(entry.createdAt)}</p>
                  <p className={`text-xs font-semibold ${entry.blocked ? "text-amber-300" : "text-emerald-300"}`}>
                    {entry.blocked ? "Bloqueado" : `HTTP ${entry.statusCode}`}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                <span>Rol: {entry.role}</span>
                <span>IP: {entry.ip ?? "Sin dato"}</span>
                <span>{entry.message ?? "Accion permitida"}</span>
              </div>
            </article>
          ))}
          {!loading && demoActivity.length === 0 ? <p className="text-sm text-slate-400">Todavia no hay actividad demo registrada.</p> : null}
        </div>
      </section>
    </main>
  );
}
