import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parseCommand } from "@eg/shared";
import { getDb, getMongoClient } from "./db.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
});

app.addHook("onClose", async () => {
  await getMongoClient().close();
});

const parseSchema = z.object({
  establishmentId: z.string().uuid(),
  text: z.string().min(3),
});

const confirmSchema = z.object({
  establishmentId: z.string().uuid(),
  confirmationToken: z.string(),
  edits: z.record(z.unknown()).optional(),
});

const aiChatSchema = z.object({
  establishmentId: z.string().uuid(),
  prompt: z.string().min(2),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1),
  })).max(20).optional(),
});

type CommandContext = {
  paddocks: { id: string; name: string }[];
  consignors: { id: string; name: string }[];
  slaughterhouses: { id: string; name: string }[];
};

type HerdStock = {
  paddockId: string;
  category: string;
  count: number;
  updatedAt: string;
};

type Establishment = {
  id: string;
  name: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
};

type Paddock = {
  id: string;
  establishmentId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type HerdMovement = {
  id: string;
  establishmentId: string;
  fromPaddockId: string;
  toPaddockId: string;
  category: string;
  quantity: number;
  occurredAt: string;
  createdAt: string;
};

type HealthEventType = "VACCINATION" | "DEWORMING" | "TREATMENT";

type HealthEventStatus = "PENDING" | "COMPLETED" | "CANCELLED" | "OVERDUE";

type HealthEvent = {
  id: string;
  establishmentId: string;
  type: HealthEventType;
  category: string;
  qty: number;
  product: string;
  dose: string | null;
  route: string | null;
  notes: string | null;
  responsible: string | null;
  occurredAt: string;
  nextDueAt: string | null;
  status: HealthEventStatus;
  source: "MANUAL" | "COMMAND";
  createdAt: string;
  updatedAt: string;
};

type Consignor = {
  id: string;
  establishmentId: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
};

type Slaughterhouse = {
  id: string;
  establishmentId: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
};

type HerdCategoryMaster = {
  id: string;
  establishmentId: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
};

type Animal = {
  id: string;
  establishmentId: string;
  earTag: string;
  name: string;
  sex: "MACHO" | "HEMBRA" | "OTRO";
  breed: string | null;
  birthDate: string | null;
  category: string | null;
  status: "ACTIVO" | "VENDIDO" | "MUERTO";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type AnimalPhoto = {
  id: string;
  animalId: string;
  imageUrl: string;
  caption: string | null;
  takenAt: string | null;
  uploadedAt: string;
};

type AISettings = {
  _id: "ai_settings";
  openAiApiKey: string;
  openAiModel: string;
  updatedAt: string;
};

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "UliferLuli853$$";

const getCollections = async () => {
  const db = await getDb();
  return {
    establishments: db.collection<Establishment>("establishments"),
    paddocks: db.collection<Paddock>("paddocks"),
    herds: db.collection<HerdStock>("herds"),
    movements: db.collection<HerdMovement>("movements"),
    consignors: db.collection<Consignor>("consignors"),
    slaughterhouses: db.collection<Slaughterhouse>("slaughterhouses"),
    herdCategories: db.collection<HerdCategoryMaster>("herd_categories"),
    healthEvents: db.collection<HealthEvent>("health_events"),
    animals: db.collection<Animal>("animals"),
    animalPhotos: db.collection<AnimalPhoto>("animal_photos"),
    aiSettings: db.collection<AISettings>("settings"),
    confirmations: db.collection<Record<string, unknown>>("confirmations"),
    commandContext: db.collection<CommandContext & { _id: string }>("command_context"),
  };
};

const loadAISettings = async () => {
  const { aiSettings } = await getCollections();
  return aiSettings.findOne({ _id: "ai_settings" });
};

const upsertAISettings = async (openAiApiKey: string, openAiModel: string) => {
  const { aiSettings } = await getCollections();
  const now = new Date().toISOString();
  await aiSettings.updateOne(
    { _id: "ai_settings" },
    {
      $set: {
        openAiApiKey,
        openAiModel,
        updatedAt: now,
      },
    },
    { upsert: true },
  );
  return now;
};

const loadContext = async () => {
  const { commandContext, consignors, slaughterhouses } = await getCollections();
  const baseContext = await commandContext.findOne({ _id: "default" });
  const consignorDocs = await consignors.find({ status: "ACTIVE" }).toArray();
  const slaughterhouseDocs = await slaughterhouses.find({ status: "ACTIVE" }).toArray();
  const safeBaseContext: CommandContext = baseContext
    ? {
        paddocks: baseContext.paddocks,
        consignors: baseContext.consignors,
        slaughterhouses: baseContext.slaughterhouses,
      }
    : {
        paddocks: [],
        consignors: [],
        slaughterhouses: [],
      };
  const paddocks = await loadPaddocks();
  return {
    ...safeBaseContext,
    paddocks: paddocks.length
      ? paddocks.map((paddock) => ({ id: paddock.id, name: paddock.name }))
      : safeBaseContext.paddocks,
    consignors: consignorDocs.length
      ? consignorDocs.map((consignor) => ({ id: consignor.id, name: consignor.name }))
      : safeBaseContext.consignors,
    slaughterhouses: slaughterhouseDocs.length
      ? slaughterhouseDocs.map((slaughterhouse) => ({ id: slaughterhouse.id, name: slaughterhouse.name }))
      : safeBaseContext.slaughterhouses,
  };
};

const loadEstablishments = async () => {
  const { establishments } = await getCollections();
  return establishments.find().toArray();
};

const insertEstablishment = async (establishment: Establishment) => {
  const { establishments } = await getCollections();
  await establishments.insertOne(establishment);
};

const updateEstablishment = async (id: string, data: Partial<Establishment>) => {
  const { establishments } = await getCollections();
  await establishments.updateOne({ id }, { $set: data });
};

const deleteEstablishment = async (id: string) => {
  const { establishments, paddocks, herds, movements, consignors, slaughterhouses, herdCategories, healthEvents, animals, animalPhotos } = await getCollections();
  const paddockDocs = await paddocks.find({ establishmentId: id }).toArray();
  const paddockIds = paddockDocs.map((paddock) => paddock.id);
  if (paddockIds.length) {
    await herds.deleteMany({ paddockId: { $in: paddockIds } });
  }
  const animalDocs = await animals.find({ establishmentId: id }).toArray();
  const animalIds = animalDocs.map((animal) => animal.id);
  if (animalIds.length) {
    await animalPhotos.deleteMany({ animalId: { $in: animalIds } });
  }
  await Promise.all([
    paddocks.deleteMany({ establishmentId: id }),
    movements.deleteMany({ establishmentId: id }),
    consignors.deleteMany({ establishmentId: id }),
    slaughterhouses.deleteMany({ establishmentId: id }),
    herdCategories.deleteMany({ establishmentId: id }),
    healthEvents.deleteMany({ establishmentId: id }),
    animals.deleteMany({ establishmentId: id }),
    establishments.deleteOne({ id }),
  ]);
};

const findEstablishmentById = async (id: string) => {
  const { establishments } = await getCollections();
  return establishments.findOne({ id });
};

const loadPaddocks = async () => {
  const { paddocks } = await getCollections();
  return paddocks.find().toArray();
};

const insertPaddock = async (paddock: Paddock) => {
  const { paddocks } = await getCollections();
  await paddocks.insertOne(paddock);
};

const updatePaddock = async (id: string, data: Partial<Paddock>) => {
  const { paddocks } = await getCollections();
  await paddocks.updateOne({ id }, { $set: data });
};

const deletePaddock = async (paddock: Paddock) => {
  const { paddocks, herds, movements } = await getCollections();
  await Promise.all([
    paddocks.deleteOne({ id: paddock.id }),
    herds.deleteMany({ paddockId: paddock.id }),
    movements.deleteMany({
      establishmentId: paddock.establishmentId,
      $or: [{ fromPaddockId: paddock.id }, { toPaddockId: paddock.id }],
    }),
  ]);
};

const findPaddockById = async (id: string) => {
  const { paddocks } = await getCollections();
  return paddocks.findOne({ id });
};

const appendConfirmation = async (payload: Record<string, unknown>) => {
  const { confirmations } = await getCollections();
  await confirmations.insertOne({
    ...payload,
    confirmedAt: new Date().toISOString(),
  });
};

const loadHerds = async () => {
  const { herds } = await getCollections();
  return herds.find().toArray();
};

const buildEstablishmentSnapshot = async (establishmentId: string) => {
  const { paddocks, herds, movements, healthEvents, consignors, slaughterhouses, herdCategories } = await getCollections();
  const [paddockDocs, herdDocs, movementDocs, healthEventDocs, consignorDocs, slaughterhouseDocs, categoryDocs] = await Promise.all([
    paddocks.find({ establishmentId }).toArray(),
    herds.find().toArray(),
    movements.find({ establishmentId }).sort({ occurredAt: -1 }).limit(10).toArray(),
    healthEvents.find({ establishmentId }).sort({ occurredAt: -1 }).limit(10).toArray(),
    consignors.find({ establishmentId, status: "ACTIVE" }).toArray(),
    slaughterhouses.find({ establishmentId, status: "ACTIVE" }).toArray(),
    herdCategories.find({ establishmentId, status: "ACTIVE" }).toArray(),
  ]);

  const paddockIds = new Set(paddockDocs.map((paddock) => paddock.id));
  const herdByPaddock = herdDocs.filter((herd) => paddockIds.has(herd.paddockId));

  return {
    paddocks: paddockDocs.map((paddock) => ({ id: paddock.id, name: paddock.name })),
    stock: herdByPaddock,
    recentMovements: movementDocs,
    recentHealthEvents: healthEventDocs,
    activeConsignors: consignorDocs.map((consignor) => ({ id: consignor.id, name: consignor.name })),
    activeSlaughterhouses: slaughterhouseDocs.map((slaughterhouse) => ({ id: slaughterhouse.id, name: slaughterhouse.name })),
    activeCategories: categoryDocs.map((category) => ({ id: category.id, name: category.name })),
  };
};

const composeLocalAssistantResponse = (
  snapshot: Awaited<ReturnType<typeof buildEstablishmentSnapshot>>,
  prompt: string,
  reason: "MISSING_KEY" | "UPSTREAM_ERROR" = "MISSING_KEY",
) => {
  const totalAnimals = snapshot.stock.reduce((acc, item) => acc + item.count, 0);
  const topStocks = [...snapshot.stock]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((item) => `${item.category}: ${item.count} cabezas`)
    .join(", ");

  const intro = reason === "MISSING_KEY"
    ? "No hay API externa de IA configurada (OPENAI_API_KEY). Respondo con resumen local de datos:"
    : "La API externa de IA devolvió un error. Respondo con resumen local de datos:";

  const closing = reason === "MISSING_KEY"
    ? `Tu consulta fue: "${prompt}". Configurá OPENAI_API_KEY para habilitar respuestas generativas completas con este contexto.`
    : `Tu consulta fue: "${prompt}". Revisá la API key/modelo configurados en Admin API key para volver a habilitar respuestas generativas completas.`;

  return [
    intro,
    `- Stock total estimado: ${totalAnimals} cabezas.`,
    `- Potreros registrados: ${snapshot.paddocks.length}.`,
    `- Categorías activas: ${snapshot.activeCategories.map((category) => category.name).join(", ") || "sin categorías"}.`,
    `- Resumen top stock: ${topStocks || "sin stock registrado"}.`,
    `- Movimientos recientes: ${snapshot.recentMovements.length}.`,
    `- Eventos sanitarios recientes: ${snapshot.recentHealthEvents.length}.`,
    "",
    closing,
  ].join("\n");
};

const callOpenAIChat = async (messages: AIMessage[], snapshot: Awaited<ReturnType<typeof buildEstablishmentSnapshot>>, establishment: Establishment) => {
  const persistedSettings = await loadAISettings();
  const apiKey = persistedSettings?.openAiApiKey || process.env.OPENAI_API_KEY;
  const prompt = messages[messages.length - 1]?.content ?? "";

  if (!apiKey) {
    return composeLocalAssistantResponse(snapshot, prompt);
  }

  const systemPrompt = [
    "Sos un asistente experto en gestión ganadera argentina.",
    "Respondé siempre en español claro, con pasos accionables y cálculos simples cuando ayuden.",
    "Si faltan datos, avisalo y pedí aclaración de forma breve.",
    `Establecimiento activo: ${establishment.name} (${establishment.id}).`,
    `Contexto de datos (JSON): ${JSON.stringify(snapshot)}`,
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: persistedSettings?.openAiModel || process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    app.log.error({ status: response.status, details }, "Fallo la API de IA externa");
    return composeLocalAssistantResponse(snapshot, prompt, "UPSTREAM_ERROR");
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  const content = payload.choices?.[0]?.message?.content?.trim();
  return content || composeLocalAssistantResponse(snapshot, prompt, "UPSTREAM_ERROR");
};

const findHerdByPaddockCategory = async (paddockId: string, category: string) => {
  const { herds } = await getCollections();
  return herds.findOne({ paddockId, category });
};

const updateHerdStock = async (paddockId: string, category: string, count: number, updatedAt: string) => {
  const { herds } = await getCollections();
  await herds.updateOne(
    { paddockId, category },
    {
      $set: { count, updatedAt },
      $setOnInsert: { paddockId, category },
    },
    { upsert: true },
  );
};

const saveHerdStock = async (paddockId: string, category: string, delta: number, updatedAt: string) => {
  const { herds } = await getCollections();
  await herds.updateOne(
    { paddockId, category },
    {
      $inc: { count: delta },
      $set: { updatedAt },
      $setOnInsert: { paddockId, category },
    },
    { upsert: true },
  );
};

const insertMovement = async (movement: HerdMovement) => {
  const { movements } = await getCollections();
  await movements.insertOne(movement);
};

const insertHealthEvent = async (healthEvent: HealthEvent) => {
  const { healthEvents } = await getCollections();
  await healthEvents.insertOne(healthEvent);
};

const consignorSchema = z.object({
  establishmentId: z.string().uuid(),
  name: z.string().min(2),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const aiSettingsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  apiKey: z.string().min(12),
  model: z.string().min(3).max(120).optional(),
});

app.post("/admin/openai-settings", async (request, reply) => {
  const parsed = aiSettingsSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.status(400);
    return { message: "Payload inválido.", issues: parsed.error.flatten() };
  }

  const { username, password, apiKey, model } = parsed.data;
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    reply.status(401);
    return { message: "Credenciales de admin inválidas." };
  }

  const normalizedModel = model?.trim() || process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const updatedAt = await upsertAISettings(apiKey.trim(), normalizedModel);

  return {
    ok: true,
    message: "API key de OpenAI guardada correctamente.",
    model: normalizedModel,
    updatedAt,
  };
});


app.get("/admin/openai-settings", async () => {
  const settings = await loadAISettings();
  return {
    configured: Boolean(settings?.openAiApiKey),
    model: settings?.openAiModel || process.env.OPENAI_MODEL || "gpt-4.1-mini",
    updatedAt: settings?.updatedAt ?? null,
  };
});

const consignorUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const slaughterhouseSchema = z.object({
  establishmentId: z.string().uuid(),
  name: z.string().min(2),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const slaughterhouseUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const herdCategorySchema = z.object({
  establishmentId: z.string().uuid(),
  name: z.string().min(2),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const herdCategoryUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const animalSchema = z.object({
  establishmentId: z.string().uuid(),
  earTag: z.string().min(2),
  name: z.string().min(2),
  sex: z.enum(["MACHO", "HEMBRA", "OTRO"]).optional(),
  breed: z.string().min(2).optional().nullable(),
  birthDate: z.string().datetime().optional().nullable(),
  category: z.string().min(2).optional().nullable(),
  status: z.enum(["ACTIVO", "VENDIDO", "MUERTO"]).optional(),
  notes: z.string().min(1).optional().nullable(),
});

const animalPhotoSchema = z.object({
  imageUrl: z.string().refine((value) => {
    if (value.startsWith("data:image/")) {
      return true;
    }
    return z.string().url().safeParse(value).success;
  }, "Debe ser una URL válida o una imagen en base64."),
  caption: z.string().min(1).optional().nullable(),
  takenAt: z.string().datetime().optional().nullable(),
});

const healthEventSchema = z.object({
  establishmentId: z.string().uuid(),
  type: z.enum(["VACCINATION", "DEWORMING", "TREATMENT"]),
  category: z.string().min(2),
  qty: z.number().int().positive(),
  product: z.string().min(2),
  dose: z.string().min(1).optional().nullable(),
  route: z.string().min(1).optional().nullable(),
  notes: z.string().min(1).optional().nullable(),
  responsible: z.string().min(2).optional().nullable(),
  occurredAt: z.string().datetime().optional(),
  nextDueAt: z.string().datetime().optional().nullable(),
  protocolDays: z.number().int().positive().optional(),
  status: z.enum(["PENDING", "COMPLETED", "CANCELLED", "OVERDUE"]).optional(),
  source: z.enum(["MANUAL", "COMMAND"]).optional(),
});

const healthEventUpdateSchema = z.object({
  type: z.enum(["VACCINATION", "DEWORMING", "TREATMENT"]).optional(),
  category: z.string().min(2).optional(),
  qty: z.number().int().positive().optional(),
  product: z.string().min(2).optional(),
  dose: z.string().min(1).nullable().optional(),
  route: z.string().min(1).nullable().optional(),
  notes: z.string().min(1).nullable().optional(),
  responsible: z.string().min(2).nullable().optional(),
  occurredAt: z.string().datetime().optional(),
  nextDueAt: z.string().datetime().nullable().optional(),
  status: z.enum(["PENDING", "COMPLETED", "CANCELLED", "OVERDUE"]).optional(),
});

app.get("/health", async () => ({ status: "ok" }));

app.post("/commands/parse", async (request, reply) => {
  const body = parseSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({
      code: "VALIDATION_ERROR",
      issues: body.error.issues,
    });
  }
  const commandContext = await loadContext();
  const parsed = parseCommand(body.data.text, commandContext);
  return reply.send(parsed);
});

app.post("/commands/confirm", async (request, reply) => {
  const body = confirmSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({
      code: "VALIDATION_ERROR",
      issues: body.error.issues,
    });
  }

  const parsed = body.data.edits && typeof body.data.edits === "object"
    ? (body.data.edits as { parsed?: { intent?: string; proposedOperations?: Array<{ payload?: Record<string, unknown>; occurredAt?: string }> } }).parsed
    : undefined;

  const createdEventIds: string[] = [];
  if (parsed?.intent === "MOVE") {
    const movePayload = parsed.proposedOperations?.[0]?.payload ?? {};
    const quantity = Number(movePayload.qty);
    const category = typeof movePayload.category === "string" ? movePayload.category : "";
    const fromPaddockId = typeof movePayload.fromPaddockId === "string" ? movePayload.fromPaddockId : "";
    const toPaddockId = typeof movePayload.toPaddockId === "string" ? movePayload.toPaddockId : "";
    const occurredAt = parsed.proposedOperations?.[0]?.occurredAt;

    if (!quantity || !category || !fromPaddockId || !toPaddockId) {
      return reply.status(400).send({
        code: "INVALID_MOVE_PAYLOAD",
        message: "No se pudo confirmar el movimiento porque faltan datos en la previsualización.",
      });
    }

    const [fromPaddock, toPaddock] = await Promise.all([
      findPaddockById(fromPaddockId),
      findPaddockById(toPaddockId),
    ]);

    if (!fromPaddock || !toPaddock) {
      return reply.status(404).send({ code: "NOT_FOUND", message: "Potrero no encontrado." });
    }

    if (
      fromPaddock.establishmentId !== body.data.establishmentId ||
      toPaddock.establishmentId !== body.data.establishmentId
    ) {
      return reply.status(400).send({
        code: "ESTABLISHMENT_MISMATCH",
        message: "Los potreros no pertenecen al establecimiento indicado.",
      });
    }

    const now = new Date().toISOString();
    const fromHerd = await findHerdByPaddockCategory(fromPaddockId, category);
    if (!fromHerd || fromHerd.count < quantity) {
      return reply.status(409).send({
        code: "INSUFFICIENT_STOCK",
        message: "No hay suficiente stock en el potrero de origen.",
      });
    }

    await updateHerdStock(fromPaddockId, category, fromHerd.count - quantity, now);
    await saveHerdStock(toPaddockId, category, quantity, now);

    const movement: HerdMovement = {
      id: randomUUID(),
      establishmentId: body.data.establishmentId,
      fromPaddockId,
      toPaddockId,
      category,
      quantity,
      occurredAt: occurredAt ?? now,
      createdAt: now,
    };
    await insertMovement(movement);
    createdEventIds.push(movement.id);
  }

  if (parsed?.intent === "VACCINATION") {
    const payload = parsed.proposedOperations?.[0]?.payload ?? {};
    const qty = Number(payload.qty);
    const category = typeof payload.category === "string" ? payload.category : "";
    const product = typeof payload.product === "string" ? payload.product : "";
    const dose = typeof payload.dose === "string" ? payload.dose : null;
    const occurredAt = parsed.proposedOperations?.[0]?.occurredAt;

    if (!qty || !category || !product) {
      return reply.status(400).send({
        code: "INVALID_VACCINATION_PAYLOAD",
        message: "No se pudo confirmar la vacunación porque faltan datos en la previsualización.",
      });
    }

    const now = new Date().toISOString();
    const healthEvent: HealthEvent = {
      id: randomUUID(),
      establishmentId: body.data.establishmentId,
      type: "VACCINATION",
      category,
      qty,
      product,
      dose,
      route: null,
      notes: null,
      responsible: null,
      occurredAt: occurredAt ?? now,
      nextDueAt: null,
      status: "COMPLETED",
      source: "COMMAND",
      createdAt: now,
      updatedAt: now,
    };
    await insertHealthEvent(healthEvent);
    createdEventIds.push(healthEvent.id);
  }

  await appendConfirmation({
    ...body.data,
    parsedIntent: parsed?.intent ?? null,
    createdEventIds,
  } as Record<string, unknown>);

  return reply.send({
    applied: true,
    createdEventIds,
    summary: createdEventIds.length
      ? "Operaciones confirmadas y aplicadas."
      : "Confirmación guardada sin operaciones automáticas.",
  });
});

app.post("/ai/chat", async (request, reply) => {
  const body = aiChatSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({
      code: "VALIDATION_ERROR",
      issues: body.error.issues,
    });
  }

  const establishment = await findEstablishmentById(body.data.establishmentId);
  if (!establishment) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });
  }

  const snapshot = await buildEstablishmentSnapshot(body.data.establishmentId);
  const messages: AIMessage[] = [
    ...(body.data.history ?? []),
    { role: "user", content: body.data.prompt },
  ];

  try {
    const response = await callOpenAIChat(messages, snapshot, establishment);
    return reply.send({
      response,
      contextMeta: {
        paddocks: snapshot.paddocks.length,
        stockRows: snapshot.stock.length,
        movements: snapshot.recentMovements.length,
        healthEvents: snapshot.recentHealthEvents.length,
      },
    });
  } catch (chatError) {
    request.log.error(chatError);
    return reply.status(502).send({
      code: "AI_UPSTREAM_ERROR",
      message: chatError instanceof Error ? chatError.message : "No se pudo consultar el servicio de IA.",
    });
  }
});

