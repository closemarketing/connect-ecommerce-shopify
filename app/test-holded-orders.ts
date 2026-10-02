import prisma from "./db.server";
import { HoldedController, holdedDocUrl } from "./services/erp/holded/holded.controller";

const shopDomain = "testclosetech.myshopify.com";
const SHOPIFY_API_VERSION = "2025-10";

const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
if (!shop) throw new Error("Shop not found");

const session = await prisma.session.findFirst({ where: { shop: shopDomain, isOnline: false } });
if (!session?.accessToken) throw new Error("No offline session");
const accessToken = session.accessToken;

const integration = await prisma.integration.findUnique({ where: { name: "holded" } });
if (!integration) throw new Error("No holded integration");
const cred = await prisma.integrationCredential.findFirst({
  where: { sessionId: shopDomain, integrationId: integration.id, key: "apikey" },
});
if (!cred) throw new Error("No apikey");
const holdedApiKey = cred.value;

async function gql(query: string, variables?: Record<string, any>) {
  const res = await fetch(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json: any = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function createDraftOrder(input: any) {
  const data = await gql(`
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id name totalPrice }
        userErrors { field message }
      }
    }
  `, { input });
  const errs = data.draftOrderCreate.userErrors;
  if (errs?.length) throw new Error(JSON.stringify(errs));
  return data.draftOrderCreate.draftOrder;
}

async function completeDraftOrder(id: string) {
  const data = await gql(`
    mutation draftOrderComplete($id: ID!) {
      draftOrderComplete(id: $id) {
        draftOrder { order { id name } }
        userErrors { field message }
      }
    }
  `, { id });
  const errs = data.draftOrderComplete.userErrors;
  if (errs?.length) throw new Error(JSON.stringify(errs));
  return data.draftOrderComplete.draftOrder.order;
}

const ORDER_QUERY = `
  query getOrder($id: ID!) {
    order(id: $id) {
      id
      name
      email
      totalPriceSet { shopMoney { amount currencyCode } }
      customer { firstName lastName email }
      lineItems(first: 50) {
        edges { node { title quantity sku originalUnitPriceSet { shopMoney { amount } } } }
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
    id: gqlOrder.id,
    name: gqlOrder.name,
    order_number: gqlOrder.name,
    email: gqlOrder.email,
    created_at: gqlOrder.createdAt,
    note: gqlOrder.note,
    customer: {
      first_name: gqlOrder.customer?.firstName ?? "",
      last_name: gqlOrder.customer?.lastName ?? "",
      email: gqlOrder.customer?.email ?? gqlOrder.email ?? "",
    },
    billing_address: {
      name: [gqlOrder.customer?.firstName, gqlOrder.customer?.lastName].filter(Boolean).join(" "),
      company: billing.company ?? "",
      address1: billing.address1 ?? "",
      address2: billing.address2 ?? "",
      city: billing.city ?? "",
      zip: billing.zip ?? "",
      country_code: billing.countryCode ?? "",
      phone: billing.phone ?? "",
      vat: billing.company ? "ESB00000000" : undefined,
    },
    line_items: (gqlOrder.lineItems?.edges ?? []).map((e: any) => ({
      title: e.node.title,
      quantity: e.node.quantity,
      sku: e.node.sku ?? "",
      price: e.node.originalUnitPriceSet?.shopMoney?.amount ?? "0",
    })),
    shipping_lines: (gqlOrder.shippingLines?.edges ?? []).map((e: any) => ({
      title: e.node.title,
      price: e.node.originalPriceSet?.shopMoney?.amount ?? "0",
    })),
  };
}

const CASES = [
  {
    label: "Caso A: particular sin VAT, con SKU existente en Holded -> salesreceipt",
    input: {
      email: "cliente.particular@example.com",
      lineItems: [{ title: "TEST Camiseta Basica", quantity: 2, priceOverride: { amount: "24.99", currencyCode: "EUR" } }],
      billingAddress: { firstName: "Ana", lastName: "Particular", address1: "Calle Falsa 123", city: "Madrid", zip: "28001", countryCode: "ES" },
      note: "Pedido test caso A - particular",
    },
  },
  {
    label: "Caso B: empresa con VAT/company -> invoice",
    input: {
      email: "empresa@example.com",
      lineItems: [{ title: "TEST Pantalon Premium", quantity: 1, priceOverride: { amount: "89.50", currencyCode: "EUR" } }],
      billingAddress: { firstName: "Carlos", lastName: "Gerente", company: "Test Empresa SL", address1: "Av. Comercio 45", city: "Barcelona", zip: "08001", countryCode: "ES" },
      note: "Pedido test caso B - empresa con VAT",
    },
  },
  {
    label: "Caso C: producto sin SKU en Holded (linea sin match, fallback nombre) + envio",
    input: {
      email: "cliente.sinstock@example.com",
      lineItems: [{ title: "TEST Producto Custom Sin Match", quantity: 3, priceOverride: { amount: "9.99", currencyCode: "EUR" } }],
      shippingLine: { title: "Envio estandar", price: "4.95" },
      billingAddress: { firstName: "Luis", lastName: "Envio", address1: "Plaza Mayor 1", city: "Sevilla", zip: "41001", countryCode: "ES" },
      note: "Pedido test caso C - producto sin match SKU + envio",
    },
  },
];

const results: any[] = [];

for (const c of CASES) {
  console.log("\n=== " + c.label + " ===");

  const draftInput: any = {
    email: c.input.email,
    lineItems: c.input.lineItems.map((li: any) => ({
      title: li.title,
      quantity: li.quantity,
      originalUnitPrice: li.priceOverride.amount,
    })),
    billingAddress: c.input.billingAddress,
    note: c.input.note,
  };
  if ((c.input as any).shippingLine) {
    draftInput.shippingLine = { title: (c.input as any).shippingLine.title, price: (c.input as any).shippingLine.price };
  }

  const draft = await createDraftOrder(draftInput);
  console.log("Draft created:", draft.id, draft.name);

  const order = await completeDraftOrder(draft.id);
  console.log("Order completed:", order.id, order.name);

  const gqlOrder = await gql(ORDER_QUERY, { id: order.id }).then((d) => d.order);
  const restOrder = gqlOrderToRest(gqlOrder);
  restOrder.note = c.input.note;

  const controller = new HoldedController(holdedApiKey, { docType: "smart", autoApprove: false });
  const syncResult = await controller.syncOrderToERP(restOrder, shop.id);

  console.log("Sync result:", JSON.stringify(syncResult));

  results.push({
    case: c.label,
    shopifyOrder: order.name,
    shopifyId: order.id,
    syncResult,
    docUrl: syncResult.success && syncResult.documentType
      ? holdedDocUrl(syncResult.documentType as any, String(syncResult.erpId))
      : null,
  });
}

console.log("\n\n========== SUMMARY ==========");
console.log(JSON.stringify(results, null, 2));

await prisma.$disconnect();
