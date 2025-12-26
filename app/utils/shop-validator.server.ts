import db from "../db.server";
import logger from "./logger.server";
import { createWebhookLog } from "../services/logging/webhook-logger.server";
import { validateWebhookHmac } from "./webhook-validator.server";

/**
 * Valida que una tienda esté activa antes de procesar webhooks
 * @param shopDomain Dominio de la tienda
 * @param topic Tópico del webhook
 * @param shopifyId ID del objeto en Shopify
 * @param payload Payload del webhook
 * @param headers Headers del webhook
 * @param rawBody Body raw para validar HMAC
 * @returns El registro de Shop si está activa, null si está inactiva
 */
export async function validateShopIsActive(
  shopDomain: string,
  topic: string,
  shopifyId: string | undefined,
  rawBody: string,
  headers?: Record<string, string | null>
): Promise<{ shop: any; webhookLogId: number | null } | null> {
  // Validar HMAC
  const hmac = headers?.["x-shopify-hmac-sha256"] || null;
  const hmacValid = validateWebhookHmac(rawBody, hmac);
  
  if (!hmacValid) {
    logger.error(`❌ HMAC validation failed for ${topic} from ${shopDomain}`);
    // Aún así registramos el webhook para auditoría
  }
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
    payload: rawBody,
    hmacValid,
  });

  // Si el HMAC no es válido, rechazar el webhook
  if (!hmacValid) {
    logger.error(`🚫 Webhook rejected due to invalid HMAC: ${topic} from ${shopDomain}`);
    return null;
  }

  // Después de buscar/crear/reactivar, la tienda siempre estará activa
  return { shop: shopRecord, webhookLogId: webhookLog?.id || null };
}
