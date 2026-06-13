import { data, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { requireAdminAuth } from "~/utils/admin-auth.server";
import db from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
	await requireAdminAuth(request);

	const now     = new Date();
	const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

	const [
		totalShops,
		activeShops,
		syncsLast24h,
		errorsLast24h,
		recentFailedSyncs,
	] = await Promise.all([
		db.shop.count(),
		db.shop.count({ where: { active: true } }),
		db.syncLog.count({ where: { createdAt: { gte: since24h } } }),
		db.syncLog.count({ where: { status: "ERROR", createdAt: { gte: since24h } } }),
		db.syncLog.findMany({
			where:   { status: "ERROR" },
			orderBy: { createdAt: "desc" },
			take:    10,
			include: { shop: { select: { domain: true } } },
		}),
	]);

	return data({ totalShops, activeShops, syncsLast24h, errorsLast24h, recentFailedSyncs });
}

export default function AdminDashboard() {
	const { totalShops, activeShops, syncsLast24h, errorsLast24h, recentFailedSyncs } = useLoaderData<typeof loader>();

	return (
		<div>
			<h1 style={{ marginTop: 0 }}>Dashboard</h1>

			{/* Stats cards */}
			<div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
				<StatCard label="Total Shops"       value={totalShops}   />
				<StatCard label="Active Shops"      value={activeShops}  color="#16a34a" />
				<StatCard label="Syncs (24h)"       value={syncsLast24h} />
				<StatCard label="Errors (24h)"      value={errorsLast24h} color={errorsLast24h > 0 ? "#dc2626" : undefined} />
			</div>

			{/* Recent failed syncs */}
			<h2 style={{ fontSize: 16, marginBottom: 12 }}>Recent Sync Errors</h2>
			{recentFailedSyncs.length === 0 ? (
				<p style={{ color: "#666" }}>No errors in the last period.</p>
			) : (
				<table style={tableStyle}>
					<thead>
						<tr>
							{["Shop", "Type", "Shopify ID", "Error", "Date"].map((h) => (
								<th key={h} style={thStyle}>{h}</th>
							))}
						</tr>
					</thead>
					<tbody>
						{recentFailedSyncs.map((log: any) => (
							<tr key={log.id}>
								<td style={tdStyle}>{log.shop.domain}</td>
								<td style={tdStyle}>{log.syncType}</td>
								<td style={tdStyle}>{log.shopifyId}</td>
								<td style={{ ...tdStyle, color: "#dc2626", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
									{log.errorMessage || "—"}
								</td>
								<td style={tdStyle}>{new Date(log.createdAt).toLocaleString()}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}

function StatCard({ label, value, color = "#1a1a2e" }: { label: string; value: number; color?: string }) {
	return (
		<div style={{
			background: "#fff", borderRadius: 8, padding: "20px 24px",
			boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
		}}>
			<div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>{label}</div>
			<div style={{ fontSize: 32, fontWeight: 700, color }}>{value}</div>
		</div>
	);
}

const tableStyle: React.CSSProperties = { borderCollapse: "collapse", width: "100%", background: "#fff", borderRadius: 8, overflow: "hidden" };
const thStyle: React.CSSProperties    = { textAlign: "left", padding: "10px 14px", background: "#f0f0f0", fontSize: 12, fontWeight: 600, color: "#555" };
const tdStyle: React.CSSProperties    = { padding: "10px 14px", fontSize: 13, borderTop: "1px solid #f0f0f0" };