app.get("/health-events", async (request) => {
  const { establishmentId, status, type } = request.query as {
    establishmentId?: string;
    status?: HealthEventStatus;
    type?: HealthEventType;
  };
  const filter: Record<string, unknown> = {};
  if (establishmentId) filter.establishmentId = establishmentId;
  if (status) filter.status = status;
  if (type) filter.type = type;
  const { healthEvents } = await getCollections();
  const events = await healthEvents.find(filter).sort({ occurredAt: -1 }).toArray();
  return { healthEvents: events };
});

app.post("/health-events", async (request, reply) => {
  const body = healthEventSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }

  const establishment = await findEstablishmentById(body.data.establishmentId);
  if (!establishment) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });
  }

  const now = new Date().toISOString();
  const occurredAt = body.data.occurredAt ?? now;
  const nextDueAt = body.data.nextDueAt
    ?? (body.data.protocolDays
      ? new Date(new Date(occurredAt).getTime() + body.data.protocolDays * 24 * 60 * 60 * 1000).toISOString()
      : null);
  const healthEvent: HealthEvent = {
    id: randomUUID(),
    establishmentId: body.data.establishmentId,
    type: body.data.type,
    category: body.data.category,
    qty: body.data.qty,
    product: body.data.product,
    dose: body.data.dose ?? null,
    route: body.data.route ?? null,
    notes: body.data.notes ?? null,
    responsible: body.data.responsible ?? null,
    occurredAt,
    nextDueAt,
    status: body.data.status ?? "COMPLETED",
    source: body.data.source ?? "MANUAL",
    createdAt: now,
    updatedAt: now,
  };
  await insertHealthEvent(healthEvent);
  return reply.status(201).send(healthEvent);
});

