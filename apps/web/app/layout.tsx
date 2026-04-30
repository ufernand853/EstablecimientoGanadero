import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppHeader } from "./components/app-header";

export const metadata: Metadata = {
  title: "Gestión Ganadera",
  description: "Gestión multi-establecimiento para ganadería extensiva",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Gestión Ganadera",
  },
  icons: {
    icon: "/linsse-logo.svg",
    apple: "/linsse-logo.svg",
  },
};
export const viewport: Viewport = {
  themeColor: "#166534",
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
