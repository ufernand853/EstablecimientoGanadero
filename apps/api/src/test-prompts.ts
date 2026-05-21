/**
 * Script para probar distintos prompts del modo campo sin necesitar base de datos.
 * Simula la lógica de detección de patrones del endpoint /field/assistant.
 *
 * Uso: tsx src/test-prompts.ts
 * O:   tsx src/test-prompts.ts "tu prompt aquí"
 */

// ─── Funciones copiadas de index.ts ─────────────────────────────────────────

const normalizeFieldText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const EAR_TAG_REGEX = /\b(858\d{9}|[A-Za-z]{2,3}[\-\s]?\d{4,8}|\d{4,8})\b/i;

const detectEarTagInText = (text: string): string | null => {
  const match = text.match(EAR_TAG_REGEX);
  if (!match) return null;
  return match[1].trim().toUpperCase().replace(/\s+/, "-");
};

const isTaskCreationPrompt = (normalized: string) =>
  /\b(crea|crear|agendar|agenda|programar|programa|recordame|recordar|nueva|nuevo)\b/.test(normalized) &&
  /\b(tarea|actividad|recordatorio|revisar|verificar|chequeo|recorrida|tacto|pesaje)\b/.test(normalized);

const isAnimalTagsQuery = (normalized: string) =>
  /\b(caravana|caravanas|animal|animales)\b/.test(normalized) &&
  /\b(cuant[oa]s?|cantidad|total|tengo|registrad[oa]s?|dame|mostrar|mostrame|ver|detalle|detallame|lista|listar)\b/.test(normalized);

const isAnimalTagsCountQuery = (normalized: string) =>
  /\b(cuant[oa]s?|cantidad|total|tengo)\b/.test(normalized) &&
  /\b(caravana|caravanas|animal|animales)\b/.test(normalized);

const extractPaddockNameFromText = (text: string) => {
  const match = text.match(/potrero\s+([a-záéíóúñ0-9\- ]{1,60})/i);
  if (!match?.[1]) return null;
  const name = match[1].trim()
    .replace(/\s+(?:con(?:tra)?|para|de|y|o|sin|que)\b.*/i, "")
    .replace(/[.,;].*$/, "");
  return `Potrero ${name}`.trim();
};

const extractTaskTitle = (text: string) => {
  const cleaned = text
    .replace(/^(crear|crea|agendar|agenda|programar|programa|recordar|recordame)\s+(una\s+)?(tarea|actividad|recordatorio)?\s*/i, "")
    .replace(/^(urgente|importante|alta|media|baja)\s*:?\s*/i, "")
    .trim();
  return cleaned ? cleaned[0].toUpperCase() + cleaned.slice(1) : "Nueva tarea de campo";
};

const inferTaskPriority = (text: string) => {
  const normalized = normalizeFieldText(text);
  if (/\burgente\b|\bcritico\b|\bcrítica\b|\bcritica\b/.test(normalized)) return "URGENT";
  if (/\balta\b|\bimportante\b|\bvigil/.test(normalized)) return "HIGH";
  if (/\bbaja\b/.test(normalized)) return "LOW";
  return "MEDIUM";
};

const inferTaskType = (text: string) => {
  const normalized = normalizeFieldText(text);
  if (/vacun|sanidad|veterin|aftosa|brucel|tubercul/.test(normalized)) return "HEALTH";
  if (/parto|preñ|prenez|tacto|cria|cría/.test(normalized)) return "REPRODUCTION";
  if (/potrero|alambr|agua|bebedero|aguada|pastura/.test(normalized)) return "PADDOCK_REVIEW";
  if (/peso|pesaj/.test(normalized)) return "WEIGHING";
  if (/mover|traslad|rotacion|rotación/.test(normalized)) return "MOVEMENT";
  return "FIELD_CHECK";
};

const parseRelativeSchedule = (text: string) => {
  const normalized = normalizeFieldText(text);
  const now = new Date();
  const target = new Date(now);
  if (normalized.includes("manana")) target.setDate(target.getDate() + 1);
  const timeMatch = text.match(/(?:a las|hora|\b)(\d{1,2})(?::(\d{2}))?\s*(?:hs|h|horas)?/i);
  if (timeMatch) {
    target.setHours(Number(timeMatch[1]), Number(timeMatch[2] ?? 0), 0, 0);
  } else {
    target.setHours(8, 0, 0, 0);
  }
  if (normalized.includes("manana") || /\b\d{1,2}(?::\d{2})?\s*(hs|h|horas)\b/i.test(text) || /a las \d{1,2}/i.test(text)) {
    return target.toISOString();
  }
  return null;
};

