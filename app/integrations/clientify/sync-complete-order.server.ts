import { ClientifyService } from "./clientify-api.server";
import { syncShopifyCustomerToClientifyContact } from "./sync-customer.server";
import { syncShopifyLineItemsToClientifyProducts } from "./sync-product.server";
import { mapShopifyOrderToClientifyDeal } from "./clientify-mapper.server";
import logger from "../../utils/logger.server";

interface OrderSyncResult {
  success: boolean;
  contactId?: number;
  productIds?: number[];
  dealId?: number;
  error?: string;
}

/**
 * Sincroniza una order completa de Shopify con Clientify
 * 1. Sincroniza el customer (contacto)
 * 2. Sincroniza los productos (line_items)
 * 3. Sincroniza el deal (oportunidad) con los productos asociados
 * 
 * @param order - Order de Shopify
 * @param apiToken - Token de API de Clientify
 * @returns Resultado de la sincronización con IDs
 */
export async function syncCompleteShopifyOrderToClientify(
  order: any,
  apiToken: string
): Promise<OrderSyncResult> {
  try {
    logger.info(`🔄 Iniciando sincronización completa del pedido #${order.order_number}...`);
    
    const clientifyService = new ClientifyService({ apiToken });
    
    // Obtener owner ID de la cuenta
    const accountInfo = await clientifyService.getAccountInfo();
    const ownerId = accountInfo.user_id;
    logger.info(`👤 Owner ID: ${ownerId}`);

    // PASO 1: Sincronizar customer (contacto)
    logger.info(`\n👤 Paso 1/3: Sincronizando customer...`);
    const { customer } = order;
    const contact = await syncShopifyCustomerToClientifyContact(customer, apiToken);
    logger.info(`✅ Customer sincronizado - Contact ID: ${contact.id}`);

    // PASO 2: Sincronizar productos (line_items)
    logger.info(`\n📦 Paso 2/3: Sincronizando ${order.line_items?.length || 0} productos...`);
    const syncedProducts = await syncShopifyLineItemsToClientifyProducts(
      order.line_items || [],
      apiToken,
      ownerId
    );
    const productIds = syncedProducts.map(p => p.id);
    logger.info(`✅ Productos sincronizados - IDs: ${productIds.join(', ')}`);

    // PASO 3: Sincronizar deal (oportunidad)
    logger.info(`\n💰 Paso 3/3: Sincronizando deal...`);
    
    // Preparar items del deal con los IDs de productos de Clientify
    const dealItems = order.line_items.map((lineItem: any, index: number) => ({
      product_id: productIds[index],
      quantity: lineItem.quantity || 1,
      price: parseFloat(lineItem.price) || 0,
    }));

    // Mapear order a deal
    const dealData = mapShopifyOrderToClientifyDeal(order, contact.id, dealItems, ownerId);
    
    // Sincronizar deal
    const dealId = await clientifyService.syncDeal(dealData);
    logger.info(`✅ Deal sincronizado - ID: ${dealId}`);

    logger.info(`\n🎉 Sincronización completa exitosa para pedido #${order.order_number}`);

    return {
      success: true,
      contactId: contact.id,
      productIds,
      dealId,
    };
  } catch (error) {
    logger.error("❌ Error en sincronización completa:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}
