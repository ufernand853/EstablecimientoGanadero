"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { getApiUrl } from "../lib/api-url";
import { withBasePath } from "../lib/base-path";
import { LanguageSelector } from "../components/language-selector";
import { useI18n } from "../lib/i18n";
import { getHomePathForRole } from "../lib/roles";

const API_URL = getApiUrl();

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [renewalUrl, setRenewalUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setRenewalUrl(null);
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

      const data = await response.json().catch(() => ({ message: t("login.invalidCredentials") })) as {
        message?: string;
        renewal?: { checkoutUrl?: string | null };
      };
      setRenewalUrl(data.renewal?.checkoutUrl ?? null);
      setError(data.message ?? t("login.invalidCredentials"));
    } catch {
      setError(t("login.serverError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
      <section className="w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="grid lg:grid-cols-[1.1fr,0.9fr]">
          <div className="bg-gradient-to-br from-emerald-950 via-slate-950 to-sky-950 p-8">
            <div className="flex items-start justify-between gap-4">
              <img src={withBasePath("/linsse-logo.svg")} alt="Linsse" className="h-12 w-auto" />
              <LanguageSelector />
            </div>
            <h1 className="mt-6 text-3xl font-semibold text-white">{t("login.title")}</h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-200">
              {t("login.subtitle")}
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <article className="rounded-2xl border border-emerald-800/60 bg-emerald-950/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">{t("login.card.operations")}</p>
                <p className="mt-2 text-sm text-slate-200">{t("login.card.operations.body")}</p>
              </article>
              <article className="rounded-2xl border border-sky-800/60 bg-sky-950/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">{t("login.card.readers")}</p>
                <p className="mt-2 text-sm text-slate-200">{t("login.card.readers.body")}</p>
              </article>
              <article className="rounded-2xl border border-amber-800/60 bg-amber-950/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">{t("login.card.ai")}</p>
                <p className="mt-2 text-sm text-slate-200">{t("login.card.ai.body")}</p>
              </article>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={withBasePath("/planes")}
                className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
              >
                {t("login.viewPlans")}
              </a>
              <a
                href={withBasePath("/registro")}
                className="rounded-xl border border-slate-600 px-4 py-3 text-sm font-semibold text-white transition hover:border-emerald-400"
              >
                {t("login.createAccount")}
              </a>
            </div>
          </div>

          <div className="p-8">
            <div>
              <h2 className="text-2xl font-semibold text-white">{t("login.enterTitle")}</h2>
              <p className="mt-2 text-sm text-slate-300">{t("login.enterBody")}</p>
            </div>

            <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
              <label className="grid gap-1 text-sm">
                {t("login.user")}
                <input
                  className="rounded bg-slate-800 p-3 text-sm outline-none ring-1 ring-slate-700 transition focus:ring-emerald-500"
                  placeholder={t("login.userPlaceholder")}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="username"
                />
              </label>
              <label className="grid gap-1 text-sm">
                {t("login.password")}
                <input
                  type="password"
                  className="rounded bg-slate-800 p-3 text-sm outline-none ring-1 ring-slate-700 transition focus:ring-emerald-500"
                  placeholder={t("login.passwordPlaceholder")}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </label>
              {error ? (
                <div className="rounded border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-300">
                  <p>{error}</p>
                  {renewalUrl ? (
                    <a
                      href={renewalUrl}
                      className="mt-3 inline-flex rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-300"
                    >
                      Reactivar suscripcion
                    </a>
                  ) : null}
                </div>
              ) : null}
              <button className="rounded bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-70" disabled={loading}>
                {loading ? t("login.submitting") : t("login.submit")}
              </button>
            </form>

            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t("login.publicAccess")}</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <a
                  href={withBasePath("/planes")}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-emerald-500"
                >
                  {t("login.publicPlans")}
                </a>
                <a
                  href={withBasePath("/registro")}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-emerald-500"
                >
                  {t("login.publicRegister")}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
