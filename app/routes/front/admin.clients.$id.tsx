import { data, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { requireAdminAuth } from "~/utils/admin-auth.server";
import db from "~/db.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireAdminAuth(request);

	const id   = parseInt(params.id as string);
	if (isNaN(id)) throw new Response("Not Found", { status: 404 });

	const shop = await db.shop.findUnique({
		where:   { id },
		include: {
			sessions:    { select: { id: true, email: true, accountOwner: true, scope: true }, take: 3 },
			_count:      { select: { syncLogs: true, orders: true, webhookLogs: true } },
			syncLogs:    { orderBy: { createdAt: "desc" }, take: 20 },
			webhookLogs: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, topic: true, processed: true, createdAt: true, errorMessage: true } },
		},
	});

	if (!shop) throw new Response("Not Found", { status: 404 });

	const integrationCredentials = await db.integrationCredential.findMany({
		where:   { sessionId: { startsWith: shop.domain } },
		include: { integration: { select: { displayName: true } } },
	});

	return data({ shop, integrationCredentials });
}

export default function AdminClientDetail() {
	const { shop, integrationCredentials } = useLoaderData<typeof loader>();

	return (
		<div>
			<a href="/admin/clients" style={{ color: "#666", fontSize: 13, textDecoration: "none" }}>← Back to clients</a>
			<h1 style={{ marginTop: 8 }}>{shop.domain}</h1>

			{/* Summary */}
			<div style={{ display: "grid", gridTemplateColumns: "repeat(3, auto)", gap: 16, marginBottom: 32 }}>
				<InfoCard label="Active"       value={shop.active ? "Yes" : "No"} />
				<InfoCard label="Sync Logs"    value={shop._count.syncLogs} />
				<InfoCard label="Webhook Logs" value={shop._count.webhookLogs} />
			</div>

			{/* Integration credentials */}
			<Section title="Integrations">
				{integrationCredentials.length === 0 ? (
					<p style={{ color: "#888" }}>No integration credentials configured.</p>
				) : (
					<table style={tableStyle}>
						<thead><tr>
							{["Integration", "Key", "Value"].map((h) => <th key={h} style={thStyle}>{h}</th>)}
						</tr></thead>
						<tbody>
							{integrationCredentials.map((cred: any) => (
								<tr key={cred.id}>
									<td style={tdStyle}>{cred.integration.displayName}</td>
									<td style={tdStyle}>{cred.key}</td>
									<td style={tdStyle}><code style={{ fontSize: 12 }}>{maskSecret(cred.key, cred.value)}</code></td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</Section>

			{/* Sync logs */}
			<Section title="Recent Sync Logs (last 20)">
				<table style={tableStyle}>
					<thead><tr>
						{["Type", "Shopify ID", "Status", "ERP", "Direction", "Error", "Date"].map((h) => <th key={h} style={thStyle}>{h}</th>)}
					</tr></thead>
					<tbody>
						{shop.syncLogs.map((log: any) => (
							<tr key={log.id}>
								<td style={tdStyle}>{log.syncType}</td>
								<td style={tdStyle}>{log.shopifyId}</td>
								<td style={{ ...tdStyle, color: log.status === "ERROR" ? "#dc2626" : "#16a34a", fontWeight: 600 }}>{log.status}</td>
								<td style={tdStyle}>{log.erpName ?? "clientify"}</td>
								<td style={tdStyle}>{log.direction}</td>
								<td style={{ ...tdStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#dc2626" }}>
									{log.errorMessage || "—"}
								</td>
								<td style={tdStyle}>{new Date(log.createdAt).toLocaleString()}</td>
							</tr>
						))}
					</tbody>
				</table>
			</Section>
		</div>
	);
}

function maskSecret(key: string, value: string): string {
	const secretKeys = ["apikey", "api_key", "token", "secret", "password"];
	if (secretKeys.some((k) => key.toLowerCase().includes(k))) {
		return value.length <= 8 ? "••••••••" : `${value.substring(0, 4)}${"•".repeat(Math.min(value.length - 8, 16))}${value.slice(-4)}`;
	}
	return value;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div style={{ marginBottom: 32 }}>
			<h2 style={{ fontSize: 16, marginBottom: 12 }}>{title}</h2>
			{children}
		</div>
	);
}

function InfoCard({ label, value }: { label: string; value: string | number }) {
	return (
		<div style={{ background: "#fff", padding: "16px 20px", borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
			<div style={{ fontSize: 12, color: "#888" }}>{label}</div>
			<div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{value}</div>
		</div>
	);
}

const tableStyle: React.CSSProperties = { borderCollapse: "collapse", width: "100%", background: "#fff", borderRadius: 8, overflow: "hidden" };
const thStyle: React.CSSProperties    = { textAlign: "left", padding: "10px 14px", background: "#f0f0f0", fontSize: 12, fontWeight: 600, color: "#555" };
const tdStyle: React.CSSProperties    = { padding: "10px 14px", fontSize: 13, borderTop: "1px solid #f0f0f0" };
