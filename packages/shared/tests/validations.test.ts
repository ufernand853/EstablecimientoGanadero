import { describe, expect, it } from "vitest";
import { validateMove, validateNoNegativeQty, validateOccurredAt, validateSlaughterConfirm } from "../src/validations.js";

const paddockActive = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Potrero 3",
  status: "ACTIVE",
};

const paddockInactive = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "Potrero 7",
  status: "INACTIVE",
};

describe("validations", () => {
  it("flags move to inactive paddock", () => {
    const errors = validateMove({ qty: 10, fromPaddock: paddockActive, toPaddock: paddockInactive });
    expect(errors.some((error) => error.code === "PADDOCK_INACTIVE")).toBe(true);
  });

  it("prevents negative qty", () => {
    const errors = validateNoNegativeQty(5, -10);
    expect(errors[0]?.code).toBe("NEGATIVE_QTY");
  });

  it("rejects out of order occurred_at", () => {
    const errors = validateOccurredAt(new Date("2024-01-01"), new Date("2024-02-01"));
    expect(errors[0]?.code).toBe("OUT_OF_ORDER");
  });

  it("requires herd allocation for slaughter confirm", () => {
    const errors = validateSlaughterConfirm({
      items: [{ herdId: null, qty: 5 }],
      herdStates: {},
    });
    expect(errors.some((error) => error.code === "MISSING_HERD")).toBe(true);
  });

  it("checks sufficient stock for slaughter confirm", () => {
    const errors = validateSlaughterConfirm({
      items: [{ herdId: "herd-1", qty: 10 }],
      herdStates: {
        "herd-1": {
          id: "herd-1",
          code: "LOTE-1",
          qty: 5,
          category: "VACAS",
          species: "BOVINO",
          reproductiveStatus: "NA",
          currentPaddockId: null,
          status: "ACTIVE",
          lastEventAt: new Date("2024-01-01"),
        },
      },
    });
    expect(errors.some((error) => error.code === "INSUFFICIENT_STOCK")).toBe(true);
  });
});
