import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const main = async () => {
  const org = await prisma.org.create({
    data: {
      name: "Estancias Unidas",
    },
  });

  const user = await prisma.user.create({
    data: {
      email: "owner@estancias.local",
      name: "Owner",
      passwordHash: "changeme",
      status: "ACTIVE",
    },
  });

  await prisma.orgUser.create({
    data: {
      orgId: org.id,
      userId: user.id,
      role: "OWNER",
    },
  });

  const establishment = await prisma.establishment.create({
    data: {
      orgId: org.id,
      name: "Estancia La Laguna",
      location: "Treinta y Tres",
      timezone: "America/Montevideo",
    },
  });

  const paddocks = await prisma.paddock.createMany({
    data: [
      { establishmentId: establishment.id, name: "Potrero 1", areaHa: 45, type: "CAMPO_NATURAL", status: "ACTIVE" },
      { establishmentId: establishment.id, name: "Potrero 2", areaHa: 32, type: "PRADERA", status: "ACTIVE" },
      { establishmentId: establishment.id, name: "Potrero 3", areaHa: 28, type: "VERDEO", status: "ACTIVE" },
      { establishmentId: establishment.id, name: "Potrero 4", areaHa: 60, type: "CAMPO_NATURAL", status: "ACTIVE" },
      { establishmentId: establishment.id, name: "Potrero 5", areaHa: 22, type: "OTRO", status: "ACTIVE" },
      { establishmentId: establishment.id, name: "Potrero 6", areaHa: 50, type: "PRADERA", status: "ACTIVE" },
    ],
  });

  await prisma.herd.createMany({
    data: [
      {
        establishmentId: establishment.id,
        code: "VAC-2025-01",
        species: "BOVINO",
        category: "VACAS",
        qty: 120,
        avgWeightKg: 420,
        reproductiveStatus: "PRENADA",
        status: "ACTIVE",
      },
      {
        establishmentId: establishment.id,
        code: "TERN-2025-01",
        species: "BOVINO",
        category: "TERNEROS",
        qty: 85,
        avgWeightKg: 180,
        reproductiveStatus: "NA",
        status: "ACTIVE",
      },
      {
        establishmentId: establishment.id,
        code: "NOV-2024-01",
        species: "BOVINO",
        category: "NOVILLOS",
        qty: 40,
        avgWeightKg: 380,
        reproductiveStatus: "NA",
        status: "ACTIVE",
      },
      {
        establishmentId: establishment.id,
        code: "VAQ-2025-02",
        species: "BOVINO",
        category: "VAQUILLONAS",
        qty: 60,
        avgWeightKg: 320,
        reproductiveStatus: "ENTORADA",
        status: "ACTIVE",
      },
      {
        establishmentId: establishment.id,
        code: "TOR-2025-01",
        species: "BOVINO",
        category: "TOROS",
        qty: 5,
        avgWeightKg: 650,
        reproductiveStatus: "NA",
        status: "ACTIVE",
      },
      {
        establishmentId: establishment.id,
        code: "TERN-DEST-01",
        species: "BOVINO",
        category: "TERNEROS_DESTETADOS",
        qty: 70,
        avgWeightKg: 200,
        reproductiveStatus: "NA",
        status: "ACTIVE",
      },
    ],
  });

  await prisma.consignor.createMany({
    data: [
      { orgId: org.id, name: "Pérez", status: "ACTIVE" },
      { orgId: org.id, name: "San Miguel", status: "ACTIVE" },
    ],
  });

  await prisma.slaughterhouse.createMany({
    data: [
      { orgId: org.id, name: "Las Moras", status: "ACTIVE" },
      { orgId: org.id, name: "Frigo Sur", status: "ACTIVE" },
    ],
  });

  await prisma.operationEvent.create({
    data: {
      establishmentId: establishment.id,
      type: "MOVE",
      occurredAt: new Date(),
      createdBy: user.id,
      payload: { note: "Evento de demo" },
    },
  });

  await prisma.$disconnect();
  console.log("Seed completed", { org: org.id, establishment: establishment.id, paddocks });
};

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
