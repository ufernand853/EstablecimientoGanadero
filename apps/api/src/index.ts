import Fastify from "fastify";
import cors from "@fastify/cors";
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { categorySynonyms, parseCommand } from "@eg/shared";
import { getDb, getMongoClient } from "./db.js";

const normalizeBoolean = (value: string | undefined) => {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
};

const configuredCorsOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = Fastify({
  logger: true,
  trustProxy: normalizeBoolean(process.env.TRUST_PROXY),
});

await app.register(cors, {
  origin: configuredCorsOrigins.length > 0 ? configuredCorsOrigins : true,
  credentials: true,
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

const undoConfirmationSchema = z.object({
  establishmentId: z.string().uuid(),
  confirmationId: z.string().min(1),
});

const registerSubscriptionSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2),
  companyName: z.string().min(2),
  password: z.string().min(8),
  planCode: z.string().min(2).default("PRO"),
  billingProvider: z.enum(["mercadopago", "dodo"]).optional(),
});

const enterpriseContactSchema = z.object({
  company: z.string().min(2),
  contact: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(3).optional().nullable(),
  message: z.string().min(2).optional().nullable(),
});

const webhookSchema = z.object({
  provider: z.string().min(2).default("generic"),
  providerEventId: z.string().min(3),
  eventType: z.enum(["payment.succeeded", "payment.failed", "subscription.cancelled"]),
  referenceId: z.string().min(8),
  email: z.string().email().optional(),
  amountCents: z.number().int().nonnegative().optional(),
  currency: z.string().optional(),
  occurredAt: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const demoRequestSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2),
  companyName: z.string().min(2),
  password: z.string().min(8).optional(),
});

const adminUserCreateSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "SUPERVISOR", "OPERATOR", "READONLY"]).default("OPERATOR"),
});

const adminUserUpdateSchema = z.object({
  email: z.string().email().optional(),
  fullName: z.string().min(2).optional(),
  password: z.string().min(8).optional(),
  role: z.enum(["OWNER", "ADMIN", "SUPERVISOR", "OPERATOR", "READONLY"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const adminCustomerAccessSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2),
  password: z.string().min(8).optional(),
  role: z.enum(["OWNER", "ADMIN", "SUPERVISOR", "OPERATOR", "READONLY"]).default("OWNER"),
});

const adminResetPasswordSchema = z.object({
  password: z.string().min(8).optional(),
});

const adminPlanUpdateSchema = z.object({
  amountCents: z.number().int().nonnegative(),
});

const aiChatSchema = z.object({
  establishmentId: z.string().uuid(),
  prompt: z.string().min(2),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1),
  })).max(20).optional(),
});

const aiBehaviorSchema = z.object({
  establishmentId: z.string().uuid(),
  trigger: z.string().min(3),
  expectedBehavior: z.string().min(5),
  notes: z.string().max(500).optional(),
});

const TRACEABILITY_EVENT_TYPES = [
  "ASIGNACION_POTRERO",
  "INSEMINACION",
  "PREÑEZ_CONFIRMADA",
  "VACUNACION_PENDIENTE",
  "VACUNACION_REALIZADA",
  "DESPARASITACION",
  "TRATAMIENTO",
  "PESAJE",
  "TRASLADO",
  "MUERTE",
  "ENVIO_FRIGORIFICO",
  "OBSERVACION",
] as const;

const taskCreateSchema = z.object({
  establishmentId: z.string().uuid(),
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional().nullable(),
  type: z.enum([
    "FIELD_CHECK",
    "HEALTH",
    "REPRODUCTION",
    "BIRTH_FOLLOW_UP",
    "PADDOCK_REVIEW",
    "WEIGHING",
    "MOVEMENT",
    "ADMIN",
    "VETERINARY",
    "INFRASTRUCTURE",
  ]).default("FIELD_CHECK"),
  status: z.enum(["PENDING", "IN_PROGRESS", "DONE", "CANCELLED", "OVERDUE"]).default("PENDING"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  dueDate: z.string().datetime().optional().nullable(),
  scheduledAt: z.string().datetime().optional().nullable(),
  assignedToUserId: z.string().optional().nullable(),
  assignedRole: z.string().optional().nullable(),
  paddockId: z.string().uuid().optional().nullable(),
  paddockName: z.string().max(200).optional().nullable(),
  animalId: z.string().uuid().optional().nullable(),
  earTag: z.string().max(50).optional().nullable(),
  source: z.enum(["MANUAL", "FIELD_COMMAND", "SYSTEM_RULE", "HEALTH_EVENT", "REPRODUCTION_EVENT", "TRACEABILITY_EVENT"]).default("MANUAL"),
  sourceEventId: z.string().optional().nullable(),
  createdBy: z.string().max(200).optional().nullable(),
});

const taskUpdateSchema = taskCreateSchema.omit({ establishmentId: true }).partial();

const taskCompleteSchema = z.object({
  completedAt: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
});

const fieldAssistantSchema = z.object({
  establishmentId: z.string().uuid(),
  prompt: z.string().min(2),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1),
  })).max(20).optional(),
});

const fieldConfirmSchema = z.object({
  establishmentId: z.string().uuid(),
  confirmationToken: z.string().min(8),
});

const scanAssistSchema = z.object({
  establishmentId: z.string().uuid(),
  rawCode: z.string().min(1).max(50),
  source: z.enum(["RFID_SCANNER", "MANUAL_ENTRY"]).default("RFID_SCANNER"),
});

const animalStatusUpdateSchema = z.object({
  establishmentId: z.string().uuid(),
  earTag: z.string().min(1).max(50),
  status: z.enum(["ACTIVO", "VENDIDO", "MUERTO"]),
});

const traceabilityEventCreateSchema = z.object({
  establishmentId: z.string().uuid(),
  earTag: z.string().min(1).max(50),
  type: z.enum(TRACEABILITY_EVENT_TYPES),
  paddockId: z.string().uuid().optional().nullable(),
  paddockName: z.string().max(200).optional().nullable(),
  product: z.string().max(200).optional().nullable(),
  dose: z.string().max(100).optional().nullable(),
  weight: z.number().positive().optional().nullable(),
  destination: z.string().max(200).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  occurredAt: z.string().datetime().optional(),
  source: z.enum(["MANUAL", "COMANDO_IA", "RFID", "FOTO"]).default("MANUAL"),
  createdBy: z.string().max(200).optional().nullable(),
});

