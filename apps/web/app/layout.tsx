import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppHeader } from "./components/app-header";
import { WhatsAppHelp } from "./components/whatsapp-help";
import { LanguageProvider } from "./lib/i18n";
import { SWRegister } from "./sw-register";

const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
const metadataBasePath = rawBasePath ? `/${rawBasePath.replace(/^\/+|\/+$/g, "")}` : "";
const withMetadataBasePath = (pathname: string) => `${metadataBasePath}${pathname}`;

export const metadata: Metadata = {
  title: "Gestión Ganadera",
  description: "Gestión multi-establecimiento para ganadería extensiva",
  manifest: withMetadataBasePath("/manifest.webmanifest"),
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Gestión Ganadera",
  },
  icons: {
    icon: withMetadataBasePath("/linsse-logo.svg"),
    apple: withMetadataBasePath("/linsse-logo.svg"),
  },
};
export const viewport: Viewport = {
  themeColor: "#166534",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <LanguageProvider>
          <SWRegister />
          <div className="mx-auto max-w-6xl px-6 pb-24 pt-8">
            <AppHeader />
            {children}
          </div>
          <WhatsAppHelp />
        </LanguageProvider>
      </body>
    </html>
  );
}
