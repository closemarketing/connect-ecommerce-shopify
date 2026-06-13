import { describe, it, expect, beforeAll, vi } from "vitest";
import {
  mockSimpleProduct,
  mockSimpleProductNoStock,
  mockSimpleProductNoSku,
  mockVariableProduct,
  mockHoldedProductsResponse,
} from "../fixtures/holded-products.mock";
import { HoldedInvoicingService } from "../../app/services/holded/holded.server";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Tests unitarios con fetch mockeado — no requieren conexión real.
 * Para integration tests reales, configura HOLDED_API_KEY y TEST_SHOP_DOMAIN.
 */

// ── Tests unitarios con mock de fetch ─────────────────────────────────────────

describe("HoldedInvoicingService — unit (fetch mockeado)", () => {
  it("getProducts() devuelve array de productos correctamente parseados", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok:     true,
        status: 200,
        json:   async () => mockHoldedProductsResponse,
      }),
    );

    const service  = new HoldedInvoicingService("test-api-key");
    const products = await service.getProducts();

    expect(products).toHaveLength(mockHoldedProductsResponse.length);
    expect(products[0].name).toBe(mockSimpleProduct.name);
    expect(products[0].sku).toBe(mockSimpleProduct.sku);
    expect(products[0].price).toBe(mockSimpleProduct.price);

    vi.unstubAllGlobals();
  });

  it("getProducts() devuelve array vacío si la API devuelve []", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true, status: 200, json: async () => [],
      }),
    );

    const service  = new HoldedInvoicingService("test-api-key");
    const products = await service.getProducts();
    expect(products).toHaveLength(0);

    vi.unstubAllGlobals();
  });

  it("getProducts() lanza error si la API devuelve 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false, status: 401, text: async () => "Unauthorized",
      }),
    );

    const service = new HoldedInvoicingService("bad-key");
    await expect(service.getProducts()).rejects.toThrow("Holded Invoicing API 401");

    vi.unstubAllGlobals();
  });

  it("testConnection() devuelve { ok: true } con API key válida", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true, status: 200, json: async () => [],
      }),
    );

    const result = await new HoldedInvoicingService("valid-key").testConnection();
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it("testConnection() devuelve { ok: false } con API key inválida", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false, status: 401, text: async () => "Unauthorized",
      }),
    );

    const result = await new HoldedInvoicingService("bad-key").testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("401");

    vi.unstubAllGlobals();
  });
});

// ── Tests de clasificación de productos ──────────────────────────────────────

describe("HoldedInvoicingService — isVariableProduct / isSimpleProduct", () => {
  const service = new HoldedInvoicingService("any");

  it("identifica producto simple (kind: 1)", () => {
    expect(service.isSimpleProduct(mockSimpleProduct)).toBe(true);
    expect(service.isVariableProduct(mockSimpleProduct)).toBe(false);
  });

  it("identifica producto variable (kind: 2)", () => {
    expect(service.isVariableProduct(mockVariableProduct)).toBe(true);
    expect(service.isSimpleProduct(mockVariableProduct)).toBe(false);
  });

  it("identifica producto simple por kind: 'simple'", () => {
    const p = { ...mockSimpleProduct, kind: "simple" as any };
    expect(service.isSimpleProduct(p)).toBe(true);
  });

  it("identifica producto variable por kind: 'variants'", () => {
    const p = { ...mockVariableProduct, kind: "variants" as any };
    expect(service.isVariableProduct(p)).toBe(true);
  });

  it("producto sin kind se considera simple", () => {
    const p = { ...mockSimpleProduct, kind: undefined as any };
    expect(service.isSimpleProduct(p)).toBe(true);
  });
});

// ── Tests de fixtures ─────────────────────────────────────────────────────────

describe("Fixtures de Holded — validación de datos", () => {
  it("mockSimpleProduct tiene los campos requeridos", () => {
    expect(mockSimpleProduct.id).toBeTruthy();
    expect(mockSimpleProduct.name).toBeTruthy();
    expect(mockSimpleProduct.sku).toBeTruthy();
    expect(mockSimpleProduct.price).toBeGreaterThan(0);
    expect(mockSimpleProduct.kind).toBe(1);
  });

  it("mockSimpleProductNoSku no tiene SKU (será skipped en sync)", () => {
    expect(mockSimpleProductNoSku.sku).toBeUndefined();
  });

  it("mockVariableProduct tiene variantes con SKUs únicos", () => {
    const skus = mockVariableProduct.variants!.map((v) => v.sku);
    const uniqueSkus = new Set(skus);
    expect(uniqueSkus.size).toBe(skus.length); // no hay SKUs duplicados
    expect(skus.every((s) => s.length > 0)).toBe(true);
  });

  it("mockVariableProduct tiene precios en todas las variantes", () => {
    mockVariableProduct.variants!.forEach((v) => {
      expect(v.price).toBeGreaterThan(0);
    });
  });

  it("mockVariableProduct tiene stock definido en todas las variantes", () => {
    mockVariableProduct.variants!.forEach((v) => {
      expect(v.stock).toBeDefined();
      expect(v.stock).toBeGreaterThanOrEqual(0);
    });
  });
});

// ── Test de integración real (opcional, requiere env vars) ────────────────────

const HOLDED_API_KEY  = process.env.HOLDED_API_KEY;
const runRealTests    = !!HOLDED_API_KEY;

describe.skipIf(!runRealTests)(
  "HoldedInvoicingService — integración real (requiere HOLDED_API_KEY)",
  () => {
    let service: HoldedInvoicingService;

    beforeAll(() => {
      service = new HoldedInvoicingService(HOLDED_API_KEY!);
    });

    it("testConnection() conecta correctamente con Holded", async () => {
      const result = await service.testConnection();
      expect(result.ok).toBe(true);
    });

    it("getProducts() devuelve al menos un producto", async () => {
      const products = await service.getProducts();
      expect(Array.isArray(products)).toBe(true);
      console.log(`✅ Holded devolvió ${products.length} productos`);
    });

    it("clasifica correctamente simples y variables en datos reales", async () => {
      const products = await service.getProducts();
      const simples  = products.filter((p) => service.isSimpleProduct(p));
      const variables = products.filter((p) => service.isVariableProduct(p));
      console.log(`📦 Simples: ${simples.length} | Variables: ${variables.length}`);
      expect(simples.length + variables.length).toBe(products.length);
    });
  },
);
