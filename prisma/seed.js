import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seed() {
  console.log("🌱 Iniciando seed de base de datos...");

  // Crear integraciones predeterminadas
  const clientify = await prisma.integration.upsert({
    where: { name: "clientify" },
    update: {
      displayName: "Clientify CRM",
      enabled: true,
    },
    create: {
      id: 1,
      name: "clientify",
      displayName: "Clientify CRM",
      enabled: true,
    },
  });

  const agora = await prisma.integration.upsert({
    where: { name: "agora" },
    update: {
      displayName: "Agora ERP",
      enabled: false, // Deshabilitado por defecto hasta implementar
    },
    create: {
      id: 2,
      name: "agora",
      displayName: "Agora ERP",
      enabled: false,
    },
  });

  console.log("✅ Integraciones creadas:");
  console.log("  - Clientify CRM (ID: 1) - Habilitada");
  console.log("  - Agora ERP (ID: 2) - Deshabilitada");
}

seed()
  .then(async () => {
    console.log("✅ Seed completado exitosamente");
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Error en seed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
