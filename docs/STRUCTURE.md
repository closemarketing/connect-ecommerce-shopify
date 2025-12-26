# Estructura del Proyecto - Shopi Clientify App

## 📁 Estructura Reorganizada

```
app/
├── components/          # Componentes React reutilizables (futuro)
├── routes/              # Rutas Remix (Frontend + Backend)
│   ├── app.*.tsx       # Páginas de la app embebida
│   ├── webhooks.*.tsx  # Endpoints de webhooks
│   └── auth.*.tsx      # Autenticación
├── services/            # Lógica de negocio (Backend)
│   ├── clientify/      # 🔵 Integración con Clientify
│   │   ├── clientify.server.ts                  # Cliente HTTP API Clientify
│   │   ├── clientify-mapper.server.ts           # Mapeo Shopify ↔ Clientify
│   │   ├── sync-customer-to-clientify.server.ts # Sync de customers
│   │   ├── sync-products-to-clientify.server.ts # Sync de products
│   │   ├── sync-deal-to-clientify.server.ts     # Sync de deals
│   │   └── sync-order-to-clientify.server.ts    # Sync completo de orders
│   └── logging/        # 📝 Sistema de logs
│       ├── sync-logger.server.ts     # Logs de sincronizaciones
│       └── webhook-logger.server.ts  # Logs de webhooks
├── models/              # Modelos de datos (Backend)
│   ├── Integration.server.js
│   └── QRCode.server.js
├── utils/               # Utilidades compartidas
│   ├── logger.server.ts         # Winston logger
│   └── webhook-validator.server.ts
├── db.server.ts         # Cliente Prisma
├── shopify.server.ts    # Cliente Shopify
└── root.tsx             # Layout raíz
```

## 🔄 Flujo de Sincronización de Orders

```
Webhook (orders/create o orders/updated)
    ↓
webhooks.orders.create.tsx / webhooks.orders.updated.tsx
    ↓
syncShopifyOrderToClientify() [sync-order-to-clientify.server.ts]
    ├─→ syncCustomer() → Clientify API
    ├─→ syncProducts() → Clientify API  
    └─→ syncDeal() → Clientify API
        ↓
    Logs en DB (SyncLog + WebhookLog)
```

## 📊 Sistema de Logs

### SyncLog
Registra cada sincronización individual:
- Customer sync
- Product sync  
- Deal sync
- Order sync (completo)

**Ver logs:** `/app/sync-logs`

### WebhookLog
Registra cada webhook recibido:
- Headers y payload completos
- Estado de procesamiento
- Errores si los hay

**Ver logs:** `/app/webhook-logs`

## 🛠️ Servicios Principales

### Integrations (`app/integrations/`)
Cada integración está completamente autocontenida en su propia carpeta:

#### Clientify (`app/integrations/clientify/`)
- **clientify-adapter.server.ts**: Adaptador que implementa IntegrationAdapter interface
- **clientify-api.server.ts**: Cliente HTTP para Clientify API
- **sync-*.server.ts**: Servicios de sincronización específicos (order, customer, product, deal)
- **clientify-mapper.server.ts**: Transformación de datos Shopify → Clientify
- **pipeline.server.ts**: Gestión de pipelines y etapas
- **index.ts**: Exports centralizados de la integración

#### Agora (`app/integrations/agora/`)
- **agora-adapter.server.ts**: Adaptador stub (pendiente de implementación)

#### Base (`app/integrations/base/`)
- **integration-adapter.server.ts**: Interface que todas las integraciones deben implementar
- **types.ts**: Tipos compartidos (SyncResult, CredentialField, etc.)
- **errors.ts**: Clases de error tipadas

#### Registry (`app/integrations/registry.server.ts`)
- Sistema centralizado de registro de adaptadores
- `getAdapter(name)`, `getAllAdapters()`, `getEnabledAdapters()`

### Logging Services (`app/services/logging/`)
- **sync-logger.server.ts**: CRUD de SyncLog
- **webhook-logger.server.ts**: CRUD de WebhookLog

## 📝 Convenciones

### Nomenclatura de archivos
- `*.server.ts` - Código que solo se ejecuta en servidor
- `*.tsx` - Componentes React / Rutas Remix
- `*.test.ts` - Tests de integración

### Imports
```typescript
// Integrations
import { ClientifyAdapter } from "~/integrations/clientify";
import { getAdapter } from "~/integrations/registry.server";

// Logging services
import { logOrderSync } from "~/services/logging/sync-logger.server";

// Utils
import logger from "~/utils/logger.server";
import prisma from "~/db.server";
```

### Organización de Integraciones
Cada integración es un módulo autocontenido que incluye:
1. **Adapter**: Implementa `IntegrationAdapter` interface
2. **API Client**: Cliente HTTP para la API externa
3. **Mappers**: Transformaciones de datos
4. **Sync Services**: Lógica de sincronización específica
5. **Types**: Tipos TypeScript específicos de la integración
6. **index.ts**: Exports centralizados

## 🔒 Seguridad

- Todos los logs filtran por `shopId` - cada tienda solo ve sus datos
- Webhooks validados con HMAC (actualmente deshabilitado en dev)
- API keys de Clientify guardadas en `IntegrationCredential`

## 🚀 Próximos pasos

- [ ] Crear carpeta `components/` para componentes reutilizables
- [ ] Agregar tests unitarios en `services/`
- [ ] Implementar validación HMAC en producción
- [ ] Agregar retry logic para fallos de sync
