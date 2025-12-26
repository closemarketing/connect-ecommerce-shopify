import { Worker } from 'bullmq';
import { connection } from './queue.server';
import logger from '../utils/logger.server';
import crypto from 'crypto';

export type WorkerStatus = 'running' | 'paused' | 'stopped';

export interface WorkerInfo {
  id: string;
  queueName: string;
  worker: Worker;
  status: WorkerStatus;
  createdAt: Date;
  jobsProcessed: number;
  jobsFailed: number;
}

/**
 * Singleton para gestionar workers de BullMQ
 * Mantiene un registro de todos los workers activos
 */
class WorkerManager {
  private static instance: WorkerManager;
  private workers: Map<string, WorkerInfo> = new Map();
  private workerFactories: Map<string, () => Worker> = new Map();
  private isShuttingDown = false;

  private constructor() {
    this.setupShutdownHandlers();
  }

  static getInstance(): WorkerManager {
    if (!WorkerManager.instance) {
      WorkerManager.instance = new WorkerManager();
    }
    return WorkerManager.instance;
  }

  /**
   * Registra una factory para crear workers de una queue
   */
  registerFactory(queueName: string, factory: () => Worker): void {
    this.workerFactories.set(queueName, factory);
    logger.info(`🏭 Factory registrada para queue: ${queueName}`);
  }

  /**
   * Genera un ID único para un worker
   */
  private generateWorkerId(queueName: string): string {
    const randomId = crypto.randomBytes(4).toString('hex');
    return `${queueName}-${randomId}`;
  }

  /**
   * Escala workers de una queue a un número específico
   * @param queueName - Nombre de la cola
   * @param targetCount - Número objetivo de workers
   * @returns IDs de workers creados/eliminados
   */
  async scaleWorkers(queueName: string, targetCount: number): Promise<{ created: string[], stopped: string[] }> {
    const factory = this.workerFactories.get(queueName);
    if (!factory) {
      throw new Error(`No hay factory registrada para queue: ${queueName}`);
    }

    const currentWorkers = this.getWorkersByQueue(queueName);
    const currentCount = currentWorkers.length;
    const created: string[] = [];
    const stopped: string[] = [];

    if (targetCount > currentCount) {
      // Crear workers adicionales
      const toCreate = targetCount - currentCount;
      logger.info(`📈 Escalando ${queueName}: ${currentCount} → ${targetCount} (+${toCreate})`);
      
      for (let i = 0; i < toCreate; i++) {
        const id = this.generateWorkerId(queueName);
        const worker = factory();
        
        const info: WorkerInfo = {
          id,
          queueName,
          worker,
          status: 'running',
          createdAt: new Date(),
          jobsProcessed: 0,
          jobsFailed: 0,
        };

        // Event listeners para tracking
        worker.on('completed', () => {
          info.jobsProcessed++;
          logger.debug(`✅ ${id}: Job completado (total: ${info.jobsProcessed})`);
        });

        worker.on('failed', (job, error) => {
          info.jobsFailed++;
          logger.error(`❌ ${id}: Job fallido (total: ${info.jobsFailed})`, error);
        });

        this.workers.set(id, info);
        created.push(id);
      }
      
      logger.info(`✅ ${toCreate} worker(s) creados para ${queueName}`);
    } else if (targetCount < currentCount) {
      // Detener workers sobrantes
      const toStop = currentCount - targetCount;
      logger.info(`📉 Reduciendo ${queueName}: ${currentCount} → ${targetCount} (-${toStop})`);
      
      const workersToStop = currentWorkers.slice(0, toStop);
      for (const worker of workersToStop) {
        await this.stopWorker(worker.id);
        stopped.push(worker.id);
      }
      
      logger.info(`✅ ${toStop} worker(s) detenidos de ${queueName}`);
    } else {
      logger.info(`ℹ️ ${queueName} ya tiene ${targetCount} worker(s)`);
    }

    return { created, stopped };
  }

