"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { getApiUrl } from "../lib/api-url";
import { withBasePath } from "../lib/base-path";
import { getHomePathForRole } from "../lib/roles";

const API_URL = getApiUrl();

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("prueba@linsse.com");
  const [password, setPassword] = useState<string>("prueba1234");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        const params = new URLSearchParams(window.location.search);
        const nextPath = params.get("next") || withBasePath(getHomePathForRole(data.user?.role));
        router.push(nextPath);
        router.refresh();
        return;
      }

      const data = await response.json().catch(() => ({ message: "Usuario o contrasena invalidos." }));
      setError(data.message ?? "Usuario o contrasena invalidos.");
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="text-center">
          <img src={withBasePath("/linsse-logo.svg")} alt="Logo de Linsse" className="mx-auto h-12 w-auto" />
          <h1 className="mt-4 text-2xl font-semibold">Gestion Ganadera</h1>
          <p className="mt-2 text-sm text-slate-300">
            Demo comercial lista para explorar modo campo, supervision, trazabilidad y gestion operativa.
          </p>
        </div>

        <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-1 text-sm">
            Usuario / correo
            <input
              className="rounded bg-slate-800 p-3 text-sm outline-none ring-1 ring-slate-700 transition focus:ring-emerald-500"
              placeholder="tu-correo@empresa.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
            />
          </label>
          <label className="grid gap-1 text-sm">
            Contrasena
            <input
              type="password"
              className="rounded bg-slate-800 p-3 text-sm outline-none ring-1 ring-slate-700 transition focus:ring-emerald-500"
              placeholder="Tu contrasena"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="rounded border border-rose-800 bg-rose-950/40 p-2 text-sm text-rose-300">{error}</p> : null}
          <button className="rounded bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-70" disabled={loading}>
            {loading ? "Ingresando..." : "Entrar a la demo"}
          </button>
        </form>
      </section>
    </main>
  );
}
