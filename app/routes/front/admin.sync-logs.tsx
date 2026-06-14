import { data, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { requireAdminAuth } from "~/utils/admin-auth.server";
import db from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
	await requireAdminAuth(request);

	const url    = new URL(request.url);
	const page   = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
	const limit  = 30;
	const offset = (page - 1) * limit;
	const status = url.searchParams.get("status") || "";
	const type   = url.searchParams.get("type") || "";
	const shop   = url.searchParams.get("shop") || "";

	const where: any = {};
	if (status) where.status    = status;
	if (type)   where.syncType  = type;
	if (shop)   where.shop      = { domain: { contains: shop } };

	const [logs, total] = await Promise.all([
		db.syncLog.findMany({
			where,
			orderBy: { createdAt: "desc" },
			skip:    offset,
			take:    limit,
			include: { shop: { select: { domain: true } } },
		}),
		db.syncLog.count({ where }),
	]);

	return data({ logs, total, page, limit, filters: { status, type, shop } });
}

export default function AdminSyncLogs() {
	const { logs, total, page, limit, filters } = useLoaderData<typeof loader>();
	const totalPages = Math.ceil(total / limit);

	return (
		<div>
			<h1 style={{ marginTop: 0 }}>Sync Logs ({total})</h1>

			{/* Filters */}
			<form method="get" style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
				<FilterInput name="shop"   placeholder="Shop domain" defaultValue={filters.shop} />
				<FilterSelect name="status" defaultValue={filters.status}>
					<option value="">All statuses</option>
					<option value="SUCCESS">SUCCESS</option>
					<option value="ERROR">ERROR</option>
				</FilterSelect>
				<FilterSelect name="type" defaultValue={filters.type}>
					<option value="">All types</option>
					{["CUSTOMER","PRODUCT","DEAL","ORDER","PIPELINE","STAGE"].map((t) => (
						<option key={t} value={t}>{t}</option>
					))}
				</FilterSelect>
				<button type="submit" style={btnStyle}>Filter</button>
				<a href="/admin/sync-logs" style={{ ...btnStyle, background: "#fff", color: "#333", border: "1px solid #ccc", textDecoration: "none" }}>
					Clear
				</a>
			</form>

			<table style={tableStyle}>
				<thead>
					<tr>
						{["Shop", "Type", "Shopify ID", "Status", "ERP", "Direction", "Error", "Date"].map((h) => (
							<th key={h} style={thStyle}>{h}</th>
						))}
					</tr>
				</thead>
				<tbody>
					{logs.map((log: any) => (
						<tr key={log.id}>
							<td style={tdStyle}>{log.shop.domain}</td>
							<td style={tdStyle}>{log.syncType}</td>
							<td style={tdStyle}>{log.shopifyId}</td>
							<td style={{ ...tdStyle, color: log.status === "ERROR" ? "#dc2626" : "#16a34a", fontWeight: 600 }}>{log.status}</td>
							<td style={tdStyle}>{log.erpName ?? "—"}</td>
							<td style={tdStyle}>{log.direction}</td>
							<td style={{ ...tdStyle, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#dc2626" }}>
								{log.errorMessage || "—"}
							</td>
							<td style={tdStyle}>{new Date(log.createdAt).toLocaleString()}</td>
						</tr>
					))}
				</tbody>
			</table>

			<Pagination page={page} total={totalPages} filters={filters} />
		</div>
	);
}

function FilterInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
	return <input {...props} style={{ padding: "6px 10px", border: "1px solid #ccc", borderRadius: 4, fontSize: 13 }} />;
}
function FilterSelect({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
	return <select {...props} style={{ padding: "6px 10px", border: "1px solid #ccc", borderRadius: 4, fontSize: 13 }}>{children}</select>;
}
function Pagination({ page, total, filters }: { page: number; total: number; filters: Record<string, string> }) {
	if (total <= 1) return null;
	const params = new URLSearchParams(filters);
	return (
		<div style={{ marginTop: 16, display: "flex", gap: 8 }}>
			{Array.from({ length: total }, (_, i) => i + 1).map((p) => {
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
	);
}

const btnStyle: React.CSSProperties    = { padding: "6px 14px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 };
const tableStyle: React.CSSProperties = { borderCollapse: "collapse", width: "100%", background: "#fff", borderRadius: 8, overflow: "hidden" };
const thStyle: React.CSSProperties    = { textAlign: "left", padding: "10px 14px", background: "#f0f0f0", fontSize: 12, fontWeight: 600, color: "#555" };
const tdStyle: React.CSSProperties    = { padding: "10px 14px", fontSize: 13, borderTop: "1px solid #f0f0f0" };
