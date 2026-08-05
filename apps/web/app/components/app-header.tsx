"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BASE_PATH, withBasePath } from "../lib/base-path";
import { getApiUrl } from "../lib/api-url";
import { LanguageSelector } from "./language-selector";
import { useI18n } from "../lib/i18n";
import { canSeeLink, isCommercialDemoUser } from "../lib/roles";

const stripBasePath = (href: string) => {
  if (!BASE_PATH) return href;
  if (href === BASE_PATH) return "/";
  return href.startsWith(`${BASE_PATH}/`) ? href.slice(BASE_PATH.length) : href;
};

export function AppHeader() {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [sessionRole, setSessionRole] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<{ fullName?: string; email?: string } | null>(null);
  const topLevelLinks = [
    { href: withBasePath("/"), label: t("header.home") },
    { href: withBasePath("/operations"), label: t("header.register") },
    { href: withBasePath("/animals"), label: t("header.consult") },
    { href: withBasePath("/dashboard"), label: t("header.reports") },
    { href: withBasePath("/supervision"), label: t("header.supervision") },
    { href: withBasePath("/gestion/tareas"), label: t("header.tasks") },
    { href: withBasePath("/commands"), label: t("header.ai") },
    { href: withBasePath("/traceability"), label: t("header.traceability") },
    { href: withBasePath("/insumos"), label: t("header.supplies") },
    { href: withBasePath("/licencia"), label: t("header.license") },
    { href: withBasePath("/masters"), label: t("header.masters") },
    { href: withBasePath("/admin/users"), label: t("header.customers") },
    { href: withBasePath("/admin/planes"), label: t("header.plans") },
    { href: withBasePath("/admin/ai-settings"), label: t("header.settings") },
  ];
  const homePath = withBasePath("/");
  const normalizedPath = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  const isHome = normalizedPath === homePath || normalizedPath === BASE_PATH;
  const isCampo = normalizedPath === withBasePath("/campo");
  const isLogin = normalizedPath === withBasePath("/login");
  const isDemoUser = isCommercialDemoUser(sessionUser?.email);
  const isMarketing =
    normalizedPath === withBasePath("/planes") ||
    normalizedPath === withBasePath("/registro") ||
    normalizedPath.startsWith(withBasePath("/pago"));
  const API_URL = getApiUrl();

  const handleLogout = async () => {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // no-op: igualmente limpiamos cookies locales
    }
    const cookiePath = BASE_PATH || "/";
    const secureFlag = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `eg_auth=; path=${cookiePath}; max-age=0; samesite=lax${secureFlag}`;
    router.push(withBasePath("/login"));
    router.refresh();
  };

  useEffect(() => {
    const loadSession = async () => {
      try {
        const response = await fetch(`${API_URL}/auth/session`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { user?: { role?: string; fullName?: string; email?: string }; subscription?: { notification?: { message?: string } | null } };
        const message = data.subscription?.notification?.message;
        setSessionNotice(message ?? null);
        setSessionRole(data.user?.role ?? null);
        setSessionUser(data.user ? { fullName: data.user.fullName, email: data.user.email } : null);
      } catch {
        setSessionNotice(null);
        setSessionRole(null);
        setSessionUser(null);
      }
    };
    loadSession();
  }, [API_URL, pathname]);

  if (isLogin || isMarketing) return null;

  return (
    <header className="mb-8 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <a
            href="https://linsse.com"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-slate-700 bg-slate-900/50 p-1.5 transition hover:border-emerald-500"
            aria-label="Linsse"
          >
            <img src={withBasePath("/linsse-logo.svg")} alt={t("header.brandAlt")} className="h-8 w-auto" />
          </a>
          <h1 className="text-2xl font-semibold">Gestion Ganadera</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <LanguageSelector />
          {sessionUser ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-2 text-right">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t("header.loggedUser")}</p>
              <p className="text-sm font-semibold text-white">{sessionUser.fullName ?? t("header.generalAccount")}</p>
              <p className="text-xs text-slate-400">{sessionUser.email ?? t("header.noEmail")}</p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-rose-700 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:border-rose-500"
          >
            {t("header.logout")}
          </button>
        </div>
        <div className="grid w-full grid-cols-3 gap-2 md:max-w-xl">
          <button
            type="button"
            onClick={() => router.back()}
            className="h-11 w-full rounded border border-slate-700 px-3 text-sm font-semibold text-slate-100 transition hover:border-emerald-500"
          >
            {"<-"}
          </button>
          <a
            className="flex h-11 w-full items-center justify-center rounded bg-emerald-500 px-3 text-sm font-semibold text-slate-950"
            href={withBasePath("/")}
          >
            {t("header.home")}
          </a>
          <button
            type="button"
            onClick={() => router.forward()}
            className="h-11 w-full rounded border border-slate-700 px-3 text-sm font-semibold text-slate-100 transition hover:border-emerald-500"
          >
            {"->"}
          </button>
        </div>
      </div>
      {isCampo ? null : <p className="text-sm text-slate-300">{t("header.quickAccess")}</p>}
      {sessionNotice && !isDemoUser ? (
        <div className="rounded border border-amber-700 bg-amber-950/50 px-3 py-2 text-sm text-amber-200">
          {sessionNotice}
        </div>
      ) : null}
      {isHome ? (
        <div className="overflow-hidden rounded-2xl border border-slate-800">
          <img
            src="https://images.unsplash.com/photo-1500595046743-cd271d694d30?auto=format&fit=crop&w=1600&q=80"
            alt={t("header.heroAlt")}
            className="h-52 w-full object-cover md:h-64"
            loading="lazy"
          />
        </div>
      ) : null}
      {isCampo ? null : <nav className="flex flex-wrap gap-2">
        {topLevelLinks
          .filter((link) => canSeeLink(sessionRole, stripBasePath(link.href), sessionUser?.email))
          .map((link) => (
          <a
            key={link.href}
            className="rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-200 transition hover:border-emerald-500"
            href={link.href}
          >
            {link.label}
          </a>
          ))}
      </nav>}
    </header>
  );
}
