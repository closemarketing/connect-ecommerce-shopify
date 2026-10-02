import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runHoldedSync, type SyncParams } from "../../app/services/erp/holded/sync-products-from-holded.server";
import prismaMock from "../../app/db.server";
import {
  mockSimpleProduct,
  mockSimpleProductNoSku,
  mockSimpleProductNoStock,
  makeHoldedPage,
} from "../fixtures/holded-products.mock";

// ── Module mocks (hoisted by Vitest before imports) ───────────────────────────

vi.mock("../../app/db.server", () => ({
  default: {
    holdedSyncJob:          { update: vi.fn() },
    integration:            { findUnique: vi.fn() },
    integrationCredential:  { upsert: vi.fn() },
  },
}));

vi.mock("../../app/utils/logger.server", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// ── Constants ─────────────────────────────────────────────────────────────────

const LOCATION_GID  = "gid://shopify/Location/1";
const PRODUCT_GID   = "gid://shopify/Product/100";
const VARIANT_GID   = "gid://shopify/ProductVariant/200";
const INV_ITEM_GID  = "gid://shopify/InventoryItem/300";

const SYNC_PARAMS: SyncParams = {
  jobId:        1,
  shopId:       1,
  shopDomain:   "test-shop.myshopify.com",
  accessToken:  "shpat_test",
  holdedApiKey: "test-holded-key",
};

// ── Fetch mock builder ────────────────────────────────────────────────────────

interface MockVariantInfo {
  variantId:       string;
  productId:       string;
  inventoryItemId: string;
  tracked:         boolean;
}

type VariantMap = Record<string, MockVariantInfo | null>;

function buildFetch(opts: {
  products?:      any[];
  variants?:      VariantMap;
  newProductId?:  string;
  failOn?:        string; // GraphQL mutation name — fails only on its FIRST call
}) {
  const { products = [], variants = {}, newProductId = PRODUCT_GID, failOn } = opts;
  let failOnCalled = false;

  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    // Holded API — returns paginated v2 response ───────────────────────────────
    if ((url as string).includes("holded.com")) {
      return makeHoldedPage(products);
    }

    const body  = JSON.parse((init?.body as string) ?? "{}");
    const query = (body.query as string) ?? "";

    // Shopify: locations ──────────────────────────────────────────────────────
    if (query.includes("locations(first")) {
      return {
        ok: true, status: 200,
        json: async () => ({ data: { locations: { edges: [{ node: { id: LOCATION_GID } }] } } }),
      };
    }

    // Shopify: find variant by SKU ─────────────────────────────────────────────
    if (query.includes("productVariants(first")) {
      const skuMatch = (body.variables?.query as string ?? "").match(/sku:"([^"]+)"/);
      const sku      = skuMatch?.[1] ?? "";
      const info     = variants[sku] ?? null;
      return {
        ok: true, status: 200,
        json: async () => ({
          data: {
            productVariants: {
              edges: info
                ? [{ node: { id: info.variantId, product: { id: info.productId }, inventoryItem: { id: info.inventoryItemId, tracked: info.tracked } } }]
                : [],
            },
          },
        }),
      };
    }

    // Shopify: update variant price (API v2 — productVariantsBulkUpdate) ───────
    if (query.includes("productVariantsBulkUpdate")) {
      if (failOn === "productVariantsBulkUpdate" && !failOnCalled) {
        failOnCalled = true;
        return {
          ok: true, status: 200,
          json: async () => ({ data: { productVariantsBulkUpdate: { productVariants: [], userErrors: [{ field: "price", message: "Invalid price" }] } } }),
        };
      }
      return {
        ok: true, status: 200,
        json: async () => ({ data: { productVariantsBulkUpdate: { productVariants: [{ id: VARIANT_GID, inventoryItem: { id: INV_ITEM_GID } }], userErrors: [] } } }),
      };
    }

    // Shopify: inventoryItemUpdate ─────────────────────────────────────────────
    if (query.includes("inventoryItemUpdate")) {
      return {
        ok: true, status: 200,
        json: async () => ({ data: { inventoryItemUpdate: { inventoryItem: { id: INV_ITEM_GID }, userErrors: [] } } }),
      };
    }

    // Shopify: inventoryActivate ───────────────────────────────────────────────
    if (query.includes("inventoryActivate")) {
      return {
        ok: true, status: 200,
        json: async () => ({ data: { inventoryActivate: { inventoryLevel: { id: "gid://shopify/InventoryLevel/1" }, userErrors: [] } } }),
      };
    }

    // Shopify: inventorySetOnHandQuantities ───────────────────────────────────
    if (query.includes("inventorySetOnHandQuantities")) {
      return {
        ok: true, status: 200,
        json: async () => ({ data: { inventorySetOnHandQuantities: { userErrors: [] } } }),
      };
    }

    // Shopify: create product ─────────────────────────────────────────────────
    if (query.includes("productCreate")) {
      return {
        ok: true, status: 200,
        json: async () => ({
          data: {
            productCreate: {
              product: {
                id: newProductId,
                variants: { edges: [{ node: { id: VARIANT_GID, inventoryItem: { id: INV_ITEM_GID } } }] },
              },
              userErrors: [],
            },
          },
        }),
      };
    }

    throw new Error(`Unmocked fetch: ${url} — query: ${query.slice(0, 80)}`);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function queriesUsed(mockFetch: ReturnType<typeof vi.fn>): string[] {
  return mockFetch.mock.calls
    .map((c: any[]) => {
      try { return JSON.parse(c[1]?.body ?? "{}").query as string; } catch { return ""; }
    })
    .filter(Boolean);
}

async function runSync(params: SyncParams = SYNC_PARAMS): Promise<void> {
  const done = runHoldedSync(params);
  await vi.runAllTimersAsync();
  await done;
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  (prismaMock.holdedSyncJob.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
  (prismaMock.integration.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1, name: "holded" });
  (prismaMock.integrationCredential.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runHoldedSync — simple product exists in Shopify", () => {
  it("calls productVariantsBulkUpdate and inventorySetOnHandQuantities when tracking is on", async () => {
    const mockFetch = buildFetch({
      products: [mockSimpleProduct],
      variants: {
        [mockSimpleProduct.sku!]: { variantId: VARIANT_GID, productId: PRODUCT_GID, inventoryItemId: INV_ITEM_GID, tracked: true },
      },
    });
    vi.stubGlobal("fetch", mockFetch);

    await runSync();

    const queries = queriesUsed(mockFetch);
    expect(queries.some((q) => q.includes("productVariantsBulkUpdate"))).toBe(true);
    expect(queries.some((q) => q.includes("inventorySetOnHandQuantities"))).toBe(true);
    expect(queries.some((q) => q.includes("productCreate"))).toBe(false);
  });

  it("calls productVariantsBulkUpdate but skips inventory when tracking is off and has_stock is false", async () => {
    // mockSimpleProductNoStock has has_stock: false so stock becomes null → no inventory update
    const mockFetch = buildFetch({
      products: [mockSimpleProductNoStock],
      variants: {
        [mockSimpleProductNoStock.sku!]: { variantId: VARIANT_GID, productId: PRODUCT_GID, inventoryItemId: INV_ITEM_GID, tracked: false },
      },
    });
    vi.stubGlobal("fetch", mockFetch);

    await runSync();

    const queries = queriesUsed(mockFetch);
    expect(queries.some((q) => q.includes("productVariantsBulkUpdate"))).toBe(true);
    expect(queries.some((q) => q.includes("inventorySetOnHandQuantities"))).toBe(false);
  });

  it("sends the correct price to productVariantsBulkUpdate", async () => {
    const mockFetch = buildFetch({
      products: [mockSimpleProduct],
      variants: {
        [mockSimpleProduct.sku!]: { variantId: VARIANT_GID, productId: PRODUCT_GID, inventoryItemId: INV_ITEM_GID, tracked: false },
      },
    });
    vi.stubGlobal("fetch", mockFetch);

    await runSync();

    const updateCall = mockFetch.mock.calls.find((c: any[]) => {
      try { return JSON.parse(c[1]?.body ?? "{}").query?.includes("productVariantsBulkUpdate"); } catch { return false; }
    });
    expect(updateCall).toBeDefined();
    const vars = JSON.parse(updateCall![1].body).variables;
    // price "19,99" → parseHoldedPrice → 19.99 → toFixed(2) = "19.99"
    expect(vars.variants[0].price).toBe("19.99");
    expect(vars.variants[0].id).toBe(VARIANT_GID);
  });
});

describe("runHoldedSync — simple product is new (not in Shopify)", () => {
  it("calls productCreate and marks job COMPLETED", async () => {
    const mockFetch = buildFetch({
      products:     [mockSimpleProduct],
      variants:     {}, // SKU not found
      newProductId: PRODUCT_GID,
    });
    vi.stubGlobal("fetch", mockFetch);

    await runSync();

    const queries = queriesUsed(mockFetch);
    expect(queries.some((q) => q.includes("productCreate"))).toBe(true);

    const updateCalls = (prismaMock.holdedSyncJob.update as ReturnType<typeof vi.fn>).mock.calls;
    const completedCall = updateCalls.find((c: any[]) => c[0].data?.status === "COMPLETED");
    expect(completedCall).toBeDefined();
    expect(completedCall![0].data.syncedProducts).toBe(1);
    expect(completedCall![0].data.errorCount).toBe(0);
  });
});

describe("runHoldedSync — simple product without SKU", () => {
  it("skips the product — no variant lookup or mutations", async () => {
    const mockFetch = buildFetch({ products: [mockSimpleProductNoSku] });
    vi.stubGlobal("fetch", mockFetch);

    await runSync();

    const queries = queriesUsed(mockFetch);
    expect(queries.some((q) => q.includes("productVariants(first"))).toBe(false);
    expect(queries.some((q) => q.includes("productCreate"))).toBe(false);
  });
});

describe("runHoldedSync — error handling", () => {
  it("marks job FAILED when Holded API is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    await runSync();

    const updateCalls = (prismaMock.holdedSyncJob.update as ReturnType<typeof vi.fn>).mock.calls;
    const failedCall = updateCalls.find((c: any[]) => c[0].data?.status === "FAILED");
    expect(failedCall).toBeDefined();
  });

  it("job COMPLETED (not FAILED) when a single product causes a Shopify userError", async () => {
    const mockFetch = buildFetch({
      products: [mockSimpleProduct],
      variants: {
        [mockSimpleProduct.sku!]: { variantId: VARIANT_GID, productId: PRODUCT_GID, inventoryItemId: INV_ITEM_GID, tracked: false },
      },
      failOn: "productVariantsBulkUpdate",
    });
    vi.stubGlobal("fetch", mockFetch);

    await runSync();

    const updateCalls = (prismaMock.holdedSyncJob.update as ReturnType<typeof vi.fn>).mock.calls;
    const completedCall = updateCalls.find((c: any[]) => c[0].data?.status === "COMPLETED");
    expect(completedCall).toBeDefined();
    expect(completedCall![0].data.errorCount).toBe(1);
  });

  it("continues syncing remaining products after one product fails", async () => {
    // Product 1: exists → will fail on update | Product 2: missing → will create
    const mockFetch = buildFetch({
      products: [mockSimpleProduct, mockSimpleProductNoStock],
      variants: {
        // mockSimpleProduct exists → will fail on update
        [mockSimpleProduct.sku!]: { variantId: VARIANT_GID, productId: PRODUCT_GID, inventoryItemId: INV_ITEM_GID, tracked: false },
        // mockSimpleProductNoStock is missing → will create
      },
      failOn: "productVariantsBulkUpdate",
    });
    vi.stubGlobal("fetch", mockFetch);

    await runSync();

    const queries = queriesUsed(mockFetch);
    // Second product should have been looked up and then created
    expect(queries.some((q) => q.includes("productCreate"))).toBe(true);

    const updateCalls = (prismaMock.holdedSyncJob.update as ReturnType<typeof vi.fn>).mock.calls;
    const completedCall = updateCalls.find((c: any[]) => c[0].data?.status === "COMPLETED");
    expect(completedCall).toBeDefined();
    expect(completedCall![0].data.errorCount).toBe(1);
    expect(completedCall![0].data.syncedProducts).toBe(1);
  });
});
