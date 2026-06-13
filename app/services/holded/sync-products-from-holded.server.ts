import prisma from "../../db.server";
import logger from "../../utils/logger.server";
import { HoldedInvoicingService, type HoldedProduct, type HoldedVariant } from "./holded.server";

const SHOPIFY_API_VERSION = "2025-10";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SyncParams {
  jobId:         number;
  shopId:        number;
  shopDomain:    string;
  accessToken:   string;
  holdedApiKey:  string;
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
      "Content-Type":          "application/json",
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
  const json = await shopifyGraphQL(shopDomain, accessToken, query, {
    query: `sku:"${sku}"`,
  });

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
  const json = await shopifyGraphQL(shopDomain, accessToken, query);
  const edges = json?.data?.locations?.edges ?? [];
  if (edges.length === 0) throw new Error("No Shopify locations found");
  return edges[0].node.id;
}

async function updateVariantPrice(
  shopDomain:  string,
  accessToken: string,
  variantId:   string,
  price:       number,
): Promise<void> {
  const mutation = `
    mutation productVariantUpdate($input: ProductVariantInput!) {
      productVariantUpdate(input: $input) {
        productVariant { id price }
        userErrors { field message }
      }
    }
  `;
  const json = await shopifyGraphQL(shopDomain, accessToken, mutation, {
    input: { id: variantId, price: price.toFixed(2) },
  });
  const errors = json?.data?.productVariantUpdate?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`productVariantUpdate errors: ${errors.map((e: any) => e.message).join(", ")}`);
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
  const json = await shopifyGraphQL(shopDomain, accessToken, mutation, {
    input: {
      reason: "correction",
      setQuantities: [
        {
          inventoryItemId,
          locationId,
          quantity,
        },
      ],
    },
  });
  const errors = json?.data?.inventorySetOnHandQuantities?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`inventorySetOnHandQuantities errors: ${errors.map((e: any) => e.message).join(", ")}`);
  }
}

async function createSimpleProduct(
  shopDomain:  string,
  accessToken: string,
  product:     HoldedProduct,
  locationId:  string,
): Promise<string> {
  const mutation = `
    mutation productCreate($input: ProductInput!) {
      productCreate(input: $input) {
        product { id }
        userErrors { field message }
      }
    }
  `;

  const variantInput: any = {
    sku:   product.sku,
    price: product.price.toFixed(2),
  };
  if (product.stock != null) {
    variantInput.inventoryQuantities = [
      { availableQuantity: product.stock, locationId },
    ];
  }

  const input: any = {
    title:           product.name,
    descriptionHtml: product.desc ?? "",
    status:          "ACTIVE",
    variants:        [variantInput],
  };

  const json = await shopifyGraphQL(shopDomain, accessToken, mutation, { input });
  const errors = json?.data?.productCreate?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`productCreate errors: ${errors.map((e: any) => e.message).join(", ")}`);
  }
  return json.data.productCreate.product.id;
}

async function createVariableProduct(
  shopDomain:  string,
  accessToken: string,
  product:     HoldedProduct,
  variants:    HoldedVariant[],
  locationId:  string,
): Promise<string> {
  const mutation = `
    mutation productCreate($input: ProductInput!) {
      productCreate(input: $input) {
        product { id }
        userErrors { field message }
      }
    }
  `;

  const variantInputs = variants.map((v) => {
    const vi: any = {
      sku:   v.sku,
      price: v.price.toFixed(2),
    };
    if (v.stock != null) {
      vi.inventoryQuantities = [
        { availableQuantity: v.stock, locationId },
      ];
    }
    return vi;
  });

  const input: any = {
    title:           product.name,
    descriptionHtml: product.desc ?? "",
    status:          "ACTIVE",
    variants:        variantInputs,
  };

  const json = await shopifyGraphQL(shopDomain, accessToken, mutation, { input });
  const errors = json?.data?.productCreate?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`productCreate errors: ${errors.map((e: any) => e.message).join(", ")}`);
  }
  return json.data.productCreate.product.id;
}

// ── Product-level sync functions ──────────────────────────────────────────────

