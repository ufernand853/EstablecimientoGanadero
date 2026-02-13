"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { getApiUrl } from "../lib/api-url";

const API_URL = getApiUrl();

type Establishment = {
  id: string;
  name: string;
  timezone: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ParsedCommand = {
  intent: string;
  confirmationToken: string;
  warnings?: string[];
  errors?: string[];
  proposedOperations?: Array<{ payload?: Record<string, unknown> }>;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const getVoiceErrorMessage = (errorCode: string) => {
  switch (errorCode) {
    case "not-allowed":
    case "service-not-allowed":
      return "No hay permiso para usar el micrófono. Habilitalo en el navegador y recargá la página (HTTPS o localhost).";
    case "audio-capture":
      return "No se detectó ningún micrófono disponible en este dispositivo.";
    case "no-speech":
      return "No se detectó voz. Intentá de nuevo hablando más cerca del micrófono.";
    case "network":
      return "Hubo un problema de red durante el dictado. Verificá tu conexión.";
    default:
      return `Error de voz: ${errorCode}`;
  }
};

const requestMicrophoneAccess = async () => {
  if (typeof window === "undefined") {
    return true;
  }

  if (!window.isSecureContext) {
    throw new Error("El dictado por voz requiere HTTPS o localhost para acceder al micrófono.");
  }

  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices?.getUserMedia) {
    throw new Error("Tu navegador no permite solicitar acceso al micrófono desde esta página.");
  }

  const stream = await mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track) => track.stop());
  return true;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

