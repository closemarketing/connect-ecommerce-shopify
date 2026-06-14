# Plan de Integraciones — connect-ecommerce-shopify

> Última actualización: Mayo 2026

Este documento registra el estado de desarrollo de cada integración disponible y la hoja de ruta para futuras incorporaciones.

---

## Estado actual de las integraciones

| Integración | Slug | Fase | Descripción |
|---|---|---|---|
| Clientify | `clientify` | ✅ Producción | CRM. Sincroniza contacto, productos y deal por cada pedido. |
| Holded | `holded` | 🚧 Esqueleto | ERP. Controller base creado, pendiente de implementar sincronización real. |

---

## Integraciones planificadas

| Integración | Slug propuesto | Prioridad | Notas |
|---|---|---|---|
| FacturaPlus | `facturaplus` | Media | API REST documentada |
| Salesforce | `salesforce` | Baja | Requiere OAuth 2.0 por tienda |
| HubSpot | `hubspot` | Media | API similar a Clientify |
| Odoo | `odoo` | Baja | XML-RPC o REST según versión |

---

## Cómo incorporar una nueva integración

Ver checklist completo en [PROJECT.md](PROJECT.md#cómo-añadir-una-nueva-integración).

Resumen de los 4 pasos:

1. **Registro UI** — `app/services/integrations/registry.server.ts`
   Añade metadatos: nombre, icono, descripción, campos de credenciales, sub-rutas.

2. **Controller** — `app/services/erp/<name>/<name>.controller.ts`
   Implementa `ERPController`: `syncOrderToERP()` y `processWebhook()`.

3. **Factory en dispatcher** — `app/services/integrations/dispatcher.server.ts`
   Una línea en `CONTROLLER_FACTORIES`.

4. **Seed** — `prisma/seed.js` + `node prisma/seed.js`

---

## Hitos completados

| Fecha | Hito |
|---|---|
| Dic 2025 | Aplicación inicial con Clientify como única integración (single-tenant) |
| Ene 2026 | Modularización en `Controller / Service / ServiceHelper` |
| Abr 2026 | Webhook ERP→Shopify genérico (`/api/erp-webhooks/:integration/:shop`) |
| May 2026 | Arquitectura multi-integración: `ShopIntegration`, registry, dispatcher |
| May 2026 | UI de gestión de integraciones por tienda (`/app/integrations`) |
| May 2026 | Menú lateral dinámico según integraciones activas |

---

## Notas de arquitectura

- Un fallo en una integración **no aborta** las demás. El dispatcher captura errores individualmente.
- Las credenciales se almacenan como pares `key/value` por tienda en `IntegrationCredential`. Nunca se almacenan en texto plano en código.
- El formulario de credenciales se genera automáticamente desde la definición en `registry.server.ts`.
- Para integraciones que requieren OAuth (Salesforce, HubSpot), habrá que añadir una ruta de callback adicional y guardar los tokens en `IntegrationCredential`.
