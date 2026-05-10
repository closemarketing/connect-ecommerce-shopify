import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { Outlet, useLoaderData, useRouteError, NavLink } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type React from "react";

import { authenticate } from "~/shopify.server";
import { getIntegrationDefinition } from "~/services/integrations/registry.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
	await authenticate.admin(request);
	const name = String(params.name);
	const def  = getIntegrationDefinition(name);
	if (!def) {
		throw new Response("Integration not found", { status: 404 });
	}
	return { def };
}

export default function IntegrationLayout() {
	const { def } = useLoaderData<typeof loader>();

	const tabs = [
		{ to: `/app/integrations/${def.name}`,           label: "Configuración", end: true  },
		{ to: `/app/integrations/${def.name}/sync-logs`, label: "Sync Logs",     end: false },
		...(def.subRoutes ?? []).map((sr) => ({
			to:    `/app/${sr.path}`,
			label: sr.label,
			end:   false,
		})),
	];

	const activeStyle: React.CSSProperties   = { borderBottom: "2px solid #303030", fontWeight: 600, color: "#303030" };
	const inactiveStyle: React.CSSProperties = { color: "#6b7177" };
	const baseStyle: React.CSSProperties     = {
		padding:        "10px 16px",
		textDecoration: "none",
		fontSize:       "14px",
		display:        "inline-block",
	};

	return (
		<s-page>
			<s-text slot="title" variant="headingMd" as="h1">
				{def.icon} {def.displayName}
			</s-text>
			<s-text slot="subtitle" variant="bodyMd" as="p">
				{def.description}
			</s-text>

			<ui-title-bar title={def.displayName}>
				<button onClick={() => (window.location.href = "/app/integrations")}>
					← Volver
				</button>
			</ui-title-bar>

			{/* Tab bar */}
			<div style={{
				borderBottom: "1px solid #e1e3e5",
				marginBottom: "16px",
				paddingLeft:  "0",
				display:      "flex",
				gap:          "0",
			}}>
				{tabs.map((tab) => (
					<NavLink
						key={tab.to}
						to={tab.to}
						end={tab.end}
						style={({ isActive }) => ({
							...baseStyle,
							...(isActive ? activeStyle : inactiveStyle),
						})}
					>
						{tab.label}
					</NavLink>
				))}
			</div>

			<Outlet />
		</s-page>
	);
}

export function ErrorBoundary() {
	return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
