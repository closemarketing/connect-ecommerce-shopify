import prisma from "../../db.server";
import logger from "../../utils/logger.server";
import type { SyncType, SyncStatus } from "@prisma/client";

interface CreateSyncLogParams {
  shopId:        number;
  syncType:      SyncType;
  shopifyId:     string;
  externalId?:  string | number;
  parentOrderId?: string;
  status:        SyncStatus;
  method?:       string;
  url?:          string;
  queryParams?:  Record<string, any>;
  errorMessage?: string;
  requestData?:  any;
  responseData?: any;
  /** Integration FK — links the log to a specific integration row */
  integrationId?: number;
  /** Human-readable ERP name (e.g. "clientify") */
  erpName?:       string;
}

/**
 * Crea un registro de log de sincronización
 */
export async function createSyncLog(params: CreateSyncLogParams) {
  try {
    const syncLog = await prisma.syncLog.create({
      data: {
        shopId:        params.shopId,
        syncType:      params.syncType,
        shopifyId:     params.shopifyId,
        externalId:   params.externalId?.toString(),
        parentOrderId: params.parentOrderId,
        status:        params.status,
        method:        params.method,
        url:           params.url,
        queryParams:   params.queryParams ? JSON.stringify(params.queryParams) : null,
        errorMessage:  params.errorMessage,
        requestData:   params.requestData  ? JSON.stringify(params.requestData)  : null,
        responseData:  params.responseData ? JSON.stringify(params.responseData) : null,
        integrationId: params.integrationId ?? null,
        erpName:       params.erpName       ?? null,
      },
    });

    logger.debug(`📝 Sync log creado: ${params.syncType} - ${params.shopifyId} - ${params.status}`);
    return syncLog;
  } catch (error) {
    logger.error("Error creando sync log:", error);
    // No lanzamos el error para no interrumpir el flujo principal
    return null;
  }
}

/**
 * Log de sincronización exitosa de customer
 */
export async function logCustomerSync(
  shopId: number,
  shopifyCustomerId: string,
  externalContactId: number,
  requestData?: any,
  responseData?: any,
  parentOrderId?: string,
  method?: string,
  url?: string,
  queryParams?: Record<string, any>
) {
  return createSyncLog({
    shopId,
    syncType: "CUSTOMER",
    shopifyId: shopifyCustomerId,
    externalId: externalContactId,
    parentOrderId,
    status: "SUCCESS",
    method,
    url,
    queryParams,
    requestData,
    responseData,
  });
}

/**
 * Log de sincronización exitosa de producto
 */
export async function logProductSync(
  shopId: number,
  shopifyVariantId: string,
  externalProductId: number,
  requestData?: any,
  responseData?: any,
  parentOrderId?: string,
  method?: string,
  url?: string,
  queryParams?: Record<string, any>
) {
  return createSyncLog({
    shopId,
    syncType: "PRODUCT",
    shopifyId: shopifyVariantId,
    externalId: externalProductId,
    parentOrderId,
    status: "SUCCESS",
    method,
    url,
    queryParams,
    requestData,
    responseData,
  });
}

/**
 * Log de sincronización exitosa de deal
 */
export async function logDealSync(
  shopId: number,
  shopifyOrderId: string,
  externalDealId: string | number,
  requestData?: any,
  responseData?: any,
  parentOrderId?: string,
  method?: string,
  url?: string,
  queryParams?: Record<string, any>
) {
  return createSyncLog({
    shopId,
    syncType: "DEAL",
    shopifyId: shopifyOrderId,
    externalId: externalDealId,
    parentOrderId,
    status: "SUCCESS",
    method,
    url,
    queryParams,
    requestData,
    responseData,
  });
}

/**
 * Log de sincronización completa de orden
 */
export async function logOrderSync(
  shopId: number,
  shopifyOrderId: string,
  externalDealId: string | number,
  requestData?: any,
  responseData?: any,
  method?: string,
  url?: string,
  queryParams?: Record<string, any>,
  integrationId?: number,
  erpName?: string,
) {
  return createSyncLog({
    shopId,
    syncType: "ORDER",
    shopifyId: shopifyOrderId,
    externalId: externalDealId,
    status: "SUCCESS",
    method,
    url,
    queryParams,
    requestData,
    responseData,
    integrationId,
    erpName,
  });
}

/**
 * Log de error en sincronización
 */
export async function logSyncError(
  shopId: number,
  syncType: SyncType,
  shopifyId: string,
  errorMessage: string,
  requestData?: any,
  method?: string,
  url?: string,
  queryParams?: Record<string, any>,
  integrationId?: number,
  erpName?: string,
) {
  return createSyncLog({
    shopId,
    syncType,
    shopifyId,
    status: "ERROR",
    method,
    url,
    queryParams,
    errorMessage,
    requestData,
    integrationId,
    erpName,
  });
}

/**
 * Obtiene los últimos logs de sincronización
 */
export async function getRecentSyncLogs(shopId: number, limit = 50) {
  return prisma.syncLog.findMany({
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
 * Obtiene logs de sincronización por tipo
 */
export async function getSyncLogsByType(
  shopId: number,
  syncType: SyncType,
  limit = 50
) {
  return prisma.syncLog.findMany({
    where: { shopId, syncType },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Obtiene estadísticas de sincronización
 */
export async function getSyncStats(shopId: number, days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const logs = await prisma.syncLog.findMany({
    where: {
      shopId,
      createdAt: { gte: since },
    },
  });

  const stats = {
    total: logs.length,
    success: logs.filter((l) => l.status === "SUCCESS").length,
    errors: logs.filter((l) => l.status === "ERROR").length,
    byType: {
      CUSTOMER: logs.filter((l) => l.syncType === "CUSTOMER").length,
      PRODUCT: logs.filter((l) => l.syncType === "PRODUCT").length,
      DEAL: logs.filter((l) => l.syncType === "DEAL").length,
      ORDER: logs.filter((l) => l.syncType === "ORDER").length,
    },
  };

  return stats;
}
