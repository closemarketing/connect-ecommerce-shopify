import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { getIntegrationByName, getCredentials } from "~/models/Integration.server";
import { HoldedController, holdedDocUrl } from "~/services/erp/holded/holded.controller";
import type { HoldedDocType } from "~/services/erp/holded/holded.service";
import { getExtensionShop } from "~/utils/verify-extension-token.server";

const SHOPIFY_API_VERSION = "2025-10";

const ORDER_QUERY = `
  query getOrder($id: ID!, $lineItemsAfter: String) {
    order(id: $id) {
      id
      name
      email
      totalPriceSet { shopMoney { amount currencyCode } }
      customer { firstName lastName email }
      lineItems(first: 250, after: $lineItemsAfter) {
        edges {
          node { title quantity sku originalUnitPriceSet { shopMoney { amount } } }
        }
        pageInfo { hasNextPage endCursor }
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

async function fetchOrderViaRest(
  shopDomain: string,
  accessToken: string,
  shopifyGqlId: string,
  lineItemsAfter?: string | null,
) {
  const url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type":           "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({
      query: ORDER_QUERY,
      variables: { id: shopifyGqlId, lineItemsAfter: lineItemsAfter ?? null },
    }),
  });
  const json = await res.json() as any;
  return json?.data?.order ?? null;
}

async function fetchCompleteOrder(
  fetchPage: (lineItemsAfter?: string | null) => Promise<any>,
) {
  let order = await fetchPage();
  if (!order) return null;

  const lineItemEdges = [...(order.lineItems?.edges ?? [])];
  let pageInfo = order.lineItems?.pageInfo;

  while (pageInfo?.hasNextPage && pageInfo.endCursor) {
    const nextOrder = await fetchPage(pageInfo.endCursor);
    if (!nextOrder) throw new Error("No se pudieron obtener todas las líneas del pedido.");
    lineItemEdges.push(...(nextOrder.lineItems?.edges ?? []));
    pageInfo = nextOrder.lineItems?.pageInfo;
  }

  order = { ...order, lineItems: { ...order.lineItems, edges: lineItemEdges } };
  return order;
}

function getDocumentType(syncLog: { responseData: string | null }, configuredType: HoldedDocType | "smart") {
  try {
    const documentType = JSON.parse(syncLog.responseData ?? "{}").documentType;
    if (["invoice", "salesreceipt", "salesorder", "waybill"].includes(documentType)) {
      return documentType as HoldedDocType;
    }
  } catch {
    // Legacy logs may not contain JSON response data.
  }

  return configuredType === "smart" ? null : configuredType;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const isExtension = request.headers.has("Authorization");

  let shopDomain:   string;
  let accessToken:  string;
  let adminGraphql: ((query: string, opts: any) => Promise<any>) | null = null;

  if (isExtension) {
    // Request comes from Admin UI Extension — verify JWT, load session from DB
    const ext = getExtensionShop(request);
    if (!ext.ok) return ext.response;

    shopDomain = ext.shop;
    const session = await prisma.session.findFirst({
      where:   { shop: shopDomain },
      orderBy: { expires: "desc" },
    });
    if (!session?.accessToken) {
      return Response.json({ ok: false, error: "Sesión no encontrada para esta tienda." }, { status: 401 });
    }
    accessToken = session.accessToken;
  } else {
    // Request comes from embedded app — standard OAuth session
    const { session, admin } = await authenticate.admin(request);
    shopDomain  = session.shop;
    accessToken = session.accessToken!;
    adminGraphql = (q: string, opts: any) => admin.graphql(q, opts).then((r: any) => r.json());
  }

  const formData     = await request.formData();
  const shopifyGqlId = String(formData.get("shopifyOrderId") ?? "").trim();
  const force        = formData.get("force") === "true";

  if (!shopifyGqlId) {
    return Response.json({ ok: false, error: "shopifyOrderId es requerido." }, { status: 400 });
  }

  const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
  if (!shop) {
    return Response.json({ ok: false, error: "Tienda no encontrada." }, { status: 404 });
  }

  const integration = await getIntegrationByName("holded");
  if (!integration) {
    return Response.json({ ok: false, error: "Integración Holded no encontrada." }, { status: 500 });
  }

  const credentials = await getCredentials(shopDomain, integration.id) as Record<string, string>;
  if (!credentials.apikey) {
    return Response.json({ ok: false, error: "API Key de Holded no configurada." }, { status: 400 });
  }

  const shopifyRestId = shopifyGqlId.replace(/^gid:\/\/shopify\/Order\//, "");
  const docType = (credentials.holded_doc_type ?? "smart") as "smart" | HoldedDocType;

  if (!force) {
    const existingLog = await prisma.syncLog.findFirst({
      where: {
        shopId: shop.id,
        syncType: "ORDER",
        shopifyId: shopifyRestId,
        status: "SUCCESS",
        erpName: "holded",
      },
      orderBy: { createdAt: "desc" },
    });

    if (existingLog?.externalId) {
      const existingDocType = getDocumentType(existingLog, docType);
      return Response.json({
        ok: true,
        erpId: existingLog.externalId,
        docUrl: existingDocType ? holdedDocUrl(existingDocType, existingLog.externalId) : null,
        alreadySynced: true,
      });
    }
  }

  let gqlOrder: any;
  if (adminGraphql) {
    gqlOrder = await fetchCompleteOrder(async (lineItemsAfter) => {
      const gqlData = await adminGraphql(ORDER_QUERY, {
        variables: { id: shopifyGqlId, lineItemsAfter: lineItemsAfter ?? null },
      });
      return gqlData?.data?.order;
    });
  } else {
    gqlOrder = await fetchCompleteOrder((lineItemsAfter) =>
      fetchOrderViaRest(shopDomain, accessToken, shopifyGqlId, lineItemsAfter),
    );
  }

  if (!gqlOrder) {
    return Response.json({ ok: false, error: "Pedido no encontrado en Shopify." }, { status: 404 });
  }

  const order = gqlOrderToRest(gqlOrder);

  const serialNum   = credentials.holded_serial || undefined;
  const autoApprove = credentials.holded_auto_approve === "true";

  const controller = new HoldedController(credentials.apikey, { docType, serialNum, autoApprove });
  const result     = await controller.syncOrderToERP(order, shop.id);

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
        responseData:  JSON.stringify({ erpId: result.erpId, documentType: result.documentType }),
      },
    }).catch(() => null);

    const resolvedDocType = result.documentType as HoldedDocType | undefined;
    const docUrl = resolvedDocType ? holdedDocUrl(resolvedDocType, String(result.erpId)) : null;
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
