import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { getIntegrationByName, getCredentials, isIntegrationActive } from "~/models/Integration.server";
import { HoldedController, holdedDocUrl } from "~/services/erp/holded/holded.controller";
import type { HoldedDocType } from "~/services/erp/holded/holded.service";
import { getExtensionShop } from "~/utils/verify-extension-token.server";

const SHOPIFY_API_VERSION = "2025-10";
const EXTENSION_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class ShopifyOrderAccessError extends Error {}

function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: { ...EXTENSION_CORS_HEADERS, ...init.headers },
  });
}

function withExtensionCors(response: Response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(EXTENSION_CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const loader = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: EXTENSION_CORS_HEADERS });
  return json({ ok: false, error: "Método no permitido." }, { status: 405 });
};

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
          node {
            title
            quantity
            sku
            originalUnitPriceSet { shopMoney { amount } }
            discountAllocations { allocatedAmountSet { shopMoney { amount } } }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
      billingAddress { firstName lastName address1 address2 city zip countryCode company phone }
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
      name:         [
        gqlOrder.customer?.firstName ?? billing.firstName,
        gqlOrder.customer?.lastName ?? billing.lastName,
      ].filter(Boolean).join(" "),
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
      discount_allocations: (e.node.discountAllocations ?? []).map((discount: any) => ({
        amount: discount.allocatedAmountSet?.shopMoney?.amount ?? "0",
      })),
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
  const error = json?.errors?.[0]?.message;
  if (error) throw new ShopifyOrderAccessError(error);
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

async function getSyncRequestData(request: Request) {
  if (request.headers.get("content-type")?.includes("application/json")) {
    const body = await request.json() as { shopifyOrderId?: unknown; force?: unknown };
    return {
      shopifyGqlId: String(body.shopifyOrderId ?? "").trim(),
      force: body.force === true || body.force === "true",
    };
  }

  const formData = await request.formData();
  return {
    shopifyGqlId: String(formData.get("shopifyOrderId") ?? "").trim(),
    force: formData.get("force") === "true",
  };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const isExtension = request.headers.has("Authorization");

  let shopDomain:   string;
  let accessToken:  string;
  let adminGraphql: ((query: string, opts: any) => Promise<any>) | null = null;

  if (isExtension) {
    // Request comes from Admin UI Extension — verify JWT, load session from DB
    const ext = getExtensionShop(request);
    if (!ext.ok) return withExtensionCors(ext.response);

    shopDomain = ext.shop;
    const session = await prisma.session.findFirst({
      where:   { shop: shopDomain, isOnline: false },
      orderBy: { expires: "desc" },
    });
    if (!session?.accessToken) {
      return json({ ok: false, error: "Sesión no encontrada para esta tienda." }, { status: 401 });
    }
    accessToken = session.accessToken;
  } else {
    // Request comes from embedded app — standard OAuth session
    const { session, admin } = await authenticate.admin(request);
    shopDomain  = session.shop;
    accessToken = session.accessToken!;
    adminGraphql = (q: string, opts: any) => admin.graphql(q, opts).then((r: any) => r.json());
  }

  const { shopifyGqlId, force } = await getSyncRequestData(request);

  if (!shopifyGqlId) {
    return json({ ok: false, error: "shopifyOrderId es requerido." }, { status: 400 });
  }

  const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
  if (!shop) {
    return json({ ok: false, error: "Tienda no encontrada." }, { status: 404 });
  }

  const integration = await getIntegrationByName("holded");
  if (!integration) {
    return json({ ok: false, error: "Integración Holded no encontrada." }, { status: 500 });
  }

  const credentials = await getCredentials(shopDomain, integration.id) as Record<string, string>;
  if (!credentials.apikey) {
    return json({ ok: false, error: "API Key de Holded no configurada." }, { status: 400 });
  }

  const shopifyRestId = shopifyGqlId.replace(/^gid:\/\/shopify\/Order\//, "");
  const active = await isIntegrationActive(shopDomain, "holded");
  if (!active) return json({ ok: false, error: "La integración Holded está desactivada para esta tienda." }, { status: 403 });

  const docType = (credentials.holded_doc_type ?? "invoice") as "smart" | HoldedDocType;

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
      return json({
        ok: true,
        erpId: existingLog.externalId,
        docUrl: existingDocType ? holdedDocUrl(existingDocType, existingLog.externalId) : null,
        alreadySynced: true,
      });
    }
  }

  let gqlOrder: any;
  try {
    if (adminGraphql) {
      gqlOrder = await fetchCompleteOrder(async (lineItemsAfter) => {
        const gqlData = await adminGraphql(ORDER_QUERY, {
          variables: { id: shopifyGqlId, lineItemsAfter: lineItemsAfter ?? null },
        });
        const error = gqlData?.errors?.[0]?.message;
        if (error) throw new ShopifyOrderAccessError(error);
        return gqlData?.data?.order;
      });
    } else {
      gqlOrder = await fetchCompleteOrder((lineItemsAfter) =>
        fetchOrderViaRest(shopDomain, accessToken, shopifyGqlId, lineItemsAfter),
      );
    }
  } catch (error) {
    if (error instanceof ShopifyOrderAccessError) {
      return json({
        ok: false,
        error: "Shopify no ha autorizado a esta app para acceder a pedidos y datos de cliente. Solicita el acceso a datos de clientes protegidos en Shopify Partners.",
      }, { status: 403 });
    }
    throw error;
  }

  if (!gqlOrder) return json({ ok: false, error: "Pedido no encontrado en Shopify." }, { status: 404 });

  const order = gqlOrderToRest(gqlOrder);

  const serialNum   = credentials.holded_serial || undefined;
  const autoApprove = credentials.holded_auto_approve === "true";

  const controller = new HoldedController(credentials.apikey, { docType, serialNum, autoApprove });
  const result     = await controller.syncOrderToERP(order, shop.id);

  if (result.success && result.erpId) {
    let warning = result.warning;
    try {
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
          responseData:  JSON.stringify({ erpId: result.erpId, documentType: result.documentType, warning }),
        },
      });
    } catch {
      warning = `El documento ${result.erpId} se creó en Holded, pero no se pudo guardar el registro local. No reintentes el envío.`;
    }

    const resolvedDocType = result.documentType as HoldedDocType | undefined;
    const docUrl = resolvedDocType ? holdedDocUrl(resolvedDocType, String(result.erpId)) : null;
    return json({ ok: true, erpId: result.erpId, docUrl, warning });
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

  return json({ ok: false, error: result.error ?? "Error desconocido." }, { status: 500 });
};
