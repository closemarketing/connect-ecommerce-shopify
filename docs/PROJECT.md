# connect-ecommerce-shopify — Documentación del Proyecto

> Última actualización: Mayo 2026

## Descripción general

Aplicación Shopify embebida que sincroniza automáticamente pedidos, clientes y productos de una tienda Shopify con uno o más ERPs/CRMs externos. El comerciante instala la app, elige qué integraciones quiere activar (Clientify, Holded, etc.) desde el propio panel, y desde ese momento cada pedido se sincroniza en paralelo con todas las integraciones activas.

La arquitectura está diseñada para que añadir una nueva integración requiera sólo:
1. Añadir una entrada en el **Registro de integraciones** (metadatos UI).
2. Implementar un **Controller** que cumpla la interfaz `ERPController`.
3. Registrar una **factory** en el **Dispatcher**.
4. Añadir la fila en el **seed**.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Runtime | Node.js ≥ 20.19 |
| Framework web | React Router v7 (SSR) |
| Lenguaje | TypeScript |
| ORM | Prisma 6 |
| Base de datos | MySQL |
| Shopify SDK | `@shopify/shopify-app-react-router` v1 |
| UI | Shopify App Bridge + Polaris Web Components |
| Logger | Winston 3 |
| Tests | Vitest |
| Deploy | Docker / Shopify CLI |

---

## Cómo iniciar el proyecto

### Requisitos previos

- Node.js 20.x
- MySQL corriendo localmente (Laragon, WAMP, Docker o nativo)
- Shopify CLI instalado (`npm install -g @shopify/cli`)
- Cuenta de Shopify Partners con una app registrada
- `.env` configurado

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

```env
SHOPIFY_API_KEY=              # Client ID de la app en Shopify Partners
SHOPIFY_API_SECRET=           # Client Secret de la app
SHOPIFY_CLIENT_SECRET=        # Secret para validar HMAC de webhooks
SHOPIFY_APP_URL=              # URL pública (ngrok/cloudflare en dev)
SCOPES=write_products,read_customers,read_orders
DATABASE_URL=mysql://root:@localhost:3306/shopify_app
NODE_ENV=development
JWT_SECRET=                   # Secret para el panel admin interno
```

### 3. Preparar la base de datos

```bash
# Aplicar migraciones y generar el cliente Prisma
.\node_modules\.bin\prisma migrate deploy
.\node_modules\.bin\prisma generate

# Poblar integraciones disponibles (clientify, holded)
node prisma/seed.js
```

> Usar `.\node_modules\.bin\prisma` en lugar de `npx prisma` con Node 20
> para evitar que npx instale Prisma v7 (requiere Node ≥ 22).

### 4. Iniciar en desarrollo

```bash
npm run dev
```

Levanta servidor React Router + tunnel Cloudflare + proxy Shopify.

| Tecla | Acción |
|---|---|
| `p` | Abrir preview de la app |
| `g` | Abrir GraphiQL |
| `q` | Salir |

### 5. Primera instalación

1. Accede a la URL del tunnel que muestra `npm run dev`.
2. Instala la app en tu tienda de desarrollo.
3. Ve a **Integrations** → selecciona la integración deseada.
4. Configura las credenciales (API Key).
5. Activa la integración con el botón **Activar**.

### 6. Producción

```bash
npm run build
npm run start
# O con Docker:
npm run docker-start   # generate + migrate deploy + start
```

---

## Estructura del proyecto