// ─── Clasificador de prompts ─────────────────────────────────────────────────

type PromptResult = {
  prompt: string;
  normalized: string;
  mode: "ANSWER" | "CONFIRMATION_REQUIRED" | "MISSING_DATA" | "UNKNOWN";
  intent: string;
  confidence: number;
  details: Record<string, unknown>;
  message: string;
};

function classifyPrompt(prompt: string): PromptResult {
  const normalized = normalizeFieldText(prompt);
  const detectedEarTag = detectEarTagInText(prompt);

  // 1. Consulta de preñadas
  if (
    /\b(preñadas|prenadas|preñez|prenez)\b/.test(normalized) &&
    /\b(donde|dónde|estan|están|tengo|detalle|lista|listar)\b/.test(normalized)
  ) {
    return { prompt, normalized, mode: "ANSWER", intent: "QUERY_PREGNANT_FEMALES", confidence: 0.82, details: {}, message: "[Requiere DB] Respondería con lista de hembras preñadas por potrero." };
  }

  // 2. Consulta de insumos/medicamentos
  if (
    /\b(insumo|insumos|medicamento|medicamentos|vacuna|vacunas|vencen|vence|vencimiento|vencimientos)\b/.test(normalized) &&
    /\b(dame|mostrar|mostrame|ver|detalle|lista|listar|que|qué|cuales|cu[aá]les)\b/.test(normalized)
  ) {
    return { prompt, normalized, mode: "ANSWER", intent: "QUERY_SUPPLIES", confidence: 0.84, details: {}, message: "[Requiere DB] Respondería con insumos próximos a vencer." };
  }

  // 3. Consulta de stock
  if (
    /\b(stock|existencia|existencias|cabezas|categorias|categorías)\b/.test(normalized) &&
    /\b(dame|mostrar|mostrame|ver|detalle|detallame|resumen|lista|listar|como|cómo)\b/.test(normalized)
  ) {
    return { prompt, normalized, mode: "ANSWER", intent: "QUERY_HERD_SUMMARY", confidence: 0.84, details: {}, message: "[Requiere DB] Respondería con stock detallado por categoría y potrero." };
  }

  // 4. Consulta de caravanas/animales
  if (isAnimalTagsQuery(normalized)) {
    const isCount = isAnimalTagsCountQuery(normalized);
    return { prompt, normalized, mode: "ANSWER", intent: "QUERY_ANIMAL_TAGS", confidence: 0.9, details: { isCount }, message: isCount ? "[Requiere DB] Respondería con el conteo total de animales registrados." : "[Requiere DB] Respondería con detalle de caravanas por potrero." };
  }

  // 5. Consulta de resumen/dashboard
  if (
    /\b(resumen|dashboard|rode[oó]|establecimiento)\b/.test(normalized) &&
    /\b(dame|mostrar|mostrame|ver|resumen|detalle|detallame)\b/.test(normalized)
  ) {
    const isDetailed = /\b(detalle|detallame|completo|completa)\b/.test(normalized);
    return { prompt, normalized, mode: "ANSWER", intent: "QUERY_HERD_SUMMARY", confidence: 0.82, details: { isDetailed }, message: isDetailed ? "[Requiere DB] Respondería con resumen detallado del rodeo." : "[Requiere DB] Respondería con KPIs: animales, preñadas, tareas." };
  }

  // 6. Completar tarea
  if (
    /\b(marcar|marca|cerrar|cerrá|completar|completa|hecha|hecho|terminada|terminado)\b/.test(normalized) &&
    /\b(tarea|recorrida|verificar|chequeo|revision|revisión)\b/.test(normalized)
  ) {
    return { prompt, normalized, mode: "ANSWER", intent: "COMPLETE_TASK", confidence: 0.78, details: {}, message: "[Requiere DB] Buscaría la tarea más coincidente y la marcaría como hecha." };
  }

  // 7. Crear tarea
  if (isTaskCreationPrompt(normalized)) {
    const title = extractTaskTitle(prompt);
    const priority = inferTaskPriority(prompt);
    const type = inferTaskType(prompt);
    const scheduledAt = parseRelativeSchedule(prompt);
    const paddockName = extractPaddockNameFromText(prompt);
    return {
      prompt, normalized, mode: "ANSWER", intent: "CREATE_TASK", confidence: 0.86,
      details: { title, priority, type, scheduledAt: scheduledAt ?? "ahora", paddockName },
      message: `[Requiere DB] Crearía tarea "${title}" con prioridad ${priority}, tipo ${type}${paddockName ? `, en ${paddockName}` : ""}${scheduledAt ? `, programada ${scheduledAt}` : ""}.`,
    };
  }

  // 8. Alta de potrero
  if (/\b(dar de alta|crear|alta)\b/.test(normalized) && /\bpotrero\b/.test(normalized)) {
    const nameMatch = prompt.match(/(?:potrero|nuevo potrero)[,\s]+([a-záéíóúñ0-9 ]{2,80}?)(?=,|\s+de\s+\d+|\s+\d+\s*(?:ha|hect)|$)/i);
    const hectaresMatch = prompt.match(/(\d+(?:[.,]\d+)?)\s*(?:ha|hect[aá]reas?)/i);
    const name = nameMatch?.[1]?.trim() || "Potrero nuevo";
    const areaHa = hectaresMatch?.[1] ? Number(hectaresMatch[1].replace(",", ".")) : null;
    return {
      prompt, normalized, mode: "CONFIRMATION_REQUIRED", intent: "CREATE_PADDOCK", confidence: 0.82,
      details: { name, areaHa },
      message: `Pediría confirmación para crear el potrero "${name}"${areaHa ? ` de ${areaHa} ha` : " (sin hectáreas)"}.`,
    };
  }

  // 9. Vacunación por lote
  if (/\b(vacun[aeoéó]r?|vacuné|vacunó|vacunamos|vacunaron|vacunaste|vacunacion)\b/.test(normalized) && /\b(toda|todo|lote|tropa|potrero)\b/.test(normalized)) {
    const paddockName = extractPaddockNameFromText(prompt);
    const productMatch =
      prompt.match(/\bcontra\s+([a-záéíóúñ0-9]+(?:\s+[a-záéíóúñ0-9]+){0,2}?)(?=\s+(?:potrero|lote|todo|toda|tropa)|[,.]|$)/i)
      ?? prompt.match(/\b(?:con|para|de)\b\s+([a-záéíóúñ0-9]+(?:\s+[a-záéíóúñ0-9]+){0,2}?)(?=\s+(?:potrero|lote|todo|toda|tropa)|[,.]|$)/i)
      ?? prompt.match(/vacun\S+\s+([a-záéíóúñ0-9 ]{2,40}?)(?=\s+(?:a\s+toda|toda|al\s+potrero|potrero|lote|todo)\b|,|$)/i);
    const product = productMatch?.[1]?.trim() || (normalized.includes("aftosa") ? "aftosa" : "vacuna");
    return {
      prompt, normalized, mode: "CONFIRMATION_REQUIRED", intent: "REGISTER_VACCINATION", confidence: 0.78,
      details: { product, paddockName },
      message: `Pediría confirmación para registrar vacunación "${product}"${paddockName ? ` en ${paddockName}` : " (sin potrero identificado ⚠️)"}.`,
    };
  }

  // 10. Baja por muerte
  if (detectedEarTag && /\b(murio|murió|muerta|muerto|muerte|baja)\b/.test(normalized)) {
    const paddockName = extractPaddockNameFromText(prompt);
    return {
      prompt, normalized, mode: "CONFIRMATION_REQUIRED", intent: "REGISTER_DEATH", confidence: 0.86,
      details: { earTag: detectedEarTag, paddockName },
      message: `Pediría confirmación para registrar baja por muerte de ${detectedEarTag}${paddockName ? ` en ${paddockName}` : ""}. Crearía tarea urgente de verificación.`,
    };
  }

  // 11. Registro de parto
  if (detectedEarTag && /\b(pario|parió|parto|nacimiento)\b/.test(normalized)) {
    const calfTags = Array.from(prompt.matchAll(/858\d{9}/g)).map((m) => m[0]);
    const calfEarTag = calfTags.find((tag) => tag !== detectedEarTag) ?? null;
    const weightMatch = prompt.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|kilos?)/i);
    const sex = /ternera|hembra/i.test(prompt) ? "HEMBRA" : /ternero|macho/i.test(prompt) ? "MACHO" : "OTRO";
    if (!calfEarTag) {
      return { prompt, normalized, mode: "MISSING_DATA", intent: "REGISTER_BIRTH", confidence: 0.65, details: { motherEarTag: detectedEarTag }, message: `Detecté parto de ${detectedEarTag}, pero falta la caravana de la cría.` };
    }
    return {
      prompt, normalized, mode: "CONFIRMATION_REQUIRED", intent: "REGISTER_BIRTH", confidence: 0.86,
      details: { motherEarTag: detectedEarTag, calfEarTag, sex, weight: weightMatch?.[1] ?? null },
      message: `Pediría confirmación para registrar parto de ${detectedEarTag}, cría ${calfEarTag} (${sex})${weightMatch?.[1] ? `, ${weightMatch[1]} kg` : ""}.`,
    };
  }

  // 12. Fallback
  return {
    prompt, normalized, mode: "UNKNOWN", intent: "UNKNOWN", confidence: 0.35,
    details: {},
    message: "No reconocí el intent. Respondería con ayuda sobre qué puede hacer el asistente.",
  };
}

