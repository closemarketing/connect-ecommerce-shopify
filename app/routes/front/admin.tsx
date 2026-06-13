import { redirect, Outlet, type LoaderFunctionArgs } from "react-router";
import { requireAdminAuth } from "~/utils/admin-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url);
	// Skip JWT check for login/logout routes
	if (!url.pathname.startsWith("/admin/login") && url.pathname !== "/admin/logout") {
		await requireAdminAuth(request);
	}
	return null;
}

export default function AdminLayout() {
	return (
		<div style={{ display: "flex", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
			{/* Sidebar */}
			<nav style={{
				width: 220, background: "#1a1a2e", color: "#eee",
				padding: "24px 0", display: "flex", flexDirection: "column",
			}}>
				<div style={{ padding: "0 20px 24px", fontSize: 18, fontWeight: 700, borderBottom: "1px solid #333" }}>
					Connect ERP Admin
				</div>
				<NavLink href="/admin/dashboard" label="Dashboard" />
				<NavLink href="/admin/clients"   label="Clients" />
				<NavLink href="/admin/sync-logs" label="Sync Logs" />
				<NavLink href="/admin/webhook-logs" label="Webhook Logs" />
				<div style={{ marginTop: "auto", padding: "20px" }}>
					<form method="post" action="/admin/logout">
						<button type="submit" style={{
							background: "transparent", border: "1px solid #555", color: "#aaa",
							padding: "6px 12px", borderRadius: 4, cursor: "pointer", width: "100%",
						}}>
							Log out
						</button>
					</form>
				</div>
			</nav>

			{/* Main content */}
			<main style={{ flex: 1, background: "#f5f5f5", padding: 32, overflowY: "auto" }}>
				<Outlet />
			</main>
		</div>
	);
}

function NavLink({ href, label }: { href: string; label: string }) {
	return (
		<a href={href} style={{
			display: "block", padding: "10px 20px", color: "#ccc",
			textDecoration: "none", fontSize: 14,
		}}
		onMouseEnter={(e) => (e.currentTarget.style.background = "#2a2a4a")}
		onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
		>
			{label}
		</a>
	);
}
