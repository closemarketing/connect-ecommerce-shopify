import { flatRoutes } from "@react-router/fs-routes";
import type { RouteConfig } from "@react-router/dev/routes";

// Routes are split into two directories:
//   routes/front/ — React UI pages (Shopify embedded app, admin panel, auth)
//   routes/api/   — Webhook handlers and API endpoints (server-only, no JSX rendered)
export default Promise.all([
	flatRoutes({ rootDirectory: "routes/front" }),
	flatRoutes({ rootDirectory: "routes/api" }),
]).then(([front, api]) => [...front, ...api] as unknown as RouteConfig[]);
