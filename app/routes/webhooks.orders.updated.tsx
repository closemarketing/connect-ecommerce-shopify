import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { validateWebhookHmac } from "../utils/webhook-validator.server";
import { syncShopifyOrderToClientify } from "../integrations/clientify/sync-order.server";
import logger from "../utils/logger.server";
import { createWebhookLog, markWebhookAsProcessed, markWebhookAsError } from "../services/logging/webhook-logger.server";
import { validateShopIsActive } from "../utils/shop-validator.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  logger.info("🚀 WEBHOOK UPDATED - Route hit!", new Date().toISOString());
  
  let webhookLogIds: number[] = [];
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
      for (const logId of webhookLogIds) {
        await markWebhookAsProcessed(logId);
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
    const integration = await db.integration.findUnique({
      where: { name: "clientify" }
    });

    if (!integration) {
      logger.warn(`⚠️ Integración Clientify no encontrada`);
      for (const logId of webhookLogIds) {
        await markWebhookAsError(logId, "Clientify integration not found");
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

    if (!apiTokenCredential) {
      logger.warn(`⚠️ No Clientify credentials found for shop ${shop}`);
      for (const logId of webhookLogIds) {
        await markWebhookAsError(logId, "No Clientify credentials configured");
      }
      return new Response(null, { status: 200 });
    }

    // Sincronizar con Clientify (igual que orders/create)
    logger.info(`🔄 Syncing updated order ${payload.order_number} to Clientify...`);
    await syncShopifyOrderToClientify(payload, apiTokenCredential.value, shopRecord.id, integration.id);
    logger.info(`✅ Order ${payload.order_number} synced to Clientify`);

    // Marcar webhooks como procesados
    for (const logId of webhookLogIds) {
      await markWebhookAsProcessed(logId);
    }
    
    return new Response(null, { status: 200 });
  } catch (error) {
    logger.error("❌ ERROR in webhook UPDATED:", error);
    logger.error("Error details:", error instanceof Error ? error.message : error);

    // Si tenemos webhookLogIds, marcar todos con error
    for (const logId of webhookLogIds) {
      await markWebhookAsError(logId, error instanceof Error ? error.message : String(error));
    }
    
    return new Response(null, { status: 500 });
  }
};
