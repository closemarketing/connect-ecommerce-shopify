import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "~/shopify.server";
import shopify from "~/shopify.server";
import prisma from "~/db.server";
import { getActiveIntegrations } from "~/models/Integration.server";

import { loadHoldedDashboardData } from "./holded-dashboard-data.server";
import { HoldedDashboard } from "./HoldedDashboard";
import { NoConnectionState } from "./NoConnectionState";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const shopRecord = await prisma.shop.upsert({
    where:  { domain: shopDomain },
    update: {},
    create: { domain: shopDomain },
  });

  if (!(session as any).shopId) {
    await prisma.session.update({
      where: { id: session.id },
      data:  { shopId: shopRecord.id },
    }).catch(() => null);
  }

  try { await shopify.registerWebhooks({ session }); } catch {}

  const activeIntegrations = await getActiveIntegrations(shopDomain);
  const activeNames = activeIntegrations.map((i) => i.name);

  if (activeNames.length === 0) {
    return { shop: shopDomain, activeIntegration: null, holdedData: null };
  }

  // Shopify product count — shared across all dashboard views
  const productResponse = await admin.graphql(`#graphql
    query { productsCount { count } }
  `).catch(() => null);
  const productCountJson = await productResponse?.json().catch(() => null);
  const shopifyProductCount = productCountJson?.data?.productsCount?.count ?? 0;

  // ── Per-integration data ──────────────────────────────────────────────────
  // Priority: first active integration drives the dashboard.
  // When multi-integration dashboards are needed, extend here.
  const primaryIntegration = activeIntegrations[0];

  if (primaryIntegration.name === "holded") {
    const holdedData = await loadHoldedDashboardData(shopDomain, shopRecord.id, shopifyProductCount);
    return { shop: shopDomain, activeIntegration: "holded" as const, holdedData };
  }

  // Future integrations: add more branches here, e.g.:
  // if (primaryIntegration.name === "clientify") { ... }

  return { shop: shopDomain, activeIntegration: primaryIntegration.name, holdedData: null };
}

export default function Index() {
  const { shop, activeIntegration, holdedData } = useLoaderData<typeof loader>();

  if (activeIntegration === "holded" && holdedData) {
    return <HoldedDashboard data={holdedData} />;
  }

  // Future integrations render here, e.g.:
  // if (activeIntegration === "clientify" && clientifyData) {
  //   return <ClientifyDashboard data={clientifyData} />;
  // }

  return <NoConnectionState shop={shop} />;
}

export { boundary };
