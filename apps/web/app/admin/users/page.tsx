"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getApiUrl } from "../../lib/api-url";

const API_URL = getApiUrl();

type CustomerUser = {
  id: string;
  email: string;
  fullName: string;
  status: "ACTIVE" | "INACTIVE";
  role: "OWNER" | "ADMIN" | "SUPERVISOR" | "OPERATOR" | "READONLY";
  lastLoginAt: string | null;
};

type Customer = {
  tenantId: string;
  tenantName: string;
  tenantStatus: "ACTIVE" | "SUSPENDED";
  establishmentIds: string[];
  establishmentNames: string[];
  primaryEstablishmentId: string | null;
  primaryEstablishmentName: string | null;
  userCount: number;
  users: CustomerUser[];
  planCode: string | null;
  subscriptionStatus: "PENDING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "TRIALING" | "EXPIRED" | "MISSING";
  provider: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  lastActivityAt: string | null;
  latestCheckout: {
    email: string;
    status: "PENDING_PAYMENT" | "COMPLETED" | "FAILED";
    provider: string | null;
    createdAt: string;
  } | null;
  alerts: string[];
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

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "text-emerald-300",
  TRIALING: "text-sky-300",
  PENDING: "text-amber-300",
  PAST_DUE: "text-amber-300",
  CANCELLED: "text-rose-300",
  EXPIRED: "text-rose-300",
  MISSING: "text-rose-300",
  SUSPENDED: "text-rose-300",
};

const USER_ROLES = ["OWNER", "ADMIN", "SUPERVISOR", "OPERATOR", "READONLY"] as const;

