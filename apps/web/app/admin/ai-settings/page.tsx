"use client";

import { FormEvent, useState } from "react";
import { getApiUrl } from "../../lib/api-url";

const API_URL = getApiUrl();

export default function AISettingsPage() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4.1-mini");
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setResult(null);

    if (!username.trim() || !password.trim() || !apiKey.trim()) {
      setError("Completá usuario, contraseña y API key.");
      return;
    }

    setStatus("saving");
    try {
      const response = await fetch(`${API_URL}/admin/openai-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
          apiKey: apiKey.trim(),
          model: model.trim() || undefined,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as { message?: string; updatedAt?: string; model?: string };
      if (!response.ok) {
        throw new Error(data.message || "No se pudo guardar la configuración.");
      }

      setApiKey("");
      setResult(`Configuración guardada. Modelo activo: ${data.model ?? model}. Fecha: ${data.updatedAt ?? "ahora"}.`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Error inesperado.");
    } finally {
      setStatus("idle");
    }
  };

  return (
    <main className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">Configuración IA (admin)</h2>
        <p className="text-sm text-slate-300">
          Guardá la API key de OpenAI para habilitar respuestas generativas en Modo IA.
        </p>
      </header>

      <section className="rounded-lg bg-slate-900 p-4">
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <label className="grid gap-1 text-sm">
            Usuario admin
            <input
              className="rounded bg-slate-800 p-2"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
            />
          </label>

          <label className="grid gap-1 text-sm">
            Contraseña admin
            <input
              type="password"
              className="rounded bg-slate-800 p-2"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>

          <label className="grid gap-1 text-sm">
            OPENAI_API_KEY
            <input
              type="password"
              className="rounded bg-slate-800 p-2"
              placeholder="sk-..."
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              autoComplete="off"
            />
          </label>

          <label className="grid gap-1 text-sm">
            Modelo (opcional)
            <input
              className="rounded bg-slate-800 p-2"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="gpt-4.1-mini"
            />
          </label>

          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          {result ? <p className="text-sm text-emerald-400">{result}</p> : null}

          <button
            type="submit"
            disabled={status === "saving"}
            className="mt-2 rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-70"
          >
            {status === "saving" ? "Guardando..." : "Guardar API key"}
          </button>
        </form>
      </section>
    </main>
  );
}
