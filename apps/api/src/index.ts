import Fastify from "fastify";
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

const commandContext = {
  paddocks: [
    { id: "11111111-1111-1111-1111-111111111111", name: "Potrero 3" },
    { id: "22222222-2222-2222-2222-222222222222", name: "Potrero 7" },
  ],
  consignors: [
    { id: "33333333-3333-3333-3333-333333333333", name: "Pérez" },
  ],
  slaughterhouses: [
    { id: "44444444-4444-4444-4444-444444444444", name: "Las Moras" },
  ],
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

  return reply.send({
    applied: true,
    createdEventIds: [],
    summary: "Operaciones confirmadas (stub).",
  });
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
