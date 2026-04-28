"use client";

import { useEffect, useState } from "react";
import { withBasePath } from "./lib/base-path";
import { getApiUrl } from "./lib/api-url";

type NavLink = {
  href: string;
  label: string;
  minRole?: "OPERATOR" | "ADMIN";
};

type MenuGroup = {
  title: string;
  description: string;
  links: NavLink[];
};

const ALL_MENU_GROUPS: MenuGroup[] = [
  {
    title: "Inicio",
    description: "Resumen y seguimiento general de la operación.",
    links: [{ href: withBasePath("/dashboard"), label: "Panel de control" }],
  },
  {
    title: "Registrar",
    description: "Altas, cargas y acciones operativas del día a día.",
    links: [
      { href: withBasePath("/operations"), label: "Operaciones", minRole: "OPERATOR" },
      { href: withBasePath("/shipments"), label: "Embarques", minRole: "OPERATOR" },
      { href: withBasePath("/incidents"), label: "Incidentes", minRole: "OPERATOR" },
      { href: withBasePath("/slaughter-shipments"), label: "Consignaciones", minRole: "OPERATOR" },
      { href: withBasePath("/insemination"), label: "Inseminación", minRole: "OPERATOR" },
      { href: withBasePath("/traceability"), label: "Trazabilidad", minRole: "OPERATOR" },
    ],
  },
  {
    title: "Consultar",
    description: "Búsquedas y estado actual de establecimientos y animales.",
    links: [
      { href: withBasePath("/establishments"), label: "Establecimientos" },
      { href: withBasePath("/paddocks"), label: "Potreros" },
      { href: withBasePath("/herds"), label: "Stock" },
      { href: withBasePath("/animals"), label: "Animales" },
      { href: withBasePath("/health"), label: "Gestión sanitaria" },
    ],
  },
  {
    title: "Reportes",
    description: "Análisis, históricos y cambios recientes.",
    links: [
      { href: withBasePath("/dashboard"), label: "Indicadores" },
      { href: withBasePath("/commands/changes"), label: "Cambios IA" },
      { href: withBasePath("/traceability/dashboard"), label: "Panel Gerencial", minRole: "ADMIN" },
    ],
  },
  {
    title: "Modo IA",
    description: "Interfaz de lenguaje natural para operaciones de lote y consultas.",
    links: [
      { href: withBasePath("/commands"), label: "Modo IA completo", minRole: "OPERATOR" },
      { href: withBasePath("/campo"), label: "Modo Campo (operario)", minRole: "OPERATOR" },
    ],
  },
  {
    title: "Configuración",
    description: "Parámetros del sistema, maestros y API.",
    links: [
      { href: withBasePath("/masters/herd-categories"), label: "Categorías", minRole: "ADMIN" },
      { href: withBasePath("/masters/consignors"), label: "Consignatarios", minRole: "ADMIN" },
      { href: withBasePath("/masters/slaughterhouses"), label: "Frigoríficos", minRole: "ADMIN" },
      { href: withBasePath("/admin/ai-settings"), label: "API y ajustes IA", minRole: "ADMIN" },
    ],
  },
];

const meetsMinRole = (role: string | null, minRole?: "OPERATOR" | "ADMIN"): boolean => {
  if (!minRole) return true;
  if (!role) return true; // backward-compat: no role cookie → show all
  if (minRole === "OPERATOR") return ["OPERATOR", "ADMIN", "OWNER"].includes(role);
  if (minRole === "ADMIN") return ["ADMIN", "OWNER"].includes(role);
  return false;
};

export default function HomePage() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const API_URL = getApiUrl();

  useEffect(() => {
    const loadRole = async () => {
      try {
        const response = await fetch(`${API_URL}/auth/session`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { user?: { role?: string } };
        setUserRole(data.user?.role ?? null);
      } catch {
        // ignore network errors
      }
    };
    loadRole();
  }, [API_URL]);

  const visibleGroups = ALL_MENU_GROUPS.map((group) => ({
    ...group,
    links: group.links.filter((link) => meetsMinRole(userRole, link.minRole)),
  })).filter((group) => group.links.length > 0);

  return (
    <main className="space-y-6">
      <section className="rounded-lg bg-slate-900 p-6 shadow">
        <h2 className="text-xl font-semibold">Inicio</h2>
        <p className="mt-2 text-slate-300">Navegación simplificada por flujo de uso diario.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {visibleGroups.map((group) => (
            <article key={group.title} className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
              <h3 className="text-base font-semibold text-emerald-300">{group.title}</h3>
              <p className="mt-1 text-sm text-slate-300">{group.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {group.links.map((link) => (
                  <a
                    key={link.href}
                    className="rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-200 transition hover:border-emerald-500"
                    href={link.href}
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