```
app/
├── db.server.ts              — Cliente Prisma singleton
├── shopify.server.ts         — Configuración del SDK de Shopify
├── root.tsx                  — Layout raíz
├── routes.ts                 — Registro de rutas (escanea front/ y api/)
│
├── models/
│   └── Integration.server.js — CRUD de integraciones, credenciales y
│                                estado activo por tienda
│
├── routes/
│   ├── front/                — Rutas de UI (React, SSR)
│   │   ├── _index/           — Landing page pública
│   │   ├── auth.$/           — OAuth Shopify
│   │   ├── auth.login/       — Login manual
│   │   ├── app.tsx           — Layout admin embebido + menú lateral dinámico
│   │   ├── app._index.tsx    — Dashboard. Registra webhooks automáticamente.
│   │   ├── app.integrations._index.tsx — Lista de integraciones (activar/desactivar)
│   │   ├── app.integrations.$name.tsx  — Configuración por integración (credenciales)
│   │   ├── app.pipelines.tsx           — Gestión visual de pipelines (Clientify)
│   │   ├── app.pipeline-settings.tsx   — Loader/action del módulo pipelines
│   │   ├── app.sync-logs.tsx           — Historial de sincronizaciones
│   │   ├── app.webhook-logs.tsx        — Historial de webhooks
│   │   ├── app.products.tsx            — Lista de productos vía GraphQL
│   │   ├── app.update-webhooks.tsx     — Re-registro forzado de webhooks
│   │   ├── admin.tsx                   — Panel admin interno (JWT)
│   │   ├── admin.login.tsx             — Login del panel admin
│   │   ├── admin.dashboard.tsx         — Dashboard interno
│   │   ├── admin.clients.tsx           — Lista de tiendas instaladas
│   │   ├── admin.sync-logs.tsx         — Logs de sync (vista admin)
│   │   └── admin.webhook-logs.tsx      — Logs de webhooks (vista admin)
│   │
│   └── api/                  — Webhooks y endpoints (solo servidor)
│       ├── webhooks.orders.create.tsx
│       ├── webhooks.orders.updated.tsx
│       ├── webhooks.orders.cancelled.tsx
│       ├── webhooks.app.uninstalled.tsx
│       ├── webhooks.app.scopes_update.tsx
│       └── api.erp-webhooks.$integration.$shopDomain.tsx
│
├── services/
│   ├── integrations/                         — Capa multi-integración (CENTRAL)
│   │   ├── registry.server.ts                — Metadatos UI de cada integración
│   │   └── dispatcher.server.ts              — Factories + dispatchOrderSync
│   │
│   ├── erp/                                  — Implementaciones de controladores
│   │   ├── erp-controller.interface.ts       — Contrato ERPController + SyncResult
│   │   ├── clientify/
│   │   │   ├── clientify.service.ts          — Cliente HTTP Clientify (capa 1)
│   │   │   ├── clientify.service-helper.ts   — Mappers Shopify→Clientify (capa 2)
│   │   │   └── clientify.controller.ts       — Lógica de negocio (capa 3)
│   │   └── holded/
│   │       ├── holded.service.ts             — Cliente HTTP Holded
│   │       └── holded.controller.ts          — Controlador Holded (esqueleto)
│   │
│   ├── clientify/                            — Shims de compatibilidad
│   │   └── sync-order-to-clientify.server.ts — Usado por app.sync-logs y tests
│   │
│   ├── shopify/                              — Servicios de escritura en Shopify
│   │   ├── shopify-customer.service.ts
│   │   ├── shopify-product.service.ts
│   │   └── shopify-inventory.service.ts
│   │
│   └── logging/
│       ├── sync-logger.server.ts             — Escribe en SyncLog
│       └── webhook-logger.server.ts          — Escribe en WebhookLog
│
└── utils/
    ├── logger.server.ts            — Logger Winston
    ├── webhook-validator.server.ts — Validación HMAC SHA-256
    ├── shop-validator.server.ts    — Valida tienda activa + HMAC
    └── admin-auth.server.ts        — JWT guard para el panel admin
```

---

## Arquitectura multi-integración

### Registro de integraciones (`registry.server.ts`)

Es el **único punto donde se declaran los metadatos UI** de cada integración. Controla qué campos de credenciales se muestran, la descripción, el icono y las sub-rutas del menú.

