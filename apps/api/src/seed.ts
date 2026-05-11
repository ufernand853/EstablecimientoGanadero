import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { getDb, getMongoClient } from "./db.js";

const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
};

const upsertTestUser = async ({
  email,
  fullName,
  password,
  role,
  tenantId,
  now,
}: {
  email: string;
  fullName: string;
  password: string;
  role: "OWNER" | "ADMIN" | "SUPERVISOR" | "OPERATOR";
  tenantId: string;
  now: string;
}) => {
  const db = await getDb();
  const users = db.collection("users");
  const memberships = db.collection("memberships");
  const normalizedEmail = email.toLowerCase();
  const existingUser = await users.findOne<{ id: string }>({ email: normalizedEmail });
  const userId = existingUser?.id ?? randomUUID();

  await users.updateOne(
    { email: normalizedEmail },
    {
      $set: {
        id: userId,
        email: normalizedEmail,
        fullName,
        passwordHash: hashPassword(password),
        status: "ACTIVE",
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
        lastLoginAt: null,
      },
    },
    { upsert: true },
  );

  await memberships.updateOne(
    { tenantId, userId },
    {
      $set: { role },
      $setOnInsert: { id: randomUUID(), tenantId, userId, createdAt: now },
    },
    { upsert: true },
  );
};

