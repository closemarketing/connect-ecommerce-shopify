#!/usr/bin/env node
/**
 * Script para generar Prisma Client solo si es necesario
 * Evita errores EPERM cuando otro proceso ya tiene el archivo cargado
 * Compatible con cualquier sistema operativo
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const prismaClientPath = path.join(__dirname, '..', 'node_modules', '.prisma', 'client');
const indexPath = path.join(prismaClientPath, 'index.js');
const indexDtsPath = path.join(prismaClientPath, 'index.d.ts');

// Verificar si Prisma Client ya está generado (multiplataforma)
const isGenerated = fs.existsSync(prismaClientPath) && 
                    fs.existsSync(indexPath) && 
                    fs.existsSync(indexDtsPath);

if (isGenerated) {
  console.log('✅ Prisma Client ya está generado, omitiendo regeneración');
  process.exit(0);
}

// Si no existe, generar
console.log('🔄 Generando Prisma Client...');
try {
  execSync('npx prisma generate', { stdio: 'inherit' });
  console.log('✅ Prisma Client generado exitosamente');
} catch (error) {
  console.error('❌ Error generando Prisma Client:', error.message);
  process.exit(1);
}