app.patch("/health-events/:id", async (request, reply) => {
  const body = healthEventUpdateSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }
  const { healthEvents } = await getCollections();
  const existing = await healthEvents.findOne({ id: request.params.id });
  if (!existing) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Evento sanitario no encontrado." });
  }

  const updated: HealthEvent = {
    ...existing,
    ...body.data,
    updatedAt: new Date().toISOString(),
  };
  await healthEvents.updateOne(
    { id: request.params.id },
    {
      $set: {
        ...body.data,
        updatedAt: updated.updatedAt,
      },
    },
  );
  return reply.send(updated);
});

app.get("/health-schedules", async (request) => {
  const establishmentId = (request.query as { establishmentId?: string }).establishmentId;
  const nowIso = new Date().toISOString();
  const { healthEvents } = await getCollections();
  const filter: Record<string, unknown> = {
    nextDueAt: { $ne: null },
    status: { $nin: ["CANCELLED"] },
  };
  if (establishmentId) filter.establishmentId = establishmentId;
  const events = await healthEvents.find(filter).sort({ nextDueAt: 1 }).toArray();
  const schedules = events.map((event) => ({
    ...event,
    scheduleStatus: event.nextDueAt && event.nextDueAt < nowIso ? "OVERDUE" : "UPCOMING",
  }));
  return { schedules };
});

