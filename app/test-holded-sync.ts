import prisma from "./db.server";
import { runHoldedSync } from "./services/erp/holded/sync-products-from-holded.server";

const shopDomain = "testclosetech.myshopify.com";

const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
if (!shop) throw new Error("Shop not found");

const integration = await prisma.integration.findUnique({ where: { name: "holded" } });
if (!integration) throw new Error("Integration not found");

const cred = await prisma.integrationCredential.findFirst({
  where: { sessionId: shopDomain, integrationId: integration.id, key: "apikey" },
});
if (!cred) throw new Error("No apikey credential");

const session = await prisma.session.findFirst({
  where: { shop: shopDomain, isOnline: false },
});
if (!session?.accessToken) throw new Error("No offline session/access token");

const job = await prisma.holdedSyncJob.create({
  data: { shopId: shop.id, status: "PENDING" },
});

console.log("Job created:", job.id);

await runHoldedSync({
  jobId: job.id,
  shopId: shop.id,
  shopDomain,
  accessToken: session.accessToken,
  holdedApiKey: cred.value,
});

const finished = await prisma.holdedSyncJob.findUnique({ where: { id: job.id } });
console.log("RESULT:", JSON.stringify(finished, null, 2));

await prisma.$disconnect();