const supplyCreateSchema = z.object({
  establishmentId: z.string().uuid(),
  type: z.enum(["MEDICINE", "VACCINE", "DEWORMER", "FEED", "OTHER"]).default("MEDICINE"),
  name: z.string().min(2).max(200),
  activeIngredient: z.string().max(200).optional().nullable(),
  presentation: z.string().max(200).optional().nullable(),
  unit: z.string().min(1).max(30).default("dosis"),
  defaultDose: z.string().max(100).optional().nullable(),
  withdrawalPeriodDays: z.number().int().nonnegative().optional().nullable(),
  storageNotes: z.string().max(1000).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

const supplyUpdateSchema = supplyCreateSchema.omit({ establishmentId: true }).partial();

const supplyBatchCreateSchema = z.object({
  establishmentId: z.string().uuid(),
  supplyId: z.string().uuid(),
  batchNumber: z.string().min(1).max(100),
  quantityInitial: z.number().positive(),
  quantityAvailable: z.number().nonnegative().optional(),
  unit: z.string().min(1).max(30).optional(),
  expirationDate: z.string().datetime(),
  purchaseDate: z.string().datetime().optional().nullable(),
  supplier: z.string().max(200).optional().nullable(),
  invoiceNumber: z.string().max(100).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  status: z.enum(["AVAILABLE", "LOW_STOCK", "EXPIRED", "CONSUMED", "DISCARDED"]).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

const supplyBatchUpdateSchema = supplyBatchCreateSchema.omit({ establishmentId: true, supplyId: true }).partial();

const supplyMovementCreateSchema = z.object({
  establishmentId: z.string().uuid(),
  supplyId: z.string().uuid(),
  batchId: z.string().uuid(),
  type: z.enum(["IN", "OUT", "ADJUSTMENT", "DISCARD", "RESERVED"]),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(30).optional(),
  reason: z.string().min(2).max(500),
  relatedTaskId: z.string().optional().nullable(),
  relatedHealthEventId: z.string().optional().nullable(),
  relatedTraceabilityEventId: z.string().optional().nullable(),
  occurredAt: z.string().datetime().optional(),
  createdBy: z.string().max(200).optional().nullable(),
});

type AIMessage = {
  role: "user" | "assistant";
  content: string;
};

type AIBehavior = {
  id: string;
  establishmentId: string;
  trigger: string;
  expectedBehavior: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
const DEFAULT_AI_BEHAVIORS = [
  { trigger: "mover {cantidad} {categoria} del potrero {origen} al potrero {destino}", expectedBehavior: "Detectar MOVE, pedir confirmación y ejecutar movimiento de lote." },
  { trigger: "animal/es {estado} en potrero {potrero}", expectedBehavior: "Detectar INCIDENT_REPORT, pedir confirmación y registrar incidente con descripción y responsable." },
  { trigger: "vacunamos/fueron vacunados {cantidad} {categoria} con {producto}", expectedBehavior: "Detectar VACCINATION, pedir confirmación y registrar evento sanitario." },
  { trigger: "{cantidad} preñadas y {cantidad} vacías", expectedBehavior: "Detectar resumen reproductivo y responder con guía para registrar resultado reproductivo." },
  { trigger: "entoramos potrero {potrero} con {cantidad} toros", expectedBehavior: "Detectar BREEDING_START, pedir confirmación y registrar evento de entore." },
] as const;

type CommandContext = {
  paddocks: { id: string; name: string }[];
  consignors: { id: string; name: string }[];
  slaughterhouses: { id: string; name: string }[];
  supplies?: { id: string; name: string }[];
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
  mapImageUrl: string | null;
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
  movementTypeId: string | null;
  movementType: string | null;
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
  supplyId: string | null;
  supplyBatchId: string | null;
  quantityUsed: number | null;
  unit: string | null;
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
  address: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
};

type Slaughterhouse = {
  id: string;
  establishmentId: string;
  name: string;
  address: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
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

type BreedMaster = {
  id: string;
  establishmentId: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
};

type MovementTypeMaster = {
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

type OperationalEventKind = "BREEDING_START" | "WEANING" | "BRANDING" | "SLAUGHTER_SHIPMENT";

type OperationalEvent = {
  id: string;
  establishmentId: string;
  kind: OperationalEventKind;
  occurredAt: string;
  payload: Record<string, unknown>;
  source: "COMMAND" | "MANUAL";
  createdAt: string;
  updatedAt: string;
};

type ReproductionEventType = "ENTORE" | "PREGNANCY_CHECK";

type ReproductionEvent = {
  id: string;
  establishmentId: string;
  type: ReproductionEventType;
  occurredAt: string;
  category: string;
  lot: string | null;
  servicedQty: number | null;
  bullsQty: number | null;
  strawsQty: number | null;
  protocol: string | null;
  diagnosedQty: number | null;
  pregnantQty: number | null;
  emptyQty: number | null;
  responsible: string | null;
  notes: string | null;
  source: "MANUAL" | "COMMAND";
  createdAt: string;
  updatedAt: string;
};

type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type IncidentStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CANCELLED";

type FieldIncident = {
  id: string;
  establishmentId: string;
  paddockId: string | null;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  observedAt: string;
  resolvedAt: string | null;
  mapX: number | null;
  mapY: number | null;
  source: "MANUAL" | "INSPECTION" | "COMMAND";
  createdAt: string;
  updatedAt: string;
};

type AISettings = {
  _id: "ai_settings";
  openAiApiKey: string;
  openAiModel: string;
  updatedAt: string;
};

type CommandLog = {
  id: string;
  establishmentId: string;
  source: "AI_CHAT" | "COMMAND_CONFIRM";
  stage: "PARSED" | "PARSE_ERROR" | "CONFIRM_SUCCESS" | "CONFIRM_ERROR";
  intent: string | null;
  message: string;
  payload?: Record<string, unknown>;
  createdAt: string;
};

type ConfirmationRecord = {
  id: string;
  establishmentId: string;
  confirmationToken: string;
  edits?: Record<string, unknown>;
  parsedIntent: string | null;
  createdEventIds: string[];
  confirmedAt: string;
  undoneAt?: string;
  undoReason?: string;
};

type Tenant = {
  id: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
  updatedAt: string;
};

type UserAccount = {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

type Membership = {
  id: string;
  tenantId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "SUPERVISOR" | "OPERATOR" | "READONLY";
  createdAt: string;
};

type AccessLogEvent = "LOGIN_SUCCESS" | "LOGIN_FAILURE" | "LOGOUT";

type AccessLog = {
  id: string;
  email: string;
  userId: string | null;
  tenantId: string | null;
  event: AccessLogEvent;
  status: "SUCCESS" | "FAILED";
  ip: string | null;
  userAgent: string | null;
  message: string | null;
  createdAt: string;
};

type DemoActivityLog = {
  id: string;
  email: string;
  userId: string;
  tenantId: string;
  role: Membership["role"];
  method: string;
  path: string;
  action: string;
  statusCode: number;
  blocked: boolean;
  ip: string | null;
  userAgent: string | null;
  message: string | null;
  createdAt: string;
};

type SubscriptionPlan = {
  id: string;
  code: string;
  name: string;
  billingPeriodDays: number;
  amountCents: number;
  currency: string;
  trialDays: number;
  isDemo: boolean;
  active: boolean;
  animalLimit: number | null;
  description: string;
  ctaLabel: string;
  featureList: string[];
  sortOrder: number;
  availableProviders?: ("mercadopago" | "dodo")[];
  defaultProvider?: "mercadopago" | "dodo" | null;
};

type Subscription = {
  id: string;
  tenantId: string;
  planCode: string;
  status: "PENDING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "TRIALING" | "EXPIRED";
  provider: string;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  graceUntil: string | null;
  cancelAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type BillingCheckout = {
  id: string;
  referenceId: string;
  email: string;
  fullName: string;
  companyName: string;
  planCode: string;
  passwordHash: string;
  status: "PENDING_PAYMENT" | "COMPLETED" | "FAILED";
  tenantId: string | null;
  provider: string | null;
  providerCustomerId?: string | null;
  providerSubscriptionId: string | null;
  providerPaymentId?: string | null;
  checkoutUrl: string | null;
  createdAt: string;
  updatedAt: string;
  kind: "SUBSCRIPTION" | "DEMO";
};

const DEFAULT_HERD_CATEGORY_NAMES = [
  "VACAS DE CRIA",
  "VAQUILLONAS",
  "TERNEROS",
  "TERNERAS",
  "NOVILLOS",
  "TOROS",
  "REPRODUCTORES",
  "RECRIA",
] as const;

const DEFAULT_BREED_NAMES = [
  "ANGUS",
  "HEREFORD",
  "BRAFORD",
  "BRANGUS",
  "HOLANDO",
  "CRUZA",
] as const;

const DEFAULT_MOVEMENT_TYPE_NAMES = [
  "TRASLADO INTERNO",
  "CAMBIO DE POTRERO",
  "AJUSTE DE STOCK",
  "VENTA",
  "INGRESO",
] as const;

type BillingEvent = {
  id: string;
  provider: string;
  providerEventId: string;
  referenceId: string;
  eventType: string;
  status: "PROCESSED" | "IGNORED" | "FAILED";
  payload: Record<string, unknown>;
  processedAt: string;
};

type TenantEstablishment = {
  tenantId: string;
  establishmentId: string;
};

type EnterpriseLead = {
  id: string;
  company: string;
  contact: string;
  email: string;
  phone: string | null;
  message: string | null;
  planCode: string;
  source: string;
  createdAt: string;
};

type SupplyType = "MEDICINE" | "VACCINE" | "DEWORMER" | "FEED" | "OTHER";
type SupplyStatus = "ACTIVE" | "INACTIVE";
type SupplyBatchStatus = "AVAILABLE" | "LOW_STOCK" | "EXPIRED" | "CONSUMED" | "DISCARDED";
type SupplyMovementType = "IN" | "OUT" | "ADJUSTMENT" | "DISCARD" | "RESERVED";

type Supply = {
  id: string;
  establishmentId: string;
  type: SupplyType;
  name: string;
  activeIngredient: string | null;
  presentation: string | null;
  unit: string;
  defaultDose: string | null;
  withdrawalPeriodDays: number | null;
  storageNotes: string | null;
  status: SupplyStatus;
  createdAt: string;
  updatedAt: string;
};

type SupplyBatch = {
  id: string;
  establishmentId: string;
  supplyId: string;
  batchNumber: string;
  quantityInitial: number;
  quantityAvailable: number;
  unit: string;
  expirationDate: string;
  purchaseDate: string | null;
  supplier: string | null;
  invoiceNumber: string | null;
  location: string | null;
  status: SupplyBatchStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type SupplyMovement = {
  id: string;
  establishmentId: string;
  supplyId: string;
  batchId: string;
  type: SupplyMovementType;
  quantity: number;
  unit: string;
  reason: string;
  relatedTaskId: string | null;
  relatedHealthEventId: string | null;
  relatedTraceabilityEventId: string | null;
  occurredAt: string;
  createdBy: string | null;
  createdAt: string;
};

type TraceabilityEventType =
  | "ASIGNACION_POTRERO"
  | "INSEMINACION"
  | "PREÑEZ_CONFIRMADA"
  | "VACUNACION_PENDIENTE"
  | "VACUNACION_REALIZADA"
  | "DESPARASITACION"
  | "TRATAMIENTO"
  | "PESAJE"
  | "TRASLADO"
  | "MUERTE"
  | "ENVIO_FRIGORIFICO"
  | "OBSERVACION";

type TaskStatus = "PENDING" | "IN_PROGRESS" | "DONE" | "CANCELLED" | "OVERDUE";
type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type TaskType =
  | "FIELD_CHECK"
  | "HEALTH"
  | "REPRODUCTION"
  | "BIRTH_FOLLOW_UP"
  | "PADDOCK_REVIEW"
  | "WEIGHING"
  | "MOVEMENT"
  | "ADMIN"
  | "VETERINARY"
  | "INFRASTRUCTURE";

type FieldTask = {
  id: string;
  establishmentId: string;
  title: string;
  description: string | null;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  assignedToUserId: string | null;
  assignedRole: string | null;
  paddockId: string | null;
  paddockName: string | null;
  animalId: string | null;
  earTag: string | null;
  source: "MANUAL" | "FIELD_COMMAND" | "SYSTEM_RULE" | "HEALTH_EVENT" | "REPRODUCTION_EVENT" | "TRACEABILITY_EVENT";
  sourceEventId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type ActivityFeedItem = {
  id: string;
  establishmentId: string;
  activityType:
    | "TASK_CREATED"
    | "TASK_UPDATED"
    | "TASK_COMPLETED"
    | "TRACEABILITY_EVENT_CREATED"
    | "HEALTH_EVENT_CREATED"
    | "REPRODUCTION_EVENT_CREATED"
    | "MOVEMENT_CREATED"
    | "PADDOCK_CREATED"
    | "REPORT_GENERATED"
    | "COMMAND_CONFIRMED";
  title: string;
  summary: string;
  occurredAt: string;
  priority: TaskPriority;
  status: "INFO" | "PENDING" | "DONE" | "WARNING" | "CRITICAL";
  sourceCollection: string;
  sourceId: string;
  earTag: string | null;
  paddockId: string | null;
  paddockName: string | null;
  createdAt: string;
};

type FieldConfirmation = {
  id: string;
  establishmentId: string;
  confirmationToken: string;
  intent: string;
  action: string;
  payload: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
  confirmedAt: string | null;
};

type TraceabilityCaptureSource = "MANUAL" | "COMANDO_IA" | "RFID" | "FOTO";

type TraceabilityEvent = {
  id: string;
  establishmentId: string;
  earTag: string;
  type: TraceabilityEventType;
  paddockId: string | null;
  paddockName: string | null;
  product: string | null;
  dose: string | null;
  weight: number | null;
  destination: string | null;
  notes: string | null;
  occurredAt: string;
  source: TraceabilityCaptureSource;
  createdBy: string | null;
  createdAt: string;
};

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin";
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const SESSION_COOKIE_NAME = "eg_session";
const SESSION_SECRET = process.env.SESSION_SECRET ?? "eg-dev-session-secret-change-me";
const BILLING_WEBHOOK_SECRET = process.env.BILLING_WEBHOOK_SECRET ?? "eg-dev-webhook-secret-change-me";
const DEMO_TRIAL_DAYS = 5;
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL ?? "https://ganaderia.linsse.com";
const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN ?? "";
const MERCADOPAGO_PUBLIC_KEY = process.env.MERCADOPAGO_PUBLIC_KEY ?? "";
const MERCADOPAGO_WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET ?? "";
const MERCADOPAGO_CURRENCY = process.env.MERCADOPAGO_CURRENCY ?? "UYU";
const MERCADOPAGO_COUNTRY = process.env.MERCADOPAGO_COUNTRY ?? "UY";
const MERCADOPAGO_SUCCESS_URL = process.env.MERCADOPAGO_SUCCESS_URL ?? `${PUBLIC_APP_URL}/pago/exitoso`;
const MERCADOPAGO_PENDING_URL = process.env.MERCADOPAGO_PENDING_URL ?? `${PUBLIC_APP_URL}/pago/pendiente`;
const MERCADOPAGO_FAILURE_URL = process.env.MERCADOPAGO_FAILURE_URL ?? `${PUBLIC_APP_URL}/pago/error`;
const MERCADOPAGO_NOTIFICATION_URL = process.env.MERCADOPAGO_NOTIFICATION_URL ?? `${PUBLIC_APP_URL}/api/proxy/webhooks/mercadopago`;
const MERCADOPAGO_PAYER_EMAIL_OVERRIDE = process.env.MERCADOPAGO_PAYER_EMAIL_OVERRIDE ?? "";
const DODO_PAYMENTS_API_KEY = process.env.DODO_PAYMENTS_API_KEY ?? "";
const DODO_PAYMENTS_ENVIRONMENT = process.env.DODO_PAYMENTS_ENVIRONMENT ?? "live_mode";
const DODO_PAYMENTS_API_BASE =
  DODO_PAYMENTS_ENVIRONMENT === "test_mode" ? "https://test.dodopayments.com" : "https://live.dodopayments.com";
const DODO_PAYMENTS_WEBHOOK_SECRET = process.env.DODO_PAYMENTS_WEBHOOK_SECRET ?? "";
const DODO_PAYMENTS_RETURN_URL = process.env.DODO_PAYMENTS_RETURN_URL ?? `${PUBLIC_APP_URL}/pago/exitoso`;
const DODO_BASIC_PRODUCT_ID = process.env.DODO_BASIC_PRODUCT_ID ?? "";
const DODO_PRO_PRODUCT_ID = process.env.DODO_PRO_PRODUCT_ID ?? "";
const DODO_BR_SEMESTRAL_PIX_PRODUCT_ID = process.env.DODO_BR_SEMESTRAL_PIX_PRODUCT_ID ?? "";
const DODO_BR_ANUAL_PIX_PRODUCT_ID = process.env.DODO_BR_ANUAL_PIX_PRODUCT_ID ?? "";
const PERPETUAL_ACCESS_EMAILS = new Set(
  (process.env.PERPETUAL_ACCESS_EMAILS ?? "ufernand853@gmail.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);
const DEMO_READONLY_EMAILS = new Set(["prueba@linsse.com"]);
const PLATFORM_ADMIN_EMAILS = new Set(["admin@linsse.com"]);
const READONLY_DEMO_MESSAGE = "Esta cuenta demo es solo lectura. Podes recorrer la plataforma, pero no modificar datos.";

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
    breeds: db.collection<BreedMaster>("breeds"),
    movementTypes: db.collection<MovementTypeMaster>("movement_types"),
    healthEvents: db.collection<HealthEvent>("health_events"),
    animals: db.collection<Animal>("animals"),
    animalPhotos: db.collection<AnimalPhoto>("animal_photos"),
    operationalEvents: db.collection<OperationalEvent>("operational_events"),
    reproductionEvents: db.collection<ReproductionEvent>("reproduction_events"),
    incidents: db.collection<FieldIncident>("field_incidents"),
    aiSettings: db.collection<AISettings>("settings"),
    confirmations: db.collection<ConfirmationRecord>("confirmations"),
    commandLogs: db.collection<CommandLog>("command_logs"),
    commandContext: db.collection<CommandContext & { _id: string }>("command_context"),
    aiBehaviors: db.collection<AIBehavior>("ai_behaviors"),
    tenants: db.collection<Tenant>("tenants"),
    users: db.collection<UserAccount>("users"),
    memberships: db.collection<Membership>("memberships"),
    accessLogs: db.collection<AccessLog>("access_logs"),
    demoActivityLogs: db.collection<DemoActivityLog>("demo_activity_logs"),
    subscriptionPlans: db.collection<SubscriptionPlan>("subscription_plans"),
    subscriptions: db.collection<Subscription>("subscriptions"),
    billingCheckouts: db.collection<BillingCheckout>("billing_checkouts"),
    billingEvents: db.collection<BillingEvent>("billing_events"),
    tenantEstablishments: db.collection<TenantEstablishment>("tenant_establishments"),
    enterpriseLeads: db.collection<EnterpriseLead>("enterprise_leads"),
    traceabilityEvents: db.collection<TraceabilityEvent>("traceability_events"),
    supplies: db.collection<Supply>("supplies"),
    supplyBatches: db.collection<SupplyBatch>("supply_batches"),
    supplyMovements: db.collection<SupplyMovement>("supply_movements"),
    tasks: db.collection<FieldTask>("tasks"),
    activityFeed: db.collection<ActivityFeedItem>("activity_feed"),
    fieldConfirmations: db.collection<FieldConfirmation>("field_confirmations"),
  };
};

const normalizeFieldText = (value: string) => value
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "")
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();

const priorityToActivityStatus = (priority: TaskPriority): ActivityFeedItem["status"] => {
  if (priority === "URGENT") return "CRITICAL";
  if (priority === "HIGH") return "WARNING";
  return "PENDING";
};

const appendActivityFeed = async (input: Omit<ActivityFeedItem, "id" | "createdAt">) => {
  const { activityFeed } = await getCollections();
  const now = new Date().toISOString();
  const item: ActivityFeedItem = {
    id: randomUUID(),
    createdAt: now,
    ...input,
  };
  await activityFeed.insertOne(item);
  return item;
};

const createFieldTask = async (input: z.input<typeof taskCreateSchema>) => {
  const { tasks } = await getCollections();
  const now = new Date().toISOString();
  const scheduledAt = input.scheduledAt ?? now;
  const dueDate = input.dueDate ?? scheduledAt;
  const task: FieldTask = {
    id: randomUUID(),
    establishmentId: input.establishmentId,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    type: input.type ?? "FIELD_CHECK",
    status: input.status ?? "PENDING",
    priority: input.priority ?? "MEDIUM",
    dueDate,
    scheduledAt,
    completedAt: null,
    assignedToUserId: input.assignedToUserId ?? null,
    assignedRole: input.assignedRole?.trim() || null,
    paddockId: input.paddockId ?? null,
    paddockName: input.paddockName?.trim() || null,
    animalId: input.animalId ?? null,
    earTag: input.earTag?.trim().toUpperCase() || null,
    source: input.source ?? "MANUAL",
    sourceEventId: input.sourceEventId ?? null,
    createdBy: input.createdBy?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
  await tasks.insertOne(task);
  await appendActivityFeed({
    establishmentId: task.establishmentId,
    activityType: "TASK_CREATED",
    title: `Tarea creada: ${task.title}`,
    summary: task.description ?? task.title,
    occurredAt: task.scheduledAt ?? task.dueDate ?? task.createdAt,
    priority: task.priority,
    status: priorityToActivityStatus(task.priority),
    sourceCollection: "tasks",
    sourceId: task.id,
    earTag: task.earTag,
    paddockId: task.paddockId,
    paddockName: task.paddockName,
  });
  return task;
};


const incidentPriority = (severity: IncidentSeverity): TaskPriority => {
  if (severity === "CRITICAL") return "URGENT";
  if (severity === "HIGH") return "HIGH";
  if (severity === "MEDIUM") return "MEDIUM";
  return "LOW";
};

const registerFieldIncident = async (input: {
  establishmentId: string;
  paddockId: string | null;
  title: string;
  description: string;
  severity: IncidentSeverity;
  observedAt?: string | Date | null;
  source?: FieldIncident["source"];
}) => {
  const now = new Date().toISOString();
  let paddockName: string | null = null;
  if (input.paddockId) {
    const paddock = await findPaddockById(input.paddockId);
    if (!paddock || paddock.establishmentId !== input.establishmentId) {
      throw new Error("PADDOCK_MISMATCH");
    }
    paddockName = paddock.name;
  }

  const observedAt = input.observedAt instanceof Date
    ? input.observedAt.toISOString()
    : input.observedAt ?? now;
  const incident: FieldIncident = {
    id: randomUUID(),
    establishmentId: input.establishmentId,
    paddockId: input.paddockId,
    title: input.title.trim(),
    description: input.description.trim(),
    severity: input.severity,
    status: "OPEN",
    observedAt,
    resolvedAt: null,
    mapX: null,
    mapY: null,
    source: input.source ?? "COMMAND",
    createdAt: now,
    updatedAt: now,
  };

  const { incidents } = await getCollections();
  await incidents.insertOne(incident);

  await appendActivityFeed({
    establishmentId: input.establishmentId,
    activityType: "REPORT_GENERATED",
    title: `Incidente registrado: ${incident.title}`,
    summary: incident.description,
    occurredAt: incident.observedAt,
    priority: incidentPriority(incident.severity),
    status: incident.severity === "CRITICAL" ? "CRITICAL" : "WARNING",
    sourceCollection: "field_incidents",
    sourceId: incident.id,
    earTag: null,
    paddockId: incident.paddockId,
    paddockName,
  });

  const task = await createFieldTask({
    establishmentId: input.establishmentId,
    title: `Revisar incidente: ${incident.title}`,
    description: incident.description,
    type: "VETERINARY",
    priority: incidentPriority(incident.severity),
    paddockId: incident.paddockId,
    paddockName,
    source: "FIELD_COMMAND",
    sourceEventId: incident.id,
  });

  return { incident, task };
};

const completeFieldTask = async (task: FieldTask, completedAt = new Date().toISOString(), notes?: string) => {
  const { tasks } = await getCollections();
  const description = notes ? `${task.description ?? ""}\nCierre: ${notes}`.trim() : task.description;
  const updated: FieldTask = {
    ...task,
    status: "DONE",
    completedAt,
    description,
    updatedAt: new Date().toISOString(),
  };
  await tasks.updateOne({ id: task.id }, { $set: updated });
  await appendActivityFeed({
    establishmentId: task.establishmentId,
    activityType: "TASK_COMPLETED",
    title: `Tarea hecha: ${task.title}`,
    summary: updated.description ?? task.title,
    occurredAt: completedAt,
    priority: task.priority,
    status: "DONE",
    sourceCollection: "tasks",
    sourceId: task.id,
    earTag: task.earTag,
    paddockId: task.paddockId,
    paddockName: task.paddockName,
  });
  return updated;
};

const resolveSupplyBatchStatus = (batch: Pick<SupplyBatch, "quantityAvailable" | "quantityInitial" | "expirationDate" | "status">): SupplyBatchStatus => {
  if (batch.status === "DISCARDED") return "DISCARDED";
  if (new Date(batch.expirationDate).getTime() < Date.now()) return "EXPIRED";
  if (batch.quantityAvailable <= 0) return "CONSUMED";
  if (batch.quantityAvailable <= Math.max(1, batch.quantityInitial * 0.15)) return "LOW_STOCK";
  return "AVAILABLE";
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildSupplyNotifications = (batches: Array<SupplyBatch & { supplyName?: string }>) => {
  const now = Date.now();
  const dayMs = 86400000;
  return batches
    .filter((batch) => batch.status !== "CONSUMED" && batch.status !== "DISCARDED" && batch.quantityAvailable > 0)
    .map((batch) => {
      const daysToExpire = Math.ceil((new Date(batch.expirationDate).getTime() - now) / dayMs);
      const isLowStock = batch.quantityAvailable <= Math.max(1, batch.quantityInitial * 0.15);
      if (daysToExpire < 0) {
        return { id: `expired-${batch.id}`, type: "SUPPLY_EXPIRED", severity: "CRITICAL", title: `${batch.supplyName ?? "Insumo"} vencido`, message: `Lote ${batch.batchNumber} vencido con ${batch.quantityAvailable} ${batch.unit} disponibles.`, dueDate: batch.expirationDate, sourceId: batch.id };
      }
      if (daysToExpire <= 7) {
        return { id: `expires-7-${batch.id}`, type: "SUPPLY_EXPIRING", severity: "CRITICAL", title: `${batch.supplyName ?? "Insumo"} vence en ${daysToExpire} día(s)`, message: `Lote ${batch.batchNumber}: ${batch.quantityAvailable} ${batch.unit} disponibles.`, dueDate: batch.expirationDate, sourceId: batch.id };
      }
      if (daysToExpire <= 15) {
        return { id: `expires-15-${batch.id}`, type: "SUPPLY_EXPIRING", severity: "WARNING", title: `${batch.supplyName ?? "Insumo"} vence pronto`, message: `Lote ${batch.batchNumber} vence en ${daysToExpire} día(s).`, dueDate: batch.expirationDate, sourceId: batch.id };
      }
      if (daysToExpire <= 30) {
        return { id: `expires-30-${batch.id}`, type: "SUPPLY_EXPIRING", severity: "INFO", title: `${batch.supplyName ?? "Insumo"} vence este mes`, message: `Lote ${batch.batchNumber} vence en ${daysToExpire} día(s).`, dueDate: batch.expirationDate, sourceId: batch.id };
      }
      if (isLowStock) {
        return { id: `low-${batch.id}`, type: "SUPPLY_LOW_STOCK", severity: "WARNING", title: `${batch.supplyName ?? "Insumo"} con stock bajo`, message: `Lote ${batch.batchNumber}: ${batch.quantityAvailable} ${batch.unit} disponibles.`, dueDate: batch.expirationDate, sourceId: batch.id };
      }
      return null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
};

const registerSupplyMovement = async (input: z.input<typeof supplyMovementCreateSchema>, relatedHealthEventId?: string) => {
  const { supplyBatches, supplyMovements } = await getCollections();
  const batch = await supplyBatches.findOne({ id: input.batchId, supplyId: input.supplyId, establishmentId: input.establishmentId });
  if (!batch) throw new Error("SUPPLY_BATCH_NOT_FOUND");
  if (batch.status === "EXPIRED" || new Date(batch.expirationDate).getTime() < Date.now()) throw new Error("SUPPLY_BATCH_EXPIRED");

  const quantity = input.quantity;
  let nextQuantity = batch.quantityAvailable;
  if (input.type === "OUT" || input.type === "RESERVED" || input.type === "DISCARD") {
    if (batch.quantityAvailable < quantity) throw new Error("INSUFFICIENT_SUPPLY_STOCK");
    nextQuantity = batch.quantityAvailable - quantity;
  } else if (input.type === "IN") {
    nextQuantity = batch.quantityAvailable + quantity;
  } else if (input.type === "ADJUSTMENT") {
    nextQuantity = quantity;
  }

  const now = new Date().toISOString();
  const nextStatus = resolveSupplyBatchStatus({ ...batch, quantityAvailable: nextQuantity });
  const movement: SupplyMovement = {
    id: randomUUID(),
    establishmentId: input.establishmentId,
    supplyId: input.supplyId,
    batchId: input.batchId,
    type: input.type,
    quantity,
    unit: input.unit ?? batch.unit,
    reason: input.reason.trim(),
    relatedTaskId: input.relatedTaskId ?? null,
    relatedHealthEventId: relatedHealthEventId ?? input.relatedHealthEventId ?? null,
    relatedTraceabilityEventId: input.relatedTraceabilityEventId ?? null,
    occurredAt: input.occurredAt ?? now,
    createdBy: input.createdBy?.trim() || null,
    createdAt: now,
  };
  await supplyMovements.insertOne(movement);
  await supplyBatches.updateOne({ id: batch.id }, { $set: { quantityAvailable: nextQuantity, status: nextStatus, updatedAt: now } });
  return movement;
};

const isTaskCreationPrompt = (normalized: string) => /\b(crea|crear|agendar|agenda|programar|programa|recordame|recordar|nueva|nuevo)\b/.test(normalized)
  && /\b(tarea|actividad|recordatorio|revisar|verificar|chequeo|recorrida|tacto|pesaje)\b/.test(normalized);

const extractTaskResponsibleFromText = (text: string) => {
  const match = text.match(/(?:responsable\s*(?:es|:)?|asignad[oa]\s+a|asignar\s+a|para)\s+([a-záéíóúñ][a-záéíóúñ\s.'-]{1,80}?)(?=\s+(?:en|del|de la|de el|para el|mañana|manana|hoy|a las|urgente|alta|media|baja)\b|[,.;]|$)/i);
  const responsible = match?.[1]
    ?.replace(/\s+/g, " ")
    .trim();
  return responsible || null;
};

const parseRelativeSchedule = (text: string) => {
  const normalized = normalizeFieldText(text);
  const now = new Date();
  const target = new Date(now);
  if (normalized.includes("manana")) {
    target.setDate(target.getDate() + 1);
  }
  const timeMatch = text.match(/(?:a las|hora|\b)(\d{1,2})(?::(\d{2}))?\s*(?:hs|h|horas)?/i);
  if (timeMatch) {
    target.setHours(Number(timeMatch[1]), Number(timeMatch[2] ?? 0), 0, 0);
  } else {
    target.setHours(8, 0, 0, 0);
  }
  if (normalized.includes("manana") || /\b\d{1,2}(?::\d{2})?\s*(hs|h|horas)\b/i.test(text) || /a las \d{1,2}/i.test(text)) {
    return target.toISOString();
  }
  return null;
};

const inferTaskPriority = (text: string): TaskPriority => {
  const normalized = normalizeFieldText(text);
  if (/\burgente\b|\bcritico\b|\bcrítica\b|\bcritica\b/.test(normalized)) return "URGENT";
  if (/\balta\b|\bimportante\b|\bvigil/.test(normalized)) return "HIGH";
  if (/\bbaja\b/.test(normalized)) return "LOW";
  return "MEDIUM";
};

const inferTaskType = (text: string): TaskType => {
  const normalized = normalizeFieldText(text);
  if (/vacun|sanidad|veterin|aftosa|brucel|tubercul/.test(normalized)) return "HEALTH";
  if (/parto|preñ|prenez|tacto|cria|cría/.test(normalized)) return "REPRODUCTION";
  if (/potrero|alambr|agua|bebedero|aguada|pastura/.test(normalized)) return "PADDOCK_REVIEW";
  if (/peso|pesaj/.test(normalized)) return "WEIGHING";
  if (/mover|traslad|rotacion|rotación/.test(normalized)) return "MOVEMENT";
  return "FIELD_CHECK";
};

const extractPaddockNameFromText = (text: string) => {
  const match = text.match(/potrero\s+([a-záéíóúñ0-9\- ]{1,60})/i);
  if (!match?.[1]) return null;
  const name = match[1].trim()
    .replace(/\s+(?:con(?:tra)?|para|de|y|o|sin|que)\b.*/i, "")
    .replace(/[.,;].*$/, "");
  return `Potrero ${name}`.trim();
};

const extractTaskTitle = (text: string) => {
  const cleaned = text
    .replace(/^(crear|crea|agendar|agenda|programar|programa|recordar|recordame)\s+(una\s+)?(tarea|actividad|recordatorio)?\s*/i, "")
    .replace(/^(urgente|importante|alta|media|baja)\s*:?\s*/i, "")
    .trim();
  return cleaned ? cleaned[0].toUpperCase() + cleaned.slice(1) : "Nueva tarea de campo";
};

const buildFieldConfirmation = async (input: Omit<FieldConfirmation, "id" | "createdAt" | "expiresAt" | "confirmedAt">) => {
  const { fieldConfirmations } = await getCollections();
  const now = new Date();
  const confirmation: FieldConfirmation = {
    id: randomUUID(),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
    confirmedAt: null,
    ...input,
  };
  await fieldConfirmations.insertOne(confirmation);
  return confirmation;
};

const buildDayStartSummary = async (establishmentId: string) => {
  const { animals, tasks, activityFeed, traceabilityEvents } = await getCollections();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [totalAnimals, pregnantFemales, pendingTasks, urgentTasks, recentActivities, recentEvents] = await Promise.all([
    animals.countDocuments({ establishmentId, status: "ACTIVO" }),
    traceabilityEvents.distinct("earTag", { establishmentId, type: "PREÑEZ_CONFIRMADA" }).then((items) => items.length),
    tasks.countDocuments({ establishmentId, status: { $in: ["PENDING", "IN_PROGRESS", "OVERDUE"] } }),
    tasks.countDocuments({ establishmentId, priority: "URGENT", status: { $in: ["PENDING", "IN_PROGRESS", "OVERDUE"] } }),
    activityFeed.find({ establishmentId }).sort({ occurredAt: -1 }).limit(10).toArray(),
    traceabilityEvents.find({ establishmentId }).sort({ occurredAt: -1 }).limit(5).toArray(),
  ]);
  return {
    kpis: { totalAnimals, pregnantFemales, pendingTasks, urgentTasks },
    recentActivities,
    recentEvents,
  };
};

const loadEstablishmentStockRows = async (establishmentId: string) => {
  const { paddocks, herds } = await getCollections();
  const paddockDocs = await paddocks.find({ establishmentId }).sort({ name: 1 }).toArray();
  const paddockById = new Map(paddockDocs.map((paddock) => [paddock.id, paddock]));
  const paddockIds = paddockDocs.map((paddock) => paddock.id);
  const stockRows = paddockIds.length
    ? await herds.find({ paddockId: { $in: paddockIds } }).toArray()
    : [];
  return { paddocks: paddockDocs, paddockById, stockRows };
};

const buildStockDetailAnswer = async (establishmentId: string) => {
  const { paddockById, stockRows } = await loadEstablishmentStockRows(establishmentId);
  if (!stockRows.length) {
    return "No hay stock cargado para este establecimiento.";
  }

  const total = stockRows.reduce((sum, row) => sum + row.count, 0);
  const byCategory = stockRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.category] = (acc[row.category] ?? 0) + row.count;
    return acc;
  }, {});
  const byPaddock = stockRows.reduce<Record<string, HerdStock[]>>((acc, row) => {
    const paddockName = paddockById.get(row.paddockId)?.name ?? "Potrero sin nombre";
    acc[paddockName] = [...(acc[paddockName] ?? []), row];
    return acc;
  }, {});

  const categoryLines = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => `• ${category}: ${count} cabeza${count === 1 ? "" : "s"}`)
    .join("\n");

  const paddockLines = Object.entries(byPaddock)
    .sort(([a], [b]) => a.localeCompare(b, "es"))
    .map(([paddock, rows]) => {
      const subtotal = rows.reduce((sum, row) => sum + row.count, 0);
      const detail = rows
        .sort((a, b) => a.category.localeCompare(b.category, "es"))
        .map((row) => `${row.category}: ${row.count}`)
        .join(" · ");
      return `• ${paddock}: ${subtotal} (${detail})`;
    })
    .join("\n");

  return [
    `Stock actual: ${total} cabeza${total === 1 ? "" : "s"}.`,
    "",
    "Por categoría:",
    categoryLines,
    "",
    "Por potrero:",
    paddockLines,
  ].join("\n");
};

const buildAnimalTagsDetailAnswer = async (establishmentId: string) => {
  const { animals, traceabilityEvents } = await getCollections();
  const animalDocs = await animals.find({ establishmentId }).sort({ status: 1, earTag: 1 }).limit(80).toArray();
  if (!animalDocs.length) {
    return "No hay caravanas individuales cargadas para este establecimiento.";
  }
  const earTags = animalDocs.map((animal) => animal.earTag);
  const latestEvents = await traceabilityEvents
    .find({ establishmentId, earTag: { $in: earTags } })
    .sort({ occurredAt: -1 })
    .toArray();
  const latestByEarTag = new Map<string, TraceabilityEvent>();
  for (const event of latestEvents) {
    if (!latestByEarTag.has(event.earTag)) latestByEarTag.set(event.earTag, event);
  }
  const active = animalDocs.filter((animal) => animal.status === "ACTIVO").length;
  const sold = animalDocs.filter((animal) => animal.status === "VENDIDO").length;
  const dead = animalDocs.filter((animal) => animal.status === "MUERTO").length;
  const lines = animalDocs.slice(0, 40).map((animal) => {
    const latest = latestByEarTag.get(animal.earTag);
    const lastEvent = latest ? ` · últ.: ${TRACEABILITY_EVENT_LABELS[latest.type] ?? latest.type}${latest.paddockName ? ` en ${latest.paddockName}` : ""}` : "";
    return `• ${animal.earTag} · ${animal.category ?? "sin categoría"} · ${animal.sex} · ${animal.status}${lastEvent}`;
  });
  const truncated = animalDocs.length > lines.length ? `\nMostrando ${lines.length} de ${animalDocs.length} caravanas. Usá una caravana específica para ver historial completo.` : "";
  return [`Detalle de caravanas: ${animalDocs.length} registradas (${active} activas, ${sold} vendidas, ${dead} muertas).`, "", ...lines, truncated].filter(Boolean).join("\n");
};

const buildAnimalTagsCountAnswer = async (establishmentId: string) => {
  const { animals } = await getCollections();
  const [total, active, sold, dead] = await Promise.all([
    animals.countDocuments({ establishmentId }),
    animals.countDocuments({ establishmentId, status: "ACTIVO" }),
    animals.countDocuments({ establishmentId, status: "VENDIDO" }),
    animals.countDocuments({ establishmentId, status: "MUERTO" }),
  ]);

  if (total === 0) {
    return "Tenés 0 caravanas individuales registradas para este establecimiento.";
  }

  return `Tenés ${total} caravana${total === 1 ? "" : "s"} registrada${total === 1 ? "" : "s"}: ${active} activa${active === 1 ? "" : "s"}, ${sold} vendida${sold === 1 ? "" : "s"} y ${dead} muerta${dead === 1 ? "" : "s"}.`;
};

const isAnimalTagsQuery = (normalized: string) =>
  /\b(caravana|caravanas|animal|animales)\b/.test(normalized)
  && /\b(cuant[oa]s?|cantidad|total|tengo|registrad[oa]s?|dame|mostrar|mostrame|ver|detalle|detallame|lista|listar)\b/.test(normalized);

const isAnimalTagsCountQuery = (normalized: string) =>
  /\b(cuant[oa]s?|cantidad|total|tengo)\b/.test(normalized)
  && /\b(caravana|caravanas|animal|animales)\b/.test(normalized);

const buildHerdDetailAnswer = async (establishmentId: string, establishmentName: string) => {
  const [{ animals, tasks, traceabilityEvents }, stockDetail] = await Promise.all([
    getCollections(),
    buildStockDetailAnswer(establishmentId),
  ]);
  const [activeAnimals, animalsByCategory, pregnantEarTags, pendingTasks, recentEvents] = await Promise.all([
    animals.countDocuments({ establishmentId, status: "ACTIVO" }),
    animals.aggregate([
      { $match: { establishmentId } },
      { $group: { _id: { $ifNull: ["$category", "Sin categoría"] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray(),
    traceabilityEvents.distinct("earTag", { establishmentId, type: "PREÑEZ_CONFIRMADA" }),
    tasks.find({ establishmentId, status: { $in: ["PENDING", "IN_PROGRESS", "OVERDUE"] } }).sort({ priority: -1, dueDate: 1, createdAt: -1 }).limit(5).toArray(),
    traceabilityEvents.find({ establishmentId }).sort({ occurredAt: -1 }).limit(5).toArray(),
  ]);

  const categoryLines = animalsByCategory.length
    ? animalsByCategory.map((row) => `• ${row._id}: ${row.count}`).join("\n")
    : "• Sin animales individuales categorizados.";
  const taskLines = pendingTasks.length
    ? pendingTasks.map((task) => `• ${task.priority}: ${task.title}${task.paddockName ? ` · ${task.paddockName}` : ""}`).join("\n")
    : "• Sin tareas pendientes.";
  const eventLines = recentEvents.length
    ? recentEvents.map((event) => `• ${event.earTag}: ${TRACEABILITY_EVENT_LABELS[event.type] ?? event.type}${event.paddockName ? ` · ${event.paddockName}` : ""}`).join("\n")
    : "• Sin eventos recientes.";

  return [
    `Detalle del rodeo de ${establishmentName}:`,
    `Animales activos: ${activeAnimals}. Preñadas registradas: ${pregnantEarTags.length}.`,
    "",
    "Composición por categoría individual:",
    categoryLines,
    "",
    stockDetail,
    "",
    "Tareas pendientes principales:",
    taskLines,
    "",
    "Últimos eventos de trazabilidad:",
    eventLines,
  ].join("\n");
};

const buildPregnantFemalesAnswer = async (establishmentId: string) => {
  const { traceabilityEvents } = await getCollections();
  const events = await traceabilityEvents
    .find({ establishmentId, type: "PREÑEZ_CONFIRMADA" })
    .sort({ occurredAt: -1 })
    .limit(200)
    .toArray();
  const latestByEarTag = new Map<string, TraceabilityEvent>();
  for (const event of events) {
    if (!latestByEarTag.has(event.earTag)) latestByEarTag.set(event.earTag, event);
  }
  const grouped = Array.from(latestByEarTag.values()).reduce<Record<string, TraceabilityEvent[]>>((acc, event) => {
    const key = event.paddockName ?? "Sin potrero";
    acc[key] = [...(acc[key] ?? []), event];
    return acc;
  }, {});
  if (!latestByEarTag.size) {
    return "No encontré hembras con preñez confirmada para este establecimiento.";
  }
  return `Tenés ${latestByEarTag.size} hembras preñadas:\n${Object.entries(grouped)
    .map(([paddock, items]) => `\n${paddock}: ${items.length} hembra${items.length === 1 ? "" : "s"}\n${items.map((item) => `• ${item.earTag}${item.notes ? ` · ${item.notes}` : ""}`).join("\n")}`)
    .join("\n")}`;
};

const buildDeathStatsAnswer = async (establishmentId: string, normalized: string) => {
  const { traceabilityEvents } = await getCollections();
  const now = new Date();
  let since: Date;
  let periodLabel: string;
  if (/este\s*a[nñ]o|a[nñ]o\s*actual/.test(normalized)) {
    since = new Date(now.getFullYear(), 0, 1);
    periodLabel = `este año (${now.getFullYear()})`;
  } else if (/esta\s*semana|ultimos?\s*7/.test(normalized)) {
    since = new Date(now);
    since.setDate(since.getDate() - 7);
    periodLabel = "los últimos 7 días";
  } else {
    since = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthName = now.toLocaleString("es-UY", { month: "long" });
    periodLabel = `este mes (${monthName})`;
  }
  const events = await traceabilityEvents.find({ establishmentId, type: "MUERTE", occurredAt: { $gte: since.toISOString() } }).sort({ occurredAt: -1 }).toArray();
  if (!events.length) return `No registré ninguna baja por muerte en ${periodLabel}.`;
  const byPaddock = events.reduce<Record<string, typeof events>>((acc, e) => {
    const key = e.paddockName ?? "Sin potrero";
    acc[key] = [...(acc[key] ?? []), e];
    return acc;
  }, {});
  const detail = Object.entries(byPaddock).map(([paddock, items]) => `${paddock}: ${items.length} baja${items.length === 1 ? "" : "s"} (${items.map((e) => e.earTag).join(", ")})`).join("; ");
  return `${events.length} baja${events.length === 1 ? "" : "s"} por muerte en ${periodLabel}. ${detail}.`;
};

const buildAnimalHistoryAnswer = async (establishmentId: string, earTag: string) => {
  const { traceabilityEvents, animals } = await getCollections();
  const [animal, events] = await Promise.all([
    animals.findOne({ establishmentId, earTag }),
    traceabilityEvents.find({ establishmentId, earTag }).sort({ occurredAt: -1 }).limit(10).toArray(),
  ]);
  if (!events.length && !animal) return `No encontré registros para la caravana ${earTag}.`;
  const statusLine = animal ? `Animal ${earTag}: estado ${animal.status}, categoría ${animal.category ?? "sin categoría"}${animal.birthDate ? `, nacido ${new Date(animal.birthDate).toLocaleDateString("es-UY")}` : ""}.` : `Caravana ${earTag} sin ficha de animal registrada.`;
  if (!events.length) return `${statusLine} Sin eventos de trazabilidad registrados.`;
  const eventLines = events.map((e) => `• ${new Date(e.occurredAt).toLocaleDateString("es-UY")} — ${TRACEABILITY_EVENT_LABELS[e.type] ?? e.type}${e.product ? ` (${e.product})` : ""}${e.weight ? ` ${e.weight} kg` : ""}${e.paddockName ? ` · ${e.paddockName}` : ""}`).join("\n");
  return `${statusLine}\nÚltimos ${events.length} eventos:\n${eventLines}`;
};

const ensureSystemTaskForTraceabilityEvent = async (event: TraceabilityEvent) => {
  if (event.type === "MUERTE") {
    await createFieldTask({
      establishmentId: event.establishmentId,
      title: `Verificar ${event.paddockName ?? "potrero"} por baja`,
      description: `Baja por muerte de ${event.earTag}. Revisar causa, agua, alambrados y otros animales del lote.`,
      type: "PADDOCK_REVIEW",
      priority: "URGENT",
      paddockId: event.paddockId,
      paddockName: event.paddockName,
      earTag: event.earTag,
      source: "TRACEABILITY_EVENT",
      sourceEventId: event.id,
    });
  }
};

const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
};

const verifyPassword = (password: string, hash: string) => {
  const [salt, expectedHex] = hash.split(":");
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const current = scryptSync(password, salt, 64);
  if (expected.length !== current.length) return false;
  return timingSafeEqual(expected, current);
};

const signSessionToken = (payload: { userId: string; tenantId: string; role: Membership["role"] }) =>
  jwt.sign(payload, SESSION_SECRET, { algorithm: "HS256", expiresIn: "8h" });

const verifySessionToken = (token: string) => {
  try {
    return jwt.verify(token, SESSION_SECRET) as { userId: string; tenantId: string; role: Membership["role"] };
  } catch {
    return null;
  }
};

const parseCookies = (cookieHeader?: string) => {
  if (!cookieHeader) return new Map<string, string>();
  return new Map(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...rest] = part.split("=");
        return [key, decodeURIComponent(rest.join("="))];
      }),
  );
};

const getSessionFromRequest = async (request: { headers: Record<string, unknown> }) => {
  const cookies = parseCookies(typeof request.headers.cookie === "string" ? request.headers.cookie : undefined);
  const token = cookies.get(SESSION_COOKIE_NAME);
  if (!token) return null;
  const claims = verifySessionToken(token);
  if (!claims) return null;
  const { users, memberships, subscriptions } = await getCollections();
  const [user, membership, subscription] = await Promise.all([
    users.findOne({ id: claims.userId, status: "ACTIVE" }),
    memberships.findOne({ userId: claims.userId, tenantId: claims.tenantId }),
    subscriptions.findOne({ tenantId: claims.tenantId }, { sort: { updatedAt: -1 } }),
  ]);
  if (!user || !membership || !subscription) return null;
  return { user, membership, subscription };
};

const isTrackedDemoEmail = (email: string) => DEMO_READONLY_EMAILS.has(email.toLowerCase());

const isReadOnlyDemoSession = (session: NonNullable<Awaited<ReturnType<typeof getSessionFromRequest>>>) =>
  session.membership.role === "READONLY" || isTrackedDemoEmail(session.user.email);

const getRequestPath = (request: { url?: string; routeOptions?: { url?: string } }) =>
  request.routeOptions?.url ?? request.url?.split("?")[0] ?? "/";

const getRequestIp = (request: { headers: Record<string, unknown>; ip?: string }) => {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return request.ip ?? null;
};

const getRequestUserAgent = (request: { headers: Record<string, unknown> }) =>
  typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null;

const buildDemoActivityAction = (path: string, method: string) => {
  const normalizedMethod = method.toUpperCase();
  if (path.startsWith("/dashboard")) return normalizedMethod === "GET" ? "DASHBOARD_VIEW" : "DASHBOARD_MUTATION_ATTEMPT";
  if (path.startsWith("/traceability")) return normalizedMethod === "GET" ? "TRACEABILITY_VIEW" : "TRACEABILITY_MUTATION_ATTEMPT";
  if (path.startsWith("/animals")) return normalizedMethod === "GET" ? "ANIMAL_VIEW" : "ANIMAL_MUTATION_ATTEMPT";
  if (path.startsWith("/commands")) return normalizedMethod === "GET" ? "AI_VIEW" : "AI_ACTION_ATTEMPT";
  if (path.startsWith("/supplies")) return normalizedMethod === "GET" ? "SUPPLY_VIEW" : "SUPPLY_MUTATION_ATTEMPT";
  if (path.startsWith("/tasks")) return normalizedMethod === "GET" ? "TASK_VIEW" : "TASK_MUTATION_ATTEMPT";
  if (path.startsWith("/health")) return normalizedMethod === "GET" ? "HEALTH_VIEW" : "HEALTH_MUTATION_ATTEMPT";
  if (path.startsWith("/paddocks")) return normalizedMethod === "GET" ? "PADDOCK_VIEW" : "PADDOCK_MUTATION_ATTEMPT";
  if (path.startsWith("/auth")) return "AUTH_FLOW";
  return `${normalizedMethod}_${path.replace(/[/:]/g, "_").replace(/^_+|_+$/g, "").toUpperCase() || "ROOT"}`;
};

const shouldTraceDemoActivity = (path: string) =>
  !path.startsWith("/auth/session")
  && !path.startsWith("/auth/logout")
  && !path.startsWith("/admin/")
  && !path.startsWith("/public/")
  && path !== "/health";

const appendAccessLog = async (entry: Omit<AccessLog, "id" | "createdAt">) => {
  const { accessLogs } = await getCollections();
  await accessLogs.insertOne({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry,
  });
};

const appendDemoActivityLog = async (entry: Omit<DemoActivityLog, "id" | "createdAt">) => {
  const { demoActivityLogs } = await getCollections();
  await demoActivityLogs.insertOne({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry,
  });
};

app.addHook("preHandler", async (request, reply) => {
  const method = request.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return;
  const path = getRequestPath(request);
  if (path === "/auth/logout") return;
  const session = await getSessionFromRequest(request);
  if (!session || !isReadOnlyDemoSession(session)) return;
  return reply.status(403).send({ code: "READ_ONLY_DEMO", message: READONLY_DEMO_MESSAGE });
});

app.addHook("onResponse", async (request, reply) => {
  if (request.method.toUpperCase() === "OPTIONS") return;
  const path = getRequestPath(request);
  if (!shouldTraceDemoActivity(path)) return;
  const session = await getSessionFromRequest(request);
  if (!session || !isTrackedDemoEmail(session.user.email)) return;
  await appendDemoActivityLog({
    email: session.user.email,
    userId: session.user.id,
    tenantId: session.membership.tenantId,
    role: session.membership.role,
    method: request.method.toUpperCase(),
    path,
    action: buildDemoActivityAction(path, request.method),
    statusCode: reply.statusCode,
    blocked: reply.statusCode === 403,
    ip: getRequestIp(request),
    userAgent: getRequestUserAgent(request),
    message: reply.statusCode === 403 ? READONLY_DEMO_MESSAGE : null,
  });
});

const resolveSubscriptionStatus = (subscription: Subscription) => {
  const now = new Date();
  const periodEnd = new Date(subscription.currentPeriodEnd);
  if (subscription.status === "CANCELLED" || subscription.status === "EXPIRED") {
    return { canAccess: false, statusLabel: "EXPIRED" as const, daysLeft: 0 };
  }
  if (periodEnd < now) {
    if (subscription.graceUntil && new Date(subscription.graceUntil) > now) {
      const daysLeft = Math.max(0, Math.ceil((new Date(subscription.graceUntil).getTime() - now.getTime()) / 86400000));
      return { canAccess: true, statusLabel: "GRACE" as const, daysLeft };
    }
    return { canAccess: false, statusLabel: "EXPIRED" as const, daysLeft: 0 };
  }
  const daysLeft = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / 86400000));
  return { canAccess: true, statusLabel: subscription.status, daysLeft };
};

const hasPerpetualAccess = (email: string) => PERPETUAL_ACCESS_EMAILS.has(email.toLowerCase());

const isMercadoPagoConfigured = () => Boolean(MERCADOPAGO_ACCESS_TOKEN);
const isDodoConfigured = () => Boolean(DODO_PAYMENTS_API_KEY);

const buildPublicUrl = (path: string) => new URL(path, PUBLIC_APP_URL).toString();

const getDodoProductIdForPlan = (planCode: string) => {
  switch (planCode) {
    case "BASIC":
      return DODO_BASIC_PRODUCT_ID;
    case "PRO":
      return DODO_PRO_PRODUCT_ID;
    case "BR_SEMESTRAL_PIX":
      return DODO_BR_SEMESTRAL_PIX_PRODUCT_ID;
    case "BR_ANUAL_PIX":
      return DODO_BR_ANUAL_PIX_PRODUCT_ID;
    default:
      return "";
  }
};

const resolveAvailableProviders = (plan: Pick<SubscriptionPlan, "code" | "currency" | "isDemo">) => {
  if (plan.isDemo || plan.code === "ENTERPRISE") return [] as ("mercadopago" | "dodo")[];
  if (plan.currency === "BRL") {
    return ["mercadopago", "dodo"] as ("mercadopago" | "dodo")[];
  }
  return isDodoConfigured() ? (["mercadopago", "dodo"] as ("mercadopago" | "dodo")[]) : (["mercadopago"] as ("mercadopago" | "dodo")[]);
};

const resolveDefaultProvider = (plan: Pick<SubscriptionPlan, "currency">, availableProviders: ("mercadopago" | "dodo")[]) => {
  if (!availableProviders.length) return null;
  if (plan.currency === "BRL" && availableProviders.includes("mercadopago")) return "mercadopago";
  return availableProviders[0] ?? null;
};

const mapMercadoPagoStatus = (status: string | null | undefined): Subscription["status"] => {
  switch (status) {
    case "authorized":
      return "ACTIVE";
    case "paused":
    case "rejected":
      return "PAST_DUE";
    case "cancelled":
    case "canceled":
      return "CANCELLED";
    case "pending":
    default:
      return "PENDING";
  }
};

const mercadoPagoRequest = async <T>(path: string, options: { method?: string; body?: Record<string, unknown> } = {}) => {
  if (!MERCADOPAGO_ACCESS_TOKEN) {
    throw new Error("Mercado Pago no está configurado.");
  }

  const response = await fetch(`https://api.mercadopago.com${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof data === "object" && data && "message" in data
        ? String((data as { message?: string }).message)
        : "Mercado Pago rechazó la solicitud.";
    throw new Error(message);
  }

  return data as T;
};

type MercadoPagoPreapproval = {
  id: string;
  status: string;
  external_reference?: string;
  init_point?: string | null;
  sandbox_init_point?: string | null;
  next_payment_date?: string | null;
};

const getMercadoPagoCheckoutUrl = (subscription: MercadoPagoPreapproval) => {
  const isTestCredential = MERCADOPAGO_ACCESS_TOKEN.startsWith("TEST-");
  if (isTestCredential) {
    return subscription.sandbox_init_point ?? subscription.init_point ?? null;
  }
  return subscription.init_point ?? subscription.sandbox_init_point ?? null;
};

const createMercadoPagoSubscription = async (input: {
  referenceId: string;
  companyName: string;
  email: string;
  plan: SubscriptionPlan;
}) => {
  const amount = Number((input.plan.amountCents / 100).toFixed(2));
  if (!amount || amount <= 0) {
    throw new Error("El plan seleccionado no tiene precio mensual automático.");
  }

  const payerEmail = MERCADOPAGO_PAYER_EMAIL_OVERRIDE || input.email;
  const body = {
    reason: `${input.plan.name} - ${input.companyName}`,
    external_reference: input.referenceId,
    payer_email: payerEmail,
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: amount,
      currency_id: input.plan.currency || MERCADOPAGO_CURRENCY,
    },
    back_url: MERCADOPAGO_SUCCESS_URL || buildPublicUrl("/pago/exitoso"),
    status: "pending",
    notification_url: MERCADOPAGO_NOTIFICATION_URL || buildPublicUrl("/api/proxy/webhooks/mercadopago"),
  };

  return mercadoPagoRequest<MercadoPagoPreapproval>("/preapproval", { method: "POST", body });
};

const fetchMercadoPagoSubscription = async (preapprovalId: string) =>
  mercadoPagoRequest<MercadoPagoPreapproval>(`/preapproval/${encodeURIComponent(preapprovalId)}`);

type DodoCheckoutSession = {
  session_id?: string;
  checkout_url?: string | null;
  customer_id?: string | null;
  payment_id?: string | null;
  subscription_id?: string | null;
};

const dodoRequest = async <T>(path: string, options: { method?: string; body?: Record<string, unknown> } = {}) => {
  if (!DODO_PAYMENTS_API_KEY) {
    throw new Error("Dodo Payments no está configurado.");
  }

  const response = await fetch(`${DODO_PAYMENTS_API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${DODO_PAYMENTS_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof data === "object" && data && "message" in data
        ? String((data as { message?: string }).message)
        : "Dodo Payments rechazó la solicitud.";
    throw new Error(message);
  }

  return data as T;
};

const createDodoCheckout = async (input: {
  referenceId: string;
  companyName: string;
  email: string;
  fullName: string;
  plan: SubscriptionPlan;
}) => {
  const productId = getDodoProductIdForPlan(input.plan.code);
  if (!productId) {
    throw new Error(`Falta configurar el producto de Dodo para el plan ${input.plan.code}.`);
  }

  const body: Record<string, unknown> = {
    product_cart: [{ product_id: productId, quantity: 1 }],
    billing_currency: input.plan.currency,
    return_url: DODO_PAYMENTS_RETURN_URL,
    customer: {
      email: input.email,
      name: input.fullName,
    },
    metadata: {
      referenceId: input.referenceId,
      planCode: input.plan.code,
      companyName: input.companyName,
      source: "establecimiento-ganadero",
    },
    allowed_payment_method_types:
      input.plan.currency === "BRL" ? ["pix", "credit", "debit"] : ["credit", "debit"],
  };

  return dodoRequest<DodoCheckoutSession>("/checkouts", { method: "POST", body });
};

const ensureDefaultPlans = async () => {
  const { subscriptionPlans } = await getCollections();
  const defaultPlans: SubscriptionPlan[] = [
    {
      id: randomUUID(),
      code: "BASIC",
      name: "Plan Básico",
      billingPeriodDays: 30,
      amountCents: 76050,
      currency: "UYU",
      trialDays: 0,
      isDemo: false,
      active: true,
      animalLimit: 250,
      description: "Ideal para ordenar el establecimiento, registrar movimientos y empezar a trabajar con trazabilidad digital.",
      ctaLabel: "Contratar",
      featureList: ["Hasta 250 animales", "Modo campo y modo gestión", "Trazabilidad por caravana", "Soporte comercial por WhatsApp"],
      sortOrder: 10,
    },
    {
      id: randomUUID(),
      code: "PRO",
      name: "Plan Pro",
      billingPeriodDays: 30,
      amountCents: 388050,
      currency: "UYU",
      trialDays: 0,
      isDemo: false,
      active: true,
      animalLimit: 1000,
      description: "Pensado para operaciones que necesitan más control, más seguimiento y mejor lectura del negocio en tiempo real.",
      ctaLabel: "Contratar",
      featureList: ["Hasta 1000 animales", "Sanidad, insumos y tareas programadas", "Trazabilidad con historial por caravana", "Alertas y reportes operativos"],
      sortOrder: 20,
    },
    {
      id: randomUUID(),
      code: "BR_PRO_MENSAL",
      name: "Plano Pro Brasil",
      billingPeriodDays: 30,
      amountCents: 79900,
      currency: "BRL",
      trialDays: 0,
      isDemo: false,
      active: true,
      animalLimit: 1000,
      description: "Assinatura mensal para o mercado brasileiro com cobranca recorrente e checkout local.",
      ctaLabel: "Assinar",
      featureList: ["Ate 1000 animais", "Sanidade, insumos e tarefas programadas", "Rastreabilidade com historico por brinco", "Checkout Brasil com recorrencia"],
      sortOrder: 22,
    },
    {
      id: randomUUID(),
      code: "BR_SEMESTRAL_PIX",
      name: "Plano Semestral Pix",
      billingPeriodDays: 180,
      amountCents: 419400,
      currency: "BRL",
      trialDays: 0,
      isDemo: false,
      active: true,
      animalLimit: 1000,
      description: "Pagamento semestral para clientes do Brasil com Pix e renovacao manual.",
      ctaLabel: "Contratar com Pix",
      featureList: ["6 meses prepagos", "Pix, cartao de credito ou debito", "Renovacao manual", "Ate 1000 animais"],
      sortOrder: 23,
    },
    {
      id: randomUUID(),
      code: "BR_ANUAL_PIX",
      name: "Plano Anual Pix",
      billingPeriodDays: 365,
      amountCents: 799000,
      currency: "BRL",
      trialDays: 0,
      isDemo: false,
      active: true,
      animalLimit: 1000,
      description: "Pagamento anual para clientes do Brasil com Pix e renovacao manual.",
      ctaLabel: "Contratar com Pix",
      featureList: ["12 meses prepagos", "Pix, cartao de credito ou debito", "Renovacao manual", "Ate 1000 animais"],
      sortOrder: 24,
    },
    {
      id: randomUUID(),
      code: "ENTERPRISE",
      name: "Plan Empresa",
      billingPeriodDays: 30,
      amountCents: 0,
      currency: "UYU",
      trialDays: 0,
      isDemo: false,
      active: true,
      animalLimit: null,
      description: "Para empresas que buscan una implementación acompañada, integraciones y una propuesta comercial a medida.",
      ctaLabel: "Solicitar demo",
      featureList: ["Animales ilimitados", "Integraciones y acompañamiento", "Configuración operativa a medida", "Prioridad de soporte"],
      sortOrder: 30,
    },
    {
      id: randomUUID(),
      code: "DEMO_5D",
      name: "Demo 5 días",
      billingPeriodDays: DEMO_TRIAL_DAYS,
      amountCents: 0,
      currency: "UYU",
      trialDays: DEMO_TRIAL_DAYS,
      isDemo: true,
      active: true,
      animalLimit: 50,
      description: "Demo breve para validar el flujo operativo antes de contratar.",
      ctaLabel: "Probar demo",
      featureList: ["Acceso temporal", "Carga de prueba", "Modo campo y gestión"],
      sortOrder: 5,
    },
  ];

  for (const plan of defaultPlans) {
    const existingPlan = await subscriptionPlans.findOne<{ amountCents?: number }>({ code: plan.code }, { projection: { amountCents: 1 } });
    const resolvedAmountCents = typeof existingPlan?.amountCents === "number" ? existingPlan.amountCents : plan.amountCents;
    await subscriptionPlans.updateOne(
      { code: plan.code },
      {
        $set: {
          name: plan.name,
          billingPeriodDays: plan.billingPeriodDays,
          amountCents: resolvedAmountCents,
          currency: plan.currency,
          trialDays: plan.trialDays,
          isDemo: plan.isDemo,
          active: plan.active,
          animalLimit: plan.animalLimit,
          description: plan.description,
          ctaLabel: plan.ctaLabel,
          featureList: plan.featureList,
          sortOrder: plan.sortOrder,
        },
        $setOnInsert: { id: plan.id },
      },
      { upsert: true },
    );
  }
};

const ensureDefaultHerdCategories = async (establishmentId: string, nowIso = new Date().toISOString()) => {
  const { herdCategories } = await getCollections();
  for (const name of DEFAULT_HERD_CATEGORY_NAMES) {
    await herdCategories.updateOne(
      { establishmentId, name },
      {
        $set: { status: "ACTIVE", updatedAt: nowIso },
        $setOnInsert: { id: randomUUID(), establishmentId, name, createdAt: nowIso },
      },
      { upsert: true },
    );
  }
};

const ensureDefaultBreeds = async (establishmentId: string, nowIso = new Date().toISOString()) => {
  const { breeds } = await getCollections();
  for (const name of DEFAULT_BREED_NAMES) {
    await breeds.updateOne(
      { establishmentId, name },
      {
        $set: { status: "ACTIVE", updatedAt: nowIso },
        $setOnInsert: { id: randomUUID(), establishmentId, name, createdAt: nowIso },
      },
      { upsert: true },
    );
  }
};

const ensureDefaultMovementTypes = async (establishmentId: string, nowIso = new Date().toISOString()) => {
  const { movementTypes } = await getCollections();
  for (const name of DEFAULT_MOVEMENT_TYPE_NAMES) {
    await movementTypes.updateOne(
      { establishmentId, name },
      {
        $set: { status: "ACTIVE", updatedAt: nowIso },
        $setOnInsert: { id: randomUUID(), establishmentId, name, createdAt: nowIso },
      },
      { upsert: true },
    );
  }
};

const ensureEstablishmentMasters = async (establishmentId: string, nowIso = new Date().toISOString()) => {
  const { consignors, slaughterhouses } = await getCollections();
  await Promise.all([
    ensureDefaultHerdCategories(establishmentId, nowIso),
    ensureDefaultBreeds(establishmentId, nowIso),
    ensureDefaultMovementTypes(establishmentId, nowIso),
    consignors.updateOne(
      { establishmentId, name: "Consignatario base" },
      {
        $set: { status: "ACTIVE", updatedAt: nowIso },
        $setOnInsert: {
          id: randomUUID(),
          establishmentId,
          name: "Consignatario base",
          address: null,
          contactName: null,
          phone: null,
          email: null,
          notes: "Carga inicial automática.",
          createdAt: nowIso,
        },
      },
      { upsert: true },
    ),
    slaughterhouses.updateOne(
      { establishmentId, name: "Frigorifico base" },
      {
        $set: { status: "ACTIVE", updatedAt: nowIso },
        $setOnInsert: {
          id: randomUUID(),
          establishmentId,
          name: "Frigorifico base",
          address: null,
          contactName: null,
          phone: null,
          email: null,
          notes: "Carga inicial automática.",
          createdAt: nowIso,
        },
      },
      { upsert: true },
    ),
  ]);
};

const TEST_TENANT_ID = "test-tenant";
const TEST_ESTABLISHMENT_ID = "00000000-0000-4000-8000-000000000301";
const TEST_USERS: Array<{ email: string; fullName: string; password: string; role: Membership["role"] }> = [
  { email: "admin@linsse.com", fullName: "Administrador General", password: "Ulifer853$", role: "OWNER" },
  { email: "marula@linsse.com", fullName: "Marula", password: "marula1234", role: "ADMIN" },
  { email: "prueba@linsse.com", fullName: "Usuario de Prueba", password: "prueba1234", role: "READONLY" },
];

const TEST_PADDOCK_SEED = [
  { id: "00000000-0000-4000-8000-000000000401", name: "Potrero Norte" },
  { id: "00000000-0000-4000-8000-000000000402", name: "Potrero Sur" },
  { id: "00000000-0000-4000-8000-000000000403", name: "Potrero Riego" },
] as const;

const TEST_HERD_SEED = [
  { paddockId: "00000000-0000-4000-8000-000000000401", category: "VACAS DE CRIA", count: 95 },
  { paddockId: "00000000-0000-4000-8000-000000000401", category: "TERNEROS", count: 44 },
  { paddockId: "00000000-0000-4000-8000-000000000402", category: "VAQUILLONAS", count: 68 },
  { paddockId: "00000000-0000-4000-8000-000000000403", category: "NOVILLOS", count: 58 },
] as const;

const TEST_SUPPLY_SEED = [
  {
    id: "00000000-0000-4000-8000-000000000501",
    batchId: "00000000-0000-4000-8000-000000000601",
    type: "VACCINE" as const,
    name: "Vacuna aftosa",
    activeIngredient: "Antigeno aftosa",
    unit: "dosis",
    batchNumber: "AFT-LINSSE-01",
    quantity: 180,
    expirationDate: new Date(Date.now() + 120 * 86400000).toISOString(),
  },
  {
    id: "00000000-0000-4000-8000-000000000502",
    batchId: "00000000-0000-4000-8000-000000000602",
    type: "DEWORMER" as const,
    name: "Ivermectina",
    activeIngredient: "Ivermectina",
    unit: "ml",
    batchNumber: "IVM-LINSSE-01",
    quantity: 900,
    expirationDate: new Date(Date.now() + 90 * 86400000).toISOString(),
  },
  {
    id: "00000000-0000-4000-8000-000000000503",
    batchId: "00000000-0000-4000-8000-000000000603",
    type: "MEDICINE" as const,
    name: "Antibiotico LA",
    activeIngredient: "Oxitetraciclina",
    unit: "ml",
    batchNumber: "ATB-LINSSE-01",
    quantity: 450,
    expirationDate: new Date(Date.now() + 180 * 86400000).toISOString(),
  },
] as const;

const TEST_CONSIGNOR_SEED = [
  {
    id: "00000000-0000-4000-8000-000000000701",
    name: "Consignataria del Norte",
    contactName: "Lucia Pereira",
    phone: "+598 98 111 222",
    email: "lucia@consignatariadelnorte.com",
  },
  {
    id: "00000000-0000-4000-8000-000000000702",
    name: "Ganados del Sur",
    contactName: "Martin Reyes",
    phone: "+598 98 333 444",
    email: "martin@ganadosdelsur.com",
  },
] as const;

const TEST_SLAUGHTERHOUSE_SEED = [
  {
    id: "00000000-0000-4000-8000-000000000801",
    name: "Frigorifico San Miguel",
    contactName: "Valeria Gomez",
    phone: "+598 98 555 666",
    email: "operaciones@sanmiguel.com",
  },
  {
    id: "00000000-0000-4000-8000-000000000802",
    name: "Frigorifico La Campina",
    contactName: "Joaquin Silva",
    phone: "+598 98 777 888",
    email: "faena@lacampina.com",
  },
] as const;

const TEST_ANIMAL_SEED = [
  {
    id: "00000000-0000-4000-8000-000000000901",
    earTag: "858001001001",
    name: "Caravana 858001001001",
    sex: "HEMBRA" as const,
    category: "VACAS DE CRIA",
    birthDate: new Date(Date.now() - 1900 * 86400000).toISOString(),
    notes: "Preñez confirmada y seguimiento sanitario al dia.",
  },
  {
    id: "00000000-0000-4000-8000-000000000902",
    earTag: "858001001045",
    name: "Caravana 858001001045",
    sex: "MACHO" as const,
    category: "NOVILLOS",
    birthDate: new Date(Date.now() - 540 * 86400000).toISOString(),
    notes: "Pesaje reciente en Potrero Riego.",
  },
  {
    id: "00000000-0000-4000-8000-000000000903",
    earTag: "858001001078",
    name: "Caravana 858001001078",
    sex: "HEMBRA" as const,
    category: "VAQUILLONAS",
    birthDate: new Date(Date.now() - 820 * 86400000).toISOString(),
    notes: "Lote de recria con vacunacion completa.",
  },
] as const;

const TEST_TRACEABILITY_SEED = [
  {
    id: "00000000-0000-4000-8000-000000001001",
    earTag: "858001001001",
    type: "PREÑEZ_CONFIRMADA" as const,
    paddockId: "00000000-0000-4000-8000-000000000401",
    paddockName: "Potrero Norte",
    product: null,
    dose: null,
    weight: null,
    notes: "Diagnostico positivo por ecografia.",
    occurredAt: new Date(Date.now() - 15 * 86400000).toISOString(),
  },
  {
    id: "00000000-0000-4000-8000-000000001002",
    earTag: "858001001045",
    type: "PESAJE" as const,
    paddockId: "00000000-0000-4000-8000-000000000403",
    paddockName: "Potrero Riego",
    product: null,
    dose: null,
    weight: 386,
    notes: "Pesaje de control mensual.",
    occurredAt: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
  {
    id: "00000000-0000-4000-8000-000000001003",
    earTag: "858001001078",
    type: "VACUNACION_REALIZADA" as const,
    paddockId: "00000000-0000-4000-8000-000000000402",
    paddockName: "Potrero Sur",
    product: "Aftosa",
    dose: "1 dosis",
    weight: null,
    notes: "Campaña sanitaria del lote.",
    occurredAt: new Date(Date.now() - 12 * 86400000).toISOString(),
  },
] as const;

const ensureTestDemoData = async (nowIso = new Date().toISOString()) => {
  const {
    establishments,
    tenantEstablishments,
    paddocks,
    herds,
    herdCategories,
    supplies,
    supplyBatches,
    supplyMovements,
    consignors,
    slaughterhouses,
    animals,
    traceabilityEvents,
    tasks,
    healthEvents,
  } = await getCollections();

  await establishments.updateOne(
    { id: TEST_ESTABLISHMENT_ID },
    {
      $set: {
        name: "Estancia La Esperanza",
        timezone: "UTC-3",
        mapImageUrl: null,
        updatedAt: nowIso,
      },
      $setOnInsert: { id: TEST_ESTABLISHMENT_ID, createdAt: nowIso },
    },
    { upsert: true },
  );

  await tenantEstablishments.deleteMany({ tenantId: TEST_TENANT_ID, establishmentId: { $ne: TEST_ESTABLISHMENT_ID } });
  await tenantEstablishments.updateOne(
    { tenantId: TEST_TENANT_ID, establishmentId: TEST_ESTABLISHMENT_ID },
    { $set: { tenantId: TEST_TENANT_ID, establishmentId: TEST_ESTABLISHMENT_ID } },
    { upsert: true },
  );

  await ensureDefaultHerdCategories(TEST_ESTABLISHMENT_ID, nowIso);
  for (const name of ["VACAS DE CRIA", "VAQUILLONAS", "TERNEROS", "NOVILLOS"]) {
    await herdCategories.updateOne(
      { establishmentId: TEST_ESTABLISHMENT_ID, name },
      {
        $set: { status: "ACTIVE", updatedAt: nowIso },
        $setOnInsert: { id: randomUUID(), establishmentId: TEST_ESTABLISHMENT_ID, name, createdAt: nowIso },
      },
      { upsert: true },
    );
  }

  for (const paddock of TEST_PADDOCK_SEED) {
    await paddocks.updateOne(
      { id: paddock.id },
      {
        $set: {
          establishmentId: TEST_ESTABLISHMENT_ID,
          name: paddock.name,
          updatedAt: nowIso,
        },
        $setOnInsert: { id: paddock.id, createdAt: nowIso },
      },
      { upsert: true },
    );
  }

  for (const herdRow of TEST_HERD_SEED) {
    await herds.updateOne(
      { paddockId: herdRow.paddockId, category: herdRow.category },
      { $set: { count: herdRow.count, updatedAt: nowIso } },
      { upsert: true },
    );
  }

  for (const supply of TEST_SUPPLY_SEED) {
    await supplies.updateOne(
      { id: supply.id },
      {
        $set: {
          establishmentId: TEST_ESTABLISHMENT_ID,
          type: supply.type,
          name: supply.name,
          activeIngredient: supply.activeIngredient,
          presentation: "Carga demo comercial",
          unit: supply.unit,
          defaultDose: null,
          withdrawalPeriodDays: null,
          storageNotes: "Stock demo para pruebas del establecimiento.",
          status: "ACTIVE",
          updatedAt: nowIso,
        },
        $setOnInsert: { id: supply.id, createdAt: nowIso },
      },
      { upsert: true },
    );

    await supplyBatches.updateOne(
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
          purchaseDate: nowIso,
          supplier: "Proveedor demo",
          invoiceNumber: null,
          location: "Deposito principal",
          status: "AVAILABLE",
          notes: "Lote demo listo para pruebas.",
          updatedAt: nowIso,
        },
        $setOnInsert: { id: supply.batchId, createdAt: nowIso },
      },
      { upsert: true },
    );

    await supplyMovements.updateOne(
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
          occurredAt: nowIso,
          createdBy: "seed",
          createdAt: nowIso,
        },
        $setOnInsert: { id: `movement-${supply.batchId}` },
      },
      { upsert: true },
    );
  }

  for (const consignor of TEST_CONSIGNOR_SEED) {
    await consignors.updateOne(
      { id: consignor.id },
      {
        $set: {
          establishmentId: TEST_ESTABLISHMENT_ID,
          name: consignor.name,
          address: null,
          contactName: consignor.contactName,
          phone: consignor.phone,
          email: consignor.email,
          notes: "Contacto demo para seguimiento comercial.",
          status: "ACTIVE",
          updatedAt: nowIso,
        },
        $setOnInsert: { id: consignor.id, createdAt: nowIso },
      },
      { upsert: true },
    );
  }

  for (const slaughterhouse of TEST_SLAUGHTERHOUSE_SEED) {
    await slaughterhouses.updateOne(
      { id: slaughterhouse.id },
      {
        $set: {
          establishmentId: TEST_ESTABLISHMENT_ID,
          name: slaughterhouse.name,
          address: null,
          contactName: slaughterhouse.contactName,
          phone: slaughterhouse.phone,
          email: slaughterhouse.email,
          notes: "Frigorifico demo para pruebas de flujo.",
          status: "ACTIVE",
          updatedAt: nowIso,
        },
        $setOnInsert: { id: slaughterhouse.id, createdAt: nowIso },
      },
      { upsert: true },
    );
  }

  for (const animal of TEST_ANIMAL_SEED) {
    await animals.updateOne(
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
          notes: animal.notes,
          updatedAt: nowIso,
        },
        $setOnInsert: { id: animal.id, createdAt: nowIso },
      },
      { upsert: true },
    );
  }

  for (const event of TEST_TRACEABILITY_SEED) {
    await traceabilityEvents.updateOne(
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
          createdBy: "seed",
          createdAt: event.occurredAt,
        },
        $setOnInsert: { id: event.id },
      },
      { upsert: true },
    );
  }

  const taskSeed: FieldTask[] = [
    {
      id: "00000000-0000-4000-8000-000000001101",
      establishmentId: TEST_ESTABLISHMENT_ID,
      title: "Revisar lote de terneros en Potrero Norte",
      description: "Confirmar estado corporal y repasar caravanas con el lector.",
      type: "FIELD_CHECK",
      status: "PENDING",
      priority: "HIGH",
      dueDate: new Date(Date.now() + 2 * 86400000).toISOString(),
      scheduledAt: new Date(Date.now() + 1 * 86400000).toISOString(),
      completedAt: null,
      assignedToUserId: null,
      assignedRole: "OPERATOR",
      paddockId: "00000000-0000-4000-8000-000000000401",
      paddockName: "Potrero Norte",
      animalId: null,
      earTag: null,
      source: "MANUAL",
      sourceEventId: null,
      createdBy: "seed",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "00000000-0000-4000-8000-000000001102",
      establishmentId: TEST_ESTABLISHMENT_ID,
      title: "Control de stock de ivermectina",
      description: "Verificar vencimiento y disponibilidad del lote principal.",
      type: "HEALTH",
      status: "PENDING",
      priority: "MEDIUM",
      dueDate: new Date(Date.now() + 4 * 86400000).toISOString(),
      scheduledAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      completedAt: null,
      assignedToUserId: null,
      assignedRole: "ADMIN",
      paddockId: null,
      paddockName: null,
      animalId: null,
      earTag: null,
      source: "MANUAL",
      sourceEventId: null,
      createdBy: "seed",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  for (const task of taskSeed) {
    await tasks.updateOne(
      { id: task.id },
      { $set: task },
      { upsert: true },
    );
  }

  const healthSeed: HealthEvent[] = [
    {
      id: "00000000-0000-4000-8000-000000001201",
      establishmentId: TEST_ESTABLISHMENT_ID,
      type: "VACCINATION",
      category: "LOTE Potrero Sur",
      qty: 68,
      product: "Vacuna aftosa",
      dose: "1 dosis",
      route: null,
      notes: "Campaña sanitaria demo para mostrar seguimiento.",
      supplyId: "00000000-0000-4000-8000-000000000501",
      supplyBatchId: "00000000-0000-4000-8000-000000000601",
      quantityUsed: 68,
      unit: "dosis",
      responsible: "Equipo sanitario",
      occurredAt: new Date(Date.now() - 9 * 86400000).toISOString(),
      nextDueAt: new Date(Date.now() + 150 * 86400000).toISOString(),
      status: "COMPLETED",
      source: "MANUAL",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "00000000-0000-4000-8000-000000001202",
      establishmentId: TEST_ESTABLISHMENT_ID,
      type: "DEWORMING",
      category: "LOTE Potrero Riego",
      qty: 58,
      product: "Ivermectina",
      dose: "10 ml",
      route: null,
      notes: "Aplicacion programada de desparasitacion.",
      supplyId: "00000000-0000-4000-8000-000000000502",
      supplyBatchId: "00000000-0000-4000-8000-000000000602",
      quantityUsed: 580,
      unit: "ml",
      responsible: "Capataz",
      occurredAt: new Date(Date.now() - 6 * 86400000).toISOString(),
      nextDueAt: new Date(Date.now() + 90 * 86400000).toISOString(),
      status: "COMPLETED",
      source: "MANUAL",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  for (const healthEvent of healthSeed) {
    await healthEvents.updateOne(
      { id: healthEvent.id },
      { $set: healthEvent },
      { upsert: true },
    );
  }
};

const ensureTestLoginData = async (requestedEmail?: string) => {
  const normalizedEmail = requestedEmail?.toLowerCase();
  if (normalizedEmail && !TEST_USERS.some((testUser) => testUser.email === normalizedEmail)) return;

  const { tenants, subscriptions, users, memberships } = await getCollections();
  const now = new Date().toISOString();

  await tenants.updateOne(
    { id: TEST_TENANT_ID },
    {
      $set: { name: "Estancia La Esperanza", status: "ACTIVE", updatedAt: now },
      $setOnInsert: { id: TEST_TENANT_ID, createdAt: now },
    },
    { upsert: true },
  );

  await subscriptions.updateOne(
    { tenantId: TEST_TENANT_ID, planCode: "PRO" },
    {
      $set: {
        status: "ACTIVE",
        provider: "test",
        providerCustomerId: null,
        providerSubscriptionId: null,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(Date.now() + 365 * 86400000).toISOString(),
        graceUntil: null,
        cancelAt: null,
        updatedAt: now,
      },
      $setOnInsert: { id: randomUUID(), tenantId: TEST_TENANT_ID, planCode: "PRO", createdAt: now },
    },
    { upsert: true },
  );

  await ensureTestDemoData(now);

  for (const testUser of TEST_USERS) {
    const existingUser = await users.findOne({ email: testUser.email });
    const userId = existingUser?.id ?? randomUUID();
    await users.updateOne(
      { email: testUser.email },
      {
        $set: {
          id: userId,
          email: testUser.email,
          fullName: testUser.fullName,
          passwordHash: hashPassword(testUser.password),
          status: "ACTIVE",
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now, lastLoginAt: null },
      },
      { upsert: true },
    );
    await memberships.updateOne(
      { tenantId: TEST_TENANT_ID, userId },
      {
        $set: { role: testUser.role },
        $setOnInsert: { id: randomUUID(), tenantId: TEST_TENANT_ID, userId, createdAt: now },
      },
      { upsert: true },
    );
  }
};

const setSessionCookie = (reply: { header: (name: string, value: string) => unknown }, token: string) => {
  const secureCookie = PUBLIC_APP_URL.startsWith("https://") || process.env.NODE_ENV === "production";
  reply.header(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${secureCookie ? "; Secure" : ""}`,
  );
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

const loadContext = async (establishmentId?: string) => {
  const { commandContext, consignors, slaughterhouses, supplies } = await getCollections();
  const baseContext = await commandContext.findOne({ _id: "default" });
  const establishmentFilter = establishmentId ? { establishmentId } : {};
  const consignorDocs = await consignors.find({ status: "ACTIVE", ...establishmentFilter }).toArray();
  const slaughterhouseDocs = await slaughterhouses.find({ status: "ACTIVE", ...establishmentFilter }).toArray();
  const supplyDocs = await supplies.find({ status: "ACTIVE", ...establishmentFilter }).toArray();
  const safeBaseContext: CommandContext = baseContext
    ? {
        paddocks: baseContext.paddocks,
        consignors: baseContext.consignors,
        slaughterhouses: baseContext.slaughterhouses,
        supplies: baseContext.supplies ?? [],
      }
    : {
        paddocks: [],
        consignors: [],
        slaughterhouses: [],
        supplies: [],
      };
  const paddocks = establishmentId
    ? await loadPaddocksByEstablishment(establishmentId)
    : await loadPaddocks();
  const scopedPaddocks = establishmentId
    ? paddocks.map((paddock) => ({ id: paddock.id, name: paddock.name }))
    : (paddocks.length
      ? paddocks.map((paddock) => ({ id: paddock.id, name: paddock.name }))
      : safeBaseContext.paddocks);
  const scopedConsignors = establishmentId
    ? consignorDocs.map((consignor) => ({ id: consignor.id, name: consignor.name }))
    : (consignorDocs.length
      ? consignorDocs.map((consignor) => ({ id: consignor.id, name: consignor.name }))
      : safeBaseContext.consignors);
  const scopedSlaughterhouses = establishmentId
    ? slaughterhouseDocs.map((slaughterhouse) => ({ id: slaughterhouse.id, name: slaughterhouse.name }))
    : (slaughterhouseDocs.length
      ? slaughterhouseDocs.map((slaughterhouse) => ({ id: slaughterhouse.id, name: slaughterhouse.name }))
      : safeBaseContext.slaughterhouses);
  const scopedSupplies = establishmentId
    ? supplyDocs.map((supply) => ({ id: supply.id, name: supply.name }))
    : (supplyDocs.length
      ? supplyDocs.map((supply) => ({ id: supply.id, name: supply.name }))
      : safeBaseContext.supplies);
  return {
    ...safeBaseContext,
    paddocks: scopedPaddocks,
    consignors: scopedConsignors,
    slaughterhouses: scopedSlaughterhouses,
    supplies: scopedSupplies,
  };
};

const loadEstablishments = async () => {
  const { establishments } = await getCollections();
  const docs = await establishments.find().toArray();
  await Promise.all(docs.map((establishment) => ensureEstablishmentMasters(establishment.id)));
  return docs;
};

const insertEstablishment = async (establishment: Establishment) => {
  const { establishments } = await getCollections();
  await establishments.insertOne(establishment);
  await ensureEstablishmentMasters(establishment.id, establishment.createdAt);
};

const updateEstablishment = async (id: string, data: Partial<Establishment>) => {
  const { establishments } = await getCollections();
  await establishments.updateOne({ id }, { $set: data });
};

const deleteEstablishment = async (id: string) => {
  const { establishments, paddocks, herds, movements, consignors, slaughterhouses, herdCategories, breeds, movementTypes, healthEvents, animals, animalPhotos } = await getCollections();
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
    breeds.deleteMany({ establishmentId: id }),
    movementTypes.deleteMany({ establishmentId: id }),
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

const loadPaddocksByEstablishment = async (establishmentId: string) => {
  const { paddocks } = await getCollections();
  return paddocks.find({ establishmentId }).toArray();
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


const findPaddockByName = async (establishmentId: string, rawName: string) => {
  const name = rawName.trim();
  if (!name) return null;
  const { paddocks } = await getCollections();
  const docs = await paddocks.find({ establishmentId }).toArray();
  const normalized = normalizeCommandText(name);
  const exact = docs.find((item) => normalizeCommandText(item.name) === normalized);
  if (exact) return exact;
  return docs.find((item) => normalizeCommandText(item.name).includes(normalized) || normalized.includes(normalizeCommandText(item.name))) ?? null;
};

const inferCategoryFromPaddock = async (paddockId: string | null) => {
  if (!paddockId) return null;
  const { herds } = await getCollections();
  const herdRows = await herds.find({ paddockId, count: { $gt: 0 } }).sort({ count: -1 }).toArray();
  return herdRows[0]?.category ?? null;
};
const findPaddockById = async (id: string) => {
  const { paddocks } = await getCollections();
  return paddocks.findOne({ id });
};

const appendConfirmation = async (payload: Omit<ConfirmationRecord, "id" | "confirmedAt">) => {
  const { confirmations } = await getCollections();
  const confirmation: ConfirmationRecord = {
    id: randomUUID(),
    confirmedAt: new Date().toISOString(),
    ...payload,
  };
  await confirmations.insertOne({
    ...confirmation,
  });
  return confirmation;
};

const appendCommandLog = async (entry: Omit<CommandLog, "id" | "createdAt">) => {
  const { commandLogs } = await getCollections();
  await commandLogs.insertOne({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry,
  });
};

const loadAIBehaviors = async (establishmentId: string) => {
  const { aiBehaviors } = await getCollections();
  const count = await aiBehaviors.countDocuments({ establishmentId });
  if (count === 0) {
    const now = new Date().toISOString();
    await aiBehaviors.insertMany(
      DEFAULT_AI_BEHAVIORS.map((item) => ({
        id: randomUUID(),
        establishmentId,
        trigger: item.trigger,
        expectedBehavior: item.expectedBehavior,
        notes: "Template base persistido automáticamente para Modo Campo.",
        createdAt: now,
        updatedAt: now,
      })),
    );
  }
  return aiBehaviors.find({ establishmentId }).sort({ createdAt: -1 }).limit(50).toArray();
};

const insertAIBehavior = async (behavior: AIBehavior) => {
  const { aiBehaviors } = await getCollections();
  await aiBehaviors.insertOne(behavior);
};

const loadHerds = async () => {
  const { herds } = await getCollections();
  return herds.find().toArray();
};

const buildEstablishmentSnapshot = async (establishmentId: string) => {
  const { paddocks, herds, movements, healthEvents, consignors, slaughterhouses, herdCategories, traceabilityEvents } = await getCollections();
  const [paddockDocs, herdDocs, movementDocs, healthEventDocs, consignorDocs, slaughterhouseDocs, categoryDocs, recentTraceabilityDocs] = await Promise.all([
    paddocks.find({ establishmentId }).toArray(),
    herds.find().toArray(),
    movements.find({ establishmentId }).sort({ occurredAt: -1 }).limit(10).toArray(),
    healthEvents.find({ establishmentId }).sort({ occurredAt: -1 }).limit(10).toArray(),
    consignors.find({ establishmentId, status: "ACTIVE" }).toArray(),
    slaughterhouses.find({ establishmentId, status: "ACTIVE" }).toArray(),
    herdCategories.find({ establishmentId, status: "ACTIVE" }).toArray(),
    traceabilityEvents.find({ establishmentId }).sort({ occurredAt: -1 }).limit(10).toArray(),
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
    recentTraceabilityEvents: recentTraceabilityDocs.map((e) => ({
      earTag: e.earTag,
      type: e.type,
      occurredAt: e.occurredAt,
      paddockName: e.paddockName,
      notes: e.notes,
    })),
  };
};

const extractOpenAIErrorMessage = (status: number, details: string) => {
  try {
    const parsed = JSON.parse(details) as { error?: { message?: string; code?: string } };
    const message = parsed.error?.message?.trim();
    const code = parsed.error?.code?.trim();
    if (message && code) {
      return `${message} (code: ${code})`;
    }
    if (message) {
      return message;
    }
  } catch {
    // ignore JSON parse issues
  }

  const compact = details.replace(/\s+/g, " ").trim();
  if (!compact) {
    return `Error HTTP ${status} al consultar OpenAI.`;
  }
  return compact.slice(0, 220);
};

const composeLocalAssistantResponse = (
  snapshot: Awaited<ReturnType<typeof buildEstablishmentSnapshot>>,
  prompt: string,
  reason: "MISSING_KEY" | "UPSTREAM_ERROR" = "MISSING_KEY",
  upstreamDetail?: string,
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
    ...(upstreamDetail ? [`- Detalle OpenAI: ${upstreamDetail}.`] : []),
    "",
    closing,
  ].join("\n");
};

const normalizeCommandText = (value: string) => value
  .toLowerCase()
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "")
  .replace(/\s+/g, " ")
  .trim();

const findCategoryFromText = (text: string) => {
  const normalized = normalizeCommandText(text);
  for (const [category, synonyms] of Object.entries(categorySynonyms)) {
    if (synonyms.some((synonym) => normalized.includes(normalizeCommandText(synonym)))) {
      return category;
    }
  }
  return null;
};

const findPaddockInContext = (rawName: string, paddocks: CommandContext["paddocks"]) => {
  const needle = normalizeCommandText(rawName);
  if (!needle) return null;
  const exact = paddocks.find((paddock) => normalizeCommandText(paddock.name) === needle);
  if (exact) return exact;
  return paddocks.find((paddock) => {
    const candidate = normalizeCommandText(paddock.name);
    return candidate.includes(needle) || needle.includes(candidate);
  }) ?? null;
};

const tryFallbackMoveParse = (text: string, context: CommandContext) => {
  const normalized = normalizeCommandText(text);
  if (!/\b(mover|move|trasladar|pasar)\b/.test(normalized)) {
    return null;
  }

  const qtyMatch = text.match(/(\d+)/);
  const fromMatch = text.match(/(?:desde|del|de\s+la|de\s+los|de\s+las|de)\s+(?:el|la|los|las)?\s*([^,]+?)(?=\s+(?:al|a|hacia)\s|,|$)/i);
  const toMatch = text.match(/(?:al|a|hacia)\s+(?:el|la|los|las)?\s*([^,]+?)(?=,|\s+hoy|$)/i);
  const from = findPaddockInContext(fromMatch?.[1] ?? "", context.paddocks);
  const to = findPaddockInContext(toMatch?.[1] ?? "", context.paddocks);
  const category = findCategoryFromText(text);
  const qty = qtyMatch ? Number(qtyMatch[1]) : null;

  if (!qty || !category || !from?.id || !to?.id) {
    return null;
  }

  return {
    intent: "MOVE",
    confidence: 0.6,
    proposedOperations: [{
      type: "MOVE",
      occurredAt: new Date(),
      payload: {
        qty,
        category,
        fromPaddockId: from.id,
        toPaddockId: to.id,
      },
    }],
    warnings: [],
    errors: [],
    confirmationToken: `fallback-${Date.now().toString(36)}`,
  } as ReturnType<typeof parseCommand>;
};

const detectOperationalNudge = (prompt: string, paddockNames: string[] = []) => {
  const normalized = prompt
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();

  const isMoveRequest = /\b(mover|movimiento|trasladar|pasar)\b/.test(normalized);
  if (isMoveRequest) {
    const hasQty = /\b\d+\b/.test(normalized);
    const hasFrom = /\b(desde|del|de la|de los|de las|de)\b/.test(normalized);
    const hasTo = /\b(al|a|hacia)\b/.test(normalized);
    const categoryTerms = Object.values(categorySynonyms).flat().map((term) => term.toLowerCase());
    const hasCategory = categoryTerms.some((term) => normalized.includes(term));

    if (hasQty && hasFrom && hasTo && hasCategory) {
      const paddockHint = paddockNames.length
        ? ` Potreros disponibles: ${paddockNames.slice(0, 8).join(", ")}.`
        : "";
      return [
        "Entendí una orden de movimiento, pero no pude mapear algún potrero/categoría con datos válidos del establecimiento activo.",
        "Probá repetirla usando nombres exactos de potreros y categoría.",
        paddockHint,
      ].join(" ").trim();
    }

    return [
      "Puedo ejecutarlo, pero me faltan datos para impactar la base.",
      "Decime todo en una línea, por ejemplo:",
      "\"Mover 10 terneros del Potrero 1 al Potrero 2\".",
      "Después confirmá con: hazlo.",
    ].join(" ");
  }

  const isHealthRequest = /\b(vacunar|vacunacion|desparasitar|tratamiento|tratar)\b/.test(normalized);
  if (isHealthRequest) {
    return [
      "Puedo registrarlo, pero necesito datos mínimos.",
      "Ejemplo: \"Vacunar 120 terneros con Clostridial 7 vías hoy\" y luego \"hazlo\".",
    ].join(" ");
  }

  const isIncidentReviewRequest = /\b(revisar|ver|listar|mostrar|consultar)\b.*\b(incidentes|incidencias|alertas)\b/.test(normalized)
    || /\b(incidentes|incidencias|alertas)\b/.test(normalized);
  if (isIncidentReviewRequest) {
    return [
      "Para revisar incidentes, pedímelo así:",
      "\"Mostrame incidentes abiertos\" o \"Listar incidentes críticos del Potrero 3\".",
      "Si querés registrar uno nuevo: \"Registrar incidente en Potrero 2: alambre caído, severidad alta\".",
    ].join(" ");
  }

  return null;
};

const EAR_TAG_REGEX = /\b(858\d{9}|[A-Za-z]{2,3}[\-\s]?\d{4,8}|\d{4,8})\b/i;

const detectEarTagInText = (text: string): string | null => {
  const match = text.match(EAR_TAG_REGEX);
  if (!match) return null;
  return match[1].trim().toUpperCase().replace(/\s+/, "-");
};

const TRACEABILITY_KEYWORD_MAP: Array<{ keywords: RegExp; type: TraceabilityEventType }> = [
  { keywords: /\b(vacun[ao]r?|vacunacion|vacuna)\b/i, type: "VACUNACION_REALIZADA" },
  { keywords: /\b(vacuna\s+pendiente|pendiente\s+vacun)\b/i, type: "VACUNACION_PENDIENTE" },
  { keywords: /\b(desparasit[ao]r?|desparasitacion|ivermectina|vermifugo)\b/i, type: "DESPARASITACION" },
  { keywords: /\b(trat[ao]r?|tratamiento|antibiotico|medicamento)\b/i, type: "TRATAMIENTO" },
  { keywords: /\b(inseminacion|inseminar|iatf|semen)\b/i, type: "INSEMINACION" },
  { keywords: /\b(pre[nñ]ez|pre[nñ]ada|ecografia|preñada)\b/i, type: "PREÑEZ_CONFIRMADA" },
  { keywords: /\b(traslad[ao]r?|traslado|mov[eé]r?|mover)\b/i, type: "TRASLADO" },
  { keywords: /\b(asignar?\s+potrero|potrero\s+\d+|asignacion\s+potrero)\b/i, type: "ASIGNACION_POTRERO" },
  { keywords: /\b(muerte|muerto|muri[oó]|falleci[oó]|crepado)\b/i, type: "MUERTE" },
  { keywords: /\b(frigorifico|enviar\s+a\s+frigorifico|remision|faena)\b/i, type: "ENVIO_FRIGORIFICO" },
];

const detectTraceabilityEventType = (text: string): TraceabilityEventType => {
  const normalized = text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  for (const entry of TRACEABILITY_KEYWORD_MAP) {
    if (entry.keywords.test(normalized)) return entry.type;
  }
  return "OBSERVACION";
};

const isTraceabilityQuery = (text: string): boolean =>
  /\b(qu[eé]\s+pas[oó]|historial|eventos|resumen|estado|d[oó]nde\s+est[aá]|cu[aá]ndo|ver\s+caravana|consultar)\b/i.test(text);

const detectAnimalRegistrationIntent = (text: string): boolean =>
  /\b(registra(?:me|r)?|alta(?:\s+de)?\s+animal|cargar\s+animal|nueva?\s+vaquillona|ingresar\s+vaquillona)\b/i.test(text);

const detectAnimalCategoryInText = (text: string): string | null => {
  if (/\bvaquillon(?:a|as)\b/i.test(text)) return "vaquillona";
  if (/\bvaqu(?:a|as)\b/i.test(text)) return "vaca";
  if (/\bterner(?:a|as|o|os)\b/i.test(text)) return "ternero";
  if (/\btor(?:o|os)\b/i.test(text)) return "toro";
  return null;
};

const TRACEABILITY_EVENT_LABELS: Record<TraceabilityEventType, string> = {
  ASIGNACION_POTRERO: "asignación a potrero",
  INSEMINACION: "inseminación",
  "PREÑEZ_CONFIRMADA": "preñez confirmada",
  VACUNACION_PENDIENTE: "vacunación pendiente",
  VACUNACION_REALIZADA: "vacunación realizada",
  DESPARASITACION: "desparasitación",
  TRATAMIENTO: "tratamiento",
  PESAJE: "pesaje",
  TRASLADO: "traslado",
  MUERTE: "muerte",
  ENVIO_FRIGORIFICO: "envío a frigorífico",
  OBSERVACION: "observación",
};

const buildTraceabilitySummary = (events: TraceabilityEvent[], earTag: string): string => {
  if (!events.length) {
    return `No se encontraron eventos registrados para la caravana ${earTag}.`;
  }
  const latest = events[0];
  const insemination = events.find((e) => e.type === "INSEMINACION");
  const pregnancy = events.find((e) => e.type === "PREÑEZ_CONFIRMADA");
  const pendingVaccination = events.find((e) => e.type === "VACUNACION_PENDIENTE");
  const lastPaddock = events.find((e) => e.type === "ASIGNACION_POTRERO" || e.type === "TRASLADO");

  return [
    `La caravana ${earTag} tiene ${events.length} evento(s) registrado(s).`,
    lastPaddock?.paddockName ? `Último potrero conocido: ${lastPaddock.paddockName}.` : "",
    insemination ? `Inseminación registrada el ${new Date(insemination.occurredAt).toLocaleDateString("es-UY")}.` : "",
    pregnancy ? `Preñez confirmada el ${new Date(pregnancy.occurredAt).toLocaleDateString("es-UY")}.` : "",
    pendingVaccination ? "Tiene al menos una vacunación pendiente." : "",
    `Último evento: ${TRACEABILITY_EVENT_LABELS[latest.type]} (${new Date(latest.occurredAt).toLocaleString("es-UY")}).`,
  ].filter(Boolean).join(" ");
};

const callOpenAIChat = async (
  messages: AIMessage[],
  snapshot: Awaited<ReturnType<typeof buildEstablishmentSnapshot>>,
  establishment: Establishment,
  behaviors: AIBehavior[],
) => {
  const persistedSettings = await loadAISettings();
  const apiKey = persistedSettings?.openAiApiKey || process.env.OPENAI_API_KEY;
  const prompt = messages[messages.length - 1]?.content ?? "";

  if (!apiKey) {
    return composeLocalAssistantResponse(snapshot, prompt);
  }

  const systemPrompt = [
    "Sos un asistente experto en gestión ganadera argentina.",
    "Respondé siempre en español claro, con pasos accionables y cálculos simples cuando ayuden.",
    "Usá siempre la palabra 'potrero' y nunca 'paddock' en las respuestas al usuario.",
    "Si faltan datos, avisalo y pedí aclaración de forma breve.",
    `Establecimiento activo: ${establishment.name} (${establishment.id}).`,
    `Contexto de datos (JSON): ${JSON.stringify(snapshot)}`,
    `Comportamientos entrenados acumulados (JSON): ${JSON.stringify(
      behaviors.map((behavior) => ({
        trigger: behavior.trigger,
        expectedBehavior: behavior.expectedBehavior,
        notes: behavior.notes,
      })),
    )}`,
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: persistedSettings?.openAiModel || DEFAULT_OPENAI_MODEL,
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
    const upstreamMessage = extractOpenAIErrorMessage(response.status, details);
    app.log.error({ status: response.status, details }, "Fallo la API de IA externa");
    return composeLocalAssistantResponse(snapshot, prompt, "UPSTREAM_ERROR", upstreamMessage);
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  const content = payload.choices?.[0]?.message?.content?.trim();
  return content || composeLocalAssistantResponse(snapshot, prompt, "UPSTREAM_ERROR", "La respuesta de OpenAI llegó vacía");
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

const loadEstablishmentPaddockIds = async (establishmentId: string) => {
  const { paddocks } = await getCollections();
  const paddockDocs = await paddocks.find({ establishmentId }, { projection: { id: 1 } }).toArray();
  return paddockDocs.map((paddock) => paddock.id);
};

const getCategoryAvailability = async (establishmentId: string, category: string) => {
  const paddockIds = await loadEstablishmentPaddockIds(establishmentId);
  if (!paddockIds.length) {
    return 0;
  }
  const { herds } = await getCollections();
  const rows = await herds.find({ paddockId: { $in: paddockIds }, category, count: { $gt: 0 } }).toArray();
  return rows.reduce((total, row) => total + row.count, 0);
};

const consumeStockAcrossPaddocks = async (establishmentId: string, category: string, quantity: number, updatedAt: string) => {
  const paddockIds = await loadEstablishmentPaddockIds(establishmentId);
  if (!paddockIds.length) {
    return null;
  }

  const { herds } = await getCollections();
  const candidates = await herds
    .find({ paddockId: { $in: paddockIds }, category, count: { $gt: 0 } })
    .sort({ count: -1 })
    .toArray();

  const available = candidates.reduce((acc, row) => acc + row.count, 0);
  if (available < quantity) {
    return null;
  }

  let remaining = quantity;
  const allocations: Array<{ paddockId: string; quantity: number }> = [];

  for (const row of candidates) {
    if (remaining <= 0) {
      break;
    }
    const consumed = Math.min(row.count, remaining);
    if (consumed <= 0) {
      continue;
    }
    await updateHerdStock(row.paddockId, category, row.count - consumed, updatedAt);
    allocations.push({ paddockId: row.paddockId, quantity: consumed });
    remaining -= consumed;
  }

  return allocations;
};

const insertMovement = async (movement: HerdMovement) => {
  const { movements } = await getCollections();
  await movements.insertOne(movement);
};

const insertHealthEvent = async (healthEvent: HealthEvent) => {
  const { healthEvents } = await getCollections();
  await healthEvents.insertOne(healthEvent);
};

const insertOperationalEvent = async (event: OperationalEvent) => {
  const { operationalEvents } = await getCollections();
  await operationalEvents.insertOne(event);
};

const ensureStockAvailable = async (paddockId: string, category: string, qty: number) => {
  const row = await findHerdByPaddockCategory(paddockId, category);
  return (row?.count ?? 0) >= qty;
};

const insertReproductionEvent = async (event: ReproductionEvent) => {
  const { reproductionEvents } = await getCollections();
  await reproductionEvents.insertOne(event);
};

const consignorSchema = z.object({
  establishmentId: z.string().uuid(),
  name: z.string().min(2),
  address: z.string().min(2).optional().nullable(),
  contactName: z.string().min(2).optional().nullable(),
  phone: z.string().min(6).optional().nullable(),
  email: z.string().email().optional().nullable(),
  notes: z.string().min(1).optional().nullable(),
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

  const normalizedModel = model?.trim() || DEFAULT_OPENAI_MODEL;
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
    model: settings?.openAiModel || DEFAULT_OPENAI_MODEL,
    updatedAt: settings?.updatedAt ?? null,
  };
});

const adminCredentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

app.post("/admin/openai-settings/test", async (request, reply) => {
  const parsed = adminCredentialsSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ message: "Credenciales inválidas." });
  }

  const { username, password } = parsed.data;
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return reply.status(401).send({ message: "Credenciales de admin inválidas." });
  }

  const settings = await loadAISettings();
  const apiKey = settings?.openAiApiKey || process.env.OPENAI_API_KEY;
  const model = settings?.openAiModel || DEFAULT_OPENAI_MODEL;

  if (!apiKey) {
    return reply.status(400).send({ message: "No hay API key configurada para probar." });
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 8,
      messages: [
        { role: "system", content: "Respondé únicamente: OK" },
        { role: "user", content: "ping" },
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    const upstreamMessage = extractOpenAIErrorMessage(response.status, details);
    return reply.status(502).send({ message: `OpenAI rechazó la configuración: ${upstreamMessage}` });
  }

  return {
    ok: true,
    message: "Conexión con OpenAI validada correctamente.",
    model,
  };
});

const consignorUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  address: z.string().min(2).optional().nullable(),
  contactName: z.string().min(2).optional().nullable(),
  phone: z.string().min(6).optional().nullable(),
  email: z.string().email().optional().nullable(),
  notes: z.string().min(1).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const slaughterhouseSchema = z.object({
  establishmentId: z.string().uuid(),
  name: z.string().min(2),
  address: z.string().min(2).optional().nullable(),
  contactName: z.string().min(2).optional().nullable(),
  phone: z.string().min(6).optional().nullable(),
  email: z.string().email().optional().nullable(),
  notes: z.string().min(1).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const slaughterhouseUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  address: z.string().min(2).optional().nullable(),
  contactName: z.string().min(2).optional().nullable(),
  phone: z.string().min(6).optional().nullable(),
  email: z.string().email().optional().nullable(),
  notes: z.string().min(1).optional().nullable(),
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

const breedSchema = z.object({
  establishmentId: z.string().uuid(),
  name: z.string().min(2),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const breedUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const movementTypeSchema = z.object({
  establishmentId: z.string().uuid(),
  name: z.string().min(2),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const movementTypeUpdateSchema = z.object({
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
  supplyId: z.string().uuid().optional().nullable(),
  supplyBatchId: z.string().uuid().optional().nullable(),
  quantityUsed: z.number().positive().optional().nullable(),
  unit: z.string().min(1).max(30).optional().nullable(),
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
  supplyId: z.string().uuid().nullable().optional(),
  supplyBatchId: z.string().uuid().nullable().optional(),
  quantityUsed: z.number().positive().nullable().optional(),
  unit: z.string().min(1).max(30).nullable().optional(),
  responsible: z.string().min(2).nullable().optional(),
  occurredAt: z.string().datetime().optional(),
  nextDueAt: z.string().datetime().nullable().optional(),
  status: z.enum(["PENDING", "COMPLETED", "CANCELLED", "OVERDUE"]).optional(),
});

const entoreEventSchema = z.object({
  establishmentId: z.string().uuid(),
  type: z.literal("ENTORE"),
  category: z.string().min(2),
  lot: z.string().min(2).optional().nullable(),
  servicedQty: z.number().int().positive(),
  bullsQty: z.number().int().min(0).optional().nullable(),
  strawsQty: z.number().int().min(0).optional().nullable(),
  protocol: z.string().min(2).optional().nullable(),
  responsible: z.string().min(2).optional().nullable(),
  notes: z.string().min(1).optional().nullable(),
  occurredAt: z.string().datetime().optional(),
  source: z.enum(["MANUAL", "COMMAND"]).optional(),
});

const pregnancyCheckEventSchema = z.object({
  establishmentId: z.string().uuid(),
  type: z.literal("PREGNANCY_CHECK"),
  category: z.string().min(2),
  lot: z.string().min(2).optional().nullable(),
  diagnosedQty: z.number().int().positive(),
  pregnantQty: z.number().int().min(0),
  emptyQty: z.number().int().min(0).optional().nullable(),
  responsible: z.string().min(2).optional().nullable(),
  notes: z.string().min(1).optional().nullable(),
  occurredAt: z.string().datetime().optional(),
  source: z.enum(["MANUAL", "COMMAND"]).optional(),
});

const reproductionEventSchema = z.discriminatedUnion("type", [
  entoreEventSchema,
  pregnancyCheckEventSchema,
]);

const manualWeaningSchema = z.object({
  establishmentId: z.string().uuid(),
  fromCategory: z.string().min(2),
  toCategory: z.string().min(2).default("TERNEROS_DESTETADOS"),
  qty: z.number().int().positive(),
  occurredAt: z.string().datetime().optional(),
  notes: z.string().min(1).optional().nullable(),
});

const manualSlaughterShipmentSchema = z.object({
  establishmentId: z.string().uuid(),
  consignorId: z.string().uuid().optional().nullable(),
  destination: z.string().min(2),
  slaughterhouseId: z.string().uuid().optional().nullable(),
  items: z.array(z.object({
    paddockId: z.string().uuid(),
    category: z.string().min(2),
    qty: z.number().int().positive(),
  })).min(1),
  earTags: z.array(z.string().min(1)).optional().default([]),
  occurredAt: z.string().datetime().optional(),
  notes: z.string().min(1).optional().nullable(),
});

const incidentSchema = z.object({
  establishmentId: z.string().uuid(),
  paddockId: z.string().uuid().nullable().optional(),
  title: z.string().min(3),
  description: z.string().min(3),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CANCELLED"]).default("OPEN"),
  observedAt: z.string().datetime().optional(),
  resolvedAt: z.string().datetime().nullable().optional(),
  mapX: z.number().min(0).max(100).nullable().optional(),
  mapY: z.number().min(0).max(100).nullable().optional(),
  source: z.enum(["MANUAL", "INSPECTION", "COMMAND"]).default("MANUAL"),
});

const incidentUpdateSchema = z.object({
  paddockId: z.string().uuid().nullable().optional(),
  title: z.string().min(3).optional(),
  description: z.string().min(3).optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CANCELLED"]).optional(),
  observedAt: z.string().datetime().optional(),
  resolvedAt: z.string().datetime().nullable().optional(),
  mapX: z.number().min(0).max(100).nullable().optional(),
  mapY: z.number().min(0).max(100).nullable().optional(),
  source: z.enum(["MANUAL", "INSPECTION"]).optional(),
});

app.get("/health", async () => ({ status: "ok" }));

app.get("/tasks", async (request, reply) => {
  const query = request.query as {
    establishmentId?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    type?: TaskType;
    earTag?: string;
    paddockId?: string;
    fromDate?: string;
    toDate?: string;
    limit?: string;
  };
  if (!query.establishmentId) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Falta establishmentId." });
  }
  const { tasks } = await getCollections();
  const filter: Record<string, unknown> = { establishmentId: query.establishmentId };
  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = query.priority;
  if (query.type) filter.type = query.type;
  if (query.earTag) filter.earTag = query.earTag.trim().toUpperCase();
  if (query.paddockId) filter.paddockId = query.paddockId;
  if (query.fromDate || query.toDate) {
    const range: Record<string, string> = {};
    if (query.fromDate) range.$gte = query.fromDate;
    if (query.toDate) range.$lte = query.toDate;
    filter.$or = [{ scheduledAt: range }, { dueDate: range }, { createdAt: range }];
  }
  const limit = Math.min(Number(query.limit ?? 200), 500);
  const list = await tasks.find(filter).sort({ priority: -1, scheduledAt: 1, dueDate: 1, createdAt: -1 }).limit(limit).toArray();
  return { tasks: list };
});

app.post("/tasks", async (request, reply) => {
  const body = taskCreateSchema.safeParse(request.body);
  if (!body.success) return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  const establishment = await findEstablishmentById(body.data.establishmentId);
  if (!establishment) return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });
  const task = await createFieldTask(body.data);
  return reply.status(201).send(task);
});

app.patch("/tasks/:id", async (request, reply) => {
  const body = taskUpdateSchema.safeParse(request.body);
  if (!body.success) return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  const { tasks } = await getCollections();
  const existing = await tasks.findOne({ id: (request.params as { id: string }).id });
  if (!existing) return reply.status(404).send({ code: "NOT_FOUND", message: "Tarea no encontrada." });
  const now = new Date().toISOString();
  const updates: Partial<FieldTask> = {
    ...body.data,
    title: body.data.title?.trim(),
    description: body.data.description === undefined ? undefined : body.data.description?.trim() || null,
    paddockName: body.data.paddockName === undefined ? undefined : body.data.paddockName?.trim() || null,
    earTag: body.data.earTag === undefined ? undefined : body.data.earTag?.trim().toUpperCase() || null,
    updatedAt: now,
  };
  await tasks.updateOne({ id: existing.id }, { $set: updates });
  const updated = await tasks.findOne({ id: existing.id });
  await appendActivityFeed({
    establishmentId: existing.establishmentId,
    activityType: "TASK_UPDATED",
    title: `Tarea actualizada: ${updates.title ?? existing.title}`,
    summary: updates.description ?? existing.description ?? existing.title,
    occurredAt: now,
    priority: (updates.priority ?? existing.priority) as TaskPriority,
    status: priorityToActivityStatus((updates.priority ?? existing.priority) as TaskPriority),
    sourceCollection: "tasks",
    sourceId: existing.id,
    earTag: updates.earTag ?? existing.earTag,
    paddockId: updates.paddockId ?? existing.paddockId,
    paddockName: updates.paddockName ?? existing.paddockName,
  });
  return reply.send(updated);
});

app.post("/tasks/:id/complete", async (request, reply) => {
  const body = taskCompleteSchema.safeParse(request.body ?? {});
  if (!body.success) return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  const { tasks } = await getCollections();
  const existing = await tasks.findOne({ id: (request.params as { id: string }).id });
  if (!existing) return reply.status(404).send({ code: "NOT_FOUND", message: "Tarea no encontrada." });
  const updated = await completeFieldTask(existing, body.data.completedAt ?? new Date().toISOString(), body.data.notes);
  return reply.send(updated);
});

app.get("/activities/feed", async (request, reply) => {
  const query = request.query as { establishmentId?: string; fromDate?: string; toDate?: string; limit?: string };
  if (!query.establishmentId) return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Falta establishmentId." });
  const { activityFeed } = await getCollections();
  const filter: Record<string, unknown> = { establishmentId: query.establishmentId };
  if (query.fromDate || query.toDate) {
    const range: Record<string, string> = {};
    if (query.fromDate) range.$gte = query.fromDate;
    if (query.toDate) range.$lte = query.toDate;
    filter.occurredAt = range;
  }
  const limit = Math.min(Number(query.limit ?? 100), 500);
  const activities = await activityFeed.find(filter).sort({ occurredAt: -1 }).limit(limit).toArray();
  return { activities };
});

app.get("/activities/day", async (request, reply) => {
  const query = request.query as { establishmentId?: string; date?: string };
  if (!query.establishmentId) return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Falta establishmentId." });
  const day = query.date ? new Date(query.date) : new Date();
  day.setHours(0, 0, 0, 0);
  const next = new Date(day);
  next.setDate(next.getDate() + 1);
  const { activityFeed, tasks } = await getCollections();
  const [activities, pendingTasks] = await Promise.all([
    activityFeed.find({ establishmentId: query.establishmentId, occurredAt: { $gte: day.toISOString(), $lt: next.toISOString() } }).sort({ occurredAt: 1 }).toArray(),
    tasks.find({ establishmentId: query.establishmentId, status: { $in: ["PENDING", "IN_PROGRESS", "OVERDUE"] } }).sort({ priority: -1, dueDate: 1, scheduledAt: 1 }).limit(100).toArray(),
  ]);
  return {
    date: day.toISOString().slice(0, 10),
    kpis: {
      done: activities.filter((item) => item.status === "DONE").length,
      pending: pendingTasks.length,
      urgent: pendingTasks.filter((task) => task.priority === "URGENT").length,
    },
    activities,
    pendingTasks,
  };
});

app.get("/field/day-start", async (request, reply) => {
  const establishmentId = (request.query as { establishmentId?: string }).establishmentId;
  if (!establishmentId) return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Falta establishmentId." });
  const establishment = await findEstablishmentById(establishmentId);
  if (!establishment) return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });
  return buildDayStartSummary(establishmentId);
});

app.post("/field/assistant", async (request, reply) => {
  const body = fieldAssistantSchema.safeParse(request.body);
  if (!body.success) return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  const establishment = await findEstablishmentById(body.data.establishmentId);
  if (!establishment) return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });

  const prompt = body.data.prompt.trim();
  const normalized = normalizeFieldText(prompt);
  const { tasks, paddocks } = await getCollections();

  if (/\b(preñadas|prenadas|preñez|prenez)\b/.test(normalized) && /\b(donde|dónde|estan|están|tengo|detalle|lista|listar)\b/.test(normalized)) {
    const message = await buildPregnantFemalesAnswer(body.data.establishmentId);
    return reply.send({ mode: "ANSWER", message, intent: "QUERY_PREGNANT_FEMALES", confidence: 0.82 });
  }

  if (/\b(insumo|insumos|medicamento|medicamentos|vacuna|vacunas|vencen|vence|vencimiento|vencimientos)\b/.test(normalized) && /\b(dame|mostrar|mostrame|ver|detalle|lista|listar|que|qué|cuales|cu[aá]les)\b/.test(normalized)) {
    const { supplies, supplyBatches } = await getCollections();
    const [supplyList, batchList] = await Promise.all([
      supplies.find({ establishmentId: body.data.establishmentId }).toArray(),
      supplyBatches.find({ establishmentId: body.data.establishmentId, quantityAvailable: { $gt: 0 } }).sort({ expirationDate: 1 }).limit(8).toArray(),
    ]);
    const names = new Map(supplyList.map((supply) => [supply.id, supply.name]));
    const lines = batchList.map((batch) => `${names.get(batch.supplyId) ?? "Insumo"} lote ${batch.batchNumber}: ${batch.quantityAvailable} ${batch.unit}, vence ${new Date(batch.expirationDate).toLocaleDateString("es-UY")}`);
    return reply.send({ mode: "ANSWER", intent: "QUERY_SUPPLIES", confidence: 0.84, message: lines.length ? `Insumos próximos: ${lines.join("; ")}.` : "No encontré insumos con stock disponible." });
  }

  if (/\b(stock|existencia|existencias|cabezas|categorias|categorías)\b/.test(normalized) && /\b(dame|mostrar|mostrame|ver|detalle|detallame|resumen|lista|listar|como|cómo)\b/.test(normalized)) {
    const message = await buildStockDetailAnswer(body.data.establishmentId);
    return reply.send({ mode: "ANSWER", message, intent: "QUERY_HERD_SUMMARY", confidence: 0.84 });
  }

  if (isAnimalTagsQuery(normalized)) {
    const message = isAnimalTagsCountQuery(normalized)
      ? await buildAnimalTagsCountAnswer(body.data.establishmentId)
      : await buildAnimalTagsDetailAnswer(body.data.establishmentId);
    return reply.send({ mode: "ANSWER", message, intent: "QUERY_ANIMAL_TAGS", confidence: 0.9 });
  }

  if (/\b(resumen|dashboard|rode[oó]|establecimiento)\b/.test(normalized) && /\b(dame|mostrar|mostrame|ver|resumen|detalle|detallame)\b/.test(normalized)) {
    if (/\b(detalle|detallame|completo|completa)\b/.test(normalized)) {
      const message = await buildHerdDetailAnswer(body.data.establishmentId, establishment.name);
      return reply.send({ mode: "ANSWER", intent: "QUERY_HERD_SUMMARY", confidence: 0.86, message });
    }
    const summary = await buildDayStartSummary(body.data.establishmentId);
    return reply.send({
      mode: "ANSWER",
      intent: "QUERY_HERD_SUMMARY",
      confidence: 0.82,
      message: `Resumen de ${establishment.name}: ${summary.kpis.totalAnimals} animales activos, ${summary.kpis.pregnantFemales} preñadas registradas, ${summary.kpis.pendingTasks} tareas pendientes y ${summary.kpis.urgentTasks} urgentes. Pedime "detalle del rodeo", "detalle de caravanas" o "stock" para verlo desglosado.`,
      dashboard: summary,
    });
  }

  if (/\b(muertes?|bajas?|muertos?|fallecidos?|mortandad|murieron|murio|murió)\b/.test(normalized) && /\b(cuant[oa]s?|total|habido|hubo|tuvimos|hay|registrad[oa]s?|dame|mostrame|ver|lista|listar|este|mes|ano|año|semana)\b/.test(normalized)) {
    const message = await buildDeathStatsAnswer(body.data.establishmentId, normalized);
    return reply.send({ mode: "ANSWER", message, intent: "QUERY_DEATH_STATS", confidence: 0.85 });
  }

  if (detectedEarTag && /\b(historial|historia|eventos|que\s+paso|que\s+pasó|movimientos|registro|ficha|datos|antecedentes)\b/.test(normalized)) {
    const message = await buildAnimalHistoryAnswer(body.data.establishmentId, detectedEarTag);
    return reply.send({ mode: "ANSWER", message, intent: "QUERY_ANIMAL_HISTORY", confidence: 0.88 });
  }

  if (/\b(marcar|marca|cerrar|cerrá|completar|completa|hecha|hecho|terminada|terminado)\b/.test(normalized) && /\b(tarea|recorrida|verificar|chequeo|revision|revisión)\b/.test(normalized)) {
    const openTasks = await tasks.find({ establishmentId: body.data.establishmentId, status: { $in: ["PENDING", "IN_PROGRESS", "OVERDUE"] } }).sort({ priority: -1, createdAt: -1 }).limit(50).toArray();
    const withoutVerb = normalizeFieldText(prompt.replace(/marcar|marca|cerrar|cerrá|completar|completa|como hecha|como hecho|tarea/gi, ""));
    const selected = openTasks.find((task) => normalizeFieldText(task.title).includes(withoutVerb) || withoutVerb.includes(normalizeFieldText(task.title))) ?? openTasks[0];
    if (!selected) return reply.send({ mode: "MISSING_DATA", message: "No encontré tareas pendientes para cerrar.", intent: "COMPLETE_TASK", confidence: 0.45, missingFields: ["tarea"] });
    const updated = await completeFieldTask(selected, new Date().toISOString(), `Cerrada desde modo campo: ${prompt}`);
    return reply.send({ mode: "ANSWER", message: `Listo, marqué como hecha: ${updated.title}.`, intent: "COMPLETE_TASK", confidence: 0.78, task: updated });
  }

  if (isTaskCreationPrompt(normalized)) {
    const now = new Date().toISOString();
    const scheduledAt = parseRelativeSchedule(prompt) ?? now;
    const paddockName = extractPaddockNameFromText(prompt);
    const assignedRole = extractTaskResponsibleFromText(prompt);
    const task = await createFieldTask({
      establishmentId: body.data.establishmentId,
      title: extractTaskTitle(prompt),
      description: prompt,
      type: inferTaskType(prompt),
      priority: inferTaskPriority(prompt),
      scheduledAt,
      dueDate: scheduledAt,
      assignedRole,
      paddockName,
      earTag: detectEarTagInText(prompt),
      source: "FIELD_COMMAND",
    });
    return reply.send({
      mode: "ANSWER",
      message: `Tarea creada y guardada en backend: ${task.title}. Fecha: ${task.scheduledAt}${task.assignedRole ? `. Responsable: ${task.assignedRole}` : ". Sin responsable asignado"}. Ya queda visible en modo campo para marcarla como cumplida.`,
      intent: "CREATE_TASK",
      confidence: 0.86,
      task,
    });
  }

  if (/\b(dar de alta|crear|alta)\b/.test(normalized) && /\bpotrero\b/.test(normalized)) {
    const nameMatch = prompt.match(/(?:potrero|nuevo potrero)[,\s]+([a-záéíóúñ0-9 ]{2,80}?)(?=,|\s+de\s+\d+|\s+\d+\s*(?:ha|hect)|$)/i);
    const hectaresMatch = prompt.match(/(\d+(?:[.,]\d+)?)\s*(?:ha|hect[aá]reas?)/i);
    const name = nameMatch?.[1]?.trim() || "Potrero nuevo";
    const areaHa = hectaresMatch?.[1] ? Number(hectaresMatch[1].replace(",", ".")) : null;
    const confirmation = await buildFieldConfirmation({
      establishmentId: body.data.establishmentId,
      confirmationToken: `field-${randomUUID()}`,
      intent: "CREATE_PADDOCK",
      action: "create_paddock",
      payload: { name, areaHa, originalPrompt: prompt },
    });
    return reply.send({
      mode: "CONFIRMATION_REQUIRED",
      intent: "CREATE_PADDOCK",
      confidence: 0.82,
      message: `Voy a crear el potrero ${name}${areaHa ? ` de ${areaHa} ha` : ""}. Confirmá para guardarlo.`,
      preview: { title: "Alta de potrero", sections: [{ label: "Nombre", value: name }, { label: "Superficie", value: areaHa ? `${areaHa} ha` : "Sin informar", severity: areaHa ? "normal" : "warning" }] },
      confirmation: { token: confirmation.confirmationToken, actionLabel: "Hacelo", cancelLabel: "Cancelar", riskLevel: "MEDIUM" },
    });
  }

  if (/\b(vacun[aeoéó]r?|vacuné|vacunó|vacunamos|vacunaron|vacunaste|vacunacion)\b/.test(normalized) && /\b(toda|todo|lote|tropa|potrero)\b/.test(normalized)) {
    const paddockName = extractPaddockNameFromText(prompt);
    const productMatch =
      // "contra brucelosis", "con aftosa", "para carbunclo"
      prompt.match(/\bcontra\s+([a-záéíóúñ0-9]+(?:\s+[a-záéíóúñ0-9]+){0,2}?)(?=\s+(?:potrero|lote|todo|toda|tropa)|[,.]|$)/i)
      ?? prompt.match(/\b(?:con|para|de)\b\s+([a-záéíóúñ0-9]+(?:\s+[a-záéíóúñ0-9]+){0,2}?)(?=\s+(?:potrero|lote|todo|toda|tropa)|[,.]|$)/i)
      // verb + product before paddock/lot reference
      ?? prompt.match(/vacun\S+\s+([a-záéíóúñ0-9 ]{2,40}?)(?=\s+(?:a\s+toda|toda|al\s+potrero|potrero|lote|todo)\b|,|$)/i);
    const product = productMatch?.[1]?.trim() || (normalized.includes("aftosa") ? "aftosa" : "vacuna");
    const confirmation = await buildFieldConfirmation({
      establishmentId: body.data.establishmentId,
      confirmationToken: `field-${randomUUID()}`,
      intent: "REGISTER_VACCINATION",
      action: "register_vaccination_lot",
      payload: { product, paddockName, notes: prompt },
    });
    return reply.send({
      mode: "CONFIRMATION_REQUIRED",
      intent: "REGISTER_VACCINATION",
      confidence: 0.78,
      message: `Voy a registrar vacunación ${product} para ${paddockName ?? "el lote indicado"}. Confirmá para guardar el evento sanitario.`,
      preview: { title: "Vacunación por lote", sections: [{ label: "Vacuna", value: product }, { label: "Potrero", value: paddockName ?? "Sin identificar", severity: paddockName ? "normal" : "warning" }] },
      confirmation: { token: confirmation.confirmationToken, actionLabel: "Hacelo", cancelLabel: "Cancelar", riskLevel: "MEDIUM" },
    });
  }

  const detectedEarTag = detectEarTagInText(prompt);
  if (detectedEarTag && /\b(murio|murió|muerta|muerto|muerte|baja)\b/.test(normalized)) {
    const paddockName = extractPaddockNameFromText(prompt);
    const confirmation = await buildFieldConfirmation({
      establishmentId: body.data.establishmentId,
      confirmationToken: `field-${randomUUID()}`,
      intent: "REGISTER_DEATH",
      action: "register_death",
      payload: { earTag: detectedEarTag, paddockName, notes: prompt },
    });
    return reply.send({
      mode: "CONFIRMATION_REQUIRED",
      intent: "REGISTER_DEATH",
      confidence: 0.86,
      message: `Detecté baja por muerte de ${detectedEarTag}. Esto actualizará el animal y creará una tarea urgente de verificación.`,
      preview: { title: "Baja por muerte", sections: [{ label: "Caravana", value: detectedEarTag, severity: "critical" }, { label: "Potrero", value: paddockName ?? "Sin identificar", severity: paddockName ? "normal" : "warning" }] },
      confirmation: { token: confirmation.confirmationToken, actionLabel: "Hacelo", cancelLabel: "Cancelar", riskLevel: "HIGH" },
    });
  }

  if (detectedEarTag && /\b(pario|parió|parto|nacimiento)\b/.test(normalized)) {
    const calfTags = Array.from(prompt.matchAll(/858\d{9}/g)).map((match) => match[0]);
    const calfEarTag = calfTags.find((tag) => tag !== detectedEarTag) ?? null;
    const weightMatch = prompt.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|kilos?)/i);
    const sex = /ternera|hembra/i.test(prompt) ? "HEMBRA" : /ternero|macho/i.test(prompt) ? "MACHO" : "OTRO";
    if (!calfEarTag) {
      return reply.send({ mode: "MISSING_DATA", intent: "REGISTER_BIRTH", confidence: 0.65, message: "Detecté un parto, pero falta la caravana de la cría.", missingFields: ["caravana de la cría"] });
    }
    const confirmation = await buildFieldConfirmation({
      establishmentId: body.data.establishmentId,
      confirmationToken: `field-${randomUUID()}`,
      intent: "REGISTER_BIRTH",
      action: "register_birth",
      payload: { motherEarTag: detectedEarTag, calfEarTag, calfSex: sex, calfWeightKg: weightMatch?.[1] ? Number(weightMatch[1].replace(",", ".")) : null, paddockName: extractPaddockNameFromText(prompt), notes: prompt },
    });
    return reply.send({
      mode: "CONFIRMATION_REQUIRED",
      intent: "REGISTER_BIRTH",
      confidence: 0.86,
      message: `Voy a registrar parto de ${detectedEarTag} y alta de cría ${calfEarTag}.`,
      preview: { title: "Registro de parto", sections: [{ label: "Madre", value: detectedEarTag }, { label: "Cría", value: calfEarTag }, { label: "Sexo", value: sex }, { label: "Peso", value: weightMatch?.[1] ? `${weightMatch[1]} kg` : "Sin informar", severity: weightMatch?.[1] ? "normal" : "warning" }] },
      confirmation: { token: confirmation.confirmationToken, actionLabel: "Hacelo", cancelLabel: "Cancelar", riskLevel: "HIGH" },
    });
  }

  if (detectedEarTag && /\b(tratamiento|tratar|medicar|medicacion|antibiotico|antibiótico|medicamento|ivermectina|desparasitar|desparasitacion|inyect[aeo]r?|inyeccion|inyección)\b/.test(normalized) && !/\b(muerte|muerto|baja|pario|parto|nacimiento)\b/.test(normalized)) {
    const paddockName = extractPaddockNameFromText(prompt);
    const productMatch =
      prompt.match(/\b(?:con|de)\b\s+([a-záéíóúñ0-9]+(?:\s+[a-záéíóúñ0-9]+){0,2}?)(?=\s+(?:potrero|en\s+potrero)|[,.]|$)/i)
      ?? prompt.match(/(?:tratamiento|medicamento|antibiotico|inyeccion)\s+([a-záéíóúñ0-9]+(?:\s+[a-záéíóúñ0-9]+){0,2}?)(?=\s+(?:potrero|en\s+potrero)|[,.]|$)/i);
    const product = productMatch?.[1]?.trim() || null;
    const doseMatch = prompt.match(/(\d+(?:[.,]\d+)?)\s*(?:mg|ml|cc|cm3|dosis)/i);
    const dose = doseMatch ? doseMatch[0].trim() : null;
    const confirmation = await buildFieldConfirmation({
      establishmentId: body.data.establishmentId,
      confirmationToken: `field-${randomUUID()}`,
      intent: "REGISTER_TREATMENT",
      action: "register_treatment",
      payload: { earTag: detectedEarTag, product, dose, paddockName, notes: prompt },
    });
    return reply.send({
      mode: "CONFIRMATION_REQUIRED",
      intent: "REGISTER_TREATMENT",
      confidence: 0.82,
      message: `Voy a registrar tratamiento${product ? ` con ${product}` : ""} para ${detectedEarTag}. Confirmá para guardar el evento sanitario.`,
      preview: { title: "Tratamiento individual", sections: [{ label: "Caravana", value: detectedEarTag }, { label: "Producto", value: product ?? "Sin especificar", severity: product ? "normal" : "warning" }, { label: "Dosis", value: dose ?? "Sin informar", severity: dose ? "normal" : "warning" }, { label: "Potrero", value: paddockName ?? "Sin identificar", severity: paddockName ? "normal" : "warning" }] },
      confirmation: { token: confirmation.confirmationToken, actionLabel: "Hacelo", cancelLabel: "Cancelar", riskLevel: "LOW" },
    });
  }

  if (detectedEarTag && !/\b(muerte|muerto|baja|pario|parto|nacimiento)\b/.test(normalized)) {
    const weightMatch = prompt.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|kilos?)/i);
    if (weightMatch || /\b(peso|pesa|pesó|pesaje|pesar)\b/.test(normalized)) {
      const weight = weightMatch ? Number(weightMatch[1].replace(",", ".")) : null;
      if (!weight) {
        return reply.send({ mode: "MISSING_DATA", intent: "REGISTER_WEIGHT", confidence: 0.7, message: `Detecté un pesaje para ${detectedEarTag}, pero falta el valor en kg.`, missingFields: ["peso en kg"] });
      }
      const paddockName = extractPaddockNameFromText(prompt);
      const confirmation = await buildFieldConfirmation({
        establishmentId: body.data.establishmentId,
        confirmationToken: `field-${randomUUID()}`,
        intent: "REGISTER_WEIGHT",
        action: "register_weight",
        payload: { earTag: detectedEarTag, weight, paddockName, notes: prompt },
      });
      return reply.send({
        mode: "CONFIRMATION_REQUIRED",
        intent: "REGISTER_WEIGHT",
        confidence: 0.88,
        message: `Voy a registrar ${weight} kg para ${detectedEarTag}. Confirmá para guardar el pesaje.`,
        preview: { title: "Registro de peso", sections: [{ label: "Caravana", value: detectedEarTag }, { label: "Peso", value: `${weight} kg` }, { label: "Potrero", value: paddockName ?? "Sin identificar", severity: paddockName ? "normal" : "warning" }] },
        confirmation: { token: confirmation.confirmationToken, actionLabel: "Hacelo", cancelLabel: "Cancelar", riskLevel: "LOW" },
      });
    }
  }

  const parsedCommand = parseCommand(prompt, await loadContext(body.data.establishmentId));
  if (parsedCommand.intent === "INCIDENT_REPORT" && !parsedCommand.errors.length && !parsedCommand.warnings.length) {
    const payload = parsedCommand.proposedOperations[0]?.payload ?? {};
    const paddockId = typeof payload.paddockId === "string" ? payload.paddockId : null;
    const title = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : "Incidente en campo";
    const description = typeof payload.description === "string" && payload.description.trim() ? payload.description.trim() : prompt;
    const responsible = typeof payload.responsible === "string" && payload.responsible.trim() ? payload.responsible.trim() : null;
    const actionTaken = typeof payload.actionTaken === "string" && payload.actionTaken.trim() ? payload.actionTaken.trim() : null;
    const severityRaw = typeof payload.severity === "string" ? payload.severity : "HIGH";
    const severity: IncidentSeverity = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(severityRaw)
      ? severityRaw as IncidentSeverity
      : "HIGH";
    const incidentDescription = [
      description,
      actionTaken ? `Acción tomada: ${actionTaken}` : null,
      responsible ? `Responsable informado: ${responsible}` : null,
    ].filter(Boolean).join("\n");
    const registered = await registerFieldIncident({
      establishmentId: body.data.establishmentId,
      paddockId,
      title,
      description: incidentDescription,
      severity,
      observedAt: parsedCommand.proposedOperations[0]?.occurredAt,
      source: "COMMAND",
    });
    return reply.send({
      mode: "ANSWER",
      intent: "INCIDENT_REPORT",
      confidence: parsedCommand.confidence,
      message: `Incidente registrado: ${registered.incident.title}. Se creó la tarea de seguimiento: ${registered.task.title}.`,
      incident: registered.incident,
      task: registered.task,
      parsedCommand,
    });
  }
  if (parsedCommand.intent !== "UNKNOWN") {
    return reply.send({
      mode: parsedCommand.warnings.length || parsedCommand.errors.length ? "MISSING_DATA" : "CONFIRMATION_REQUIRED",
      message: parsedCommand.warnings.length || parsedCommand.errors.length
        ? `Entendí ${parsedCommand.intent}, pero faltan datos: ${[...parsedCommand.errors, ...parsedCommand.warnings].join(" ")}`
        : `Entendí ${parsedCommand.intent}. Confirmá para aplicarlo desde el flujo operativo existente.`,
      intent: parsedCommand.intent,
      confidence: parsedCommand.confidence,
      parsedCommand,
      confirmation: parsedCommand.warnings.length || parsedCommand.errors.length ? undefined : { token: parsedCommand.confirmationToken, actionLabel: "Confirmar", cancelLabel: "Cancelar", riskLevel: "MEDIUM" },
      suggestedApiCall: parsedCommand.warnings.length || parsedCommand.errors.length ? undefined : {
        endpoint: "/commands/confirm",
        method: "POST",
        requestPreview: { establishmentId: body.data.establishmentId, confirmationToken: parsedCommand.confirmationToken, edits: { parsed: parsedCommand } },
      },
    });
  }

  const [stockRows, pendingTasks] = await Promise.all([
    loadEstablishmentStockRows(body.data.establishmentId).then((data) => data.stockRows.slice(0, 5)),
    tasks.find({ establishmentId: body.data.establishmentId, status: { $in: ["PENDING", "IN_PROGRESS", "OVERDUE"] } }).sort({ priority: -1, createdAt: -1 }).limit(5).toArray(),
  ]);
  const paddockList = await paddocks.find({ establishmentId: body.data.establishmentId }).sort({ name: 1 }).limit(8).toArray();
  return reply.send({
    mode: "ANSWER",
    intent: "UNKNOWN",
    confidence: 0.35,
    message: `Puedo ayudarte a registrar tareas, partos, bajas, vacunaciones, tratamientos, pesajes, movimientos o consultas. Contexto actual: ${paddockList.length} potreros visibles, ${stockRows.length} filas de stock y ${pendingTasks.length} tareas pendientes.`,
  });
});

app.post("/field/confirm", async (request, reply) => {
  const body = fieldConfirmSchema.safeParse(request.body);
  if (!body.success) return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  const { fieldConfirmations, traceabilityEvents, animals } = await getCollections();
  const confirmation = await fieldConfirmations.findOne({ establishmentId: body.data.establishmentId, confirmationToken: body.data.confirmationToken });
  if (!confirmation) return reply.status(404).send({ code: "NOT_FOUND", message: "Confirmación no encontrada." });
  if (confirmation.confirmedAt) return reply.status(409).send({ code: "ALREADY_CONFIRMED", message: "La confirmación ya fue aplicada." });
  if (new Date(confirmation.expiresAt).getTime() < Date.now()) return reply.status(410).send({ code: "EXPIRED", message: "La confirmación venció." });

  const now = new Date().toISOString();
  if (confirmation.intent === "CREATE_PADDOCK") {
    const rawName = String(confirmation.payload.name ?? "Potrero nuevo").trim();
    const existing = await findPaddockByName(confirmation.establishmentId, rawName);
    const paddock = existing ?? {
      id: randomUUID(),
      establishmentId: confirmation.establishmentId,
      name: rawName,
      createdAt: now,
      updatedAt: now,
    };
    if (!existing) await insertPaddock(paddock);
    await appendActivityFeed({
      establishmentId: confirmation.establishmentId,
      activityType: "PADDOCK_CREATED",
      title: `Potrero creado: ${paddock.name}`,
      summary: `Alta desde modo campo${confirmation.payload.areaHa ? ` · ${confirmation.payload.areaHa} ha` : ""}`,
      occurredAt: now,
      priority: "MEDIUM",
      status: "INFO",
      sourceCollection: "paddocks",
      sourceId: paddock.id,
      earTag: null,
      paddockId: paddock.id,
      paddockName: paddock.name,
    });
    await createFieldTask({ establishmentId: confirmation.establishmentId, title: `Completar ficha de ${paddock.name}`, description: "Agregar GPS, aguada, pastura y capacidad de carga sugerida.", type: "INFRASTRUCTURE", priority: "LOW", paddockId: paddock.id, paddockName: paddock.name, source: "SYSTEM_RULE" });
    await fieldConfirmations.updateOne({ id: confirmation.id }, { $set: { confirmedAt: now } });
    return reply.send({ summary: `Potrero ${paddock.name} registrado.`, paddock });
  }

  if (confirmation.intent === "REGISTER_VACCINATION") {
    const { healthEvents, herds } = await getCollections();
    const product = String(confirmation.payload.product ?? "Vacuna").trim();
    const paddockName = typeof confirmation.payload.paddockName === "string" ? confirmation.payload.paddockName : null;
    const paddock = paddockName ? await findPaddockByName(confirmation.establishmentId, paddockName) : null;
    const stockRows = paddock ? await herds.find({ paddockId: paddock.id }).toArray() : [];
    const qty = stockRows.reduce((total, row) => total + row.count, 0) || 1;
    const event: HealthEvent = {
      id: randomUUID(),
      establishmentId: confirmation.establishmentId,
      type: "VACCINATION",
      category: paddock ? `LOTE ${paddock.name}` : "LOTE",
      qty,
      product,
      dose: null,
      route: null,
      notes: String(confirmation.payload.notes ?? "Vacunación por lote desde modo campo"),
      supplyId: null,
      supplyBatchId: null,
      quantityUsed: null,
      unit: null,
      responsible: null,
      occurredAt: now,
      nextDueAt: null,
      status: "COMPLETED",
      source: "COMMAND",
      createdAt: now,
      updatedAt: now,
    };
    await healthEvents.insertOne(event);
    await appendActivityFeed({ establishmentId: confirmation.establishmentId, activityType: "HEALTH_EVENT_CREATED", title: `Vacunación: ${product}`, summary: `${qty} cabeza${qty === 1 ? "" : "s"}${paddock ? ` · ${paddock.name}` : ""}`, occurredAt: now, priority: "MEDIUM", status: "DONE", sourceCollection: "health_events", sourceId: event.id, earTag: null, paddockId: paddock?.id ?? null, paddockName: paddock?.name ?? paddockName });
    await createFieldTask({ establishmentId: confirmation.establishmentId, title: `Programar próxima dosis ${product}`, description: "Revisar calendario sanitario y fecha de próxima campaña.", type: "HEALTH", priority: "LOW", paddockId: paddock?.id ?? null, paddockName: paddock?.name ?? paddockName, source: "SYSTEM_RULE", sourceEventId: event.id });
    await fieldConfirmations.updateOne({ id: confirmation.id }, { $set: { confirmedAt: now } });
    return reply.send({ summary: `Vacunación ${product} registrada para ${qty} cabeza${qty === 1 ? "" : "s"}.`, event });
  }

  if (confirmation.intent === "REGISTER_DEATH") {
    const earTag = String(confirmation.payload.earTag ?? "").trim().toUpperCase();
    const paddockName = typeof confirmation.payload.paddockName === "string" ? confirmation.payload.paddockName : null;
    let paddockId: string | null = null;
    let normalizedPaddockName: string | null = paddockName;
    if (paddockName) {
      const paddock = await findPaddockByName(confirmation.establishmentId, paddockName);
      if (paddock) { paddockId = paddock.id; normalizedPaddockName = paddock.name; }
    }
    const event: TraceabilityEvent = { id: randomUUID(), establishmentId: confirmation.establishmentId, earTag, type: "MUERTE", paddockId, paddockName: normalizedPaddockName, product: null, dose: null, weight: null, destination: null, notes: String(confirmation.payload.notes ?? "Baja por muerte"), occurredAt: now, source: "COMANDO_IA", createdBy: null, createdAt: now };
    await traceabilityEvents.insertOne(event);
    await animals.updateOne({ establishmentId: confirmation.establishmentId, earTag }, { $set: { status: "MUERTO", updatedAt: now } });
    await appendActivityFeed({ establishmentId: confirmation.establishmentId, activityType: "TRACEABILITY_EVENT_CREATED", title: `Baja por muerte: ${earTag}`, summary: event.notes ?? "Muerte registrada", occurredAt: now, priority: "URGENT", status: "CRITICAL", sourceCollection: "traceability_events", sourceId: event.id, earTag, paddockId, paddockName: normalizedPaddockName });
    await ensureSystemTaskForTraceabilityEvent(event);
    await fieldConfirmations.updateOne({ id: confirmation.id }, { $set: { confirmedAt: now } });
    return reply.send({ summary: `Baja de ${earTag} registrada y tarea urgente creada.`, event });
  }

  if (confirmation.intent === "REGISTER_BIRTH") {
    const motherEarTag = String(confirmation.payload.motherEarTag ?? "").trim().toUpperCase();
    const calfEarTag = String(confirmation.payload.calfEarTag ?? "").trim().toUpperCase();
    const calfSex = ["MACHO", "HEMBRA", "OTRO"].includes(String(confirmation.payload.calfSex)) ? confirmation.payload.calfSex as Animal["sex"] : "OTRO";
    const duplicatedCalf = await animals.findOne({ establishmentId: confirmation.establishmentId, earTag: calfEarTag });
    if (duplicatedCalf) return reply.status(409).send({ code: "EAR_TAG_ALREADY_EXISTS", message: "La caravana de la cría ya existe." });
    const calf: Animal = { id: randomUUID(), establishmentId: confirmation.establishmentId, earTag: calfEarTag, name: calfEarTag, sex: calfSex, breed: null, birthDate: now, category: calfSex === "HEMBRA" ? "TERNERAS" : calfSex === "MACHO" ? "TERNEROS" : "TERNEROS", status: "ACTIVO", notes: `Cría de ${motherEarTag}. ${String(confirmation.payload.notes ?? "")}`.trim(), createdAt: now, updatedAt: now };
    await animals.insertOne(calf);
    await animals.updateOne({ establishmentId: confirmation.establishmentId, earTag: motherEarTag }, { $set: { updatedAt: now, notes: `Parió cría ${calfEarTag}` } });
    const motherEvent: TraceabilityEvent = { id: randomUUID(), establishmentId: confirmation.establishmentId, earTag: motherEarTag, type: "OBSERVACION", paddockId: null, paddockName: typeof confirmation.payload.paddockName === "string" ? confirmation.payload.paddockName : null, product: null, dose: null, weight: null, destination: null, notes: `Parto registrado. Cría ${calfEarTag}.`, occurredAt: now, source: "COMANDO_IA", createdBy: null, createdAt: now };
    const calfEvent: TraceabilityEvent = { id: randomUUID(), establishmentId: confirmation.establishmentId, earTag: calfEarTag, type: "OBSERVACION", paddockId: null, paddockName: typeof confirmation.payload.paddockName === "string" ? confirmation.payload.paddockName : null, product: null, dose: null, weight: typeof confirmation.payload.calfWeightKg === "number" ? confirmation.payload.calfWeightKg : null, destination: null, notes: `Nacimiento. Madre ${motherEarTag}.`, occurredAt: now, source: "COMANDO_IA", createdBy: null, createdAt: now };
    await traceabilityEvents.insertMany([motherEvent, calfEvent]);
    await appendActivityFeed({ establishmentId: confirmation.establishmentId, activityType: "TRACEABILITY_EVENT_CREATED", title: `Parto registrado: ${motherEarTag}`, summary: `Cría ${calfEarTag}${calfEvent.weight ? ` · ${calfEvent.weight} kg` : ""}`, occurredAt: now, priority: "HIGH", status: "INFO", sourceCollection: "traceability_events", sourceId: motherEvent.id, earTag: motherEarTag, paddockId: null, paddockName: motherEvent.paddockName });
    await createFieldTask({ establishmentId: confirmation.establishmentId, title: `Chequeo veterinario cría ${calfEarTag}`, description: `Revisar cría de ${motherEarTag}, ombligo, calostrado y estado general.`, type: "BIRTH_FOLLOW_UP", priority: "HIGH", earTag: calfEarTag, source: "SYSTEM_RULE", sourceEventId: calfEvent.id });
    await fieldConfirmations.updateOne({ id: confirmation.id }, { $set: { confirmedAt: now } });
    return reply.send({ summary: `Parto registrado: madre ${motherEarTag}, cría ${calfEarTag}.`, calf, events: [motherEvent, calfEvent] });
  }

  if (confirmation.intent === "REGISTER_TREATMENT") {
    const earTag = String(confirmation.payload.earTag ?? "").trim().toUpperCase();
    const product = typeof confirmation.payload.product === "string" ? confirmation.payload.product.trim() : null;
    const dose = typeof confirmation.payload.dose === "string" ? confirmation.payload.dose.trim() : null;
    const paddockName = typeof confirmation.payload.paddockName === "string" ? confirmation.payload.paddockName : null;
    let paddockId: string | null = null;
    if (paddockName) {
      const paddock = await findPaddockByName(confirmation.establishmentId, paddockName);
      if (paddock) paddockId = paddock.id;
    }
    const event: TraceabilityEvent = { id: randomUUID(), establishmentId: confirmation.establishmentId, earTag, type: "TRATAMIENTO", paddockId, paddockName, product, dose, weight: null, destination: null, notes: String(confirmation.payload.notes ?? "Tratamiento individual desde modo campo"), occurredAt: now, source: "COMANDO_IA", createdBy: null, createdAt: now };
    await traceabilityEvents.insertOne(event);
    await appendActivityFeed({ establishmentId: confirmation.establishmentId, activityType: "TRACEABILITY_EVENT_CREATED", title: `Tratamiento: ${earTag}`, summary: `${product ?? "Producto sin especificar"}${dose ? ` · ${dose}` : ""}${paddockName ? ` · ${paddockName}` : ""}`, occurredAt: now, priority: "MEDIUM", status: "DONE", sourceCollection: "traceability_events", sourceId: event.id, earTag, paddockId, paddockName });
    await createFieldTask({ establishmentId: confirmation.establishmentId, title: `Seguimiento tratamiento ${earTag}`, description: `Verificar respuesta al tratamiento${product ? ` con ${product}` : ""} y evolución del animal.`, type: "HEALTH", priority: "HIGH", earTag, paddockId: paddockId ?? null, paddockName: paddockName ?? null, source: "SYSTEM_RULE", sourceEventId: event.id });
    await fieldConfirmations.updateOne({ id: confirmation.id }, { $set: { confirmedAt: now } });
    return reply.send({ summary: `Tratamiento${product ? ` con ${product}` : ""} registrado para ${earTag}.`, event });
  }

  if (confirmation.intent === "REGISTER_WEIGHT") {
    const earTag = String(confirmation.payload.earTag ?? "").trim().toUpperCase();
    const weight = typeof confirmation.payload.weight === "number" ? confirmation.payload.weight : null;
    const paddockName = typeof confirmation.payload.paddockName === "string" ? confirmation.payload.paddockName : null;
    let paddockId: string | null = null;
    if (paddockName) {
      const paddock = await findPaddockByName(confirmation.establishmentId, paddockName);
      if (paddock) paddockId = paddock.id;
    }
    const event: TraceabilityEvent = { id: randomUUID(), establishmentId: confirmation.establishmentId, earTag, type: "PESAJE", paddockId, paddockName, product: null, dose: null, weight, destination: null, notes: String(confirmation.payload.notes ?? "Pesaje desde modo campo"), occurredAt: now, source: "COMANDO_IA", createdBy: null, createdAt: now };
    await traceabilityEvents.insertOne(event);
    await animals.updateOne({ establishmentId: confirmation.establishmentId, earTag }, { $set: { updatedAt: now } });
    await appendActivityFeed({ establishmentId: confirmation.establishmentId, activityType: "TRACEABILITY_EVENT_CREATED", title: `Pesaje: ${earTag}`, summary: `${weight} kg${paddockName ? ` · ${paddockName}` : ""}`, occurredAt: now, priority: "LOW", status: "INFO", sourceCollection: "traceability_events", sourceId: event.id, earTag, paddockId, paddockName });
    await fieldConfirmations.updateOne({ id: confirmation.id }, { $set: { confirmedAt: now } });
    return reply.send({ summary: `Pesaje registrado: ${earTag} = ${weight} kg.`, event });
  }

  return reply.status(400).send({ code: "UNSUPPORTED_CONFIRMATION", message: "La confirmación no tiene un handler disponible." });
});


app.post("/commands/parse", async (request, reply) => {
  const body = parseSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({
      code: "VALIDATION_ERROR",
      issues: body.error.issues,
    });
  }
  try {
    const establishment = await findEstablishmentById(body.data.establishmentId);
    if (!establishment) {
      return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });
    }

    const commandContext = await loadContext(body.data.establishmentId);
    const parsed = parseCommand(body.data.text, commandContext);
    return reply.send(parsed);
  } catch (parseError) {
    request.log.error(parseError, "Fallo parseando /commands/parse");
    return reply.status(500).send({
      code: "COMMAND_PARSE_ERROR",
      message: "No se pudo interpretar el comando en este momento.",
    });
  }
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
  const failConfirm = async (statusCode: number, code: string, message: string, payload?: Record<string, unknown>) => {
    await appendCommandLog({
      establishmentId: body.data.establishmentId,
      source: "COMMAND_CONFIRM",
      stage: "CONFIRM_ERROR",
      intent: parsed?.intent ?? null,
      message,
      payload: {
        code,
        confirmationToken: body.data.confirmationToken,
        ...(payload ?? {}),
      },
    });
    return reply.status(statusCode).send({ code, message });
  };

  if (parsed?.intent === "MOVE") {
    const movePayload = parsed.proposedOperations?.[0]?.payload ?? {};
    const quantity = Number(movePayload.qty);
    const category = typeof movePayload.category === "string" ? movePayload.category : "";
    const fromPaddockId = typeof movePayload.fromPaddockId === "string" ? movePayload.fromPaddockId : "";
    const toPaddockId = typeof movePayload.toPaddockId === "string" ? movePayload.toPaddockId : "";
    const occurredAt = parsed.proposedOperations?.[0]?.occurredAt;

    if (!quantity || !category || !fromPaddockId || !toPaddockId) {
      return failConfirm(400, "INVALID_MOVE_PAYLOAD", "No se pudo confirmar el movimiento porque faltan datos en la previsualización.");
    }

    const [fromPaddock, toPaddock] = await Promise.all([
      findPaddockById(fromPaddockId),
      findPaddockById(toPaddockId),
    ]);

    if (!fromPaddock || !toPaddock) {
      return failConfirm(404, "NOT_FOUND", "Potrero no encontrado.");
    }

    if (
      fromPaddock.establishmentId !== body.data.establishmentId ||
      toPaddock.establishmentId !== body.data.establishmentId
    ) {
      return failConfirm(400, "ESTABLISHMENT_MISMATCH", "Los potreros no pertenecen al establecimiento indicado.");
    }

    const now = new Date().toISOString();
    const fromHerd = await findHerdByPaddockCategory(fromPaddockId, category);
    if (!fromHerd || fromHerd.count < quantity) {
      return failConfirm(409, "INSUFFICIENT_STOCK", "No hay suficiente stock en el potrero de origen.");
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


  if (parsed?.intent === "SUPPLY_STOCK_IN") {
    const payload = parsed.proposedOperations?.[0]?.payload ?? {};
    const supplyName = typeof payload.supplyName === "string" ? payload.supplyName.trim() : "";
    const supplyTypeRaw = typeof payload.supplyType === "string" ? payload.supplyType : "MEDICINE";
    const supplyType: SupplyType = ["MEDICINE", "VACCINE", "DEWORMER", "FEED", "OTHER"].includes(supplyTypeRaw) ? supplyTypeRaw as SupplyType : "MEDICINE";
    const quantityInitial = Number(payload.quantityInitial);
    const unit = typeof payload.unit === "string" ? payload.unit.trim() : "";
    const expirationDate = typeof payload.expirationDate === "string" ? payload.expirationDate : "";
    const batchNumber = typeof payload.batchNumber === "string" && payload.batchNumber.trim()
      ? payload.batchNumber.trim()
      : `VOZ-${new Date().toISOString().slice(0, 10)}`;

    if (!supplyName || !quantityInitial || !unit || !expirationDate) {
      return failConfirm(400, "INVALID_SUPPLY_STOCK_PAYLOAD", "No se pudo confirmar el ingreso de stock porque faltan medicamento, cantidad, unidad o vencimiento.");
    }

    const { supplies, supplyBatches, supplyMovements } = await getCollections();
    const now = new Date().toISOString();
    const existingSupply = await supplies.findOne({
      establishmentId: body.data.establishmentId,
      name: { $regex: `^${escapeRegex(supplyName)}$`, $options: "i" },
    });
    const supply: Supply = existingSupply ?? {
      id: randomUUID(),
      establishmentId: body.data.establishmentId,
      type: supplyType,
      name: supplyName,
      activeIngredient: null,
      presentation: unit,
      unit,
      defaultDose: null,
      withdrawalPeriodDays: null,
      storageNotes: null,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };
    if (!existingSupply) {
      await supplies.insertOne(supply);
    }

    const batch: SupplyBatch = {
      id: randomUUID(),
      establishmentId: body.data.establishmentId,
      supplyId: supply.id,
      batchNumber,
      quantityInitial,
      quantityAvailable: Number(payload.quantityAvailable) || quantityInitial,
      unit,
      expirationDate,
      purchaseDate: null,
      supplier: null,
      invoiceNumber: null,
      location: null,
      status: resolveSupplyBatchStatus({ quantityAvailable: quantityInitial, quantityInitial, expirationDate, status: "AVAILABLE" }),
      notes: "Ingresado por comando de voz del supervisor.",
      createdAt: now,
      updatedAt: now,
    };
    await supplyBatches.insertOne(batch);
    await supplyMovements.insertOne({
      id: randomUUID(),
      establishmentId: body.data.establishmentId,
      supplyId: supply.id,
      batchId: batch.id,
      type: "IN",
      quantity: batch.quantityAvailable,
      unit: batch.unit,
      reason: "Alta por comando de voz",
      relatedTaskId: null,
      relatedHealthEventId: null,
      relatedTraceabilityEventId: null,
      occurredAt: now,
      createdBy: null,
      createdAt: now,
    });
    createdEventIds.push(batch.id);
  }

  if (parsed?.intent === "HEALTH_SUPPLY_CHECK") {
    const payload = parsed.proposedOperations?.[0]?.payload ?? {};
    const searchTerm = typeof payload.searchTerm === "string" ? payload.searchTerm.trim() : "";
    const requiredSupplyTypeRaw = typeof payload.requiredSupplyType === "string" ? payload.requiredSupplyType : undefined;
    const requiredSupplyType = requiredSupplyTypeRaw && ["MEDICINE", "VACCINE", "DEWORMER", "FEED", "OTHER"].includes(requiredSupplyTypeRaw)
      ? requiredSupplyTypeRaw as SupplyType
      : undefined;
    if (!searchTerm) {
      return failConfirm(400, "INVALID_SUPPLY_CHECK_PAYLOAD", "No se pudo consultar disponibilidad porque falta producto, principio activo o enfermedad.");
    }

    const { supplies, supplyBatches } = await getCollections();
    const supplyFilter: Record<string, unknown> = {
      establishmentId: body.data.establishmentId,
      status: "ACTIVE",
      $or: [
        { name: { $regex: escapeRegex(searchTerm), $options: "i" } },
        { activeIngredient: { $regex: escapeRegex(searchTerm), $options: "i" } },
        { storageNotes: { $regex: escapeRegex(searchTerm), $options: "i" } },
      ],
    };
    if (requiredSupplyType) supplyFilter.type = requiredSupplyType;
    const matchedSupplies = await supplies.find(supplyFilter).toArray();
    const batches = matchedSupplies.length
      ? await supplyBatches.find({
          establishmentId: body.data.establishmentId,
          supplyId: { $in: matchedSupplies.map((supply) => supply.id) },
          quantityAvailable: { $gt: 0 },
          expirationDate: { $gt: new Date().toISOString() },
          status: { $nin: ["EXPIRED", "CONSUMED", "DISCARDED"] },
        }).sort({ expirationDate: 1 }).toArray()
      : [];
    if (!batches.length) {
      return failConfirm(409, "SUPPLY_NOT_AVAILABLE", `No hay stock disponible y no vencido para ${searchTerm}.`);
    }
  }

  if (parsed && ["VACCINATION", "DEWORMING", "TREATMENT"].includes(parsed.intent)) {
    const payload = parsed.proposedOperations?.[0]?.payload ?? {};
    const qty = Number(payload.qty);
    const category = typeof payload.category === "string" ? payload.category : "";
    const product = typeof payload.product === "string" ? payload.product : "";
    const responsible = typeof payload.responsible === "string" ? payload.responsible.trim() : "";
    const paddockId = typeof payload.paddockId === "string" ? payload.paddockId : "";
    const dose = typeof payload.dose === "string" ? payload.dose : null;
    const occurredAt = parsed.proposedOperations?.[0]?.occurredAt;

    if (!qty || !category || !product || !responsible || !paddockId) {
      return failConfirm(400, "INVALID_HEALTH_EVENT_PAYLOAD", "No se pudo confirmar el evento sanitario porque faltan producto, responsable, potrero, categoría o cantidad.");
    }

    const paddock = await findPaddockById(paddockId);
    if (!paddock || paddock.establishmentId !== body.data.establishmentId) {
      return failConfirm(404, "NOT_FOUND", "Potrero no encontrado para registrar el evento sanitario.");
    }
    const herd = await findHerdByPaddockCategory(paddockId, category);
    if (!herd || herd.count < qty) {
      return failConfirm(409, "INSUFFICIENT_STOCK", `No hay animales suficientes en ${paddock.name} para ${category}. Disponible: ${herd?.count ?? 0}, solicitado: ${qty}.`);
    }

    const now = new Date().toISOString();
    const healthEvent: HealthEvent = {
      id: randomUUID(),
      establishmentId: body.data.establishmentId,
      type: parsed.intent,
      category,
      qty,
      product,
      dose,
      route: null,
      notes: null,
      supplyId: null,
      supplyBatchId: null,
      quantityUsed: null,
      unit: null,
      responsible,
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

  if (parsed?.intent === "INCIDENT_REPORT") {
    const payload = parsed.proposedOperations?.[0]?.payload ?? {};
    const paddockId = typeof payload.paddockId === "string" ? payload.paddockId : "";
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    const description = typeof payload.description === "string" ? payload.description.trim() : "";
    const responsible = typeof payload.responsible === "string" ? payload.responsible.trim() : "";
    const actionTaken = typeof payload.actionTaken === "string" ? payload.actionTaken.trim() : "";
    const severityRaw = typeof payload.severity === "string" ? payload.severity : "HIGH";
    const severity: IncidentSeverity = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(severityRaw)
      ? severityRaw as IncidentSeverity
      : "HIGH";
    const observedAt = parsed.proposedOperations?.[0]?.occurredAt;

    if (!paddockId || !title || !description) {
      return failConfirm(400, "INVALID_INCIDENT_PAYLOAD", "No se pudo confirmar el incidente porque faltan potrero, título o descripción.");
    }

    try {
      const registered = await registerFieldIncident({
        establishmentId: body.data.establishmentId,
        paddockId,
        title,
        description: [
          description,
          actionTaken ? `Acción tomada: ${actionTaken}` : null,
          responsible ? `Responsable: ${responsible}` : null,
        ].filter(Boolean).join("\n"),
        severity,
        observedAt,
        source: "COMMAND",
      });
      createdEventIds.push(registered.incident.id, registered.task.id);
    } catch (incidentError) {
      if (incidentError instanceof Error && incidentError.message === "PADDOCK_MISMATCH") {
        return failConfirm(400, "ESTABLISHMENT_MISMATCH", "El potrero del incidente no pertenece al establecimiento indicado.");
      }
      throw incidentError;
    }
  }

  if (parsed && ["BREEDING_START", "WEANING", "BRANDING", "SLAUGHTER_SHIPMENT"].includes(parsed.intent)) {
    const operation = parsed.proposedOperations?.[0];
    const now = new Date().toISOString();
    const payload = (operation?.payload ?? {}) as Record<string, unknown>;

    if (parsed.intent === "WEANING") {
      const qty = Number(payload.qty);
      const fromCategory = typeof payload.category === "string" ? payload.category : "";
      const toCategory = typeof payload.toCategory === "string" ? payload.toCategory : "TERNEROS_DESTETADOS";
      if (!qty || !fromCategory) {
        return failConfirm(400, "INVALID_WEANING_PAYLOAD", "No se pudo confirmar el destete porque faltan categoría o cantidad.");
      }

      const allocations = await consumeStockAcrossPaddocks(body.data.establishmentId, fromCategory, qty, now);
      if (!allocations) {
        return failConfirm(409, "INSUFFICIENT_STOCK", `No hay stock suficiente de ${fromCategory} para destetar ${qty} cabezas.`);
      }

      for (const allocation of allocations) {
        await saveHerdStock(allocation.paddockId, toCategory, allocation.quantity, now);
      }

      payload.allocations = allocations;
      payload.toCategory = toCategory;
    }

    if (parsed.intent === "SLAUGHTER_SHIPMENT") {
      const items = Array.isArray(payload.items)
        ? payload.items as Array<Record<string, unknown>>
        : [];

      const requiredByCategory = new Map<string, number>();
      for (const item of items) {
        const category = typeof item.category === "string" ? item.category : "";
        const qty = Number(item.qty);
        if (!category || !qty) {
          return failConfirm(400, "INVALID_SHIPMENT_PAYLOAD", "No se pudo confirmar la consignación porque faltan categorías o cantidades.");
        }
        requiredByCategory.set(category, (requiredByCategory.get(category) ?? 0) + qty);
      }

      for (const [category, needed] of requiredByCategory.entries()) {
        const available = await getCategoryAvailability(body.data.establishmentId, category);
        if (available < needed) {
          return failConfirm(409, "INSUFFICIENT_STOCK", `Stock insuficiente para consignación en categoría ${category}. Disponible: ${available}, requerido: ${needed}.`);
        }
      }

      const itemAllocations: Array<{ category: string; qty: number; allocations: Array<{ paddockId: string; quantity: number }> }> = [];
      for (const item of items) {
        const category = String(item.category);
        const qty = Number(item.qty);
        const allocations = await consumeStockAcrossPaddocks(body.data.establishmentId, category, qty, now);
        if (!allocations) {
          return failConfirm(409, "INSUFFICIENT_STOCK", `No se pudo descontar stock para categoría ${category}.`);
        }
        itemAllocations.push({ category, qty, allocations });
      }

      payload.allocations = itemAllocations;
    }

    const operationalEvent: OperationalEvent = {
      id: randomUUID(),
      establishmentId: body.data.establishmentId,
      kind: parsed.intent as OperationalEventKind,
      occurredAt: operation?.occurredAt ? operation.occurredAt.toISOString() : now,
      payload,
      source: "COMMAND",
      createdAt: now,
      updatedAt: now,
    };
    await insertOperationalEvent(operationalEvent);
    createdEventIds.push(operationalEvent.id);
  }

  const confirmation = await appendConfirmation({
    establishmentId: body.data.establishmentId,
    confirmationToken: body.data.confirmationToken,
    edits: body.data.edits,
    parsedIntent: parsed?.intent ?? null,
    createdEventIds,
  });

  await appendCommandLog({
    establishmentId: body.data.establishmentId,
    source: "COMMAND_CONFIRM",
    stage: "CONFIRM_SUCCESS",
    intent: parsed?.intent ?? null,
    message: createdEventIds.length
      ? "Operaciones confirmadas y aplicadas."
      : "Confirmación guardada sin operaciones automáticas.",
    payload: {
      createdEventIds,
      confirmationId: confirmation.id,
      confirmationToken: body.data.confirmationToken,
    },
  });

  return reply.send({
    applied: true,
    confirmationId: confirmation.id,
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

  const normalizedPrompt = normalizeFieldText(body.data.prompt);
  if (isAnimalTagsQuery(normalizedPrompt)) {
    const response = isAnimalTagsCountQuery(normalizedPrompt)
      ? await buildAnimalTagsCountAnswer(body.data.establishmentId)
      : await buildAnimalTagsDetailAnswer(body.data.establishmentId);
    return reply.send({ response, intent: "QUERY_ANIMAL_TAGS" });
  }

  if (isTaskCreationPrompt(normalizedPrompt)) {
    const now = new Date().toISOString();
    const scheduledAt = parseRelativeSchedule(body.data.prompt) ?? now;
    const assignedRole = extractTaskResponsibleFromText(body.data.prompt);
    const task = await createFieldTask({
      establishmentId: body.data.establishmentId,
      title: extractTaskTitle(body.data.prompt),
      description: body.data.prompt.trim(),
      type: inferTaskType(body.data.prompt),
      priority: inferTaskPriority(body.data.prompt),
      scheduledAt,
      dueDate: scheduledAt,
      assignedRole,
      paddockName: extractPaddockNameFromText(body.data.prompt),
      earTag: detectEarTagInText(body.data.prompt),
      source: "FIELD_COMMAND",
    });

    await appendCommandLog({
      establishmentId: body.data.establishmentId,
      source: "AI_CHAT",
      stage: "CONFIRM_SUCCESS",
      intent: "CREATE_TASK",
      message: "Tarea creada desde chat IA y guardada para modo campo.",
      payload: { prompt: body.data.prompt, taskId: task.id },
    });

    return reply.send({
      response: `✅ Tarea creada y guardada en backend: ${task.title}. Fecha: ${task.scheduledAt}${task.assignedRole ? `. Responsable: ${task.assignedRole}` : ". Sin responsable asignado"}. Ya queda visible en modo campo para marcarla como cumplida.`,
      task,
      suggestedApiCall: {
        action: "crear_tarea_campo",
        endpoint: "/tasks",
        method: "POST",
        requiresConfirmation: false,
        isReady: true,
        requestPreview: task,
      },
    });
  }

  // Detección de caravana individual — tiene prioridad sobre el parser de lotes
  const detectedEarTag = detectEarTagInText(body.data.prompt);
  if (detectedEarTag) {
    const { traceabilityEvents: traceabilityCol } = await getCollections();
    if (isTraceabilityQuery(body.data.prompt)) {
      const animalEvents = await traceabilityCol
        .find({ establishmentId: body.data.establishmentId, earTag: detectedEarTag })
        .sort({ occurredAt: -1 })
        .limit(20)
        .toArray();
      const summary = buildTraceabilitySummary(animalEvents, detectedEarTag);
      return reply.send({
        response: summary,
        traceabilityEvents: animalEvents,
        earTag: detectedEarTag,
      });
    }

    const paddockMatch = body.data.prompt.match(/potrero\s+([a-z0-9\s\-]+)/i);
    const detectedPaddockName = paddockMatch?.[1]?.trim() ?? "Temporal";

    if (detectAnimalRegistrationIntent(body.data.prompt)) {
      const detectedCategory = detectAnimalCategoryInText(body.data.prompt) ?? "vaquillona";
      const suggestedAnimalPayload = {
        establishmentId: body.data.establishmentId,
        earTag: detectedEarTag,
        name: `Caravana ${detectedEarTag}`,
        sex: "HEMBRA" as const,
        category: detectedCategory,
        status: "ACTIVO" as const,
        notes: body.data.prompt.trim(),
      };
      const suggestedTraceabilityPayload = {
        establishmentId: body.data.establishmentId,
        earTag: detectedEarTag,
        type: "ASIGNACION_POTRERO" as const,
        paddockName: detectedPaddockName,
        notes: `Alta automática de animal. ${body.data.prompt.trim()}`,
        source: "COMANDO_IA" as const,
        occurredAt: new Date().toISOString(),
      };

      return reply.send({
        response: `Detecté la caravana **${detectedEarTag}**. Voy a dar de alta una **${detectedCategory}** y asociarla al potrero **${detectedPaddockName}**. Confirmá con "Hacelo" para guardar.`,
        suggestedApiCall: {
          action: "registrar_animal_y_asignar_potrero",
          endpoint: "/animals + /traceability/events",
          method: "POST",
          requiresConfirmation: true,
          isReady: true,
          requestPreview: {
            animal: suggestedAnimalPayload,
            traceabilityEvent: suggestedTraceabilityPayload,
          },
        },
        earTag: detectedEarTag,
        detectedEventType: "ASIGNACION_POTRERO",
      });
    }

    const eventType = detectTraceabilityEventType(body.data.prompt);
    const productMatch = body.data.prompt.match(/(?:con|producto|vacuna)\s+([a-záéíóúñ][a-záéíóúñ\s]+)/i);
    const doseMatch = body.data.prompt.match(/(\d+(?:\.\d+)?\s?ml)/i);

    const suggestedPayload = {
      establishmentId: body.data.establishmentId,
      earTag: detectedEarTag,
      type: eventType,
      paddockName: detectedPaddockName,
      product: productMatch?.[1]?.trim() ?? null,
      dose: doseMatch?.[1] ?? null,
      notes: body.data.prompt.trim(),
      source: "COMANDO_IA" as const,
      occurredAt: new Date().toISOString(),
    };

    return reply.send({
      response: `Detecté la caravana **${detectedEarTag}**. Voy a registrar: ${TRACEABILITY_EVENT_LABELS[eventType]}. Confirmá con "Hacelo" para guardar.`,
      suggestedApiCall: {
        action: "registrar_evento_trazabilidad",
        endpoint: "/traceability/events",
        method: "POST",
        requiresConfirmation: true,
        isReady: true,
        requestPreview: suggestedPayload,
      },
      earTag: detectedEarTag,
      detectedEventType: eventType,
    });
  }

  let parsedCommand: ReturnType<typeof parseCommand> | null = null;
  let commandContext: CommandContext | null = null;
  const promptForParse = (() => {
    const currentPrompt = body.data.prompt.trim();
    const previousUserPrompt = [...(body.data.history ?? [])]
      .reverse()
      .find((message) => message.role === "user" && message.content.trim().length > 0)?.content?.trim();
    if (!previousUserPrompt) return currentPrompt;

    const currentHasActionVerb = /\b(mover|move|trasladar|pasar|destetar|consignar|embarcar|vacunar|desparasitar|tratar)\b/i.test(currentPrompt);
    const currentHasQuantity = /\b\d+\b/.test(currentPrompt);
    const currentHasSourcePaddock = /\b(del|desde)\s+potrero\b/i.test(currentPrompt);
    if (currentHasActionVerb && currentHasQuantity && currentHasSourcePaddock) {
      return currentPrompt;
    }

    return `${previousUserPrompt}. ${currentPrompt}`;
  })();

  try {
    commandContext = await loadContext(body.data.establishmentId);
    parsedCommand = parseCommand(promptForParse, commandContext);
    if ((!parsedCommand || parsedCommand.intent === "UNKNOWN") && commandContext) {
      parsedCommand = tryFallbackMoveParse(promptForParse, commandContext) ?? parsedCommand;
    }
  } catch (parseError) {
    request.log.error(parseError, "No se pudo parsear el comando en /ai/chat. Se sigue en modo conversacional.");
    await appendCommandLog({
      establishmentId: body.data.establishmentId,
      source: "AI_CHAT",
      stage: "PARSE_ERROR",
      intent: null,
      message: parseError instanceof Error ? parseError.message : "Error de parseo desconocido",
      payload: { prompt: body.data.prompt },
    });
  }

  const hasStructuredIntent = parsedCommand?.intent && parsedCommand.intent !== "UNKNOWN";
  const hasBlockingIssues = (parsedCommand?.errors?.length ?? 0) > 0 || (parsedCommand?.warnings?.length ?? 0) > 0;
  if (hasStructuredIntent && parsedCommand) {
    const actionName = parsedCommand.intent === "MOVE"
      ? "mover_stock"
      : parsedCommand.intent === "WEANING"
        ? "destetar_lote"
        : parsedCommand.intent === "SLAUGHTER_SHIPMENT"
          ? "consignar_frigorifico"
          : parsedCommand.intent === "VACCINATION"
            ? "registrar_vacunacion"
            : parsedCommand.intent === "DEWORMING"
              ? "registrar_desparasitacion"
              : parsedCommand.intent === "TREATMENT"
                ? "registrar_tratamiento"
                : parsedCommand.intent === "SUPPLY_STOCK_IN"
                  ? "ingresar_stock_insumo"
                  : parsedCommand.intent === "HEALTH_SUPPLY_CHECK"
                    ? "consultar_disponibilidad_sanitaria"
                    : "registrar_evento_operativo";

    await appendCommandLog({
      establishmentId: body.data.establishmentId,
      source: "AI_CHAT",
      stage: "PARSED",
      intent: parsedCommand.intent,
      message: hasBlockingIssues
        ? "Comando detectado con datos faltantes."
        : "Comando detectado y listo para confirmar.",
      payload: {
        prompt: body.data.prompt,
        warnings: parsedCommand.warnings ?? [],
        errors: parsedCommand.errors ?? [],
      },
    });

    return reply.send({
      response: hasBlockingIssues
        ? `Entendí un comando operativo (${parsedCommand.intent}) pero faltan datos: ${[
          ...(parsedCommand.errors ?? []),
          ...(parsedCommand.warnings ?? []),
        ].join(" ")}`
        : `Entendí el comando operativo (${parsedCommand.intent}). Puedo convertirlo en llamada API y dejarlo listo para confirmar.`,
      suggestedApiCall: {
        action: actionName,
        endpoint: "/commands/confirm",
        method: "POST",
        requiresConfirmation: true,
        isReady: !hasBlockingIssues,
        missingOrInvalidFields: [
          ...(parsedCommand.errors ?? []),
          ...(parsedCommand.warnings ?? []),
        ],
        requestPreview: {
          establishmentId: body.data.establishmentId,
          confirmationToken: parsedCommand.confirmationToken,
          edits: {
            parsed: parsedCommand,
          },
        },
      },
      parsedCommand,
    });
  }

  const operationalNudge = detectOperationalNudge(
    body.data.prompt,
    commandContext?.paddocks.map((paddock) => paddock.name) ?? [],
  );
  if (operationalNudge) {
    await appendCommandLog({
      establishmentId: body.data.establishmentId,
      source: "AI_CHAT",
      stage: "PARSED",
      intent: null,
      message: "Solicitud operativa detectada sin datos suficientes para parseo estructurado.",
      payload: { prompt: body.data.prompt },
    });
    return reply.send({ response: operationalNudge });
  }

  const [snapshot, behaviors] = await Promise.all([
    buildEstablishmentSnapshot(body.data.establishmentId),
    loadAIBehaviors(body.data.establishmentId),
  ]);
  const messages: AIMessage[] = [
    ...(body.data.history ?? []),
    { role: "user", content: body.data.prompt },
  ];

  try {
    const response = await callOpenAIChat(messages, snapshot, establishment, behaviors);
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

app.get("/ai/behaviors", async (request, reply) => {
  const establishmentId = z.string().uuid().safeParse((request.query as { establishmentId?: string }).establishmentId);
  if (!establishmentId.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", message: "establishmentId inválido." });
  }
  const establishment = await findEstablishmentById(establishmentId.data);
  if (!establishment) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });
  }
  const behaviors = await loadAIBehaviors(establishmentId.data);
  return { behaviors };
});

app.post("/ai/behaviors", async (request, reply) => {
  const body = aiBehaviorSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }

  const establishment = await findEstablishmentById(body.data.establishmentId);
  if (!establishment) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });
  }

  const now = new Date().toISOString();
  const behavior: AIBehavior = {
    id: randomUUID(),
    establishmentId: body.data.establishmentId,
    trigger: body.data.trigger.trim(),
    expectedBehavior: body.data.expectedBehavior.trim(),
    notes: body.data.notes?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };

  await insertAIBehavior(behavior);
  return reply.status(201).send(behavior);
});

app.get("/supplies", async (request, reply) => {
  const query = request.query as { establishmentId?: string; type?: SupplyType; status?: SupplyStatus; search?: string };
  if (!query.establishmentId) return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Falta establishmentId." });
  const { supplies } = await getCollections();
  const filter: Record<string, unknown> = { establishmentId: query.establishmentId };
  if (query.type) filter.type = query.type;
  if (query.status) filter.status = query.status;
  if (query.search) filter.name = { $regex: query.search, $options: "i" };
  const list = await supplies.find(filter).sort({ name: 1 }).toArray();
  return { supplies: list };
});


app.get("/supplies/availability", async (request, reply) => {
  const query = request.query as { establishmentId?: string; query?: string; type?: SupplyType; quantityRequired?: string; unit?: string };
  if (!query.establishmentId) return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Falta establishmentId." });
  const search = query.query?.trim();
  if (!search) return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Falta query de producto, principio activo o enfermedad." });

  const { supplies, supplyBatches } = await getCollections();
  const supplyFilter: Record<string, unknown> = {
    establishmentId: query.establishmentId,
    status: "ACTIVE",
    $or: [
      { name: { $regex: escapeRegex(search), $options: "i" } },
      { activeIngredient: { $regex: escapeRegex(search), $options: "i" } },
      { storageNotes: { $regex: escapeRegex(search), $options: "i" } },
    ],
  };
  if (query.type) supplyFilter.type = query.type;

  const matchedSupplies = await supplies.find(supplyFilter).sort({ name: 1 }).toArray();
  const supplyIds = matchedSupplies.map((supply) => supply.id);
  const now = new Date().toISOString();
  const batches = supplyIds.length
    ? await supplyBatches.find({
        establishmentId: query.establishmentId,
        supplyId: { $in: supplyIds },
        quantityAvailable: { $gt: 0 },
        expirationDate: { $gt: now },
        status: { $nin: ["EXPIRED", "CONSUMED", "DISCARDED"] },
      }).sort({ expirationDate: 1 }).toArray()
    : [];
  const supplyById = new Map(matchedSupplies.map((supply) => [supply.id, supply]));
  const availableBatches = batches.map((batch) => {
    const supply = supplyById.get(batch.supplyId);
    return {
      ...batch,
      supplyName: supply?.name ?? "Insumo",
      supplyType: supply?.type ?? null,
      activeIngredient: supply?.activeIngredient ?? null,
      status: resolveSupplyBatchStatus(batch),
    };
  });
  const totalAvailable = availableBatches.reduce((sum, batch) => sum + batch.quantityAvailable, 0);
  const quantityRequired = query.quantityRequired ? Number(query.quantityRequired) : null;
  const hasEnough = quantityRequired ? totalAvailable >= quantityRequired : totalAvailable > 0;

  return {
    query: search,
    type: query.type ?? null,
    unit: query.unit ?? availableBatches[0]?.unit ?? null,
    quantityRequired,
    totalAvailable,
    hasAvailableStock: availableBatches.length > 0,
    hasEnough,
    batches: availableBatches,
    message: availableBatches.length
      ? `Hay ${totalAvailable} ${query.unit ?? availableBatches[0]?.unit ?? "unidades"} disponibles no vencidas para ${search}.`
      : `No hay stock disponible y no vencido para ${search}.`,
  };
});

app.post("/supplies", async (request, reply) => {
  const body = supplyCreateSchema.safeParse(request.body);
  if (!body.success) return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  const establishment = await findEstablishmentById(body.data.establishmentId);
  if (!establishment) return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });
  const { supplies } = await getCollections();
  const now = new Date().toISOString();
  const supply: Supply = {
    id: randomUUID(),
    establishmentId: body.data.establishmentId,
    type: body.data.type,
    name: body.data.name.trim(),
    activeIngredient: body.data.activeIngredient?.trim() || null,
    presentation: body.data.presentation?.trim() || null,
    unit: body.data.unit.trim(),
    defaultDose: body.data.defaultDose?.trim() || null,
    withdrawalPeriodDays: body.data.withdrawalPeriodDays ?? null,
    storageNotes: body.data.storageNotes?.trim() || null,
    status: body.data.status,
    createdAt: now,
    updatedAt: now,
  };
  await supplies.insertOne(supply);
  return reply.status(201).send(supply);
});

app.patch("/supplies/:id", async (request, reply) => {
  const body = supplyUpdateSchema.safeParse(request.body);
  if (!body.success) return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  const { supplies } = await getCollections();
  const existing = await supplies.findOne({ id: (request.params as { id: string }).id });
  if (!existing) return reply.status(404).send({ code: "NOT_FOUND", message: "Insumo no encontrado." });
  const updates = { ...body.data, updatedAt: new Date().toISOString() };
  await supplies.updateOne({ id: existing.id }, { $set: updates });
  return reply.send(await supplies.findOne({ id: existing.id }));
});

app.get("/supply-batches", async (request, reply) => {
  const query = request.query as { establishmentId?: string; supplyId?: string; status?: SupplyBatchStatus; expiringDays?: string };
  if (!query.establishmentId) return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Falta establishmentId." });
  const { supplyBatches, supplies } = await getCollections();
  const filter: Record<string, unknown> = { establishmentId: query.establishmentId };
  if (query.supplyId) filter.supplyId = query.supplyId;
  if (query.status) filter.status = query.status;
  if (query.expiringDays) {
    const until = new Date(Date.now() + Number(query.expiringDays) * 86400000).toISOString();
    filter.expirationDate = { $lte: until };
  }
  const [batches, supplyList] = await Promise.all([
    supplyBatches.find(filter).sort({ expirationDate: 1, createdAt: -1 }).toArray(),
    supplies.find({ establishmentId: query.establishmentId }).toArray(),
  ]);
  const names = new Map(supplyList.map((supply) => [supply.id, supply.name]));
  return { batches: batches.map((batch) => ({ ...batch, supplyName: names.get(batch.supplyId) ?? "Insumo" })) };
});

app.post("/supply-batches", async (request, reply) => {
  const body = supplyBatchCreateSchema.safeParse(request.body);
  if (!body.success) return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  const { supplies, supplyBatches, supplyMovements } = await getCollections();
  const supply = await supplies.findOne({ id: body.data.supplyId, establishmentId: body.data.establishmentId });
  if (!supply) return reply.status(404).send({ code: "NOT_FOUND", message: "Insumo no encontrado." });
  const now = new Date().toISOString();
  const quantityAvailable = body.data.quantityAvailable ?? body.data.quantityInitial;
  const status = body.data.status ?? resolveSupplyBatchStatus({ quantityAvailable, quantityInitial: body.data.quantityInitial, expirationDate: body.data.expirationDate, status: "AVAILABLE" });
  const batch: SupplyBatch = {
    id: randomUUID(),
    establishmentId: body.data.establishmentId,
    supplyId: body.data.supplyId,
    batchNumber: body.data.batchNumber.trim(),
    quantityInitial: body.data.quantityInitial,
    quantityAvailable,
    unit: body.data.unit?.trim() || supply.unit,
    expirationDate: body.data.expirationDate,
    purchaseDate: body.data.purchaseDate ?? null,
    supplier: body.data.supplier?.trim() || null,
    invoiceNumber: body.data.invoiceNumber?.trim() || null,
    location: body.data.location?.trim() || null,
    status,
    notes: body.data.notes?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
  await supplyBatches.insertOne(batch);
  await supplyMovements.insertOne({
    id: randomUUID(),
    establishmentId: batch.establishmentId,
    supplyId: batch.supplyId,
    batchId: batch.id,
    type: "IN",
    quantity: batch.quantityAvailable,
    unit: batch.unit,
    reason: "Alta inicial de lote",
    relatedTaskId: null,
    relatedHealthEventId: null,
    relatedTraceabilityEventId: null,
    occurredAt: now,
    createdBy: null,
    createdAt: now,
  });
  return reply.status(201).send(batch);
});

app.patch("/supply-batches/:id", async (request, reply) => {
  const body = supplyBatchUpdateSchema.safeParse(request.body);
  if (!body.success) return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  const { supplyBatches } = await getCollections();
  const existing = await supplyBatches.findOne({ id: (request.params as { id: string }).id });
  if (!existing) return reply.status(404).send({ code: "NOT_FOUND", message: "Lote de insumo no encontrado." });
  const updates: Partial<SupplyBatch> = { ...body.data, updatedAt: new Date().toISOString() };
  const quantityAvailable = updates.quantityAvailable ?? existing.quantityAvailable;
  const quantityInitial = updates.quantityInitial ?? existing.quantityInitial;
  const expirationDate = updates.expirationDate ?? existing.expirationDate;
  updates.status = updates.status ?? resolveSupplyBatchStatus({ ...existing, quantityAvailable, quantityInitial, expirationDate });
  await supplyBatches.updateOne({ id: existing.id }, { $set: updates });
  return reply.send(await supplyBatches.findOne({ id: existing.id }));
});

app.get("/supply-movements", async (request, reply) => {
  const query = request.query as { establishmentId?: string; supplyId?: string; batchId?: string; limit?: string };
  if (!query.establishmentId) return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Falta establishmentId." });
  const filter: Record<string, unknown> = { establishmentId: query.establishmentId };
  if (query.supplyId) filter.supplyId = query.supplyId;
  if (query.batchId) filter.batchId = query.batchId;
  const { supplyMovements } = await getCollections();
  const movements = await supplyMovements.find(filter).sort({ occurredAt: -1 }).limit(Math.min(Number(query.limit ?? 100), 500)).toArray();
  return { movements };
});

app.post("/supply-movements", async (request, reply) => {
  const body = supplyMovementCreateSchema.safeParse(request.body);
  if (!body.success) return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  try {
    const movement = await registerSupplyMovement(body.data);
    return reply.status(201).send(movement);
  } catch (error) {
    const code = error instanceof Error ? error.message : "SUPPLY_MOVEMENT_ERROR";
    const status = code === "INSUFFICIENT_SUPPLY_STOCK" ? 409 : code === "SUPPLY_BATCH_EXPIRED" ? 422 : 404;
    return reply.status(status).send({ code, message: "No se pudo registrar el movimiento de insumo." });
  }
});

app.get("/supplies/expirations", async (request, reply) => {
  const query = request.query as { establishmentId?: string; days?: string };
  if (!query.establishmentId) return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Falta establishmentId." });
  const days = Number(query.days ?? 30);
  const until = new Date(Date.now() + days * 86400000).toISOString();
  const { supplies, supplyBatches } = await getCollections();
  const [supplyList, batchList] = await Promise.all([
    supplies.find({ establishmentId: query.establishmentId }).toArray(),
    supplyBatches.find({ establishmentId: query.establishmentId, quantityAvailable: { $gt: 0 }, expirationDate: { $lte: until } }).sort({ expirationDate: 1 }).toArray(),
  ]);
  const names = new Map(supplyList.map((supply) => [supply.id, supply.name]));
  const batches = batchList.map((batch) => ({ ...batch, supplyName: names.get(batch.supplyId) ?? "Insumo", status: resolveSupplyBatchStatus(batch) }));
  return { batches, notifications: buildSupplyNotifications(batches) };
});

app.get("/notifications", async (request, reply) => {
  const query = request.query as { establishmentId?: string; days?: string };
  if (!query.establishmentId) return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Falta establishmentId." });
  const days = Number(query.days ?? 30);
  const until = new Date(Date.now() + days * 86400000).toISOString();
  const { supplies, supplyBatches, tasks } = await getCollections();
  const [supplyList, batchList, overdueTasks] = await Promise.all([
    supplies.find({ establishmentId: query.establishmentId }).toArray(),
    supplyBatches.find({ establishmentId: query.establishmentId, quantityAvailable: { $gt: 0 }, expirationDate: { $lte: until } }).sort({ expirationDate: 1 }).toArray(),
    tasks.find({ establishmentId: query.establishmentId, status: { $in: ["PENDING", "IN_PROGRESS", "OVERDUE"] }, dueDate: { $lte: new Date().toISOString() } }).sort({ dueDate: 1 }).limit(50).toArray(),
  ]);
  const names = new Map(supplyList.map((supply) => [supply.id, supply.name]));
  const supplyNotifications = buildSupplyNotifications(batchList.map((batch) => ({ ...batch, supplyName: names.get(batch.supplyId) ?? "Insumo" })));
  const taskNotifications = overdueTasks.map((task) => ({ id: `task-${task.id}`, type: "TASK_OVERDUE", severity: task.priority === "URGENT" ? "CRITICAL" : "WARNING", title: `Tarea vencida: ${task.title}`, message: task.description ?? "Pendiente de resolución.", dueDate: task.dueDate ?? task.scheduledAt ?? task.createdAt, sourceId: task.id }));
  return { notifications: [...supplyNotifications, ...taskNotifications].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()) };
});

app.post("/tasks/from-supply-expiration", async (request, reply) => {
  const body = z.object({ establishmentId: z.string().uuid(), batchId: z.string().uuid(), assignedRole: z.string().optional().nullable() }).safeParse(request.body);
  if (!body.success) return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  const { supplies, supplyBatches } = await getCollections();
  const batch = await supplyBatches.findOne({ id: body.data.batchId, establishmentId: body.data.establishmentId });
  if (!batch) return reply.status(404).send({ code: "NOT_FOUND", message: "Lote no encontrado." });
  const supply = await supplies.findOne({ id: batch.supplyId });
  const task = await createFieldTask({
    establishmentId: body.data.establishmentId,
    title: `Planificar uso: ${supply?.name ?? "insumo"} lote ${batch.batchNumber}`,
    description: `Quedan ${batch.quantityAvailable} ${batch.unit}. Vence el ${new Date(batch.expirationDate).toLocaleDateString("es-UY")}. Revisar animales/lotes destino antes del vencimiento.`,
    type: "HEALTH",
    priority: new Date(batch.expirationDate).getTime() - Date.now() <= 7 * 86400000 ? "URGENT" : "HIGH",
    dueDate: batch.expirationDate,
    scheduledAt: new Date().toISOString(),
    assignedRole: body.data.assignedRole ?? "OPERATOR",
    source: "SYSTEM_RULE",
    sourceEventId: batch.id,
  });
  return reply.status(201).send(task);
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
    supplyId: body.data.supplyId ?? null,
    supplyBatchId: body.data.supplyBatchId ?? null,
    quantityUsed: body.data.quantityUsed ?? null,
    unit: body.data.unit ?? null,
    responsible: body.data.responsible ?? null,
    occurredAt,
    nextDueAt,
    status: body.data.status ?? "COMPLETED",
    source: body.data.source ?? "MANUAL",
    createdAt: now,
    updatedAt: now,
  };
  await insertHealthEvent(healthEvent);
  if (healthEvent.supplyId && healthEvent.supplyBatchId && healthEvent.quantityUsed) {
    try {
      await registerSupplyMovement({
        establishmentId: healthEvent.establishmentId,
        supplyId: healthEvent.supplyId,
        batchId: healthEvent.supplyBatchId,
        type: "OUT",
        quantity: healthEvent.quantityUsed,
        unit: healthEvent.unit ?? undefined,
        reason: `Uso sanitario: ${healthEvent.product}`,
        relatedHealthEventId: healthEvent.id,
        occurredAt,
        createdBy: healthEvent.responsible,
      }, healthEvent.id);
    } catch (error) {
      return reply.status(409).send({ code: error instanceof Error ? error.message : "SUPPLY_MOVEMENT_ERROR", message: "Evento sanitario guardado, pero no se pudo descontar el insumo." });
    }
  }
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

app.get("/reproduction-events", async (request) => {
  const { establishmentId, type } = request.query as {
    establishmentId?: string;
    type?: ReproductionEventType;
  };
  const filter: Record<string, unknown> = {};
  if (establishmentId) filter.establishmentId = establishmentId;
  if (type) filter.type = type;
  const { reproductionEvents } = await getCollections();
  const events = await reproductionEvents.find(filter).sort({ occurredAt: -1 }).toArray();
  return { reproductionEvents: events };
});

app.post("/reproduction-events", async (request, reply) => {
  const body = reproductionEventSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }
  const establishment = await findEstablishmentById(body.data.establishmentId);
  if (!establishment) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });
  }

  if (body.data.type === "PREGNANCY_CHECK") {
    const effectiveEmptyQty = body.data.emptyQty ?? (body.data.diagnosedQty - body.data.pregnantQty);
    if (effectiveEmptyQty < 0 || body.data.pregnantQty + effectiveEmptyQty > body.data.diagnosedQty) {
      return reply.status(400).send({
        code: "INVALID_PREGNANCY_COUNTS",
        message: "Los valores de diagnóstico no son consistentes.",
      });
    }
  }

  const now = new Date().toISOString();
  const occurredAt = body.data.occurredAt ?? now;
  const event: ReproductionEvent = body.data.type === "ENTORE"
    ? {
        id: randomUUID(),
        establishmentId: body.data.establishmentId,
        type: "ENTORE",
        occurredAt,
        category: body.data.category,
        lot: body.data.lot ?? null,
        servicedQty: body.data.servicedQty,
        bullsQty: body.data.bullsQty ?? null,
        strawsQty: body.data.strawsQty ?? null,
        protocol: body.data.protocol ?? null,
        diagnosedQty: null,
        pregnantQty: null,
        emptyQty: null,
        responsible: body.data.responsible ?? null,
        notes: body.data.notes ?? null,
        source: body.data.source ?? "MANUAL",
        createdAt: now,
        updatedAt: now,
      }
    : {
        id: randomUUID(),
        establishmentId: body.data.establishmentId,
        type: "PREGNANCY_CHECK",
        occurredAt,
        category: body.data.category,
        lot: body.data.lot ?? null,
        servicedQty: null,
        bullsQty: null,
        strawsQty: null,
        protocol: null,
        diagnosedQty: body.data.diagnosedQty,
        pregnantQty: body.data.pregnantQty,
        emptyQty: body.data.emptyQty ?? (body.data.diagnosedQty - body.data.pregnantQty),
        responsible: body.data.responsible ?? null,
        notes: body.data.notes ?? null,
        source: body.data.source ?? "MANUAL",
        createdAt: now,
        updatedAt: now,
      };

  await insertReproductionEvent(event);
  return reply.status(201).send(event);
});

app.get("/incidents", async (request) => {
  const { establishmentId, paddockId, status, severity } = request.query as {
    establishmentId?: string;
    paddockId?: string;
    status?: IncidentStatus;
    severity?: IncidentSeverity;
  };
  const filter: Record<string, unknown> = {};
  if (establishmentId) filter.establishmentId = establishmentId;
  if (paddockId) filter.paddockId = paddockId;
  if (status) filter.status = status;
  if (severity) filter.severity = severity;
  const { incidents } = await getCollections();
  const items = await incidents.find(filter).sort({ observedAt: -1, createdAt: -1 }).toArray();
  return { incidents: items };
});

app.post("/incidents", async (request, reply) => {
  const body = incidentSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }

  const establishment = await findEstablishmentById(body.data.establishmentId);
  if (!establishment) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });
  }
  if (body.data.paddockId) {
    const paddock = await findPaddockById(body.data.paddockId);
    if (!paddock || paddock.establishmentId !== body.data.establishmentId) {
      return reply.status(400).send({
        code: "PADDOCK_MISMATCH",
        message: "El potrero no pertenece al establecimiento indicado.",
      });
    }
  }

  const now = new Date().toISOString();
  const incident: FieldIncident = {
    id: randomUUID(),
    establishmentId: body.data.establishmentId,
    paddockId: body.data.paddockId ?? null,
    title: body.data.title.trim(),
    description: body.data.description.trim(),
    severity: body.data.severity,
    status: body.data.status,
    observedAt: body.data.observedAt ?? now,
    resolvedAt: body.data.resolvedAt ?? null,
    mapX: body.data.mapX ?? null,
    mapY: body.data.mapY ?? null,
    source: body.data.source,
    createdAt: now,
    updatedAt: now,
  };

  const { incidents } = await getCollections();
  await incidents.insertOne(incident);
  return reply.status(201).send(incident);
});

app.patch("/incidents/:id", async (request, reply) => {
  const body = incidentUpdateSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }
  const { incidents } = await getCollections();
  const existing = await incidents.findOne({ id: request.params.id });
  if (!existing) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Incidente no encontrado." });
  }
  if (body.data.paddockId) {
    const paddock = await findPaddockById(body.data.paddockId);
    if (!paddock || paddock.establishmentId !== existing.establishmentId) {
      return reply.status(400).send({
        code: "PADDOCK_MISMATCH",
        message: "El potrero no pertenece al establecimiento del incidente.",
      });
    }
  }
  const now = new Date().toISOString();
  const updated: FieldIncident = {
    ...existing,
    ...body.data,
    title: body.data.title ? body.data.title.trim() : existing.title,
    description: body.data.description ? body.data.description.trim() : existing.description,
    updatedAt: now,
  };
  await incidents.updateOne(
    { id: request.params.id },
    {
      $set: {
        ...body.data,
        title: updated.title,
        description: updated.description,
        updatedAt: now,
      },
    },
  );
  return reply.send(updated);
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

app.get("/commands/confirmed-changes", async (request) => {
  const { establishmentId, limit } = request.query as { establishmentId?: string; limit?: string };
  const parsedLimit = Number(limit);
  const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, 200)
    : 50;
  const { confirmations } = await getCollections();
  const filter: Record<string, unknown> = {
    createdEventIds: { $exists: true, $ne: [] },
  };
  if (establishmentId) {
    filter.establishmentId = establishmentId;
  }
  const changes = await confirmations
    .find(filter)
    .sort({ confirmedAt: -1 })
    .limit(safeLimit)
    .toArray();
  return {
    changes: changes.map((change) => ({
      ...change,
      id: change.id || String((change as { _id?: { toString: () => string } })._id ?? ""),
    })),
  };
});

app.post("/commands/undo", async (request, reply) => {
  const body = undoConfirmationSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({
      code: "VALIDATION_ERROR",
      issues: body.error.issues,
    });
  }

  const { confirmations, movements, healthEvents, operationalEvents } = await getCollections();
  const confirmation = await confirmations.findOne({ id: body.data.confirmationId });

  if (!confirmation || confirmation.establishmentId !== body.data.establishmentId) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Cambio confirmado no encontrado." });
  }

  if (confirmation.undoneAt) {
    return reply.status(409).send({ code: "ALREADY_UNDONE", message: "Este cambio ya fue deshecho." });
  }

  if (!confirmation.createdEventIds.length) {
    return reply.status(400).send({ code: "NOTHING_TO_UNDO", message: "La confirmación no tiene impactos de base de datos para deshacer." });
  }

  const now = new Date().toISOString();
  const revertedEventIds: string[] = [];

  if (confirmation.parsedIntent === "MOVE") {
    const movementId = confirmation.createdEventIds[0];
    const movement = await movements.findOne({ id: movementId });
    if (!movement) {
      return reply.status(404).send({ code: "EVENT_NOT_FOUND", message: "No se encontró el movimiento original para deshacer." });
    }

    const canRevert = await ensureStockAvailable(movement.toPaddockId, movement.category, movement.quantity);
    if (!canRevert) {
      return reply.status(409).send({
        code: "INSUFFICIENT_STOCK_TO_REVERT",
        message: "No hay stock suficiente en el potrero destino para deshacer este movimiento.",
      });
    }

    await saveHerdStock(movement.toPaddockId, movement.category, -movement.quantity, now);
    await saveHerdStock(movement.fromPaddockId, movement.category, movement.quantity, now);
    await movements.deleteOne({ id: movement.id });
    revertedEventIds.push(movement.id);
  } else if (confirmation.parsedIntent && ["VACCINATION", "DEWORMING", "TREATMENT"].includes(confirmation.parsedIntent)) {
    for (const eventId of confirmation.createdEventIds) {
      const healthEvent = await healthEvents.findOne({ id: eventId, establishmentId: confirmation.establishmentId, source: "COMMAND" });
      if (!healthEvent) {
        continue;
      }
      await healthEvents.deleteOne({ id: eventId });
      revertedEventIds.push(eventId);
    }
  } else if (confirmation.parsedIntent && ["BREEDING_START", "WEANING", "BRANDING", "SLAUGHTER_SHIPMENT"].includes(confirmation.parsedIntent)) {
    const eventId = confirmation.createdEventIds[0];
    const event = await operationalEvents.findOne({ id: eventId, establishmentId: confirmation.establishmentId, source: "COMMAND" });
    if (!event) {
      return reply.status(404).send({ code: "EVENT_NOT_FOUND", message: "No se encontró el evento operativo original para deshacer." });
    }

    if (confirmation.parsedIntent === "WEANING") {
      const allocations = Array.isArray(event.payload.allocations)
        ? event.payload.allocations as Array<{ paddockId: string; quantity: number }>
        : [];
      const fromCategory = typeof event.payload.category === "string" ? event.payload.category : "";
      const toCategory = typeof event.payload.toCategory === "string" ? event.payload.toCategory : "";
      if (!allocations.length || !fromCategory || !toCategory) {
        return reply.status(409).send({ code: "INVALID_UNDO_DATA", message: "No se puede deshacer el destete porque faltan datos de asignación." });
      }

      for (const allocation of allocations) {
        const canRevert = await ensureStockAvailable(allocation.paddockId, toCategory, allocation.quantity);
        if (!canRevert) {
          return reply.status(409).send({
            code: "INSUFFICIENT_STOCK_TO_REVERT",
            message: `No hay stock suficiente de ${toCategory} para deshacer el destete en el potrero ${allocation.paddockId}.`,
          });
        }
      }

      for (const allocation of allocations) {
        await saveHerdStock(allocation.paddockId, toCategory, -allocation.quantity, now);
        await saveHerdStock(allocation.paddockId, fromCategory, allocation.quantity, now);
      }
    }

    if (confirmation.parsedIntent === "SLAUGHTER_SHIPMENT") {
      const items = Array.isArray(event.payload.allocations)
        ? event.payload.allocations as Array<{ category: string; allocations: Array<{ paddockId: string; quantity: number }> }>
        : [];
      if (!items.length) {
        return reply.status(409).send({ code: "INVALID_UNDO_DATA", message: "No se puede deshacer la consignación porque faltan asignaciones." });
      }

      for (const item of items) {
        for (const allocation of item.allocations ?? []) {
          await saveHerdStock(allocation.paddockId, item.category, allocation.quantity, now);
        }
      }
    }

    await operationalEvents.deleteOne({ id: event.id });
    revertedEventIds.push(event.id);
  } else {
    return reply.status(400).send({
      code: "UNSUPPORTED_UNDO",
      message: "Este tipo de operación todavía no soporta deshacer.",
    });
  }

  await confirmations.updateOne(
    { id: confirmation.id },
    {
      $set: {
        undoneAt: now,
        undoReason: "MANUAL_UNDO",
      },
    },
  );

  await appendCommandLog({
    establishmentId: confirmation.establishmentId,
    source: "COMMAND_CONFIRM",
    stage: "CONFIRM_SUCCESS",
    intent: confirmation.parsedIntent,
    message: "Se deshicieron cambios confirmados con impacto en base de datos.",
    payload: {
      confirmationId: confirmation.id,
      revertedEventIds,
    },
  });

  return reply.send({
    ok: true,
    confirmationId: confirmation.id,
    revertedEventIds,
    summary: "Operación deshecha correctamente.",
  });
});

app.get("/command-logs", async (request) => {
  const { establishmentId, limit } = request.query as { establishmentId?: string; limit?: string };
  const parsedLimit = Number(limit);
  const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, 200)
    : 50;
  const { commandLogs } = await getCollections();
  const logs = await commandLogs
    .find(establishmentId ? { establishmentId } : {})
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .toArray();
  return { logs };
});

const establishmentSchema = z.object({
  name: z.string().min(2),
  timezone: z.string().min(2).optional(),
  mapImageUrl: z.string().refine((value) => {
    if (value.startsWith("data:image/")) {
      return true;
    }
    return z.string().url().safeParse(value).success;
  }, "Debe ser una URL válida o una imagen en base64.").optional().nullable(),
});

const establishmentUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  timezone: z.string().min(2).optional(),
  mapImageUrl: z.string().refine((value) => {
    if (value.startsWith("data:image/")) {
      return true;
    }
    return z.string().url().safeParse(value).success;
  }, "Debe ser una URL válida o una imagen en base64.").optional().nullable(),
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
    mapImageUrl: body.data.mapImageUrl ?? null,
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
    mapImageUrl: updated.mapImageUrl ?? null,
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

app.get("/operational-events", async (request) => {
  const { establishmentId, kind, limit } = request.query as {
    establishmentId?: string;
    kind?: OperationalEventKind;
    limit?: string;
  };
  const parsedLimit = Number(limit);
  const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, 200)
    : 100;
  const filter: Record<string, unknown> = {};
  if (establishmentId) filter.establishmentId = establishmentId;
  if (kind) filter.kind = kind;
  const { operationalEvents } = await getCollections();
  const events = await operationalEvents.find(filter).sort({ occurredAt: -1 }).limit(safeLimit).toArray();
  return { operationalEvents: events };
});

app.post("/operational-events/weaning", async (request, reply) => {
  const body = manualWeaningSchema.safeParse(request.body);
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

  const now = new Date().toISOString();
  const allocations = await consumeStockAcrossPaddocks(
    body.data.establishmentId,
    body.data.fromCategory,
    body.data.qty,
    now,
  );
  if (!allocations) {
    return reply.status(409).send({
      code: "INSUFFICIENT_STOCK",
      message: `No hay stock suficiente de ${body.data.fromCategory} para destetar ${body.data.qty} cabezas.`,
    });
  }

  for (const allocation of allocations) {
    await saveHerdStock(allocation.paddockId, body.data.toCategory, allocation.quantity, now);
  }

  const event: OperationalEvent = {
    id: randomUUID(),
    establishmentId: body.data.establishmentId,
    kind: "WEANING",
    occurredAt: body.data.occurredAt ?? now,
    payload: {
      category: body.data.fromCategory,
      toCategory: body.data.toCategory,
      qty: body.data.qty,
      notes: body.data.notes ?? null,
      allocations,
    },
    source: "MANUAL",
    createdAt: now,
    updatedAt: now,
  };
  await insertOperationalEvent(event);

  const herds = await loadHerds();
  return reply.status(201).send({ ok: true, event, herds });
});

app.post("/operational-events/slaughter-shipment", async (request, reply) => {
  const body = manualSlaughterShipmentSchema.safeParse(request.body);
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

  const { consignors, slaughterhouses } = await getCollections();

  if (body.data.consignorId) {
    const consignor = await consignors.findOne({ id: body.data.consignorId });
    if (!consignor || consignor.establishmentId !== body.data.establishmentId || consignor.status !== "ACTIVE") {
      return reply.status(404).send({ code: "NOT_FOUND", message: "Consignatario no encontrado o inactivo." });
    }
  }

  if (body.data.slaughterhouseId) {
    const slaughterhouse = await slaughterhouses.findOne({ id: body.data.slaughterhouseId });
    if (!slaughterhouse || slaughterhouse.establishmentId !== body.data.establishmentId || slaughterhouse.status !== "ACTIVE") {
      return reply.status(404).send({ code: "NOT_FOUND", message: "Frigorífico no encontrado o inactivo." });
    }
  }

  const now = new Date().toISOString();
  for (const item of body.data.items) {
    const paddock = await findPaddockById(item.paddockId);
    if (!paddock || paddock.establishmentId !== body.data.establishmentId) {
      return reply.status(404).send({ code: "NOT_FOUND", message: "Potrero no encontrado para el establecimiento." });
    }
    const herd = await findHerdByPaddockCategory(item.paddockId, item.category);
    if (!herd || herd.count < item.qty) {
      return reply.status(409).send({
        code: "INSUFFICIENT_STOCK",
        message: `No hay stock suficiente en ${paddock.name} para ${item.category}. Disponible: ${herd?.count ?? 0}, solicitado: ${item.qty}.`,
      });
    }
  }

  for (const item of body.data.items) {
    const herd = await findHerdByPaddockCategory(item.paddockId, item.category);
    if (!herd) {
      return reply.status(409).send({ code: "INSUFFICIENT_STOCK", message: `No existe stock para ${item.category}.` });
    }
    await updateHerdStock(item.paddockId, item.category, herd.count - item.qty, now);
  }

  const event: OperationalEvent = {
    id: randomUUID(),
    establishmentId: body.data.establishmentId,
    kind: "SLAUGHTER_SHIPMENT",
    occurredAt: body.data.occurredAt ?? now,
    payload: {
      consignorId: body.data.consignorId ?? null,
      destination: body.data.destination,
      slaughterhouseId: body.data.slaughterhouseId ?? null,
      items: body.data.items,
      earTags: body.data.earTags,
      notes: body.data.notes ?? null,
    },
    source: "MANUAL",
    createdAt: now,
    updatedAt: now,
  };
  await insertOperationalEvent(event);

  const herds = await loadHerds();
  return reply.status(201).send({ ok: true, event, herds });
});

const movementSchema = z.object({
  establishmentId: z.string().uuid(),
  fromPaddockId: z.string().uuid(),
  toPaddockId: z.string().uuid().optional(),
  toPaddockName: z.string().min(2).max(200).optional(),
  movementTypeId: z.string().uuid().optional().nullable(),
  category: z.string().min(2),
  quantity: z.number().int().positive(),
  occurredAt: z.string().datetime().optional(),
}).superRefine((data, ctx) => {
  if (!data.toPaddockId && !data.toPaddockName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Debe indicar toPaddockId o toPaddockName.",
      path: ["toPaddockId"],
    });
  }
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
  const { establishmentId, fromPaddockId, toPaddockId, toPaddockName, movementTypeId, category, quantity, occurredAt } =
    body.data;

  const fromPaddock = await findPaddockById(fromPaddockId);
  if (!fromPaddock) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Potrero no encontrado." });
  }
  let targetPaddock = toPaddockId ? await findPaddockById(toPaddockId) : null;
  if (!targetPaddock && toPaddockName) {
    targetPaddock = await findPaddockByName(establishmentId, toPaddockName.trim());
    if (!targetPaddock) {
      const nowForPaddock = new Date().toISOString();
      targetPaddock = {
        id: randomUUID(),
        establishmentId,
        name: toPaddockName.trim(),
        createdAt: nowForPaddock,
        updatedAt: nowForPaddock,
      };
      await insertPaddock(targetPaddock);
    }
  }
  if (!targetPaddock) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Potrero destino no encontrado." });
  }
  if (fromPaddock.establishmentId !== establishmentId || targetPaddock.establishmentId !== establishmentId) {
    return reply.status(400).send({
      code: "ESTABLISHMENT_MISMATCH",
      message: "Los potreros no pertenecen al establecimiento indicado.",
    });
  }

  const now = new Date().toISOString();
  let movementType: MovementTypeMaster | null = null;
  if (movementTypeId) {
    const { movementTypes } = await getCollections();
    movementType = await movementTypes.findOne({ id: movementTypeId, establishmentId, status: "ACTIVE" });
    if (!movementType) {
      return reply.status(404).send({ code: "NOT_FOUND", message: "Tipo de movimiento no encontrado." });
    }
  }
  const fromHerd = await findHerdByPaddockCategory(fromPaddockId, category);
  if (!fromHerd || fromHerd.count < quantity) {
    return reply.status(409).send({
      code: "INSUFFICIENT_STOCK",
      message: "No hay suficiente stock en el potrero de origen.",
    });
  }
  await updateHerdStock(fromPaddockId, category, fromHerd.count - quantity, now);
  await saveHerdStock(targetPaddock.id, category, quantity, now);

  const movement: HerdMovement = {
    id: randomUUID(),
    establishmentId,
    fromPaddockId,
    toPaddockId: targetPaddock.id,
    movementTypeId: movementType?.id ?? null,
    movementType: movementType?.name ?? null,
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
    address: body.data.address ?? null,
    contactName: body.data.contactName ?? null,
    phone: body.data.phone ?? null,
    email: body.data.email ?? null,
    notes: body.data.notes ?? null,
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
    {
      $set: {
        name: updated.name,
        address: updated.address ?? null,
        contactName: updated.contactName ?? null,
        phone: updated.phone ?? null,
        email: updated.email ?? null,
        notes: updated.notes ?? null,
        status: updated.status,
        updatedAt: updated.updatedAt,
      },
    },
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
    address: body.data.address ?? null,
    contactName: body.data.contactName ?? null,
    phone: body.data.phone ?? null,
    email: body.data.email ?? null,
    notes: body.data.notes ?? null,
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
    {
      $set: {
        name: updated.name,
        address: updated.address ?? null,
        contactName: updated.contactName ?? null,
        phone: updated.phone ?? null,
        email: updated.email ?? null,
        notes: updated.notes ?? null,
        status: updated.status,
        updatedAt: updated.updatedAt,
      },
    },
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

app.get("/breeds", async (request) => {
  const { establishmentId, status } = request.query as { establishmentId?: string; status?: "ACTIVE" | "INACTIVE" };
  const { breeds } = await getCollections();
  const filter: Record<string, unknown> = {};
  if (establishmentId) filter.establishmentId = establishmentId;
  if (status) filter.status = status;
  const list = await breeds.find(filter).sort({ name: 1 }).toArray();
  return { breeds: list };
});

app.post("/breeds", async (request, reply) => {
  const body = breedSchema.safeParse(request.body);
  if (!body.success) return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  const establishment = await findEstablishmentById(body.data.establishmentId);
  if (!establishment) return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });
  const now = new Date().toISOString();
  const breed: BreedMaster = {
    id: randomUUID(),
    establishmentId: body.data.establishmentId,
    name: body.data.name.trim().toUpperCase(),
    status: body.data.status ?? "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };
  const { breeds } = await getCollections();
  await breeds.insertOne(breed);
  return reply.status(201).send(breed);
});

app.patch("/breeds/:id", async (request, reply) => {
  const body = breedUpdateSchema.safeParse(request.body);
  if (!body.success) return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  const { breeds } = await getCollections();
  const existing = await breeds.findOne({ id: request.params.id });
  if (!existing) return reply.status(404).send({ code: "NOT_FOUND", message: "Raza no encontrada." });
  const updated = {
    ...existing,
    ...body.data,
    name: body.data.name ? body.data.name.trim().toUpperCase() : existing.name,
    updatedAt: new Date().toISOString(),
  };
  await breeds.updateOne({ id: request.params.id }, { $set: { name: updated.name, status: updated.status, updatedAt: updated.updatedAt } });
  return reply.send(updated);
});

app.delete("/breeds/:id", async (request, reply) => {
  const { breeds } = await getCollections();
  const existing = await breeds.findOne({ id: request.params.id });
  if (!existing) return reply.status(404).send({ code: "NOT_FOUND", message: "Raza no encontrada." });
  await breeds.deleteOne({ id: request.params.id });
  return reply.status(204).send();
});

app.get("/movement-types", async (request) => {
  const { establishmentId, status } = request.query as { establishmentId?: string; status?: "ACTIVE" | "INACTIVE" };
  const { movementTypes } = await getCollections();
  const filter: Record<string, unknown> = {};
  if (establishmentId) filter.establishmentId = establishmentId;
  if (status) filter.status = status;
  const list = await movementTypes.find(filter).sort({ name: 1 }).toArray();
  return { movementTypes: list };
});

app.post("/movement-types", async (request, reply) => {
  const body = movementTypeSchema.safeParse(request.body);
  if (!body.success) return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  const establishment = await findEstablishmentById(body.data.establishmentId);
  if (!establishment) return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });
  const now = new Date().toISOString();
  const movementType: MovementTypeMaster = {
    id: randomUUID(),
    establishmentId: body.data.establishmentId,
    name: body.data.name.trim().toUpperCase(),
    status: body.data.status ?? "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };
  const { movementTypes } = await getCollections();
  await movementTypes.insertOne(movementType);
  return reply.status(201).send(movementType);
});

app.patch("/movement-types/:id", async (request, reply) => {
  const body = movementTypeUpdateSchema.safeParse(request.body);
  if (!body.success) return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  const { movementTypes } = await getCollections();
  const existing = await movementTypes.findOne({ id: request.params.id });
  if (!existing) return reply.status(404).send({ code: "NOT_FOUND", message: "Tipo de movimiento no encontrado." });
  const updated = {
    ...existing,
    ...body.data,
    name: body.data.name ? body.data.name.trim().toUpperCase() : existing.name,
    updatedAt: new Date().toISOString(),
  };
  await movementTypes.updateOne({ id: request.params.id }, { $set: { name: updated.name, status: updated.status, updatedAt: updated.updatedAt } });
  return reply.send(updated);
});

app.delete("/movement-types/:id", async (request, reply) => {
  const { movementTypes } = await getCollections();
  const existing = await movementTypes.findOne({ id: request.params.id });
  if (!existing) return reply.status(404).send({ code: "NOT_FOUND", message: "Tipo de movimiento no encontrado." });
  await movementTypes.deleteOne({ id: request.params.id });
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

// ─── Trazabilidad individual ──────────────────────────────────────────────────

app.post("/traceability/events", async (request, reply) => {
  const body = traceabilityEventCreateSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }
  const establishment = await findEstablishmentById(body.data.establishmentId);
  if (!establishment) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });
  }
  const { traceabilityEvents, animals } = await getCollections();
  const now = new Date().toISOString();
  const normalizedEarTag = body.data.earTag.trim().toUpperCase();

  let paddockId = body.data.paddockId ?? null;
  let paddockName = body.data.paddockName?.trim() || null;

  if (!paddockId && !paddockName) {
    paddockName = "Temporal";
  }

  if (!paddockId && paddockName) {
    const resolvedPaddock = await findPaddockByName(body.data.establishmentId, paddockName);
    if (resolvedPaddock) {
      paddockId = resolvedPaddock.id;
      paddockName = resolvedPaddock.name;
    } else {
      const nowForPaddock = new Date().toISOString();
      const createdPaddock: Paddock = {
        id: randomUUID(),
        establishmentId: body.data.establishmentId,
        name: paddockName,
        createdAt: nowForPaddock,
        updatedAt: nowForPaddock,
      };
      await insertPaddock(createdPaddock);
      paddockId = createdPaddock.id;
      paddockName = createdPaddock.name;
    }
  }

  const inferredCategory = await inferCategoryFromPaddock(paddockId);
  const existingAnimal = await animals.findOne({ establishmentId: body.data.establishmentId, earTag: normalizedEarTag });
  if (!existingAnimal) {
    const animal: Animal = {
      id: randomUUID(),
      establishmentId: body.data.establishmentId,
      earTag: normalizedEarTag,
      name: normalizedEarTag,
      sex: "OTRO",
      breed: null,
      birthDate: null,
      category: inferredCategory,
      status: body.data.type === "MUERTE" ? "MUERTO" : "ACTIVO",
      notes: "Alta automática desde modo campo",
      createdAt: now,
      updatedAt: now,
    };
    await animals.insertOne(animal);
  } else {
    const updates: Partial<Animal> = { updatedAt: now };
    if (!existingAnimal.category && inferredCategory) updates.category = inferredCategory;
    if (body.data.type === "MUERTE" && existingAnimal.status !== "MUERTO") updates.status = "MUERTO";
    await animals.updateOne({ id: existingAnimal.id }, { $set: updates });
  }

  const event: TraceabilityEvent = {
    id: randomUUID(),
    establishmentId: body.data.establishmentId,
    earTag: normalizedEarTag,
    type: body.data.type,
    paddockId,
    paddockName,
    product: body.data.product?.trim() || null,
    dose: body.data.dose?.trim() || null,
    weight: body.data.weight ?? null,
    destination: body.data.destination?.trim() || null,
    notes: body.data.notes?.trim() || null,
    occurredAt: body.data.occurredAt ?? now,
    source: body.data.source,
    createdBy: body.data.createdBy?.trim() || null,
    createdAt: now,
  };
  await traceabilityEvents.insertOne(event);
  await appendActivityFeed({
    establishmentId: event.establishmentId,
    activityType: "TRACEABILITY_EVENT_CREATED",
    title: `${TRACEABILITY_EVENT_LABELS[event.type] ?? event.type}: ${event.earTag}`,
    summary: event.notes ?? event.product ?? event.type,
    occurredAt: event.occurredAt,
    priority: event.type === "MUERTE" ? "URGENT" : event.type === "VACUNACION_PENDIENTE" ? "HIGH" : "MEDIUM",
    status: event.type === "MUERTE" ? "CRITICAL" : "INFO",
    sourceCollection: "traceability_events",
    sourceId: event.id,
    earTag: event.earTag,
    paddockId: event.paddockId,
    paddockName: event.paddockName,
  });
  await ensureSystemTaskForTraceabilityEvent(event);
  return reply.status(201).send(event);
});

app.get("/traceability/events", async (request) => {
  const query = request.query as {
    establishmentId?: string;
    earTag?: string;
    type?: string;
    fromDate?: string;
    toDate?: string;
    limit?: string;
  };
  const { traceabilityEvents } = await getCollections();
  const filter: Record<string, unknown> = {};
  if (query.establishmentId) filter.establishmentId = query.establishmentId;
  if (query.earTag) filter.earTag = query.earTag.trim().toUpperCase();
  if (query.type) filter.type = query.type;
  if (query.fromDate || query.toDate) {
    const range: Record<string, string> = {};
    if (query.fromDate) range.$gte = query.fromDate;
    if (query.toDate) range.$lte = query.toDate;
    filter.occurredAt = range;
  }
  const limit = Math.min(Number(query.limit ?? 100), 500);
  const events = await traceabilityEvents.find(filter).sort({ occurredAt: -1 }).limit(limit).toArray();
  return { events };
});

app.get("/traceability/animals/:earTag", async (request, reply) => {
  const earTag = (request.params as { earTag: string }).earTag.trim().toUpperCase();
  const establishmentId = (request.query as { establishmentId?: string }).establishmentId;
  if (!establishmentId) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Falta establishmentId." });
  }
  const { animals, traceabilityEvents } = await getCollections();
  const [animalDoc, events] = await Promise.all([
    animals.findOne({ establishmentId, earTag }),
    traceabilityEvents
      .find({ establishmentId, earTag })
      .sort({ occurredAt: -1 })
      .limit(100)
      .toArray(),
  ]);
  const summary = buildTraceabilitySummary(events, earTag);
  return {
    animal: animalDoc ?? null,
    events,
    summary,
    earTag,
  };
});

app.get("/traceability/dashboard", async (request, reply) => {
  const establishmentId = (request.query as { establishmentId?: string }).establishmentId;
  if (!establishmentId) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Falta establishmentId." });
  }
  const { traceabilityEvents, animals } = await getCollections();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [recentEvents, totalAnimals, eventsByType] = await Promise.all([
    traceabilityEvents
      .find({ establishmentId })
      .sort({ occurredAt: -1 })
      .limit(20)
      .toArray(),
    animals.countDocuments({ establishmentId, status: "ACTIVO" }),
    traceabilityEvents
      .aggregate([
        { $match: { establishmentId, occurredAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: "$type", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray(),
  ]);

  const pendingVaccinations = await traceabilityEvents.countDocuments({
    establishmentId,
    type: "VACUNACION_PENDIENTE",
    occurredAt: { $gte: thirtyDaysAgo },
  });

  const uniqueTracked = await traceabilityEvents.distinct("earTag", { establishmentId });

  return {
    totalActiveAnimals: totalAnimals,
    totalTrackedAnimals: uniqueTracked.length,
    pendingVaccinations,
    recentEvents,
    eventsByType: eventsByType.map((row) => ({ type: row._id, count: row.count })),
  };
});

app.get("/public/plans", async () => {
  await ensureDefaultPlans();
  const { subscriptionPlans } = await getCollections();
  const plans = await subscriptionPlans.find({ active: true }).sort({ sortOrder: 1, amountCents: 1 }).toArray();
  return plans.map((plan) => {
    const availableProviders = resolveAvailableProviders(plan);
    return {
    code: plan.code,
    name: plan.name,
    priceAmount: plan.amountCents > 0 ? Number((plan.amountCents / 100).toFixed(2)) : null,
    amountCents: plan.amountCents,
    currency: plan.currency,
    billingPeriodDays: plan.billingPeriodDays,
    trialDays: plan.trialDays,
    animalLimit: plan.animalLimit,
    description: plan.description,
    ctaLabel: plan.ctaLabel,
    featureList: plan.featureList,
    isDemo: plan.isDemo,
    isSelfService: !plan.isDemo && plan.code !== "ENTERPRISE",
    availableProviders,
    defaultProvider: resolveDefaultProvider(plan, availableProviders),
  };
  });
});

app.post("/public/enterprise-contact", async (request, reply) => {
  const body = enterpriseContactSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }
  const { enterpriseLeads } = await getCollections();
  const lead: EnterpriseLead = {
    id: randomUUID(),
    company: body.data.company.trim(),
    contact: body.data.contact.trim(),
    email: body.data.email.toLowerCase(),
    phone: body.data.phone?.trim() || null,
    message: body.data.message?.trim() || null,
    planCode: "ENTERPRISE",
    source: "pricing",
    createdAt: new Date().toISOString(),
  };
  await enterpriseLeads.insertOne(lead);
  return reply.status(201).send({
    id: lead.id,
    message: "Consulta registrada. Te contactaremos para coordinar la demo.",
  });
});

app.get("/billing/license", async (request, reply) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return reply.status(401).send({ code: "UNAUTHORIZED" });
  }

  await ensureDefaultPlans();
  const { subscriptionPlans, subscriptions, tenantEstablishments, animals, tenants } = await getCollections();
  const [plan, latestSubscription, links, tenant] = await Promise.all([
    subscriptionPlans.findOne({ code: session.subscription.planCode }),
    subscriptions.findOne({ tenantId: session.membership.tenantId }, { sort: { updatedAt: -1 } }),
    tenantEstablishments.find({ tenantId: session.membership.tenantId }).toArray(),
    tenants.findOne({ id: session.membership.tenantId }),
  ]);

  const establishmentIds = links.map((link) => link.establishmentId);
  const usedAnimals = establishmentIds.length > 0
    ? await animals.countDocuments({ establishmentId: { $in: establishmentIds }, status: { $ne: "MUERTO" } })
    : 0;

  return reply.send({
    tenant: {
      id: session.membership.tenantId,
      name: tenant?.name ?? session.user.fullName,
      role: session.membership.role,
    },
    license: plan ? {
      code: plan.code,
      name: plan.name,
      description: plan.description,
      ctaLabel: plan.ctaLabel,
      currency: plan.currency,
      amountCents: plan.amountCents,
      animalLimit: plan.animalLimit,
      featureList: plan.featureList,
      status: session.subscription.status,
      currentPeriodEnd: session.subscription.currentPeriodEnd,
    } : null,
    usage: {
      usedAnimals,
      animalLimit: plan?.animalLimit ?? null,
      remainingAnimals: plan?.animalLimit ? Math.max(0, plan.animalLimit - usedAnimals) : null,
      establishments: establishmentIds.length,
    },
    subscription: latestSubscription ? {
      provider: latestSubscription.provider,
      status: latestSubscription.status,
      currentPeriodStart: latestSubscription.currentPeriodStart,
      currentPeriodEnd: latestSubscription.currentPeriodEnd,
    } : null,
  });
});

app.post("/auth/register-subscription", async (request, reply) => {
  const body = registerSubscriptionSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }
  await ensureDefaultPlans();
  const { subscriptionPlans, billingCheckouts, users } = await getCollections();
  const plan = await subscriptionPlans.findOne({ code: body.data.planCode, active: true, isDemo: false });
  if (!plan) {
    return reply.status(404).send({ code: "PLAN_NOT_FOUND", message: "No existe el plan solicitado." });
  }
  const existingUser = await users.findOne({ email: body.data.email.toLowerCase() });
  if (existingUser) {
    return reply.status(409).send({ code: "EMAIL_IN_USE", message: "Ese correo ya se encuentra registrado." });
  }
  const availableProviders = resolveAvailableProviders(plan);
  const requestedProvider = body.data.billingProvider ?? resolveDefaultProvider(plan, availableProviders);
  if (!requestedProvider || !availableProviders.includes(requestedProvider)) {
    return reply.status(400).send({ code: "INVALID_PROVIDER", message: "La pasarela seleccionada no está disponible para este plan." });
  }
  const now = new Date().toISOString();
  const checkout: BillingCheckout = {
    id: randomUUID(),
    referenceId: `eg_${Date.now()}_${randomUUID().slice(0, 8)}`,
    email: body.data.email.toLowerCase(),
    fullName: body.data.fullName.trim(),
    companyName: body.data.companyName.trim(),
    planCode: plan.code,
    passwordHash: hashPassword(body.data.password),
    status: "PENDING_PAYMENT",
    tenantId: null,
    provider: requestedProvider,
    providerCustomerId: null,
    providerSubscriptionId: null,
    providerPaymentId: null,
    checkoutUrl: null,
    createdAt: now,
    updatedAt: now,
    kind: "SUBSCRIPTION",
  };

  if (requestedProvider === "mercadopago" && plan.amountCents > 0) {
    if (!isMercadoPagoConfigured()) {
      return reply.status(503).send({ code: "MERCADOPAGO_UNAVAILABLE", message: "Mercado Pago no está configurado." });
    }
    try {
      const mpSubscription = await createMercadoPagoSubscription({
        referenceId: checkout.referenceId,
        companyName: checkout.companyName,
        email: checkout.email,
        plan,
      });
      checkout.providerSubscriptionId = mpSubscription.id;
      checkout.checkoutUrl = getMercadoPagoCheckoutUrl(mpSubscription);
    } catch (error) {
      return reply.status(503).send({
        code: "MERCADOPAGO_UNAVAILABLE",
        message: error instanceof Error ? error.message : "No se pudo crear la suscripción en Mercado Pago.",
      });
    }
  }

  if (requestedProvider === "dodo" && plan.amountCents > 0) {
    if (!isDodoConfigured()) {
      return reply.status(503).send({ code: "DODO_UNAVAILABLE", message: "Dodo Payments no está configurado." });
    }
    try {
      const dodoCheckout = await createDodoCheckout({
        referenceId: checkout.referenceId,
        companyName: checkout.companyName,
        email: checkout.email,
        fullName: checkout.fullName,
        plan,
      });
      checkout.providerCustomerId = dodoCheckout.customer_id ?? null;
      checkout.providerSubscriptionId = dodoCheckout.subscription_id ?? null;
      checkout.providerPaymentId = dodoCheckout.payment_id ?? null;
      checkout.checkoutUrl = dodoCheckout.checkout_url ?? null;
    } catch (error) {
      return reply.status(503).send({
        code: "DODO_UNAVAILABLE",
        message: error instanceof Error ? error.message : "No se pudo crear el checkout en Dodo Payments.",
      });
    }
  }

  await billingCheckouts.insertOne(checkout);
  return reply.status(201).send({
    checkoutId: checkout.id,
    referenceId: checkout.referenceId,
    status: checkout.status,
    webhookUrl: "/billing/webhook",
    checkoutUrl: checkout.checkoutUrl,
    provider: checkout.provider,
    availableProviders,
    providerSubscriptionId: checkout.providerSubscriptionId,
    mercadoPago: {
      configured: isMercadoPagoConfigured(),
      publicKey: MERCADOPAGO_PUBLIC_KEY || null,
      country: MERCADOPAGO_COUNTRY,
      currency: MERCADOPAGO_CURRENCY,
    },
    plan: {
      code: plan.code,
      name: plan.name,
      amountCents: plan.amountCents,
      currency: plan.currency,
      animalLimit: plan.animalLimit,
    },
    message: checkout.checkoutUrl
      ? requestedProvider === "dodo"
        ? "Cuenta creada. Redirig? al cliente a Dodo Payments para completar el pago."
        : "Cuenta creada. Redirig? al cliente a Mercado Pago para activar la suscripci?n."
      : "Checkout pendiente creado. Env?a `referenceId` a la pasarela y confirma por webhook.",
  });
});

app.post("/auth/demo-request", async (request, reply) => {
  const body = demoRequestSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }
  await ensureDefaultPlans();
  const { subscriptionPlans, billingCheckouts } = await getCollections();
  const demoPlan = await subscriptionPlans.findOne({ code: "DEMO_5D", active: true, isDemo: true });
  if (!demoPlan) {
    return reply.status(500).send({ code: "DEMO_PLAN_MISSING", message: "No hay plan demo configurado." });
  }
  const now = new Date().toISOString();
  const plainPassword = body.data.password ?? `Demo${randomUUID().slice(0, 8)}!`;
  const checkout: BillingCheckout = {
    id: randomUUID(),
    referenceId: `demo_${Date.now()}_${randomUUID().slice(0, 8)}`,
    email: body.data.email.toLowerCase(),
    fullName: body.data.fullName.trim(),
    companyName: body.data.companyName.trim(),
    planCode: demoPlan.code,
    passwordHash: hashPassword(plainPassword),
    status: "PENDING_PAYMENT",
    tenantId: null,
    provider: null,
    providerSubscriptionId: null,
    checkoutUrl: null,
    createdAt: now,
    updatedAt: now,
    kind: "DEMO",
  };
  await billingCheckouts.insertOne(checkout);
  return reply.status(201).send({
    referenceId: checkout.referenceId,
    webhookSimulationPayload: {
      provider: "demo",
      providerEventId: `evt_${randomUUID().slice(0, 10)}`,
      eventType: "payment.succeeded",
      referenceId: checkout.referenceId,
      email: checkout.email,
    },
    generatedPassword: body.data.password ? undefined : plainPassword,
    message: "Demo creado. Invoca /billing/webhook con eventType=payment.succeeded para activar acceso.",
  });
});

app.post("/webhooks/mercadopago", async (request, reply) => {
  const payload = (request.body ?? {}) as Record<string, unknown>;
  const eventType =
    typeof payload.type === "string"
      ? payload.type
      : typeof payload.action === "string"
        ? payload.action
        : "mercadopago.unknown";
  const externalId =
    typeof payload.id === "string"
      ? payload.id
      : typeof payload.id === "number"
        ? String(payload.id)
        : typeof payload.data === "object" &&
            payload.data &&
            "id" in payload.data &&
            (typeof (payload.data as { id?: unknown }).id === "string" || typeof (payload.data as { id?: unknown }).id === "number")
          ? String((payload.data as { id: string | number }).id)
          : null;

  if (!externalId) {
    return reply.status(400).send({ code: "MERCADOPAGO_ID_MISSING", message: "Webhook de Mercado Pago sin identificador." });
  }

  if (MERCADOPAGO_WEBHOOK_SECRET) {
    const providedSecret = request.headers["x-webhook-secret"];
    if (typeof providedSecret === "string" && providedSecret !== MERCADOPAGO_WEBHOOK_SECRET) {
      return reply.status(401).send({ code: "INVALID_SIGNATURE", message: "Webhook de Mercado Pago inválido." });
    }
  }

  let providerData: MercadoPagoPreapproval;
  try {
    providerData =
      typeof payload.external_reference === "string"
        ? (payload as unknown as MercadoPagoPreapproval)
        : await fetchMercadoPagoSubscription(externalId);
  } catch (error) {
    return reply.status(502).send({
      code: "MERCADOPAGO_FETCH_FAILED",
      message: error instanceof Error ? error.message : "No se pudo consultar la suscripción en Mercado Pago.",
    });
  }

  const referenceId = providerData.external_reference;
  if (!referenceId) {
    return reply.status(400).send({
      code: "MERCADOPAGO_REFERENCE_MISSING",
      message: "La suscripción de Mercado Pago no trae external_reference.",
    });
  }

  await ensureDefaultPlans();
  const { billingEvents, billingCheckouts, users, tenants, memberships, subscriptions, subscriptionPlans, establishments, tenantEstablishments } = await getCollections();
  const existingEvent = await billingEvents.findOne({ provider: "mercadopago", providerEventId: externalId, eventType });
  if (existingEvent) {
    return reply.send({ received: true, duplicated: true, status: existingEvent.status });
  }

  const checkout =
    (await billingCheckouts.findOne({ referenceId })) ??
    (await billingCheckouts.findOne({ providerSubscriptionId: providerData.id }));

  if (!checkout) {
    await billingEvents.insertOne({
      id: randomUUID(),
      provider: "mercadopago",
      providerEventId: externalId,
      referenceId,
      eventType,
      status: "FAILED",
      payload,
      processedAt: new Date().toISOString(),
    });
    return reply.status(404).send({ code: "CHECKOUT_NOT_FOUND", message: "No existe un checkout asociado a esta suscripción." });
  }

  const mappedStatus = mapMercadoPagoStatus(providerData.status);
  const nowIso = new Date().toISOString();

  if (mappedStatus === "CANCELLED") {
    if (checkout.tenantId) {
      await subscriptions.updateMany(
        { tenantId: checkout.tenantId, status: { $in: ["ACTIVE", "TRIALING", "PAST_DUE", "PENDING"] } },
        { $set: { status: "CANCELLED", updatedAt: nowIso, cancelAt: nowIso } },
      );
    }
    await billingCheckouts.updateOne(
      { id: checkout.id },
      { $set: { provider: "mercadopago", providerSubscriptionId: providerData.id, updatedAt: nowIso } },
    );
    await billingEvents.insertOne({
      id: randomUUID(),
      provider: "mercadopago",
      providerEventId: externalId,
      referenceId,
      eventType,
      status: "PROCESSED",
      payload: providerData as unknown as Record<string, unknown>,
      processedAt: nowIso,
    });
    return reply.send({ received: true, status: "cancelled" });
  }

  if (mappedStatus !== "ACTIVE") {
    await billingCheckouts.updateOne(
      { id: checkout.id },
      {
        $set: {
          provider: "mercadopago",
          providerSubscriptionId: providerData.id,
          checkoutUrl: getMercadoPagoCheckoutUrl(providerData),
          updatedAt: nowIso,
        },
      },
    );
    await billingEvents.insertOne({
      id: randomUUID(),
      provider: "mercadopago",
      providerEventId: externalId,
      referenceId,
      eventType,
      status: "IGNORED",
      payload: providerData as unknown as Record<string, unknown>,
      processedAt: nowIso,
    });
    return reply.send({ received: true, status: mappedStatus.toLowerCase() });
  }

  const plan = await subscriptionPlans.findOne({ code: checkout.planCode, active: true });
  if (!plan) {
    return reply.status(500).send({ code: "PLAN_NOT_FOUND", message: "Plan de checkout inválido." });
  }

  const tenantId = checkout.tenantId ?? randomUUID();
  const userId = randomUUID();
  const existingUser = await users.findOne({ email: checkout.email });
  const effectiveUserId = existingUser?.id ?? userId;
  const currentPeriodEnd = providerData.next_payment_date
    ? new Date(providerData.next_payment_date).toISOString()
    : new Date(Date.now() + plan.billingPeriodDays * 86400000).toISOString();

  if (!checkout.tenantId) {
    await tenants.insertOne({
      id: tenantId,
      name: checkout.companyName,
      status: "ACTIVE",
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    const establishmentId = randomUUID();
    await establishments.insertOne({
      id: establishmentId,
      name: checkout.companyName,
      timezone: "UTC-3",
      mapImageUrl: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    await ensureDefaultHerdCategories(establishmentId, nowIso);
    await tenantEstablishments.updateOne(
      { tenantId, establishmentId },
      { $set: { tenantId, establishmentId } },
      { upsert: true },
    );
    if (!existingUser) {
      await users.insertOne({
        id: effectiveUserId,
        email: checkout.email,
        fullName: checkout.fullName,
        passwordHash: checkout.passwordHash,
        status: "ACTIVE",
        createdAt: nowIso,
        updatedAt: nowIso,
        lastLoginAt: null,
      });
    }
    await memberships.insertOne({
      id: randomUUID(),
      tenantId,
      userId: effectiveUserId,
      role: "OWNER",
      createdAt: nowIso,
    });
  }

  const existingSubscription = await subscriptions.findOne({ tenantId, providerSubscriptionId: providerData.id });
  if (existingSubscription) {
    await subscriptions.updateOne(
      { id: existingSubscription.id },
      {
        $set: {
          status: "ACTIVE",
          provider: "mercadopago",
          currentPeriodStart: existingSubscription.currentPeriodStart ?? nowIso,
          currentPeriodEnd,
          updatedAt: nowIso,
        },
      },
    );
  } else {
    await subscriptions.insertOne({
      id: randomUUID(),
      tenantId,
      planCode: plan.code,
      status: "ACTIVE",
      provider: "mercadopago",
      providerCustomerId: null,
      providerSubscriptionId: providerData.id,
      currentPeriodStart: nowIso,
      currentPeriodEnd,
      graceUntil: null,
      cancelAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  await billingCheckouts.updateOne(
    { id: checkout.id },
    {
      $set: {
        status: "COMPLETED",
        tenantId,
        provider: "mercadopago",
        providerSubscriptionId: providerData.id,
        checkoutUrl: getMercadoPagoCheckoutUrl(providerData),
        updatedAt: nowIso,
      },
    },
  );

  await billingEvents.insertOne({
    id: randomUUID(),
    provider: "mercadopago",
    providerEventId: externalId,
    referenceId,
    eventType,
    status: "PROCESSED",
    payload: providerData as unknown as Record<string, unknown>,
    processedAt: nowIso,
  });

  return reply.send({ received: true, status: "authorized", tenantId });
});

app.post("/webhooks/dodo", async (request, reply) => {
  const payload = (request.body ?? {}) as Record<string, unknown>;
  const payloadType = typeof payload.type === "string" ? payload.type : null;
  if (!payloadType) {
    return reply.status(400).send({ code: "DODO_TYPE_MISSING", message: "Webhook de Dodo sin tipo de evento." });
  }

  const data = typeof payload.data === "object" && payload.data ? payload.data as Record<string, unknown> : {};
  const nestedObject = typeof data.object === "object" && data.object ? data.object as Record<string, unknown> : {};
  const metadataSource =
    typeof nestedObject.metadata === "object" && nestedObject.metadata
      ? nestedObject.metadata as Record<string, unknown>
      : typeof data.metadata === "object" && data.metadata
        ? data.metadata as Record<string, unknown>
        : {};

  const referenceId =
    typeof metadataSource.referenceId === "string"
      ? metadataSource.referenceId
      : typeof metadataSource.reference_id === "string"
        ? metadataSource.reference_id
        : null;

  if (!referenceId) {
    return reply.status(400).send({ code: "DODO_REFERENCE_MISSING", message: "Webhook de Dodo sin referenceId en metadata." });
  }

  const providerEventId =
    typeof request.headers["webhook-id"] === "string"
      ? request.headers["webhook-id"]
      : typeof nestedObject.payment_id === "string"
        ? nestedObject.payment_id
        : typeof data.payment_id === "string"
          ? data.payment_id
          : typeof nestedObject.subscription_id === "string"
            ? nestedObject.subscription_id
            : typeof data.subscription_id === "string"
              ? data.subscription_id
              : `${payloadType}:${referenceId}`;

  const normalizedEventType =
    payloadType === "payment.succeeded" || payloadType === "payment.failed" || payloadType === "subscription.cancelled"
      ? payloadType
      : payloadType === "subscription.active" || payloadType === "subscription.renewed"
        ? "payment.succeeded"
        : payloadType === "subscription.failed"
          ? "payment.failed"
          : null;

  if (!normalizedEventType) {
    return reply.send({ received: true, ignored: true, type: payloadType });
  }

  const normalizedEvent = {
    provider: "dodo",
    providerEventId,
    eventType: normalizedEventType,
    referenceId,
    email:
      typeof nestedObject.customer_email === "string"
        ? nestedObject.customer_email
        : typeof data.customer_email === "string"
          ? data.customer_email
          : undefined,
    amountCents:
      typeof nestedObject.total_amount === "number"
        ? nestedObject.total_amount
        : typeof data.total_amount === "number"
          ? data.total_amount
          : undefined,
    currency:
      typeof nestedObject.currency === "string"
        ? nestedObject.currency
        : typeof data.currency === "string"
          ? data.currency
          : undefined,
    occurredAt: typeof payload.timestamp === "string" ? payload.timestamp : undefined,
    metadata: metadataSource,
  };

  const rawBody = JSON.stringify(normalizedEvent);
  const signature = createHmac("sha256", BILLING_WEBHOOK_SECRET).update(rawBody).digest("hex");
  const injected = await app.inject({
    method: "POST",
    url: "/billing/webhook",
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": signature,
    },
    payload: normalizedEvent,
  });

  return reply
    .status(injected.statusCode)
    .type("application/json")
    .send(injected.body ? JSON.parse(injected.body) : { received: true });
});

app.post("/billing/webhook", async (request, reply) => {
  const signature = request.headers["x-webhook-signature"];
  const rawBody = JSON.stringify(request.body ?? {});
  const expectedSignature = createHmac("sha256", BILLING_WEBHOOK_SECRET).update(rawBody).digest("hex");
  if (typeof signature !== "string" || signature !== expectedSignature) {
    return reply.status(401).send({ code: "INVALID_SIGNATURE", message: "Firma de webhook inválida." });
  }
  const body = webhookSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }
  const event = body.data;
  await ensureDefaultPlans();
  const { billingEvents, billingCheckouts, users, tenants, memberships, subscriptions, subscriptionPlans, establishments, tenantEstablishments } = await getCollections();
  const duplicated = await billingEvents.findOne({ provider: event.provider, providerEventId: event.providerEventId });
  if (duplicated) {
    return reply.send({ ok: true, duplicated: true });
  }
  const checkout = await billingCheckouts.findOne({ referenceId: event.referenceId });
  if (!checkout) {
    await billingEvents.insertOne({
      id: randomUUID(),
      provider: event.provider,
      providerEventId: event.providerEventId,
      referenceId: event.referenceId,
      eventType: event.eventType,
      status: "FAILED",
      payload: event as Record<string, unknown>,
      processedAt: new Date().toISOString(),
    });
    return reply.status(404).send({ code: "CHECKOUT_NOT_FOUND", message: "No existe el checkout asociado." });
  }
  if (event.eventType === "payment.failed") {
    await billingCheckouts.updateOne({ id: checkout.id }, { $set: { status: "FAILED", updatedAt: new Date().toISOString() } });
    await billingEvents.insertOne({
      id: randomUUID(),
      provider: event.provider,
      providerEventId: event.providerEventId,
      referenceId: event.referenceId,
      eventType: event.eventType,
      status: "PROCESSED",
      payload: event as Record<string, unknown>,
      processedAt: new Date().toISOString(),
    });
    return reply.send({ ok: true, status: "failed_recorded" });
  }
  if (event.eventType === "subscription.cancelled") {
    if (checkout.tenantId) {
      await subscriptions.updateMany({ tenantId: checkout.tenantId, status: { $in: ["ACTIVE", "TRIALING", "PAST_DUE"] } }, { $set: { status: "CANCELLED", updatedAt: new Date().toISOString() } });
    }
    await billingEvents.insertOne({
      id: randomUUID(),
      provider: event.provider,
      providerEventId: event.providerEventId,
      referenceId: event.referenceId,
      eventType: event.eventType,
      status: "PROCESSED",
      payload: event as Record<string, unknown>,
      processedAt: new Date().toISOString(),
    });
    return reply.send({ ok: true, status: "subscription_cancelled" });
  }
  const plan = await subscriptionPlans.findOne({ code: checkout.planCode, active: true });
  if (!plan) {
    return reply.status(500).send({ code: "PLAN_NOT_FOUND", message: "Plan de checkout inválido." });
  }
  const now = new Date();
  const nowIso = now.toISOString();
  const end = new Date(now.getTime() + plan.billingPeriodDays * 86400000).toISOString();
  const tenantId = checkout.tenantId ?? randomUUID();
  const userId = randomUUID();
  const existingUser = await users.findOne({ email: checkout.email });
  const effectiveUserId = existingUser?.id ?? userId;

  if (!checkout.tenantId) {
    await tenants.insertOne({
      id: tenantId,
      name: checkout.companyName,
      status: "ACTIVE",
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    const establishmentId = randomUUID();
    await establishments.insertOne({
      id: establishmentId,
      name: checkout.companyName,
      timezone: "UTC-3",
      mapImageUrl: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    await ensureDefaultHerdCategories(establishmentId, nowIso);
    await tenantEstablishments.updateOne(
      { tenantId, establishmentId },
      { $set: { tenantId, establishmentId } },
      { upsert: true },
    );
    if (!existingUser) {
      await users.insertOne({
        id: effectiveUserId,
        email: checkout.email,
        fullName: checkout.fullName,
        passwordHash: checkout.passwordHash,
        status: "ACTIVE",
        createdAt: nowIso,
        updatedAt: nowIso,
        lastLoginAt: null,
      });
    }
    await memberships.insertOne({
      id: randomUUID(),
      tenantId,
      userId: effectiveUserId,
      role: "OWNER",
      createdAt: nowIso,
    });
  }

  await subscriptions.insertOne({
    id: randomUUID(),
    tenantId,
    planCode: plan.code,
    status: plan.isDemo ? "TRIALING" : "ACTIVE",
    provider: event.provider,
    providerCustomerId: null,
    providerSubscriptionId: null,
    currentPeriodStart: nowIso,
    currentPeriodEnd: end,
    graceUntil: null,
    cancelAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  await billingCheckouts.updateOne(
    { id: checkout.id },
    {
      $set: {
        status: "COMPLETED",
        tenantId,
        updatedAt: nowIso,
      },
    },
  );

  await billingEvents.insertOne({
    id: randomUUID(),
    provider: event.provider,
    providerEventId: event.providerEventId,
    referenceId: event.referenceId,
    eventType: event.eventType,
    status: "PROCESSED",
    payload: event as Record<string, unknown>,
    processedAt: nowIso,
  });

  return reply.send({
    ok: true,
    status: "activated",
    tenantId,
    email: checkout.email,
    expiresAt: end,
  });
});


const hasLegacyAdminCookie = (request: { headers: Record<string, unknown> }) => {
  const cookies = parseCookies(typeof request.headers.cookie === "string" ? request.headers.cookie : undefined);
  return cookies.get("eg_auth") === "1";
};

const ensureAdminAccess = async (request: { headers: Record<string, unknown> }) => {
  if (hasLegacyAdminCookie(request)) {
    return { session: null as Awaited<ReturnType<typeof getSessionFromRequest>> | null, isPlatformAdmin: true };
  }
  const session = await getSessionFromRequest(request);
  if (!session) return null;
  if (session.membership.role !== "OWNER" && session.membership.role !== "ADMIN") return null;
  return { session, isPlatformAdmin: PLATFORM_ADMIN_EMAILS.has(session.user.email.toLowerCase()) };
};

type AdminCustomerRow = {
  tenantId: string;
  tenantName: string;
  tenantStatus: Tenant["status"];
  establishmentIds: string[];
  establishmentNames: string[];
  primaryEstablishmentId: string | null;
  primaryEstablishmentName: string | null;
  userCount: number;
  users: Array<{
    id: string;
    email: string;
    fullName: string;
    status: UserAccount["status"];
    role: Membership["role"];
    lastLoginAt: string | null;
  }>;
  planCode: string | null;
  subscriptionStatus: Subscription["status"] | "MISSING";
  provider: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  lastActivityAt: string | null;
  latestCheckout: {
    email: string;
    status: BillingCheckout["status"];
    provider: string | null;
    createdAt: string;
  } | null;
  alerts: string[];
};

const loadAdminCustomerRows = async (tenantId?: string | null) => {
  const { tenants, tenantEstablishments, establishments, memberships, users, subscriptions, billingCheckouts, accessLogs } = await getCollections();
  const tenantDocs = await tenants.find(tenantId ? { id: tenantId } : {}).sort({ createdAt: -1 }).toArray();
  const tenantIds = tenantDocs.map((tenant) => tenant.id);

  const [tenantEstablishmentDocs, establishmentDocs, membershipDocs, subscriptionDocs, checkoutDocs, accessLogDocs] = await Promise.all([
    tenantIds.length ? tenantEstablishments.find({ tenantId: { $in: tenantIds } }).toArray() : [],
    tenantIds.length ? establishments.find({ tenantId: { $in: tenantIds } }).toArray() : [],
    tenantIds.length ? memberships.find({ tenantId: { $in: tenantIds } }).toArray() : [],
    tenantIds.length ? subscriptions.find({ tenantId: { $in: tenantIds } }).toArray() : [],
    tenantIds.length ? billingCheckouts.find({ tenantId: { $in: tenantIds } }).toArray() : [],
    tenantIds.length ? accessLogs.find({ tenantId: { $in: tenantIds } }).sort({ createdAt: -1 }).toArray() : [],
  ]);

  const userIds = Array.from(new Set(membershipDocs.map((membership) => membership.userId)));
  const userDocs = userIds.length ? await users.find({ id: { $in: userIds } }).toArray() : [];
  const usersById = new Map(userDocs.map((user) => [user.id, user]));

  const establishmentsByTenant = new Map<string, Establishment[]>();
  for (const establishment of establishmentDocs) {
    const current = establishmentsByTenant.get(establishment.tenantId) ?? [];
    current.push(establishment);
    establishmentsByTenant.set(establishment.tenantId, current);
  }

  for (const relation of tenantEstablishmentDocs) {
    if (establishmentDocs.some((item) => item.id === relation.establishmentId)) continue;
    const current = establishmentsByTenant.get(relation.tenantId) ?? [];
    establishmentsByTenant.set(relation.tenantId, current);
  }

  const membershipsByTenant = new Map<string, Membership[]>();
  for (const membership of membershipDocs) {
    const current = membershipsByTenant.get(membership.tenantId) ?? [];
    current.push(membership);
    membershipsByTenant.set(membership.tenantId, current);
  }

  const subscriptionByTenant = new Map<string, Subscription>();
  for (const subscription of subscriptionDocs) {
    const current = subscriptionByTenant.get(subscription.tenantId);
    if (!current || current.updatedAt < subscription.updatedAt) {
      subscriptionByTenant.set(subscription.tenantId, subscription);
    }
  }

  const checkoutByTenant = new Map<string, BillingCheckout>();
  for (const checkout of checkoutDocs) {
    if (!checkout.tenantId) continue;
    const current = checkoutByTenant.get(checkout.tenantId);
    if (!current || current.updatedAt < checkout.updatedAt) {
      checkoutByTenant.set(checkout.tenantId, checkout);
    }
  }

  const accessLogByTenant = new Map<string, AccessLog>();
  for (const log of accessLogDocs) {
    if (!log.tenantId) continue;
    if (!accessLogByTenant.has(log.tenantId)) {
      accessLogByTenant.set(log.tenantId, log);
    }
  }

  return tenantDocs.map<AdminCustomerRow>((tenant) => {
    const tenantMemberships = membershipsByTenant.get(tenant.id) ?? [];
    const tenantUsers = tenantMemberships
      .map((membership) => {
        const user = usersById.get(membership.userId);
        if (!user) return null;
        return {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          status: user.status,
          role: membership.role,
          lastLoginAt: user.lastLoginAt ?? null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((left, right) => left.email.localeCompare(right.email));

    const tenantEstablishmentsList = (establishmentsByTenant.get(tenant.id) ?? []).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    const subscription = subscriptionByTenant.get(tenant.id) ?? null;
    const latestCheckout = checkoutByTenant.get(tenant.id) ?? null;
    const latestAccess = accessLogByTenant.get(tenant.id) ?? null;

    const alerts: string[] = [];
    if (tenantUsers.length === 0) alerts.push("Sin acceso creado");
    if (!subscription) alerts.push("Sin suscripcion");
    if (tenantEstablishmentsList.length === 0) alerts.push("Sin establecimientos asociados");
    if (latestCheckout && latestCheckout.status !== "COMPLETED") alerts.push("Checkout incompleto");
    if (tenantUsers.some((user) => user.status !== "ACTIVE")) alerts.push("Hay usuarios inactivos");

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantStatus: tenant.status,
      establishmentIds: tenantEstablishmentsList.map((item) => item.id),
      establishmentNames: tenantEstablishmentsList.map((item) => item.name),
      primaryEstablishmentId: tenantEstablishmentsList[0]?.id ?? null,
      primaryEstablishmentName: tenantEstablishmentsList[0]?.name ?? null,
      userCount: tenantUsers.length,
      users: tenantUsers,
      planCode: subscription?.planCode ?? null,
      subscriptionStatus: subscription?.status ?? "MISSING",
      provider: subscription?.provider ?? latestCheckout?.provider ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      createdAt: tenant.createdAt,
      lastActivityAt: latestAccess?.createdAt ?? tenantUsers.map((user) => user.lastLoginAt).filter(Boolean).sort().at(-1) ?? null,
      latestCheckout: latestCheckout
        ? {
            email: latestCheckout.email,
            status: latestCheckout.status,
            provider: latestCheckout.provider,
            createdAt: latestCheckout.createdAt,
          }
        : null,
      alerts,
    };
  });
};

app.get("/admin/users", async (request, reply) => {
  const access = await ensureAdminAccess(request);
  if (!access) {
    return reply.status(403).send({ code: "FORBIDDEN", message: "Solo administradores." });
  }
  const { users, memberships } = await getCollections();
  const tenantId = access.session?.membership.tenantId;
  const membershipFilter = tenantId ? { tenantId } : {};
  const membershipDocs = await memberships.find(membershipFilter).toArray();
  const userIds = membershipDocs.map((membership) => membership.userId);
  const userDocs = userIds.length ? await users.find({ id: { $in: userIds } }).toArray() : [];
  const usersById = new Map(userDocs.map((user) => [user.id, user]));
  const rows = membershipDocs
    .map((membership) => {
      const user = usersById.get(membership.userId);
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        status: user.status,
        role: membership.role,
        tenantId: membership.tenantId,
        lastLoginAt: user.lastLoginAt ?? null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  return reply.send({ users: rows });
});

app.get("/admin/customers", async (request, reply) => {
  const access = await ensureAdminAccess(request);
  if (!access) {
    return reply.status(403).send({ code: "FORBIDDEN", message: "Solo administradores." });
  }

  const tenantId = access.isPlatformAdmin ? null : access.session?.membership.tenantId ?? null;
  const customers = await loadAdminCustomerRows(tenantId);
  return reply.send({ customers });
});

app.get("/admin/activity", async (request, reply) => {
  const access = await ensureAdminAccess(request);
  if (!access) {
    return reply.status(403).send({ code: "FORBIDDEN", message: "Solo administradores." });
  }

  const { users, memberships, accessLogs, demoActivityLogs } = await getCollections();
  const tenantId = access.session?.membership.tenantId ?? null;
  let trackedEmails = Array.from(DEMO_READONLY_EMAILS);

  if (tenantId) {
    const membershipDocs = await memberships.find({ tenantId }).toArray();
    const userIds = membershipDocs.map((membership) => membership.userId);
    const tenantUsers = userIds.length ? await users.find({ id: { $in: userIds } }).toArray() : [];
    trackedEmails = Array.from(new Set([
      ...trackedEmails,
      ...tenantUsers.map((user) => user.email.toLowerCase()),
    ]));
  }

  const [recentAccessLogs, recentDemoActivity] = await Promise.all([
    accessLogs
      .find(tenantId ? { $or: [{ tenantId }, { email: { $in: trackedEmails } }] } : {})
      .sort({ createdAt: -1 })
      .limit(80)
      .toArray(),
    demoActivityLogs
      .find(tenantId ? { tenantId } : {})
      .sort({ createdAt: -1 })
      .limit(120)
      .toArray(),
  ]);

  return reply.send({
    accessLogs: recentAccessLogs,
    demoActivity: recentDemoActivity,
  });
});

app.get("/admin/plans", async (request, reply) => {
  const access = await ensureAdminAccess(request);
  if (!access) {
    return reply.status(403).send({ code: "FORBIDDEN", message: "Solo administradores." });
  }
  await ensureDefaultPlans();
  const { subscriptionPlans } = await getCollections();
  const plans = await subscriptionPlans.find({ active: true, isDemo: false }).sort({ sortOrder: 1, amountCents: 1 }).toArray();
  return reply.send({
    plans: plans.map((plan) => ({
      code: plan.code,
      name: plan.name,
      description: plan.description,
      amountCents: plan.amountCents,
      currency: plan.currency,
      billingPeriodDays: plan.billingPeriodDays,
      animalLimit: plan.animalLimit,
      ctaLabel: plan.ctaLabel,
      sortOrder: plan.sortOrder,
    })),
  });
});

app.post("/admin/users", async (request, reply) => {
  const access = await ensureAdminAccess(request);
  if (!access || !access.session) {
    return reply.status(403).send({ code: "FORBIDDEN", message: "Solo administradores autenticados." });
  }
  const body = adminUserCreateSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }
  const { users, memberships } = await getCollections();
  const email = body.data.email.toLowerCase();
  const existingUser = await users.findOne({ email });
  if (existingUser) {
    return reply.status(409).send({ code: "USER_EXISTS", message: "El email ya está registrado." });
  }
  const now = new Date().toISOString();
  const userId = randomUUID();
  await users.insertOne({
    id: userId,
    email,
    fullName: body.data.fullName.trim(),
    passwordHash: hashPassword(body.data.password),
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  });
  await memberships.insertOne({
    id: randomUUID(),
    tenantId: access.session.membership.tenantId,
    userId,
    role: body.data.role,
    createdAt: now,
  });
  return reply.status(201).send({ ok: true, userId });
});

app.post("/admin/customers/:tenantId/access", async (request, reply) => {
  const access = await ensureAdminAccess(request);
  if (!access) {
    return reply.status(403).send({ code: "FORBIDDEN", message: "Solo administradores." });
  }

  const params = request.params as { tenantId: string };
  if (!access.isPlatformAdmin && access.session?.membership.tenantId !== params.tenantId) {
    return reply.status(403).send({ code: "FORBIDDEN", message: "No podes administrar este cliente." });
  }

  const body = adminCustomerAccessSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }

  const { tenants, users, memberships } = await getCollections();
  const tenant = await tenants.findOne({ id: params.tenantId });
  if (!tenant) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Cliente no encontrado." });
  }

  const email = body.data.email.toLowerCase();
  const existingUser = await users.findOne({ email });
  if (existingUser) {
    const existingMembership = await memberships.findOne({ tenantId: params.tenantId, userId: existingUser.id });
    if (existingMembership) {
      return reply.status(409).send({ code: "USER_EXISTS", message: "Ese correo ya tiene acceso a este cliente." });
    }

    await memberships.insertOne({
      id: randomUUID(),
      tenantId: params.tenantId,
      userId: existingUser.id,
      role: body.data.role,
      createdAt: new Date().toISOString(),
    });

    return reply.status(201).send({ ok: true, userId: existingUser.id, reusedExistingUser: true });
  }

  const now = new Date().toISOString();
  const generatedPassword = body.data.password ?? `Linsse${randomUUID().slice(0, 8)}!`;
  const userId = randomUUID();

  await users.insertOne({
    id: userId,
    email,
    fullName: body.data.fullName.trim(),
    passwordHash: hashPassword(generatedPassword),
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  });

  await memberships.insertOne({
    id: randomUUID(),
    tenantId: params.tenantId,
    userId,
    role: body.data.role,
    createdAt: now,
  });

  return reply.status(201).send({ ok: true, userId, temporaryPassword: body.data.password ? null : generatedPassword });
});

app.patch("/admin/users/:userId", async (request, reply) => {
  const access = await ensureAdminAccess(request);
  if (!access || !access.session) {
    return reply.status(403).send({ code: "FORBIDDEN", message: "Solo administradores autenticados." });
  }
  const params = request.params as { userId: string };
  const body = adminUserUpdateSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }
  const { users, memberships } = await getCollections();
  const membership = await memberships.findOne({ userId: params.userId, tenantId: access.session.membership.tenantId });
  if (!membership) return reply.status(404).send({ code: "NOT_FOUND", message: "Usuario no encontrado." });
  const now = new Date().toISOString();
  const userUpdate: Record<string, unknown> = { updatedAt: now };
  if (body.data.email) {
    const normalizedEmail = body.data.email.toLowerCase();
    const existingEmail = await users.findOne({ email: normalizedEmail, id: { $ne: params.userId } });
    if (existingEmail) {
      return reply.status(409).send({ code: "EMAIL_IN_USE", message: "Ese correo ya esta registrado." });
    }
    userUpdate.email = normalizedEmail;
  }
  if (body.data.fullName) userUpdate.fullName = body.data.fullName.trim();
  if (body.data.password) userUpdate.passwordHash = hashPassword(body.data.password);
  if (body.data.status) userUpdate.status = body.data.status;
  await users.updateOne({ id: params.userId }, { $set: userUpdate });
  if (body.data.role && membership.role !== "OWNER") {
    await memberships.updateOne({ id: membership.id }, { $set: { role: body.data.role } });
  }
  return reply.send({ ok: true });
});

app.post("/admin/customers/:tenantId/users/:userId/reset-password", async (request, reply) => {
  const access = await ensureAdminAccess(request);
  if (!access) {
    return reply.status(403).send({ code: "FORBIDDEN", message: "Solo administradores." });
  }

  const params = request.params as { tenantId: string; userId: string };
  if (!access.isPlatformAdmin && access.session?.membership.tenantId !== params.tenantId) {
    return reply.status(403).send({ code: "FORBIDDEN", message: "No podes administrar este cliente." });
  }

  const body = adminResetPasswordSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }

  const { memberships, users } = await getCollections();
  const membership = await memberships.findOne({ tenantId: params.tenantId, userId: params.userId });
  if (!membership) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Usuario no encontrado para este cliente." });
  }

  const temporaryPassword = body.data.password ?? `Linsse${randomUUID().slice(0, 8)}!`;
  await users.updateOne(
    { id: params.userId },
    {
      $set: {
        passwordHash: hashPassword(temporaryPassword),
        updatedAt: new Date().toISOString(),
      },
    },
  );

  return reply.send({ ok: true, temporaryPassword });
});

app.patch("/admin/plans/:planCode", async (request, reply) => {
  const access = await ensureAdminAccess(request);
  if (!access) {
    return reply.status(403).send({ code: "FORBIDDEN", message: "Solo administradores." });
  }
  const params = request.params as { planCode: string };
  const body = adminPlanUpdateSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }
  await ensureDefaultPlans();
  const { subscriptionPlans } = await getCollections();
  const existingPlan = await subscriptionPlans.findOne({ code: params.planCode, active: true, isDemo: false });
  if (!existingPlan) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Plan no encontrado." });
  }
  await subscriptionPlans.updateOne({ code: params.planCode }, { $set: { amountCents: body.data.amountCents } });
  return reply.send({ ok: true });
});

app.post("/auth/login", async (request, reply) => {
  const body = loginSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }
  await ensureTestLoginData(body.data.email);
  const { users, memberships, subscriptions } = await getCollections();
  const normalizedEmail = body.data.email.toLowerCase();
  const user = await users.findOne({ email: normalizedEmail, status: "ACTIVE" });
  if (!user || !verifyPassword(body.data.password, user.passwordHash)) {
    await appendAccessLog({
      email: normalizedEmail,
      userId: user?.id ?? null,
      tenantId: null,
      event: "LOGIN_FAILURE",
      status: "FAILED",
      ip: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
      message: "Credenciales invalidas.",
    });
    return reply.status(401).send({ code: "INVALID_CREDENTIALS", message: "Credenciales inválidas." });
  }
  const membership = await memberships.findOne({ userId: user.id });
  if (!membership) {
    await appendAccessLog({
      email: user.email,
      userId: user.id,
      tenantId: null,
      event: "LOGIN_FAILURE",
      status: "FAILED",
      ip: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
      message: "Usuario sin organizacion asociada.",
    });
    return reply.status(403).send({ code: "NO_MEMBERSHIP", message: "El usuario no tiene una organización asociada." });
  }
  const subscription = await subscriptions.findOne({ tenantId: membership.tenantId }, { sort: { updatedAt: -1 } });
  if (!subscription) {
    await appendAccessLog({
      email: user.email,
      userId: user.id,
      tenantId: membership.tenantId,
      event: "LOGIN_FAILURE",
      status: "FAILED",
      ip: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
      message: "Organizacion sin suscripcion activa.",
    });
    return reply.status(403).send({ code: "NO_SUBSCRIPTION", message: "No existe suscripción activa para esta organización." });
  }
  const access = resolveSubscriptionStatus(subscription);
  const perpetualAccess = hasPerpetualAccess(user.email);
  if (!access.canAccess && !perpetualAccess) {
    await appendAccessLog({
      email: user.email,
      userId: user.id,
      tenantId: membership.tenantId,
      event: "LOGIN_FAILURE",
      status: "FAILED",
      ip: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
      message: "Suscripcion sin acceso.",
    });
    return reply.status(402).send({ code: "SUBSCRIPTION_EXPIRED", message: "Suscripción vencida. Renová para continuar." });
  }
  const token = signSessionToken({ userId: user.id, tenantId: membership.tenantId, role: membership.role });
  setSessionCookie(reply, token);
  await users.updateOne({ id: user.id }, { $set: { lastLoginAt: new Date().toISOString() } });
  await appendAccessLog({
    email: user.email,
    userId: user.id,
    tenantId: membership.tenantId,
    event: "LOGIN_SUCCESS",
    status: "SUCCESS",
    ip: getRequestIp(request),
    userAgent: getRequestUserAgent(request),
    message: membership.role === "READONLY" ? "Ingreso en modo demo de solo lectura." : "Ingreso exitoso.",
  });
  return reply.send({
    ok: true,
    user: { id: user.id, email: user.email, fullName: user.fullName, role: membership.role },
    subscription: {
      status: perpetualAccess ? "PERPETUAL" : access.statusLabel,
      daysLeft: perpetualAccess ? null : access.daysLeft,
      currentPeriodEnd: subscription.currentPeriodEnd,
    },
  });
});

app.get("/auth/session", async (request, reply) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return reply.status(401).send({ code: "UNAUTHORIZED" });
  }
  const access = resolveSubscriptionStatus(session.subscription);
  const perpetualAccess = hasPerpetualAccess(session.user.email);
  const demoReadonly = isReadOnlyDemoSession(session);
  const notifyType = access.daysLeft <= 1 ? "CRITICAL" : access.daysLeft <= 3 ? "WARNING" : access.daysLeft <= 5 ? "INFO" : "NONE";
  return reply.send({
    user: {
      id: session.user.id,
      email: session.user.email,
      fullName: session.user.fullName,
      role: session.membership.role,
    },
    subscription: {
      status: perpetualAccess ? "PERPETUAL" : access.statusLabel,
      daysLeft: perpetualAccess ? null : access.daysLeft,
      currentPeriodEnd: session.subscription.currentPeriodEnd,
      notification: demoReadonly ? {
        level: "INFO",
        message: READONLY_DEMO_MESSAGE,
      } : perpetualAccess || notifyType === "NONE" ? null : {
        level: notifyType,
        message: `Tu suscripción vence en ${access.daysLeft} día(s).`,
      },
    },
  });
});

app.post("/auth/logout", async (request, reply) => {
  const session = await getSessionFromRequest(request);
  if (session) {
    await appendAccessLog({
      email: session.user.email,
      userId: session.user.id,
      tenantId: session.membership.tenantId,
      event: "LOGOUT",
      status: "SUCCESS",
      ip: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
      message: "Salida de sesion.",
    });
  }
  const secureCookie = PUBLIC_APP_URL.startsWith("https://") || process.env.NODE_ENV === "production";
  reply.header(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie ? "; Secure" : ""}`,
  );
  return reply.send({ ok: true });
});

const SNIG_STRICT_REGEX = /^858\d{9}$/;

app.post("/field/scans/assist", async (request, reply) => {
  const body = scanAssistSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }

  const { establishmentId, rawCode, source } = body.data;

  const establishment = await findEstablishmentById(establishmentId);
  if (!establishment) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Establecimiento no encontrado." });
  }

  const normalized = rawCode.trim().toUpperCase().replace(/\s+/g, "");
  const isSnig = SNIG_STRICT_REGEX.test(normalized);
  const countryCode = isSnig ? normalized.slice(0, 3) : null;
  const animalIdentifier = isSnig ? normalized.slice(3) : null;

  const { animals, traceabilityEvents } = await getCollections();
  const animal = await animals.findOne({ establishmentId, earTag: normalized });

  let lastKnownPaddock: string | null = null;
  let lastEvent: { type: string; occurredAt: string } | null = null;

  if (animal) {
    const recentEvents = await traceabilityEvents
      .find({ establishmentId, earTag: normalized })
      .sort({ occurredAt: -1 })
      .limit(10)
      .toArray();

    const paddockEvent = recentEvents.find(
      (e) => e.type === "ASIGNACION_POTRERO" || e.type === "TRASLADO",
    );
    lastKnownPaddock = paddockEvent?.paddockName ?? null;

    if (recentEvents[0]) {
      lastEvent = { type: recentEvents[0].type, occurredAt: recentEvents[0].occurredAt };
    }
  }

  const suggestedActions = animal
    ? ["VACCINATION", "TREATMENT", "DEWORMING", "WEIGHING", "TRANSFER", "INCIDENT", "INSEMINATION", "PREGNANCY", "SLAUGHTERHOUSE", "DEATH", "OBSERVATION"]
    : ["REGISTER", "INCIDENT", "OBSERVATION"];

  return reply.send({
    mode: "SCAN_ASSIST",
    earTag: normalized,
    isSnig,
    countryCode,
    animalIdentifier,
    source,
    animal: {
      exists: !!animal,
      ...(animal
        ? {
            id: animal.id,
            status: animal.status,
            category: animal.category,
            sex: animal.sex,
            lastKnownPaddock,
            lastEvent,
          }
        : {}),
    },
    suggestedActions,
  });
});

app.patch("/animals/status", async (request, reply) => {
  const body = animalStatusUpdateSchema.safeParse(request.body);
  if (!body.success) {
    return reply.status(400).send({ code: "VALIDATION_ERROR", issues: body.error.issues });
  }

  const { establishmentId, earTag, status } = body.data;
  const normalizedEarTag = earTag.trim().toUpperCase();

  const { animals } = await getCollections();
  const existing = await animals.findOne({ establishmentId, earTag: normalizedEarTag });

  if (!existing) {
    return reply.status(404).send({ code: "NOT_FOUND", message: "Animal no encontrado." });
  }

  const now = new Date().toISOString();
  await animals.updateOne(
    { establishmentId, earTag: normalizedEarTag },
    { $set: { status, updatedAt: now } },
  );

  return reply.send({ ok: true, earTag: normalizedEarTag, status });
});

const start = async () => {
  try {
    await ensureDefaultPlans();
    const port = Number(process.env.PORT ?? "3001");
    await app.listen({ port, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();
