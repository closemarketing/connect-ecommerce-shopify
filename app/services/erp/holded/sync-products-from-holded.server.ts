import prisma from "~/db.server";
import logger from "~/utils/logger.server";
import { HoldedService, parseHoldedPrice } from "./holded.service";

const SHOPIFY_API_VERSION = "2025-10";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SyncParams {
  jobId:        number;
  shopId:       number;
  shopDomain:   string;
  accessToken:  string;
  holdedApiKey: string;
}

interface SyncProductResult {
  sku:         string;
  productName: string;
  shopifyId?:  string;
  action:      "created" | "updated" | "skipped" | "error";
  error?:      string;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function shopifyGraphQL(
  shopDomain:  string,
  accessToken: string,
  query:       string,
  variables?:  Record<string, any>,
): Promise<any> {
  const url      = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const response = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type":           "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Shopify GraphQL ${response.status}: ${body}`);
  }

  const json: any = await response.json();

  if (json.errors?.length) {
    throw new Error(`Shopify GraphQL errors: ${json.errors.map((e: any) => e.message).join(", ")}`);
  }

  return json;
}

// ── Shopify helpers ───────────────────────────────────────────────────────────

interface VariantInfo {
  variantId:       string;
  productId:       string;
  inventoryItemId: string;
  tracked:         boolean;
}

async function findVariantBySku(
  shopDomain:  string,
  accessToken: string,
  sku:         string,
): Promise<VariantInfo | null> {
  const query = `
    query findVariantBySku($query: String!) {
      productVariants(first: 1, query: $query) {
        edges {
          node {
            id
            product { id }
            inventoryItem {
              id
              tracked
            }
          }
        }
      }
    }
  `;
  const json  = await shopifyGraphQL(shopDomain, accessToken, query, { query: `sku:"${sku}"` });
  const edges = json?.data?.productVariants?.edges ?? [];
  if (edges.length === 0) return null;

  const node = edges[0].node;
  return {
    variantId:       node.id,
    productId:       node.product.id,
    inventoryItemId: node.inventoryItem.id,
    tracked:         node.inventoryItem.tracked,
  };
}

async function findProductVariantByTitle(
  shopDomain:  string,
  accessToken: string,
  title:       string,
): Promise<{ productId: string; variantId: string; inventoryItemId: string } | null> {
  const query = `
    query findProductByTitle($query: String!) {
      products(first: 1, query: $query) {
        edges {
          node {
            id
            variants(first: 1) {
              edges { node { id inventoryItem { id } } }
            }
          }
        }
      }
    }
  `;
  const json  = await shopifyGraphQL(shopDomain, accessToken, query, { query: `title:"${title}"` });
  const edges = json?.data?.products?.edges ?? [];
  if (edges.length === 0) return null;
  const product = edges[0].node;
  const variant = product.variants.edges[0]?.node;
  if (!variant) return null;
  return { productId: product.id, variantId: variant.id, inventoryItemId: variant.inventoryItem.id };
}

async function getFirstLocationId(
  shopDomain:  string,
  accessToken: string,
): Promise<string> {
  const query = `
    query {
      locations(first: 1) {
        edges { node { id } }
      }
    }
  `;
  const json  = await shopifyGraphQL(shopDomain, accessToken, query);
  const edges = json?.data?.locations?.edges ?? [];
  if (edges.length === 0) throw new Error("No Shopify locations found");
  return edges[0].node.id;
}

async function updateVariantPrice(
  shopDomain:  string,
  accessToken: string,
  productId:   string,
  variantId:   string,
  price:       number,
): Promise<void> {
  const mutation = `
    mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants { id }
        userErrors { field message }
      }
    }
  `;
  const json   = await shopifyGraphQL(shopDomain, accessToken, mutation, {
    productId,
    variants: [{ id: variantId, price: price.toFixed(2) }],
  });
  const errors = json?.data?.productVariantsBulkUpdate?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`productVariantsBulkUpdate errors: ${errors.map((e: any) => e.message).join(", ")}`);
  }
}

async function updateInventory(
  shopDomain:      string,
  accessToken:     string,
  inventoryItemId: string,
  locationId:      string,
  quantity:        number,
): Promise<void> {
  const mutation = `
    mutation inventorySetOnHandQuantities($input: InventorySetOnHandQuantitiesInput!) {
      inventorySetOnHandQuantities(input: $input) {
        userErrors { field message }
      }
    }
  `;
  const json   = await shopifyGraphQL(shopDomain, accessToken, mutation, {
    input: {
      reason: "correction",
      setQuantities: [{ inventoryItemId, locationId, quantity }],
    },
  });
  const errors = json?.data?.inventorySetOnHandQuantities?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`inventorySetOnHandQuantities errors: ${errors.map((e: any) => e.message).join(", ")}`);
  }
}

async function activateAndSetInventory(
  shopDomain:      string,
  accessToken:     string,
  inventoryItemId: string,
  locationId:      string,
  quantity:        number,
): Promise<void> {
  // Enable tracking
  await shopifyGraphQL(shopDomain, accessToken, `
    mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
      inventoryItemUpdate(id: $id, input: $input) {
        inventoryItem { id }
        userErrors { field message }
      }
    }
  `, { id: inventoryItemId, input: { tracked: true } });

  // Connect item to location
  await shopifyGraphQL(shopDomain, accessToken, `
    mutation inventoryActivate($inventoryItemId: ID!, $locationId: ID!) {
      inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) {
        inventoryLevel { id }
        userErrors { field message }
      }
    }
  `, { inventoryItemId, locationId });

  // Set quantity
  await updateInventory(shopDomain, accessToken, inventoryItemId, locationId, quantity);
}

async function createProduct(
  shopDomain:  string,
  accessToken: string,
  name:        string,
  sku:         string,
  price:       number,
  description: string | undefined,
  stock:       number | null,
  locationId:  string,
): Promise<string> {
  // Step 1: create the product — Shopify auto-creates a "Default Title" variant
  const createMutation = `
    mutation productCreate($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          variants(first: 1) { edges { node { id inventoryItem { id } } } }
        }
        userErrors { field message }
      }
    }
  `;
  const createJson = await shopifyGraphQL(shopDomain, accessToken, createMutation, {
    input: {
      title:           name,
      descriptionHtml: description ?? "",
      status:          "ACTIVE",
    },
  });
  const createErrors = createJson?.data?.productCreate?.userErrors ?? [];
  let productId: string;
  let variantId: string;

  if (createErrors.length > 0) {
    // Product may already exist from a partial previous run — look it up by title
    const existing = await findProductVariantByTitle(shopDomain, accessToken, name);
    if (!existing) {
      throw new Error(`productCreate errors: ${createErrors.map((e: any) => e.message).join(", ")}`);
    }
    productId = existing.productId;
    variantId = existing.variantId;
  } else {
    productId = createJson.data.productCreate.product.id;
    variantId = createJson.data.productCreate.product.variants.edges[0]?.node?.id;
  }

  // Step 2: update the auto-created default variant with SKU and price
  const updateMutation = `
    mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants { id inventoryItem { id } }
        userErrors { field message }
      }
    }
  `;
  const updateJson = await shopifyGraphQL(shopDomain, accessToken, updateMutation, {
    productId,
    variants: [{ id: variantId, price: price.toFixed(2), inventoryItem: { sku } }],
  });
  const updateErrors = updateJson?.data?.productVariantsBulkUpdate?.userErrors ?? [];
  if (updateErrors.length > 0) {
    throw new Error(`productVariantsBulkUpdate errors: ${updateErrors.map((e: any) => e.message).join(", ")}`);
  }

  // Set initial stock: activate tracking, connect to location, then set quantity
  if (stock != null) {
    const inventoryItemId = updateJson?.data?.productVariantsBulkUpdate?.productVariants?.[0]?.inventoryItem?.id;
    if (inventoryItemId) {
      await activateAndSetInventory(shopDomain, accessToken, inventoryItemId, locationId, stock);
    }
  }

  return productId;
}

// ── Product sync ──────────────────────────────────────────────────────────────

async function syncOneProduct(
  shopDomain:  string,
  accessToken: string,
  name:        string,
  sku:         string,
  price:       number,
  description: string | undefined,
  stock:       number | null,
  locationId:  string,
): Promise<SyncProductResult> {
  const existing = await findVariantBySku(shopDomain, accessToken, sku);

  if (existing) {
    await updateVariantPrice(shopDomain, accessToken, existing.productId, existing.variantId, price);
    if (stock != null) {
      if (existing.tracked) {
        await updateInventory(shopDomain, accessToken, existing.inventoryItemId, locationId, stock);
      } else {
        await activateAndSetInventory(shopDomain, accessToken, existing.inventoryItemId, locationId, stock);
      }
    }
    return { sku, productName: name, shopifyId: existing.productId, action: "updated" };
  }

  const shopifyId = await createProduct(
    shopDomain, accessToken, name, sku, price, description, stock, locationId,
  );
  return { sku, productName: name, shopifyId, action: "created" };
}

// ── Main exported function ────────────────────────────────────────────────────

export async function runHoldedSync(params: SyncParams): Promise<void> {
  const { jobId, shopId, shopDomain, accessToken, holdedApiKey } = params;

  await prisma.holdedSyncJob.update({
    where: { id: jobId },
    data:  { status: "RUNNING", startedAt: new Date() },
  });

  const logEntries: SyncProductResult[] = [];
  let syncedCount = 0;
  let errorCount  = 0;

  try {
    const holded = new HoldedService(holdedApiKey);

    // Fetch all Holded products via paginated API v2
    const allProducts: import("./holded.service").HoldedProduct[] = [];
    let cursor: string | undefined;
    do {
      const page = await holded.listProducts(100, cursor);
      for (const p of page.items ?? []) {
        if (!p.archived) allProducts.push(p);
      }
      cursor = page.has_more ? page.cursor : undefined;
    } while (cursor);

    logger.info(`Holded sync [job ${jobId}]: ${allProducts.length} products fetched`);

    await prisma.holdedSyncJob.update({
      where: { id: jobId },
      data:  { totalProducts: allProducts.length },
    });

    const locationId = await getFirstLocationId(shopDomain, accessToken);

    for (let i = 0; i < allProducts.length; i++) {
      const product = allProducts[i];

      try {
        const sku = product.sku?.trim();

        if (!sku) {
          logEntries.push({ sku: "", productName: product.name, action: "skipped", error: "Sin SKU — producto no sincronizado" });
          syncedCount++;
        } else {
          const price       = parseHoldedPrice(product.price);
          const description = product.description?.trim() || undefined;

          // stock is a string in the API response ("0", "-3", etc.)
          // Only pass stock when the product actually tracks inventory.
          const stock = product.has_stock && product.stock != null
            ? Math.max(0, Number(product.stock))
            : null;

          const result = await syncOneProduct(
            shopDomain, accessToken,
            product.name, sku, price, description, stock,
            locationId,
          );
          logEntries.push(result);
          syncedCount++;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error(`Holded sync [job ${jobId}]: error on product "${product.name}": ${errMsg}`);
        logEntries.push({ sku: product.sku ?? "", productName: product.name, action: "error", error: errMsg });
        errorCount++;
      }

      if ((i + 1) % 5 === 0) {
        await prisma.holdedSyncJob.update({
          where: { id: jobId },
          data:  { syncedProducts: syncedCount, errorCount },
        });
      }

      await sleep(300);
    }

    const errorEntries = logEntries.filter((e) => e.action === "error");
    const skippedEntries = logEntries.filter((e) => e.action === "skipped");
    const summaryLines: string[] = [
      `Total: ${allProducts.length} | Creados: ${logEntries.filter((e) => e.action === "created").length} | Actualizados: ${logEntries.filter((e) => e.action === "updated").length} | Sin SKU: ${skippedEntries.length} | Errores: ${errorEntries.length}`,
    ];
    if (errorEntries.length > 0) {
      summaryLines.push("--- Errores ---");
      for (const e of errorEntries) {
        summaryLines.push(`• ${e.productName} (${e.sku || "sin SKU"}): ${e.error}`);
      }
    }
    if (skippedEntries.length > 0) {
      summaryLines.push(`--- Sin SKU (${skippedEntries.length}) ---`);
      for (const e of skippedEntries) {
        summaryLines.push(`• ${e.productName}`);
      }
    }
    const summary = summaryLines.join("\n");

    await prisma.holdedSyncJob.update({
      where: { id: jobId },
      data:  {
        status:         "COMPLETED",
        syncedProducts: syncedCount,
        errorCount,
        log:            JSON.stringify(logEntries),
        summary,
        completedAt:    new Date(),
      },
    });

    // Persist last_sync_at
    const integration = await prisma.integration.findUnique({ where: { name: "holded" } });
    if (integration) {
      await prisma.integrationCredential.upsert({
        where: {
          sessionId_integrationId_key: {
            sessionId:     shopDomain,
            integrationId: integration.id,
            key:           "last_sync_at",
          },
        },
        update: { value: new Date().toISOString() },
        create: {
          sessionId:     shopDomain,
          integrationId: integration.id,
          key:           "last_sync_at",
          value:         new Date().toISOString(),
        },
      });
    }

    logger.info(`Holded sync [job ${jobId}]: COMPLETED. synced=${syncedCount} errors=${errorCount}`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`Holded sync [job ${jobId}]: FAILED — ${errMsg}`);

    await prisma.holdedSyncJob.update({
      where: { id: jobId },
      data:  {
        status:      "FAILED",
        errorCount,
        log:         JSON.stringify(logEntries),
        completedAt: new Date(),
      },
    }).catch(() => {});
  }
}
