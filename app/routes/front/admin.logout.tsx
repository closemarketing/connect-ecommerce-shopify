import { redirect, type ActionFunctionArgs } from "react-router";
import { clearAdminTokenCookie } from "~/utils/admin-auth.server";

export async function action(_: ActionFunctionArgs) {
	throw redirect("/admin/login", {
		headers: { "Set-Cookie": clearAdminTokenCookie() },
	});
}

// GET fallback — if someone navigates directly to /admin/logout
export async function loader() {
	throw redirect("/admin/login", {
		headers: { "Set-Cookie": clearAdminTokenCookie() },
	});
}