```typescript
// app/services/integrations/registry.server.ts
export const INTEGRATION_REGISTRY: IntegrationDefinition[] = [
  {
    name:        "clientify",
    displayName: "Clientify",
    description: "Sincroniza clientes, productos y pedidos con Clientify CRM.",
    icon:        "🟢",
    credentials: [
      { key: "apikey", label: "API Key", type: "password", required: true }
    ],
    subRoutes: [{ path: "pipelines", label: "Pipelines" }],
  },
  {
    name:        "holded",
    displayName: "Holded",
    description: "Sincroniza contactos, productos y facturas con Holded ERP.",
    icon:        "🟣",
    credentials: [
      { key: "apikey", label: "API Key", type: "password", required: true }
    ],
  },
];
```

### Dispatcher (`dispatcher.server.ts`)

Única fuente de verdad para las **factories de controladores**. Lo usan los webhooks de Shopify y el endpoint de webhooks ERP entrantes.

```typescript
// Añadir una nueva integración aquí
const CONTROLLER_FACTORIES = {
  clientify: (creds) => new ClientifyController(creds.apikey),
  holded:    (creds) => new HoldedController(creds.apikey),
};
```

`dispatchOrderSync(shopDomain, shopId, order)` itera **todas las integraciones activas** de esa tienda y llama a `syncOrderToERP` en cada una. Un fallo en una integración no aborta las demás.

### Patrón Controller / Service / ServiceHelper

| Capa | Archivo | Responsabilidad |
|---|---|---|
| `XService` | `*.service.ts` | Llamadas HTTP crudas a la API externa. Sin lógica de negocio. |
| `XServiceHelper` | `*.service-helper.ts` | Funciones puras de mapeo de datos (sin efectos secundarios). |
| `XController` | `*.controller.ts` | Orquestación: usa Service + Helper, escribe logs, accede a BD. |

---

## Cómo añadir una nueva integración

### Checklist completo

**1. Registro UI** — `app/services/integrations/registry.server.ts`

Añade una entrada en `INTEGRATION_REGISTRY`:

```typescript
{
  name:        "facturaplus",
  displayName: "FacturaPlus",
  description: "Sincroniza pedidos con FacturaPlus.",
  icon:        "🔵",
  credentials: [
    { key: "apiurl",  label: "URL de la API",  type: "url",      required: true },
    { key: "apikey",  label: "API Key",         type: "password", required: true },
  ],
}
```

**2. Service** — `app/services/erp/facturaplus/facturaplus.service.ts`

Implementa las llamadas HTTP a la API de FacturaPlus:

```typescript
export class FacturaplusService {
  constructor(private apiUrl: string, private apikey: string) {}
  async syncContact(data: any) { /* ... */ }
  async syncDocument(data: any) { /* ... */ }
}
```

**3. Controller** — `app/services/erp/facturaplus/facturaplus.controller.ts`

Implementa la interfaz `ERPController`:

```typescript
import type { ERPController, SyncResult } from "../erp-controller.interface";

export class FacturaplusController implements ERPController {
  constructor(private creds: Record<string, string>) {}

  getName()    { return "facturaplus"; }
  async validateCredentials() { /* ... */ return true; }

  async syncOrderToERP(order: any, shopId: number): Promise<SyncResult> {
    // 1. Mapear cliente, productos, documento
    // 2. Llamar a FacturaplusService
    // 3. Registrar SyncLog
    // 4. Retornar { success, erpId }
  }

  async processWebhook(payload, event, adminGraphql, shopId): Promise<SyncResult> {
    // Lógica para webhooks entrantes de FacturaPlus → Shopify
    // Devolver NOT_IMPLEMENTED si no aplica
  }
}
```

**4. Dispatcher** — `app/services/integrations/dispatcher.server.ts`

Añade la factory:

```typescript
import { FacturaplusController } from "../erp/facturaplus/facturaplus.controller";

const CONTROLLER_FACTORIES = {
  clientify:   (creds) => new ClientifyController(creds.apikey),
  holded:      (creds) => new HoldedController(creds.apikey),
  facturaplus: (creds) => new FacturaplusController(creds),  // pasa todas las creds
};
```

**5. Seed** — `prisma/seed.js`

