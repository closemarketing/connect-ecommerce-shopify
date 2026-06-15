import { describe, it, expect, beforeAll, vi } from "vitest";
import { HoldedService } from "../../app/services/erp/holded/holded.service";
import {
  mockSimpleProduct,
  mockSimpleProductNoSku,
  makeHoldedPage,
} from "../fixtures/holded-products.mock";

/**
 * Tests unitarios con fetch mockeado — no requieren conexión real.
 * Para integration tests reales, configura HOLDED_API_KEY en el entorno.
 */

// ── Tests unitarios con mock de fetch ─────────────────────────────────────────

describe("HoldedService — unit (fetch mockeado)", () => {
  it("listProducts() devuelve items y has_more correctamente", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeHoldedPage([mockSimpleProduct])));

    const service = new HoldedService("test-api-key");
    const page    = await service.listProducts(100);

    expect(page.items).toHaveLength(1);
    expect(page.has_more).toBe(false);
    expect(page.items[0].name).toBe(mockSimpleProduct.name);
    expect(page.items[0].sku).toBe(mockSimpleProduct.sku);
    expect(page.items[0].price).toBe(mockSimpleProduct.price);

    vi.unstubAllGlobals();
  });

  it("listProducts() devuelve array vacío si la API devuelve items: []", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeHoldedPage([])));

    const service = new HoldedService("test-api-key");
    const page    = await service.listProducts(100);
    expect(page.items).toHaveLength(0);

    vi.unstubAllGlobals();
  });

  it("listProducts() lanza error si la API devuelve 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "Unauthorized" }),
    );

    const service = new HoldedService("bad-key");
    await expect(service.listProducts(100)).rejects.toThrow(/401/);

    vi.unstubAllGlobals();
  });

  it("validateKey() devuelve { ok: true } con API key válida", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeHoldedPage([])));

    const result = await new HoldedService("valid-key").validateKey();
    expect(result.ok).toBe(true);
    expect(result.message).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it("validateKey() devuelve { ok: false } con API key inválida", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "Unauthorized" }),
    );

    const result = await new HoldedService("bad-key").validateKey();
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);

    vi.unstubAllGlobals();
  });
});

// ── Tests de fixtures ─────────────────────────────────────────────────────────

describe("Fixtures de Holded — validación de datos", () => {
  it("mockSimpleProduct tiene los campos requeridos", () => {
    expect(mockSimpleProduct.id).toBeTruthy();
    expect(mockSimpleProduct.name).toBeTruthy();
    expect(mockSimpleProduct.sku).toBeTruthy();
    // API v2: price is a string with comma decimal
    expect(typeof mockSimpleProduct.price).toBe("string");
    expect(mockSimpleProduct.price).toMatch(/\d+,\d{2}/);
    expect(mockSimpleProduct.kind).toBe("simple");
  });

  it("mockSimpleProductNoSku no tiene SKU (será skipped en sync)", () => {
    expect(mockSimpleProductNoSku.sku).toBeUndefined();
  });
});

// ── Test de integración real (opcional, requiere env vars) ────────────────────

const HOLDED_API_KEY = process.env.HOLDED_API_KEY;
const runRealTests   = !!HOLDED_API_KEY;

describe.skipIf(!runRealTests)(
  "HoldedService — integración real (requiere HOLDED_API_KEY)",
  () => {
    let service: HoldedService;

    beforeAll(() => {
      service = new HoldedService(HOLDED_API_KEY!);
    });

    it("validateKey() conecta correctamente con Holded", async () => {
      const result = await service.validateKey();
      expect(result.ok).toBe(true);
    });

    it("listProducts() devuelve al menos una página", async () => {
      const page = await service.listProducts(10);
      expect(Array.isArray(page.items)).toBe(true);
      console.log(`✅ Holded devolvió ${page.items.length} productos (primera página)`);
    });
  },
);
