import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { getIntegrationByName } from "~/models/Integration.server";
import { buildControllerForShop } from "~/services/integrations/dispatcher.server";
import { logOrderSync, logSyncError } from "~/services/logging/sync-logger.server";

const ORDER_QUERY = `#graphql
  query getOrder($id: ID!) {
    order(id: $id) {
      id
      name
      email
      totalPriceSet { shopMoney { amount currencyCode } }
      customer { firstName lastName email }
      lineItems(first: 50) {
        edges {
          node { title quantity sku originalUnitPriceSet { shopMoney { amount } } }
        }
      }
      billingAddress { address1 address2 city zip countryCode company phone }
      shippingLines(first: 5) { edges { node { title originalPriceSet { shopMoney { amount } } } } }
      note
      createdAt
    }
  }
`;

function gqlOrderToRest(gqlOrder: any): any {
  const billing = gqlOrder.billingAddress ?? {};
  return {
    id:           gqlOrder.id,
    name:         gqlOrder.name,
    order_number: gqlOrder.name,
    email:        gqlOrder.email,
    created_at:   gqlOrder.createdAt,
    note:         gqlOrder.note,
    customer: {
      first_name: gqlOrder.customer?.firstName ?? "",
      last_name:  gqlOrder.customer?.lastName  ?? "",
      email:      gqlOrder.customer?.email     ?? gqlOrder.email ?? "",
    },
    billing_address: {
      name:         [gqlOrder.customer?.firstName, gqlOrder.customer?.lastName].filter(Boolean).join(" "),
      company:      billing.company     ?? "",
      address1:     billing.address1    ?? "",
      address2:     billing.address2    ?? "",
      city:         billing.city        ?? "",
      zip:          billing.zip         ?? "",
      country_code: billing.countryCode ?? "",
      phone:        billing.phone       ?? "",
    },
    line_items: (gqlOrder.lineItems?.edges ?? []).map((e: any) => ({
      title:    e.node.title,
      quantity: e.node.quantity,
      sku:      e.node.sku ?? "",
      price:    e.node.originalUnitPriceSet?.shopMoney?.amount ?? "0",
    })),
    shipping_lines: (gqlOrder.shippingLines?.edges ?? []).map((e: any) => ({
      title: e.node.title,
      price: e.node.originalPriceSet?.shopMoney?.amount ?? "0",
    })),
  };
}

/**
 * POST /api/sync-order
 * Manual per-order sync, called from the order detail page (app.orders.$id.tsx)
 * for any active integration — the connector is selected by name, not hardcoded,
 * so adding a new ERP under app/services/erp/<name>/ needs no change here.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const formData        = await request.formData();
  const shopifyGqlId     = String(formData.get("shopifyOrderId") ?? "").trim();
  const integrationName  = String(formData.get("integration") ?? "").trim();

  if (!shopifyGqlId || !integrationName) {
    return Response.json({ ok: false, error: "shopifyOrderId e integration son requeridos." }, { status: 400 });
  }

  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) {
    return Response.json({ ok: false, error: "Tienda no encontrada." }, { status: 404 });
  }

  const integration = await getIntegrationByName(integrationName);
  if (!integration) {
    return Response.json({ ok: false, error: `Integración "${integrationName}" no encontrada.` }, { status: 404 });
  }

  const controller = await buildControllerForShop(session.shop, integrationName);
  if (!controller) {
    return Response.json({ ok: false, error: `Integración "${integrationName}" sin credenciales configuradas.` }, { status: 400 });
  }

  const gqlResponse = await admin.graphql(ORDER_QUERY, { variables: { id: shopifyGqlId } });
  const gqlData     = await gqlResponse.json();
  const gqlOrder    = gqlData?.data?.order;

  if (!gqlOrder) {
    return Response.json({ ok: false, error: "Pedido no encontrado en Shopify." }, { status: 404 });
  }

  const order = gqlOrderToRest(gqlOrder);
  const result = await controller.syncOrderToERP(order, shop.id);

  const shopifyRestId = shopifyGqlId.replace(/^gid:\/\/shopify\/Order\//, "");

  if (result.success && result.erpId) {
    // "skipped" means the controller found this order already synced — that SyncLog
    // row already exists, so only persist a new one when a record was actually created.
    if (result.action !== "skipped") {
      await logOrderSync(
        shop.id,
        shopifyRestId,
        Number(result.erpId) || 0,
        { shopifyOrderId: shopifyGqlId },
        result,
        undefined,
        undefined,
        undefined,
        integration.id,
        integrationName,
      ).catch(() => null);
    }

    const docUrl = controller.getRecordUrl?.(result) ?? null;
    return Response.json({ ok: true, erpId: result.erpId, docUrl });
  }

  await logSyncError(
    shop.id,
    "ORDER",
    shopifyRestId,
    result.error ?? "Error desconocido",
    { shopifyOrderId: shopifyGqlId },
    undefined,
    undefined,
    undefined,
    integration.id,
    integrationName,
  ).catch(() => null);

  return Response.json({ ok: false, error: result.error ?? "Error desconocido." }, { status: 500 });
};
