"use client";

import Link from "next/link";
import { Suspense, FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LanguageSelector } from "../components/language-selector";
import { getApiUrl } from "../lib/api-url";
import { withBasePath } from "../lib/base-path";
import { PublicPlan, formatAnimalLimit, formatPlanPrice } from "../lib/billing";
import { useI18n } from "../lib/i18n";

const API_URL = getApiUrl();

type RegisterResult = {
  referenceId: string;
  status: string;
  webhookUrl: string;
  message: string;
  checkoutUrl?: string | null;
};

function RegisterPageContent() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const requestedPlan = searchParams.get("plan") ?? "PRO";
  const initialPlan = requestedPlan === "BASIC" || requestedPlan === "PRO" ? requestedPlan : "PRO";
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [form, setForm] = useState({
    companyName: "",
    fullName: "",
    email: "",
    password: "",
    planCode: initialPlan,
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegisterResult | null>(null);

  useEffect(() => {
    const loadPlans = async () => {
      try {
        const response = await fetch(`${API_URL}/public/plans`, { cache: "no-store" });
        const data = (await response.json()) as PublicPlan[];
        if (!response.ok) throw new Error(t("register.loadError"));
        setPlans(data.filter((plan) => !plan.isDemo));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : t("register.loadError"));
      } finally {
        setLoading(false);
      }
    };
    void loadPlans();
  }, [t]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.code === form.planCode) ?? null,
    [plans, form.planCode],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    setResult(null);
    try {
      const response = await fetch(`${API_URL}/auth/register-subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as RegisterResult & { message?: string };
      if (!response.ok) throw new Error(data.message ?? t("register.createError"));
      setResult(data);
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t("register.createError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid gap-6 py-6 lg:grid-cols-[1fr,1.1fr]">
      <section className="rounded-[1.75rem] border border-emerald-900/60 bg-gradient-to-br from-emerald-950 via-slate-950 to-lime-950 p-6 shadow-2xl shadow-emerald-950/40">
        <div className="flex items-start justify-between gap-4">
          <Link href={withBasePath("/planes")} className="text-sm font-semibold text-emerald-200 transition hover:text-white">
            {"<- "}{t("public.backToPlans")}
          </Link>
          <LanguageSelector />
        </div>
        <div className="mt-6 space-y-4">
          <h1 className="text-3xl font-black tracking-tight text-white">{t("register.title")}</h1>
          <p className="text-sm leading-7 text-slate-200">
            {t("register.body")}
          </p>
          {selectedPlan ? (
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 text-slate-100">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">{selectedPlan.code}</p>
              <h2 className="mt-3 text-2xl font-black">{selectedPlan.name}</h2>
              <p className="mt-2 text-sm text-slate-300">{selectedPlan.description}</p>
              <p className="mt-4 text-2xl font-black text-white">{formatPlanPrice(selectedPlan)}</p>
              <p className="mt-1 text-sm text-emerald-200">{formatAnimalLimit(selectedPlan.animalLimit)}</p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20">
        <h2 className="text-xl font-bold text-white">{t("register.accountTitle")}</h2>
        <p className="mt-2 text-sm text-slate-300">{t("register.accountBody")}</p>
        {loading ? <p className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">{t("plans.loading")}</p> : null}
        {error ? <p className="mt-5 rounded-2xl border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-200">{error}</p> : null}
        {result ? (
          <div className="mt-5 rounded-2xl border border-emerald-900 bg-emerald-950/40 p-4 text-sm text-emerald-100">
            <p className="font-bold">{result.message}</p>
            <p className="mt-2">Referencia: {result.referenceId}</p>
            <p>Estado: {result.status}</p>
            <p>Webhook esperado: {result.webhookUrl}</p>
          </div>
        ) : null}
        <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
          <input required value={form.companyName} onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))} placeholder={t("register.company")} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400" />
          <input required value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} placeholder={t("register.owner")} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400" />
          <input required type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder={t("register.email")} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400" />
          <input required type="password" minLength={8} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder={t("register.password")} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400" />
          <select value={form.planCode} onChange={(event) => setForm((current) => ({ ...current, planCode: event.target.value }))} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400">
            {plans.filter((plan) => plan.code !== "ENTERPRISE").map((plan) => (
              <option key={plan.code} value={plan.code}>
                {plan.name} - {formatPlanPrice(plan)}
              </option>
            ))}
          </select>
          <button type="submit" disabled={submitting || loading} className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-70">
            {submitting ? t("register.creating") : t("register.submit")}
          </button>
        </form>
      </section>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<main className="py-6 text-slate-300">Cargando registro...</main>}>
      <RegisterPageContent />
    </Suspense>
  );
}
