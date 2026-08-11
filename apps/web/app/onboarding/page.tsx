"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getApiUrl } from "../lib/api-url";
import { withBasePath } from "../lib/base-path";

const API_URL = getApiUrl();

type Establishment = { id: string; name: string; timezone: string };

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("UTC-3");
  const [paddockNames, setPaddockNames] = useState(["", ""]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/establishments`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudieron cargar tus establecimientos.");
        return response.json() as Promise<{ establishments: Establishment[] }>;
      })
      .then(({ establishments: items }) => {
        setEstablishments(items);
        const first = items[0];
        if (first) {
          setEstablishmentId(first.id);
          setName(first.name);
          setTimezone(first.timezone);
        }
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Error inesperado."))
      .finally(() => setLoading(false));
  }, []);

  const selectEstablishment = (id: string) => {
    setEstablishmentId(id);
    const selected = establishments.find((item) => item.id === id);
    setName(selected?.name ?? "");
    setTimezone(selected?.timezone ?? "UTC-3");
  };

  const saveEstablishment = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) return setError("Ingresá el nombre del establecimiento.");
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/establishments${establishmentId ? `/${establishmentId}` : ""}`, {
        method: establishmentId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), timezone: timezone.trim() || "UTC-3" }),
      });
      if (!response.ok) throw new Error("No se pudo guardar el establecimiento.");
      const saved = await response.json() as Establishment;
      setEstablishmentId(saved.id);
      setStep(2);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  };

  const savePaddocks = async (event: FormEvent) => {
    event.preventDefault();
    const names = paddockNames.map((item) => item.trim()).filter(Boolean);
    if (!names.length) return setError("Agregá al menos un potrero para continuar.");
    if (names.some((item) => item.length < 2)) return setError("Cada nombre de potrero debe tener al menos 2 caracteres.");
    setSaving(true);
    setError(null);
    try {
      for (const paddockName of names) {
        const response = await fetch(`${API_URL}/paddocks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ establishmentId, name: paddockName }),
        });
        if (!response.ok) throw new Error(`No se pudo crear el potrero “${paddockName}”.`);
      }
      setStep(3);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">Configuración inicial</p>
        <h2 className="mt-2 text-3xl font-semibold">Prepará tu campo en pocos pasos</h2>
        <p className="mt-2 text-slate-300">Primero configurá el establecimiento y después cargá los potreros donde vas a trabajar.</p>
      </header>

      <ol className="grid grid-cols-3 gap-2" aria-label="Progreso de configuración">
        {["Establecimiento", "Potreros", "Listo"].map((label, index) => (
          <li key={label} className={`rounded-lg border p-3 text-center text-sm ${step >= index + 1 ? "border-emerald-500 bg-emerald-950/40 text-emerald-200" : "border-slate-800 text-slate-500"}`}>
            <span className="block text-xs">Paso {index + 1}</span>{label}
          </li>
        ))}
      </ol>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        {loading ? <p className="text-slate-300">Cargando configuración…</p> : null}
        {!loading && step === 1 ? (
          <form className="space-y-5" onSubmit={saveEstablishment}>
            <div>
              <h3 className="text-xl font-semibold">Tu establecimiento</h3>
              <p className="mt-1 text-sm text-slate-400">Podés completar el establecimiento creado con tu cuenta o agregar uno nuevo.</p>
            </div>
            {establishments.length ? (
              <label className="block text-sm text-slate-300">Establecimiento
                <select className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 p-3" value={establishmentId} onChange={(event) => selectEstablishment(event.target.value)}>
                  {establishments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  <option value="">+ Crear otro establecimiento</option>
                </select>
              </label>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-300">Nombre
                <input autoFocus className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 p-3" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. La Esperanza" />
              </label>
              <label className="text-sm text-slate-300">Zona horaria
                <select className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 p-3" value={timezone} onChange={(event) => setTimezone(event.target.value)}>
                  <option value="UTC-3">UTC-3 · Argentina / Uruguay</option>
                  <option value="UTC-4">UTC-4</option><option value="UTC-5">UTC-5</option><option value="UTC">UTC</option>
                </select>
              </label>
            </div>
            <button disabled={saving} className="w-full rounded-lg bg-emerald-500 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60">{saving ? "Guardando…" : "Guardar y continuar"}</button>
          </form>
        ) : null}

        {!loading && step === 2 ? (
          <form className="space-y-5" onSubmit={savePaddocks}>
            <div><h3 className="text-xl font-semibold">Creá tus potreros</h3><p className="mt-1 text-sm text-slate-400">Cargá al menos uno. Siempre vas a poder agregar más desde la sección Potreros.</p></div>
            <div className="space-y-3">
              {paddockNames.map((paddockName, index) => (
                <div key={index} className="flex gap-2">
                  <input autoFocus={index === 0} aria-label={`Nombre del potrero ${index + 1}`} className="flex-1 rounded-lg border border-slate-700 bg-slate-800 p-3" value={paddockName} onChange={(event) => setPaddockNames((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={`Potrero ${index + 1}`} />
                  {paddockNames.length > 1 ? <button type="button" aria-label={`Quitar potrero ${index + 1}`} onClick={() => setPaddockNames((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg border border-slate-700 px-4 text-slate-300">×</button> : null}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setPaddockNames((current) => [...current, ""])} className="rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-300">+ Agregar otro potrero</button>
            <div className="flex gap-3"><button type="button" onClick={() => setStep(1)} className="rounded-lg border border-slate-700 px-5 py-3">Volver</button><button disabled={saving} className="flex-1 rounded-lg bg-emerald-500 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60">{saving ? "Creando potreros…" : "Finalizar configuración"}</button></div>
          </form>
        ) : null}

        {step === 3 ? <div className="py-6 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-3xl text-slate-950">✓</div><h3 className="mt-5 text-2xl font-semibold">¡Tu campo está listo!</h3><p className="mt-2 text-slate-300">Ya podés comenzar a registrar animales, movimientos y tareas.</p><button onClick={() => router.push(withBasePath("/dashboard"))} className="mt-6 rounded-lg bg-emerald-500 px-6 py-3 font-semibold text-slate-950">Ir al panel de control</button></div> : null}
        {error ? <p role="alert" className="mt-4 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">{error}</p> : null}
      </section>
    </main>
  );
}
