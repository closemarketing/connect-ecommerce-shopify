/**
 * Script de inicialización de workers
 * Este archivo se ejecuta al iniciar el servidor
 * 
 * NOTA: Este archivo YA NO SE USA porque los workers se inician
 * automáticamente por el worker-daemon.server.ts que corre en proceso separado
 * 
 * Se mantiene por compatibilidad pero no hace nada
 */

console.log('🚀 Inicializando sistema de workers...');
console.log('ℹ️ Los workers se gestionan desde el proceso separado worker-daemon');
console.log('ℹ️ Usa "npm run workers:daemon" para arrancar los workers');
