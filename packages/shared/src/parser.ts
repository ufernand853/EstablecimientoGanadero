import { categorySynonyms, HerdCategory, OperationType } from "./enums.js";

type NameEntity = { id: string; name: string };

export type ParseContext = {
  paddocks: NameEntity[];
  consignors: NameEntity[];
  slaughterhouses: NameEntity[];
  supplies?: NameEntity[];
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
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

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

  const boundedMatches = items.filter((item) => {
    const candidate = normalize(item.name);
    return candidate.startsWith(`${normalized} `) || candidate.includes(` ${normalized} `);
  });
  if (boundedMatches.length === 1) {
    return { match: boundedMatches[0], alternatives: [] };
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
  const isoMatch = normalized.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch?.[1]) {
    return new Date(`${isoMatch[1]}T00:00:00.000Z`);
  }
  const slashMatch = normalized.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    const now = new Date();
    const rawYear = slashMatch[3] ? Number(slashMatch[3]) : now.getFullYear();
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    return new Date(Date.UTC(year, month - 1, day));
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

const findPaddock = (text: string, paddocks: NameEntity[]) => {
  const match = text.match(/potrero\s+\d+(?:\s*-\s*[a-z0-9\s]+)?|potrero\s+[a-z0-9-]+|loma\s+[a-z0-9-]+/i);
  if (!match) {
    return null;
  }
  return fuzzyFind(match[0], paddocks).match;
};


const spanishNumberWords: Record<string, number> = {
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
};

const extractIncidentQty = (text: string) => {
  const wordMatch = normalize(text).match(/\b(un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/);
  if (wordMatch?.[1]) return spanishNumberWords[wordMatch[1]];

  const numericMatches = Array.from(text.matchAll(/\b(\d+)\b/g));
  const animalQtyMatch = numericMatches.find((match) => {
    const prefix = text.slice(Math.max(0, (match.index ?? 0) - 12), match.index).toLowerCase();
    return !/potrero\s*$/.test(prefix);
  });
  return animalQtyMatch?.[1] ? Number(animalQtyMatch[1]) : null;
};

const buildIncidentTitle = (text: string, category: HerdCategory | null, qty: number | null) => {
  const normalized = normalize(text);
  const categoryText = category ? category.toLowerCase().replace(/_/g, " ") : "animales";
  const prefix = qty ? `${qty} ${categoryText}` : categoryText;
  if (/\babichad/.test(normalized)) return `${prefix} abichado${qty === 1 ? "" : "s"}`;
  if (/\bmuert/.test(normalized)) return `${prefix} muerto${qty === 1 ? "" : "s"}`;
  if (/\b(herid|lastimad|lesionad)/.test(normalized)) return `${prefix} herido${qty === 1 ? "" : "s"}`;
  if (/\b(caid|manc)/.test(normalized)) return `${prefix} con problema en campo`;
  return "Incidente en campo";
};

const extractResponsible = (text: string) => {
  const byVaccinatedMatch = text.match(/(?:vacun[oó]|vacuno|vacunó)\s+([a-záéíóúñ][a-záéíóúñ\s.'-]{1,60})/i);
  if (byVaccinatedMatch?.[1]) return byVaccinatedMatch[1].trim();
  const byPorMatch = text.match(/\bpor\s+([a-záéíóúñ][a-záéíóúñ\s.'-]{1,60})/i);
  if (byPorMatch?.[1]) return byPorMatch[1].trim();
  return null;
};


const extractExpirationDate = (text: string) => {
  const match = text.match(/(?:vence|vencimiento|fecha de vencimiento|fecha vencimiento)\s*(?:el|para|:)?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}\/[0-9]{1,2}(?:\/[0-9]{2,4})?)/i);
  return match?.[1] ? parseDate(match[1]) : null;
};

const extractSupplyName = (rawName: string, supplies: NameEntity[] = []) => {
  const cleaned = rawName
    .replace(/\b(?:con|y|de)?\s*(?:fecha de vencimiento|fecha vencimiento|vencimiento|vence|lote)\b[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return { name: null, id: null };
  const matchedSupply = supplies.length ? fuzzyFind(cleaned, supplies, 0.68).match : null;
  return { name: matchedSupply?.name ?? cleaned, id: matchedSupply?.id ?? null };
};

const inferSupplyType = (text: string) => {
  const normalized = normalize(text);
  if (/\b(vacuna|vacunas|vacunar|aftosa|carbunclo|clostridial)\b/.test(normalized)) return "VACCINE";
  if (/\b(ivermectina|doramectina|desparasitar|antiparasitario|antiparasitaria)\b/.test(normalized)) return "DEWORMER";
  if (/\b(antibiotico|antibiotica|penicilina|oxitetraciclina|tratamiento)\b/.test(normalized)) return "MEDICINE";
  return "MEDICINE";
};

const extractHealthSupplySearchTerm = (text: string) => {
  const diseaseMatch = text.match(/\bcontra\s+(?:la|el|los|las)?\s*([a-záéíóúñ0-9][a-záéíóúñ0-9\s.-]{1,60}?)(?=\s+(?:en|el|del|de|al)\s+potrero|,|\.|$)/i);
  if (diseaseMatch?.[1]) return diseaseMatch[1].trim();
  const productMatch = text.match(/\bcon\s+([a-záéíóúñ0-9][a-záéíóúñ0-9\s.-]{1,80}?)(?=\s+(?:en|el|del|de|al)\s+potrero|,|\.|$)/i);
  return productMatch?.[1]?.trim() ?? null;
};

const generateConfirmationToken = () => {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `local-${Date.now().toString(36)}-${randomPart}`;
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
    confirmationToken: generateConfirmationToken(),
  };

  const isSupplyStockInIntent = /\b(ingresa|ingresar|agrega|agregar|carga|cargar|alta|sumar|sumale)\b/.test(normalized)
    && /\b(stock|deposito|insumo|medicamento|vacuna|cajas?|frascos?|dosis|unidades)\b/.test(normalized);
  if (isSupplyStockInIntent) {
    const quantityMatch = text.match(/(\d+(?:[,.]\d+)?)\s*(cajas?|frascos?|dosis|unidades|unid\.?|ml|litros?|lts?|kg|bolsas?)/i);
    const quantity = quantityMatch ? Number(quantityMatch[1].replace(",", ".")) : null;
    const unit = quantityMatch?.[2]?.replace(/\.$/, "").toLowerCase() ?? null;
    const afterQuantity = quantityMatch?.index !== undefined
      ? text.slice(quantityMatch.index + quantityMatch[0].length)
      : text;
    const supplyNameMatch = afterQuantity.match(/(?:de|del|la|el)?\s*([a-záéíóúñ0-9][a-záéíóúñ0-9\s.-]{1,100})/i);
    const supply = extractSupplyName(supplyNameMatch?.[1] ?? "", context.supplies);
    const expirationDate = extractExpirationDate(text);
    const batchNumber = text.match(/\blote\s+([a-z0-9-]+)/i)?.[1]?.trim() ?? null;

    result.intent = "SUPPLY_STOCK_IN";
    result.confidence = 0.78;
    if (!quantity) warnings.push("Falta cantidad del insumo a ingresar.");
    if (!unit) warnings.push("Falta unidad o presentación del insumo.");
    if (!supply.name) warnings.push("Falta nombre del medicamento o vacuna.");
    if (!expirationDate) warnings.push("Falta fecha de vencimiento del lote.");
    result.proposedOperations.push({
      type: "SUPPLY_STOCK_IN",
      occurredAt: parseDate(text),
      payload: {
        supplyId: supply.id,
        supplyName: supply.name,
        supplyType: inferSupplyType(`${supply.name ?? ""} ${text}`),
        quantityInitial: quantity,
        quantityAvailable: quantity,
        unit,
        batchNumber,
        expirationDate: expirationDate?.toISOString() ?? null,
        source: "VOICE_COMMAND",
      },
    });
  }

  const isHealthSupplyCheckIntent = /\b(vamos a|hay que|queremos|planificar|preparar)\b/.test(normalized)
    && /\b(vacunar|desparasitar|tratar)\b/.test(normalized);
  if (isHealthSupplyCheckIntent && result.intent === "UNKNOWN") {
    const paddock = findPaddock(text, context.paddocks);
    const searchTerm = extractHealthSupplySearchTerm(text);
    const action = /\bdesparasitar\b/.test(normalized)
      ? "DEWORMING"
      : /\btratar\b/.test(normalized)
        ? "TREATMENT"
        : "VACCINATION";

    result.intent = "HEALTH_SUPPLY_CHECK";
    result.confidence = 0.72;
    if (!paddock) warnings.push("Falta o no se pudo identificar el potrero para validar stock sanitario.");
    if (!searchTerm) warnings.push("Falta enfermedad, principio activo o producto a validar.");
    result.proposedOperations.push({
      type: "HEALTH_SUPPLY_CHECK",
      occurredAt: parseDate(text),
      payload: {
        healthAction: action,
        paddockId: paddock?.id ?? null,
        paddockName: paddock?.name ?? null,
        searchTerm,
        requiredSupplyType: action === "VACCINATION" ? "VACCINE" : inferSupplyType(text),
        mustBeAvailable: true,
        mustNotBeExpired: true,
      },
    });
  }

  const isMoveIntent = /\b(mover|move|trasladar|pasar)\b/.test(normalized);
  if (isMoveIntent) {
    const qtyMatch = text.match(/(\d+)/);
    const qty = qtyMatch ? Number(qtyMatch[1]) : null;
    const category = findCategory(text);
    const fromMatches = Array.from(text.matchAll(/(?:desde|del|de\s+la|de\s+los|de\s+las|de)\s+(?:el|la|los|las)?\s*([^,]+?)(?=\s+(?:al|a|hacia)\s|,|$)/gi));
    const toMatches = Array.from(text.matchAll(/\b(?:al|hacia)\s+(?:el|la|los|las)?\s*([^,]+?)(?=,|\s+hoy|$)/gi));
    const toMatchUsingA = text.match(/\b(?:de|desde|del|de\s+la|de\s+los|de\s+las)\b[\s\S]*?\ba\s+(?:el|la|los|las)?\s*([^,]+?)(?=,|\s+hoy|$)/i);
    const fromMatch = fromMatches[fromMatches.length - 1];
    const toMatch = toMatches[toMatches.length - 1] ?? toMatchUsingA;
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

  const isVaccinationIntent = /\b(vacunar|vacunamos|vacunado|vacunados|aplicamos|aplicar)\b/.test(normalized);
  if (isVaccinationIntent && result.intent === "UNKNOWN") {
    const qtyMatch = text.match(/(\d+)/);
    const doseMatch = text.match(/(\d+(?:\.\d+)?\s?ml)/i);
    const productMatch = text.match(/\bcon\s+([a-záéíóúñ0-9][a-záéíóúñ0-9\s.-]{1,80}?)(?=\s+y\s+(?:lo|los|la|las)\s+vacun|\s+por\s+[a-záéíóúñ]|,|\.|$)/i);
    const category = findCategory(text);
    const paddock = findPaddock(text, context.paddocks);
    const responsible = extractResponsible(text);

    result.intent = "VACCINATION";
    result.confidence = 0.65;
    if (!category) warnings.push("Falta categoría del lote a vacunar.");
    if (!paddock) warnings.push("Falta o no se pudo identificar el potrero.");
    if (!responsible) warnings.push("Falta indicar quién vacunó.");
    result.proposedOperations.push({
      type: "VACCINATION",
      occurredAt: parseDate(text),
      payload: {
        qty: qtyMatch ? Number(qtyMatch[1]) : null,
        category,
        paddockId: paddock?.id ?? null,
        product: productMatch?.[1]?.trim() ?? null,
        responsible,
        dose: doseMatch?.[1] ?? null,
      },
    });
  }


  const isDewormingIntent = /\b(desparasitar|desparasitamos)\b/.test(normalized);
  if (isDewormingIntent && result.intent === "UNKNOWN") {
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

  if ((normalized.startsWith("tratar") || normalized.startsWith("tratamiento")) && result.intent === "UNKNOWN") {
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
  const isBreedingStartIntent = /\b(iniciar entore|entoramos|entoramos el potrero|largamos)\b/.test(normalized)
    && (/\btoros?\b/.test(normalized) || normalized.includes("iniciar entore"));
  if (isBreedingStartIntent) {
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

  const isIncidentIntent = /\b(incidente|incidencia|alerta|lastimad\w*|herid\w*|lesionad\w*|caid\w*|abichad\w*|manc\w*|muert\w*)\b/.test(normalized)
    && !result.proposedOperations.length;
  if (isIncidentIntent) {
    const paddock = findPaddock(text, context.paddocks);
    const responsibleMatch = text.match(/responsable\s*(?:es|:)?\s*([a-záéíóúñ][a-záéíóúñ\s.'-]+)/i);
    const actionMatch = text.match(/(?:acciones?\s*tomadas?|hay que|accion)\s*(?:es|:)?\s*([a-záéíóúñ0-9,\s.'-]+)/i);
    const hasVetReference = /\b(veterinari[oa]|vet)\b/.test(normalized);
    const category = findCategory(text);
    const qty = extractIncidentQty(text);
    const title = buildIncidentTitle(text, category, qty);

    if (!paddock) warnings.push("No se pudo identificar el potrero del incidente.");
    // Responsable y acciones son opcionales: la novedad queda abierta para asignarla y resolverla luego.

    result.intent = "INCIDENT_REPORT";
    result.confidence = 0.65;
    result.proposedOperations.push({
      type: "INCIDENT_REPORT",
      occurredAt: parseDate(text),
      payload: {
        paddockId: paddock?.id ?? null,
        title,
        description: text.trim(),
        qty,
        category,
        responsible: responsibleMatch?.[1]?.trim() ?? null,
        actionTaken: hasVetReference
          ? "Llamar al veterinario."
          : (actionMatch?.[1]?.trim() ?? null),
        severity: /\b(critico|grave)\b/.test(normalized) ? "CRITICAL" : "HIGH",
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
