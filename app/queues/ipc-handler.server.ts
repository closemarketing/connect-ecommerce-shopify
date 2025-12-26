/**
 * Manejador de IPC basado en archivos para comunicación CLI <-> Server
 * El servidor monitorea archivos de petición y genera respuestas
 */

import fs from 'fs';
import path from 'path';
import { watch } from 'fs';
import { workerManager } from './worker-manager.server';
import { createOrderSyncWorker } from './workers/order-sync.worker.server';

const IPC_DIR = path.join(process.cwd(), '.worker-ipc');
const REQUEST_DIR = path.join(IPC_DIR, 'requests');
const RESPONSE_DIR = path.join(IPC_DIR, 'responses');

/**
 * Inicializa los directorios de IPC
 */
function ensureIpcDirs() {
  [IPC_DIR, REQUEST_DIR, RESPONSE_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // Limpiar archivos antiguos
  [REQUEST_DIR, RESPONSE_DIR].forEach(dir => {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      try {
        fs.unlinkSync(filePath);
      } catch {}
    });
  });
}

/**
 * Procesa una petición del CLI
 */
async function processRequest(requestFile: string) {
  try {
    const requestPath = path.join(REQUEST_DIR, requestFile);
    
    // Leer request
    const requestData = fs.readFileSync(requestPath, 'utf-8');
    const request = JSON.parse(requestData);

    let responseData: any;

    // Procesar según el endpoint
    switch (request.endpoint) {
      case 'list':
        // Agrupar workers por queue
        const grouped = workerManager.getWorkersByQueueGrouped();
        const queues = Array.from(grouped.entries()).map(([queueName, workers]) => ({
          queueName,
          totalWorkers: workers.length,
          running: workers.filter(w => w.status === 'running').length,
          paused: workers.filter(w => w.status === 'paused').length,
          totalJobsProcessed: workers.reduce((sum, w) => sum + w.jobsProcessed, 0),
          totalJobsFailed: workers.reduce((sum, w) => sum + w.jobsFailed, 0),
          workers: workers.map(w => ({
            id: w.id,
            status: w.status,
            jobsProcessed: w.jobsProcessed,
            jobsFailed: w.jobsFailed,
            uptime: Date.now() - w.createdAt.getTime(),
          })),
        }));
        
        responseData = { data: queues };
        break;

      case 'scale':
        const { queueName, count } = request.body;
        
        if (!queueName || count === undefined) {
          responseData = {
            error: 'Faltan parámetros: queueName y count son requeridos',
          };
          break;
        }

        if (count < 0) {
          responseData = {
            error: 'El count debe ser >= 0',
          };
          break;
        }

        try {
          const result = await workerManager.scaleWorkers(queueName, count);
          responseData = {
            data: {
              success: true,
              message: `Queue '${queueName}' escalada a ${count} worker(s)`,
              created: result.created,
              stopped: result.stopped,
            },
          };
        } catch (error) {
          responseData = {
            error: `Error escalando workers: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
        break;

      case 'pause':
        const { target: pauseTarget } = request.body;

        if (!pauseTarget) {
          responseData = {
            error: 'Falta parámetro: target (queue o worker-id) es requerido',
          };
          break;
        }

        try {
          const paused = await workerManager.pauseWorkers(pauseTarget);
          responseData = {
            data: {
              success: true,
              message: `${paused.length} worker(s) pausado(s)`,
              workers: paused,
            },
          };
        } catch (error) {
          responseData = {
            error: `Error pausando workers: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
        break;

      case 'resume':
        const { target: resumeTarget } = request.body;

        if (!resumeTarget) {
          responseData = {
            error: 'Falta parámetro: target (queue o worker-id) es requerido',
          };
          break;
        }

        try {
          const resumed = await workerManager.resumeWorkers(resumeTarget);
          responseData = {
            data: {
              success: true,
              message: `${resumed.length} worker(s) reanudado(s)`,
              workers: resumed,
            },
          };
        } catch (error) {
          responseData = {
            error: `Error reanudando workers: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
        break;

      case 'stop':
        const { workerId } = request.body;

        if (!workerId) {
          responseData = {
            error: 'Falta parámetro: workerId es requerido',
          };
          break;
        }

        try {
          await workerManager.stopWorker(workerId);
          responseData = {
            data: { success: true, message: `Worker '${workerId}' detenido exitosamente` },
          };
        } catch (error) {
          responseData = {
            error: `Error deteniendo worker: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
        break;

      default:
        responseData = {
          error: `Endpoint desconocido: ${request.endpoint}`,
        };
    }

    // Escribir respuesta
    const responseFile = path.join(RESPONSE_DIR, `${request.id}.json`);
    fs.writeFileSync(responseFile, JSON.stringify(responseData, null, 2));

    // Limpiar request
    try {
      fs.unlinkSync(requestPath);
    } catch {}

  } catch (error) {
    console.error('❌ Error procesando request IPC:', error);
  }
}

/**
 * Inicia el watcher de IPC
 */
export function startIpcHandler() {
  console.log('🔌 Iniciando IPC handler para CLI...');
  
  ensureIpcDirs();

  // Registrar factories de workers
  workerManager.registerFactory('order-sync', createOrderSyncWorker);

  // Monitorear carpeta de requests
  const watcher = watch(REQUEST_DIR, (eventType, filename) => {
    if (eventType === 'rename' && filename && filename.endsWith('.json')) {
      const requestPath = path.join(REQUEST_DIR, filename);
      
      // Esperar un poco para asegurar que el archivo esté completamente escrito
      setTimeout(() => {
        if (fs.existsSync(requestPath)) {
          processRequest(filename);
        }
      }, 50);
    }
  });

  console.log('✅ IPC handler iniciado. Esperando comandos del CLI...');

  // Cleanup en shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 Cerrando IPC handler...');
    watcher.close();
  });

  process.on('SIGINT', () => {
    console.log('🛑 Cerrando IPC handler...');
    watcher.close();
  });
}
