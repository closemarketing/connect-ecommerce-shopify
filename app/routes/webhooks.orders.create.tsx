import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { validateWebhookHmac } from "../utils/webhook-validator.server";
import { logSyncError } from "../services/logging/sync-logger.server";
import { createWebhookLog, markWebhookAsProcessed, markWebhookAsError } from "../services/logging/webhook-logger.server";
import { createJob } from "../services/job.server";
import logger from "../utils/logger.server";
import { validateShopIsActive } from "../utils/shop-validator.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  logger.info("🚀 WEBHOOK CREATE - Route hit!", { timestamp: new Date().toISOString() });
  
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
    const topic = request.headers.get("x-shopify-topic") || "orders/create";
    const hmac = request.headers.get("x-shopify-hmac-sha256");
    
    payload = JSON.parse(rawBody);
    
    logger.info(`✅ Received ${topic} webhook for ${shop}`);
    logger.info(`Order #${payload.order_number} - ID: ${payload.id}`);

    // Validar que la tienda esté activa
    const validation = await validateShopIsActive(shop, topic, payload.id?.toString(), rawBody);
    
    if (!validation) {
      // Tienda inactiva, ya se registró en webhook log
      return new Response(null, { status: 200 });
    }

    shopRecord = validation.shop;
    webhookLogId = validation.webhookLogId;

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
    const clientifyCredentials = await db.integrationCredential.findFirst({
      where: {
        sessionId: shop, // Buscar por shop domain
        integration: {
          name: "clientify"
        },
        key: "apikey"
      }
    });

    if (clientifyCredentials) {
      logger.info(`📝 Creando job de sincronización en la base de datos...`);
      
      // Crear job en DB - será recogido por el DB poller y encolado en Redis
      const job = await createJob({
        shopId: shopRecord.id,
        queueName: 'order-sync',
        type: 'order.created',
        payload: {
          shopifyOrderId: payload.id.toString(),
          shop: shop,
          orderData: payload
        },
        priority: 1
      });

      logger.info(`✅ Job ${job.id} creado en DB para sincronización con Clientify`);
      logger.info(`   El DB poller lo recogerá y procesará automáticamente`);

      // Marcar webhook como procesado
      if (webhookLogId) {
        await markWebhookAsProcessed(webhookLogId);
      }
    } else {
      logger.warn(`⚠️ No se encontraron credenciales de Clientify para ${shop}. Pedido guardado pero no se creó job de sincronización.`);
      
      // Marcar webhook como procesado (aunque no se sincronizó)
      if (webhookLogId) {
        await markWebhookAsProcessed(webhookLogId);
      }
    }
    
    return new Response(null, { status: 200 });
  } catch (error) {
    logger.error("❌ ERROR in webhook CREATE:", error);
    logger.error("Error details:", error instanceof Error ? error.message : error);
    
    // Si tenemos webhookLogId, marcar con error
    if (webhookLogId) {
      await markWebhookAsError(
        webhookLogId,
        error instanceof Error ? error.message : "Error desconocido"
      );
    } else if (shopRecord) {
      // Si no se pudo crear el webhookLog pero tenemos shopRecord, intentar crearlo ahora con el error
      try {
        const shop = request.headers.get("x-shopify-shop-domain") || "unknown";
        const topic = request.headers.get("x-shopify-topic") || "orders/create";
        const hmac = request.headers.get("x-shopify-hmac-sha256");
        
        await createWebhookLog({
          shopId: shopRecord.id,
          topic,
          shopifyId: payload?.id?.toString() || "unknown",
          headers: {
            "x-shopify-topic": topic,
            "x-shopify-shop-domain": shop,
            "x-shopify-hmac-sha256": hmac,
          },
          payload: rawBody || "{}",
          hmacValid: true,
          processed: true,
          errorMessage: error instanceof Error ? error.message : "Error desconocido"
        });
      } catch (logError) {
        logger.error("❌ No se pudo crear webhook log de error:", logError);
      }
    }
    
    return new Response(null, { status: 500 });
  }
};
