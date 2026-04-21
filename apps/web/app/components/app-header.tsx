"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BASE_PATH, withBasePath } from "../lib/base-path";
import { getApiUrl } from "../lib/api-url";

const topLevelLinks = [
  { href: withBasePath("/"), label: "Inicio" },
  { href: withBasePath("/operations"), label: "Registrar" },
  { href: withBasePath("/animals"), label: "Consultar" },
  { href: withBasePath("/dashboard"), label: "Reportes" },
  { href: withBasePath("/commands"), label: "Modo IA" },
  { href: withBasePath("/admin/ai-settings"), label: "Configuración" },
];

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const homePath = withBasePath("/");
  const normalizedPath = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  const isHome = normalizedPath === homePath || normalizedPath === BASE_PATH;
  const API_URL = getApiUrl();

  useEffect(() => {
    const loadSession = async () => {
      try {
        const response = await fetch(`${API_URL}/auth/session`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { subscription?: { notification?: { message?: string } | null } };
        const message = data.subscription?.notification?.message;
        setSessionNotice(message ?? null);
      } catch {
        setSessionNotice(null);
      }
    };
    loadSession();
  }, [API_URL]);

  return (
    <header className="mb-8 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <a
          href="https://linsse.com"
          target="_blank"
          rel="noreferrer"
          className="ml-auto order-2 rounded-lg border border-slate-700 bg-slate-900/50 p-2 transition hover:border-emerald-500"
          aria-label="Linsse"
        >
          <img src={withBasePath("/linsse-logo.svg")} alt="Logo de Linsse" className="h-14 w-auto" />
        </a>
        <div>
          <h1 className="text-2xl font-semibold">Gestión Ganadera</h1>
          <p className="text-sm text-slate-300">
            Panel de control para operaciones, lotes, potreros y consignaciones.
          </p>
        </div>
        <div className="grid w-full grid-cols-3 gap-2 md:max-w-xl">
          <button
            type="button"
            onClick={() => router.back()}
            className="h-11 w-full rounded border border-slate-700 px-3 text-sm font-semibold text-slate-100 transition hover:border-emerald-500"
          >
            ← Atrás
          </button>
          <a
            className="flex h-11 w-full items-center justify-center rounded bg-emerald-500 px-3 text-sm font-semibold text-slate-950"
            href={withBasePath("/")}
          >
            ⌂ Inicio
          </a>
          <button
            type="button"
            onClick={() => router.forward()}
            className="h-11 w-full rounded border border-slate-700 px-3 text-sm font-semibold text-slate-100 transition hover:border-emerald-500"
          >
            Adelante →
          </button>
        </div>
      </div>
      <p className="text-sm text-slate-300">Accesos rápidos para gestionar la operación diaria.</p>
      {sessionNotice ? (
        <div className="rounded border border-amber-700 bg-amber-950/50 px-3 py-2 text-sm text-amber-200">
          {sessionNotice}
        </div>
      ) : null}
      {isHome ? (
        <div className="overflow-hidden rounded-2xl border border-slate-800">
          <img
            src="https://images.unsplash.com/photo-1500595046743-cd271d694d30?auto=format&fit=crop&w=1600&q=80"
            alt="Imagen realista de un establecimiento ganadero con praderas y animales"
            className="h-52 w-full object-cover md:h-64"
            loading="lazy"
          />
        </div>
      ) : null}
      <nav className="flex flex-wrap gap-2">
        {topLevelLinks.map((link) => (
          <a
            key={link.href}
            className="rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-200 transition hover:border-emerald-500"
            href={link.href}
          >
            {link.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
