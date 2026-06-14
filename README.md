# Connect Ecommerce — Shopify Integration App

A Shopify embedded app that synchronizes orders, customers, and products from Shopify to external ERP and CRM systems. Built on React Router 7 with a pluggable multi-integration architecture.

## Features

- **Multi-integration support** — connect multiple ERPs/CRMs to a single Shopify store
- **Real-time webhook processing** — orders sync automatically on create, update, and cancel
- **Bidirectional sync** — Shopify → ERP and inbound ERP → Shopify webhooks
- **Pipeline mapping** — map Shopify order statuses to ERP deal stages
- **Per-shop credential management** — API keys stored securely per shop per integration
- **Comprehensive logging** — every sync and webhook logged with full request/response data
- **Internal admin panel** — manage shops, view global sync and webhook logs

## Supported Integrations

| Integration | Type | Syncs |
|-------------|------|-------|
| **Holded** | ERP | Customers, Products, Orders |
| **Clientify** | CRM | Customers, Products, Orders → Deals |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Router 7 (full-stack SSR) |
| UI | Shopify Polaris Web Components + App Bridge |
| Database | MySQL + Prisma ORM |
| Auth | Shopify OAuth (session storage via Prisma) |
| Logging | Winston |
| Testing | Vitest |
| Node | `>=20.19 <22` or `>=22.12` |

## Project Structure

```
app/
├── routes/
│   ├── front/                        # UI routes (embedded app + internal admin)
│   │   ├── app.tsx                   # App shell (AppProvider, nav)
│   │   ├── app._index.tsx            # Dashboard home
│   │   ├── app.integrations._index.tsx          # Integration list & toggle
│   │   ├── app.integrations.$name._index.tsx    # Credential configuration
│   │   ├── app.integrations.$name.sync-logs.tsx # Per-integration sync logs
│   │   ├── app.pipeline-settings.tsx            # Order status → stage mapping
│   │   ├── admin.tsx / admin.login.tsx           # Internal admin panel
│   │   ├── admin.dashboard.tsx / admin.clients.tsx
│   │   ├── admin.sync-logs.tsx / admin.webhook-logs.tsx
│   │   └── auth.$.tsx                # OAuth callback
│   └── api/                          # Server-only routes (no JSX)
│       ├── webhooks.orders.create.tsx
│       ├── webhooks.orders.updated.tsx
│       ├── webhooks.orders.cancelled.tsx
│       ├── webhooks.app.uninstalled.tsx
│       └── api.erp-webhooks.$integration.$shopDomain.tsx
├── services/
│   ├── integrations/
│   │   ├── registry.server.ts        # Integration metadata & credential field definitions
│   │   └── dispatcher.server.ts      # Routes webhook payloads to active ERP controllers
│   ├── erp/
│   │   ├── erp-controller.interface.ts
│   │   ├── clientify/               # Clientify CRM controller + service
│   │   └── holded/                  # Holded ERP controller + service
│   ├── shopify/                     # Shopify Admin GraphQL helpers
│   └── logging/                     # sync-logger, webhook-logger
├── models/
│   └── Integration.server.js        # Prisma CRUD for integrations & credentials
├── utils/
│   ├── logger.server.ts             # Winston logger
│   ├── webhook-validator.server.ts  # HMAC validation
│   └── admin-auth.server.ts         # Internal admin auth (bcryptjs + JWT)
├── db.server.ts                     # Prisma client singleton
├── shopify.server.ts                # Shopify app initialization
└── root.tsx                         # HTML root layout
prisma/
├── schema.prisma                    # DB schema (MySQL)
└── migrations/                      # Migration history
```

## Local Development

### Prerequisites

- **Node.js** `>=20.19 <22` or `>=22.12`
- **MySQL** running locally
- **Shopify CLI** — install globally:
  ```bash
  npm install -g @shopify/cli@latest
  ```
- A **Shopify Partners** account with a development app created and a development store

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file in the project root:

```env
# Database
DATABASE_URL="mysql://root:YOUR_PASSWORD@localhost:3306/connect_ecommerce"

# Shopify — from your app in the Shopify Partners dashboard
SHOPIFY_API_KEY="your_client_id"
SHOPIFY_CLIENT_SECRET="your_client_secret"

# Test shop domain
TEST_SHOP_DOMAIN="your-store.myshopify.com"
```

