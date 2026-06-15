import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { getIntegrationByName, getCredentials } from "~/models/Integration.server";
import { HoldedController, holdedDocUrl } from "~/services/erp/holded/holded.controller";
import type { HoldedDocType } from "~/services/erp/holded/holded.service";

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
    await prisma.syncLog.create({
      data: {
        shopId:        shop.id,
        syncType:      "ORDER",
        shopifyId:     shopifyRestId,
        externalId:    String(result.erpId),
        status:        "SUCCESS",
        erpName:       "holded",
        integrationId: integration.id,
        requestData:   JSON.stringify({ shopifyOrderId: shopifyGqlId }),
        responseData:  JSON.stringify({ erpId: result.erpId }),
      },
    }).catch(() => null);

    // Resolve actual doc type for URL (smart was already resolved inside controller)
    const resolvedDocType: HoldedDocType = docType === "smart"
      ? "invoice"   // conservative default; controller already resolved it but we don't receive it back
      : docType as HoldedDocType;

    const docUrl = holdedDocUrl(resolvedDocType, String(result.erpId));
    return Response.json({ ok: true, erpId: result.erpId, docUrl });
  }

  await prisma.syncLog.create({
    data: {
      shopId:        shop.id,
      syncType:      "ORDER",
      shopifyId:     shopifyRestId,
      status:        "ERROR",
      erpName:       "holded",
      integrationId: integration.id,
      errorMessage:  result.error ?? "Error desconocido",
      requestData:   JSON.stringify({ shopifyOrderId: shopifyGqlId }),
    },
  }).catch(() => null);

  return Response.json({ ok: false, error: result.error ?? "Error desconocido." }, { status: 500 });
};
