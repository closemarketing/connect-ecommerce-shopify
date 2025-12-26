import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { validateWebhookHmac } from "../utils/webhook-validator.server";
import { syncShopifyOrderToClientify } from "../integrations/clientify/sync-order.server";
import { logOrderSync, logSyncError } from "../services/logging/sync-logger.server";
import { createWebhookLog, markWebhookAsProcessed, markWebhookAsError } from "../services/logging/webhook-logger.server";
import logger from "../utils/logger.server";
import { validateShopIsActive } from "../utils/shop-validator.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  logger.info("🚀 WEBHOOK CREATE - Route hit!", { timestamp: new Date().toISOString() });
  
  let webhookLogIds: number[] = [];
  let shopRecord: any = null;
  let rawBody = "";
  let payload: any = null;
  
  try {
    // Obtener el body del webhook
    rawBody = await request.text();
    
    // Obtener datos del webhook
    const shop = request.headers.get("x-shopify-shop-domain") || "unknown";
    const topic = request.headers.get("x-shopify-topic") || "orders/create";
    const hmac = request.headers.get("x-shopify-hmac-sha256");
    
    payload = JSON.parse(rawBody);
    
    logger.info(`✅ Received ${topic} webhook for ${shop}`);
    logger.info(`Order #${payload.order_number} - ID: ${payload.id}`);

    // Validar que la tienda esté activa
    const validation = await validateShopIsActive(shop, topic, payload.id?.toString(), rawBody, {
      "x-shopify-topic": topic,
      "x-shopify-shop-domain": shop,
      "x-shopify-hmac-sha256": hmac,
    });
    
    if (!validation) {
      // Tienda inactiva, ya se registró en webhook log
      return new Response(null, { status: 200 });
    }

    shopRecord = validation.shop;
    webhookLogIds = validation.webhookLogIds;

    // Guardar o actualizar pedido en BD
    await db.order.upsert({
      where: {
        orderId: payload.id.toString()
      },
      update: {
        orderNumber: payload.order_number.toString(),
        body: rawBody,
        updatedAt: new Date()
      },
      create: {
        orderId: payload.id.toString(),
        orderNumber: payload.order_number.toString(),
        shopId: shopRecord.id,
        body: rawBody
      }
    });
    logger.info(`✅ Order ${payload.order_number} saved to database`);

    // Obtener credenciales de Clientify para esta tienda
    const integration = await db.integration.findUnique({
      where: { name: "clientify" }
    });

    if (!integration) {
      logger.warn(`⚠️ Integración Clientify no encontrada. Pedido guardado pero no sincronizado.`);
      for (const logId of webhookLogIds) {
        await markWebhookAsProcessed(logId);
      }
      return new Response(null, { status: 200 });
    }

    const apiTokenCredential = await db.integrationCredential.findFirst({
      where: {
        sessionId: shop,
        integrationId: integration.id,
        key: "apiToken"
      }
    });

    if (apiTokenCredential) {
      logger.info(`🔄 Iniciando sincronización con Clientify...`);
      
      // Sincronizar con Clientify
      const syncResult = await syncShopifyOrderToClientify(
        payload,
        apiTokenCredential.value,
        shopRecord.id,
        integration.id
      );

      if (syncResult.success) {
        logger.info(`✅ Pedido sincronizado con Clientify exitosamente`);
        logger.info(`   - Contacto ID: ${syncResult.contactId}`);
        logger.info(`   - Productos IDs: ${syncResult.productIds?.join(", ")}`);
        logger.info(`   - Oportunidad ID: ${syncResult.dealId}`);

        // Registrar sincronización exitosa
        await logOrderSync(
          shopRecord.id,
          payload.id.toString(),
          syncResult.dealId!,
          { orderNumber: payload.order_number, productCount: syncResult.productIds?.length },
          syncResult,
          undefined, // method
          undefined, // url
          undefined, // queryParams
          integration.id
        );

        // Marcar webhooks como procesados
        for (const logId of webhookLogIds) {
          await markWebhookAsProcessed(logId);
        }
      } else {
        logger.error(`❌ Error sincronizando con Clientify: ${syncResult.error}`);
        
        // Registrar error de sincronización
        await logSyncError(
          shopRecord.id,
          "ORDER",
          payload.id.toString(),
          syncResult.error || "Error desconocido",
          { orderNumber: payload.order_number },
          undefined, // method
          undefined, // url
          undefined, // queryParams
          integration.id
        );

        // Marcar webhooks con error
        for (const logId of webhookLogIds) {
          await markWebhookAsError(logId, syncResult.error || "Error desconocido");
        }
      }
    } else {
      logger.warn(`⚠️ No se encontraron credenciales de Clientify para ${shop}. Pedido guardado pero no sincronizado.`);
      
      // Marcar webhooks como procesados (aunque no se sincronizaron)
      for (const logId of webhookLogIds) {
        await markWebhookAsProcessed(logId);
      }
    }
    
    return new Response(null, { status: 200 });
  } catch (error) {
    logger.error("❌ ERROR in webhook CREATE:", error);
    logger.error("Error details:", error instanceof Error ? error.message : error);
    
    // Si tenemos webhookLogIds, marcar todos con error
    for (const logId of webhookLogIds) {
      await markWebhookAsError(
        logId,
        error instanceof Error ? error.message : "Error desconocido"
      );
    }
    
    return new Response(null, { status: 500 });
  }
};
