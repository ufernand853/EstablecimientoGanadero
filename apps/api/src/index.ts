import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { parseCommand } from "@eg/shared";

const app = Fastify({ logger: true });

const parseSchema = z.object({
  establishmentId: z.string().uuid(),
  text: z.string().min(3),
});

const confirmSchema = z.object({
  establishmentId: z.string().uuid(),
  confirmationToken: z.string(),
  edits: z.record(z.unknown()).optional(),
});

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "data");
const contextFile = path.join(dataDir, "context.json");
const confirmationsFile = path.join(dataDir, "confirmations.json");
const establishmentsFile = path.join(dataDir, "establishments.json");
const paddocksFile = path.join(dataDir, "paddocks.json");
const herdsFile = path.join(dataDir, "herds.json");
const movementsFile = path.join(dataDir, "movements.json");

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

const loadJsonFile = async <T,>(filePath: string, fallback: T): Promise<T> => {
  try {
    const contents = await readFile(filePath, "utf-8");
    return JSON.parse(contents) as T;
  } catch (error) {
    app.log.warn({ filePath, error }, "No se pudo leer el JSON, usando fallback.");
    return fallback;
  }
};

const loadContext = async () => {
  const baseContext = await loadJsonFile<CommandContext>(contextFile, {
    paddocks: [],
    consignors: [],
    slaughterhouses: [],
  });
  const paddocks = await loadPaddocks();
  return {
    ...baseContext,
    paddocks: paddocks.length
      ? paddocks.map((paddock) => ({ id: paddock.id, name: paddock.name }))
      : baseContext.paddocks,
  };
};

const loadEstablishments = async () =>
  loadJsonFile<Establishment[]>(establishmentsFile, []);

const saveEstablishments = async (establishments: Establishment[]) => {
  await writeFile(establishmentsFile, JSON.stringify(establishments, null, 2));
};

const loadPaddocks = async () => loadJsonFile<Paddock[]>(paddocksFile, []);

const savePaddocks = async (paddocks: Paddock[]) => {
  await writeFile(paddocksFile, JSON.stringify(paddocks, null, 2));
};

const appendConfirmation = async (payload: Record<string, unknown>) => {
  const existing = await loadJsonFile<Record<string, unknown>[]>(confirmationsFile, []);
  existing.push({
    ...payload,
    confirmedAt: new Date().toISOString(),
  });
  await writeFile(confirmationsFile, JSON.stringify(existing, null, 2));
};

const loadHerds = async () => loadJsonFile<HerdStock[]>(herdsFile, []);

const saveHerds = async (herds: HerdStock[]) => {
  await writeFile(herdsFile, JSON.stringify(herds, null, 2));
};

const loadMovements = async () => loadJsonFile<HerdMovement[]>(movementsFile, []);

const saveMovements = async (movements: HerdMovement[]) => {
  await writeFile(movementsFile, JSON.stringify(movements, null, 2));
};

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

app.post("/establishments", async (request, reply) => {
  const body = establishmentSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({
      code: "VALIDATION_ERROR",
      issues: body.error.issues,
    });
  }

  const establishments = await loadEstablishments();
  const now = new Date().toISOString();
  const newEstablishment: Establishment = {
    id: randomUUID(),
    name: body.data.name,
    timezone: body.data.timezone ?? "UTC-3",
    createdAt: now,
    updatedAt: now,
  };
  establishments.push(newEstablishment);
  await saveEstablishments(establishments);
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
  const establishments = await loadEstablishments();
  const index = establishments.findIndex((est) => est.id === request.params.id);
  if (index < 0) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });
  }
  const now = new Date().toISOString();
  establishments[index] = {
    ...establishments[index],
    ...body.data,
    updatedAt: now,
  };
  await saveEstablishments(establishments);
  return reply.send(establishments[index]);
});

const paddockSchema = z.object({
  establishmentId: z.string().uuid(),
  name: z.string().min(2),
});

const paddockUpdateSchema = z.object({
  name: z.string().min(2).optional(),
});

app.get("/paddocks", async (request) => {
  const paddocks = await loadPaddocks();
  const establishmentId = (request.query as { establishmentId?: string }).establishmentId;
  const filtered = establishmentId
    ? paddocks.filter((paddock) => paddock.establishmentId === establishmentId)
    : paddocks;
  return { paddocks: filtered };
});

