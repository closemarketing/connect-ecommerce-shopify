/**
 * Worker Daemon
 * Proceso separado que mantiene los workers BullMQ corriendo
 * Se ejecuta independientemente del servidor HTTP de Shopify
 */

import { workerManager } from './queues/worker-manager.server';
import { startIpcHandler } from './queues/ipc-handler.server';
import { createOrderSyncWorker } from './queues/workers/order-sync.worker.server';
import { startDbPoller } from './queues/workers/db-poller.worker.server';

console.log('🚀 Iniciando Worker Daemon...\n');

// Iniciar IPC handler para comunicación con CLI
console.log('🔌 Iniciando IPC handler...');
startIpcHandler();

// Registrar factories de workers disponibles
console.log('🏭 Registrando factories de workers...');
workerManager.registerFactory('order-sync', createOrderSyncWorker);

// Escalar worker inicial de order-sync a 2 workers
console.log('📦 Escalando queue order-sync a 2 workers...');
workerManager.scaleWorkers('order-sync', 2).then(result => {
  console.log(`✅ ${result.created.length} worker(s) creados para order-sync`);
  result.created.forEach(id => console.log(`   - ${id}`));
  
  // Iniciar DB poller para leer jobs de la base de datos
  console.log('\n🔄 Iniciando DB poller para order-sync...');
  startDbPoller('order-sync');
  console.log('✅ DB poller iniciado');
  
  console.log('\n✅ Worker Daemon iniciado correctamente');
  
  const grouped = workerManager.getWorkersByQueueGrouped();
  console.log(`📊 Queues activas: ${grouped.size}`);
  
  grouped.forEach((workers, queueName) => {
    const running = workers.filter(w => w.status === 'running').length;
    const paused = workers.filter(w => w.status === 'paused').length;
    console.log(`   - ${queueName}: ${workers.length} workers (${running} running, ${paused} paused)`);
  });
  
  console.log('\n💡 Usa "npm run workers list" para ver el estado detallado');
  console.log('💡 Usa "npm run workers scale <queue> <count>" para escalar workers');
  console.log('💡 Presiona Ctrl+C para detener el daemon\n');
});

// Mostrar estado cada 30 segundos
setInterval(() => {
  const grouped = workerManager.getWorkersByQueueGrouped();
  const timestamp = new Date().toLocaleTimeString();
  
  console.log(`\n📊 Estado (${timestamp}):`);
  
  grouped.forEach((workers, queueName) => {
    const running = workers.filter(w => w.status === 'running').length;
    const paused = workers.filter(w => w.status === 'paused').length;
    const totalProcessed = workers.reduce((sum, w) => sum + w.jobsProcessed, 0);
    const totalFailed = workers.reduce((sum, w) => sum + w.jobsFailed, 0);
    
    console.log(`  📦 ${queueName}:`);
    console.log(`     Workers: ${workers.length} (▶️ ${running}, ⏸️ ${paused})`);
    console.log(`     Jobs: ${totalProcessed} completados, ${totalFailed} fallidos`);
  });
}, 30000);
