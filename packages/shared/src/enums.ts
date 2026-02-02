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
