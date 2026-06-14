import { redirect, data, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import db from "~/db.server";
import { comparePassword, createAdminJWT, setAdminTokenCookie, verifyAdminJWT } from "~/utils/admin-auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
	// If already authenticated, redirect to dashboard
	const cookieHeader = request.headers.get("Cookie") ?? "";
	const tokenMatch   = cookieHeader.match(/admin_token=([^;]+)/);
	if (tokenMatch) {
		try {
			await verifyAdminJWT(decodeURIComponent(tokenMatch[1]));
			throw redirect("/admin/dashboard");
		} catch (err) {
			// Invalid token — show login page
			if ((err as any)?.status === 302) throw err;
		}
	}
	return data({ error: null });
}

export async function action({ request }: ActionFunctionArgs) {
	const form     = await request.formData();
	const email    = (form.get("email") as string | null)?.trim().toLowerCase();
	const password = form.get("password") as string | null;

	if (!email || !password) {
		return data({ error: "Email and password are required." }, { status: 400 });
	}

	const user = await db.adminUser.findUnique({ where: { email } });

	if (!user || !(await comparePassword(password, user.passwordHash))) {
		return data({ error: "Invalid email or password." }, { status: 401 });
	}

	const token  = await createAdminJWT(user.id, user.email);
	const cookie = setAdminTokenCookie(token);

	throw redirect("/admin/dashboard", {
		headers: { "Set-Cookie": cookie },
	});
}

export default function AdminLogin() {
	return (
		<div style={{
			display: "flex", alignItems: "center", justifyContent: "center",
			minHeight: "100vh", background: "#f0f2f5",
		}}>
			<div style={{
				background: "#fff", borderRadius: 8, padding: "40px 48px",
				boxShadow: "0 2px 16px rgba(0,0,0,0.1)", width: 360,
			}}>
				<h1 style={{ marginTop: 0, marginBottom: 8, fontSize: 24 }}>Admin Login</h1>
				<p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>
					Connect ERP internal panel
				</p>

				<form method="post">
					<label style={labelStyle}>
						Email
						<input type="email" name="email" required style={inputStyle} autoComplete="email" />
					</label>
					<label style={labelStyle}>
						Password
						<input type="password" name="password" required style={inputStyle} autoComplete="current-password" />
					</label>
					<button type="submit" style={btnStyle}>Sign in</button>
				</form>
			</div>
		</div>
	);
}

const labelStyle: React.CSSProperties = {
	display: "flex", flexDirection: "column", gap: 4,
	fontSize: 13, color: "#444", marginBottom: 16,
};
const inputStyle: React.CSSProperties = {
	padding: "8px 10px", border: "1px solid #ccc", borderRadius: 4,
	fontSize: 14, outline: "none",
};
const btnStyle: React.CSSProperties = {
	width: "100%", padding: "10px", background: "#1a1a2e", color: "#fff",
	border: "none", borderRadius: 4, fontSize: 15, cursor: "pointer", marginTop: 8,
};
