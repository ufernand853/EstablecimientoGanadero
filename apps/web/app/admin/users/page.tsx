"use client";

import { FormEvent, useEffect, useState } from "react";
import { getApiUrl } from "../../lib/api-url";

const API_URL = getApiUrl();

type Role = "OWNER" | "ADMIN" | "OPERATOR" | "READONLY";
type Status = "ACTIVE" | "INACTIVE";

type UserRow = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: Status;
  lastLoginAt: string | null;
};

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("OPERATOR");

  const load = async () => {
    const response = await fetch(`${API_URL}/admin/users`, {
      cache: "no-store",
      credentials: "include",
    });
    if (!response.ok) throw new Error();
    const data = (await response.json()) as { users: UserRow[] };
    setRows(data.users);
  };

  useEffect(() => {
    load().catch(() => setError("No se pudieron cargar usuarios."));
  }, []);

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const response = await fetch(`${API_URL}/admin/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, fullName, password, role }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({} as { message?: string }));
      setError(data.message ?? "No se pudo crear usuario.");
      return;
    }

    setEmail("");
    setFullName("");
    setPassword("");
    setRole("OPERATOR");
    await load();
  };

  const updateUser = async (userId: string, payload: Partial<{ role: Role; status: Status }>) => {
    const response = await fetch(`${API_URL}/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setError("No se pudo actualizar usuario.");
      return;
    }

    await load();
  };

  return (
    <main className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">ABM de Usuarios y Roles</h2>
      </header>

      <section className="rounded-lg bg-slate-900 p-4">
        <form className="grid gap-3 md:grid-cols-2" onSubmit={createUser}>
          <input
            className="rounded bg-slate-800 p-2 text-sm"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <input
            className="rounded bg-slate-800 p-2 text-sm"
            placeholder="Nombre completo"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
          />
          <input
            className="rounded bg-slate-800 p-2 text-sm"
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <select className="rounded bg-slate-800 p-2 text-sm" value={role} onChange={(event) => setRole(event.target.value as Role)}>
            <option value="ADMIN">ADMIN</option>
            <option value="OPERATOR">OPERATOR</option>
            <option value="READONLY">READONLY</option>
          </select>
          <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 md:col-span-2" type="submit">
            Crear usuario
          </button>
        </form>
        {error ? <p className="mt-2 text-sm text-rose-400">{error}</p> : null}
      </section>

      <section className="grid gap-2 rounded-lg bg-slate-900 p-4">
        {rows.map((user) => (
          <div key={user.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div>
              <p className="font-semibold">
                {user.fullName} <span className="text-xs text-slate-400">({user.email})</span>
              </p>
              <p className="text-xs text-slate-400">
                Rol: {user.role} · Estado: {user.status} · Último acceso: {user.lastLoginAt ?? "Nunca"}
              </p>
            </div>
            <div className="flex gap-2">
              {user.role !== "OWNER" ? (
                <select
                  className="rounded bg-slate-800 p-2 text-xs"
                  value={user.role}
                  onChange={(event) => updateUser(user.id, { role: event.target.value as Role })}
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="OPERATOR">OPERATOR</option>
                  <option value="READONLY">READONLY</option>
                </select>
              ) : null}
              <button
                className="rounded bg-slate-700 px-3 py-1 text-xs"
                onClick={() => updateUser(user.id, { status: user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })}
              >
                {user.status === "ACTIVE" ? "Inactivar" : "Activar"}
              </button>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
