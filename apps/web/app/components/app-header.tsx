"use client";

import { usePathname } from "next/navigation";
import { BASE_PATH, withBasePath } from "../lib/base-path";

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
  const homePath = withBasePath("/");
  const normalizedPath = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  const isHome = normalizedPath === homePath || normalizedPath === BASE_PATH;

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
        <a
          className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950"
          href={withBasePath("/dashboard")}
        >
          Ir al panel
        </a>
      </div>
      <p className="text-sm text-slate-300">Accesos rápidos para gestionar la operación diaria.</p>
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
