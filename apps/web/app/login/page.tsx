"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "UliferLuli853$$";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (username === DEFAULT_USERNAME && password === DEFAULT_PASSWORD) {
      document.cookie = "eg_auth=1; path=/; max-age=28800; samesite=lax";
      const params = new URLSearchParams(window.location.search);
      const nextPath = params.get("next") || "/dashboard";
      router.push(nextPath);
      router.refresh();
      return;
    }

    setError("Usuario o contraseña inválidos.");
  }

  return (
    <main className="rounded-lg bg-slate-900 p-6 shadow">
      <h2 className="text-xl font-semibold">Iniciar sesión</h2>
      <p className="mt-2 text-sm text-slate-300">
        Ingresá con el usuario <span className="font-semibold">admin</span> para acceder al sistema.
      </p>
      <form className="mt-4 grid gap-3" onSubmit={handleSubmit}>
        <label className="grid gap-1 text-sm">
          Usuario
          <input
            className="rounded bg-slate-800 p-2"
            placeholder="admin"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
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
        <button className="mt-2 rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950">
          Entrar
        </button>
      </form>
    </main>
  );
}
