/**
 * Worker BullMQ para sincronizar órdenes con Clientify
 */

import { Worker, Job } from 'bullmq';
import { syncShopifyOrderToClientify } from '../../services/clientify/sync-order-to-clientify.server.js';
import { markJobAsCompleted, markJobAsFailed } from '../../services/job.server.js';
import db from '../../db.server.js';
import logger from '../../utils/logger.server.js';

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

interface OrderSyncJobData {
  jobId?: number;       // ID del job en la base de datos
  shopifyOrderId: string;
  shop: string;
  orderData: any;
}

/**
 * Procesa un job de sincronización de orden
 */
async function processOrderSync(job: Job<OrderSyncJobData>) {
  const { jobId, shopifyOrderId, shop, orderData } = job.data;
  
  logger.info(`🔄 Procesando orden: ${shopifyOrderId} (Job DB: ${jobId || 'N/A'})`);
  
  try {
    // Obtener shopId desde la base de datos
    const shopRecord = await db.shop.findFirst({
      where: { shop }
    });

    if (!shopRecord) {
      throw new Error(`Shop ${shop} not found in database`);
    }

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
      throw new Error(`No Clientify credentials found for shop ${shop}`);
    }

    // Sincronizar con Clientify
    await syncShopifyOrderToClientify(
      orderData,
      clientifyCredentials.value,
      shopRecord.id
    );
    
    // Marcar job en DB como completado
    if (jobId) {
      await markJobAsCompleted(jobId);
      logger.info(`✅ Job ${jobId} marcado como completado en DB`);
    }
    
    logger.info(`✅ Orden ${shopifyOrderId} sincronizada correctamente`);
  } catch (error) {
    logger.error(`❌ Error sincronizando orden ${shopifyOrderId}:`, error);
    
    // Marcar job en DB como fallido
    if (jobId) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await markJobAsFailed(jobId, errorMessage);
      logger.error(`❌ Job ${jobId} marcado como fallido en DB`);
    }
    
    throw error; // Re-lanzar para que BullMQ maneje los reintentos
  }
}

/**
 * Factory function para crear el worker
 */
export function createOrderSyncWorker(): Worker {
  const worker = new Worker(
    'order-sync',
    processOrderSync,
    {
      connection: REDIS_CONFIG,
      concurrency: 5, // Procesar hasta 5 órdenes simultáneamente
      limiter: {
        max: 10, // Máximo 10 jobs
        duration: 1000, // por segundo
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info(`✅ Redis Job ${job.id} completado`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`❌ Redis Job ${job?.id} falló:`, err.message);
  });

  worker.on('error', (err) => {
    logger.error('❌ Error en worker:', err);
  });

  logger.info('🚀 Worker order-sync creado y escuchando...');

  return worker;
}
