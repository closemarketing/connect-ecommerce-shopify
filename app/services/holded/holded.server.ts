import logger from "../../utils/logger.server";

const HOLDED_INVOICING_BASE_URL = "https://api.holded.com/api/invoicing/v1";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HoldedVariant {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock?: number;
  attributeId?: number[];
  images?: string[];
}

export interface HoldedProduct {
  id: string;
  name: string;
  desc?: string;
  sku?: string;
  price: number;
  tax?: string;
  type?: string;
  kind: number | string;
  variants?: HoldedVariant[];
  variantFields?: Array<{ id: string; name: string; values: string[] }>;
  images?: string[];
  stock?: number;
  weight?: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * HTTP client for the Holded Invoicing API v1.
 * Auth: key header (not Bearer).
 */
export class HoldedInvoicingService {
  constructor(private readonly apiKey: string) {}

  private async request<T = any>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url      = `${HOLDED_INVOICING_BASE_URL}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        key:            this.apiKey,
        "Content-Type": "application/json",
        Accept:         "application/json",
        ...(options.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Holded Invoicing API ${response.status}: ${body}`);
    }

    if (response.status === 204) return undefined as T;

    return response.json() as Promise<T>;
  }

  /** Returns all products from Holded (invoicing/v1). */
  async getProducts(): Promise<HoldedProduct[]> {
    logger.info("Holded: fetching all products from invoicing/v1/products/");
    const result = await this.request<HoldedProduct[]>("/products/");
    return Array.isArray(result) ? result : [];
  }

  /** Returns a single product by id. */
  async getProduct(id: string): Promise<HoldedProduct> {
    return this.request<HoldedProduct>(`/products/${id}`);
  }

  /** Tests the API key. Returns { ok: true } or { ok: false, error } */
  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const url      = `${HOLDED_INVOICING_BASE_URL}/products/`;
      const response = await fetch(url, {
        headers: {
          key:    this.apiKey,
          Accept: "application/json",
        },
      });
      if (response.ok) return { ok: true };
      const body = await response.text().catch(() => "");
      return { ok: false, error: `HTTP ${response.status}: ${body}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** kind === 2 or "variants" */
  isVariableProduct(product: HoldedProduct): boolean {
    return product.kind === 2 || product.kind === "variants";
  }

  /** kind === 1, "simple", or falsy */
  isSimpleProduct(product: HoldedProduct): boolean {
    return product.kind === 1 || product.kind === "simple" || !product.kind;
  }
}
