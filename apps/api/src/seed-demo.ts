/**
 * Seed de demo con datos realistas para capturas y demos.
 * Idempotente: puede correrse varias veces sin duplicar.
 *
 * Uso: tsx src/seed-demo.ts
 */

import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { getDb, getMongoClient } from "./db.js";

const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
};

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

// ─── IDs fijos para referencia cruzada ────────────────────────────────────────

const TENANT_ID = "demo-tenant-001";
const EST_ID    = "demo-est-001";

// Potreros
const P = {
  norte:   { id: "demo-p-001", name: "Potrero Norte",    areaHa: 120 },
  sur:     { id: "demo-p-002", name: "Potrero Sur",      areaHa: 95  },
  loma:    { id: "demo-p-003", name: "Potrero La Loma",  areaHa: 75  },
  bajo:    { id: "demo-p-004", name: "Potrero El Bajo",  areaHa: 60  },
  riego:   { id: "demo-p-005", name: "Potrero Riego",    areaHa: 40  },
  toros:   { id: "demo-p-006", name: "Cuadro de Toros",  areaHa: 15  },
} as const;

// Animales (858 + 9 dígitos = 12 total)
const A = {
  v01: "858001001001", v02: "858001001002", v03: "858001001003",
  v04: "858001001004", v05: "858001001005", v06: "858001001006",
  v07: "858001001007", v08: "858001001008", v09: "858001001009",
  v10: "858001001010", v11: "858001001011", v12: "858001001012",
  v13: "858001001013", v14: "858001001014", v15: "858001001015",
  vq1: "858001002001", vq2: "858001002002", vq3: "858001002003",
  vq4: "858001002004", vq5: "858001002005",
  t01: "858001003001", t02: "858001003002", t03: "858001003003",
  t04: "858001003004", t05: "858001003005",
  tr1: "858001003101", tr2: "858001003102",   // terneros recientes (nacidos este mes)
  to1: "858001004001", to2: "858001004002",   // toros
  mu1: "858001005001",                         // murió este mes
} as const;

// ─── seed ─────────────────────────────────────────────────────────────────────

