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

type PendingCommand = {
  parsed: ParsedCommand;
};

type CommandLog = {
  id: string;
  stage: "PARSED" | "PARSE_ERROR" | "CONFIRM_SUCCESS" | "CONFIRM_ERROR";
  intent: string | null;
  message: string;
  createdAt: string;
};

type SuggestedApiCall = {
  action: string;
  endpoint: string;
  method: string;
  requiresConfirmation: boolean;
  isReady: boolean;
  missingOrInvalidFields: string[];
};

const CONFIRMATION_KEYWORDS = ["hazlo", "confirmado", "hacelo", "ejecutalo"];

const normalizeText = (value: string) => value
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim();

const isConfirmationKeyword = (value: string) => {
  const normalized = normalizeText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return false;
  }

  const tokens = normalized.split(" ");
  return CONFIRMATION_KEYWORDS.some((keyword) => tokens.includes(keyword) || normalized === keyword);
};

const findLatestOperationalPrompt = (messages: ChatMessage[]) => {
  const latestUserInstruction = [...messages]
    .reverse()
    .find((message) => message.role === "user" && !isConfirmationKeyword(message.content));

  return latestUserInstruction?.content.trim() ?? "";
};

const findLatestAssistantOperationalHint = (messages: ChatMessage[]) => {
  const latestAssistantInstruction = [...messages]
    .reverse()
    .find((message) => {
      if (message.role !== "assistant") {
        return false;
      }
      const trimmed = message.content.trim();
      if (!trimmed) {
        return false;
      }
      return !trimmed.startsWith("⚠️") && !trimmed.startsWith("✅") && !trimmed.startsWith("🛠️");
    });

  return latestAssistantInstruction?.content.trim() ?? "";
};

const summarizePendingCommand = (parsed: ParsedCommand, prompt: string) => {
  const operationCount = parsed.proposedOperations?.length ?? 0;
  if (operationCount > 0) {
    return `Detecté ${operationCount} operación(es) de tipo ${parsed.intent} para: \"${prompt}\".`;
  }
  return `Detecté una operación de tipo ${parsed.intent} para: \"${prompt}\".`;
};

