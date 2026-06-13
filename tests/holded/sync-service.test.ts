import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runHoldedSync, type SyncParams } from "../../app/services/holded/sync-products-from-holded.server";
import prismaMock from "../../app/db.server";
import {
  mockSimpleProduct,
  mockSimpleProductNoSku,
  mockSimpleProductNoStock,
  mockVariableProduct,
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
  failOn?:        string; // GraphQL mutation name that should return userErrors
}) {
  const { products = [], variants = {}, newProductId = PRODUCT_GID, failOn } = opts;

  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    // Holded API ──────────────────────────────────────────────────────────────
    if ((url as string).includes("holded.com")) {
      return { ok: true, status: 200, json: async () => products };
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

    // Shopify: update variant price ────────────────────────────────────────────
    if (query.includes("productVariantUpdate")) {
      if (failOn === "productVariantUpdate") {
        return {
          ok: true, status: 200,
          json: async () => ({ data: { productVariantUpdate: { productVariant: null, userErrors: [{ field: "price", message: "Invalid price" }] } } }),
        };
      }
      return {
        ok: true, status: 200,
        json: async () => ({ data: { productVariantUpdate: { productVariant: { id: VARIANT_GID, price: "19.99" }, userErrors: [] } } }),
      };
    }

    // Shopify: update inventory ───────────────────────────────────────────────
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
        json: async () => ({ data: { productCreate: { product: { id: newProductId }, userErrors: [] } } }),
      };
    }

    throw new Error(`Unmocked fetch: ${url}`);
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
  it("calls productVariantUpdate and inventorySetOnHandQuantities when tracking is on", async () => {
    const mockFetch = buildFetch({
      products: [mockSimpleProduct],
      variants: {
        [mockSimpleProduct.sku!]: { variantId: VARIANT_GID, productId: PRODUCT_GID, inventoryItemId: INV_ITEM_GID, tracked: true },
      },
    });
    vi.stubGlobal("fetch", mockFetch);

    await runSync();

    const queries = queriesUsed(mockFetch);
    expect(queries.some((q) => q.includes("productVariantUpdate"))).toBe(true);
    expect(queries.some((q) => q.includes("inventorySetOnHandQuantities"))).toBe(true);
    expect(queries.some((q) => q.includes("productCreate"))).toBe(false);
  });

  it("calls productVariantUpdate but skips inventory when tracking is off", async () => {
    const mockFetch = buildFetch({
      products: [mockSimpleProduct],
      variants: {
        [mockSimpleProduct.sku!]: { variantId: VARIANT_GID, productId: PRODUCT_GID, inventoryItemId: INV_ITEM_GID, tracked: false },
      },
    });
    vi.stubGlobal("fetch", mockFetch);

    await runSync();

    const queries = queriesUsed(mockFetch);
    expect(queries.some((q) => q.includes("productVariantUpdate"))).toBe(true);
    expect(queries.some((q) => q.includes("inventorySetOnHandQuantities"))).toBe(false);
  });

  it("sends the correct price to productVariantUpdate", async () => {
    const mockFetch = buildFetch({
      products: [mockSimpleProduct],
      variants: {
        [mockSimpleProduct.sku!]: { variantId: VARIANT_GID, productId: PRODUCT_GID, inventoryItemId: INV_ITEM_GID, tracked: false },
      },
    });
    vi.stubGlobal("fetch", mockFetch);

    await runSync();

    const updateCall = mockFetch.mock.calls.find((c: any[]) => {
      try { return JSON.parse(c[1]?.body ?? "{}").query?.includes("productVariantUpdate"); } catch { return false; }
    });
    const vars = JSON.parse(updateCall![1].body).variables;
    expect(vars.input.id).toBe(VARIANT_GID);
    expect(vars.input.price).toBe(mockSimpleProduct.price.toFixed(2));
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

describe("runHoldedSync — variable product", () => {
  it("calls productCreate once when all variants are new", async () => {
    const mockFetch = buildFetch({
      products: [mockVariableProduct],
      variants:  {}, // all SKUs missing
    });
    vi.stubGlobal("fetch", mockFetch);

    await runSync();

    const queries = queriesUsed(mockFetch);
    const createCalls = queries.filter((q) => q.includes("productCreate"));
    expect(createCalls).toHaveLength(1);
  });

  it("calls productVariantUpdate for each variant when all exist", async () => {
    const variantMap: VariantMap = {};
    mockVariableProduct.variants!.forEach((v, i) => {
      variantMap[v.sku] = {
        variantId:       `gid://shopify/ProductVariant/${i + 1}`,
        productId:       PRODUCT_GID,
        inventoryItemId: `gid://shopify/InventoryItem/${i + 1}`,
        tracked:         true,
      };
    });

    const mockFetch = buildFetch({ products: [mockVariableProduct], variants: variantMap });
    vi.stubGlobal("fetch", mockFetch);

    await runSync();

    const queries = queriesUsed(mockFetch);
    const updateCalls = queries.filter((q) => q.includes("productVariantUpdate"));
    expect(updateCalls).toHaveLength(mockVariableProduct.variants!.length);
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
      failOn: "productVariantUpdate",
    });
    vi.stubGlobal("fetch", mockFetch);

    await runSync();

    const updateCalls = (prismaMock.holdedSyncJob.update as ReturnType<typeof vi.fn>).mock.calls;
    const completedCall = updateCalls.find((c: any[]) => c[0].data?.status === "COMPLETED");
    expect(completedCall).toBeDefined();
    expect(completedCall![0].data.errorCount).toBe(1);
  });

  it("continues syncing remaining products after one product fails", async () => {
    // Product 1: will fail (variant update error) | Product 2: will succeed (new → create)
    const mockFetch = buildFetch({
      products: [mockSimpleProduct, mockSimpleProductNoStock],
      variants: {
        // mockSimpleProduct exists → will fail on update
        [mockSimpleProduct.sku!]:       { variantId: VARIANT_GID, productId: PRODUCT_GID, inventoryItemId: INV_ITEM_GID, tracked: false },
        // mockSimpleProductNoStock is missing → will create
      },
      failOn: "productVariantUpdate",
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
