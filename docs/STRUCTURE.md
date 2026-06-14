# Estructura de la aplicación

> Última actualización: Mayo 2026

---

## Árbol de archivos relevantes

```
connect-ecommerce-shopify/
│
├── prisma/
│   ├── schema.prisma              — Modelos: Shop, Session, Order, SyncLog,
│   │                                WebhookLog, Integration, IntegrationCredential,
│   │                                ShopIntegration, PipelineConfig, OrderStageMapping
│   ├── seed.js                    — Inserta/actualiza las filas de Integration disponibles
│   └── migrations/                — Historial de migraciones SQL
│
├── app/
│   ├── db.server.ts               — Singleton PrismaClient
│   ├── shopify.server.ts          — Configuración del SDK Shopify
│   ├── root.tsx                   — Layout raíz de la app
│   ├── routes.ts                  — Registro de rutas (escanea front/ y api/)
│   │
│   ├── models/
│   │   └── Integration.server.js  — CRUD integraciones + credenciales + estado activo
│   │
│   ├── routes/
│   │   ├── front/                 — Rutas React (SSR, embebidas en Shopify Admin)
│   │   │   ├── app.tsx            — Layout + menú lateral dinámico
│   │   │   ├── app._index.tsx     — Dashboard principal
│   │   │   ├── app.integrations._index.tsx  — Lista + toggle de integraciones
│   │   │   ├── app.integrations.$name.tsx   — Config credenciales por integración
│   │   │   ├── app.pipelines.tsx            — UI visual pipelines Clientify
│   │   │   ├── app.pipeline-settings.tsx    — Loader/action pipelines
│   │   │   ├── app.sync-logs.tsx            — Historial de sincronizaciones
│   │   │   ├── app.webhook-logs.tsx         — Historial de webhooks
│   │   │   ├── app.products.tsx             — Lista de productos
│   │   │   ├── app.update-webhooks.tsx      — Re-registro de webhooks
│   │   │   ├── admin.tsx                    — Panel interno (JWT)
│   │   │   ├── admin.login.tsx
│   │   │   ├── admin.dashboard.tsx
│   │   │   ├── admin.clients.tsx
│   │   │   ├── admin.sync-logs.tsx
│   │   │   └── admin.webhook-logs.tsx
│   │   │
│   │   └── api/                   — Endpoints de webhook (solo servidor)
│   │       ├── webhooks.orders.create.tsx
│   │       ├── webhooks.orders.updated.tsx
│   │       ├── webhooks.orders.cancelled.tsx
│   │       ├── webhooks.app.uninstalled.tsx
│   │       ├── webhooks.app.scopes_update.tsx
│   │       └── api.erp-webhooks.$integration.$shopDomain.tsx
│   │
│   ├── services/
│   │   ├── integrations/                    — CAPA CENTRAL multi-integración
│   │   │   ├── registry.server.ts           — Metadatos UI (nombre, campos, sub-rutas)
│   │   │   └── dispatcher.server.ts         — Factories + fan-out de sincronización
│   │   │
│   │   ├── erp/                             — Implementaciones de controladores
│   │   │   ├── erp-controller.interface.ts  — Contrato ERPController
│   │   │   ├── clientify/
│   │   │   │   ├── clientify.service.ts
│   │   │   │   ├── clientify.service-helper.ts
│   │   │   │   └── clientify.controller.ts
│   │   │   └── holded/
│   │   │       ├── holded.service.ts
│   │   │       └── holded.controller.ts
│   │   │
│   │   ├── clientify/                       — Shims de compatibilidad (no eliminar)
│   │   │   └── sync-order-to-clientify.server.ts
│   │   │
│   │   ├── shopify/                         — Escritura en Shopify vía GraphQL Admin
│   │   │   ├── shopify-customer.service.ts
│   │   │   ├── shopify-product.service.ts
│   │   │   └── shopify-inventory.service.ts
│   │   │
│   │   └── logging/
│   │       ├── sync-logger.server.ts
│   │       └── webhook-logger.server.ts
│   │
│   └── utils/
│       ├── logger.server.ts
│       ├── webhook-validator.server.ts
│       ├── shop-validator.server.ts
│       └── admin-auth.server.ts
│
├── docs/                          — Esta documentación
├── tests/                         — Tests de integración con Vitest
├── extensions/                    — Extensiones Shopify (Theme App Extensions, etc.)
├── public/                        — Assets estáticos
│
├── prisma/schema.prisma
├── shopify.app.toml               — Configuración Shopify CLI
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Diagrama de arquitectura multi-integración

```
┌─────────────────────────────────────────────────────────────┐
│                  SHOPIFY ADMIN (embebido)                    │
│                                                              │
│  /app/integrations         /app/integrations/:name          │
│  ┌─────────────────┐       ┌─────────────────────────────┐  │
│  │ Lista de integ. │──────▶│ Config + credenciales        │  │
│  │ Toggle activo   │       │ (campos desde registry.ts)   │  │
│  └─────────────────┘       └─────────────────────────────┘  │
│           │                           │                      │
│           ▼                           ▼                      │
│   ShopIntegration.active     IntegrationCredential           │
└─────────────────────────────────────────────────────────────┘
                                │
                   Webhook Shopify llega
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│               webhooks.orders.create.tsx                     │
│                                                              │
│  1. validateShopIsActive()                                   │
│  2. Upsert Order + WebhookLog                                │
│  3. dispatchOrderSync(shop, shopId, order)                   │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│          dispatcher.server.ts — dispatchOrderSync            │
│                                                              │
│  getActiveControllersForShop(shop)                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ DB: ShopIntegration WHERE active=true               │    │
│  │     → IntegrationCredential                         │    │
│  │     → CONTROLLER_FACTORIES[name](creds) → Controller│    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Para cada controller activo:                                │
│  controller.syncOrderToERP(order, shopId) ──────────────┐   │
└─────────────────────────────────────────────────────────│───┘
                                                          │
          ┌───────────────────────────────────────────────┤
          │                                               │
          ▼                                               ▼
