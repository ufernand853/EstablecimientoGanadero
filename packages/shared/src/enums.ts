export const herdCategories = [
  "TERNEROS",
  "TERNERAS",
  "TERNEROS_DESTETADOS",
  "VAQUILLONAS",
  "VACAS",
  "TOROS",
  "NOVILLOS",
  "VIENTRES",
  "CORDEROS",
  "OVEJAS",
  "CARNEROS",
] as const;

export type HerdCategory = (typeof herdCategories)[number];

export const categoryLabels: Record<HerdCategory, string> = {
  TERNEROS: "Terneros",
  TERNERAS: "Terneras",
  TERNEROS_DESTETADOS: "Terneros destetados",
  VAQUILLONAS: "Vaquillonas",
  VACAS: "Vacas",
  TOROS: "Toros",
  NOVILLOS: "Novillos",
  VIENTRES: "Vientres",
  CORDEROS: "Corderos",
  OVEJAS: "Ovejas",
  CARNEROS: "Carneros",
};

export const categorySynonyms: Record<HerdCategory, string[]> = {
  TERNEROS: ["terneros", "ternero"],
  TERNERAS: ["terneras", "ternera"],
  TERNEROS_DESTETADOS: ["destetados", "terneros destetados"],
  VAQUILLONAS: ["vaquillonas", "vaquillona"],
  VACAS: ["vacas", "vaca"],
  TOROS: ["toros", "toro"],
  NOVILLOS: ["novillos", "novillo"],
  VIENTRES: ["vientres", "vientre"],
  CORDEROS: ["corderos", "cordero"],
  OVEJAS: ["ovejas", "oveja"],
  CARNEROS: ["carneros", "carnero"],
};

export const operationTypes = [
  "MOVE",
  "VACCINATION",
  "DEWORMING",
  "TREATMENT",
  "INCIDENT_REPORT",
  "BREEDING_START",
  "BREEDING_END",
  "WEANING",
  "BRANDING",
  "SHIPMENT",
  "SLAUGHTER_SHIPMENT",
] as const;

export type OperationType = (typeof operationTypes)[number];

export const herdSpecies = ["BOVINO", "OVINO"] as const;
export type HerdSpecies = (typeof herdSpecies)[number];

export const herdReproductiveStatus = ["VACIA", "PRENADA", "ENTORADA", "NA"] as const;
export type HerdReproductiveStatus = (typeof herdReproductiveStatus)[number];

export const taskStatuses = ["PENDING", "IN_PROGRESS", "DONE", "CANCELLED", "OVERDUE"] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export const taskPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type TaskPriority = (typeof taskPriorities)[number];

export const taskTypes = [
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
] as const;
export type TaskType = (typeof taskTypes)[number];

export const activityTypes = [
  "TASK_CREATED",
  "TASK_UPDATED",
  "TASK_COMPLETED",
  "TRACEABILITY_EVENT_CREATED",
  "HEALTH_EVENT_CREATED",
  "REPRODUCTION_EVENT_CREATED",
  "MOVEMENT_CREATED",
  "PADDOCK_CREATED",
  "REPORT_GENERATED",
  "COMMAND_CONFIRMED",
] as const;
export type ActivityType = (typeof activityTypes)[number];

export const activityPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type ActivityPriority = (typeof activityPriorities)[number];

export const activityStatuses = ["INFO", "PENDING", "DONE", "WARNING", "CRITICAL"] as const;
export type ActivityStatus = (typeof activityStatuses)[number];

export const fieldIntents = [
  "QUERY_HERD_SUMMARY",
  "QUERY_PREGNANT_FEMALES",
  "REGISTER_BIRTH",
  "REGISTER_DEATH",
  "REGISTER_VACCINATION",
  "REGISTER_MOVEMENT",
  "CREATE_TASK",
  "COMPLETE_TASK",
  "SCHEDULE_ACTIVITY",
  "CREATE_PADDOCK",
  "QUERY_DAILY_ACTIVITIES",
  "UNKNOWN",
] as const;
export type FieldIntent = (typeof fieldIntents)[number];
