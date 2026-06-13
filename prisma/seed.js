import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seed() {
  // Crear integración de Clientify si no existe
  const clientify = await prisma.integration.upsert({
    where: { name: "clientify" },
    update: {},
    create: {
      name: "clientify",
      displayName: "Clientify",
    },
  });

  console.log("✅ Integración Clientify creada:", clientify);

  const holded = await prisma.integration.upsert({
    where: { name: "holded" },
    update: {},
    create: {
      name: "holded",
      displayName: "Holded ERP",
    },
  });

  console.log("✅ Integración Holded creada:", holded);
}

seed()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