```javascript
const INTEGRATIONS = [
  { name: "clientify",   displayName: "Clientify"   },
  { name: "holded",      displayName: "Holded"      },
  { name: "facturaplus", displayName: "FacturaPlus" }, // ← añadir
];
```

Ejecutar:

```bash
node prisma/seed.js
```

**Eso es todo.** La integración aparece automáticamente en:
- El listado `/app/integrations` con su formulario de credenciales generado.
- El menú lateral cuando el comerciante la active.
- El dispatcher de webhooks Shopify (sincroniza en paralelo con las demás).
- El endpoint `/api/erp-webhooks/facturaplus/:shop` para webhooks entrantes.

---

## Rutas de la aplicación

### UI — `routes/front/`

| Ruta | Archivo | Descripción |
|---|---|---|
| `/` | `_index/` | Landing page pública |
| `/app` | `app._index.tsx` | Dashboard. Registra webhooks automáticamente. |
| `/app/integrations` | `app.integrations._index.tsx` | Lista todas las integraciones disponibles. Toggle activar/desactivar. |
| `/app/integrations/:name` | `app.integrations.$name.tsx` | Configuración de credenciales por integración. |
| `/app/pipelines` | `app.pipelines.tsx` | Gestión visual de pipelines (Clientify). |
| `/app/sync-logs` | `app.sync-logs.tsx` | Historial de sincronizaciones. Re-sync manual. |
| `/app/webhook-logs` | `app.webhook-logs.tsx` | Historial de webhooks recibidos. |
| `/app/products` | `app.products.tsx` | Lista de productos vía GraphQL. |
| `/admin` | `admin.tsx` | Panel admin interno (JWT). |

### API / Webhooks — `routes/api/`

| Ruta | Archivo | Descripción |
|---|---|---|
| `POST /webhooks/orders/create` | `webhooks.orders.create.tsx` | Guarda pedido y llama `dispatchOrderSync` → todas las integraciones activas. |
| `POST /webhooks/orders/updated` | `webhooks.orders.updated.tsx` | Igual que create si existe sync previo exitoso. |
| `POST /webhooks/orders/cancelled` | `webhooks.orders.cancelled.tsx` | Actualiza pedido en BD. |
| `POST /webhooks/app/uninstalled` | `webhooks.app.uninstalled.tsx` | Marca tienda como inactiva. |
| `POST /webhooks/app/scopes_update` | `webhooks.app.scopes_update.tsx` | Gestiona cambios de permisos. |
| `POST /api/erp-webhooks/:integration/:shopDomain` | `api.erp-webhooks.$integration.$shopDomain.tsx` | Webhooks ERP→Shopify. Enruta via `buildControllerForShop`. |

---

## Modelos de base de datos

```
Shop
│  domain, active
├── Session          — Sesión OAuth
├── Order            — Cuerpo JSON del webhook guardado
├── SyncLog          — Registro de cada objeto sincronizado (con erpName)
├── WebhookLog       — Registro de cada webhook recibido
├── ERPWebhookConfig — Configuración de webhooks entrantes
└── ShopIntegration  — Qué integraciones tiene activas cada tienda (active bool)
                         ↳ Integration → IntegrationCredential (key/value por tienda)

PipelineConfig       — Pipeline Clientify por defecto por tienda
└── OrderStageMapping — status Shopify → stage Clientify
```

### Campos destacados de ShopIntegration

| Campo | Descripción |
|---|---|
| `shopId` | FK a Shop |
| `integrationId` | FK a Integration |
| `active` | Si la integración está activa para esa tienda |

### Enumerados

| Enum | Valores |
|---|---|
| `SyncType` | `CUSTOMER`, `PRODUCT`, `DEAL`, `ORDER`, `PIPELINE`, `STAGE` |
| `SyncStatus` | `SUCCESS`, `ERROR` |
| `SyncDirection` | `SHOPIFY_TO_ERP`, `ERP_TO_SHOPIFY` |

---

## Flujo principal de sincronización (multi-integración)

