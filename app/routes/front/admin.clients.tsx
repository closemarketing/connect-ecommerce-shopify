import { data, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { requireAdminAuth } from "~/utils/admin-auth.server";
import db from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
	await requireAdminAuth(request);

	const url    = new URL(request.url);
	const page   = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
	const limit  = 20;
	const offset = (page - 1) * limit;

	const [shops, total] = await Promise.all([
		db.shop.findMany({
			orderBy: { createdAt: "desc" },
			skip:    offset,
			take:    limit,
			include: {
				_count: { select: { syncLogs: true, orders: true } },
			},
		}),
		db.shop.count(),
	]);

	return data({ shops, total, page, limit });
}

export default function AdminClients() {
	const { shops, total, page, limit } = useLoaderData<typeof loader>();
	const totalPages = Math.ceil(total / limit);

	return (
		<div>
			<h1 style={{ marginTop: 0 }}>Clients ({total})</h1>

			<table style={tableStyle}>
				<thead>
					<tr>
						{["ID", "Domain", "Active", "Orders", "Sync Logs", "Since", ""].map((h) => (
							<th key={h} style={thStyle}>{h}</th>
						))}
					</tr>
				</thead>
				<tbody>
					{shops.map((shop: any) => (
						<tr key={shop.id}>
							<td style={tdStyle}>{shop.id}</td>
							<td style={tdStyle}><strong>{shop.domain}</strong></td>
							<td style={tdStyle}>
								<span style={{ color: shop.active ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
									{shop.active ? "Yes" : "No"}
								</span>
							</td>
							<td style={tdStyle}>{shop._count.orders}</td>
							<td style={tdStyle}>{shop._count.syncLogs}</td>
							<td style={tdStyle}>{new Date(shop.createdAt).toLocaleDateString()}</td>
							<td style={tdStyle}>
								<a href={`/admin/clients/${shop.id}`} style={{ color: "#1a1a2e", textDecoration: "underline", fontSize: 13 }}>
									View
								</a>
							</td>
						</tr>
					))}
				</tbody>
			</table>

			{/* Pagination */}
			{totalPages > 1 && (
				<div style={{ marginTop: 16, display: "flex", gap: 8 }}>
					{Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
						<a key={p} href={`?page=${p}`} style={{
							padding: "4px 10px", borderRadius: 4, textDecoration: "none",
							background: p === page ? "#1a1a2e" : "#fff",
							color: p === page ? "#fff" : "#333",
							border: "1px solid #ddd", fontSize: 13,
						}}>
							{p}
						</a>
					))}
				</div>
			)}
		</div>
	);
}

const tableStyle: React.CSSProperties = { borderCollapse: "collapse", width: "100%", background: "#fff", borderRadius: 8, overflow: "hidden" };
const thStyle: React.CSSProperties    = { textAlign: "left", padding: "10px 14px", background: "#f0f0f0", fontSize: 12, fontWeight: 600, color: "#555" };
const tdStyle: React.CSSProperties    = { padding: "10px 14px", fontSize: 13, borderTop: "1px solid #f0f0f0" };
