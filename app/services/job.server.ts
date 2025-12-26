/**
 * Servicio para crear jobs en la base de datos
 * Los webhooks guardan jobs aquí, y los workers los leen
 */

import db from '../db.server';
import logger from '../utils/logger.server';

export interface CreateJobData {
  shopId?: number;
  queueName: string;
  type: string;
  payload: any;
  priority?: number;
  maxAttempts?: number;
}

/**
 * Crea un nuevo job en la base de datos
 */
export async function createJob(data: CreateJobData) {
  try {
    const job = await db.job.create({
      data: {
        shopId: data.shopId,
        queueName: data.queueName,
        type: data.type,
        payload: data.payload,
        priority: data.priority || 5,
        maxAttempts: data.maxAttempts || 3,
        status: 'pending',
      },
    });

    logger.info(`📝 Job creado: ${job.id} (${job.type}) en queue ${job.queueName}`);
    return job;
  } catch (error) {
    logger.error('Error creando job:', error);
    throw error;
  }
}

/**
 * Obtiene jobs pendientes de una queue específica
 */
export async function getPendingJobs(queueName: string, limit = 10) {
  return db.job.findMany({
    where: {
      queueName,
      status: 'pending',
    },
    orderBy: [
      { priority: 'asc' },  // Prioridad más alta primero
      { createdAt: 'asc' }, // Más antiguos primero
    ],
    take: limit,
  });
}

/**
 * Marca un job como "en proceso"
 */
export async function markJobAsProcessing(jobId: number) {
  return db.job.update({
    where: { id: jobId },
    data: {
      status: 'processing',
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  });
}

/**
 * Marca un job como completado
 */
export async function markJobAsCompleted(jobId: number) {
  return db.job.update({
    where: { id: jobId },
    data: {
      status: 'completed',
      processedAt: new Date(),
    },
  });
}

/**
 * Marca un job como fallido
 */
export async function markJobAsFailed(jobId: number, error: string) {
  const job = await db.job.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    throw new Error(`Job ${jobId} no encontrado`);
  }

  // Si aún tiene reintentos disponibles, volver a pending
  const shouldRetry = job.attempts < job.maxAttempts;

  return db.job.update({
    where: { id: jobId },
    data: {
      status: shouldRetry ? 'pending' : 'failed',
      error,
      processedAt: shouldRetry ? null : new Date(),
    },
  });
}
