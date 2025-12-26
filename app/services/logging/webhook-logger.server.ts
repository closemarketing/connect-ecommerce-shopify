import prisma from "../../db.server";
import logger from "../../utils/logger.server";

interface CreateWebhookLogParams {
  shopId: number;
  topic: string;
  shopifyId?: string;
  headers: Record<string, string | null>;
  payload: any;
  hmacValid?: boolean;
  processed?: boolean;
  errorMessage?: string;
  integrationId?: number;
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
        integrationId: params.integrationId,
      },
    });

    logger.debug(`📝 Webhook log creado: ${params.topic} - ID: ${webhookLog.id}${params.integrationId ? ` - Integration: ${params.integrationId}` : ''}`);
    return webhookLog;
  } catch (error) {
    logger.error("Error creando webhook log:", error);
    // No lanzamos el error para no interrumpir el flujo principal
    return null;
  }
}

/**
 * Crea múltiples registros de webhook logs, uno por cada integración activa del shop
 */
export async function createWebhookLogsForActiveIntegrations(params: Omit<CreateWebhookLogParams, 'integrationId'>) {
  try {
    // Obtener todas las integraciones que tienen credenciales activas para este shop
    const shop = await prisma.shop.findUnique({
      where: { id: params.shopId },
      select: { domain: true }
    });

    if (!shop) {
      logger.warn(`⚠️ Shop ${params.shopId} not found for webhook duplication`);
      return [];
    }

    // Buscar todas las integraciones que tienen credenciales configuradas para esta tienda
    const activeIntegrations = await prisma.integrationCredential.findMany({
      where: {
        sessionId: shop.domain,
      },
      select: {
        integrationId: true,
      },
      distinct: ['integrationId'],
    });

    if (activeIntegrations.length === 0) {
      logger.info(`ℹ️ No active integrations found for shop ${shop.domain}, creating generic webhook log`);
      // Si no hay integraciones activas, crear un solo log sin integrationId
      const log = await createWebhookLog(params);
      return log ? [log] : [];
    }

    logger.info(`📋 Creating ${activeIntegrations.length} webhook log(s) for shop ${shop.domain}`);

    // Crear un webhook log por cada integración activa
    const webhookLogs = [];
    for (const { integrationId } of activeIntegrations) {
      const log = await createWebhookLog({
        ...params,
        integrationId,
      });
      if (log) {
        webhookLogs.push(log);
      }
    }

    logger.info(`✅ Created ${webhookLogs.length} webhook log(s) for ${activeIntegrations.length} active integration(s)`);
    return webhookLogs;
  } catch (error) {
    logger.error("Error creating webhook logs for active integrations:", error);
    // Fallback: crear al menos un log sin integrationId
    const log = await createWebhookLog(params);
    return log ? [log] : [];
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
