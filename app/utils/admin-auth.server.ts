import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import bcrypt from "bcryptjs";
import { redirect } from "react-router";

const COOKIE_NAME  = "admin_token";
const COOKIE_MAXAGE = 3600; // 1 hour
const BCRYPT_ROUNDS = 12;

function getJwtSecret(): Uint8Array {
	const secret = process.env.ADMIN_JWT_SECRET;
	if (!secret) throw new Error("ADMIN_JWT_SECRET env variable is not set.");
	return new TextEncoder().encode(secret);
}

interface AdminJWTPayload extends JWTPayload {
	userId: number;
	email:  string;
}

export async function createAdminJWT(userId: number, email: string): Promise<string> {
	return new SignJWT({ userId, email })
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime("1h")
		.sign(getJwtSecret());
}

export async function verifyAdminJWT(token: string): Promise<AdminJWTPayload> {
	const { payload } = await jwtVerify(token, getJwtSecret());
	return payload as AdminJWTPayload;
}

/** Reads the admin cookie and verifies the JWT. Throws redirect to /admin/login on failure. */
export async function requireAdminAuth(request: Request): Promise<AdminJWTPayload> {
	const url = new URL(request.url);
	if (url.pathname.startsWith("/admin/login")) {
		// Skip auth check on the login page itself
		throw new Error("requireAdminAuth should not be called on login route");
	}

	const token = getAdminTokenFromCookie(request);
	if (!token) throw redirect("/admin/login");

	try {
		return await verifyAdminJWT(token);
	} catch {
		throw redirect("/admin/login");
	}
}

function getAdminTokenFromCookie(request: Request): string | null {
	const cookieHeader = request.headers.get("Cookie") ?? "";
	const pairs        = cookieHeader.split(";").map((s) => s.trim());
	for (const pair of pairs) {
		const eqIdx = pair.indexOf("=");
		if (eqIdx === -1) continue;
		const name = pair.substring(0, eqIdx).trim();
		if (name === COOKIE_NAME) return decodeURIComponent(pair.substring(eqIdx + 1));
	}
	return null;
}

export function setAdminTokenCookie(token: string): string {
	const isProduction = process.env.NODE_ENV === "production";
	const flags = [
		`${COOKIE_NAME}=${encodeURIComponent(token)}`,
		"HttpOnly",
		"SameSite=Strict",
		`Max-Age=${COOKIE_MAXAGE}`,
		"Path=/admin",
		...(isProduction ? ["Secure"] : []),
	];
	return flags.join("; ");
}

export function clearAdminTokenCookie(): string {
	return `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/admin`;
}

export async function hashPassword(plain: string): Promise<string> {
	return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
	return bcrypt.compare(plain, hash);
}