> `SHOPIFY_CLIENT_SECRET` is used for webhook HMAC validation. Shopify CLI may override `SHOPIFY_API_SECRET` with the App Proxy secret, so this separate variable is intentional.

### 3. Create the MySQL database

```sql
CREATE DATABASE connect_ecommerce;
```

### 4. Run migrations and generate the Prisma client

```bash
npm run setup
```

This runs `prisma generate && prisma migrate deploy`.

### 5. Link to your Shopify app (first time only)

```bash
shopify app config link
```

This updates `shopify.app.toml` with the correct `client_id` from your Partners dashboard.

### 6. Start the development server

```bash
npm run dev
```

Shopify CLI will:
- Authenticate with your Partners account (browser prompt on first run — use `shopify auth login` to switch accounts)
- Create a Cloudflare tunnel to expose your local server
- Print the app URL — press **P** to open it in your test store

**If the Cloudflare tunnel fails**, use ngrok instead:

```bash
# Terminal 1 — start tunnel
ngrok http 3000

# Terminal 2 — start app pointing at the tunnel
shopify app dev --tunnel-url https://YOUR-ID.ngrok-free.app:3000
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server with Shopify CLI tunnel |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run setup` | Generate Prisma client + apply migrations |
| `npm run typecheck` | TypeScript type check (no emit) |
| `npm test` | Run tests in watch mode (Vitest) |
| `npm run test:run` | Run tests once |
| `npm run lint` | ESLint |
| `npm run graphql-codegen` | Regenerate Shopify GraphQL TypeScript types |

## Database Migrations

```bash
# Create a new migration after editing prisma/schema.prisma
npx prisma migrate dev --name describe_your_change

# Apply pending migrations (production / CI)
npx prisma migrate deploy

# Reset the local DB — WARNING: drops all data
npx prisma migrate reset
```

## Adding a New Integration

1. Add an entry to `app/services/integrations/registry.server.ts` (name, displayName, credential fields)
2. Implement the `ERPController` interface in `app/services/erp/<name>/`
3. Register the controller factory in `app/services/integrations/dispatcher.server.ts`
4. Add a seed row in `prisma/seed.js` so the `Integration` DB record exists
5. Run `npm run setup` to apply any schema changes

## Hiding / Showing an Integration

Set `hidden: true` on the integration entry in `registry.server.ts` to remove it from the UI without deleting any code or data. Remove the flag to re-enable it.

## Production Deployment

See [DEPLOY-PRODUCCION.md](DEPLOY-PRODUCCION.md) for the full production guide.

Key checklist:
- Set all `.env` variables in your hosting environment (`NODE_ENV=production`)
- Run `npm run setup` on deploy to apply pending migrations
- Serve with `npm run build && npm start`
- Update `application_url` and `redirect_urls` in `shopify.app.toml` and the Partners dashboard to your production domain

## Troubleshooting

**`Unique constraint failed on Shop_domain_key`** — use `prisma.shop.upsert()` instead of `create()` to avoid race conditions on concurrent requests.

**`A migration failed to apply`** — if a column already exists in the DB but the migration tries to add it, mark the migration as rolled back and replace it with a no-op:
```bash
npx prisma migrate resolve --rolled-back <migration_name>
```

**`Cannot find module 'bcryptjs'`** — run `npm install bcryptjs`.

**`You are not a member of the requested organization`** — run `shopify auth logout && shopify auth login` with the correct Partners account.

**App renders unstyled in Shopify Admin** — ensure `SHOPIFY_API_KEY` is set in `.env` so `AppProvider` can initialize App Bridge correctly.

## Resources

- [React Router docs](https://reactrouter.com/home)
- [Shopify App React Router docs](https://shopify.dev/docs/api/shopify-app-react-router)
- [Shopify App Bridge](https://shopify.dev/docs/api/app-bridge-library)
- [Polaris Web Components](https://shopify.dev/docs/api/app-home/polaris-web-components)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
- [Prisma docs](https://www.prisma.io/docs)
