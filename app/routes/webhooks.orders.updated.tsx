import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { validateWebhookHmac } from "../utils/webhook-validator.server";
import { createJob } from "../services/job.server";
import logger from "../utils/logger.server";
import { createWebhookLog, markWebhookAsProcessed, markWebhookAsError } from "../services/logging/webhook-logger.server";
import { validateShopIsActive } from "../utils/shop-validator.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  logger.info("🚀 WEBHOOK UPDATED - Route hit!", new Date().toISOString());
  
  let webhookLogId: number | null = null;
  let shopRecord: any = null;
  let rawBody = "";
  let payload: any = null;
  
  try {
    // Obtener el body del webhook
    rawBody = await request.text();
    logger.debug("📦 Body length:", rawBody.length);
    
    // Obtener datos del webhook
    const shop = request.headers.get("x-shopify-shop-domain") || "unknown";
    const topic = request.headers.get("x-shopify-topic") || "orders/updated";
    const hmac = request.headers.get("x-shopify-hmac-sha256");
    
    payload = JSON.parse(rawBody);
    
    logger.info(`🔄 Received ${topic} webhook for ${shop}`);
    logger.info(`Order #${payload.order_number} - ID: ${payload.id} updated`);

    // Validar que la tienda esté activa
    const validation = await validateShopIsActive(shop, topic, payload.id?.toString(), rawBody);
    
    if (!validation) {
      // Tienda inactiva, ya se registró en webhook log
      return new Response(null, { status: 200 });
    }

    shopRecord = validation.shop;
    webhookLogId = validation.webhookLogId;

    logger.info(`🔄 Received ${topic} webhook for ${shop}`);
    logger.info(`Order #${payload.order_number} - ID: ${payload.id} updated`);

    // Verificar si el pedido ya fue sincronizado exitosamente como DEAL
    const existingDealSync = await db.syncLog.findFirst({
      where: {
        shopId: shopRecord.id,
        syncType: "DEAL",
        shopifyId: payload.id.toString(),
        status: "SUCCESS",
        clientifyId: { not: null }
      }
    });

    // Si no hay sincronización previa exitosa, probablemente orders/create lo está procesando ahora
    if (!existingDealSync) {
      logger.info(`⏭️  Order ${payload.order_number} has no previous successful DEAL sync - skipping (likely being created by orders/create webhook)`);
      if (webhookLogId) {
        await markWebhookAsProcessed(webhookLogId);
      }
      return new Response(null, { status: 200 });
    }

    logger.info(`✓ Order ${payload.order_number} was previously synced as Deal #${existingDealSync.clientifyId} - proceeding with update`);

    // Guardar/actualizar orden en base de datos
    await db.order.upsert({
      where: { orderId: payload.id.toString() },
      update: {
        body: rawBody
      },
      create: {
        orderId: payload.id.toString(),
        orderNumber: payload.order_number.toString(),
        shopId: shopRecord.id,
        body: rawBody
      }
    });
    logger.info(`✅ Order ${payload.order_number} updated in database`);

    // Obtener credenciales de Clientify para esta tienda
    const clientifyCredentials = await db.integrationCredential.findFirst({
      where: {
        sessionId: shop,
        integration: {
          name: "clientify"
        },
        key: "apikey"
      }
    });

    if (!clientifyCredentials) {
      logger.warn(`⚠️ No Clientify credentials found for shop ${shop}`);
      if (webhookLogId) {
        await markWebhookAsError(webhookLogId, "No Clientify credentials configured");
      }
      return new Response(null, { status: 200 });
    }

    // Crear job en DB para sincronización
    logger.info(`📝 Creando job de actualización en la base de datos...`);
    const job = await createJob({
      shopId: shopRecord.id,
      queueName: 'order-sync',
      type: 'order.updated',
      payload: {
        shopifyOrderId: payload.id.toString(),
        shop: shop,
        orderData: payload
      },
      priority: 2  // Mayor prioridad que creaciones
    });

    logger.info(`✅ Job ${job.id} creado en DB para actualización con Clientify`);
    logger.info(`   El DB poller lo recogerá y procesará automáticamente`);

    // Marcar webhook como procesado
    if (webhookLogId) {
      await markWebhookAsProcessed(webhookLogId);
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    logger.error("❌ ERROR in webhook UPDATED:", error);
    logger.error("Error details:", error instanceof Error ? error.message : error);
    
    if (webhookLogId) {
      await markWebhookAsError(
        webhookLogId,
        error instanceof Error ? error.message : "Error desconocido"
      );
    }
    
    return new Response(null, { status: 500 });
  }
};
