import prisma from "../db.server";
import logger from "../utils/logger.server";

interface CreateWebhookLogParams {
  shopId: number;
  topic: string;
  shopifyId?: string;
  headers: Record<string, string | null>;
  payload: any;
  hmacValid?: boolean;
  processed?: boolean;
  errorMessage?: string;
}

/**
 * Crea un registro de log de webhook recibido
 */
export async function createWebhookLog(params: CreateWebhookLogParams) {
  try {
    const webhookLog = await prisma.webhookLog.create({
      data: {
        shopId: params.shopId,
        topic: params.topic,
        shopifyId: params.shopifyId,
        headers: JSON.stringify(params.headers),
        payload: typeof params.payload === "string" ? params.payload : JSON.stringify(params.payload),
        hmacValid: params.hmacValid,
        processed: params.processed ?? false,
        errorMessage: params.errorMessage,
      },
    });

    logger.debug(`📝 Webhook log creado: ${params.topic} - ID: ${webhookLog.id}`);
    return webhookLog;
  } catch (error) {
    logger.error("Error creando webhook log:", error);
    // No lanzamos el error para no interrumpir el flujo principal
    return null;
  }
}

/**
 * Marca un webhook como procesado exitosamente
 */
export async function markWebhookAsProcessed(webhookLogId: number) {
  try {
    return await prisma.webhookLog.update({
      where: { id: webhookLogId },
      data: { processed: true },
    });
  } catch (error) {
    logger.error("Error marcando webhook como procesado:", error);
    return null;
  }
}

/**
 * Marca un webhook con error
 */
export async function markWebhookAsError(webhookLogId: number, errorMessage: string) {
  try {
    return await prisma.webhookLog.update({
      where: { id: webhookLogId },
      data: {
        processed: false,
        errorMessage,
      },
    });
  } catch (error) {
    logger.error("Error marcando webhook con error:", error);
    return null;
  }
}

/**
 * Obtiene webhooks recientes
 */
export async function getRecentWebhooks(shopId: number, limit = 50) {
  return prisma.webhookLog.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      shop: {
        select: {
          domain: true,
        },
      },
    },
  });
}

/**
 * Obtiene webhooks por topic
 */
export async function getWebhooksByTopic(shopId: number, topic: string, limit = 50) {
  return prisma.webhookLog.findMany({
    where: { shopId, topic },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Obtiene webhooks no procesados
 */
export async function getUnprocessedWebhooks(shopId: number, limit = 50) {
  return prisma.webhookLog.findMany({
    where: {
      shopId,
      processed: false,
      errorMessage: null, // Solo los que fallaron por timeout, no por error
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

/**
 * Obtiene estadísticas de webhooks
 */
export async function getWebhookStats(shopId: number, days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const logs = await prisma.webhookLog.findMany({
    where: {
      shopId,
      createdAt: { gte: since },
    },
  });

  const stats = {
    total: logs.length,
    processed: logs.filter((l) => l.processed).length,
    errors: logs.filter((l) => l.errorMessage !== null).length,
    pending: logs.filter((l) => !l.processed && l.errorMessage === null).length,
    byTopic: logs.reduce((acc, log) => {
      acc[log.topic] = (acc[log.topic] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  };

  return stats;
}
