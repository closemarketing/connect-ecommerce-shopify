import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { validateWebhookHmac } from "../utils/webhook-validator.server";
import { createJob } from "../services/job.server";
import logger from "../utils/logger.server";
import { validateShopIsActive } from "../utils/shop-validator.server";
import { markWebhookAsProcessed } from "../services/logging/webhook-logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  logger.info("🚀 WEBHOOK CANCELLED - Route hit!", new Date().toISOString());
  
  let shopRecord: any = null;
  let webhookLogId: number | null = null;
  let rawBody = "";
  let payload: any = null;
  
  try {
    // Obtener el body del webhook
    rawBody = await request.text();
    logger.debug("📦 Body length:", rawBody.length);
    
    // Obtener datos del webhook
    const shop = request.headers.get("x-shopify-shop-domain") || "unknown";
    const topic = request.headers.get("x-shopify-topic") || "orders/cancelled";
    const hmac = request.headers.get("x-shopify-hmac-sha256");
    
    payload = JSON.parse(rawBody);
    
    logger.info(`❌ Received ${topic} webhook for ${shop}`);
    logger.info(`Order #${payload.order_number} - ID: ${payload.id} cancelled`);

    // Validar que la tienda esté activa
    const validation = await validateShopIsActive(shop, topic, payload.id?.toString(), rawBody);
    
    if (!validation) {
      // Tienda inactiva, ya se registró en webhook log
      return new Response(null, { status: 200 });
    }

    shopRecord = validation.shop;
    webhookLogId = validation.webhookLogId;

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
    logger.info(`✅ Order ${payload.order_number} (cancelled) updated in database`);

    // Crear job en DB para marcar como cancelado en Clientify
    logger.info(`📝 Creando job de cancelación en la base de datos...`);
    const job = await createJob({
      shopId: shopRecord.id,
      queueName: 'order-sync',
      type: 'order.cancelled',
      payload: {
        shopifyOrderId: payload.id.toString(),
        shop: shop,
        orderData: payload
      },
      priority: 3  // Máxima prioridad
    });

    logger.info(`✅ Job ${job.id} creado en DB para cancelación con Clientify`);
    logger.info(`   El DB poller lo recogerá y procesará automáticamente`);

    // Marcar webhook como procesado
    if (webhookLogId) {
      await markWebhookAsProcessed(webhookLogId);
    }
    
    return new Response(null, { status: 200 });
  } catch (error) {
    logger.error("❌ ERROR in webhook CANCELLED:", error);
    logger.error("Error details:", error instanceof Error ? error.message : error);
    return new Response(null, { status: 500 });
  }
};

