import crypto from "crypto";

export function validateWebhookHmac(
  body: string,
  hmacHeader: string | null
): boolean {
  if (!hmacHeader) {
    console.error("❌ No HMAC header found");
    return false;
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    console.error("❌ SHOPIFY_API_SECRET not configured");
    return false;
  }

  const hash = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64");

  const isValid = hash === hmacHeader;
  
  if (!isValid) {
    console.error("❌ HMAC validation failed");
    console.error("Expected:", hash);
    console.error("Received:", hmacHeader);
  }

  return isValid;
}
