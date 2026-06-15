import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import {
  getIntegrationByName,
  getCredentials,
  isIntegrationActive,
} from "~/models/Integration.server";
import { runHoldedSync } from "~/services/holded/sync-products-from-holded.server";

/**
 * POST /api/sync/products
 * Triggered by the "Sync now" button on the dashboard.
 * Reads products from Holded and creates/updates them in Shopify.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain  = session.shop;

  const shopRecord = await prisma.shop.findUnique({
    where: { domain: shopDomain },
  });
  if (!shopRecord) {
    return Response.json({ ok: false, error: "Shop not found" }, { status: 404 });
  }

  const holdedActive = await isIntegrationActive(shopDomain, "holded");
  if (!holdedActive) {
    return Response.json({ ok: false, error: "No active integration" }, { status: 400 });
  }

  const integration = await getIntegrationByName("holded");
  if (!integration) {
    return Response.json({ ok: false, error: "Integration not found in DB" }, { status: 400 });
  }

  const credentials = (await getCredentials(
    shopDomain,
    integration.id,
  )) as Record<string, string | undefined>;
  if (!credentials.apikey) {
    return Response.json({ ok: false, error: "No API key configured" }, { status: 400 });
  }

  const offlineSession = await prisma.session.findFirst({
    where: { shop: shopDomain, isOnline: false },
  });
  if (!offlineSession?.accessToken) {
    return Response.json({ ok: false, error: "No offline session found" }, { status: 400 });
  }

  const runningJob = await prisma.holdedSyncJob.findFirst({
    where: { shopId: shopRecord.id, status: { in: ["PENDING", "RUNNING"] } },
  });
  if (runningJob) {
    return Response.json({ ok: false, error: "Ya hay una sincronización en curso." }, { status: 409 });
  }

  const newJob = await prisma.holdedSyncJob.create({
    data: { shopId: shopRecord.id, status: "PENDING" },
  });

  // Fire and forget — job progress tracked in HoldedSyncJob
  runHoldedSync({
    jobId:        newJob.id,
    shopId:       shopRecord.id,
    shopDomain,
    accessToken:  offlineSession.accessToken,
    holdedApiKey: credentials.apikey,
  }).catch(() => {});

  return Response.json({ ok: true, jobId: newJob.id });
}
