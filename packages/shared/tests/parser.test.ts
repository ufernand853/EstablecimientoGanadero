import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/parser.js";

const context = {
  paddocks: [
    { id: "11111111-1111-1111-1111-111111111111", name: "Potrero 3" },
    { id: "88888888-8888-8888-8888-888888888888", name: "Potrero 1 - Norte" },
    { id: "99999999-9999-9999-9999-999999999999", name: "Potrero 2 - Sur" },
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
  supplies: [
    { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", name: "Ivermectina" },
    { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", name: "Vacuna aftosa" },
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

  it("parses MOVE when phrased as guidance text", () => {
    const result = parseCommand("Para mover 30 terneros del Potrero 3 al Potrero 7, registralo", context);
    expect(result.intent).toBe("MOVE");
    expect(result.warnings).not.toContain("No se pudo identificar el potrero de origen.");
    expect(result.warnings).not.toContain("No se pudo identificar el potrero de destino.");
  });

  it("parses MOVE for numbered paddocks with suffixes", () => {
    const result = parseCommand("Mover 30 terneros desde el Potrero 1 al Potrero 2", context);
    expect(result.intent).toBe("MOVE");
    expect(result.warnings).not.toContain("No se pudo identificar el potrero de origen.");
    expect(result.warnings).not.toContain("No se pudo identificar el potrero de destino.");
  });

  it("parses MOVE commands when user says 'move' in english", () => {
    const result = parseCommand("Move 10 novillos del Potrero 3 al Potrero 7", context);
    expect(result.intent).toBe("MOVE");
    expect(result.warnings).not.toContain("No se pudo identificar el potrero de origen.");
    expect(result.warnings).not.toContain("No se pudo identificar el potrero de destino.");
  });

  it("parses MOVE commands with 'a' as destination preposition", () => {
    const result = parseCommand("Pasar 15 novillos de Potrero 3 a Potrero 7", context);
    expect(result.intent).toBe("MOVE");
    expect(result.warnings).not.toContain("No se pudo identificar el potrero de origen.");
    expect(result.warnings).not.toContain("No se pudo identificar el potrero de destino.");
  });


  it("parses veterinary supply stock intake commands", () => {
    const result = parseCommand("Ingresa al stock 10 cajas de ivermectina con fecha de vencimiento 2027-08-31 lote IV-77", context);
    expect(result.intent).toBe("SUPPLY_STOCK_IN");
    expect(result.warnings).toHaveLength(0);
    expect(result.proposedOperations[0]?.payload).toMatchObject({
      supplyId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      supplyName: "Ivermectina",
      supplyType: "DEWORMER",
      quantityInitial: 10,
      quantityAvailable: 10,
      unit: "cajas",
      batchNumber: "IV-77",
      expirationDate: "2027-08-31T00:00:00.000Z",
    });
  });

  it("parses health supply availability checks before vaccination", () => {
    const result = parseCommand("Vamos a vacunar contra la aftosa el Potrero 3", context);
    expect(result.intent).toBe("HEALTH_SUPPLY_CHECK");
    expect(result.warnings).toHaveLength(0);
    expect(result.proposedOperations[0]?.payload).toMatchObject({
      healthAction: "VACCINATION",
      paddockId: "11111111-1111-1111-1111-111111111111",
      paddockName: "Potrero 3",
      searchTerm: "aftosa",
      requiredSupplyType: "VACCINE",
      mustBeAvailable: true,
      mustNotBeExpired: true,
    });
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

  it("parses vaccination with product, potrero and vaccinator", () => {
    const result = parseCommand("Vacunamos 10 toros del Potrero 3 con Aftosil y los vacunó Juan", context);
    expect(result.intent).toBe("VACCINATION");
    expect(result.warnings).toHaveLength(0);
    expect(result.proposedOperations[0]?.payload).toMatchObject({
      qty: 10,
      category: "TOROS",
      paddockId: "11111111-1111-1111-1111-111111111111",
      product: "Aftosil",
      responsible: "Juan",
    });
  });


  it("parses DEWORMING commands", () => {
    const result = parseCommand("Desparasitar 120 terneros ivermectina 5ml hoy", context);
    expect(result.intent).toBe("DEWORMING");
    expect(result.proposedOperations[0]?.payload).toMatchObject({ qty: 120 });
  });

  it("parses TREATMENT commands", () => {
    const result = parseCommand("Tratar 30 vacas antibiótico 10ml", context);
    expect(result.intent).toBe("TREATMENT");
    expect(result.proposedOperations[0]?.payload).toMatchObject({ qty: 30 });
  });
  it("parses BREEDING_START commands", () => {
    const result = parseCommand("Iniciar entore de vacas con 3 toros desde 15/11 hasta 15/01", context);
    expect(result.intent).toBe("BREEDING_START");
  });

  it("parses WEANING commands", () => {
    const result = parseCommand("Destetar 85 terneros del lote VAC-2025-01, peso 170kg", context);
    expect(result.intent).toBe("WEANING");
    expect(result.proposedOperations[0]?.payload).toMatchObject({ category: "TERNEROS", toCategory: "TERNEROS_DESTETADOS" });
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

  it("parses incident report with paddock and responsible", () => {
    const result = parseCommand(
      "Registrar incidente en Potrero 2 - Sur: ternero lastimado en una pata, hay que llamar al veterinario y el responsable es Juan",
      context,
    );
    expect(result.intent).toBe("INCIDENT_REPORT");
    expect(result.warnings).toHaveLength(0);
    expect(result.proposedOperations[0]?.payload).toMatchObject({
      paddockId: "99999999-9999-9999-9999-999999999999",
      responsible: "Juan",
    });
  });

  it("warns when incident report misses paddock but not optional action or responsible", () => {
    const result = parseCommand("Incidente: ternero lastimado", context);
    expect(result.intent).toBe("INCIDENT_REPORT");
    expect(result.warnings).toEqual(["No se pudo identificar el potrero del incidente."]);
  });

  it("parses operator incident reports without action or responsible", () => {
    const result = parseCommand("Encontré dos novillos abichados en el potrero 1", context);
    expect(result.intent).toBe("INCIDENT_REPORT");
    expect(result.warnings).toHaveLength(0);
    expect(result.proposedOperations[0]?.payload).toMatchObject({
      paddockId: "88888888-8888-8888-8888-888888888888",
      title: "2 novillos abichados",
      qty: 2,
      category: "NOVILLOS",
      responsible: null,
      severity: "HIGH",
    });
  });


  it("always returns a confirmation token", () => {
    const result = parseCommand("Lluvia fuerte en el campo", context);
    expect(result.confirmationToken).toMatch(/^local-/);
  });

  it("returns unknown for unrelated text", () => {
    const result = parseCommand("Lluvia fuerte en el campo", context);
    expect(result.intent).toBe("UNKNOWN");
  });
});