app.get("/confirmations", async (request) => {
  const establishmentId = (request.query as { establishmentId?: string }).establishmentId;
  const { confirmations } = await getCollections();
  const filtered = await confirmations
    .find(establishmentId ? { establishmentId } : {})
    .sort({ confirmedAt: -1 })
    .toArray();
  return { confirmations: filtered };
});

const establishmentSchema = z.object({
  name: z.string().min(2),
  timezone: z.string().min(2).optional(),
});

const establishmentUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  timezone: z.string().min(2).optional(),
});

app.get("/establishments", async () => {
  const establishments = await loadEstablishments();
  return { establishments };
});

app.get("/establishments/:id", async (request, reply) => {
  const establishment = await findEstablishmentById(request.params.id);
  if (!establishment) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });
  }
  return reply.send(establishment);
});

app.post("/establishments", async (request, reply) => {
  const body = establishmentSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({
      code: "VALIDATION_ERROR",
      issues: body.error.issues,
    });
  }

  const now = new Date().toISOString();
  const newEstablishment: Establishment = {
    id: randomUUID(),
    name: body.data.name,
    timezone: body.data.timezone ?? "UTC-3",
    createdAt: now,
    updatedAt: now,
  };
  await insertEstablishment(newEstablishment);
  return reply.status(201).send(newEstablishment);
});

