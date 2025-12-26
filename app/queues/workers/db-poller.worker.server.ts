/**
 * DB Poller Worker
 * Lee jobs pendientes de la base de datos y los encola en Redis/BullMQ
 */

import { Queue } from 'bullmq';
import { connection } from '../queue.server';
import { getPendingJobs, markJobAsProcessing } from '../../services/job.server';
import logger from '../../utils/logger.server';

const POLL_INTERVAL = 2000; // Revisar DB cada 2 segundos
const BATCH_SIZE = 10; // Procesar hasta 10 jobs por ciclo

// Mapa de queues de BullMQ
const queues = new Map<string, Queue>();

/**
 * Obtiene o crea una queue de BullMQ
 */
function getQueue(queueName: string): Queue {
  if (!queues.has(queueName)) {
    const queue = new Queue(queueName, { connection });
    queues.set(queueName, queue);
    logger.info(`📤 Queue BullMQ creada: ${queueName}`);
  }
  return queues.get(queueName)!;
}

/**
 * Poll de la base de datos y encolado en Redis
 */
async function pollAndEnqueue(queueName: string) {
  try {
    // Obtener jobs pendientes
    const jobs = await getPendingJobs(queueName, BATCH_SIZE);

    if (jobs.length === 0) {
      return; // No hay jobs pendientes
    }

    logger.info(`📋 Encontrados ${jobs.length} job(s) pendientes en ${queueName}`);

    // Encolar cada job en Redis
    for (const job of jobs) {
      try {
        // Marcar como procesando ANTES de encolar
        await markJobAsProcessing(job.id);

        // Encolar en Redis
        const queue = getQueue(queueName);
        await queue.add(
          job.type,
          {
            jobId: job.id,
            ...job.payload,
          },
          {
            priority: job.priority,
            attempts: job.maxAttempts,
            removeOnComplete: true,
            removeOnFail: false,
          }
        );

        logger.info(`✅ Job ${job.id} (${job.type}) encolado en Redis`);
      } catch (error) {
        logger.error(`Error encolando job ${job.id}:`, error);
        // El job quedará en "processing" y eventualmente será reintentado
      }
    }
  } catch (error) {
    logger.error(`Error en poll de ${queueName}:`, error);
  }
}

/**
 * Inicia el poller para una queue específica
 */
export function startDbPoller(queueName: string) {
  logger.info(`🔄 Iniciando DB poller para queue: ${queueName}`);

  const intervalId = setInterval(() => {
    pollAndEnqueue(queueName);
  }, POLL_INTERVAL);

  // Ejecutar inmediatamente la primera vez
  pollAndEnqueue(queueName);

  // Retornar función para detener el poller
  return () => {
    clearInterval(intervalId);
    logger.info(`🛑 DB poller detenido para ${queueName}`);
  };
}

/**
 * Cierra todas las queues de BullMQ
 */
export async function closeAllQueues() {
  logger.info('🛑 Cerrando queues de BullMQ...');
  for (const [name, queue] of queues.entries()) {
    await queue.close();
    logger.info(`✅ Queue ${name} cerrada`);
  }
  queues.clear();
}
