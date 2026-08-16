# CLAUDE.md — Connect Ecommerce Shopify

## Project Overview

Shopify embedded app that syncs orders, customers, and products with external ERPs/CRMs. Multi-tenant (one app instance, many shops). Built with React Router 7 + Prisma + MySQL.

**Product sync direction: ERP → Shopify.** The ERP (e.g. Holded) is the source of truth for products. The sync reads products from the ERP and creates/updates them in Shopify, never the other way around. This runs on a configurable schedule (stored as `sync_interval_hours` credential).

## Commands

```bash
npm run dev          # Start dev server (Shopify CLI + Cloudflare tunnel)
npm run setup        # prisma generate + prisma migrate deploy
npm run build        # Production build
npm start            # Serve production build
npm run typecheck    # tsc --noEmit
npm run test:run     # Vitest single run
npm run lint         # ESLint
```

## Architecture

### Routes split

- `app/routes/front/` — UI pages (Shopify embedded app + internal admin panel)
- `app/routes/api/` — Server-only handlers (webhooks, ERP inbound callbacks)

Both are wired in `app/routes.ts` via `flatRoutes()`.

### Integration system

All integrations are defined in `app/services/integrations/registry.server.ts`:
- Add `hidden: true` to hide from UI without removing code
- `listIntegrationDefinitions()` filters hidden entries automatically

The dispatcher (`dispatcher.server.ts`) routes Shopify webhook payloads to every active integration for a shop. Each integration implements `ERPController` interface:
- `syncOrderToERP(order, shopId)` — triggered by Shopify webhooks
- `processWebhook(payload, event, adminGraphql, shopId)` — triggered by inbound ERP webhooks

**Product sync** is separate from the webhook dispatcher. It runs on a schedule:
- `app/services/erp/holded/sync-products-from-holded.server.ts` — reads all products from Holded (API v2, paginated) and upserts them into Shopify by SKU
- `app/routes/front/app.sync-products.tsx` — POST endpoint that creates a `HoldedSyncJob` and fires the sync async
- `app/routes/app.holded.tsx` — UI page; auto-triggers sync when `sync_interval_hours` has elapsed, or on manual "Sync now"

**Manual order sync** (Shopify → ERP) runs both automatically (via the webhook dispatcher, on `orders/create`/`orders/updated`) and manually from a per-order page. It's connector-agnostic — adding a new ERP under `app/services/erp/<name>/` with a factory entry in `dispatcher.server.ts` is all it takes to show up here, nothing below hardcodes an ERP name:
- `app/routes/front/app.orders.$id.tsx` — order detail page; renders one sync card per active integration (via `getActiveControllersForShop`), each with its own "Sincronizar con {ERP}" button and a "Ver en {ERP}" link when the controller implements `getRecordUrl()`
- `app/routes/api/api.sync-order.tsx` — generic POST endpoint the button calls; takes `integration` (name) in the form body and builds the right controller via `buildControllerForShop()`
- `app/routes/front/app.orders.tsx` — redirector: Shopify's admin_link extensions can't template a resource id into the destination path, only append it as a query param, so this route reads that param and forwards to `app.orders.$id.tsx`
- `extensions/order-sync-link/` — the `admin_link` extension that adds a generic "Sincronizar pedido con ERP" entry to the order's action menu in Shopify admin (target `admin.order-details.action.link`). Its label is static across all merchants regardless of which ERP they've configured, so keep it generic rather than naming one connector
- `app/services/logging/sync-logger.server.ts` → `findExistingOrderSync()` — shared duplicate-sync guard any `ERPController.syncOrderToERP` can call: most ERPs have no upsert-by-external-key for invoices/deals/orders, so re-running the sync would otherwise create a second record
- `app/services/erp/holded/holded.controller.ts` — the Holded-specific implementation: resolves the document type (invoice/salesreceipt/salesorder/waybill; "smart" mode picks by presence of a VAT/NIF) and implements `getRecordUrl()` to link back to the created document

### Database

MySQL via Prisma. Key models: `Shop`, `Session`, `Integration`, `ShopIntegration`, `IntegrationCredential`, `SyncLog`, `WebhookLog`, `PipelineConfig`, `OrderStageMapping`, `AdminUser`.

`SyncLog.externalId` stores the ID of the synced object in the ERP (renamed from `clientifyId` — code uses `externalId` everywhere).

### Session / Auth

Shopify OAuth sessions stored in DB via `@shopify/shopify-app-session-storage-prisma`. Internal admin panel uses separate `AdminUser` model with bcryptjs password hashing.

## Environment Variables

```
DATABASE_URL            MySQL connection string
SHOPIFY_API_KEY         Client ID from Partners dashboard (needed for App Bridge)
SHOPIFY_CLIENT_SECRET   Client secret — used for webhook HMAC validation
                        (separate from SHOPIFY_API_SECRET which CLI may override)
TEST_SHOP_DOMAIN        Shop used in tests
```

## Key Conventions

