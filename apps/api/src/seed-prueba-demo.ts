import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { getDb, getMongoClient } from "./db.js";

const TEST_TENANT_ID = "test-tenant";
const TEST_ESTABLISHMENT_ID = "00000000-0000-4000-8000-000000000301";
const DEMO_USER_EMAIL = "prueba@linsse.com";

const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
};

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

const PADDOCKS = [
  { id: "00000000-0000-4000-8000-000000000401", name: "Potrero Norte", areaHa: 120 },
  { id: "00000000-0000-4000-8000-000000000402", name: "Potrero Sur", areaHa: 95 },
  { id: "00000000-0000-4000-8000-000000000403", name: "Potrero Riego", areaHa: 40 },
  { id: "00000000-0000-4000-8000-000000000404", name: "Potrero Bajo", areaHa: 60 },
  { id: "00000000-0000-4000-8000-000000000405", name: "Lote Recria", areaHa: 55 },
] as const;

const HERD_CATEGORIES = [
  "VACAS DE CRIA",
  "VAQUILLONAS",
  "TERNEROS",
  "TERNERAS",
  "NOVILLOS",
  "TOROS REPRODUCTORES",
] as const;

const HERD_ROWS = [
  { paddockId: PADDOCKS[0].id, paddockName: PADDOCKS[0].name, category: "VACAS DE CRIA", count: 84 },
  { paddockId: PADDOCKS[1].id, paddockName: PADDOCKS[1].name, category: "VAQUILLONAS", count: 63 },
  { paddockId: PADDOCKS[2].id, paddockName: PADDOCKS[2].name, category: "TERNEROS", count: 41 },
  { paddockId: PADDOCKS[3].id, paddockName: PADDOCKS[3].name, category: "NOVILLOS", count: 57 },
  { paddockId: PADDOCKS[4].id, paddockName: PADDOCKS[4].name, category: "TERNERAS", count: 36 },
] as const;

const ANIMALS = [
  { id: "00000000-0000-4000-8000-000000000901", earTag: "858001001001", name: "Vaca 101", sex: "HEMBRA", category: "VACAS DE CRIA", paddockId: PADDOCKS[0].id, paddockName: PADDOCKS[0].name, birthDate: daysAgo(2250), notes: "Prenez confirmada." },
  { id: "00000000-0000-4000-8000-000000000902", earTag: "858001001002", name: "Vaca 102", sex: "HEMBRA", category: "VACAS DE CRIA", paddockId: PADDOCKS[0].id, paddockName: PADDOCKS[0].name, birthDate: daysAgo(2400), notes: "Buen estado corporal." },
  { id: "00000000-0000-4000-8000-000000000903", earTag: "858001001045", name: "Novillo 45", sex: "MACHO", category: "NOVILLOS", paddockId: PADDOCKS[3].id, paddockName: PADDOCKS[3].name, birthDate: daysAgo(640), notes: "Pesaje de control reciente." },
  { id: "00000000-0000-4000-8000-000000000904", earTag: "858001001078", name: "Vaquillona 78", sex: "HEMBRA", category: "VAQUILLONAS", paddockId: PADDOCKS[1].id, paddockName: PADDOCKS[1].name, birthDate: daysAgo(830), notes: "Vacunacion completa." },
  { id: "00000000-0000-4000-8000-000000000905", earTag: "858001001120", name: "Ternero 120", sex: "MACHO", category: "TERNEROS", paddockId: PADDOCKS[2].id, paddockName: PADDOCKS[2].name, birthDate: daysAgo(190), notes: "Lote de destete." },
  { id: "00000000-0000-4000-8000-000000000906", earTag: "858001001121", name: "Ternera 121", sex: "HEMBRA", category: "TERNERAS", paddockId: PADDOCKS[4].id, paddockName: PADDOCKS[4].name, birthDate: daysAgo(170), notes: "Seguimiento sanitario al dia." },
] as const;