  /**
   * Pausa un worker o todos los workers de una queue
   */
  async pauseWorkers(target: string): Promise<string[]> {
    const paused: string[] = [];

    // Si es un ID específico
    if (this.workers.has(target)) {
      const info = this.workers.get(target)!;
      if (info.status === 'running') {
        await info.worker.pause();
        info.status = 'paused';
        paused.push(target);
        logger.info(`⏸️ Worker ${target} pausado`);
      }
    } else {
      // Pausar todos los workers de la queue
      const workers = this.getWorkersByQueue(target);
      for (const worker of workers) {
        if (worker.status === 'running') {
          await worker.worker.pause();
          worker.status = 'paused';
          paused.push(worker.id);
        }
      }
      logger.info(`⏸️ ${paused.length} worker(s) de ${target} pausados`);
    }

    return paused;
  }

  /**
   * Reanuda un worker o todos los workers de una queue
   */
  async resumeWorkers(target: string): Promise<string[]> {
    const resumed: string[] = [];

    // Si es un ID específico
    if (this.workers.has(target)) {
      const info = this.workers.get(target)!;
      if (info.status === 'paused') {
        await info.worker.resume();
        info.status = 'running';
        resumed.push(target);
        logger.info(`▶️ Worker ${target} reanudado`);
      }
    } else {
      // Reanudar todos los workers de la queue
      const workers = this.getWorkersByQueue(target);
      for (const worker of workers) {
        if (worker.status === 'paused') {
          await worker.worker.resume();
          worker.status = 'running';
          resumed.push(worker.id);
        }
      }
      logger.info(`▶️ ${resumed.length} worker(s) de ${target} reanudados`);
    }

    return resumed;
  }

  /**
   * Detiene un worker específico
   */
  async stopWorker(id: string): Promise<void> {
    const info = this.workers.get(id);
    if (!info) {
      throw new Error(`Worker '${id}' no encontrado`);
    }

    logger.info(`🛑 Deteniendo worker: ${id}`);
    await info.worker.close();
    info.status = 'stopped';
    this.workers.delete(id);
    logger.info(`✅ Worker '${id}' detenido`);
  }

  /**
   * Obtiene workers de una queue específica
   */
  getWorkersByQueue(queueName: string): WorkerInfo[] {
    return Array.from(this.workers.values()).filter(w => w.queueName === queueName);
  }

  /**
   * Obtiene información de todos los workers
   */
  getAllWorkersInfo(): WorkerInfo[] {
    return Array.from(this.workers.values());
  }

  /**
   * Obtiene información agrupada por queue
   */
  getWorkersByQueueGrouped(): Map<string, WorkerInfo[]> {
    const grouped = new Map<string, WorkerInfo[]>();
    
    for (const worker of this.workers.values()) {
      if (!grouped.has(worker.queueName)) {
        grouped.set(worker.queueName, []);
      }
      grouped.get(worker.queueName)!.push(worker);
    }
    
    return grouped;
  }

  /**
   * Obtiene información de un worker específico
   */
  getWorkerInfo(id: string): WorkerInfo | undefined {
    return this.workers.get(id);
  }

  /**
   * Detiene todos los workers (llamado al shutdown)
   */
  async stopAll(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info(`🛑 Deteniendo ${this.workers.size} worker(s)...`);
    
    const promises = Array.from(this.workers.values()).map(async (info) => {
      try {
        await info.worker.close();
        logger.info(`✅ Worker '${info.id}' detenido`);
      } catch (error) {
        logger.error(`Error deteniendo worker '${info.id}':`, error);
      }
    });

    await Promise.all(promises);
    this.workers.clear();
    logger.info('✅ Todos los workers detenidos');
  }

  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      logger.info(`📡 Señal ${signal} recibida`);
      await this.stopAll();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
}

export const workerManager = WorkerManager.getInstance();