app.patch("/establishments/:id", async (request, reply) => {
  const body = establishmentUpdateSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({
      code: "VALIDATION_ERROR",
      issues: body.error.issues,
    });
  }
  const existing = await findEstablishmentById(request.params.id);
  if (!existing) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });
  }
  const now = new Date().toISOString();
  const updated = {
    ...existing,
    ...body.data,
    updatedAt: now,
  };
  await updateEstablishment(request.params.id, {
    name: updated.name,
    timezone: updated.timezone,
    updatedAt: updated.updatedAt,
  });
  return reply.send(updated);
});

app.delete("/establishments/:id", async (request, reply) => {
  const existing = await findEstablishmentById(request.params.id);
  if (!existing) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });
  }
  await deleteEstablishment(request.params.id);
  return reply.status(204).send();
});

const paddockSchema = z.object({
  establishmentId: z.string().uuid(),
  name: z.string().min(2),
});

const paddockUpdateSchema = z.object({
  name: z.string().min(2).optional(),
});

app.get("/paddocks", async (request) => {
  const establishmentId = (request.query as { establishmentId?: string }).establishmentId;
  const { paddocks } = await getCollections();
  const filtered = await paddocks
    .find(establishmentId ? { establishmentId } : {})
    .toArray();
  return { paddocks: filtered };
});

