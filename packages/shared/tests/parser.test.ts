import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/parser.js";

const context = {
  paddocks: [
    { id: "11111111-1111-1111-1111-111111111111", name: "Potrero 3" },
    { id: "22222222-2222-2222-2222-222222222222", name: "Potrero 7" },
    { id: "33333333-3333-3333-3333-333333333333", name: "Loma Azul" },
  ],
  consignors: [
    { id: "44444444-4444-4444-4444-444444444444", name: "Pérez" },
    { id: "55555555-5555-5555-5555-555555555555", name: "San Miguel" },
  ],
  slaughterhouses: [
    { id: "66666666-6666-6666-6666-666666666666", name: "Las Moras" },
    { id: "77777777-7777-7777-7777-777777777777", name: "Frigo Sur" },
  ],
};

describe("parseCommand", () => {
  it("parses MOVE commands", () => {
    const result = parseCommand("Mover 120 terneros del Potrero 3 al Potrero 7 hoy 16:00", context);
    expect(result.intent).toBe("MOVE");
    expect(result.proposedOperations[0]?.payload).toMatchObject({ qty: 120 });
  });


  it("parses MOVE commands using desde ... al", () => {
    const result = parseCommand("Mover 30 terneros desde el Potrero 3 al Potrero 7", context);
    expect(result.intent).toBe("MOVE");
    expect(result.warnings).not.toContain("No se pudo identificar el potrero de origen.");
    expect(result.warnings).not.toContain("No se pudo identificar el potrero de destino.");
  });
  it("parses MOVE with missing destination", () => {
    const result = parseCommand("Mover 50 terneros del Potrero 3", context);
    expect(result.intent).toBe("MOVE");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("parses VACCINATION commands", () => {
    const result = parseCommand("Vacunar lote vaquillonas aftosa 2ml el 2026-02-01", context);
    expect(result.intent).toBe("VACCINATION");
  });

  it("parses VACCINATION with qty", () => {
    const result = parseCommand("Vacunar 45 vaquillonas clostridiosis 5ml", context);
    expect(result.intent).toBe("VACCINATION");
    expect(result.proposedOperations[0]?.payload).toMatchObject({ qty: 45 });
  });

  it("parses BREEDING_START commands", () => {
    const result = parseCommand("Iniciar entore de vacas con 3 toros desde 15/11 hasta 15/01", context);
    expect(result.intent).toBe("BREEDING_START");
  });

  it("parses WEANING commands", () => {
    const result = parseCommand("Destetar 85 terneros del lote VAC-2025-01, peso 170kg", context);
    expect(result.intent).toBe("WEANING");
  });

  it("parses WEANING without weight", () => {
    const result = parseCommand("Destetar 30 terneras del lote TERN-02", context);
    expect(result.intent).toBe("WEANING");
  });

  it("parses BRANDING commands", () => {
    const result = parseCommand("Yerra 60 terneros, castrar 30, hoy", context);
    expect(result.intent).toBe("BRANDING");
  });

  it("parses SLAUGHTER consignments", () => {
    const result = parseCommand(
      "Enviar a frigorífico Las Moras por consignatario Pérez: 35 novillos a 620, 12 vacas a 480 hoy",
      context,
    );
    expect(result.intent).toBe("SLAUGHTER_SHIPMENT");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("parses slaughter with missing consignor", () => {
    const result = parseCommand(
      "Enviar a frigorífico Las Moras por consignatario Desconocido: 10 novillos a 600",
      context,
    );
    expect(result.intent).toBe("SLAUGHTER_SHIPMENT");
    expect(result.warnings).toContain("Consignatario no identificado.");
  });

  it("parses slaughter with missing slaughterhouse", () => {
    const result = parseCommand(
      "Enviar a frigorífico Inexistente por consignatario Pérez: 10 novillos a 600",
      context,
    );
    expect(result.intent).toBe("SLAUGHTER_SHIPMENT");
    expect(result.warnings).toContain("Frigorífico no identificado.");
  });

  it("parses MOVE with typo paddock", () => {
    const result = parseCommand("Mover 20 terneros del Potrero 3 al Potrero 8", context);
    expect(result.intent).toBe("MOVE");
  });

  it("parses vaccination without category", () => {
    const result = parseCommand("Vacunar lote aftosa 2ml", context);
    expect(result.intent).toBe("VACCINATION");
  });

  it("parses weaning without herd code", () => {
    const result = parseCommand("Destetar 40 terneros peso 160kg", context);
    expect(result.intent).toBe("WEANING");
  });

  it("parses branding without castration", () => {
    const result = parseCommand("Yerra 20 terneros", context);
    expect(result.intent).toBe("BRANDING");
  });

  it("parses breeding without bulls", () => {
    const result = parseCommand("Iniciar entore de vacas desde 01/12 hasta 01/02", context);
    expect(result.intent).toBe("BREEDING_START");
  });

  it("parses move with category synonyms", () => {
    const result = parseCommand("Mover 10 terneras del Potrero 3 al Potrero 7", context);
    expect(result.intent).toBe("MOVE");
  });

  it("parses weaning with lowercase code", () => {
    const result = parseCommand("Destetar 12 terneros del lote vac-2025-02", context);
    expect(result.intent).toBe("WEANING");
    expect(result.proposedOperations[0]?.payload).toMatchObject({ herdCode: "VAC-2025-02" });
  });

  it("parses slaughter with multiple items", () => {
    const result = parseCommand(
      "Enviar a frigorífico Las Moras por consignatario Pérez: 8 vacas a 450, 4 novillos a 600",
      context,
    );
    expect(result.intent).toBe("SLAUGHTER_SHIPMENT");
    expect(result.proposedOperations[0]?.payload).toMatchObject({
      items: expect.any(Array),
    });
  });

  it("returns unknown for unrelated text", () => {
    const result = parseCommand("Lluvia fuerte en el campo", context);
    expect(result.intent).toBe("UNKNOWN");
  });
});
