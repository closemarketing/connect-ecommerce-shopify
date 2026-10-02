import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { getIntegrationByName, getCredentials } from "~/models/Integration.server";
import { holdedDocUrl } from "~/services/erp/holded/holded.controller";
import type { HoldedDocType } from "~/services/erp/holded/holded.service";
import { getExtensionShop } from "~/utils/verify-extension-token.server";

const EXTENSION_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, { ...init, headers: { ...EXTENSION_CORS_HEADERS, ...init.headers } });
}

function withExtensionCors(response: Response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(EXTENSION_CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: EXTENSION_CORS_HEADERS });
  const isExtension = request.headers.has("Authorization");

  let shopDomain: string;

  if (isExtension) {
    const ext = getExtensionShop(request);
    if (!ext.ok) return withExtensionCors(ext.response);
    shopDomain = ext.shop;
  } else {
    const { session } = await authenticate.admin(request);
    shopDomain = session.shop;
  }

  const url           = new URL(request.url);
  const shopifyGqlId  = url.searchParams.get("shopifyOrderId") ?? "";
  const shopifyRestId = shopifyGqlId.replace(/^gid:\/\/shopify\/Order\//, "");

  if (!shopifyRestId) {
    return json({ synced: false, error: "shopifyOrderId requerido" }, { status: 400 });
  }

  const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
  if (!shop) {
    return json({ synced: false, error: "Tienda no encontrada" }, { status: 404 });
  }

  const syncLog = await prisma.syncLog.findFirst({
    where: {
      shopId:    shop.id,
      syncType:  "ORDER",
      shopifyId: shopifyRestId,
      status:    "SUCCESS",
      erpName:   "holded",
    },
    orderBy: { createdAt: "desc" },
  });

  if (!syncLog?.externalId) {
    return json({ synced: false });
  }

  const integration = await getIntegrationByName("holded");
  let docUrl: string | null = null;
  if (integration) {
    const creds      = await getCredentials(shopDomain, integration.id) as Record<string, string>;
    const docType    = (creds.holded_doc_type ?? "invoice") as HoldedDocType | "smart";
    let resolved: HoldedDocType | null = docType === "smart" ? null : docType;
    try {
      const loggedType = JSON.parse(syncLog.responseData ?? "{}").documentType;
      if (["invoice", "salesreceipt", "salesorder", "waybill"].includes(loggedType)) {
        resolved = loggedType as HoldedDocType;
      }
    } catch {
      // Legacy logs may not contain JSON response data.
    }
    docUrl = resolved ? holdedDocUrl(resolved, syncLog.externalId) : null;
  }

  return json({
    synced:   true,
    erpId:    syncLog.externalId,
    docUrl,
    syncedAt: syncLog.createdAt,
  });
};
