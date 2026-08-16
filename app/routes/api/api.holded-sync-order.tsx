import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { getIntegrationByName, getCredentials } from "~/models/Integration.server";
import { HoldedController, holdedDocUrl } from "~/services/erp/holded/holded.controller";
import type { HoldedDocType } from "~/services/erp/holded/holded.service";
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

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const formData     = await request.formData();
  const shopifyGqlId = String(formData.get("shopifyOrderId") ?? "").trim();

  if (!shopifyGqlId) {
    return Response.json({ ok: false, error: "shopifyOrderId es requerido." }, { status: 400 });
  }

  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) {
    return Response.json({ ok: false, error: "Tienda no encontrada." }, { status: 404 });
  }

  const integration = await getIntegrationByName("holded");
  if (!integration) {
    return Response.json({ ok: false, error: "Integración Holded no encontrada." }, { status: 500 });
  }

  const credentials = await getCredentials(session.shop, integration.id) as Record<string, string>;
  if (!credentials.apikey) {
    return Response.json({ ok: false, error: "API Key de Holded no configurada." }, { status: 400 });
  }

  const gqlResponse = await admin.graphql(ORDER_QUERY, { variables: { id: shopifyGqlId } });
  const gqlData     = await gqlResponse.json();
  const gqlOrder    = gqlData?.data?.order;

  if (!gqlOrder) {
    return Response.json({ ok: false, error: "Pedido no encontrado en Shopify." }, { status: 404 });
  }

  const order = gqlOrderToRest(gqlOrder);

  const docType     = (credentials.holded_doc_type ?? "smart") as "smart" | HoldedDocType;
  const serialNum   = credentials.holded_serial || undefined;
  const autoApprove = credentials.holded_auto_approve === "true";

  const controller = new HoldedController(credentials.apikey, { docType, serialNum, autoApprove });
  const result     = await controller.syncOrderToERP(order, shop.id);

  const shopifyRestId = shopifyGqlId.replace(/^gid:\/\/shopify\/Order\//, "");

  if (result.success && result.erpId) {
    // "skipped" means the controller found this order already synced — that SyncLog
    // row already exists, so only persist a new one when a document was actually created.
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
        "holded",
      ).catch(() => null);
    }

    // The controller resolves "smart" mode internally (VAT present → invoice, else
    // salesreceipt) and reports the actual type back via result.docType.
    const resolvedDocType = (result.docType ?? (docType === "smart" ? "invoice" : docType)) as HoldedDocType;

    const docUrl = holdedDocUrl(resolvedDocType, String(result.erpId));
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
    "holded",
  ).catch(() => null);

  return Response.json({ ok: false, error: result.error ?? "Error desconocido." }, { status: 500 });
};