Cuando Shopify envía `orders/create`:

```
POST /webhooks/orders/create
  │
  ├─ 1. Leer body raw
  ├─ 2. Validar tienda activa + HMAC (validateShopIsActive)
  ├─ 3. Crear/actualizar WebhookLog
  ├─ 4. Upsert Order en BD
  │
  └─ 5. dispatchOrderSync(shop, shopId, order)
         │
         ├─ getActiveControllersForShop(shop)
         │     ↳ busca ShopIntegration WHERE active=true
         │     ↳ carga credenciales de IntegrationCredential
         │     ↳ instancia cada controller vía CONTROLLER_FACTORIES
         │
         ├─ [clientify]  controller.syncOrderToERP(order, shopId) → SyncLog
         ├─ [holded]     controller.syncOrderToERP(order, shopId) → SyncLog
         └─ [...]        (errores en una no abortan las demás)

  └─ 6. Marcar WebhookLog como processed/error
```

Para `orders/updated`, el flujo es idéntico pero se omite si no existe `SyncLog(status=SUCCESS, syncType=ORDER)` previo.

---

## Flujo de activación de integración

```
Comerciante → /app/integrations
  └─ Lista de integraciones (de INTEGRATION_REGISTRY)
       ├─ Estado leído de ShopIntegration (active) + IntegrationCredential
       └─ Botón "Configurar" → /app/integrations/:name
             └─ Formulario generado desde registry.credentials[]
                  └─ POST action → saveCredentials() en IntegrationCredential
       └─ Botón "Activar" → POST action con intent=toggle
             ├─ Verifica que tenga credenciales (bloquea si no)
             └─ setIntegrationActive(shop, name, true)
                  └─ Upsert en ShopIntegration.active = true

app.tsx loader → getActiveIntegrations(shop)
  └─ Inyecta en <s-app-nav> un <s-link> por cada integración activa
```

---

## Menú lateral dinámico

El menú del panel embebido se genera en tiempo real en `app.tsx`:

```typescript
// app/routes/front/app.tsx
const activeIntegrations = await getActiveIntegrations(session.shop);

// Resultado en el menú:
// - Integrations        (siempre visible)
// - Clientify           (solo si está activa)
// - Holded              (solo si está activa)
// - Sync Logs
// - Webhook Logs
```

---

## Webhook ERP entrante (ERP → Shopify)

```
POST /api/erp-webhooks/:integration/:shopDomain
  │
  ├─ buildControllerForShop(shopDomain, integration)
  │     ↳ carga credenciales + instancia controller
  │
  └─ controller.processWebhook(payload, event, adminGraphql, shopId)
```

---

## Módulo de Pipelines (Clientify)

| Estado Shopify | Label | Probabilidad |
|---|---|---|
| `pending` | Pendiente | 30% |
| `authorized` | Autorizado | 50% |
| `partially_paid` | Parcialmente pagado | 60% |
| `paid` | Pagado | 100% |
| `partially_refunded` | Parcialmente reembolsado | 80% |
| `refunded` | Reembolsado | 70% |
| `voided` | Anulado | 10% |

---

## Seguridad

| Mecanismo | Descripción |
|---|---|
| OAuth Shopify | Autenticación estándar con sesiones en MySQL |
| HMAC SHA-256 | Webhooks validados con `crypto.timingSafeEqual` |
| Token rotation | `expiringOfflineAccessTokens: true` |
| Shop activo | Verifica `active=true` antes de procesar webhooks |
| Credenciales por tienda | API Keys separadas por `sessionId` (shop domain) |
| JWT admin | Panel admin interno protegido con JWT firmado con `JWT_SECRET` |

---

## Comandos principales

```bash
# Instalar dependencias
npm install

# Migraciones de base de datos
.\node_modules\.bin\prisma migrate deploy
.\node_modules\.bin\prisma generate

# Poblar integraciones disponibles
node prisma/seed.js

# Desarrollo local con Shopify CLI
npm run dev

# Build de producción
npm run build
npm run start
```
