"use client";

import { usePathname } from "next/navigation";
import { useI18n } from "../lib/i18n";

const WHATSAPP_PHONE = "59898682749";

export function WhatsAppHelp() {
  const pathname = usePathname();
  const { language } = useI18n();
  const labels = language === "pt"
    ? {
        label: "Ajuda por WhatsApp",
        message: `Olá, preciso de ajuda com o Linsse Ganadería. Estou na tela ${pathname}.`,
      }
    : {
        label: "Ayuda por WhatsApp",
        message: `Hola, necesito ayuda con Linsse Ganadería. Estoy en la pantalla ${pathname}.`,
      };
  const href = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(labels.message)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={labels.label}
      className="fixed bottom-4 right-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-500 px-4 py-3 font-bold text-slate-950 shadow-2xl shadow-black/40 transition hover:scale-[1.03] hover:bg-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-300/40 sm:bottom-6 sm:right-6"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-current">
        <path d="M12.04 2a9.84 9.84 0 0 0-8.43 14.91L2 22l5.22-1.56A9.96 9.96 0 1 0 12.04 2Zm0 17.92a8.05 8.05 0 0 1-4.1-1.12l-.3-.18-3.1.93.95-3.02-.2-.31a7.92 7.92 0 1 1 6.75 3.7Zm4.43-5.94c-.24-.12-1.44-.7-1.66-.79-.22-.08-.38-.12-.55.12-.16.25-.62.8-.76.96-.14.17-.28.19-.52.07a6.58 6.58 0 0 1-1.95-1.19 7.3 7.3 0 0 1-1.35-1.67c-.14-.24-.02-.37.1-.5.11-.11.25-.28.37-.42.12-.14.16-.24.24-.4.08-.17.04-.31-.02-.43-.06-.12-.55-1.32-.75-1.8-.2-.48-.4-.41-.55-.42h-.46c-.16 0-.42.06-.64.3-.22.25-.85.83-.85 2.02s.87 2.34.99 2.5c.12.17 1.7 2.6 4.13 3.65.57.25 1.03.4 1.38.51.58.19 1.1.16 1.52.1.46-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z" />
      </svg>
      <span className="text-sm">{labels.label}</span>
    </a>
  );
}
