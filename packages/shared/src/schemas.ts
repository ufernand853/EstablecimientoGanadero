import { z } from "zod";
import { herdCategories, herdReproductiveStatus, herdSpecies } from "./enums.js";

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
