import { randomUUID } from "node:crypto";
import { getDb, getMongoClient } from "./db.js";

const seed = async () => {
  const db = await getDb();
  const establishments = db.collection("establishments");
  const paddocks = db.collection("paddocks");
  const herds = db.collection("herds");
  const commandContext = db.collection("command_context");

  const hasEstablishments = await establishments.countDocuments();
  if (hasEstablishments > 0) {
    console.log("Seed ya ejecutado, se encontraron establecimientos existentes.");
    return;
  }

  const establishmentId = randomUUID();
  const now = new Date().toISOString();
  await establishments.insertOne({
    id: establishmentId,
    name: "Estancia La Esperanza",
    timezone: "UTC-3",
    createdAt: now,
    updatedAt: now,
  });

  const paddockSeed = [
    { id: randomUUID(), name: "Potrero Norte" },
    { id: randomUUID(), name: "Potrero Sur" },
    { id: randomUUID(), name: "Potrero Riego" },
  ].map((paddock) => ({
    ...paddock,
    establishmentId,
    createdAt: now,
    updatedAt: now,
  }));
  await paddocks.insertMany(paddockSeed);

  await herds.insertMany([
    {
      paddockId: paddockSeed[0]?.id,
      category: "TERNEROS",
      count: 120,
      updatedAt: now,
    },
    {
      paddockId: paddockSeed[1]?.id,
      category: "VAQUILLONAS",
      count: 80,
      updatedAt: now,
    },
  ]);

  await commandContext.insertOne({
    _id: "default",
    paddocks: paddockSeed.map((paddock) => ({ id: paddock.id, name: paddock.name })),
    consignors: [
      { id: randomUUID(), name: "Consignataria del Norte" },
      { id: randomUUID(), name: "Ganados del Sur" },
    ],
    slaughterhouses: [
      { id: randomUUID(), name: "Frigorífico La Pampa" },
      { id: randomUUID(), name: "Frigorífico San Miguel" },
    ],
  });

  console.log("Seed completado.");
};

seed()
  .catch((error) => {
    console.error("Error al ejecutar el seed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getMongoClient().close();
  });