app.get("/paddocks/:id", async (request, reply) => {
  const paddock = await findPaddockById(request.params.id);
  if (!paddock) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Potrero no encontrado." });
  }
  return reply.send(paddock);
});

app.post("/paddocks", async (request, reply) => {
  const body = paddockSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({
      code: "VALIDATION_ERROR",
      issues: body.error.issues,
    });
  }
  const existing = await findEstablishmentById(body.data.establishmentId);
  const exists = Boolean(existing);
  if (!exists) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });
  }
  const now = new Date().toISOString();
  const newPaddock: Paddock = {
    id: randomUUID(),
    establishmentId: body.data.establishmentId,
    name: body.data.name,
    createdAt: now,
    updatedAt: now,
  };
  await insertPaddock(newPaddock);
  return reply.status(201).send(newPaddock);
});

app.patch("/paddocks/:id", async (request, reply) => {
  const body = paddockUpdateSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({
      code: "VALIDATION_ERROR",
      issues: body.error.issues,
    });
  }
  const existing = await findPaddockById(request.params.id);
  if (!existing) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Potrero no encontrado." });
  }
  const now = new Date().toISOString();
  const updated = {
    ...existing,
    ...body.data,
    updatedAt: now,
  };
  await updatePaddock(request.params.id, {
    name: updated.name,
    updatedAt: updated.updatedAt,
  });
  return reply.send(updated);
});

app.delete("/paddocks/:id", async (request, reply) => {
  const existing = await findPaddockById(request.params.id);
  if (!existing) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Potrero no encontrado." });
  }
  await deletePaddock(existing);
  return reply.status(204).send();
});

const herdAdjustSchema = z.object({
  paddockId: z.string().uuid(),
  category: z.string().min(2),
  delta: z.number().int(),
});

app.get("/stock", async (request) => {
  const establishmentId = (request.query as { establishmentId?: string }).establishmentId;
  if (!establishmentId) {
    const herds = await loadHerds();
    return { herds };
  }
  const { paddocks, herds } = await getCollections();
  const paddockIds = await paddocks
    .find({ establishmentId }, { projection: { id: 1 } })
    .toArray();
  const ids = paddockIds.map((paddock) => paddock.id);
  const filtered = ids.length
    ? await herds.find({ paddockId: { $in: ids } }).toArray()
    : [];
  return { herds: filtered };
});

app.post("/stock/adjust", async (request, reply) => {
  const body = herdAdjustSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({
      code: "VALIDATION_ERROR",
      issues: body.error.issues,
    });
  }

  const paddock = await findPaddockById(body.data.paddockId);
  if (!paddock) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Potrero no encontrado." });
  }
  const now = new Date().toISOString();
  await saveHerdStock(body.data.paddockId, body.data.category, body.data.delta, now);
  const herds = await loadHerds();
  return reply.send({ ok: true, herds });
});

const movementSchema = z.object({
  establishmentId: z.string().uuid(),
  fromPaddockId: z.string().uuid(),
  toPaddockId: z.string().uuid(),
  category: z.string().min(2),
  quantity: z.number().int().positive(),
  occurredAt: z.string().datetime().optional(),
});

app.get("/movements", async (request) => {
  const establishmentId = (request.query as { establishmentId?: string }).establishmentId;
  const { movements } = await getCollections();
  const filtered = await movements
    .find(establishmentId ? { establishmentId } : {})
    .toArray();
  return { movements: filtered };
});

