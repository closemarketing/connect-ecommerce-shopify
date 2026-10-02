import * as crypto from "crypto";

interface ExtensionTokenPayload {
  iss:  string;
  dest: string;
  aud:  string;
  sub:  string;
  exp:  number;
  nbf:  number;
  iat:  number;
  jti:  string;
  sid:  string;
}

function base64UrlDecode(str: string): Buffer {
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function verifyExtensionToken(
  token:     string,
  apiSecret: string,
): { ok: true; shop: string; payload: ExtensionTokenPayload } | { ok: false; error: string } {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false, error: "Malformed JWT" };

    const [headerB64, payloadB64, sigB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;

    const expectedSig = crypto
      .createHmac("sha256", apiSecret)
      .update(signingInput)
      .digest("base64url");

    if (expectedSig !== sigB64) return { ok: false, error: "Invalid JWT signature" };

    const payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8")) as ExtensionTokenPayload;

    if (Date.now() / 1000 > payload.exp) return { ok: false, error: "JWT expired" };

    // dest is the shop URL e.g. https://testclosetech.myshopify.com
    const shop = new URL(payload.dest).hostname;
    return { ok: true, shop, payload };
  } catch {
    return { ok: false, error: "JWT parse error" };
  }
}

export function getExtensionShop(request: Request): { ok: false; response: Response } | { ok: true; shop: string } {
  const authHeader = request.headers.get("Authorization") ?? "";
  const token      = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { ok: false, response: Response.json({ ok: false, error: "Missing Authorization header" }, { status: 401 }) };
  }

  const apiSecret = process.env.SHOPIFY_CLIENT_SECRET ?? process.env.SHOPIFY_API_SECRET ?? "";
  const result    = verifyExtensionToken(token, apiSecret);

  if (!result.ok) {
    return { ok: false, response: Response.json({ ok: false, error: result.error }, { status: 401 }) };
  }

  return { ok: true, shop: result.shop };
}
