import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const INTEGRATIONS = [
  { name: "clientify", displayName: "Clientify" },
  { name: "holded",    displayName: "Holded"    },
  { name: "odoo",      displayName: "Odoo"      },
];

async function seed() {
  for (const i of INTEGRATIONS) {
    const row = await prisma.integration.upsert({
      where:  { name: i.name },
      update: { displayName: i.displayName },
      create: i,
    });
    console.log(`✅ Integración ${row.displayName} (${row.name}) lista`);
  }
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
