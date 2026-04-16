import "./globals.css";
import type { ReactNode } from "react";
import { AppHeader } from "./components/app-header";

export const metadata = {
  title: "Gestión Ganadera",
  description: "Gestión multi-establecimiento para ganadería extensiva",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <AppHeader />
          {children}
        </div>
      </body>
    </html>
  );
}
