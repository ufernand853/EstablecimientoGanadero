"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { getApiUrl } from "../lib/api-url";
import { BASE_PATH, withBasePath } from "../lib/base-path";

const API_URL = getApiUrl();
const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "admin";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [demoEmail, setDemoEmail] = useState("");
  const [demoName, setDemoName] = useState("");
  const [demoCompany, setDemoCompany] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const params = new URLSearchParams(window.location.search);
        const nextPath = params.get("next") || withBasePath("/dashboard");
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

  async function handleDemoRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setDemoLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/demo-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: demoEmail,
          fullName: demoName,
          companyName: demoCompany,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ message: "No se pudo crear demo." }));
        setError(data.message ?? "No se pudo crear demo.");
        return;
      }
      const demo = await response.json() as { generatedPassword?: string; referenceId: string };
      setInfo(`Demo creada. Ref ${demo.referenceId}. Ejecutá webhook de pago exitoso para activar la cuenta.${demo.generatedPassword ? ` Clave sugerida: ${demo.generatedPassword}` : ""}`);
      setEmail(demoEmail);
      if (demo.generatedPassword) {
        setPassword(demo.generatedPassword);
      }
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setDemoLoading(false);
    }
  }

  return (
    <main className="grid gap-6 md:grid-cols-2">
      <section className="rounded-lg bg-slate-900 p-6 shadow">
        <h2 className="text-xl font-semibold">Iniciar sesión</h2>
        <p className="mt-2 text-sm text-slate-300">
          Accedé con tu correo de suscripción. También sigue disponible el acceso legacy <span className="font-semibold">admin/admin</span>.
        </p>
        <form className="mt-4 grid gap-3" onSubmit={handleSubmit}>
          <label className="grid gap-1 text-sm">
            Correo
            <input
              className="rounded bg-slate-800 p-2"
              placeholder="admin@empresa.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
            />
          </label>
          <label className="grid gap-1 text-sm">
            Contraseña
            <input
              type="password"
              className="rounded bg-slate-800 p-2"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          {info ? <p className="text-sm text-emerald-300">{info}</p> : null}
          <button className="mt-2 rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950" disabled={loading}>
            {loading ? "Ingresando..." : "Entrar"}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 p-6 shadow">
        <h2 className="text-xl font-semibold">Solicitar demo (5 días)</h2>
        <p className="mt-2 text-sm text-emerald-200">
          Crea una cuenta de prueba. La activación final se realiza mediante webhook de la pasarela.
        </p>
        <form className="mt-4 grid gap-3" onSubmit={handleDemoRequest}>
          <label className="grid gap-1 text-sm">
            Nombre completo
            <input className="rounded bg-slate-800 p-2" value={demoName} onChange={(event) => setDemoName(event.target.value)} required />
          </label>
          <label className="grid gap-1 text-sm">
            Empresa
            <input className="rounded bg-slate-800 p-2" value={demoCompany} onChange={(event) => setDemoCompany(event.target.value)} required />
          </label>
          <label className="grid gap-1 text-sm">
            Correo
            <input type="email" className="rounded bg-slate-800 p-2" value={demoEmail} onChange={(event) => setDemoEmail(event.target.value)} required />
          </label>
          <button className="mt-2 rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950" disabled={demoLoading}>
            {demoLoading ? "Creando..." : "Crear demo"}
          </button>
        </form>
      </section>
    </main>
  );
}
