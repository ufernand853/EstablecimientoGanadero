import { categorySynonyms, HerdCategory, OperationType } from "./enums.js";

type NameEntity = { id: string; name: string };

export type ParseContext = {
  paddocks: NameEntity[];
  consignors: NameEntity[];
  slaughterhouses: NameEntity[];
};

export type ProposedOperation = {
  type: OperationType;
  occurredAt: Date;
  payload: Record<string, unknown>;
  herdsAffected?: string[];
};

export type ParseResult = {
  intent: OperationType | "UNKNOWN";
  confidence: number;
  proposedOperations: ProposedOperation[];
  warnings: string[];
  errors: string[];
  editsNeeded?: string[];
  confirmationToken: string;
};

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const levenshtein = (a: string, b: string) => {
  const matrix = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  );
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
};

const similarity = (a: string, b: string) => {
  const distance = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length) || 1;
  return 1 - distance / maxLen;
};

const fuzzyFind = (value: string, items: NameEntity[], threshold = 0.72) => {
  const normalized = normalize(value);
  const exactMatch = items.find((item) => normalize(item.name) === normalized);
  if (exactMatch) {
    return { match: exactMatch, alternatives: [] };
  }

  const scored = items.map((item) => ({
    item,
    score: similarity(normalized, normalize(item.name)),
  }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < threshold) {
    return { match: null, alternatives: scored.slice(0, 3).map((s) => s.item) };
  }
  if (scored.length > 1 && scored[1].score >= threshold) {
    return { match: null, alternatives: scored.slice(0, 3).map((s) => s.item) };
  }
  return { match: best.item, alternatives: [] };
};

const parseDate = (raw?: string) => {
  if (!raw) {
    return new Date();
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized.includes("hoy")) {
    return new Date();
  }
  if (/\d{4}-\d{2}-\d{2}/.test(normalized)) {
    return new Date(normalized);
  }
  if (/\d{1,2}\/\d{1,2}/.test(normalized)) {
    const [day, month] = normalized.split("/").map(Number);
    const now = new Date();
    return new Date(now.getFullYear(), (month ?? 1) - 1, day ?? 1);
  }
  return new Date();
};

const findCategory = (text: string): HerdCategory | null => {
  const normalized = normalize(text);
  for (const [category, synonyms] of Object.entries(categorySynonyms)) {
    if (synonyms.some((syn) => normalized.includes(normalize(syn)))) {
      return category as HerdCategory;
    }
  }
  return null;
};

export const parseCommand = (text: string, context: ParseContext): ParseResult => {
  const warnings: string[] = [];
  const errors: string[] = [];
  const editsNeeded: string[] = [];
  const normalized = normalize(text);

  const result: ParseResult = {
    intent: "UNKNOWN",
    confidence: 0.2,
    proposedOperations: [],
    warnings,
    errors,
    confirmationToken: crypto.randomUUID(),
  };

  if (normalized.startsWith("mover")) {
    const qtyMatch = text.match(/(\d+)/);
    const qty = qtyMatch ? Number(qtyMatch[1]) : null;
    const category = findCategory(text);
    const [originSegment = "", destinationSegment = ""] = text.split(/\sal\s+/i, 2);
    const fromMatch = originSegment.match(/(?:desde|del|de\s+la|de\s+los|de\s+las|de)\s+(?:el|la|los|las)?\s*(.+)$/i);
    const toMatch = destinationSegment.match(/^([^,]+?)(?:\s+hoy|$)/i);
    const fromName = fromMatch?.[1]?.trim() ?? "";
    const toName = toMatch?.[1]?.trim() ?? "";
    const from = fromName ? fuzzyFind(fromName, context.paddocks) : { match: null, alternatives: [] };
    const to = toName ? fuzzyFind(toName, context.paddocks) : { match: null, alternatives: [] };

    if (!qty) warnings.push("Falta cantidad a mover.");
    if (!category) warnings.push("Falta categoría del lote.");
    if (!from.match) warnings.push("No se pudo identificar el potrero de origen.");
    if (!to.match) warnings.push("No se pudo identificar el potrero de destino.");

    result.intent = "MOVE";
    result.confidence = 0.7;
    result.proposedOperations.push({
      type: "MOVE",
      occurredAt: parseDate(text),
      payload: {
        qty,
        category,
        fromPaddockId: from.match?.id ?? null,
        toPaddockId: to.match?.id ?? null,
      },
    });
  }

  if (normalized.startsWith("vacunar")) {
    const qtyMatch = text.match(/(\d+)/);
    const doseMatch = text.match(/(\d+(?:\.\d+)?\s?ml)/i);
    const productMatch = text.match(/vacunar\s+[^,]+\s+([a-záéíóúñ\s]+)/i);
    const category = findCategory(text);

    result.intent = "VACCINATION";
    result.confidence = 0.65;
    if (!category) warnings.push("Falta categoría del lote a vacunar.");
    result.proposedOperations.push({
      type: "VACCINATION",
      occurredAt: parseDate(text),
      payload: {
        qty: qtyMatch ? Number(qtyMatch[1]) : null,
        category,
        product: productMatch?.[1]?.trim() ?? null,
        dose: doseMatch?.[1] ?? null,
      },
    });
  }


  if (normalized.startsWith("desparasitar")) {
    const qtyMatch = text.match(/(\d+)/);
    const doseMatch = text.match(/(\d+(?:\.\d+)?\s?ml)/i);
    const productMatch = text.match(/desparasitar\s+[^,]+\s+([a-záéíóúñ\s]+)/i);
    const category = findCategory(text);

    result.intent = "DEWORMING";
    result.confidence = 0.65;
    if (!category) warnings.push("Falta categoría del lote a desparasitar.");
    result.proposedOperations.push({
      type: "DEWORMING",
      occurredAt: parseDate(text),
      payload: {
        qty: qtyMatch ? Number(qtyMatch[1]) : null,
        category,
        product: productMatch?.[1]?.trim() ?? "desparasitación",
        dose: doseMatch?.[1] ?? null,
      },
    });
  }

  if (normalized.startsWith("tratar") || normalized.startsWith("tratamiento")) {
    const qtyMatch = text.match(/(\d+)/);
    const doseMatch = text.match(/(\d+(?:\.\d+)?\s?ml)/i);
    const productMatch = text.match(/(?:tratar|tratamiento)\s+[^,]+\s+([a-záéíóúñ\s]+)/i);
    const category = findCategory(text);

    result.intent = "TREATMENT";
    result.confidence = 0.6;
    if (!category) warnings.push("Falta categoría del lote en tratamiento.");
    result.proposedOperations.push({
      type: "TREATMENT",
      occurredAt: parseDate(text),
      payload: {
        qty: qtyMatch ? Number(qtyMatch[1]) : null,
        category,
        product: productMatch?.[1]?.trim() ?? "tratamiento",
        dose: doseMatch?.[1] ?? null,
      },
    });
  }
  if (normalized.startsWith("iniciar entore")) {
    const cows = findCategory(text) ?? "VACAS";
    const bullsMatch = text.match(/con\s+(\d+)\s+toros/i);
    const fromMatch = text.match(/desde\s+([^\s]+)\s+hasta/i);
    const toMatch = text.match(/hasta\s+([^\s]+)/i);

    result.intent = "BREEDING_START";
    result.confidence = 0.7;
    result.proposedOperations.push({
      type: "BREEDING_START",
      occurredAt: parseDate(fromMatch?.[1] ?? ""),
      payload: {
        category: cows,
        bulls: bullsMatch ? Number(bullsMatch[1]) : null,
        endAt: parseDate(toMatch?.[1] ?? "").toISOString(),
      },
    });
  }

  if (normalized.startsWith("destetar")) {
    const qtyMatch = text.match(/(\d+)/);
    const herdMatch = text.match(/lote\s+([a-z0-9-]+)/i);
    const weightMatch = text.match(/peso\s+(\d+)/i);
    const category = findCategory(text);
    const toCategory = category === "TERNERAS" ? "VAQUILLONAS" : "TERNEROS_DESTETADOS";

    result.intent = "WEANING";
    result.confidence = 0.75;
    if (!category) warnings.push("Falta categoría del lote a destetar.");
    result.proposedOperations.push({
      type: "WEANING",
      occurredAt: parseDate(text),
      payload: {
        qty: qtyMatch ? Number(qtyMatch[1]) : null,
        category,
        toCategory,
        herdCode: herdMatch?.[1]?.toUpperCase() ?? null,
        avgWeightKg: weightMatch ? Number(weightMatch[1]) : null,
      },
    });
  }

  if (normalized.startsWith("yerra")) {
    const qtyMatch = text.match(/yerra\s+(\d+)/i);
    const castrateMatch = text.match(/castrar\s+(\d+)/i);

    result.intent = "BRANDING";
    result.confidence = 0.7;
    result.proposedOperations.push({
      type: "BRANDING",
      occurredAt: parseDate(text),
      payload: {
        qty: qtyMatch ? Number(qtyMatch[1]) : null,
        castrateQty: castrateMatch ? Number(castrateMatch[1]) : null,
      },
    });
  }

  if (normalized.startsWith("enviar a frigor")) {
    const consignorMatch = text.match(/consignatario\s+([^:]+):/i);
    const slaughterMatch = text.match(/frigor[ií]fico\s+([^p]+?)\s+por/i);
    const items = Array.from(text.matchAll(/(\d+)\s+([a-záéíóúñ\s]+?)\s+a\s+(\d+)/gi)).map(
      (match) => ({
        qty: Number(match[1]),
        category: findCategory(match[2] ?? ""),
        unitPrice: Number(match[3]),
      }),
    );

    const consignor = consignorMatch
      ? fuzzyFind(consignorMatch[1].trim(), context.consignors)
      : { match: null, alternatives: [] };
    const slaughterhouse = slaughterMatch
      ? fuzzyFind(slaughterMatch[1].trim(), context.slaughterhouses)
      : { match: null, alternatives: [] };

    if (!consignor.match) warnings.push("Consignatario no identificado.");
    if (!slaughterhouse.match) warnings.push("Frigorífico no identificado.");
    if (items.some((item) => !item.category)) warnings.push("Faltan categorías en los ítems.");
    warnings.push("Se requiere asignar lotes para confirmar la consignación.");
    editsNeeded.push("Asignar herd_id a cada ítem antes de confirmar.");

    result.intent = "SLAUGHTER_SHIPMENT";
    result.confidence = 0.8;
    result.proposedOperations.push({
      type: "SLAUGHTER_SHIPMENT",
      occurredAt: parseDate(text),
      payload: {
        consignorId: consignor.match?.id ?? null,
        slaughterhouseId: slaughterhouse.match?.id ?? null,
        items,
      },
    });
  }

  if (warnings.length) {
    result.editsNeeded = editsNeeded.length ? editsNeeded : undefined;
  }

  if (result.intent === "UNKNOWN") {
    errors.push("No se pudo reconocer la intención.");
  }

  return result;
};
