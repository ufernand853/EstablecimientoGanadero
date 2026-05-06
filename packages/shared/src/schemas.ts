import { z } from "zod";
import {
  activityPriorities,
  activityStatuses,
  activityTypes,
  fieldIntents,
  herdCategories,
  herdReproductiveStatus,
  herdSpecies,
  taskPriorities,
  taskStatuses,
  taskTypes,
} from "./enums.js";

export const herdCategorySchema = z.enum(herdCategories);
export const herdSpeciesSchema = z.enum(herdSpecies);
export const herdReproductiveStatusSchema = z.enum(herdReproductiveStatus);

export const paddockSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export const herdSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  qty: z.number().int().nonnegative(),
  category: herdCategorySchema,
  species: herdSpeciesSchema,
  reproductiveStatus: herdReproductiveStatusSchema,
  currentPaddockId: z.string().uuid().nullable(),
  status: z.enum(["ACTIVE", "EGRESSED", "CLOSED"]),
  lastEventAt: z.coerce.date(),
});

export const operationBaseSchema = z.object({
  type: z.string(),
  occurredAt: z.coerce.date(),
  payload: z.record(z.unknown()),
});

export type Herd = z.infer<typeof herdSchema>;
export type Paddock = z.infer<typeof paddockSchema>;


export const taskStatusSchema = z.enum(taskStatuses);
export const taskPrioritySchema = z.enum(taskPriorities);
export const taskTypeSchema = z.enum(taskTypes);

export const taskSchema = z.object({
  id: z.string().uuid(),
  establishmentId: z.string().uuid(),
  title: z.string().min(3),
  description: z.string().nullable(),
  type: taskTypeSchema,
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  dueDate: z.string().datetime().nullable(),
  scheduledAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  assignedToUserId: z.string().nullable(),
  assignedRole: z.string().nullable(),
  paddockId: z.string().uuid().nullable(),
  paddockName: z.string().nullable(),
  animalId: z.string().uuid().nullable(),
  earTag: z.string().nullable(),
  source: z.enum(["MANUAL", "FIELD_COMMAND", "SYSTEM_RULE", "HEALTH_EVENT", "REPRODUCTION_EVENT", "TRACEABILITY_EVENT"]),
  sourceEventId: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const taskCreateSchema = taskSchema.omit({
  id: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
}).partial({
  description: true,
  type: true,
  status: true,
  priority: true,
  dueDate: true,
  scheduledAt: true,
  assignedToUserId: true,
  assignedRole: true,
  paddockId: true,
  paddockName: true,
  animalId: true,
  earTag: true,
  source: true,
  sourceEventId: true,
  createdBy: true,
});

export const taskUpdateSchema = taskCreateSchema.omit({ establishmentId: true }).partial();

export const activityTypeSchema = z.enum(activityTypes);
export const activityPrioritySchema = z.enum(activityPriorities);
export const activityStatusSchema = z.enum(activityStatuses);

export const activityFeedItemSchema = z.object({
  id: z.string().uuid(),
  establishmentId: z.string().uuid(),
  activityType: activityTypeSchema,
  title: z.string(),
  summary: z.string(),
  occurredAt: z.string().datetime(),
  priority: activityPrioritySchema,
  status: activityStatusSchema,
  sourceCollection: z.string(),
  sourceId: z.string(),
  earTag: z.string().nullable(),
  paddockId: z.string().uuid().nullable(),
  paddockName: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const fieldIntentSchema = z.enum(fieldIntents);
export const fieldAssistantResponseSchema = z.object({
  mode: z.enum(["ANSWER", "CONFIRMATION_REQUIRED", "MISSING_DATA", "ERROR"]),
  message: z.string(),
  intent: fieldIntentSchema.nullable(),
  confidence: z.number().min(0).max(1),
  preview: z.object({
    title: z.string(),
    sections: z.array(z.object({
      label: z.string(),
      value: z.string(),
      severity: z.enum(["normal", "warning", "critical"]).optional(),
    })),
  }).optional(),
  confirmation: z.object({
    token: z.string(),
    actionLabel: z.string(),
    cancelLabel: z.string(),
    riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  }).optional(),
  missingFields: z.array(z.string()).optional(),
});

export type Task = z.infer<typeof taskSchema>;
export type ActivityFeedItem = z.infer<typeof activityFeedItemSchema>;
export type FieldAssistantResponse = z.infer<typeof fieldAssistantResponseSchema>;