const SUPPLIES = [
  { id: "00000000-0000-4000-8000-000000000501", batchId: "00000000-0000-4000-8000-000000000601", type: "VACCINE", name: "Vacuna aftosa", activeIngredient: "Antigeno aftosa", unit: "dosis", batchNumber: "AFT-PRUEBA-01", quantity: 180, expirationDate: daysFromNow(120) },
  { id: "00000000-0000-4000-8000-000000000502", batchId: "00000000-0000-4000-8000-000000000602", type: "DEWORMER", name: "Ivermectina", activeIngredient: "Ivermectina", unit: "ml", batchNumber: "IVM-PRUEBA-01", quantity: 900, expirationDate: daysFromNow(90) },
  { id: "00000000-0000-4000-8000-000000000503", batchId: "00000000-0000-4000-8000-000000000603", type: "MEDICINE", name: "Oxitetraciclina LA", activeIngredient: "Oxitetraciclina", unit: "ml", batchNumber: "ATB-PRUEBA-01", quantity: 450, expirationDate: daysFromNow(180) },
] as const;

const TRACEABILITY_EVENTS = [
  { id: "00000000-0000-4000-8000-000000001001", earTag: "858001001001", type: "PREÑEZ_CONFIRMADA", paddockId: PADDOCKS[0].id, paddockName: PADDOCKS[0].name, product: null, dose: null, weight: null, notes: "Diagnostico positivo por ecografia.", occurredAt: daysAgo(15) },
  { id: "00000000-0000-4000-8000-000000001002", earTag: "858001001045", type: "PESAJE", paddockId: PADDOCKS[3].id, paddockName: PADDOCKS[3].name, product: null, dose: null, weight: 386, notes: "Pesaje de control mensual.", occurredAt: daysAgo(7) },
  { id: "00000000-0000-4000-8000-000000001003", earTag: "858001001078", type: "VACUNACION_REALIZADA", paddockId: PADDOCKS[1].id, paddockName: PADDOCKS[1].name, product: "Aftosa", dose: "1 dosis", weight: null, notes: "Campaña sanitaria del lote.", occurredAt: daysAgo(12) },
] as const;

const TASKS = [
  { id: "00000000-0000-4000-8000-000000001101", title: "Revisar lote de terneros en Potrero Norte", description: "Confirmar estado corporal y repasar caravanas con el lector.", type: "FIELD_CHECK", priority: "HIGH", dueDate: daysFromNow(2), scheduledAt: daysFromNow(1), assignedRole: "OPERATOR", paddockId: PADDOCKS[0].id, paddockName: PADDOCKS[0].name },
  { id: "00000000-0000-4000-8000-000000001102", title: "Control de stock de ivermectina", description: "Verificar vencimiento y disponibilidad del lote principal.", type: "HEALTH", priority: "MEDIUM", dueDate: daysFromNow(4), scheduledAt: daysFromNow(3), assignedRole: "ADMIN", paddockId: null, paddockName: null },
] as const;

const HEALTH_EVENTS = [
  { id: "00000000-0000-4000-8000-000000001201", type: "VACCINATION", category: "LOTE Potrero Sur", qty: 63, product: "Vacuna aftosa", dose: "1 dosis", notes: "Campaña sanitaria demo.", supplyId: SUPPLIES[0].id, supplyBatchId: SUPPLIES[0].batchId, quantityUsed: 63, unit: "dosis", responsible: "Equipo sanitario", occurredAt: daysAgo(9), nextDueAt: daysFromNow(150), status: "COMPLETED" },
  { id: "00000000-0000-4000-8000-000000001202", type: "DEWORMING", category: "LOTE Potrero Riego", qty: 41, product: "Ivermectina", dose: "10 ml", notes: "Aplicacion programada de desparasitacion.", supplyId: SUPPLIES[1].id, supplyBatchId: SUPPLIES[1].batchId, quantityUsed: 410, unit: "ml", responsible: "Capataz", occurredAt: daysAgo(6), nextDueAt: daysFromNow(90), status: "COMPLETED" },
] as const;

