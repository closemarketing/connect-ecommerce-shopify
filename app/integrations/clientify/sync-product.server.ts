import { ClientifyService, type ClientifyProduct } from "./clientify-api.server";
import logger from "../../utils/logger.server";

/**
 * Mapea un line_item de Shopify a un producto de Clientify
 */
function mapShopifyLineItemToClientifyProduct(lineItem: any, ownerId: number): ClientifyProduct {
  // Solo incluir custom_fields con valores no vacíos
  const customFields = [];
  if (lineItem.product_id) {
    customFields.push({ field: "shopify_product_id", value: lineItem.product_id.toString() });
  }
  if (lineItem.variant_id) {
    customFields.push({ field: "shopify_variant_id", value: lineItem.variant_id.toString() });
  }
  if (lineItem.sku) {
    customFields.push({ field: "shopify_sku", value: lineItem.sku });
  }

  return {
    sku: lineItem.sku || lineItem.variant_id?.toString() || "",
    name: lineItem.title || lineItem.name || "",
    description: lineItem.variant_title || lineItem.name || "",
    price: parseFloat(lineItem.price) || 0,
    owner: ownerId,
    custom_fields: customFields.length > 0 ? customFields : undefined,
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
  logger.debug("PRODUCT DATA:", productData);
  logger.info(`📤 Sincronizando producto: ${productData.name} (SKU: ${productData.sku})`);
  
  // Sincronizar producto (busca por variant_id/sku y crea o actualiza)
  const productId = await clientifyService.syncProduct(productData);
  logger.info(`✅ Producto sincronizado con ID: ${productId}`);
  
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
  logger.info(`📦 Sincronizando ${lineItems.length} productos...`);
  
  const syncedProducts: Array<ClientifyProduct & { id: number }> = [];
  
  for (const lineItem of lineItems) {
    const product = await syncShopifyLineItemToClientifyProduct(lineItem, apiToken, ownerId);
    syncedProducts.push(product);
  }
  
  logger.info(`✅ Total de productos sincronizados: ${syncedProducts.length}`);
  logger.debug(`📋 IDs de productos: ${syncedProducts.map(p => p.id).join(', ')}`);
  
  return syncedProducts;
}

export { mapShopifyLineItemToClientifyProduct };
