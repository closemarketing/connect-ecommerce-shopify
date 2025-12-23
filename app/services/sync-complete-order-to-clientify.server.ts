import { ClientifyService } from "./clientify.server";
import { syncShopifyCustomerToClientifyContact } from "./sync-customer-to-clientify.server";
import { syncShopifyLineItemsToClientifyProducts } from "./sync-products-to-clientify.server";
import { mapShopifyOrderToClientifyDeal } from "./clientify-mapper.server";

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
    console.log(`🔄 Iniciando sincronización completa del pedido #${order.order_number}...`);
    
    const clientifyService = new ClientifyService({ apiToken });
    
    // Obtener owner ID de la cuenta
    const accountInfo = await clientifyService.getAccountInfo();
    const ownerId = accountInfo.user_id;
    console.log(`👤 Owner ID: ${ownerId}`);

    // PASO 1: Sincronizar customer (contacto)
    console.log(`\n👤 Paso 1/3: Sincronizando customer...`);
    const { customer } = order;
    const contact = await syncShopifyCustomerToClientifyContact(customer, apiToken);
    console.log(`✅ Customer sincronizado - Contact ID: ${contact.id}`);

    // PASO 2: Sincronizar productos (line_items)
    console.log(`\n📦 Paso 2/3: Sincronizando ${order.line_items?.length || 0} productos...`);
    const syncedProducts = await syncShopifyLineItemsToClientifyProducts(
      order.line_items || [],
      apiToken,
      ownerId
    );
    const productIds = syncedProducts.map(p => p.id);
    console.log(`✅ Productos sincronizados - IDs: ${productIds.join(', ')}`);

    // PASO 3: Sincronizar deal (oportunidad)
    console.log(`\n💰 Paso 3/3: Sincronizando deal...`);
    
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
    console.log(`✅ Deal sincronizado - ID: ${dealId}`);

    console.log(`\n🎉 Sincronización completa exitosa para pedido #${order.order_number}`);

    return {
      success: true,
      contactId: contact.id,
      productIds,
      dealId,
    };
  } catch (error) {
    console.error("❌ Error en sincronización completa:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}
