import type { HoldedProduct } from "../../app/services/holded/holded.server";

// ── Productos simples ─────────────────────────────────────────────────────────

export const mockSimpleProduct: HoldedProduct = {
  id: "64a1b2c3d4e5f6789abc0001",
  name: "Camiseta Básica Blanca",
  desc: "<p>Camiseta de algodón 100% de alta calidad. Disponible en talla única.</p>",
  sku: "TSH-BAS-WHT",
  price: 19.99,
  kind: 1,
  stock: 50,
  weight: 0.2,
  images: ["https://cdn.holded.com/products/tsh-bas-wht.jpg"],
};

export const mockSimpleProductNoStock: HoldedProduct = {
  id: "64a1b2c3d4e5f6789abc0002",
  name: "Libro de Programación TypeScript",
  desc: "<p>Guía completa de TypeScript para desarrolladores modernos.</p>",
  sku: "BOOK-TS-001",
  price: 34.95,
  kind: 1,
  // stock omitido — inventario no gestionado
  images: [],
};

export const mockSimpleProductNoSku: HoldedProduct = {
  id: "64a1b2c3d4e5f6789abc0003",
  name: "Servicio de Consultoría (sin SKU)",
  desc: "Consultoría técnica por hora.",
  price: 150.0,
  kind: 1,
  // sku omitido — debe quedar como "skipped" en la sync
};

// ── Producto variable ─────────────────────────────────────────────────────────

export const mockVariableProduct: HoldedProduct = {
  id: "64a1b2c3d4e5f6789abc0010",
  name: "Polo Premium",
  desc: "<p>Polo de alta gama disponible en varios colores y tallas.</p>",
  price: 29.99,
  kind: 2,
  images: ["https://cdn.holded.com/products/polo-premium.jpg"],
  variantFields: [
    { id: "field_color", name: "Color",  values: ["Rojo", "Azul", "Verde"] },
    { id: "field_size",  name: "Talla",  values: ["S", "M", "L", "XL"]    },
  ],
  variants: [
    {
      id: "var_001",
      name: "Rojo - S",
      sku: "POLO-RED-S",
      price: 29.99,
      stock: 10,
      attributeId: [0, 0],
    },
    {
      id: "var_002",
      name: "Rojo - M",
      sku: "POLO-RED-M",
      price: 29.99,
      stock: 15,
      attributeId: [0, 1],
    },
    {
      id: "var_003",
      name: "Azul - M",
      sku: "POLO-BLU-M",
      price: 29.99,
      stock: 8,
      attributeId: [1, 1],
    },
    {
      id: "var_004",
      name: "Azul - L",
      sku: "POLO-BLU-L",
      price: 29.99,
      stock: 12,
      attributeId: [1, 2],
    },
    {
      id: "var_005",
      name: "Verde - XL",
      sku: "POLO-GRN-XL",
      price: 31.99, // precio diferente para esta variante
      stock: 5,
      attributeId: [2, 3],
    },
  ],
};

// Producto variable con precio distinto en alguna variante
export const mockVariableProductPriceVariation: HoldedProduct = {
  id: "64a1b2c3d4e5f6789abc0011",
  name: "Zapatillas Running",
  price: 89.99,
  kind: 2,
  variants: [
    { id: "zap_001", name: "Negro 38", sku: "SHOE-BLK-38", price: 89.99, stock: 3 },
    { id: "zap_002", name: "Negro 39", sku: "SHOE-BLK-39", price: 89.99, stock: 6 },
    { id: "zap_003", name: "Blanco 40", sku: "SHOE-WHT-40", price: 94.99, stock: 4 },
    { id: "zap_004", name: "Blanco 41", sku: "SHOE-WHT-41", price: 94.99, stock: 2 },
  ],
};

// Producto variable sin variantes (edge case)
export const mockVariableProductNoVariants: HoldedProduct = {
  id: "64a1b2c3d4e5f6789abc0012",
  name: "Pack Misterioso",
  price: 49.99,
  kind: 2,
  variants: [],
};

// ── Array completo que simula la respuesta de GET /products/ ─────────────────

export const mockHoldedProductsResponse: HoldedProduct[] = [
  mockSimpleProduct,
  mockSimpleProductNoStock,
  mockSimpleProductNoSku,
  mockVariableProduct,
  mockVariableProductPriceVariation,
  mockVariableProductNoVariants,
];

// ── Respuestas de error de la API ─────────────────────────────────────────────

export const mockHoldedUnauthorizedResponse = {
  status: 401,
  body: JSON.stringify({ error: "Unauthorized", message: "Invalid API key" }),
};

export const mockHoldedEmptyResponse: HoldedProduct[] = [];
