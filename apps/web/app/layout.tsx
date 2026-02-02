import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Establecimiento Ganadero",
  description: "Gestión multi-establecimiento para ganadería extensiva",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <header className="mb-8 flex flex-col gap-2">
            <h1 className="text-2xl font-semibold">Establecimiento Ganadero</h1>
            <p className="text-sm text-slate-300">
              Panel de control para operaciones, lotes, potreros y consignaciones.
            </p>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
