import "./globals.css";
import type { ReactNode } from "react";
import { withBasePath } from "./lib/base-path";

export const metadata = {
  title: "Gestión Ganadera",
  description: "Gestión multi-establecimiento para ganadería extensiva",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const navLinks = [
    { href: withBasePath("/"), label: "Inicio" },
    { href: withBasePath("/dashboard"), label: "Panel de control" },
    { href: withBasePath("/establishments"), label: "Establecimientos" },
    { href: withBasePath("/paddocks"), label: "Potreros" },
    { href: withBasePath("/herds"), label: "Stock" },
    { href: withBasePath("/animals"), label: "Animales" },
    { href: withBasePath("/operations"), label: "Operaciones" },
    { href: withBasePath("/health"), label: "Gestión sanitaria" },
    { href: withBasePath("/incidents"), label: "Incidentes" },
    { href: withBasePath("/insemination"), label: "Inseminación" },
    { href: withBasePath("/masters/herd-categories"), label: "Categorías" },
    { href: withBasePath("/commands"), label: "Modo IA" },
    { href: withBasePath("/commands/changes"), label: "Cambios IA" },
    { href: withBasePath("/admin/ai-settings"), label: "Admin API key" },
  ];

  return (
    <html lang="es">
      <body className="min-h-screen">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <header className="mb-8 flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <a
                href="https://linsse.com"
                target="_blank"
                rel="noreferrer"
                className="ml-auto order-2 rounded-lg border border-slate-700 bg-slate-900/50 p-2 transition hover:border-emerald-500"
                aria-label="Linsse"
              >
                <img
                  src={withBasePath("/linsse-logo.svg")}
                  alt="Logo de Linsse"
                  className="h-14 w-auto"
                />
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
            <p className="text-sm text-slate-300">
              Accesos rápidos para gestionar la operación diaria.
            </p>
            <div className="overflow-hidden rounded-2xl border border-slate-800">
              <img
                src="https://images.unsplash.com/photo-1500595046743-cd271d694d30?auto=format&fit=crop&w=1600&q=80"
                alt="Imagen realista de un establecimiento ganadero con praderas y animales"
                className="h-52 w-full object-cover md:h-64"
                loading="lazy"
              />
            </div>
            <nav className="flex flex-wrap gap-2">
              {navLinks.map((link) => (
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
          {children}
        </div>
      </body>
    </html>
  );
}
