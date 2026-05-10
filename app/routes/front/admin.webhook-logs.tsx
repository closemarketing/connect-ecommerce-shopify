import { data, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { requireAdminAuth } from "~/utils/admin-auth.server";
import db from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
	await requireAdminAuth(request);

	const url        = new URL(request.url);
	const page       = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
	const limit      = 30;
	const offset     = (page - 1) * limit;
	const topic      = url.searchParams.get("topic") || "";
	const shop       = url.searchParams.get("shop") || "";
	const processed  = url.searchParams.get("processed") || "";

	const where: any = {};
	if (topic)     where.topic     = { contains: topic };
	if (shop)      where.shop      = { domain: { contains: shop } };
	if (processed === "true")  where.processed = true;
	if (processed === "false") where.processed = false;

	const [logs, total] = await Promise.all([
		db.webhookLog.findMany({
			where,
			orderBy: { createdAt: "desc" },
			skip:    offset,
			take:    limit,
			include: { shop: { select: { domain: true } } },
		}),
		db.webhookLog.count({ where }),
	]);

	return data({ logs, total, page, limit, filters: { topic, shop, processed } });
}

export default function AdminWebhookLogs() {
	const { logs, total, page, limit, filters } = useLoaderData<typeof loader>();
	const totalPages = Math.ceil(total / limit);

	return (
		<div>
			<h1 style={{ marginTop: 0 }}>Webhook Logs ({total})</h1>

			{/* Filters */}
			<form method="get" style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
				<input name="shop"  placeholder="Shop domain" defaultValue={filters.shop}  style={inputStyle} />
				<input name="topic" placeholder="Topic (e.g. orders/create)" defaultValue={filters.topic} style={inputStyle} />
				<select name="processed" defaultValue={filters.processed} style={inputStyle}>
					<option value="">All</option>
					<option value="true">Processed</option>
					<option value="false">Not processed</option>
				</select>
				<button type="submit" style={btnStyle}>Filter</button>
				<a href="/admin/webhook-logs" style={{ ...btnStyle, background: "#fff", color: "#333", border: "1px solid #ccc", textDecoration: "none" }}>
					Clear
				</a>
			</form>

			<table style={tableStyle}>
				<thead>
					<tr>
						{["Shop", "Topic", "Shopify ID", "HMAC", "Processed", "Error", "Date"].map((h) => (
							<th key={h} style={thStyle}>{h}</th>
						))}
					</tr>
				</thead>
				<tbody>
					{logs.map((log: any) => (
						<tr key={log.id}>
							<td style={tdStyle}>{log.shop.domain}</td>
							<td style={tdStyle}><code style={{ fontSize: 12 }}>{log.topic}</code></td>
							<td style={tdStyle}>{log.shopifyId ?? "—"}</td>
							<td style={{ ...tdStyle, color: log.hmacValid === false ? "#dc2626" : "#16a34a" }}>
								{log.hmacValid === null ? "—" : log.hmacValid ? "✓" : "✗"}
							</td>
							<td style={{ ...tdStyle, color: log.processed ? "#16a34a" : "#f59e0b", fontWeight: 600 }}>
								{log.processed ? "Yes" : "No"}
							</td>
							<td style={{ ...tdStyle, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#dc2626" }}>
								{log.errorMessage || "—"}
							</td>
							<td style={tdStyle}>{new Date(log.createdAt).toLocaleString()}</td>
						</tr>
					))}
				</tbody>
			</table>

			{totalPages > 1 && (
				<div style={{ marginTop: 16, display: "flex", gap: 8 }}>
					{Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
						const params = new URLSearchParams(filters);
						params.set("page", String(p));
						return (
							<a key={p} href={`?${params.toString()}`} style={{
								padding: "4px 10px", borderRadius: 4, textDecoration: "none",
								background: p === page ? "#1a1a2e" : "#fff",
								color: p === page ? "#fff" : "#333",
								border: "1px solid #ddd", fontSize: 13,
							}}>{p}</a>
						);
					})}
				</div>
			)}
		</div>
	);
}

const inputStyle: React.CSSProperties = { padding: "6px 10px", border: "1px solid #ccc", borderRadius: 4, fontSize: 13 };
const btnStyle: React.CSSProperties   = { padding: "6px 14px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 };
const tableStyle: React.CSSProperties = { borderCollapse: "collapse", width: "100%", background: "#fff", borderRadius: 8, overflow: "hidden" };
const thStyle: React.CSSProperties    = { textAlign: "left", padding: "10px 14px", background: "#f0f0f0", fontSize: 12, fontWeight: 600, color: "#555" };
const tdStyle: React.CSSProperties    = { padding: "10px 14px", fontSize: 13, borderTop: "1px solid #f0f0f0" };