export default function CommandsPage() {
  const messageIdRef = useRef(0);
  const createMessageId = () => {
    messageIdRef.current += 1;
    return `msg-${Date.now()}-${messageIdRef.current}`;
  };

  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: createMessageId(),
      role: "assistant",
      content: "Hola, soy tu asistente IA para gestión ganadera. Preguntame sobre stock, movimientos, sanidad o planificación.",
    },
  ]);
  const [status, setStatus] = useState<"idle" | "sending">("idle");
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ paddocks: number; stockRows: number; movements: number; healthEvents: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const loadEstablishments = async () => {
      try {
        const response = await fetch(`${API_URL}/establishments`);
        if (!response.ok) {
          throw new Error("No se pudieron cargar los establecimientos.");
        }
        const data = (await response.json()) as { establishments: Establishment[] };
        setEstablishments(data.establishments);
        if (data.establishments.length) {
          setEstablishmentId(data.establishments[0]?.id ?? "");
        }
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Error inesperado.");
        setEstablishments([]);
        setEstablishmentId("");
      }
    };

    loadEstablishments();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const speechAvailable = useMemo(
    () => typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    [],
  );

  const startVoiceInput = async () => {
    if (!speechAvailable) {
      setError("Tu navegador no soporta reconocimiento de voz.");
      return;
    }
    setError(null);

    try {
      await requestMicrophoneAccess();
    } catch (permissionError) {
      const message = permissionError instanceof Error ? permissionError.message : "No hay permiso para usar el micrófono.";
      setError(message);
      return;
    }

    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      setError("No se pudo inicializar el reconocimiento de voz.");
      return;
    }

    const recognition = new RecognitionCtor();
    recognition.lang = "es-AR";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();

      if (transcript) {
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };
    recognition.onerror = (event) => {
      setError(getVoiceErrorMessage(event.error));
      setIsListening(false);
    };
    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    try {
      recognition.start();
    } catch {
      setError("No se pudo iniciar el dictado. Revisá permisos de micrófono e intentá nuevamente.");
      setIsListening(false);
    }
  };

  const stopVoiceInput = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const tryExecuteOperationalCommand = async (prompt: string) => {
    const parseResponse = await fetch(`${API_URL}/commands/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ establishmentId, text: prompt }),
    });

    if (!parseResponse.ok) {
      return null;
    }

    const parsed = (await parseResponse.json()) as ParsedCommand;
    if (!parsed || parsed.intent === "UNKNOWN") {
      return null;
    }

    const hasBlockingIssues = (parsed.errors?.length ?? 0) > 0 || (parsed.warnings?.length ?? 0) > 0;
    if (hasBlockingIssues) {
      return {
        applied: false,
        summary: `Entendí una operación (${parsed.intent}) pero faltan datos: ${[
          ...(parsed.errors ?? []),
          ...(parsed.warnings ?? []),
        ].join(" ")}`,
      };
    }

    const confirmResponse = await fetch(`${API_URL}/commands/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        establishmentId,
        confirmationToken: parsed.confirmationToken,
        edits: { parsed },
      }),
    });

    if (!confirmResponse.ok) {
      const body = await confirmResponse.json().catch(() => ({}));
      const message = typeof body.message === "string" ? body.message : "No se pudo aplicar la operación.";
      return { applied: false, summary: message };
    }

    const confirmed = (await confirmResponse.json()) as { applied?: boolean; summary?: string };
    return {
      applied: Boolean(confirmed.applied),
      summary: confirmed.summary ?? "Operación aplicada correctamente.",
    };
  };

  const sendPrompt = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!establishmentId) {
      setError("Seleccioná un establecimiento antes de consultar la IA.");
      return;
    }

    const prompt = input.trim();
    if (!prompt) {
      setError("Escribí o dictá una consulta para continuar.");
      return;
    }

    const nextUserMessage: ChatMessage = {
      id: createMessageId(),
      role: "user",
      content: prompt,
    };

    const history = messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .slice(-8)
      .map((message) => ({ role: message.role, content: message.content }));

    setMessages((prev) => [...prev, nextUserMessage]);
    setInput("");
    setStatus("sending");

    try {
      const commandExecution = await tryExecuteOperationalCommand(prompt);
      if (commandExecution) {
        setMessages((prev) => [
          ...prev,
          {
            id: createMessageId(),
            role: "assistant",
            content: commandExecution.applied
              ? `✅ ${commandExecution.summary}`
              : `⚠️ ${commandExecution.summary}`,
          },
        ]);
        setStatus("idle");
        return;
      }

      const response = await fetch(`${API_URL}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          establishmentId,
          prompt,
          history,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const message = typeof body.message === "string" ? body.message : "No se pudo obtener respuesta de la IA.";
        throw new Error(message);
      }

      const data = (await response.json()) as {
        response: string;
        contextMeta?: { paddocks: number; stockRows: number; movements: number; healthEvents: number };
      };

      const aiMessage: ChatMessage = {
        id: createMessageId(),
        role: "assistant",
        content: data.response,
      };

      setMessages((prev) => [...prev, aiMessage]);
      if (data.contextMeta) {
        setMeta(data.contextMeta);
      }
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Error inesperado.";
      setError(message);
      setMessages((prev) => [
        ...prev,
        {
          id: createMessageId(),
          role: "assistant",
          content: `No pude consultar la IA en este momento (${message}). La pantalla sigue operativa para que puedas continuar usando el sistema.`,
        },
      ]);
    } finally {
      setStatus("idle");
    }
  };

  return (
    <main className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">Modo IA</h2>
        <p className="text-sm text-slate-300">
          Chat con contexto real del establecimiento. Podés consultar por texto o por voz.
        </p>
      </header>

      <section className="rounded-lg bg-slate-900 p-4">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Establecimiento activo
          <select
            className="mt-2 w-full rounded bg-slate-800 p-2 text-sm text-slate-200"
            value={establishmentId}
            onChange={(event) => setEstablishmentId(event.target.value)}
          >
            {establishments.length === 0 && <option value="">Sin conexión a API de establecimientos</option>}
            {establishments.map((establishment) => (
              <option key={establishment.id} value={establishment.id}>
                {establishment.name}
              </option>
            ))}
          </select>
        </label>
        {meta && (
          <p className="mt-3 text-xs text-slate-400">
            Contexto usado: {meta.paddocks} potreros · {meta.stockRows} filas de stock · {meta.movements} movimientos · {meta.healthEvents} eventos sanitarios.
          </p>
        )}
      </section>

      <section className="rounded-lg bg-slate-900 p-4">
        <div className="h-[420px] space-y-3 overflow-y-auto rounded bg-slate-950/70 p-3">
          {messages.map((message) => (
            <article
              key={message.id}
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                message.role === "user"
                  ? "ml-auto bg-emerald-500 text-slate-950"
                  : "bg-slate-800 text-slate-100"
              }`}
            >
              <p className="mb-1 text-[10px] uppercase tracking-wide opacity-70">
                {message.role === "user" ? "Vos" : "Asistente"}
              </p>
              <p className="whitespace-pre-wrap">{message.content}</p>
            </article>
          ))}
          {status === "sending" && (
            <article className="max-w-[80%] rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-300">
              Escribiendo respuesta...
            </article>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className="mt-3 space-y-3" onSubmit={sendPrompt}>
          <textarea
            className="h-24 w-full rounded bg-slate-800 p-3 text-sm"
            placeholder="Ej: ¿Qué categoría tiene mayor stock y qué acciones recomendás para el próximo manejo sanitario?"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950"
              disabled={status === "sending"}
            >
              {status === "sending" ? "Enviando..." : "Enviar"}
            </button>
            {!isListening ? (
              <button
                type="button"
                className="rounded bg-slate-700 px-4 py-2 text-sm"
                onClick={startVoiceInput}
              >
                🎤 Dictar
              </button>
            ) : (
              <button
                type="button"
                className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950"
                onClick={stopVoiceInput}
              >
                ⏹ Detener voz
              </button>
            )}
          </div>
        </form>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </section>
    </main>
  );
}
