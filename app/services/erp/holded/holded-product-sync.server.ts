import { HoldedService } from "./holded.service";
import { createSyncLog } from "../../logging/sync-logger.server";

const PRODUCTS_QUERY = `#graphql
  query getProductsForSync($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          handle
          status
          descriptionHtml
          variants(first: 10) {
            edges {
              node {
                id
                sku
                price
                inventoryQuantity
                title
              }
            }
          }
          featuredImage { url }
        }
      }
    }
  }
`;

export interface ProductSyncResult {
  total:   number;
  created: number;
  updated: number;
  errors:  number;
  skipped: number;
}

/**
 * Fetches all products from Shopify and upserts each one to Holded.
 *
 * Strategy:
 *   - For each Shopify product variant with a SKU, search Holded by SKU.
 *   - If found → update; if not found → create.
 *   - Variants without SKU are skipped (Holded requires a unique identifier).
 *   - Each result is written to SyncLog.
 */
export async function syncProductsToHolded(
  adminGraphql: (query: string, options?: any) => Promise<any>,
  shopId:        number,
  apikey:        string,
  integrationId: number,
): Promise<ProductSyncResult> {
  const holded = new HoldedService(apikey);
  const result: ProductSyncResult = { total: 0, created: 0, updated: 0, errors: 0, skipped: 0 };

  // ── Fetch all Holded products once to build a SKU → id map ───────────────
  const holdedSkuMap = new Map<string, string>(); // sku → holdedProductId
  try {
    let cursor: string | undefined;
    do {
      const page = await holded.listProducts(100, cursor);
      for (const p of page.items ?? []) {
        if (p.sku) holdedSkuMap.set(p.sku.toLowerCase(), p.id!);
      }
      cursor = page.has_more ? page.cursor : undefined;
    } while (cursor);
  } catch {
    // Non-fatal — we'll fall back to create-only mode
  }

  // ── Paginate all Shopify products ────────────────────────────────────────
  let hasNextPage = true;
  let afterCursor: string | null = null;

  while (hasNextPage) {
    const response = await adminGraphql(PRODUCTS_QUERY, {
      variables: { first: 50, after: afterCursor },
    });
    const json = await response.json();
    const productsData = json?.data?.products;

    if (!productsData) break;

    hasNextPage = productsData.pageInfo.hasNextPage;
    afterCursor = productsData.pageInfo.endCursor;

    for (const edge of productsData.edges) {
      const product  = edge.node;
      const variants = product.variants.edges.map((e: any) => e.node);

      for (const variant of variants) {
        result.total++;

        const sku = variant.sku?.trim();

        // Skip variants without SKU
        if (!sku) {
          result.skipped++;
          await createSyncLog({
            shopId,
            syncType:  "PRODUCT",
            shopifyId:  variant.id,
            status:    "ERROR",
            errorMessage: "No SKU — skipped",
            integrationId,
            erpName:   "holded",
          });
          continue;
        }

        const productName = variants.length > 1
          ? `${product.title} - ${variant.title}`
          : product.title;

        const holdedPayload = {
          name:        productName,
          sku,
          price:       parseFloat(variant.price ?? "0"),
          description: product.descriptionHtml
            ? product.descriptionHtml.replace(/<[^>]+>/g, "").trim()
            : undefined,
        };

        try {
          const existingId = holdedSkuMap.get(sku.toLowerCase());

          if (existingId) {
            // Update
            await holded.updateProduct(existingId, holdedPayload);
            result.updated++;
            await createSyncLog({
              shopId,
              syncType:    "PRODUCT",
              shopifyId:   variant.id,
              externalId:  0,
              status:      "SUCCESS",
              method:      "PUT",
              url:         `https://api.holded.com/api/v2/products/${existingId}`,
              requestData:  holdedPayload,
              responseData: { id: existingId },
              integrationId,
              erpName:     "holded",
            });
          } else {
            // Create
            const created = await holded.createProduct(holdedPayload);
            holdedSkuMap.set(sku.toLowerCase(), created.id);
            result.created++;
            await createSyncLog({
              shopId,
              syncType:    "PRODUCT",
              shopifyId:   variant.id,
              externalId:  0,
              status:      "SUCCESS",
              method:      "POST",
              url:         "https://api.holded.com/api/v2/products",
              requestData:  holdedPayload,
              responseData: created,
              integrationId,
              erpName:     "holded",
            });
          }
        } catch (err) {
          result.errors++;
          await createSyncLog({
            shopId,
            syncType:    "PRODUCT",
            shopifyId:   variant.id,
            status:      "ERROR",
            errorMessage: err instanceof Error ? err.message : String(err),
            requestData:  holdedPayload,
            integrationId,
            erpName:     "holded",
          });
        }
      }
    }
  }

  return result;
}
