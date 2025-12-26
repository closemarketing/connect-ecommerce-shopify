#!/usr/bin/env node
/**
 * CLI para administrar workers BullMQ
 * Se comunica con el servidor via archivos (file-based IPC)
 */

import fs from 'fs';
import path from 'path';

const IPC_DIR = path.join(process.cwd(), '.worker-ipc');
const REQUEST_DIR = path.join(IPC_DIR, 'requests');
const RESPONSE_DIR = path.join(IPC_DIR, 'responses');

/**
 * Asegura que existan los directorios de IPC
 */
function ensureIpcDirs() {
  [IPC_DIR, REQUEST_DIR, RESPONSE_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

/**
 * Comunica con el servidor usando archivos (file-based IPC)
 */
async function callServer(endpoint: string, body?: any): Promise<any> {
  ensureIpcDirs();

  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const requestFile = path.join(REQUEST_DIR, `${requestId}.json`);
  const responseFile = path.join(RESPONSE_DIR, `${requestId}.json`);

  // Escribir petición
  const request = {
    id: requestId,
    endpoint,
    body: body || {},
    timestamp: Date.now(),
  };

  fs.writeFileSync(requestFile, JSON.stringify(request, null, 2));

  // Esperar respuesta (timeout 10 segundos)
  const timeout = 10000;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (fs.existsSync(responseFile)) {
      const responseData = fs.readFileSync(responseFile, 'utf-8');
      const response = JSON.parse(responseData);
      
      // Limpiar archivos
      try {
        fs.unlinkSync(requestFile);
        fs.unlinkSync(responseFile);
      } catch {}

      if (response.error) {
        throw new Error(response.error);
      }

      return response.data;
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Timeout
  try {
    fs.unlinkSync(requestFile);
  } catch {}

  throw new Error('No se recibió respuesta del servidor (timeout). Asegúrate de que el daemon esté ejecutándose: npm run dev:all');
}

/**
 * Formatea el tiempo de uptime
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Formatea el estado del worker
 */
function formatStatus(status: string): string {
  const icons: Record<string, string> = {
    running: '▶️',
    paused: '⏸️',
    stopped: '⏹️',
  };
  return `${icons[status] || '❓'} ${status.toUpperCase()}`;
}

/**
 * Comando: listar workers activos
 */
async function listWorkers() {
  try {
    const queues = await callServer('list');

    console.log('\n📊 Workers por Queue\n');

    if (queues.length === 0) {
      console.log('  No hay workers activos');
      console.log('\n💡 Escala una queue: npm run workers scale <queue> <count>');
      console.log('   Ejemplo: npm run workers scale order-sync 3');
      return;
    }

    queues.forEach((queue: any) => {
      console.log(`\n📦 Queue: ${queue.queueName}`);
      console.log(`   Workers: ${queue.totalWorkers} (${queue.running} running, ${queue.paused} paused)`);
      console.log(`   Jobs: ${queue.totalJobsProcessed} completados, ${queue.totalJobsFailed} fallidos`);
      
      if (queue.workers.length > 0) {
        console.log('   \n   Workers individuales:');
        queue.workers.forEach((w: any) => {
          const statusIcon = formatStatus(w.status);
          console.log(`     ${statusIcon} ${w.id}`);
          console.log(`        Jobs: ${w.jobsProcessed} / ${w.jobsFailed} fallidos`);
          console.log(`        Uptime: ${formatUptime(w.uptime)}`);
        });
      }
    });

    console.log('\n');
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Comando: escalar workers de una queue
 */
async function scaleWorkers(queueName: string, count: string) {
  if (!queueName || !count) {
    console.error('\n❌ Error: Debes proporcionar queue y cantidad');
    console.log('\n💡 Uso: npm run workers scale <queue> <count>');
    console.log('   Ejemplo: npm run workers scale order-sync 3');
    console.log('\nQueues disponibles: order-sync');
    process.exit(1);
  }

  const numCount = parseInt(count);
  if (isNaN(numCount) || numCount < 0) {
    console.error('\n❌ Error: La cantidad debe ser un número >= 0');
    process.exit(1);
  }

  try {
    const result = await callServer('scale', { queueName, count: numCount });
    console.log(`\n✅ ${result.message}`);
    
    if (result.created.length > 0) {
      console.log(`   ➕ Creados: ${result.created.length} worker(s)`);
      result.created.forEach((id: string) => console.log(`      - ${id}`));
    }
    
    if (result.stopped.length > 0) {
      console.log(`   ➖ Detenidos: ${result.stopped.length} worker(s)`);
      result.stopped.forEach((id: string) => console.log(`      - ${id}`));
    }
    
    console.log('');
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Comando: pausar workers
 */
async function pauseWorkers(target: string) {
  if (!target) {
    console.error('\n❌ Error: Debes proporcionar queue o worker-id');
    console.log('\n💡 Uso: npm run workers pause <queue|worker-id>');
    console.log('   Ejemplos:');
    console.log('     npm run workers pause order-sync           # Pausa toda la queue');
    console.log('     npm run workers pause order-sync-a1b2c3    # Pausa worker específico');
    process.exit(1);
  }

  try {
    const result = await callServer('pause', { target });
    console.log(`\n⏸️ ${result.message}`);
    
    if (result.workers.length > 0) {
      result.workers.forEach((id: string) => console.log(`   - ${id}`));
    }
    
    console.log('');
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Comando: reanudar workers
 */
async function resumeWorkers(target: string) {
  if (!target) {
    console.error('\n❌ Error: Debes proporcionar queue o worker-id');
    console.log('\n💡 Uso: npm run workers resume <queue|worker-id>');
    console.log('   Ejemplos:');
    console.log('     npm run workers resume order-sync           # Reanuda toda la queue');
    console.log('     npm run workers resume order-sync-a1b2c3    # Reanuda worker específico');
    process.exit(1);
  }

  try {
    const result = await callServer('resume', { target });
    console.log(`\n▶️ ${result.message}`);
    
    if (result.workers.length > 0) {
      result.workers.forEach((id: string) => console.log(`   - ${id}`));
    }
    
    console.log('');
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Comando: detener worker específico
 */
async function stopWorker(workerId: string) {
  if (!workerId) {
    console.error('\n❌ Error: Debes proporcionar el ID del worker');
    console.log('\n💡 Uso: npm run workers stop <worker-id>');
    console.log('   Ejemplo: npm run workers stop order-sync-a1b2c3');
    console.log('\n💡 Ver IDs: npm run workers list');
    process.exit(1);
  }

  try {
    const result = await callServer('stop', { workerId });
    console.log(`\n🛑 ${result.message}\n`);
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Muestra la ayuda
 */
function showHelp() {
  console.log(`
🔧 CLI de Workers BullMQ

Comandos disponibles:

  list                                Lista workers por queue con estados
  scale <queue> <count>               Escala workers de una queue
  pause <queue|worker-id>             Pausa queue completa o worker específico
  resume <queue|worker-id>            Reanuda queue o worker
  stop <worker-id>                    Detiene un worker específico

Ejemplos:

  npm run workers list                          # Ver todas las queues
  npm run workers scale order-sync 5            # Escalar a 5 workers
  npm run workers scale order-sync 0            # Detener todos los workers
  npm run workers pause order-sync              # Pausar toda la queue
  npm run workers pause order-sync-a1b2c3       # Pausar worker específico
  npm run workers resume order-sync             # Reanudar queue
  npm run workers stop order-sync-a1b2c3        # Detener worker

Queues disponibles:
  - order-sync      Sincronización de órdenes con Clientify

Estados:
  ▶️ RUNNING       Worker procesando jobs
  ⏸️ PAUSED        Worker pausado, no procesa jobs
  ⏹️ STOPPED       Worker detenido

`);
}

// Main
const [,, command, ...args] = process.argv;

switch (command) {
  case 'list':
    listWorkers();
    break;
  case 'scale':
    scaleWorkers(args[0], args[1]);
    break;
  case 'pause':
    pauseWorkers(args[0]);
    break;
  case 'resume':
    resumeWorkers(args[0]);
    break;
  case 'stop':
    stopWorker(args[0]);
    break;
  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;
  default:
    console.error(`\n❌ Comando desconocido: ${command || '(ninguno)'}\n`);
    showHelp();
    process.exit(1);
}