async function seedPruebaDemo() {
  const db = await getDb();
  const now = new Date().toISOString();
  const coll = (name: string) => db.collection(name);

  await coll("tenants").updateOne(
    { id: TEST_TENANT_ID },
    { $set: { name: "Estancia La Esperanza", status: "ACTIVE", updatedAt: now }, $setOnInsert: { id: TEST_TENANT_ID, createdAt: now } },
    { upsert: true },
  );

  await coll("subscription_plans").updateOne(
    { code: "PRO" },
    { $set: { name: "Plan Pro", billingPeriodDays: 30, amountCents: 375_000, currency: "UYU", trialDays: 0, isDemo: false, active: true }, $setOnInsert: { id: randomUUID(), code: "PRO" } },
    { upsert: true },
  );

  await coll("subscriptions").updateOne(
    { tenantId: TEST_TENANT_ID, planCode: "PRO" },
    { $set: { status: "ACTIVE", provider: "seed", providerCustomerId: null, providerSubscriptionId: null, currentPeriodStart: now, currentPeriodEnd: daysFromNow(365), graceUntil: null, cancelAt: null, updatedAt: now }, $setOnInsert: { id: randomUUID(), tenantId: TEST_TENANT_ID, planCode: "PRO", createdAt: now } },
    { upsert: true },
  );

  await coll("establishments").updateOne(
    { id: TEST_ESTABLISHMENT_ID },
    { $set: { id: TEST_ESTABLISHMENT_ID, name: "Estancia La Esperanza", timezone: "UTC-3", mapImageUrl: null, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true },
  );

  await coll("tenant_establishments").deleteMany({ tenantId: TEST_TENANT_ID, establishmentId: { $ne: TEST_ESTABLISHMENT_ID } });
  await coll("tenant_establishments").updateOne(
    { tenantId: TEST_TENANT_ID, establishmentId: TEST_ESTABLISHMENT_ID },
    { $set: { tenantId: TEST_TENANT_ID, establishmentId: TEST_ESTABLISHMENT_ID } },
    { upsert: true },
  );

  const existingUser = await coll("users").findOne<{ id: string }>({ email: DEMO_USER_EMAIL });
  const userId = existingUser?.id ?? randomUUID();
  await coll("users").updateOne(
    { email: DEMO_USER_EMAIL },
    {
      $set: {
        id: userId,
        email: DEMO_USER_EMAIL,
        fullName: "Usuario de Prueba",
        passwordHash: hashPassword("prueba1234"),
        status: "ACTIVE",
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now, lastLoginAt: null },
    },
    { upsert: true },
  );
  await coll("memberships").updateOne(
    { tenantId: TEST_TENANT_ID, userId },
    { $set: { role: "ADMIN" }, $setOnInsert: { id: randomUUID(), tenantId: TEST_TENANT_ID, userId, createdAt: now } },
    { upsert: true },
  );

  for (const category of HERD_CATEGORIES) {
    await coll("herd_categories").updateOne(
      { establishmentId: TEST_ESTABLISHMENT_ID, name: category },
      { $set: { status: "ACTIVE", updatedAt: now }, $setOnInsert: { id: randomUUID(), establishmentId: TEST_ESTABLISHMENT_ID, name: category, createdAt: now } },
      { upsert: true },
    );
  }

  for (const paddock of PADDOCKS) {
    await coll("paddocks").updateOne(
      { id: paddock.id },
      { $set: { establishmentId: TEST_ESTABLISHMENT_ID, name: paddock.name, areaHa: paddock.areaHa, updatedAt: now }, $setOnInsert: { id: paddock.id, createdAt: now } },
      { upsert: true },
    );
  }

  for (const herd of HERD_ROWS) {
    await coll("herds").updateOne(
      { paddockId: herd.paddockId, category: herd.category },
      { $set: { establishmentId: TEST_ESTABLISHMENT_ID, paddockName: herd.paddockName, count: herd.count, updatedAt: now } },
      { upsert: true },
    );
  }

  for (const animal of ANIMALS) {
    await coll("animals").updateOne(
      { id: animal.id },
      {
        $set: {
          establishmentId: TEST_ESTABLISHMENT_ID,
          earTag: animal.earTag,
          name: animal.name,
          sex: animal.sex,
          breed: null,
          birthDate: animal.birthDate,
          category: animal.category,
          status: "ACTIVO",
          paddockId: animal.paddockId,
          paddockName: animal.paddockName,
          notes: animal.notes,
          updatedAt: now,
        },
        $setOnInsert: { id: animal.id, createdAt: now },
      },
      { upsert: true },
    );
  }

  for (const supply of SUPPLIES) {
    await coll("supplies").updateOne(
      { id: supply.id },
      {
        $set: {
          establishmentId: TEST_ESTABLISHMENT_ID,
          type: supply.type,
          name: supply.name,
          activeIngredient: supply.activeIngredient,
          presentation: "Seed demo prueba",
          unit: supply.unit,
          defaultDose: null,
          withdrawalPeriodDays: null,
          storageNotes: "Stock demo para prueba@linsse.com",
          status: "ACTIVE",
          updatedAt: now,
        },
        $setOnInsert: { id: supply.id, createdAt: now },
      },
      { upsert: true },
    );

    await coll("supply_batches").updateOne(
      { id: supply.batchId },
      {
        $set: {
          establishmentId: TEST_ESTABLISHMENT_ID,
          supplyId: supply.id,
          batchNumber: supply.batchNumber,
          quantityInitial: supply.quantity,
          quantityAvailable: supply.quantity,
          unit: supply.unit,
          expirationDate: supply.expirationDate,
          purchaseDate: now,
          supplier: "Proveedor demo",
          invoiceNumber: null,
          location: "Deposito principal",
          status: "AVAILABLE",
          notes: "Lote demo para pruebas.",
          updatedAt: now,
        },
        $setOnInsert: { id: supply.batchId, createdAt: now },
      },
      { upsert: true },
    );

    await coll("supply_movements").updateOne(
      { id: `movement-${supply.batchId}` },
      {
        $set: {
          establishmentId: TEST_ESTABLISHMENT_ID,
          supplyId: supply.id,
          batchId: supply.batchId,
          type: "IN",
          quantity: supply.quantity,
          unit: supply.unit,
          reason: "Seed demo inicial",
          relatedTaskId: null,
          relatedHealthEventId: null,
          relatedTraceabilityEventId: null,
          occurredAt: now,
          createdBy: "seed-prueba-demo",
          createdAt: now,
        },
        $setOnInsert: { id: `movement-${supply.batchId}` },
      },
      { upsert: true },
    );
  }

  for (const event of TRACEABILITY_EVENTS) {
    await coll("traceability_events").updateOne(
      { id: event.id },
      {
        $set: {
          establishmentId: TEST_ESTABLISHMENT_ID,
          earTag: event.earTag,
          type: event.type,
          paddockId: event.paddockId,
          paddockName: event.paddockName,
          product: event.product,
          dose: event.dose,
          weight: event.weight,
          destination: null,
          notes: event.notes,
          occurredAt: event.occurredAt,
          source: "MANUAL",
          createdBy: "seed-prueba-demo",
          createdAt: event.occurredAt,
        },
        $setOnInsert: { id: event.id },
      },
      { upsert: true },
    );
  }

  for (const task of TASKS) {
    await coll("tasks").updateOne(
      { id: task.id },
      {
        $set: {
          establishmentId: TEST_ESTABLISHMENT_ID,
          title: task.title,
          description: task.description,
          type: task.type,
          status: "PENDING",
          priority: task.priority,
          dueDate: task.dueDate,
          scheduledAt: task.scheduledAt,
          completedAt: null,
          assignedToUserId: null,
          assignedRole: task.assignedRole,
          paddockId: task.paddockId,
          paddockName: task.paddockName,
          animalId: null,
          earTag: null,
          source: "MANUAL",
          sourceEventId: null,
          createdBy: "seed-prueba-demo",
          createdAt: now,
          updatedAt: now,
        },
        $setOnInsert: { id: task.id },
      },
      { upsert: true },
    );
  }

  for (const healthEvent of HEALTH_EVENTS) {
    await coll("health_events").updateOne(
      { id: healthEvent.id },
      {
        $set: {
          establishmentId: TEST_ESTABLISHMENT_ID,
          type: healthEvent.type,
          category: healthEvent.category,
          qty: healthEvent.qty,
          product: healthEvent.product,
          dose: healthEvent.dose,
          route: null,
          notes: healthEvent.notes,
          supplyId: healthEvent.supplyId,
          supplyBatchId: healthEvent.supplyBatchId,
          quantityUsed: healthEvent.quantityUsed,
          unit: healthEvent.unit,
          responsible: healthEvent.responsible,
          occurredAt: healthEvent.occurredAt,
          nextDueAt: healthEvent.nextDueAt,
          status: healthEvent.status,
          source: "MANUAL",
          createdAt: now,
          updatedAt: now,
        },
        $setOnInsert: { id: healthEvent.id },
      },
      { upsert: true },
    );
  }

  console.log("");
  console.log("Seed de prueba@linsse.com aplicado.");
  console.log(`Tenant: ${TEST_TENANT_ID}`);
  console.log(`Establecimiento: ${TEST_ESTABLISHMENT_ID}`);
  console.log(`Usuario: ${DEMO_USER_EMAIL} / prueba1234`);
}

seedPruebaDemo()
  .catch((error) => {
    console.error("No se pudo aplicar el seed demo de prueba.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getMongoClient().close();
    } catch {
      // ignore close errors
    }
  });
