# 🚀 Guía de Workers BullMQ

## Sistema Implementado

Este proyecto incluye un sistema completo de workers con BullMQ para procesamiento asíncrono de tareas.

### Componentes

- **Worker Daemon**: Proceso que mantiene los workers BullMQ corriendo
- **CLI**: Herramienta de línea de comandos para gestionar workers
- **IPC**: Comunicación file-based entre CLI y Daemon
- **Redis**: Cola de mensajes (puerto 6379)
- **Prisma**: Persistencia de jobs en base de datos

## 📋 Prerequisitos

1. **Redis corriendo** (Docker):
   ```bash
   docker-compose up -d
   # Verificar: docker ps | Select-String redis
   ```

2. **Dependencias instaladas**:
   ```bash
   npm install
   ```

## 🎯 Iniciar el Sistema

### Opción 1: Todo en Uno (Recomendado)

Ejecuta el servidor de Shopify **Y** el Worker Daemon simultáneamente:

```bash
npm run dev:all
```

Verás dos procesos corriendo:
- 🔵 **SHOPIFY**: Servidor de desarrollo
- 🟣 **WORKERS**: Worker Daemon con BullMQ

**Salida esperada:**
```
[WORKERS] 🚀 Iniciando Worker Daemon...
[WORKERS] 🔌 Iniciando IPC handler para CLI...
[WORKERS] ✅ IPC handler iniciado
[WORKERS] 📦 Registrando worker inicial: order-sync-default
[WORKERS] ✅ Worker Daemon iniciado correctamente
[WORKERS] 📊 Workers activos: 1

[SHOPIFY] ✅ Ready, watching for changes in your app
```

### Opción 2: Solo Workers (Sin Shopify)

Si solo necesitas los workers sin el servidor web:

```bash
npm run workers:daemon
```

### Opción 3: PowerShell Script

```powershell
.\start-workers.ps1
```

## 🛠️ Usar el CLI

**IMPORTANTE**: Debes ejecutar los comandos CLI en una **terminal separada** mientras el daemon corre.

### Terminal 1 (Dejar corriendo)
```bash
npm run dev:all
```

### Terminal 2 (Ejecutar comandos)

#### Listar workers activos
```bash
npm run workers list
```

**Salida:**
```
👷 Workers Activos

📦 order-sync-default
   Queue: order-sync
   Jobs completados: 15
   Jobs fallidos: 0
   Uptime: 2h 15m 30s
```

#### Crear un nuevo worker
```bash
npm run workers create mi-worker order-sync
```

**Salida:**
```
✅ Worker 'mi-worker' creado exitosamente
```

#### Detener un worker
```bash
npm run workers stop mi-worker
```

**Salida:**
```
✅ Worker 'mi-worker' detenido exitosamente
```

#### Ver ayuda
```bash
npm run workers help
```

## 📊 Monitoreo

### Redis Commander
Monitorea las colas en tiempo real:
```
http://localhost:8081
```

### Logs del Worker Daemon
El daemon muestra logs cada 30 segundos:
```
📊 Estado (13:45:00): 2 worker(s) activo(s)
  - order-sync-default: 150 completados, 2 fallidos
  - email-worker: 75 completados, 0 fallidos
```

## 🔧 Comandos Disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev:all` | Inicia Shopify + Workers |
| `npm run workers:daemon` | Solo Worker Daemon |
| `npm run workers list` | Lista workers activos |
| `npm run workers create <name> <queue>` | Crea worker |
| `npm run workers stop <name>` | Detiene worker |
| `npm run workers help` | Muestra ayuda |

## 📁 Estructura de Archivos

```
app/
├── queues/
│   ├── worker-manager.server.ts    # Singleton de gestión
│   ├── ipc-handler.server.ts       # Manejador IPC
│   ├── cli.server.ts                # CLI de workers
│   └── workers/
│       └── order-sync.worker.server.ts  # Worker de órdenes
├── worker-daemon.server.ts          # Daemon principal
└── services/
    └── clientify/
        └── sync-order-to-clientify.server.ts  # Lógica de sincronización

.worker-ipc/                         # Carpeta de comunicación IPC
├── requests/                        # Peticiones del CLI
└── responses/                       # Respuestas del daemon
```

## ⚙️ Configuración

### Queues Disponibles

Actualmente hay una queue configurada:

- **`order-sync`**: Sincronización de órdenes de Shopify con Clientify

### Crear Nuevas Queues

1. Crea un nuevo worker en `app/queues/workers/`:
   ```typescript
   // mi-queue.worker.server.ts
   import { Worker, Job } from 'bullmq';
   
   export function createMiQueueWorker(): Worker {
     return new Worker('mi-queue', async (job: Job) => {
       // Procesar job
     }, {
       connection: {
         host: process.env.REDIS_HOST || 'localhost',
         port: parseInt(process.env.REDIS_PORT || '6379'),
       }
     });
   }
   ```

2. Registra el factory en `app/queues/ipc-handler.server.ts`:
   ```typescript
   const WORKER_FACTORIES: Record<string, () => any> = {
     'order-sync': createOrderSyncWorker,
     'mi-queue': createMiQueueWorker,  // ← Agregar aquí
   };
   ```

## 🐛 Troubleshooting

### Workers no se inician
```bash
# Verificar que Redis esté corriendo
docker ps | Select-String redis

# Si no está, iniciarlo
docker-compose up -d
```

### CLI no se conecta (timeout)
Asegúrate de que el Worker Daemon esté corriendo:
```bash
# En terminal 1
npm run dev:all

# Espera 5 segundos, luego en terminal 2
npm run workers list
```

### Error al ejecutar comandos en PowerShell
PowerShell envía SIGINT cuando ejecutas comandos en la misma terminal donde corre el daemon. **Usa terminales separadas**:

**Método 1**: Dos terminales de VS Code
- Terminal 1: `npm run dev:all`
- Terminal 2: `npm run workers list`

**Método 2**: PowerShell + CMD
- PowerShell 1: `npm run dev:all`
- CMD: `npm run workers list`

### Prisma warnings
El error `EPERM: operation not permitted` de Prisma es un warning no bloqueante en Windows. No afecta la funcionalidad.

## 🔐 Variables de Entorno

El Worker Daemon usa las mismas variables que la app:

```env
# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Database (para Prisma)
DATABASE_URL="mysql://..."
```

## 📝 Notas Importantes

✅ **El Worker Daemon es independiente del servidor de Shopify**
- No necesita `npm run dev` corriendo
- Solo requiere Redis y la base de datos

✅ **Comunicación file-based**
- No usa HTTP/puertos
- Evita conflictos con Shopify CLI
- Carpeta: `.worker-ipc/`

✅ **Graceful shutdown**
- Ctrl+C detiene workers ordenadamente
- Los jobs en proceso se completan
- Cleanup automático

⚠️ **No ejecutar CLI en la misma terminal que el daemon**
- PowerShell envía SIGINT
- Usa terminales separadas

## 📚 Recursos

- [BullMQ Documentation](https://docs.bullmq.io/)
- [Redis Commander](http://localhost:8081)
- [Prisma Documentation](https://www.prisma.io/docs/)