app.post("/movements", async (request, reply) => {
  const body = movementSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({
      code: "VALIDATION_ERROR",
      issues: body.error.issues,
    });
  }
  const { establishmentId, fromPaddockId, toPaddockId, category, quantity, occurredAt } =
    body.data;

  const [fromPaddock, toPaddock] = await Promise.all([
    findPaddockById(fromPaddockId),
    findPaddockById(toPaddockId),
  ]);
  if (!fromPaddock || !toPaddock) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Potrero no encontrado." });
  }
  if (
    fromPaddock.establishmentId !== establishmentId ||
    toPaddock.establishmentId !== establishmentId
  ) {
    return reply.status(400).send({
      code: "ESTABLISHMENT_MISMATCH",
      message: "Los potreros no pertenecen al establecimiento indicado.",
    });
  }

  const now = new Date().toISOString();
  const fromHerd = await findHerdByPaddockCategory(fromPaddockId, category);
  if (!fromHerd || fromHerd.count < quantity) {
    return reply.status(409).send({
      code: "INSUFFICIENT_STOCK",
      message: "No hay suficiente stock en el potrero de origen.",
    });
  }
  await updateHerdStock(fromPaddockId, category, fromHerd.count - quantity, now);
  await saveHerdStock(toPaddockId, category, quantity, now);

  const movement: HerdMovement = {
    id: randomUUID(),
    establishmentId,
    fromPaddockId,
    toPaddockId,
    category,
    quantity,
    occurredAt: occurredAt ?? now,
    createdAt: now,
  };
  await insertMovement(movement);

  const herds = await loadHerds();
  return reply.status(201).send({ ok: true, movement, herds });
});

app.get("/consignors", async (request) => {
  const establishmentId = (request.query as { establishmentId?: string }).establishmentId;
  const { consignors } = await getCollections();
  const filtered = await consignors.find(establishmentId ? { establishmentId } : {}).toArray();
  return { consignors: filtered };
});

app.get("/consignors/:id", async (request, reply) => {
  const { consignors } = await getCollections();
  const consignor = await consignors.findOne({ id: request.params.id });
  if (!consignor) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Consignatario no encontrado." });
  }
  return reply.send(consignor);
});

app.post("/consignors", async (request, reply) => {
  const body = consignorSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }
  const establishment = await findEstablishmentById(body.data.establishmentId);
  if (!establishment) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });
  }
  const now = new Date().toISOString();
  const consignor: Consignor = {
    id: randomUUID(),
    establishmentId: body.data.establishmentId,
    name: body.data.name,
    status: body.data.status ?? "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };
  const { consignors } = await getCollections();
  await consignors.insertOne(consignor);
  return reply.status(201).send(consignor);
});

app.patch("/consignors/:id", async (request, reply) => {
  const body = consignorUpdateSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }
  const { consignors } = await getCollections();
  const existing = await consignors.findOne({ id: request.params.id });
  if (!existing) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Consignatario no encontrado." });
  }
  const updated = {
    ...existing,
    ...body.data,
    updatedAt: new Date().toISOString(),
  };
  await consignors.updateOne(
    { id: request.params.id },
    { $set: { name: updated.name, status: updated.status, updatedAt: updated.updatedAt } },
  );
  return reply.send(updated);
});

app.delete("/consignors/:id", async (request, reply) => {
  const { consignors } = await getCollections();
  const existing = await consignors.findOne({ id: request.params.id });
  if (!existing) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Consignatario no encontrado." });
  }
  await consignors.deleteOne({ id: request.params.id });
  return reply.status(204).send();
});

app.get("/slaughterhouses", async (request) => {
  const establishmentId = (request.query as { establishmentId?: string }).establishmentId;
  const { slaughterhouses } = await getCollections();
  const filtered = await slaughterhouses.find(establishmentId ? { establishmentId } : {}).toArray();
  return { slaughterhouses: filtered };
});

app.get("/slaughterhouses/:id", async (request, reply) => {
  const { slaughterhouses } = await getCollections();
  const slaughterhouse = await slaughterhouses.findOne({ id: request.params.id });
  if (!slaughterhouse) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Frigorífico no encontrado." });
  }
  return reply.send(slaughterhouse);
});

app.post("/slaughterhouses", async (request, reply) => {
  const body = slaughterhouseSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }
  const establishment = await findEstablishmentById(body.data.establishmentId);
  if (!establishment) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });
  }
  const now = new Date().toISOString();
  const slaughterhouse: Slaughterhouse = {
    id: randomUUID(),
    establishmentId: body.data.establishmentId,
    name: body.data.name,
    status: body.data.status ?? "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };
  const { slaughterhouses } = await getCollections();
  await slaughterhouses.insertOne(slaughterhouse);
  return reply.status(201).send(slaughterhouse);
});

app.patch("/slaughterhouses/:id", async (request, reply) => {
  const body = slaughterhouseUpdateSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }
  const { slaughterhouses } = await getCollections();
  const existing = await slaughterhouses.findOne({ id: request.params.id });
  if (!existing) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Frigorífico no encontrado." });
  }
  const updated = {
    ...existing,
    ...body.data,
    updatedAt: new Date().toISOString(),
  };
  await slaughterhouses.updateOne(
    { id: request.params.id },
    { $set: { name: updated.name, status: updated.status, updatedAt: updated.updatedAt } },
  );
  return reply.send(updated);
});

app.delete("/slaughterhouses/:id", async (request, reply) => {
  const { slaughterhouses } = await getCollections();
  const existing = await slaughterhouses.findOne({ id: request.params.id });
  if (!existing) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Frigorífico no encontrado." });
  }
  await slaughterhouses.deleteOne({ id: request.params.id });
  return reply.status(204).send();
});

app.get("/herd-categories", async (request) => {
  const establishmentId = (request.query as { establishmentId?: string }).establishmentId;
  const status = (request.query as { status?: "ACTIVE" | "INACTIVE" }).status;
  const { herdCategories } = await getCollections();
  const query: Record<string, unknown> = {};
  if (establishmentId) query.establishmentId = establishmentId;
  if (status) query.status = status;
  const categories = await herdCategories.find(query).sort({ name: 1 }).toArray();
  return { categories };
});

