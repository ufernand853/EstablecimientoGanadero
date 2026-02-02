import { Herd, Paddock } from "./schemas.js";

export type ValidationError = {
  code: string;
  message: string;
  path?: string;
};

export type MoveValidationInput = {
  qty: number;
  fromPaddock: Paddock;
  toPaddock: Paddock;
};

export const validateMove = ({ qty, toPaddock }: MoveValidationInput): ValidationError[] => {
  const errors: ValidationError[] = [];
  if (qty <= 0) {
    errors.push({
      code: "INVALID_QTY",
      message: "La cantidad a mover debe ser positiva.",
      path: "qty",
    });
  }
  if (toPaddock.status !== "ACTIVE") {
    errors.push({
      code: "PADDOCK_INACTIVE",
      message: "El potrero de destino está inactivo.",
      path: "toPaddockId",
    });
  }
  return errors;
};

export const validateNoNegativeQty = (currentQty: number, delta: number): ValidationError[] => {
  if (currentQty + delta < 0) {
    return [
      {
        code: "NEGATIVE_QTY",
        message: "La cantidad resultante no puede ser negativa.",
        path: "qty",
      },
    ];
  }
  return [];
};

export const validateOccurredAt = (occurredAt: Date, lastEventAt: Date): ValidationError[] => {
  if (occurredAt.getTime() < lastEventAt.getTime()) {
    return [
      {
        code: "OUT_OF_ORDER",
        message: "La fecha de operación es anterior al último evento.",
        path: "occurredAt",
      },
    ];
  }
  return [];
};

export type SlaughterConfirmItem = {
  herdId: string | null;
  qty: number;
};

export type SlaughterConfirmInput = {
  items: SlaughterConfirmItem[];
  herdStates: Record<string, Herd>;
};

export const validateSlaughterConfirm = ({ items, herdStates }: SlaughterConfirmInput): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (items.some((item) => item.qty <= 0)) {
    errors.push({
      code: "INVALID_QTY",
      message: "Cada ítem debe tener cantidad positiva.",
      path: "items",
    });
  }

  for (const [index, item] of items.entries()) {
    if (!item.herdId) {
      errors.push({
        code: "MISSING_HERD",
        message: "Debe asignar un lote a cada ítem antes de confirmar.",
        path: `items.${index}.herdId`,
      });
      continue;
    }
    const herd = herdStates[item.herdId];
    if (!herd) {
      errors.push({
        code: "HERD_NOT_FOUND",
        message: "Lote no encontrado para el ítem.",
        path: `items.${index}.herdId`,
      });
      continue;
    }
    if (herd.qty < item.qty) {
      errors.push({
        code: "INSUFFICIENT_STOCK",
        message: "No hay stock suficiente para el lote seleccionado.",
        path: `items.${index}.qty`,
      });
    }
  }

  return errors;
};
