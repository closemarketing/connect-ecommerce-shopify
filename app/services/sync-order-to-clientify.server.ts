import { ClientifyService } from "./clientify.server";
import {
  mapShopifyOrderToClientifyContact,
  mapShopifyLineItemToClientifyProduct,
  mapShopifyOrderToClientifyDeal,
  mapLineItemsToClientifyDealItems,
} from "./clientify-mapper.server";

interface SyncResult {
  success: boolean;
  contactId?: number;
  productIds?: number[];
  dealId?: number;
  error?: string;
}

/**
 * Sincroniza un pedido de Shopify completo con Clientify
 * 1. Sincroniza el contacto (busca o crea)
 * 2. Sincroniza los productos (busca o crea cada uno)
 * 3. Crea la oportunidad ganada con los productos asociados
 */
export async function syncShopifyOrderToClientify(
  orderData: any,
  clientifyApiToken: string
): Promise<SyncResult> {
  try {
    const clientify = new ClientifyService({ apiToken: clientifyApiToken });
    
    console.log(`🔄 Iniciando sincronización del pedido #${orderData.order_number} con Clientify...`);

    // Parsear el JSON si viene como string
    const order = typeof orderData === "string" ? JSON.parse(orderData) : orderData;

    // PASO 1: Sincronizar contacto
    console.log(`👤 Paso 1/3: Sincronizando contacto...`);
    const contactData = mapShopifyOrderToClientifyContact(order);
    const contactId = await clientify.syncContact(contactData);
    console.log(`✅ Contacto sincronizado con ID: ${contactId}`);

    // PASO 2: Sincronizar productos
    console.log(`📦 Paso 2/3: Sincronizando ${order.line_items?.length || 0} productos...`);
    const productIds: number[] = [];
    
    if (order.line_items && Array.isArray(order.line_items)) {
      for (const lineItem of order.line_items) {
        const productData = mapShopifyLineItemToClientifyProduct(lineItem);
        const productId = await clientify.syncProduct(productData);
        productIds.push(productId);
      }
    }
    console.log(`✅ Productos sincronizados: ${productIds.join(", ")}`);

    // PASO 3: Sincronizar oportunidad (buscar o crear)
    console.log(`💰 Paso 3/3: Sincronizando oportunidad...`);
    const dealItems = mapLineItemsToClientifyDealItems(order.line_items || [], productIds);
    const dealData = mapShopifyOrderToClientifyDeal(order, contactId, dealItems);
    const dealId = await clientify.syncDeal(dealData);
    console.log(`✅ Oportunidad sincronizada con ID: ${dealId}`);

    console.log(`🎉 Sincronización completada exitosamente para pedido #${order.order_number}`);

    return {
      success: true,
      contactId,
      productIds,
      dealId,
    };
  } catch (error) {
    console.error("❌ Error en sincronización con Clientify:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}
