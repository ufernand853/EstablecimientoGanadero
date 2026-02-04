import Fastify from "fastify";
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
const herdsFile = path.join(dataDir, "herds.json");

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

const loadJsonFile = async <T,>(filePath: string, fallback: T): Promise<T> => {
  try {
    const contents = await readFile(filePath, "utf-8");
    return JSON.parse(contents) as T;
  } catch (error) {
    app.log.warn({ filePath, error }, "No se pudo leer el JSON, usando fallback.");
    return fallback;
  }
};

const loadContext = async () =>
  loadJsonFile<CommandContext>(contextFile, {
    paddocks: [],
    consignors: [],
    slaughterhouses: [],
  });

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

const herdAdjustSchema = z.object({
  paddockId: z.string().uuid(),
  category: z.string().min(2),
  delta: z.number().int(),
});

app.get("/stock", async () => {
  const herds = await loadHerds();
  return { herds };
});

app.post("/stock/adjust", async (request, reply) => {
  const body = herdAdjustSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({
      code: "VALIDATION_ERROR",
      issues: body.error.issues,
    });
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

const start = async () => {
  try {
    await app.listen({ port: 3001, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();
