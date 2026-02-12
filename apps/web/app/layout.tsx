import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Establecimiento Ganadero",
  description: "Gestión multi-establecimiento para ganadería extensiva",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const navLinks = [
    { href: "/", label: "Inicio" },
    { href: "/dashboard", label: "Panel de control" },
    { href: "/establishments", label: "Establecimientos" },
    { href: "/paddocks", label: "Potreros" },
    { href: "/herds", label: "Stock" },
    { href: "/operations", label: "Operaciones" },
    { href: "/health", label: "Gestión sanitaria" },
    { href: "/insemination", label: "Inseminación" },
    { href: "/masters/herd-categories", label: "Categorías" },
    { href: "/commands", label: "Modo IA" },
  ];

  return (
    <html lang="es">
      <body className="min-h-screen">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <header className="mb-8 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold">Establecimiento Ganadero</h1>
                <p className="text-sm text-slate-300">
                  Panel de control para operaciones, lotes, potreros y consignaciones.
                </p>
              </div>
              <a
                className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950"
                href="/dashboard"
              >
                Ir al panel
              </a>
            </div>
            <p className="text-sm text-slate-300">
              Accesos rápidos para gestionar la operación diaria.
            </p>
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