app.post("/paddocks", async (request, reply) => {
  const body = paddockSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({
      code: "VALIDATION_ERROR",
      issues: body.error.issues,
    });
  }
  const establishments = await loadEstablishments();
  const exists = establishments.some((est) => est.id === body.data.establishmentId);
  if (!exists) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });
  }
  const paddocks = await loadPaddocks();
  const now = new Date().toISOString();
  const newPaddock: Paddock = {
    id: randomUUID(),
    establishmentId: body.data.establishmentId,
    name: body.data.name,
    createdAt: now,
    updatedAt: now,
  };
  paddocks.push(newPaddock);
  await savePaddocks(paddocks);
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
  const paddocks = await loadPaddocks();
  const index = paddocks.findIndex((paddock) => paddock.id === request.params.id);
  if (index < 0) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Potrero no encontrado." });
  }
  const now = new Date().toISOString();
  paddocks[index] = {
    ...paddocks[index],
    ...body.data,
    updatedAt: now,
  };
  await savePaddocks(paddocks);
  return reply.send(paddocks[index]);
});

const herdAdjustSchema = z.object({
  paddockId: z.string().uuid(),
  category: z.string().min(2),
  delta: z.number().int(),
});

app.get("/stock", async (request) => {
  const herds = await loadHerds();
  const paddocks = await loadPaddocks();
  const establishmentId = (request.query as { establishmentId?: string }).establishmentId;
  if (!establishmentId) {
    return { herds };
  }
  const paddockIds = new Set(
    paddocks.filter((paddock) => paddock.establishmentId === establishmentId).map((paddock) => paddock.id),
  );
  return { herds: herds.filter((herd) => paddockIds.has(herd.paddockId)) };
});

app.post("/stock/adjust", async (request, reply) => {
  const body = herdAdjustSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({
      code: "VALIDATION_ERROR",
      issues: body.error.issues,
    });
  }

  const paddocks = await loadPaddocks();
  if (!paddocks.some((paddock) => paddock.id === body.data.paddockId)) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Potrero no encontrado." });
  }
  const herds = await loadHerds();
  const now = new Date().toISOString();
  const index = herds.findIndex(
    (herd) =>
      herd.paddockId === body.data.paddockId && herd.category === body.data.category,
  );
  if (index >= 0) {
    herds[index] = {
      ...herds[index],
      count: herds[index].count + body.data.delta,
      updatedAt: now,
    };
  } else {
    herds.push({
      paddockId: body.data.paddockId,
      category: body.data.category,
      count: body.data.delta,
      updatedAt: now,
    });
  }

  await saveHerds(herds);
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
  const movements = await loadMovements();
  const establishmentId = (request.query as { establishmentId?: string }).establishmentId;
  const filtered = establishmentId
    ? movements.filter((movement) => movement.establishmentId === establishmentId)
    : movements;
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

  const paddocks = await loadPaddocks();
  const fromPaddock = paddocks.find((paddock) => paddock.id === fromPaddockId);
  const toPaddock = paddocks.find((paddock) => paddock.id === toPaddockId);
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

  const herds = await loadHerds();
  const now = new Date().toISOString();
  const fromIndex = herds.findIndex(
    (herd) => herd.paddockId === fromPaddockId && herd.category === category,
  );
  if (fromIndex < 0 || herds[fromIndex].count < quantity) {
    return reply.status(409).send({
      code: "INSUFFICIENT_STOCK",
      message: "No hay suficiente stock en el potrero de origen.",
    });
  }

  herds[fromIndex] = {
    ...herds[fromIndex],
    count: herds[fromIndex].count - quantity,
    updatedAt: now,
  };

  const toIndex = herds.findIndex(
    (herd) => herd.paddockId === toPaddockId && herd.category === category,
  );
  if (toIndex >= 0) {
    herds[toIndex] = {
      ...herds[toIndex],
      count: herds[toIndex].count + quantity,
      updatedAt: now,
    };
  } else {
    herds.push({
      paddockId: toPaddockId,
      category,
      count: quantity,
      updatedAt: now,
    });
  }

  await saveHerds(herds);

  const movements = await loadMovements();
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
  movements.push(movement);
  await saveMovements(movements);

  return reply.status(201).send({ ok: true, movement, herds });
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
