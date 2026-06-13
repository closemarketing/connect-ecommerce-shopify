import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { Outlet, useLoaderData, useRouteError, NavLink } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type React from "react";
import { useTranslation } from "react-i18next";

import { authenticate } from "~/shopify.server";
import { getIntegrationDefinition } from "~/services/integrations/registry.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
	await authenticate.admin(request);
	const name = String(params.name);
	const def  = getIntegrationDefinition(name);
	if (!def) throw new Response("Integration not found", { status: 404 });
	return { def };
}

export default function IntegrationLayout() {
	const { def } = useLoaderData<typeof loader>();
	const { t } = useTranslation();

	const tabs = [
		{ to: `/app/integrations/${def.name}`,           label: t("integrationDetail.tabSettings"), end: true  },
		{ to: `/app/integrations/${def.name}/sync-logs`, label: t("integrationDetail.tabSyncLogs"), end: false },
		...(def.subRoutes ?? []).map((sr) => ({
			to:  `/app/${sr.path}`,
			label: sr.label,
			end: false,
		})),
	];

	return (
		<div style={{ background: "#f1f3f5", minHeight: "100vh", padding: "24px" }}>

			{/* Header */}
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
				<div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
					<button
						onClick={() => (window.location.href = "/app/integrations")}
						style={{
							background: "#fff", border: "1px solid #e0e0e0", borderRadius: "8px",
							padding: "6px 12px", fontSize: "13px", cursor: "pointer", color: "#444",
							display: "flex", alignItems: "center", gap: "4px",
						}}
					>
						{t("common.back")}
					</button>
					<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
						{def.logoUrl ? (
							<img src={def.logoUrl} alt={def.displayName} style={{ width: "28px", height: "28px", objectFit: "contain", borderRadius: "6px" }} />
						) : (
							<span style={{ fontSize: "22px" }}>{def.icon}</span>
						)}
						<span style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a1a" }}>{def.displayName}</span>
					</div>
					<span style={{ fontSize: "14px", color: "#888" }}>{def.description}</span>
				</div>
			</div>

			{/* Tab bar */}
			<div style={{
				display: "flex", gap: "0",
				borderBottom: "1px solid #e0e0e0",
				marginBottom: "20px",
			}}>
				{tabs.map((tab) => (
					<NavLink
						key={tab.to}
						to={tab.to}
						end={tab.end}
						style={({ isActive }: { isActive: boolean }): React.CSSProperties => ({
							padding: "10px 18px",
							textDecoration: "none",
							fontSize: "14px",
							fontWeight: isActive ? 600 : 400,
							color: isActive ? "#1a1a1a" : "#888",
							borderBottom: isActive ? "2px solid #1a1a1a" : "2px solid transparent",
							marginBottom: "-1px",
							display: "inline-block",
						})}
					>
						{tab.label}
					</NavLink>
				))}
			</div>

			<Outlet />
		</div>
	);
}

export function ErrorBoundary() {
	return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