export default function AdminUsersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [demoActivity, setDemoActivity] = useState<DemoActivityLog[]>([]);
  const [search, setSearch] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [newAccess, setNewAccess] = useState({
    email: "",
    fullName: "",
    password: "",
    role: "OWNER",
  });

  const loadAdminData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [customersResponse, activityResponse] = await Promise.all([
        fetch(`${API_URL}/admin/customers`, { credentials: "include", cache: "no-store" }),
        fetch(`${API_URL}/admin/activity`, { credentials: "include", cache: "no-store" }),
      ]);

      const customersData = (await customersResponse.json().catch(() => ({}))) as { customers?: Customer[]; message?: string };
      const activityData = (await activityResponse.json().catch(() => ({}))) as {
        accessLogs?: AccessLog[];
        demoActivity?: DemoActivityLog[];
        message?: string;
      };

      if (!customersResponse.ok) {
        throw new Error(customersData.message || "No se pudieron cargar los clientes.");
      }

      if (!activityResponse.ok) {
        throw new Error(activityData.message || "No se pudo cargar la actividad.");
      }

      const nextCustomers = customersData.customers ?? [];
      setCustomers(nextCustomers);
      setAccessLogs(activityData.accessLogs ?? []);
      setDemoActivity(activityData.demoActivity ?? []);
      setSelectedTenantId((current) => current && nextCustomers.some((customer) => customer.tenantId === current) ? current : nextCustomers[0]?.tenantId ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los datos de admin.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAdminData();
  }, []);

  const filteredCustomers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return customers;

    return customers.filter((customer) =>
      customer.tenantName.toLowerCase().includes(normalizedSearch)
      || customer.establishmentNames.some((name) => name.toLowerCase().includes(normalizedSearch))
      || customer.users.some((user) => user.email.toLowerCase().includes(normalizedSearch) || user.fullName.toLowerCase().includes(normalizedSearch))
      || (customer.latestCheckout?.email ?? "").toLowerCase().includes(normalizedSearch),
    );
  }, [customers, search]);

  const selectedCustomer = useMemo(
    () => filteredCustomers.find((customer) => customer.tenantId === selectedTenantId) ?? filteredCustomers[0] ?? null,
    [filteredCustomers, selectedTenantId],
  );

  const handleCreateAccess = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCustomer) return;
    setSaving("create-access");
    setError(null);
    setMessage(null);
    setGeneratedPassword(null);

    try {
      const response = await fetch(`${API_URL}/admin/customers/${selectedCustomer.tenantId}/access`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newAccess.email,
          fullName: newAccess.fullName,
          password: newAccess.password || undefined,
          role: newAccess.role,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string; temporaryPassword?: string | null; reusedExistingUser?: boolean };
      if (!response.ok) {
        throw new Error(data.message || "No se pudo crear el acceso.");
      }

      setMessage(data.reusedExistingUser ? "Se vinculo un usuario existente al cliente." : "Acceso creado correctamente.");
      if (data.temporaryPassword) {
        setGeneratedPassword(data.temporaryPassword);
      }
      setNewAccess({ email: "", fullName: "", password: "", role: "OWNER" });
      await loadAdminData();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "No se pudo crear el acceso.");
    } finally {
      setSaving(null);
    }
  };

  const handleResetPassword = async (user: CustomerUser) => {
    if (!selectedCustomer) return;
    setSaving(`reset-${user.id}`);
    setError(null);
    setMessage(null);
    setGeneratedPassword(null);

    try {
      const response = await fetch(`${API_URL}/admin/customers/${selectedCustomer.tenantId}/users/${user.id}/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string; temporaryPassword?: string };
      if (!response.ok) {
        throw new Error(data.message || "No se pudo resetear la contraseña.");
      }

      setGeneratedPassword(data.temporaryPassword ?? null);
      setMessage(`Contraseña regenerada para ${user.email}.`);
      await loadAdminData();
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "No se pudo resetear la contraseña.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-xl font-semibold">Clientes y accesos</h2>
        <p className="max-w-3xl text-sm text-slate-300">
          Mesa operativa para administrar clientes, revisar altas incompletas, crear accesos faltantes y resetear contraseñas sin tocar Mongo.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <input
            className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
            placeholder="Buscar por cliente, establecimiento o email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-300">
            {filteredCustomers.length} clientes visibles
          </div>
        </div>
      </section>

      {loading ? <p className="text-sm text-slate-400">Cargando datos...</p> : null}
      {error ? <p className="rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
      {message ? <p className="rounded-xl border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">{message}</p> : null}
      {generatedPassword ? (
        <p className="rounded-xl border border-amber-800 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
          Contraseña temporal generada: <span className="font-semibold">{generatedPassword}</span>
        </p>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <div className="space-y-4">
          {filteredCustomers.map((customer) => (
            <button
              key={customer.tenantId}
              type="button"
              onClick={() => setSelectedTenantId(customer.tenantId)}
              className={`w-full rounded-3xl border p-5 text-left transition ${selectedCustomer?.tenantId === customer.tenantId ? "border-emerald-500 bg-slate-900/90" : "border-slate-800 bg-slate-900/60 hover:border-slate-700"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-white">{customer.tenantName}</p>
                  <p className="text-sm text-slate-400">{customer.establishmentNames.join(" · ") || "Sin establecimientos"}</p>
                </div>
                <div className="text-right text-xs">
                  <p className={`font-semibold ${STATUS_STYLES[customer.subscriptionStatus] ?? "text-slate-300"}`}>{customer.subscriptionStatus}</p>
                  <p className="text-slate-400">{customer.planCode ?? "Sin plan"}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Accesos</p>
                  <p className="mt-1 font-semibold text-white">{customer.userCount}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Provider</p>
                  <p className="mt-1 font-semibold text-white">{customer.provider ?? "Sin dato"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Ultima actividad</p>
                  <p className="mt-1 font-semibold text-white">{formatDate(customer.lastActivityAt)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Vence</p>
                  <p className="mt-1 font-semibold text-white">{formatDate(customer.currentPeriodEnd)}</p>
                </div>
              </div>
              {customer.alerts.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {customer.alerts.map((alert) => (
                    <span key={alert} className="rounded-full border border-amber-700 bg-amber-950/40 px-3 py-1 text-xs text-amber-200">
                      {alert}
                    </span>
                  ))}
                </div>
              ) : null}
            </button>
          ))}
          {!loading && filteredCustomers.length === 0 ? <p className="text-sm text-slate-400">No hay clientes para mostrar.</p> : null}
        </div>

        <aside className="space-y-6">
          {selectedCustomer ? (
            <>
              <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{selectedCustomer.tenantName}</h3>
                    <p className="text-sm text-slate-400">Tenant {selectedCustomer.tenantId}</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs ${selectedCustomer.tenantStatus === "ACTIVE" ? "border-emerald-700 text-emerald-300" : "border-rose-700 text-rose-300"}`}>
                    {selectedCustomer.tenantStatus}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-slate-300">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Establecimientos</p>
                    <p className="mt-1 font-semibold text-white">{selectedCustomer.establishmentNames.join(" · ") || "Sin dato"}</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Plan</p>
                      <p className="mt-1 font-semibold text-white">{selectedCustomer.planCode ?? "Sin plan"}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Provider</p>
                      <p className="mt-1 font-semibold text-white">{selectedCustomer.provider ?? "Sin dato"}</p>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Alta</p>
                      <p className="mt-1 font-semibold text-white">{formatDate(selectedCustomer.createdAt)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Ultimo checkout</p>
                      <p className="mt-1 font-semibold text-white">
                        {selectedCustomer.latestCheckout ? `${selectedCustomer.latestCheckout.email} · ${selectedCustomer.latestCheckout.status}` : "Sin dato"}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Usuarios del cliente</h3>
                    <p className="text-sm text-slate-400">Reset de contraseña y control de accesos activos.</p>
                  </div>
                  <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">{selectedCustomer.users.length} accesos</span>
                </div>

                <div className="mt-4 grid gap-3">
                  {selectedCustomer.users.map((user) => (
                    <article key={user.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{user.fullName}</p>
                          <p className="text-xs text-slate-400">{user.email}</p>
                        </div>
                        <div className="text-right text-xs text-slate-400">
                          <p>{user.role}</p>
                          <p>{user.status}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-slate-400">Ultimo login: {formatDate(user.lastLoginAt)}</p>
                        <button
                          type="button"
                          onClick={() => void handleResetPassword(user)}
                          disabled={saving === `reset-${user.id}`}
                          className="rounded-2xl border border-emerald-700 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:border-emerald-500 disabled:opacity-60"
                        >
                          {saving === `reset-${user.id}` ? "Reseteando..." : "Resetear contraseña"}
                        </button>
                      </div>
                    </article>
                  ))}
                  {selectedCustomer.users.length === 0 ? <p className="text-sm text-slate-400">Este cliente no tiene usuarios cargados.</p> : null}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
                <div>
                  <h3 className="text-lg font-semibold text-white">Crear acceso faltante</h3>
                  <p className="text-sm text-slate-400">Sirve para cuentas que pagaron o tienen establecimiento, pero nunca terminaron de generar login.</p>
                </div>
                <form className="mt-4 grid gap-3" onSubmit={handleCreateAccess}>
                  <input
                    className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                    placeholder="Email"
                    value={newAccess.email}
                    onChange={(event) => setNewAccess((current) => ({ ...current, email: event.target.value }))}
                    required
                  />
                  <input
                    className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                    placeholder="Nombre completo"
                    value={newAccess.fullName}
                    onChange={(event) => setNewAccess((current) => ({ ...current, fullName: event.target.value }))}
                    required
                  />
                  <input
                    className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                    placeholder="Contraseña temporal (opcional)"
                    value={newAccess.password}
                    onChange={(event) => setNewAccess((current) => ({ ...current, password: event.target.value }))}
                  />
                  <select
                    className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                    value={newAccess.role}
                    onChange={(event) => setNewAccess((current) => ({ ...current, role: event.target.value }))}
                  >
                    {USER_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                  <button
                    type="submit"
                    disabled={saving === "create-access"}
                    className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60"
                  >
                    {saving === "create-access" ? "Creando..." : "Crear acceso"}
                  </button>
                </form>
              </section>
            </>
          ) : (
            <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 text-sm text-slate-400">
              Selecciona un cliente para ver su ficha y gestionar accesos.
            </section>
          )}
        </aside>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div>
          <h3 className="text-lg font-semibold text-white">Log de entradas</h3>
          <p className="text-sm text-slate-400">Ingresos, fallos de autenticación y cierres de sesión recientes.</p>
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
          {!loading && accessLogs.length === 0 ? <p className="text-sm text-slate-400">Todavía no hay ingresos registrados.</p> : null}
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
                <span>{entry.message ?? "Acción permitida"}</span>
              </div>
            </article>
          ))}
          {!loading && demoActivity.length === 0 ? <p className="text-sm text-slate-400">Todavía no hay actividad demo registrada.</p> : null}
        </div>
      </section>
    </main>
  );
}