const parseOperationalCommand = async (text: string) => {
  const response = await fetch(`${API_URL}/commands/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    return null;
  }

  const parsed = (await response.json()) as ParsedCommand;
  return parsed?.intent && parsed.intent !== "UNKNOWN" ? parsed : null;
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
  const [pendingCommand, setPendingCommand] = useState<PendingCommand | null>(null);
  const [meta, setMeta] = useState<{ paddocks: number; stockRows: number; movements: number; healthEvents: number } | null>(null);
  const [logs, setLogs] = useState<CommandLog[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const loadCommandLogs = async (estId: string) => {
    if (!estId) {
      setLogs([]);
      return;
    }
    try {
      const response = await fetch(`${API_URL}/command-logs?establishmentId=${estId}&limit=20`);
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as { logs: CommandLog[] };
      setLogs(data.logs ?? []);
    } catch {
      // silent fallback for logs panel
    }
  };

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
          const nextId = data.establishments[0]?.id ?? "";
          setEstablishmentId(nextId);
          await loadCommandLogs(nextId);
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

  useEffect(() => {
    void loadCommandLogs(establishmentId);
  }, [establishmentId]);

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

  const executeParsedCommand = async (parsed: ParsedCommand) => {
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
      if (pendingCommand) {
        if (!isConfirmationKeyword(prompt)) {
          setMessages((prev) => [
            ...prev,
            {
              id: createMessageId(),
              role: "assistant",
              content: "⚠️ Hay una acción pendiente de confirmación. Para ejecutarla escribí exactamente: Hazlo, confirmado, hacelo o ejecutalo.",
            },
          ]);
          setStatus("idle");
          return;
        }

        const confirmedExecution = await executeParsedCommand(pendingCommand.parsed);
        setPendingCommand(null);
        await loadCommandLogs(establishmentId);
        setMessages((prev) => [
          ...prev,
          {
            id: createMessageId(),
            role: "assistant",
            content: confirmedExecution.applied
              ? `✅ ${confirmedExecution.summary}`
              : `⚠️ ${confirmedExecution.summary}`,
          },
        ]);
        setStatus("idle");
        return;
      }

      if (isConfirmationKeyword(prompt)) {
        const latestOperationalPrompt = findLatestOperationalPrompt(messages);
        const latestAssistantHint = findLatestAssistantOperationalHint(messages);

        if (!latestOperationalPrompt && !latestAssistantHint) {
          setMessages((prev) => [
            ...prev,
            {
              id: createMessageId(),
              role: "assistant",
              content: "⚠️ No hay ninguna acción pendiente para confirmar. Primero indicame la operación (por ejemplo: 'Mover 5 toros del Potrero 1 al Potrero 2').",
            },
          ]);
          setStatus("idle");
          return;
        }

        const parsedLatestCommand = latestOperationalPrompt
          ? await parseOperationalCommand(latestOperationalPrompt)
          : null;
        const parsedAssistantHint = parsedLatestCommand || !latestAssistantHint
          ? null
          : await parseOperationalCommand(latestAssistantHint);
        const commandToExecute = parsedLatestCommand ?? parsedAssistantHint;
        const sourcePrompt = parsedLatestCommand ? latestOperationalPrompt : latestAssistantHint;

        if (!commandToExecute || !sourcePrompt) {
          setMessages((prev) => [
            ...prev,
            {
              id: createMessageId(),
              role: "assistant",
              content: "⚠️ Recibí la confirmación, pero no encontré una instrucción operativa concreta para ejecutar. Escribí la acción en una sola línea (ej: 'Mover 10 toros del Potrero 1 al Potrero 2') y luego confirmá con 'hazlo'.",
            },
          ]);
          setStatus("idle");
          return;
        }

        const hasBlockingIssues = (commandToExecute.errors?.length ?? 0) > 0 || (commandToExecute.warnings?.length ?? 0) > 0;
        if (hasBlockingIssues) {
          setMessages((prev) => [
            ...prev,
            {
              id: createMessageId(),
              role: "assistant",
              content: `⚠️ Quise ejecutar la última instrucción, pero faltan datos: ${[
                ...(commandToExecute.errors ?? []),
                ...(commandToExecute.warnings ?? []),
              ].join(" ")}`,
            },
          ]);
          setStatus("idle");
          return;
        }

        setMessages((prev) => [
          ...prev,
          {
            id: createMessageId(),
            role: "assistant",
            content: `🛠️ Confirmación recibida. Voy a ejecutar: ${summarizePendingCommand(commandToExecute, sourcePrompt)}`,
          },
        ]);

        const confirmedExecution = await executeParsedCommand(commandToExecute);
        setMessages((prev) => [
          ...prev,
          {
            id: createMessageId(),
            role: "assistant",
            content: confirmedExecution.applied
              ? `✅ Resultado de la ejecución: ${confirmedExecution.summary}`
              : `⚠️ Resultado de la ejecución: ${confirmedExecution.summary}`,
          },
        ]);
        setStatus("idle");
        return;
      }

      const parsedCommand = await parseOperationalCommand(prompt);
      if (parsedCommand) {
        const hasBlockingIssues = (parsedCommand.errors?.length ?? 0) > 0 || (parsedCommand.warnings?.length ?? 0) > 0;
        if (hasBlockingIssues) {
          setMessages((prev) => [
            ...prev,
            {
              id: createMessageId(),
              role: "assistant",
              content: `⚠️ Entendí una operación (${parsedCommand.intent}) pero faltan datos: ${[
                ...(parsedCommand.errors ?? []),
                ...(parsedCommand.warnings ?? []),
              ].join(" ")}`,
            },
          ]);
          setStatus("idle");
          return;
        }

        setPendingCommand({ parsed: parsedCommand });
        setMessages((prev) => [
          ...prev,
          {
            id: createMessageId(),
            role: "assistant",
            content: `${summarizePendingCommand(parsedCommand, prompt)}\n\nPara ejecutarla, el próximo mensaje debe ser uno de estos comandos: Hazlo, confirmado, hacelo o ejecutalo.`,
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
        parsedCommand?: ParsedCommand;
        suggestedApiCall?: SuggestedApiCall;
        contextMeta?: { paddocks: number; stockRows: number; movements: number; healthEvents: number };
      };

      const aiMessage: ChatMessage = {
        id: createMessageId(),
        role: "assistant",
        content: data.response,
      };

      setMessages((prev) => [...prev, aiMessage]);
      if (data.parsedCommand && data.suggestedApiCall) {
        await loadCommandLogs(establishmentId);
        if (data.suggestedApiCall.isReady) {
          setPendingCommand({ parsed: data.parsedCommand });
          setMessages((prev) => [
            ...prev,
            {
              id: createMessageId(),
              role: "assistant",
              content: `${summarizePendingCommand(data.parsedCommand as ParsedCommand, prompt)}\n\nAcción API sugerida: ${data.suggestedApiCall.method} ${data.suggestedApiCall.endpoint} (${data.suggestedApiCall.action}).\nPara ejecutarla, el próximo mensaje debe ser uno de estos comandos: Hazlo, confirmado, hacelo o ejecutalo.`,
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: createMessageId(),
              role: "assistant",
              content: `⚠️ La operación se detectó pero la llamada API aún no está lista: ${data.suggestedApiCall.missingOrInvalidFields.join(" ")}`,
            },
          ]);
        }
      }
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
            onChange={(event) => {
              setEstablishmentId(event.target.value);
              void loadCommandLogs(event.target.value);
            }}
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
      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="text-sm font-semibold text-slate-200">Log de llamadas (últimas 20)</h3>
        <div className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded bg-slate-950/70 p-3 text-xs">
          {logs.length === 0 && <p className="text-slate-400">Sin eventos todavía.</p>}
          {logs.map((log) => (
            <article key={log.id} className="rounded border border-slate-800 bg-slate-900 p-2">
              <p className="font-semibold text-slate-200">{log.stage} · {log.intent ?? "SIN_INTENT"}</p>
              <p className="text-slate-300">{log.message}</p>
              <p className="text-slate-500">{new Date(log.createdAt).toLocaleString("es-AR")}</p>
            </article>
          ))}
        </div>
      </section>

    </main>
  );
}
