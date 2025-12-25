import { ClientifyService } from "./clientify.server";
import {
  mapShopifyOrderToClientifyContact,
  mapShopifyOrderToClientifyDeal,
  mapLineItemsToClientifyDealItems,
} from "./clientify-mapper.server";
import { syncShopifyLineItemsToClientifyProducts } from "./sync-products-to-clientify.server";
import { logCustomerSync, logProductSync, logDealSync, logSyncError } from "../logging/sync-logger.server";
import logger from "../../utils/logger.server";
import db from "../../db.server";

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
  clientifyApiToken: string,
  shopId?: number
): Promise<SyncResult> {
  try {
    const clientify = new ClientifyService({ apiToken: clientifyApiToken });
    
    logger.info(`🔄 Iniciando sincronización del pedido #${orderData.order_number} con Clientify...`);

    // Parsear el JSON si viene como string
    const order = typeof orderData === "string" ? JSON.parse(orderData) : orderData;

    // PASO 1: Sincronizar contacto
    logger.info(`👤 Paso 1/3: Sincronizando contacto...`);
    const contactData = mapShopifyOrderToClientifyContact(order);
    const contactId = await clientify.syncContact(contactData);
    logger.info(`✅ Contacto sincronizado con ID: ${contactId}`);

    // Registrar log de customer si tenemos shopId
    if (shopId && order.customer?.id) {
      await logCustomerSync(
        shopId,
        order.customer.id.toString(),
        contactId,
        contactData,
        { id: contactId, ...contactData }, // responseData con el ID devuelto
        order.id?.toString() // parentOrderId
      );
    }

    // PASO 1.5: Obtener información de la cuenta para el owner
    logger.info(`🔑 Paso 1.5/3: Obteniendo información de cuenta Clientify...`);
    const accountInfo = await clientify.getAccountInfo();
    const ownerId = accountInfo.user_id;
    logger.info(`✅ Owner ID: ${ownerId} (${accountInfo.name})`);

    // PASO 2: Sincronizar productos
    logger.info(`📦 Paso 2/3: Sincronizando ${order.line_items?.length || 0} productos...`);
    const syncedProducts = await syncShopifyLineItemsToClientifyProducts(
      order.line_items || [],
      clientifyApiToken,
      ownerId
    );
    const productIds = syncedProducts.map(p => p.id);
    logger.info(`✅ Productos sincronizados: ${productIds.join(", ")}`);

    // Registrar log de productos si tenemos shopId
    if (shopId) {
      for (let i = 0; i < order.line_items.length; i++) {
        const lineItem = order.line_items[i];
        const syncedProduct = syncedProducts[i];
        const productId = syncedProduct?.id;
        if (lineItem.variant_id && productId) {
          await logProductSync(
            shopId,
            lineItem.variant_id.toString(),
            productId,
            { sku: lineItem.sku, name: lineItem.title },
            syncedProduct, // responseData completo del producto
            order.id?.toString() // parentOrderId
          );
        }
      }
    }

    // PASO 3: Sincronizar oportunidad
    logger.info(`💰 Paso 3/3: Sincronizando oportunidad...`);
    const dealItems = mapLineItemsToClientifyDealItems(order.line_items || [], productIds);
    const dealData = mapShopifyOrderToClientifyDeal(order, contactId, dealItems, ownerId);
    
    // Obtener configuración de pipeline y stage
    if (shopId) {
      const pipelineConfig = await db.pipelineConfig.findFirst({
        where: {
          shopId,
          isDefault: true,
        },
        include: {
          stageMappings: true,
        },
      });

      if (pipelineConfig) {
        // Determinar el estado financiero de la orden
        const orderStatus = order.financial_status || 'pending';
        
        // Buscar el mapping correspondiente
        const stageMapping = pipelineConfig.stageMappings.find(
          m => m.shopifyOrderStatus === orderStatus
        );

        if (stageMapping) {
          // Agregar pipeline y stage al deal
          dealData.pipeline = `https://api.clientify.net/v1/deals/pipelines/${pipelineConfig.clientifyPipelineId}/`;
          dealData.pipeline_stage = `https://api.clientify.net/v1/deals/pipelines/stages/${stageMapping.clientifyStageId}/`;
          logger.info(`📍 Pipeline: ${pipelineConfig.clientifyPipelineName}, Stage: ${stageMapping.clientifyStageName} (${orderStatus})`);
        } else {
          logger.warn(`⚠️ No se encontró mapeo para el estado: ${orderStatus}`);
        }
      } else {
        logger.warn(`⚠️ No hay pipeline configurado como default para shopId: ${shopId}`);
      }
    }
    
    const dealId = await clientify.syncDeal(dealData);
    logger.info(`✅ Oportunidad sincronizada con ID: ${dealId}`);

    // Registrar log de deal si tenemos shopId
    if (shopId && order.id) {
      await logDealSync(
        shopId,
        order.id.toString(),
        dealId,
        dealData,
        { id: dealId, ...dealData }, // responseData con el ID devuelto
        order.id.toString() // parentOrderId
      );
    }

    logger.info(`🎉 Sincronización completada exitosamente para pedido #${order.order_number}`);

    return {
      success: true,
      contactId,
      productIds,
      dealId,
    };
  } catch (error) {
    logger.error("❌ Error en sincronización con Clientify:", error);
    
    // Registrar error si tenemos shopId
    if (shopId) {
      const order = typeof orderData === "string" ? JSON.parse(orderData) : orderData;
      await logSyncError(
        shopId,
        "ORDER",
        order.id?.toString() || "unknown",
        error instanceof Error ? error.message : "Error desconocido",
        { orderNumber: order.order_number }
      );
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}