async function syncSimpleProduct(
  shopDomain:  string,
  accessToken: string,
  product:     HoldedProduct,
  locationId:  string,
): Promise<SyncProductResult> {
  const sku = product.sku?.trim();

  if (!sku) {
    return { sku: "", productName: product.name, action: "skipped" };
  }

  const existing = await findVariantBySku(shopDomain, accessToken, sku);

  if (existing) {
    await updateVariantPrice(shopDomain, accessToken, existing.variantId, product.price);
    if (existing.tracked && product.stock != null) {
      await updateInventory(shopDomain, accessToken, existing.inventoryItemId, locationId, product.stock);
    }
    return { sku, productName: product.name, shopifyId: existing.productId, action: "updated" };
  }

  const shopifyId = await createSimpleProduct(shopDomain, accessToken, product, locationId);
  return { sku, productName: product.name, shopifyId, action: "created" };
}

async function syncVariableProduct(
  shopDomain:  string,
  accessToken: string,
  product:     HoldedProduct,
  locationId:  string,
): Promise<SyncProductResult[]> {
  const variants = product.variants ?? [];

  if (variants.length === 0) {
    return [{ sku: product.sku ?? "", productName: product.name, action: "skipped" }];
  }

  const results:  SyncProductResult[] = [];
  const missing:  HoldedVariant[]     = [];

  for (const variant of variants) {
    const sku = variant.sku?.trim();
    if (!sku) {
      results.push({ sku: "", productName: `${product.name} - ${variant.name}`, action: "skipped" });
      continue;
    }

    const existing = await findVariantBySku(shopDomain, accessToken, sku);

    if (existing) {
      await updateVariantPrice(shopDomain, accessToken, existing.variantId, variant.price);
      if (existing.tracked && variant.stock != null) {
        await updateInventory(shopDomain, accessToken, existing.inventoryItemId, locationId, variant.stock);
      }
      results.push({ sku, productName: `${product.name} - ${variant.name}`, shopifyId: existing.productId, action: "updated" });
    } else {
      missing.push(variant);
    }

    await sleep(300);
  }

  // If ALL variants were missing, create the whole variable product
  if (missing.length === variants.length) {
    const shopifyId = await createVariableProduct(shopDomain, accessToken, product, missing, locationId);
    for (const v of missing) {
      results.push({ sku: v.sku, productName: `${product.name} - ${v.name}`, shopifyId, action: "created" });
    }
  } else {
    // Some were found, some not — individual missing variants are skipped (partial match)
    for (const v of missing) {
      results.push({ sku: v.sku, productName: `${product.name} - ${v.name}`, action: "skipped" });
    }
  }

  return results;
}

// ── Main exported function ────────────────────────────────────────────────────

export async function runHoldedSync(params: SyncParams): Promise<void> {
  const { jobId, shopId, shopDomain, accessToken, holdedApiKey } = params;

  // Mark job as RUNNING
  await prisma.holdedSyncJob.update({
    where: { id: jobId },
    data:  { status: "RUNNING", startedAt: new Date() },
  });

  const logEntries: SyncProductResult[] = [];
  let syncedCount = 0;
  let errorCount  = 0;

  try {
    const holdedService = new HoldedInvoicingService(holdedApiKey);
    const products      = await holdedService.getProducts();

    logger.info(`Holded sync [job ${jobId}]: ${products.length} products fetched`);

    await prisma.holdedSyncJob.update({
      where: { id: jobId },
      data:  { totalProducts: products.length },
    });

    const locationId = await getFirstLocationId(shopDomain, accessToken);

    for (let i = 0; i < products.length; i++) {
      const product = products[i];

      try {
        let results: SyncProductResult[];

        if (holdedService.isVariableProduct(product)) {
          results = await syncVariableProduct(shopDomain, accessToken, product, locationId);
        } else {
          results = [await syncSimpleProduct(shopDomain, accessToken, product, locationId)];
        }

        for (const r of results) {
          logEntries.push(r);
          if (r.action === "error") {
            errorCount++;
          } else {
            syncedCount++;
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error(`Holded sync [job ${jobId}]: error on product "${product.name}": ${errMsg}`);
        logEntries.push({
          sku:         product.sku ?? "",
          productName: product.name,
          action:      "error",
          error:       errMsg,
        });
        errorCount++;
      }

      // Update DB progress every 5 products
      if ((i + 1) % 5 === 0) {
        await prisma.holdedSyncJob.update({
          where: { id: jobId },
          data:  { syncedProducts: syncedCount, errorCount },
        });
      }

      await sleep(500);
    }

    // Final job update — COMPLETED
    await prisma.holdedSyncJob.update({
      where: { id: jobId },
      data:  {
        status:        "COMPLETED",
        syncedProducts: syncedCount,
        errorCount,
        log:           JSON.stringify(logEntries),
        completedAt:   new Date(),
      },
    });

    // Persist last_sync_at credential
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