┌─────────────────┐                           ┌─────────────────┐
│ ClientifyCtrl   │                           │ HoldedCtrl      │
│ .syncOrderToERP │                           │ .syncOrderToERP │
│                 │                           │                 │
│ → contact       │                           │ → contact       │
│ → products      │                           │ → products      │
│ → deal          │                           │ → document      │
│ → SyncLog × 3   │                           │ → SyncLog × 3   │
└─────────────────┘                           └─────────────────┘
          │                                               │
          └──────────────────┬────────────────────────────┘
                             ▼
                    OrderDispatchResult[]
                    (agrega resultados,
                     actualiza WebhookLog)
```

---

## Diagrama del menú lateral dinámico

```
app.tsx (loader)
  │
  └─ getActiveIntegrations(session.shop)
       │  SELECT i.name, i.displayName
       │  FROM Integration i
       │  JOIN ShopIntegration si ON si.integrationId = i.id
       │  WHERE si.shopId = :shopId AND si.active = true
       │
       ▼
  <s-app-nav>
    <s-nav-item href="/app">Dashboard</s-nav-item>
    <s-nav-item href="/app/integrations">Integrations</s-nav-item>

    { activeIntegrations.map(i =>
      <s-nav-item href="/app/integrations/{i.name}">{i.displayName}</s-nav-item>
    ) }

    <s-nav-item href="/app/sync-logs">Sync Logs</s-nav-item>
    <s-nav-item href="/app/webhook-logs">Webhook Logs</s-nav-item>
  </s-app-nav>
```

---

## Diagrama flujo webhook ERP → Shopify

```
POST /api/erp-webhooks/:integration/:shopDomain
  │
  ├─ buildControllerForShop(shopDomain, integration)
  │       ↳ busca Shop, lee IntegrationCredential
  │       ↳ CONTROLLER_FACTORIES[integration](creds)
  │
  └─ controller.processWebhook(payload, event, adminGraphql, shopId)
         ↳ Cada integración decide qué hacer con el evento
```

---

## Diagrama del modelo de base de datos

```
Shop (domain, active)
 │
 ├──── Session (accessToken, scope, …)
 ├──── Order (shopifyId, body JSON)
 ├──── SyncLog (erpName, syncType, syncStatus, erpId, …)
 ├──── WebhookLog (topic, processed, hmacValid, …)
 ├──── ERPWebhookConfig
 └──── ShopIntegration ───────┐
                              │
Integration (name, displayName)
 │                            │ (shopId + integrationId UNIQUE)
 └──── IntegrationCredential  │
       (sessionId, key, value)│
                              ▼
                        ShopIntegration
                        (shopId, integrationId, active)

PipelineConfig (shopId, pipelineId, pipelineName)
 └──── OrderStageMapping (financialStatus, stageId, stageName)
```

---

## Cómo añadir una nueva integración (resumen rápido)

| Paso | Archivo | Qué hacer |
|---|---|---|
| 1 | `app/services/integrations/registry.server.ts` | Añadir entrada en `INTEGRATION_REGISTRY` |
| 2 | `app/services/erp/<name>/<name>.controller.ts` | Implementar `ERPController` |
| 3 | `app/services/integrations/dispatcher.server.ts` | Añadir factory en `CONTROLLER_FACTORIES` |
| 4 | `prisma/seed.js` | Añadir `{ name, displayName }` en `INTEGRATIONS` |

Después de añadir el seed: `node prisma/seed.js`

Ver el flujo completo en [PROJECT.md](PROJECT.md#cómo-añadir-una-nueva-integración).

---

## Convenciones de código

| Regla | Descripción |
|---|---|
| Indentación | Tabs (no espacios) |
| Idioma | Código y comentarios en inglés |
| Alias `~/` | Solo funciona en `.ts` / `.tsx` (no en `.jsx`) |
| Archivos de servidor | Sufijo `.server.ts` — nunca se importan en el bundle cliente |
| Modelos Prisma | `PascalCase` |
| Rutas React Router | Notación de archivos: `app.integrations.$name.tsx` → `/app/integrations/:name` |
| Servicios ERP | Patrón 3 capas: `Service` → `ServiceHelper` → `Controller` |
