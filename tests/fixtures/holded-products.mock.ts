import type { HoldedProduct } from "../../app/services/erp/holded/holded.service";

// Simulates API v2 response shape: price as string with comma decimal, stock as string

export const mockSimpleProduct: HoldedProduct = {
  id:          "64a1b2c3d4e5f6789abc0001",
  name:        "Camiseta Básica Blanca",
  description: "Camiseta de algodón 100% de alta calidad.",
  sku:         "TSH-BAS-WHT",
  price:       "19,99",
  kind:        "simple",
  has_stock:   true,
  stock:       "50",
  archived:    false,
};

export const mockSimpleProductNoStock: HoldedProduct = {
  id:        "64a1b2c3d4e5f6789abc0002",
  name:      "Libro de Programación TypeScript",
  sku:       "BOOK-TS-001",
  price:     "34,95",
  kind:      "simple",
  has_stock: false,
  stock:     "0",
  archived:  false,
};

export const mockSimpleProductNoSku: HoldedProduct = {
  id:        "64a1b2c3d4e5f6789abc0003",
  name:      "Servicio de Consultoría",
  price:     "150,00",
  kind:      "simple",
  has_stock: false,
  archived:  false,
};

export const mockArchivedProduct: HoldedProduct = {
  id:       "64a1b2c3d4e5f6789abc0004",
  name:     "Producto Archivado",
  sku:      "ARCH-001",
  price:    "9,99",
  kind:     "simple",
  archived: true,
};

// Simulates the paginated listProducts response (single page, no more)
export function makeHoldedPage(items: HoldedProduct[]) {
  return { ok: true, status: 200, json: async () => ({ items, has_more: false, cursor: undefined }) };
}
