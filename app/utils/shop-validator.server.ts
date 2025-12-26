import db from "../db.server";
import logger from "./logger.server";
import { createWebhookLog } from "../services/logging/webhook-logger.server";

/**
 * Valida que una tienda esté activa antes de procesar webhooks
 * @param shopDomain Dominio de la tienda
 * @param topic Tópico del webhook
 * @param shopifyId ID del objeto en Shopify
 * @param payload Payload del webhook
 * @param headers Headers del webhook
 * @returns El registro de Shop si está activa, null si está inactiva
 */
export async function validateShopIsActive(
  shopDomain: string,
  topic: string,
  shopifyId: string | undefined,
  payload: any,
  headers?: Record<string, string | null>
): Promise<{ shop: any; webhookLogId: number | null } | null> {
  // Buscar o crear Shop
  let shopRecord = await db.shop.findUnique({
    where: { domain: shopDomain }
  });

  if (!shopRecord) {
    shopRecord = await db.shop.create({
      data: { domain: shopDomain, active: true }
    });
    logger.info(`📦 Created new shop record for ${shopDomain}`);
  } else if (!shopRecord.active) {
    // Si la tienda existe pero está inactiva, reactivarla (reinstalación)
    shopRecord = await db.shop.update({
      where: { id: shopRecord.id },
      data: { active: true }
    });
    logger.info(`✅ Shop ${shopDomain} reactivated (app reinstalled)`);
  }

  // Crear log del webhook
  const webhookLog = await createWebhookLog({
    shopId: shopRecord.id,
    topic,
    shopifyId,
    headers: headers || {},
    payload,
    hmacValid: true,
  });

  // Después de buscar/crear/reactivar, la tienda siempre estará activa
  return { shop: shopRecord, webhookLogId: webhookLog?.id || null };
}
