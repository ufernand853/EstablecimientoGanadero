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

const getCollections = async () => {
  const db = await getDb();
  return {
    establishments: db.collection<Establishment>("establishments"),
    paddocks: db.collection<Paddock>("paddocks"),
    herds: db.collection<HerdStock>("herds"),
    movements: db.collection<HerdMovement>("movements"),
    consignors: db.collection<Consignor>("consignors"),
    slaughterhouses: db.collection<Slaughterhouse>("slaughterhouses"),
    confirmations: db.collection<Record<string, unknown>>("confirmations"),
    commandContext: db.collection<CommandContext & { _id: string }>("command_context"),
  };
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
  const { establishments, paddocks, herds, movements, consignors, slaughterhouses } = await getCollections();
  const paddockDocs = await paddocks.find({ establishmentId: id }).toArray();
  const paddockIds = paddockDocs.map((paddock) => paddock.id);
  if (paddockIds.length) {
    await herds.deleteMany({ paddockId: { $in: paddockIds } });
  }
  await Promise.all([
    paddocks.deleteMany({ establishmentId: id }),
    movements.deleteMany({ establishmentId: id }),
    consignors.deleteMany({ establishmentId: id }),
    slaughterhouses.deleteMany({ establishmentId: id }),
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

const consignorSchema = z.object({
  establishmentId: z.string().uuid(),
  name: z.string().min(2),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
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

  await appendConfirmation(body.data as Record<string, unknown>);
  return reply.send({
    applied: true,
    createdEventIds: [],
    summary: "Operaciones confirmadas (stub).",
  });
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

const start = async () => {
  try {
    await app.listen({ port: 3001, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();
