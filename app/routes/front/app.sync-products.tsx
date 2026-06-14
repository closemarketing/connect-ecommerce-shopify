import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import {
  getIntegrationByName,
  getCredentials,
  isIntegrationActive,
} from "~/models/Integration.server";
import {
  ShopifyProductAccessDeniedError,
  syncProductsToHolded,
} from "~/services/erp/holded/holded-product-sync.server";

/**
 * POST /api/sync/products
 * Triggered by the "Sync now" button on the dashboard.
 * Runs product sync for every active integration that supports it.
 * Returns JSON with the sync result.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const shopRecord = await prisma.shop.findUnique({
    where: { domain: shopDomain },
  });
  if (!shopRecord) {
    return Response.json(
      { ok: false, error: "Shop not found" },
      { status: 404 },
    );
  }

  // ── Holded ────────────────────────────────────────────────────────────────
  const holdedActive = await isIntegrationActive(shopDomain, "holded");
  if (!holdedActive) {
    return Response.json(
      { ok: false, error: "No active integration" },
      { status: 400 },
    );
  }

  const integration = await getIntegrationByName("holded");
  if (!integration) {
    return Response.json(
      { ok: false, error: "Integration not found in DB" },
      { status: 400 },
    );
  }

  const credentials = (await getCredentials(
    shopDomain,
    integration.id,
  )) as Record<string, string | undefined>;
  if (!credentials.apikey) {
    return Response.json(
      { ok: false, error: "No API key configured" },
      { status: 400 },
    );
  }

  try {
    const result = await syncProductsToHolded(
      admin.graphql.bind(admin),
      shopRecord.id,
      credentials.apikey,
      integration.id,
    );

    return Response.json({ ok: true, result });
  } catch (error) {
    if (error instanceof ShopifyProductAccessDeniedError) {
      return Response.json(
        {
          ok: false,
          error: error.message,
          code: "SHOPIFY_PRODUCTS_SCOPE_MISSING",
          requiredScope: "read_products",
        },
        { status: 403 },
      );
    }

    throw error;
  }
}
