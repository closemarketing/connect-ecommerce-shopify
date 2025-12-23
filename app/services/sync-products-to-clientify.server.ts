import { ClientifyService, type ClientifyProduct } from "./clientify.server";

/**
 * Mapea un line_item de Shopify a un producto de Clientify
 */
function mapShopifyLineItemToClientifyProduct(lineItem: any, ownerId: number): ClientifyProduct {
  return {
    sku: lineItem.sku || lineItem.variant_id?.toString() || "",
    name: lineItem.title || lineItem.name || "",
    description: lineItem.variant_title || lineItem.name || "",
    price: parseFloat(lineItem.price) || 0,
    owner: ownerId,
  };
}

/**
 * Sincroniza un line_item de Shopify con un producto de Clientify
 * 
 * @param lineItem - Line item de Shopify
 * @param apiToken - Token de API de Clientify
 * @param ownerId - ID del owner en Clientify (requerido)
 * @returns El producto sincronizado con su ID
 */
export async function syncShopifyLineItemToClientifyProduct(
  lineItem: any,
  apiToken: string,
  ownerId: number
): Promise<ClientifyProduct & { id: number }> {
  const clientifyService = new ClientifyService({ apiToken });
  
  // Mapear line_item de Shopify a producto de Clientify
  const productData = mapShopifyLineItemToClientifyProduct(lineItem, ownerId);
  console.log("PRODUCT DATA:", productData);
  console.log(`📤 Sincronizando producto: ${productData.name} (SKU: ${productData.sku})`);
  
  // Sincronizar producto (busca por variant_id/sku y crea o actualiza)
  const productId = await clientifyService.syncProduct(productData);
  console.log(`✅ Producto sincronizado con ID: ${productId}`);
  
  const result = {
    ...productData,
    id: productId,
  };
  
  return result;
}

/**
 * Sincroniza múltiples line_items de Shopify con productos de Clientify
 * 
 * @param lineItems - Array de line items de Shopify
 * @param apiToken - Token de API de Clientify
 * @param ownerId - ID del owner en Clientify (requerido)
 * @returns Array de productos sincronizados con sus IDs
 */
export async function syncShopifyLineItemsToClientifyProducts(
  lineItems: any[],
  apiToken: string,
  ownerId: number
): Promise<Array<ClientifyProduct & { id: number }>> {
  console.log(`📦 Sincronizando ${lineItems.length} productos...`);
  
  const syncedProducts: Array<ClientifyProduct & { id: number }> = [];
  
  for (const lineItem of lineItems) {
    const product = await syncShopifyLineItemToClientifyProduct(lineItem, apiToken, ownerId);
    syncedProducts.push(product);
  }
  
  console.log(`✅ Total de productos sincronizados: ${syncedProducts.length}`);
  console.log(`📋 IDs de productos: ${syncedProducts.map(p => p.id).join(', ')}`);
  
  return syncedProducts;
}

export { mapShopifyLineItemToClientifyProduct };