- **Never use `prisma.model.create()` when a unique constraint exists** — use `upsert()` to avoid race conditions on concurrent requests.
- **`externalId` / `externalPipelineId` / `externalStageName`** — all ERP-specific field names were renamed from `clientify*` to `external*` for multi-integration support. Do not reintroduce `clientify`-prefixed field names.
- **Webhook HMAC** — use `SHOPIFY_CLIENT_SECRET`, not `SHOPIFY_API_SECRET` (CLI overwrites the latter with App Proxy secret).
- **Embedded navigation** — use `Link` from `react-router` or Polaris. Never use `<a>` tags; they break the embedded app iframe session.
- **No comments on obvious code** — only add comments for non-obvious constraints or workarounds.

## Common Issues & Fixes

| Error | Fix |
|-------|-----|
| `Unique constraint failed on Shop_domain_key` | Use `prisma.shop.upsert()` |
| `A migration failed — Duplicate column name` | `prisma migrate resolve --rolled-back <name>`, replace migration with no-op `SELECT 1` |
| `Cannot find module 'bcryptjs'` | `npm install bcryptjs && npm install -D @types/bcryptjs` |
| `not a member of the requested organization` | `shopify auth logout && shopify auth login` |
| Cloudflare tunnel fails | `shopify app dev --tunnel-url https://xxx.ngrok-free.app:3000` |
| App renders unstyled | Ensure `SHOPIFY_API_KEY` is set in `.env` |

## Adding a New Integration

1. `registry.server.ts` — add `IntegrationDefinition` entry
2. `app/services/erp/<name>/` — implement `ERPController` interface
3. `dispatcher.server.ts` — register controller factory
4. `prisma/seed.js` — add `Integration` DB row
5. `npm run setup` — apply schema changes if any

Once active for a shop, `syncOrderToERP` is picked up automatically by both the webhook dispatcher and the manual per-order sync page (`app.orders.$id.tsx`) — no core changes needed. Two things worth doing in the new controller:
- Call `findExistingOrderSync(shopId, shopifyId, this.getName())` (from `sync-logger.server.ts`) at the top of `syncOrderToERP` if the ERP has no upsert-by-external-key for the record you're creating — otherwise every re-trigger (webhook retry, "Sincronizar" button) creates a duplicate.
- Implement `getRecordUrl(result)` if the ERP has a per-record UI page worth linking to — it powers the "Ver en {ERP}" link on the order page. Skip it if there's nothing meaningful to link to.

## Structural Inspiration: woocommerce-es

This project is the Shopify equivalent of [closemarketing/woocommerce-es](https://github.com/closemarketing/woocommerce-es), which connects WooCommerce to ERPs/CRMs via a connector add-on pattern.

### How woocommerce-es organizes connectors

```
includes/
  Plugin_Main.php          ← Base class wires all subsystems; receives a $connector instance
  Connector/
    class-api-{name}.php   ← One class per ERP (Holded, Clientify, etc.), injected at runtime
  Admin/
    Settings.php           ← Connector-aware settings page
    Import_Products.php    ← Bulk import, driven by connector
    Orders.php             ← Order sync UI
    Widget_Order.php       ← Per-order ERP widget
    Widget_Product.php     ← Per-product ERP widget
    Taxes_Rates.php
    Taxes_Types_ERP.php
  Frontend/
    Checkout.php           ← VAT/NIF checkout fields
    MyAccount.php          ← Account area extensions
  Helpers/
    HELPER.php             ← Static utilities (error emails, connector resolution)
    ORDER.php, PROD.php, TAX.php, PAYMENTS.php, VAT.php, CRON.php, AI.php, ALERT.php
  CLI/
    Import_Products_Command.php
```

The main plugin file (`woocommerce-es.php`) defines a `conecom_get_options()` function that returns a connector map keyed by slug. Each connector entry declares its capabilities as flags (`product_price_tax_option`, `order_sync_partial`, etc.) and its settings fields — no code changes needed in core when adding a connector add-on.

### Mapping to this Shopify app

| woocommerce-es concept | Shopify app equivalent |
|---|---|
| `Connector/class-api-{name}.php` | `app/services/erp/<name>/` |
| `Plugin_Main.php` `Base` class | `dispatcher.server.ts` |
| `conecom_get_options()` connector map | `registry.server.ts` `IntegrationDefinition` |
| `Helpers/ORDER.php` | ERP-agnostic order helpers in `app/services/` |
| `Admin/Settings.php` (connector-aware) | `app/routes/front/settings.*` |
| `Admin/Import_Products.php` | product sync job / bulk import route |
| `woocommerce_es.php` capability flags | `IntegrationDefinition` feature flags |

### Design principles to carry forward

- **Connector as a pure dependency** — core subsystems (orders, products, settings) receive the connector instance; they never hard-code an ERP name.
- **Capability flags over conditionals** — declare what a connector supports in its definition; subsystems check flags rather than `if connector === 'holded'`.
- **One connector class per ERP** — each class owns its own API calls, field mapping, and error handling; shared logic lives in Helpers.
- **Add-on pattern** — each ERP connector is a self-contained add-on (separate repo/package in WooCommerce world; separate `app/services/erp/<name>/` module here) that registers itself into the core registry.
