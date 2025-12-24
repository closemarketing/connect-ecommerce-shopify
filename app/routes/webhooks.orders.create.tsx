import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { validateWebhookHmac } from "../utils/webhook-validator.server";
import { syncShopifyOrderToClientify } from "../services/sync-order-to-clientify.server";
import { logOrderSync, logSyncError } from "../services/sync-logger.server";
import { createWebhookLog, markWebhookAsProcessed, markWebhookAsError } from "../services/webhook-logger.server";
import logger from "../utils/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  logger.info("🚀 WEBHOOK CREATE - Route hit!", { timestamp: new Date().toISOString() });
  
  let webhookLogId: number | null = null;
  
  try {
    // Obtener el body del webhook
    const rawBody = await request.text();
    logger.debug("📦 Body length:", rawBody.length);
    
    // Validar HMAC - DESHABILITADO TEMPORALMENTE PARA DESARROLLO
    const hmac = request.headers.get("x-shopify-hmac-sha256");
    logger.debug("🔑 HMAC recibido:", hmac);
    // const hmacValid = validateWebhookHmac(rawBody, hmac);
    // if (!hmacValid) {
    //   logger.error("❌ HMAC validation failed for orders/create");
    //   return new Response("Unauthorized", { status: 401 });
    // }
    
    const payload = JSON.parse(rawBody);
    
    // Obtener shop del header
    const shop = request.headers.get("x-shopify-shop-domain") || "unknown";
    const topic = request.headers.get("x-shopify-topic") || "orders/create";

    logger.info(`✅ Received ${topic} webhook for ${shop}`);
    logger.info(`Order #${payload.order_number} - ID: ${payload.id}`);

    // Buscar o crear Shop
    let shopRecord = await db.shop.findUnique({
      where: { domain: shop }
    });

    if (!shopRecord) {
      shopRecord = await db.shop.create({
        data: { domain: shop }
      });
      logger.info(`📦 Created new shop record for ${shop}`);
    }

    // Registrar webhook recibido
    const webhookLog = await createWebhookLog({
      shopId: shopRecord.id,
      topic,
      shopifyId: payload.id?.toString(),
      headers: {
        "x-shopify-topic": topic,
        "x-shopify-shop-domain": shop,
        "x-shopify-hmac-sha256": hmac,
        "x-shopify-api-version": request.headers.get("x-shopify-api-version"),
      },
      payload: rawBody,
      hmacValid: true, // hmacValid
      processed: false,
    });
    webhookLogId = webhookLog?.id || null;

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
      logger.info(`🔄 Iniciando sincronización con Clientify...`);
      
      // Sincronizar con Clientify
      const syncResult = await syncShopifyOrderToClientify(
        payload,
        clientifyCredentials.value,
        shopRecord.id
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
          syncResult
        );

        // Marcar webhook como procesado
        if (webhookLogId) {
          await markWebhookAsProcessed(webhookLogId);
        }
      } else {
        logger.error(`❌ Error sincronizando con Clientify: ${syncResult.error}`);
        
        // Registrar error de sincronización
        await logSyncError(
          shopRecord.id,
          "ORDER",
          payload.id.toString(),
          syncResult.error || "Error desconocido",
          { orderNumber: payload.order_number }
        );

        // Marcar webhook con error
        if (webhookLogId) {
          await markWebhookAsError(webhookLogId, syncResult.error || "Error desconocido");
        }
      }
    } else {
      logger.warn(`⚠️ No se encontraron credenciales de Clientify para ${shop}. Pedido guardado pero no sincronizado.`);
      
      // Marcar webhook como procesado (aunque no se sincronizó)
      if (webhookLogId) {
        await markWebhookAsProcessed(webhookLogId);
      }
    }
    
    return new Response(null, { status: 200 });
  } catch (error) {
    logger.error("❌ ERROR in webhook CREATE:", error);
    logger.error("Error details:", error instanceof Error ? error.message : error);
    
    // Marcar webhook con error
    if (webhookLogId) {
      await markWebhookAsError(
        webhookLogId,
        error instanceof Error ? error.message : "Error desconocido"
      );
    }
    
    return new Response(null, { status: 500 });
  }
};
