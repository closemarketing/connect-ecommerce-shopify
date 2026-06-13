# CLAUDE.md — Connect Ecommerce Shopify

## Project Overview

Shopify embedded app that syncs orders, customers, and products to external ERPs/CRMs. Multi-tenant (one app instance, many shops). Built with React Router 7 + Prisma + MySQL.

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
