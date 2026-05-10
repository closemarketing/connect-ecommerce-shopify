import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useSearchParams, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { getIntegrationByName } from "~/models/Integration.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
	const { session } = await authenticate.admin(request);
	const name        = String(params.name);

	const url       = new URL(request.url);
	const page      = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
	const limit     = 50;
	const skip      = (page - 1) * limit;
	const syncType  = url.searchParams.get("type")   ?? "all";
	const status    = url.searchParams.get("status") ?? "all";
	const search    = url.searchParams.get("search") ?? "";

	// Obtener el shop de la BD
	let shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
	if (!shop) {
		shop = await prisma.shop.create({ data: { domain: session.shop } });
	}

	// Obtener la integración para filtrar por FK
	const integration = await getIntegrationByName(name);

	const where: any = { shopId: shop.id };
	if (integration)           where.integrationId = integration.id;
	else                       where.erpName       = name;   // fallback por nombre
	if (syncType !== "all")    where.syncType      = syncType;
	if (status   !== "all")    where.status        = status;
	if (search) {
		where.OR = [
			{ shopifyId:      { contains: search } },
			{ parentOrderId:  { contains: search } },
		];
	}

	const [logs, total] = await Promise.all([
		prisma.syncLog.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip }),
		prisma.syncLog.count({ where }),
	]);

	return { logs, total, page, limit, integrationName: name, filters: { syncType, status, search } };
}

export default function IntegrationSyncLogs() {
	const { logs, total, page, limit, integrationName, filters } = useLoaderData<typeof loader>();
	const [, setSearchParams] = useSearchParams();
	const totalPages = Math.ceil(total / limit);

	function applyFilter(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const fd = new FormData(e.currentTarget);
		const params: Record<string, string> = {};
		for (const [k, v] of fd.entries()) {
			if (v) params[k] = String(v);
		}
		params.page = "1";
		setSearchParams(params);
	}

	return (
		<s-block-stack gap="400" style={{ padding: "16px" }}>
			{/* Filter bar */}
			<s-card>
				<form onSubmit={applyFilter} style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
					<s-select
						name="status"
						label="Estado"
						value={filters.status}
					>
						<option value="all">Todos</option>
						<option value="SUCCESS">SUCCESS</option>
						<option value="ERROR">ERROR</option>
					</s-select>

					<s-select
						name="type"
						label="Tipo"
						value={filters.syncType}
					>
						<option value="all">Todos</option>
						{["CUSTOMER", "PRODUCT", "DEAL", "ORDER", "PIPELINE", "STAGE"].map((t) => (
							<option key={t} value={t}>{t}</option>
						))}
					</s-select>

					<s-text-field
						name="search"
						label="Buscar"
						placeholder="Shopify ID o Order ID"
						value={filters.search}
					></s-text-field>

					<s-button type="submit" variant="primary">Filtrar</s-button>
					<s-button
						type="button"
						onClick={() => setSearchParams({ page: "1" })}
					>
						Limpiar
					</s-button>
				</form>
			</s-card>

			{/* Totals */}
			<s-text variant="bodySm">
				{total} registro{total !== 1 ? "s" : ""} — página {page} de {totalPages || 1}
			</s-text>

			{/* Logs table */}
			<s-card padding="0">
				{logs.length === 0 ? (
					<s-block-stack gap="200" style={{ padding: "24px", textAlign: "center" }}>
						<s-text>No hay registros para {integrationName}.</s-text>
					</s-block-stack>
				) : (
					<div style={{ overflowX: "auto" }}>
						<table style={tableStyle}>
							<thead>
								<tr>
									{["Tipo", "Shopify ID", "Estado", "Dirección", "ERP ID", "Error", "Fecha"].map((h) => (
										<th key={h} style={thStyle}>{h}</th>
									))}
								</tr>
							</thead>
							<tbody>
								{logs.map((log: any) => (
									<tr key={log.id}>
										<td style={tdStyle}>{log.syncType}</td>
										<td style={tdStyle}>{log.shopifyId ?? "—"}</td>
										<td style={{
											...tdStyle,
											fontWeight: 600,
											color: log.status === "ERROR" ? "#dc2626" : "#16a34a",
										}}>
											{log.status}
										</td>
										<td style={tdStyle}>{log.direction ?? "—"}</td>
										<td style={tdStyle}>{log.erpId ?? "—"}</td>
										<td style={{ ...tdStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#dc2626" }}>
											{log.errorMessage || "—"}
										</td>
										<td style={tdStyle}>{new Date(log.createdAt).toLocaleString("es-ES")}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</s-card>

			{/* Pagination */}
			{totalPages > 1 && (
				<s-inline-stack gap="200">
					{Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
						<s-button
							key={p}
							variant={p === page ? "primary" : undefined}
							size="slim"
							onClick={() => setSearchParams({ ...filters, page: String(p) })}
						>
							{String(p)}
						</s-button>
					))}
				</s-inline-stack>
			)}
		</s-block-stack>
	);
}

export function ErrorBoundary() {
	return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);

/* Styles */
import type React from "react";
const tableStyle: React.CSSProperties = { borderCollapse: "collapse", width: "100%" };
const thStyle: React.CSSProperties   = { textAlign: "left", padding: "10px 14px", background: "#f6f6f7", fontSize: 12, fontWeight: 600, color: "#555", borderBottom: "1px solid #e1e3e5" };
const tdStyle: React.CSSProperties   = { padding: "10px 14px", fontSize: 13, borderTop: "1px solid #f0f0f0" };