const seed = async () => {
  const db = await getDb();

  const coll = (name: string) => db.collection(name);
  const now = new Date().toISOString();

  // ── Tenant & suscripción ───────────────────────────────────────────────────
  await coll("tenants").updateOne(
    { id: TENANT_ID },
    { $set: { name: "Estancia Don Jacinto", status: "ACTIVE", updatedAt: now }, $setOnInsert: { id: TENANT_ID, createdAt: now } },
    { upsert: true },
  );
  await coll("subscription_plans").updateOne(
    { code: "PRO" },
    { $set: { name: "Plan Pro", billingPeriodDays: 30, amountCents: 375_000, currency: "UYU", trialDays: 0, isDemo: false, active: true }, $setOnInsert: { id: randomUUID(), code: "PRO" } },
    { upsert: true },
  );
  await coll("subscriptions").updateOne(
    { tenantId: TENANT_ID, planCode: "PRO" },
    { $set: { status: "ACTIVE", provider: "seed", providerCustomerId: null, providerSubscriptionId: null, currentPeriodStart: daysAgo(15), currentPeriodEnd: daysFromNow(350), graceUntil: null, cancelAt: null, updatedAt: now }, $setOnInsert: { id: randomUUID(), tenantId: TENANT_ID, planCode: "PRO", createdAt: now } },
    { upsert: true },
  );

  // ── Establecimiento ────────────────────────────────────────────────────────
  await coll("establishments").updateOne(
    { id: EST_ID },
    { $set: { id: EST_ID, name: "Estancia Don Jacinto", timezone: "UTC-3", mapImageUrl: null, updatedAt: now }, $setOnInsert: { id: EST_ID, createdAt: now } },
    { upsert: true },
  );

  // Membresía del tenant → establecimiento
  await coll("tenant_establishments").updateOne(
    { tenantId: TENANT_ID, establishmentId: EST_ID },
    { $set: { tenantId: TENANT_ID, establishmentId: EST_ID } },
    { upsert: true },
  );

  // ── Usuarios ───────────────────────────────────────────────────────────────
  const users = [
    { email: "jacinto@demo.local", fullName: "Jacinto Pereyra", password: "demo1234", role: "OWNER" as const },
    { email: "capataz@demo.local", fullName: "Roberto Gadea",   password: "demo1234", role: "SUPERVISOR" as const },
    { email: "peon@demo.local",    fullName: "Diego Suárez",    password: "demo1234", role: "OPERATOR" as const },
    { email: "admin@demo.local",   fullName: "Administrador",   password: "demo1234", role: "ADMIN" as const },
    { email: "prueba@linsse.com",  fullName: "Usuario de Prueba", password: "prueba1234", role: "ADMIN" as const },
  ];
  for (const u of users) {
    const existingUser = await coll("users").findOne<{ id: string }>({ email: u.email });
    const userId = existingUser?.id ?? randomUUID();
    await coll("users").updateOne(
      { email: u.email },
      { $set: { id: userId, email: u.email, fullName: u.fullName, passwordHash: hashPassword(u.password), status: "ACTIVE", updatedAt: now }, $setOnInsert: { createdAt: now, lastLoginAt: null } },
      { upsert: true },
    );
    await coll("memberships").updateOne(
      { tenantId: TENANT_ID, userId },
      { $set: { role: u.role }, $setOnInsert: { id: randomUUID(), tenantId: TENANT_ID, userId, createdAt: now } },
      { upsert: true },
    );
  }

  // ── Potreros ───────────────────────────────────────────────────────────────
  for (const p of Object.values(P)) {
    await coll("paddocks").updateOne(
      { id: p.id },
      { $set: { id: p.id, establishmentId: EST_ID, name: p.name, areaHa: p.areaHa, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
  }

  // ── Rodeo (herds) ──────────────────────────────────────────────────────────
  const herdRows = [
    { paddockId: P.norte.id, paddockName: P.norte.name, category: "VACAS DE CRÍA",          count: 85 },
    { paddockId: P.norte.id, paddockName: P.norte.name, category: "TERNEROS",               count: 42 },
    { paddockId: P.sur.id,   paddockName: P.sur.name,   category: "VAQUILLONAS",             count: 65 },
    { paddockId: P.sur.id,   paddockName: P.sur.name,   category: "TERNERAS",               count: 48 },
    { paddockId: P.loma.id,  paddockName: P.loma.name,  category: "NOVILLOS",               count: 95 },
    { paddockId: P.bajo.id,  paddockName: P.bajo.name,  category: "VACAS DE CRÍA",          count: 74 },
    { paddockId: P.bajo.id,  paddockName: P.bajo.name,  category: "TERNEROS",               count: 38 },
    { paddockId: P.riego.id, paddockName: P.riego.name, category: "VACAS DE CRÍA",          count: 25 },
    { paddockId: P.toros.id, paddockName: P.toros.name, category: "TOROS REPRODUCTORES",    count: 8  },
  ];
  for (const row of herdRows) {
    await coll("herds").updateOne(
      { paddockId: row.paddockId, category: row.category },
      { $set: { ...row, establishmentId: EST_ID, updatedAt: now } },
      { upsert: true },
    );
  }

  // ── Categorías del herd ────────────────────────────────────────────────────
  for (const name of ["VACAS DE CRÍA", "VAQUILLONAS", "TERNEROS", "TERNERAS", "NOVILLOS", "TOROS REPRODUCTORES"]) {
    await coll("herd_categories").updateOne(
      { establishmentId: EST_ID, name },
      { $set: { status: "ACTIVE", updatedAt: now }, $setOnInsert: { id: randomUUID(), establishmentId: EST_ID, name, createdAt: now } },
      { upsert: true },
    );
  }

  // ── Animales individuales ──────────────────────────────────────────────────
  const animals = [
    // Vacas potrero Norte (algunas preñadas)
    { earTag: A.v01, sex: "HEMBRA", category: "VACAS DE CRÍA", paddock: P.norte, birthDate: daysAgo(2190), notes: "Preñez confirmada 14/04" },
    { earTag: A.v02, sex: "HEMBRA", category: "VACAS DE CRÍA", paddock: P.norte, birthDate: daysAgo(2555), notes: "Preñez confirmada 14/04" },
    { earTag: A.v03, sex: "HEMBRA", category: "VACAS DE CRÍA", paddock: P.norte, birthDate: daysAgo(1825), notes: "Preñez confirmada 16/04" },
    { earTag: A.v04, sex: "HEMBRA", category: "VACAS DE CRÍA", paddock: P.norte, birthDate: daysAgo(2920), notes: null },
    { earTag: A.v05, sex: "HEMBRA", category: "VACAS DE CRÍA", paddock: P.norte, birthDate: daysAgo(2190), notes: "Parió cría 858001003101" },
    // Vacas potrero El Bajo
    { earTag: A.v06, sex: "HEMBRA", category: "VACAS DE CRÍA", paddock: P.bajo,  birthDate: daysAgo(2190), notes: "Preñez confirmada 10/04" },
    { earTag: A.v07, sex: "HEMBRA", category: "VACAS DE CRÍA", paddock: P.bajo,  birthDate: daysAgo(1825), notes: "Preñez confirmada 10/04" },
    { earTag: A.v08, sex: "HEMBRA", category: "VACAS DE CRÍA", paddock: P.bajo,  birthDate: daysAgo(2920), notes: null },
    { earTag: A.v09, sex: "HEMBRA", category: "VACAS DE CRÍA", paddock: P.bajo,  birthDate: daysAgo(2555), notes: "Tratamiento antibiótico 18/05" },
    { earTag: A.v10, sex: "HEMBRA", category: "VACAS DE CRÍA", paddock: P.bajo,  birthDate: daysAgo(1825), notes: null },
    // Vacas potrero Riego
    { earTag: A.v11, sex: "HEMBRA", category: "VACAS DE CRÍA", paddock: P.riego, birthDate: daysAgo(2190), notes: "Preñez confirmada 20/04" },
    { earTag: A.v12, sex: "HEMBRA", category: "VACAS DE CRÍA", paddock: P.riego, birthDate: daysAgo(2555), notes: null },
    // Vaquillonas potrero Sur
    { earTag: A.vq1, sex: "HEMBRA", category: "VAQUILLONAS", paddock: P.sur, birthDate: daysAgo(730), notes: null },
    { earTag: A.vq2, sex: "HEMBRA", category: "VAQUILLONAS", paddock: P.sur, birthDate: daysAgo(760), notes: null },
    { earTag: A.vq3, sex: "HEMBRA", category: "VAQUILLONAS", paddock: P.sur, birthDate: daysAgo(720), notes: null },
    { earTag: A.vq4, sex: "HEMBRA", category: "VAQUILLONAS", paddock: P.sur, birthDate: daysAgo(750), notes: null },
    { earTag: A.vq5, sex: "HEMBRA", category: "VAQUILLONAS", paddock: P.sur, birthDate: daysAgo(780), notes: null },
    // Terneros potrero Norte
    { earTag: A.t01, sex: "MACHO",  category: "TERNEROS", paddock: P.norte, birthDate: daysAgo(180), notes: "Peso: 185 kg" },
    { earTag: A.t02, sex: "MACHO",  category: "TERNEROS", paddock: P.norte, birthDate: daysAgo(170), notes: "Peso: 192 kg" },
    { earTag: A.t03, sex: "MACHO",  category: "TERNEROS", paddock: P.norte, birthDate: daysAgo(160), notes: "Peso: 178 kg" },
    { earTag: A.t04, sex: "MACHO",  category: "TERNEROS", paddock: P.norte, birthDate: daysAgo(175), notes: null },
    { earTag: A.t05, sex: "MACHO",  category: "TERNEROS", paddock: P.norte, birthDate: daysAgo(165), notes: null },
    // Terneros recientes (nacidos este mes)
    { earTag: A.tr1, sex: "MACHO",  category: "TERNEROS", paddock: P.norte, birthDate: daysAgo(12), notes: `Cría de ${A.v05}. Nac. ${new Date(daysAgo(12)).toLocaleDateString("es-UY")}` },
    { earTag: A.tr2, sex: "HEMBRA", category: "TERNERAS", paddock: P.norte, birthDate: daysAgo(5),  notes: `Cría de ${A.v01}. Nac. ${new Date(daysAgo(5)).toLocaleDateString("es-UY")}` },
    // Toros
    { earTag: A.to1, sex: "MACHO", category: "TOROS REPRODUCTORES", paddock: P.toros, birthDate: daysAgo(1460), notes: "Toro Brahman. En servicio desde nov." },
    { earTag: A.to2, sex: "MACHO", category: "TOROS REPRODUCTORES", paddock: P.toros, birthDate: daysAgo(1095), notes: "Toro Hereford. En servicio desde nov." },
    // Animal muerto este mes
    { earTag: A.mu1, sex: "MACHO", category: "NOVILLOS", paddock: P.loma, birthDate: daysAgo(540), notes: "Baja por muerte — probable timpanismo", status: "MUERTO" },
  ];

  for (const a of animals) {
    const animalId = `demo-animal-${a.earTag}`;
    await coll("animals").updateOne(
      { id: animalId },
      {
        $set: {
          id: animalId,
          establishmentId: EST_ID,
          earTag: a.earTag,
          name: a.earTag,
          sex: a.sex,
          breed: null,
          birthDate: a.birthDate,
          category: a.category,
          status: (a as { status?: string }).status ?? "ACTIVO",
          paddockId: a.paddock.id,
          paddockName: a.paddock.name,
          notes: a.notes,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: daysAgo(90) },
      },
      { upsert: true },
    );
  }

  // ── Eventos de trazabilidad ────────────────────────────────────────────────
  const tracEvents = [
    // Preñeces confirmadas
    { earTag: A.v01, type: "PREÑEZ_CONFIRMADA", paddock: P.norte, notes: "Diagnóstico positivo por ecografía",              occurredAt: daysAgo(37) },
    { earTag: A.v02, type: "PREÑEZ_CONFIRMADA", paddock: P.norte, notes: "Diagnóstico positivo por ecografía",              occurredAt: daysAgo(37) },
    { earTag: A.v03, type: "PREÑEZ_CONFIRMADA", paddock: P.norte, notes: "Diagnóstico positivo — 3 meses gestación",        occurredAt: daysAgo(35) },
    { earTag: A.v06, type: "PREÑEZ_CONFIRMADA", paddock: P.bajo,  notes: "Diagnóstico positivo por tacto",                  occurredAt: daysAgo(41) },
    { earTag: A.v07, type: "PREÑEZ_CONFIRMADA", paddock: P.bajo,  notes: "Diagnóstico positivo por tacto",                  occurredAt: daysAgo(41) },
    { earTag: A.v11, type: "PREÑEZ_CONFIRMADA", paddock: P.riego, notes: "Diagnóstico positivo — 4 meses gestación",        occurredAt: daysAgo(31) },
    // Parto: madre
    { earTag: A.v05, type: "OBSERVACION",       paddock: P.norte, notes: `Parto registrado. Cría ${A.tr1}.`,                occurredAt: daysAgo(12) },
    // Parto: cría ternero
    { earTag: A.tr1, type: "OBSERVACION",       paddock: P.norte, notes: `Nacimiento. Madre ${A.v05}. Peso inicial 38 kg.`, occurredAt: daysAgo(12), weight: 38 },
    // Parto: madre 2
    { earTag: A.v01, type: "OBSERVACION",       paddock: P.norte, notes: `Parto registrado. Cría ${A.tr2}.`,                occurredAt: daysAgo(5) },
    // Parto: cría ternera
    { earTag: A.tr2, type: "OBSERVACION",       paddock: P.norte, notes: `Nacimiento. Madre ${A.v01}. Peso inicial 34 kg.`, occurredAt: daysAgo(5),  weight: 34 },
    // Muerte
    { earTag: A.mu1, type: "MUERTE",            paddock: P.loma,  notes: "Encontrado muerto en potrero. Probable timpanismo por lluvia intensa.", occurredAt: daysAgo(8) },
    // Vacunaciones individuales
    { earTag: A.v09, type: "VACUNACION_REALIZADA", paddock: P.bajo,  product: "Aftosa",       notes: "Campaña vacunación lote", occurredAt: daysAgo(22) },
    { earTag: A.v09, type: "TRATAMIENTO",          paddock: P.bajo,  product: "Oxitetraciclina", dose: "10 ml",  notes: "Infección respiratoria leve", occurredAt: daysAgo(3) },
    // Pesajes terneros
    { earTag: A.t01, type: "PESAJE", paddock: P.norte, weight: 185, notes: "Pesaje rutina mensual", occurredAt: daysAgo(7) },
    { earTag: A.t02, type: "PESAJE", paddock: P.norte, weight: 192, notes: "Pesaje rutina mensual", occurredAt: daysAgo(7) },
    { earTag: A.t03, type: "PESAJE", paddock: P.norte, weight: 178, notes: "Pesaje rutina mensual", occurredAt: daysAgo(7) },
    // Movimiento
    { earTag: A.v11, type: "TRASLADO", paddock: P.riego, notes: `Movida de ${P.norte.name} a ${P.riego.name} por sobrepastoreo.`, occurredAt: daysAgo(18) },
  ];

  for (const e of tracEvents) {
    const eventId = `demo-trac-${e.earTag}-${e.type}-${e.occurredAt.slice(0, 10)}`;
    await coll("traceability_events").updateOne(
      { id: eventId },
      {
        $set: {
          id: eventId,
          establishmentId: EST_ID,
          earTag: e.earTag,
          type: e.type,
          paddockId: e.paddock.id,
          paddockName: e.paddock.name,
          product: (e as { product?: string }).product ?? null,
          dose: (e as { dose?: string }).dose ?? null,
          weight: (e as { weight?: number }).weight ?? null,
          destination: null,
          notes: e.notes,
          occurredAt: e.occurredAt,
          source: "COMANDO_IA",
          createdBy: null,
          createdAt: e.occurredAt,
        },
      },
      { upsert: true },
    );
  }

  // ── Eventos sanitarios (campañas) ──────────────────────────────────────────
  const healthEvents = [
    {
      id: "demo-he-001",
      type: "VACCINATION",
      category: `LOTE ${P.norte.name}`,
      qty: 127,
      product: "Aftosa",
      notes: "Campaña obligatoria 1er ciclo. Todo Potrero Norte.",
      occurredAt: daysAgo(22),
      nextDueAt: daysFromNow(160),
    },
    {
      id: "demo-he-002",
      type: "VACCINATION",
      category: `LOTE ${P.sur.name}`,
      qty: 65,
      product: "Brucelosis",
      notes: "Vacunación brucelosis vaquillonas Potrero Sur.",
      occurredAt: daysAgo(15),
      nextDueAt: null,
    },
    {
      id: "demo-he-003",
      type: "DEWORMING",
      category: `LOTE ${P.loma.name}`,
      qty: 95,
      product: "Ivermectina",
      notes: "Desparasitación novillos antes del entore.",
      occurredAt: daysAgo(10),
      nextDueAt: daysFromNow(90),
    },
  ];

  for (const he of healthEvents) {
    await coll("health_events").updateOne(
      { id: he.id },
      {
        $set: {
          id: he.id,
          establishmentId: EST_ID,
          type: he.type,
          category: he.category,
          qty: he.qty,
          product: he.product,
          dose: null,
          route: null,
          notes: he.notes,
          supplyId: null,
          supplyBatchId: null,
          quantityUsed: null,
          unit: null,
          responsible: "Roberto Gadea",
          occurredAt: he.occurredAt,
          nextDueAt: he.nextDueAt,
          status: "COMPLETED",
          source: "MANUAL",
          createdAt: he.occurredAt,
          updatedAt: he.occurredAt,
        },
      },
      { upsert: true },
    );
  }

  // ── Tareas ─────────────────────────────────────────────────────────────────
  const tasks = [
    {
      id: "demo-task-001",
      title: "Recorrida general potrero La Loma",
      description: "Verificar estado de alambrados, aguada y animales luego de la lluvia del martes.",
      type: "FIELD_CHECK",
      status: "OVERDUE",
      priority: "URGENT",
      paddock: P.loma,
      dueDate: daysAgo(2),
      scheduledAt: daysAgo(2),
      earTag: null,
    },
    {
      id: "demo-task-002",
      title: "Revisar aguada Potrero El Bajo",
      description: "Bebedero reportado sin agua desde ayer. Verificar flotante y conexión.",
      type: "PADDOCK_REVIEW",
      status: "OVERDUE",
      priority: "URGENT",
      paddock: P.bajo,
      dueDate: daysAgo(1),
      scheduledAt: daysAgo(1),
      earTag: null,
    },
    {
      id: "demo-task-003",
      title: `Chequeo veterinario cría ${A.tr1}`,
      description: `Revisar cría de ${A.v05}: ombligo, calostrado y estado general a los 15 días.`,
      type: "BIRTH_FOLLOW_UP",
      status: "PENDING",
      priority: "HIGH",
      paddock: P.norte,
      dueDate: daysFromNow(3),
      scheduledAt: daysFromNow(3),
      earTag: A.tr1,
    },
    {
      id: "demo-task-004",
      title: "Tacto reproductor — vacas Potrero Norte",
      description: "Diagnóstico de gestación a las vacas que no tienen preñez confirmada. Coordinar con veterinario.",
      type: "REPRODUCTION",
      status: "PENDING",
      priority: "HIGH",
      paddock: P.norte,
      dueDate: daysFromNow(5),
      scheduledAt: daysFromNow(5),
      earTag: null,
    },
    {
      id: "demo-task-005",
      title: `Seguimiento tratamiento ${A.v09}`,
      description: `Verificar evolución de ${A.v09} post-tratamiento con Oxitetraciclina. Control de temperatura.`,
      type: "HEALTH",
      status: "PENDING",
      priority: "HIGH",
      paddock: P.bajo,
      dueDate: daysFromNow(2),
      scheduledAt: daysFromNow(2),
      earTag: A.v09,
    },
    {
      id: "demo-task-006",
      title: "Pesaje lote terneros Potrero Sur",
      description: "Pesaje mensual terneras y terneros para control de ganancia de peso.",
      type: "WEIGHING",
      status: "PENDING",
      priority: "MEDIUM",
      paddock: P.sur,
      dueDate: daysFromNow(7),
      scheduledAt: daysFromNow(7),
      earTag: null,
    },
    {
      id: "demo-task-007",
      title: "Programar próxima dosis Aftosa",
      description: "Revisar calendario sanitario y confirmar fecha 2do ciclo vacunación aftosa.",
      type: "HEALTH",
      status: "PENDING",
      priority: "MEDIUM",
      paddock: P.norte,
      dueDate: daysFromNow(30),
      scheduledAt: daysFromNow(30),
      earTag: null,
    },
    {
      id: "demo-task-008",
      title: "Campaña desparasitación vacas El Bajo",
      description: "Desparasitación con Ivermectina a todo el rodeo de El Bajo antes del entore.",
      type: "HEALTH",
      status: "IN_PROGRESS",
      priority: "MEDIUM",
      paddock: P.bajo,
      dueDate: daysFromNow(1),
      scheduledAt: now,
      earTag: null,
    },
    {
      id: "demo-task-009",
      title: `Chequeo cría ${A.tr2}`,
      description: `Primer control veterinario cría de ${A.v01}. Revisar peso y comportamiento.`,
      type: "BIRTH_FOLLOW_UP",
      status: "PENDING",
      priority: "HIGH",
      paddock: P.norte,
      dueDate: daysFromNow(9),
      scheduledAt: daysFromNow(9),
      earTag: A.tr2,
    },
    {
      id: "demo-task-010",
      title: "Recorrida potrero Riego",
      description: "Verificar pasturas y estado general del lote trasladado hace 18 días.",
      type: "FIELD_CHECK",
      status: "PENDING",
      priority: "LOW",
      paddock: P.riego,
      dueDate: daysFromNow(2),
      scheduledAt: daysFromNow(2),
      earTag: null,
    },
  ];

  for (const t of tasks) {
    await coll("tasks").updateOne(
      { id: t.id },
      {
        $set: {
          id: t.id,
          establishmentId: EST_ID,
          title: t.title,
          description: t.description,
          type: t.type,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          scheduledAt: t.scheduledAt,
          completedAt: null,
          assignedToUserId: null,
          assignedRole: null,
          paddockId: t.paddock.id,
          paddockName: t.paddock.name,
          animalId: t.earTag ? `demo-animal-${t.earTag}` : null,
          earTag: t.earTag,
          source: "SYSTEM_RULE",
          sourceEventId: null,
          createdBy: null,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: daysAgo(1) },
      },
      { upsert: true },
    );
  }

  // ── Activity feed ──────────────────────────────────────────────────────────
  const feed = [
    { id: "demo-af-001", activityType: "TRACEABILITY_EVENT_CREATED", title: `Muerte registrada: ${A.mu1}`,        summary: "Probable timpanismo · Potrero La Loma",        occurredAt: daysAgo(8),  priority: "URGENT",  status: "CRITICAL",  earTag: A.mu1,  paddock: P.loma  },
    { id: "demo-af-002", activityType: "TRACEABILITY_EVENT_CREATED", title: `Parto registrado: ${A.v05}`,         summary: `Cría ${A.tr1} · 38 kg · Potrero Norte`,      occurredAt: daysAgo(12), priority: "HIGH",    status: "INFO",     earTag: A.v05,  paddock: P.norte },
    { id: "demo-af-003", activityType: "TRACEABILITY_EVENT_CREATED", title: `Parto registrado: ${A.v01}`,         summary: `Cría ${A.tr2} · 34 kg · Potrero Norte`,      occurredAt: daysAgo(5),  priority: "HIGH",    status: "INFO",     earTag: A.v01,  paddock: P.norte },
    { id: "demo-af-004", activityType: "HEALTH_EVENT_CREATED",       title: "Vacunación: Aftosa",                  summary: "127 cabezas · Potrero Norte",                 occurredAt: daysAgo(22), priority: "MEDIUM",  status: "DONE",     earTag: null,   paddock: P.norte },
    { id: "demo-af-005", activityType: "HEALTH_EVENT_CREATED",       title: "Vacunación: Brucelosis",             summary: "65 vaquillonas · Potrero Sur",                occurredAt: daysAgo(15), priority: "MEDIUM",  status: "DONE",     earTag: null,   paddock: P.sur   },
    { id: "demo-af-006", activityType: "HEALTH_EVENT_CREATED",       title: "Desparasitación: Ivermectina",       summary: "95 novillos · Potrero La Loma",               occurredAt: daysAgo(10), priority: "MEDIUM",  status: "DONE",     earTag: null,   paddock: P.loma  },
    { id: "demo-af-007", activityType: "TRACEABILITY_EVENT_CREATED", title: `Pesaje: ${A.t01}`,                   summary: "185 kg · Potrero Norte",                      occurredAt: daysAgo(7),  priority: "LOW",     status: "INFO",     earTag: A.t01,  paddock: P.norte },
    { id: "demo-af-008", activityType: "TRACEABILITY_EVENT_CREATED", title: `Tratamiento: ${A.v09}`,              summary: "Oxitetraciclina 10 ml · Potrero El Bajo",     occurredAt: daysAgo(3),  priority: "HIGH",    status: "WARNING",  earTag: A.v09,  paddock: P.bajo  },
    { id: "demo-af-009", activityType: "TASK_CREATED",               title: "Tarea urgente: aguada El Bajo",      summary: "Bebedero sin agua reportado por operario",    occurredAt: hoursAgo(20),priority: "URGENT",  status: "PENDING",  earTag: null,   paddock: P.bajo  },
    { id: "demo-af-010", activityType: "TRACEABILITY_EVENT_CREATED", title: `Traslado: ${A.v11}`,                 summary: `Potrero Norte → Potrero Riego`,               occurredAt: daysAgo(18), priority: "LOW",     status: "INFO",     earTag: A.v11,  paddock: P.riego },
    { id: "demo-af-011", activityType: "TASK_COMPLETED",             title: "Recorrida general Potrero Sur",      summary: "Completada por Diego Suárez",                 occurredAt: daysAgo(4),  priority: "MEDIUM",  status: "DONE",     earTag: null,   paddock: P.sur   },
    { id: "demo-af-012", activityType: "TRACEABILITY_EVENT_CREATED", title: "Preñez confirmada × 6 hembras",      summary: "Tacto reproductor 3 potreros · 6 positivas",  occurredAt: daysAgo(37), priority: "HIGH",    status: "INFO",     earTag: null,   paddock: P.norte },
  ];

  for (const f of feed) {
    await coll("activity_feed").updateOne(
      { id: f.id },
      {
        $set: {
          id: f.id,
          establishmentId: EST_ID,
          activityType: f.activityType,
          title: f.title,
          summary: f.summary,
          occurredAt: f.occurredAt,
          priority: f.priority,
          status: f.status,
          sourceCollection: "seed",
          sourceId: f.id,
          earTag: f.earTag,
          paddockId: f.paddock.id,
          paddockName: f.paddock.name,
          createdAt: f.occurredAt,
        },
      },
      { upsert: true },
    );
  }

  // ── Incidentes de campo ────────────────────────────────────────────────────
  const incidents = [
    {
      id: "demo-inc-001",
      title: "Bebedero sin agua Potrero El Bajo",
      description: "Operario reportó que el bebedero principal de El Bajo no tiene agua. Flotante posiblemente roto.",
      severity: "HIGH",
      status: "OPEN",
      paddock: P.bajo,
      observedAt: hoursAgo(20),
    },
    {
      id: "demo-inc-002",
      title: "Alambre cortado sector norte Potrero La Loma",
      description: "3 postes caídos y alambre cortado en el sector norte lindero con Potrero Norte. Posible ingreso de animales.",
      severity: "MEDIUM",
      status: "RESOLVED",
      paddock: P.loma,
      observedAt: daysAgo(14),
      resolvedAt: daysAgo(12),
    },
  ];

  for (const inc of incidents) {
    await coll("field_incidents").updateOne(
      { id: inc.id },
      {
        $set: {
          id: inc.id,
          establishmentId: EST_ID,
          paddockId: inc.paddock.id,
          title: inc.title,
          description: inc.description,
          severity: inc.severity,
          status: inc.status,
          observedAt: inc.observedAt,
          resolvedAt: (inc as { resolvedAt?: string }).resolvedAt ?? null,
          mapX: null,
          mapY: null,
          source: "COMMAND",
          createdAt: inc.observedAt,
          updatedAt: inc.observedAt,
        },
      },
      { upsert: true },
    );
  }

  // ── Insumos y lotes ────────────────────────────────────────────────────────
  const supplyData = [
    { id: "demo-sup-001", batchId: "demo-bat-001", type: "VACCINE",  name: "Aftosa Bivalente",    unit: "dosis", ingredient: "Antígeno aftosa",    qty: 250, used: 127, batch: "AFT-2026-01", expDays: 45  },
    { id: "demo-sup-002", batchId: "demo-bat-002", type: "VACCINE",  name: "Brucelosis Cepa 19",  unit: "dosis", ingredient: "Brucella abortus",   qty: 100, used: 65,  batch: "BRU-2026-01", expDays: 30  },
    { id: "demo-sup-003", batchId: "demo-bat-003", type: "DEWORMER", name: "Ivermectina 1%",      unit: "ml",    ingredient: "Ivermectina",        qty: 2000, used: 950, batch: "IVM-2026-01", expDays: 90 },
    { id: "demo-sup-004", batchId: "demo-bat-004", type: "MEDICINE", name: "Oxitetraciclina LA",  unit: "ml",    ingredient: "Oxitetraciclina",    qty: 500,  used: 10,  batch: "ATB-2026-01", expDays: 7  },
    { id: "demo-sup-005", batchId: "demo-bat-005", type: "VACCINE",  name: "Carbunclo sintomático",unit: "dosis", ingredient: "Clostridium chauvoei",qty: 150, used: 0,  batch: "CAR-2026-01", expDays: 120 },
  ];

  for (const s of supplyData) {
    await coll("supplies").updateOne(
      { id: s.id },
      {
        $set: {
          id: s.id,
          establishmentId: EST_ID,
          type: s.type,
          name: s.name,
          activeIngredient: s.ingredient,
          presentation: "Frasco",
          unit: s.unit,
          defaultDose: null,
          withdrawalPeriodDays: s.type === "MEDICINE" ? 30 : null,
          storageNotes: "Conservar entre 2-8°C",
          status: "ACTIVE",
          updatedAt: now,
        },
        $setOnInsert: { id: s.id, createdAt: daysAgo(60) },
      },
      { upsert: true },
    );
    const available = s.qty - s.used;
    await coll("supply_batches").updateOne(
      { id: s.batchId },
      {
        $set: {
          id: s.batchId,
          establishmentId: EST_ID,
          supplyId: s.id,
          batchNumber: s.batch,
          quantityInitial: s.qty,
          quantityAvailable: available,
          unit: s.unit,
          expirationDate: daysFromNow(s.expDays),
          purchaseDate: daysAgo(30),
          supplier: "Veterinaria El Campo S.A.",
          invoiceNumber: `FC-${s.batch}`,
          location: "Depósito principal",
          status: available > 0 ? "AVAILABLE" : "DEPLETED",
          notes: null,
          updatedAt: now,
        },
        $setOnInsert: { id: s.batchId, createdAt: daysAgo(30) },
      },
      { upsert: true },
    );
  }

  // ── command_context ────────────────────────────────────────────────────────
  await coll("command_context").updateOne(
    { _id: "default" },
    {
      $set: {
        paddocks: Object.values(P).map((p) => ({ id: p.id, name: p.name })),
        consignors: [
          { id: "demo-cons-001", name: "Consignataria del Norte S.A." },
          { id: "demo-cons-002", name: "Ganados del Sur" },
        ],
        slaughterhouses: [
          { id: "demo-sl-001", name: "Frigorífico La Pampa" },
          { id: "demo-sl-002", name: "Frigorífico San Miguel" },
        ],
      },
    },
    { upsert: true },
  );

  // ── Resumen ────────────────────────────────────────────────────────────────
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           DEMO SEED — Estancia Don Jacinto                   ║
╠══════════════════════════════════════════════════════════════╣
║  Establec.:  demo-est-001                                    ║
║  Potreros:   6  (Norte, Sur, La Loma, El Bajo, Riego, Toros) ║
║  Rodeo:      480 cabezas en herds + 28 animales individuales ║
║  Preñadas:   6 confirmadas                                   ║
║  Partos:     2 este mes  (${A.tr1}, ${A.tr2})    ║
║  Muertes:    1 este mes  (${A.mu1})              ║
║  Tareas:     10 (2 vencidas, 1 en curso, 7 pendientes)       ║
║  Insumos:    5 productos (1 vence en 7 días ⚠️)              ║
╠══════════════════════════════════════════════════════════════╣
║  Usuarios:                                                   ║
║    jacinto@demo.local  / demo1234  (OWNER)                   ║
║    capataz@demo.local  / demo1234  (SUPERVISOR)              ║
║    peon@demo.local     / demo1234  (OPERATOR → /campo)       ║
║    admin@demo.local    / demo1234  (ADMIN)                   ║
╚══════════════════════════════════════════════════════════════╝
`);
};

seed()
  .catch((error) => {
    console.error("Error al ejecutar el seed demo:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getMongoClient().close();
  });
