"use client";

import { useEffect, useState } from "react";
import { getApiUrl } from "../lib/api-url";
import { LicenseResponse, formatAnimalLimit, formatMoney } from "../lib/billing";

const API_URL = getApiUrl();

export default function LicensePage() {
  const [data, setData] = useState<LicenseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadLicense = async () => {
      try {
        const response = await fetch(`${API_URL}/billing/license`, { cache: "no-store" });
        const payload = (await response.json()) as LicenseResponse & { message?: string };
        if (!response.ok) throw new Error(payload.message ?? "No se pudo cargar la licencia.");
        setData(payload);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la licencia.");
      } finally {
        setLoading(false);
      }
    };
    loadLicense();
  }, []);

  const usagePercent = data?.usage.animalLimit
    ? Math.min(100, Math.round((data.usage.usedAnimals / data.usage.animalLimit) * 100))
    : null;

  return (
    <main className="space-y-6 py-6">
      <section className="rounded-[1.75rem] border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20">
        <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">
          Mi licencia
        </span>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-white">Estado comercial del tenant</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">
          Consultá plan, vencimiento, cantidad de establecimientos asociados y uso del cupo de animales contratado.
        </p>
      </section>

      {loading ? <div className="rounded-[1.75rem] border border-slate-800 bg-slate-900/80 p-6 text-slate-300">Cargando licencia...</div> : null}
      {error ? <div className="rounded-[1.75rem] border border-rose-900 bg-rose-950/40 p-6 text-rose-200">{error}</div> : null}

      {data ? (
        <section className="grid gap-5 lg:grid-cols-[1.2fr,0.8fr]">
          <article className="rounded-[1.75rem] border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/70 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">Empresa</p>
                <h2 className="mt-3 text-2xl font-black text-white">{data.tenant.name}</h2>
                <p className="mt-2 text-sm text-slate-300">Rol actual: {data.tenant.role}</p>
              </div>
              <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/70 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">Plan</p>
                <h2 className="mt-3 text-2xl font-black text-white">{data.license?.name ?? "Sin plan"}</h2>
                <p className="mt-2 text-sm text-slate-300">{data.license?.description ?? "No hay datos de licencia."}</p>
              </div>
              <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/70 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">Precio</p>
                <p className="mt-3 text-2xl font-black text-white">
                  {data.license ? `${formatMoney(data.license.currency, data.license.amountCents / 100)}/mes` : "No disponible"}
                </p>
                <p className="mt-2 text-sm text-emerald-200">{data.license ? formatAnimalLimit(data.license.animalLimit) : ""}</p>
              </div>
              <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/70 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">Suscripción</p>
                <p className="mt-3 text-2xl font-black text-white">{data.subscription?.status ?? data.license?.status ?? "Sin datos"}</p>
                <p className="mt-2 text-sm text-slate-300">Vence: {data.subscription?.currentPeriodEnd ?? data.license?.currentPeriodEnd ?? "-"}</p>
              </div>
            </div>

            {data.license?.featureList?.length ? (
              <div className="mt-5 rounded-[1.5rem] border border-slate-800 bg-slate-950/70 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">Funcionalidades incluidas</p>
                <ul className="mt-4 grid gap-2 text-sm text-slate-300 md:grid-cols-2">
                  {data.license.featureList.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>

          <aside className="rounded-[1.75rem] border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">Uso actual</p>
            <p className="mt-3 text-4xl font-black text-white">{data.usage.usedAnimals.toLocaleString("es-UY")}</p>
            <p className="mt-1 text-sm text-slate-300">animales activos cargados</p>
            <div className="mt-5 rounded-[1.5rem] border border-slate-800 bg-slate-950/70 p-5">
              <p className="text-sm text-slate-300">Establecimientos asociados: {data.usage.establishments}</p>
              <p className="mt-2 text-sm text-slate-300">Cupo contratado: {formatAnimalLimit(data.usage.animalLimit)}</p>
              <p className="mt-2 text-sm text-slate-300">
                Disponible: {data.usage.remainingAnimals == null ? "Sin límite" : `${data.usage.remainingAnimals.toLocaleString("es-UY")} animales`}
              </p>
              {usagePercent != null ? (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    <span>Consumo</span>
                    <span>{usagePercent}%</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-lime-300 to-amber-300" style={{ width: `${usagePercent}%` }} />
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        </section>
      ) : null}
    </main>
  );
}