const seed = async () => {
  const db = await getDb();
  const establishments = db.collection("establishments");
  const paddocks = db.collection("paddocks");
  const herds = db.collection("herds");
  const commandContext = db.collection("command_context");
  const herdCategories = db.collection("herd_categories");
  const tenants = db.collection("tenants");
  const subscriptions = db.collection("subscriptions");
  const subscriptionPlans = db.collection("subscription_plans");
  const supplies = db.collection("supplies");
  const supplyBatches = db.collection("supply_batches");
  const supplyMovements = db.collection("supply_movements");

  const now = new Date().toISOString();
  const existingEstablishment = await establishments.findOne<{ id: string; name: string }>({});
  const establishmentId = existingEstablishment?.id ?? randomUUID();
  const tenantId = "test-tenant";

  await tenants.updateOne(
    { id: tenantId },
    { $set: { name: "Estancia La Esperanza", status: "ACTIVE", updatedAt: now }, $setOnInsert: { id: tenantId, createdAt: now } },
    { upsert: true },
  );

  await subscriptionPlans.updateOne(
    { code: "PRO" },
    {
      $set: { name: "Plan Pro", billingPeriodDays: 30, amountCents: 250000, currency: "UYU", trialDays: 0, isDemo: false, active: true },
      $setOnInsert: { id: randomUUID(), code: "PRO" },
    },
    { upsert: true },
  );

  const currentPeriodEnd = new Date(Date.now() + 365 * 86400000).toISOString();
  await subscriptions.updateOne(
    { tenantId, planCode: "PRO" },
    {
      $set: { status: "ACTIVE", provider: "seed", providerCustomerId: null, providerSubscriptionId: null, currentPeriodStart: now, currentPeriodEnd, graceUntil: null, cancelAt: null, updatedAt: now },
      $setOnInsert: { id: randomUUID(), tenantId, planCode: "PRO", createdAt: now },
    },
    { upsert: true },
  );

  if (!existingEstablishment) {
    await establishments.insertOne({
      id: establishmentId,
      name: "Estancia La Esperanza",
      timezone: "UTC-3",
      mapImageUrl: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  if ((await paddocks.countDocuments({ establishmentId })) === 0) {
    const paddockSeed = [
      { id: randomUUID(), name: "Potrero Norte" },
      { id: randomUUID(), name: "Potrero Sur" },
      { id: randomUUID(), name: "Potrero Riego" },
    ].map((paddock) => ({ ...paddock, establishmentId, createdAt: now, updatedAt: now }));
    await paddocks.insertMany(paddockSeed);

    await herds.insertMany([
      { paddockId: paddockSeed[0]?.id, category: "TERNEROS", count: 120, updatedAt: now },
      { paddockId: paddockSeed[1]?.id, category: "VAQUILLONAS", count: 80, updatedAt: now },
    ]);

    await commandContext.updateOne(
      { _id: "default" },
      {
        $set: {
          paddocks: paddockSeed.map((paddock) => ({ id: paddock.id, name: paddock.name })),
          consignors: [
            { id: randomUUID(), name: "Consignataria del Norte" },
            { id: randomUUID(), name: "Ganados del Sur" },
          ],
          slaughterhouses: [
            { id: randomUUID(), name: "Frigorífico La Pampa" },
            { id: randomUUID(), name: "Frigorífico San Miguel" },
          ],
        },
      },
      { upsert: true },
    );
  }

  for (const name of ["TERNEROS", "VAQUILLONAS", "TOROS"]) {
    await herdCategories.updateOne(
      { establishmentId, name },
      { $set: { status: "ACTIVE", updatedAt: now }, $setOnInsert: { id: randomUUID(), establishmentId, name, createdAt: now } },
      { upsert: true },
    );
  }

  await upsertTestUser({ email: "admin@test.local", fullName: "Administrador", password: "admin", role: "ADMIN", tenantId, now });
  await upsertTestUser({ email: "usuario@test.local", fullName: "Operador", password: "usuario", role: "OPERATOR", tenantId, now });
  await upsertTestUser({ email: "supervisor@test.local", fullName: "Supervisor", password: "supervisor", role: "SUPERVISOR", tenantId, now });

  const supplySeeds = [
    { key: "aftosa", id: "00000000-0000-4000-8000-000000000101", batchId: "00000000-0000-4000-8000-000000000201", type: "VACCINE", name: "Vacuna aftosa", unit: "dosis", batchNumber: "AFT-TEST-01", quantity: 120, expirationDate: new Date(Date.now() + 20 * 86400000).toISOString(), activeIngredient: "Antígeno aftosa" },
    { key: "ivermectina", id: "00000000-0000-4000-8000-000000000102", batchId: "00000000-0000-4000-8000-000000000202", type: "DEWORMER", name: "Ivermectina", unit: "ml", batchNumber: "IVM-TEST-01", quantity: 1000, expirationDate: new Date(Date.now() + 7 * 86400000).toISOString(), activeIngredient: "Ivermectina" },
    { key: "antibiotico", id: "00000000-0000-4000-8000-000000000103", batchId: "00000000-0000-4000-8000-000000000203", type: "MEDICINE", name: "Antibiótico LA", unit: "ml", batchNumber: "ATB-TEST-01", quantity: 500, expirationDate: new Date(Date.now() + 60 * 86400000).toISOString(), activeIngredient: "Oxitetraciclina" },
  ] as const;

  for (const item of supplySeeds) {
    const supplyId = item.id;
    await supplies.updateOne(
      { id: supplyId },
      {
        $set: {
          establishmentId,
          type: item.type,
          name: item.name,
          activeIngredient: item.activeIngredient,
          presentation: "Seed test",
          unit: item.unit,
          defaultDose: null,
          withdrawalPeriodDays: null,
          storageNotes: "Carga inicial de prueba",
          status: "ACTIVE",
          updatedAt: now,
        },
        $setOnInsert: { id: supplyId, createdAt: now },
      },
      { upsert: true },
    );
    const batchId = item.batchId;
    await supplyBatches.updateOne(
      { id: batchId },
      {
        $set: {
          establishmentId,
          supplyId,
          batchNumber: item.batchNumber,
          quantityInitial: item.quantity,
          quantityAvailable: item.quantity,
          unit: item.unit,
          expirationDate: item.expirationDate,
          purchaseDate: now,
          supplier: "Proveedor test",
          invoiceNumber: null,
          location: "Depósito principal",
          status: "AVAILABLE",
          notes: "Lote inicial de prueba",
          updatedAt: now,
        },
        $setOnInsert: { id: batchId, createdAt: now },
      },
      { upsert: true },
    );
    await supplyMovements.updateOne(
      { batchId, type: "IN", reason: "Seed inicial" },
      {
        $set: { establishmentId, supplyId, quantity: item.quantity, unit: item.unit, occurredAt: now, createdBy: "seed", createdAt: now },
        $setOnInsert: { id: randomUUID(), batchId, relatedTaskId: null, relatedHealthEventId: null, relatedTraceabilityEventId: null },
      },
      { upsert: true },
    );
  }

  console.log("Seed completado. Usuarios test: admin@test.local/admin, usuario@test.local/usuario, supervisor@test.local/supervisor.");
};

seed()
  .catch((error) => {
    console.error("Error al ejecutar el seed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getMongoClient().close();
  });
