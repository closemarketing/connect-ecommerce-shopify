import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "~/shopify.server";
import { getActiveIntegrations } from "~/models/Integration.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const activeIntegrations = await getActiveIntegrations(session.shop);

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    activeIntegrations,
  };
};

export default function App() {
  const { apiKey, activeIntegrations } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app/integrations">Integrations</s-link>

        {/* Per-integration entries (only shown when active) */}
        {activeIntegrations.map((i: { name: string; displayName: string }) => (
          <s-link key={i.name} href={`/app/integrations/${i.name}`}>
            {i.displayName}
          </s-link>
        ))}


        <s-link href="/app/sync-logs">Sync Logs</s-link>
        <s-link href="/app/webhook-logs">Webhook Logs</s-link>
        <s-link href="/app/additional">Additional page</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