app.get("/herd-categories/:id", async (request, reply) => {
  const { herdCategories } = await getCollections();
  const category = await herdCategories.findOne({ id: request.params.id });
  if (!category) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Categoría no encontrada." });
  }
  return reply.send(category);
});

app.post("/herd-categories", async (request, reply) => {
  const body = herdCategorySchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }
  const establishment = await findEstablishmentById(body.data.establishmentId);
  if (!establishment) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });
  }
  const normalizedName = body.data.name.trim().toUpperCase();
  const { herdCategories } = await getCollections();
  const duplicated = await herdCategories.findOne({
    establishmentId: body.data.establishmentId,
    name: normalizedName,
  });
  if (duplicated) {
    return reply.status(409).send({
      code: "CATEGORY_ALREADY_EXISTS",
      message: "La categoría ya existe para el establecimiento seleccionado.",
    });
  }
  const now = new Date().toISOString();
  const category: HerdCategoryMaster = {
    id: randomUUID(),
    establishmentId: body.data.establishmentId,
    name: normalizedName,
    status: body.data.status ?? "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };
  await herdCategories.insertOne(category);
  return reply.status(201).send(category);
});

app.patch("/herd-categories/:id", async (request, reply) => {
  const body = herdCategoryUpdateSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }
  const { herdCategories } = await getCollections();
  const existing = await herdCategories.findOne({ id: request.params.id });
  if (!existing) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Categoría no encontrada." });
  }
  const nextName = body.data.name ? body.data.name.trim().toUpperCase() : existing.name;
  if (nextName !== existing.name) {
    const duplicated = await herdCategories.findOne({
      establishmentId: existing.establishmentId,
      name: nextName,
    });
    if (duplicated && duplicated.id !== request.params.id) {
      return reply.status(409).send({
        code: "CATEGORY_ALREADY_EXISTS",
        message: "Ya existe otra categoría con ese nombre.",
      });
    }
  }

  const updated = {
    ...existing,
    ...body.data,
    name: nextName,
    updatedAt: new Date().toISOString(),
  };

  await herdCategories.updateOne(
    { id: request.params.id },
    { $set: { name: updated.name, status: updated.status, updatedAt: updated.updatedAt } },
  );

  return reply.send(updated);
});

app.delete("/herd-categories/:id", async (request, reply) => {
  const { herdCategories } = await getCollections();
  const existing = await herdCategories.findOne({ id: request.params.id });
  if (!existing) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Categoría no encontrada." });
  }
  await herdCategories.deleteOne({ id: request.params.id });
  return reply.status(204).send();
});

app.get("/animals", async (request) => {
  const establishmentId = (request.query as { establishmentId?: string }).establishmentId;
  const { animals } = await getCollections();
  const query: Record<string, unknown> = {};
  if (establishmentId) query.establishmentId = establishmentId;
  const list = await animals.find(query).sort({ updatedAt: -1 }).toArray();
  return { animals: list };
});

app.post("/animals", async (request, reply) => {
  const body = animalSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }
  const establishment = await findEstablishmentById(body.data.establishmentId);
  if (!establishment) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });
  }
  const { animals } = await getCollections();
  const normalizedEarTag = body.data.earTag.trim().toUpperCase();
  const duplicated = await animals.findOne({ establishmentId: body.data.establishmentId, earTag: normalizedEarTag });
  if (duplicated) {
    return reply.status(409).send({ code: "EAR_TAG_ALREADY_EXISTS", message: "La caravana ya existe para este establecimiento." });
  }
  const now = new Date().toISOString();
  const animal: Animal = {
    id: randomUUID(),
    establishmentId: body.data.establishmentId,
    earTag: normalizedEarTag,
    name: body.data.name.trim(),
    sex: body.data.sex ?? "OTRO",
    breed: body.data.breed?.trim() || null,
    birthDate: body.data.birthDate ?? null,
    category: body.data.category?.trim() || null,
    status: body.data.status ?? "ACTIVO",
    notes: body.data.notes?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
  await animals.insertOne(animal);
  return reply.status(201).send(animal);
});

app.get("/animals/:id/photos", async (request, reply) => {
  const { animals, animalPhotos } = await getCollections();
  const animal = await animals.findOne({ id: request.params.id });
  if (!animal) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Animal no encontrado." });
  }
  const photos = await animalPhotos.find({ animalId: request.params.id }).sort({ uploadedAt: -1 }).toArray();
  return { photos };
});

app.post("/animals/:id/photos", async (request, reply) => {
  const body = animalPhotoSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }
  const { animals, animalPhotos } = await getCollections();
  const animal = await animals.findOne({ id: request.params.id });
  if (!animal) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Animal no encontrado." });
  }
  const photo: AnimalPhoto = {
    id: randomUUID(),
    animalId: request.params.id,
    imageUrl: body.data.imageUrl,
    caption: body.data.caption?.trim() || null,
    takenAt: body.data.takenAt ?? null,
    uploadedAt: new Date().toISOString(),
  };

  if (photo.imageUrl.startsWith("data:image/") && photo.imageUrl.length > 14_000_000) {
    return reply.status(413).send({ code: "IMAGE_TOO_LARGE", message: "La imagen supera el tamaño máximo permitido." });
  }

  await animalPhotos.insertOne(photo);
  await animals.updateOne({ id: request.params.id }, { $set: { updatedAt: photo.uploadedAt } });
  return reply.status(201).send(photo);
});

app.delete("/animals/:id/photos/:photoId", async (request, reply) => {
  const { animalPhotos } = await getCollections();
  await animalPhotos.deleteOne({ id: request.params.photoId, animalId: request.params.id });
  return reply.status(204).send();
});

const start = async () => {
  try {
    await app.listen({ port: 3001, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();
