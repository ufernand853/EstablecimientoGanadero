"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getApiUrl } from "../lib/api-url";
import { BASE_PATH, withBasePath } from "../lib/base-path";
import { getHomePathForRole } from "../lib/roles";

const API_URL = getApiUrl();
const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "admin";
const OFFLINE_USER_KEY = "eg_offline_user";
const OFFLINE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type OfflineUser = { role: string; email: string; expiresAt: number };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@test.local");
  const [password, setPassword] = useState("admin");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [offlineUser, setOfflineUser] = useState<OfflineUser | null>(null);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    // Load cached offline user
    try {
      const raw = localStorage.getItem(OFFLINE_USER_KEY);
      if (raw) {
        const data = JSON.parse(raw) as OfflineUser;
        if (data.expiresAt > Date.now()) setOfflineUser(data);
      }
    } catch {}

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const data = (await response.json()) as { user?: { role?: string } };
        const role = data.user?.role ?? "ADMIN";

        // Cache for offline login (7-day window)
        try {
          const entry: OfflineUser = { role, email, expiresAt: Date.now() + OFFLINE_EXPIRY_MS };
          localStorage.setItem(OFFLINE_USER_KEY, JSON.stringify(entry));
          setOfflineUser(entry);
        } catch {}

        const params = new URLSearchParams(window.location.search);
        const nextPath = params.get("next") || withBasePath(getHomePathForRole(role));
        router.push(nextPath);
        router.refresh();
        return;
      }

      if (email === DEFAULT_USERNAME && password === DEFAULT_PASSWORD) {
        const cookiePath = BASE_PATH || "/";
        const secureFlag = window.location.protocol === "https:" ? "; secure" : "";
        document.cookie = `eg_auth=1; path=${cookiePath}; max-age=28800; samesite=lax${secureFlag}`;
        const params = new URLSearchParams(window.location.search);
        const nextPath = params.get("next") || withBasePath("/dashboard");
        router.push(nextPath);
        router.refresh();
        return;
      }

      const data = await response.json().catch(() => ({ message: "Usuario o contraseña inválidos." }));
      setError(data.message ?? "Usuario o contraseña inválidos.");
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  function handleOfflineLogin() {
    if (!offlineUser) return;
    const cookiePath = BASE_PATH || "/";
    const secureFlag = window.location.protocol === "https:" ? "; secure" : "";
    const maxAge = Math.floor((offlineUser.expiresAt - Date.now()) / 1000);
    document.cookie = `eg_auth=1; path=${cookiePath}; max-age=${maxAge}; samesite=lax${secureFlag}`;
    document.cookie = `eg_role=${offlineUser.role}; path=${cookiePath}; max-age=${maxAge}; samesite=lax${secureFlag}`;
    const params = new URLSearchParams(window.location.search);
    const nextPath = params.get("next") || withBasePath(getHomePathForRole(offlineUser.role));
    router.push(nextPath);
    router.refresh();
  }

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="text-center">
          <img src={withBasePath("/linsse-logo.svg")} alt="Logo de Linsse" className="mx-auto h-12 w-auto" />
          <h1 className="mt-4 text-2xl font-semibold">Gestión Ganadera</h1>
          <p className="mt-2 text-sm text-slate-300">Ingresá con un usuario de prueba para acceder al sistema.</p>
        </div>

        {/* Offline access section */}
        {!isOnline ? (
          offlineUser ? (
            <div className="mt-5 rounded-xl border border-amber-700 bg-amber-950/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">Sin conexión</p>
              <p className="mt-2 text-sm text-slate-300">
                Última sesión guardada: <span className="font-semibold text-slate-100">{offlineUser.email}</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Las acciones que registres se guardarán localmente y se sincronizarán al reconectarte.
              </p>
              <button
                type="button"
                onClick={handleOfflineLogin}
                className="mt-4 w-full rounded-lg bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-400"
              >
                Continuar sin conexión
              </button>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-center">
              <p className="text-sm font-semibold text-amber-300">Sin conexión</p>
              <p className="mt-2 text-xs text-slate-400">
                No hay ninguna sesión anterior guardada en este dispositivo. Necesitás conectarte al menos una vez para poder usar la app offline.
              </p>
            </div>
          )
        ) : null}

        <form className={`mt-6 grid gap-4 ${!isOnline ? "opacity-40 pointer-events-none" : ""}`} onSubmit={handleSubmit}>
          <label className="grid gap-1 text-sm">
            Usuario / correo
            <input
              className="rounded bg-slate-800 p-3 text-sm outline-none ring-1 ring-slate-700 transition focus:ring-emerald-500"
              placeholder="admin@test.local"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              disabled={!isOnline}
            />
          </label>
          <label className="grid gap-1 text-sm">
            Contraseña
            <input
              type="password"
              className="rounded bg-slate-800 p-3 text-sm outline-none ring-1 ring-slate-700 transition focus:ring-emerald-500"
              placeholder="admin"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              disabled={!isOnline}
            />
          </label>
          {error ? <p className="rounded border border-rose-800 bg-rose-950/40 p-2 text-sm text-rose-300">{error}</p> : null}
          <button
            className="rounded bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-70"
            disabled={loading || !isOnline}
          >
            {loading ? "Ingresando..." : "Entrar"}
          </button>
        </form>

        <div className="mt-5 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
          <p className="font-semibold text-slate-100">Usuarios test</p>
          <p>Admin: admin@test.local / admin</p>
          <p>Operador: usuario@test.local / usuario</p>
          <p>Supervisor: supervisor@test.local / supervisor</p>
        </div>
      </section>
    </main>
  );
}