// ─── ANSI colors ─────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
};

const modeColor = (mode: string) => {
  if (mode === "ANSWER") return C.green;
  if (mode === "CONFIRMATION_REQUIRED") return C.yellow;
  if (mode === "MISSING_DATA") return C.magenta;
  return C.red;
};

function printResult(r: PromptResult, index: number) {
  const mc = modeColor(r.mode);
  console.log(`\n${C.bold}${C.cyan}[${index}]${C.reset} ${C.bold}"${r.prompt}"${C.reset}`);
  console.log(`    ${C.gray}normalizado:${C.reset} "${r.normalized}"`);
  console.log(`    ${mc}${C.bold}mode:${C.reset} ${mc}${r.mode}${C.reset}  ${C.gray}intent:${C.reset} ${C.bold}${r.intent}${C.reset}  ${C.gray}confidence:${C.reset} ${(r.confidence * 100).toFixed(0)}%`);
  if (Object.keys(r.details).length > 0) {
    console.log(`    ${C.gray}extraído:${C.reset}  ${JSON.stringify(r.details)}`);
  }
  console.log(`    ${C.dim}→ ${r.message}${C.reset}`);
}

// ─── Prompts de prueba ────────────────────────────────────────────────────────

const TEST_PROMPTS: string[] = [
  // Consultas
  "Dame el resumen del establecimiento",
  "Mostrame el stock por categoría",
  "Donde están las preñadas",
  "Cuantos animales tengo registrados",
  "Dame detalle de caravanas",
  "Qué vacunas vencen esta semana",
  // Tareas
  "Crear tarea revisar potrero norte mañana",
  "Agendar recorrida urgente para hoy a las 7hs",
  "Recordame tacto reproductor potrero sur",
  "Marca hecha la recorrida",
  // Acciones con confirmación
  "Vacuné todo el lote aftosa potrero norte",
  "Vacunar potrero sur con brucelosis",
  "Dar de alta potrero La Lomada de 150 ha",
  "Alta potrero El Bajo",
  // Eventos con caravana (SINIIGA UY: 858 + 9 dígitos = 12 total)
  "Murió el animal UY-1234 en potrero norte",
  "858123456789 baja por muerte",
  "858123456789 parió, cría 858987654321",
  "858123456789 parto ternera 858987654321 38 kg",
  "858123456789 parió sin caravana de cría",
  // Casos edge / UNKNOWN
  "Hola cómo estás",
  "Cuánto vale el novillo hoy",
  "Hace calor",
];

// ─── Entry point ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const prompts = args.length > 0 ? args : TEST_PROMPTS;

const modeStats: Record<string, number> = { ANSWER: 0, CONFIRMATION_REQUIRED: 0, MISSING_DATA: 0, UNKNOWN: 0 };

console.log(`\n${C.bold}${C.blue}═══ Test de prompts — Modo Campo ═══${C.reset}`);
console.log(`${C.gray}Probando ${prompts.length} prompt(s)...${C.reset}`);

prompts.forEach((p, i) => {
  const r = classifyPrompt(p);
  modeStats[r.mode] = (modeStats[r.mode] ?? 0) + 1;
  printResult(r, i + 1);
});

if (prompts.length > 1) {
  console.log(`\n${C.bold}${C.blue}─── Resumen ───${C.reset}`);
  for (const [mode, count] of Object.entries(modeStats)) {
    if (count > 0) {
      const mc = modeColor(mode);
      const bar = "█".repeat(count);
      console.log(`  ${mc}${mode.padEnd(24)}${C.reset} ${bar} ${C.gray}(${count})${C.reset}`);
    }
  }
}
console.log();
