"use client";

import { useEffect, useState } from "react";
import { getApiUrl } from "../../lib/api-url";
import { formatAnimalLimit, formatMoney } from "../../lib/billing";

const API_URL = getApiUrl();

type AdminPlan = {
  code: string;
  name: string;
  description: string;
  amountCents: number;
  currency: string;
  billingPeriodDays: number;
  animalLimit: number | null;
  ctaLabel: string;
  sortOrder: number;
};

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "loading">("loading");
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadPlans = async () => {
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch(`${API_URL}/admin/plans`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as { plans?: AdminPlan[]; message?: string };
      if (!response.ok) {
        throw new Error(data.message || "No se pudieron cargar los planes.");
      }
      const nextPlans = [...(data.plans ?? [])].sort((left, right) => left.sortOrder - right.sortOrder);
      setPlans(nextPlans);
      setDraftPrices(
        Object.fromEntries(nextPlans.map((plan) => [plan.code, (plan.amountCents / 100).toFixed(2)])),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Error inesperado al cargar planes.");
    } finally {
      setStatus("idle");
    }
  };

  useEffect(() => {
    void loadPlans();
  }, []);

  const handleSave = async (plan: AdminPlan) => {
    setError(null);
    setMessage(null);
    const rawValue = (draftPrices[plan.code] ?? "").trim().replace(",", ".");
    const parsedValue = Number(rawValue);

    if (!rawValue || Number.isNaN(parsedValue) || parsedValue < 0) {
      setError(`Ingresa un precio valido para ${plan.name}.`);
      return;
    }

    const amountCents = Math.round(parsedValue * 100);
    setSavingCode(plan.code);

    try {
      const response = await fetch(`${API_URL}/admin/plans/${encodeURIComponent(plan.code)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        throw new Error(data.message || `No se pudo actualizar ${plan.name}.`);
      }

      setPlans((currentPlans) =>
        currentPlans.map((currentPlan) =>
          currentPlan.code === plan.code ? { ...currentPlan, amountCents } : currentPlan,
        ),
      );
      setDraftPrices((currentDrafts) => ({
        ...currentDrafts,
        [plan.code]: (amountCents / 100).toFixed(2),
      }));
      setMessage(`Precio actualizado para ${plan.name}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Error inesperado al guardar el precio.");
    } finally {
      setSavingCode(null);
    }
  };

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-xl font-semibold">Planes SaaS</h2>
        <p className="max-w-3xl text-sm text-slate-300">
          Desde aca el admin puede parametrizar los precios que se publican en <span className="font-semibold text-white">/planes</span>.
          Los cambios quedan guardados en la base y no se pisan al refrescar los planes por defecto.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
        <p>
          Edita el valor mensual en moneda local y guarda cada plan por separado. La vista comercial toma estos importes
          directamente desde backend.
        </p>
      </section>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
      {status === "loading" ? <p className="text-sm text-slate-400">Cargando planes...</p> : null}

      <section className="grid gap-4 xl:grid-cols-2">
        {plans.map((plan) => {
          const parsedPreview = Number((draftPrices[plan.code] ?? "").replace(",", "."));
          const previewAmount = Number.isNaN(parsedPreview) ? null : parsedPreview;

          return (
            <article key={plan.code} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 shadow-lg shadow-slate-950/30">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">{plan.code}</p>
                  <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                  <p className="max-w-2xl text-sm leading-6 text-slate-300">{plan.description}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-right">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Precio actual</p>
                  <p className="text-lg font-semibold text-white">{formatMoney(plan.currency, plan.amountCents / 100)}/mes</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
                <div className="space-y-1">
                  <label htmlFor={`price-${plan.code}`} className="text-sm font-medium text-slate-200">
                    Precio mensual
                  </label>
                  <input
                    id={`price-${plan.code}`}
                    type="text"
                    inputMode="decimal"
                    value={draftPrices[plan.code] ?? ""}
                    onChange={(event) =>
                      setDraftPrices((currentDrafts) => ({
                        ...currentDrafts,
                        [plan.code]: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-400"
                    placeholder="0.00"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void handleSave(plan)}
                  disabled={savingCode === plan.code}
                  className="h-12 rounded-2xl bg-emerald-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {savingCode === plan.code ? "Guardando..." : "Guardar precio"}
                </button>
              </div>

              <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Preview comercial</p>
                  <p className="mt-1 font-semibold text-white">
                    {previewAmount == null ? "Precio invalido" : `${formatMoney(plan.currency, previewAmount)}/mes`}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Capacidad</p>
                  <p className="mt-1 font-semibold text-white">{formatAnimalLimit(plan.animalLimit)}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">CTA</p>
                  <p className="mt-1 font-semibold text-white">{plan.ctaLabel}</p>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
