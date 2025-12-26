import crypto from "crypto";

export function validateWebhookHmac(
  body: string,
  hmacHeader: string | null
): boolean {
  if (!hmacHeader) {
    console.error("❌ No HMAC header found");
    return false;
  }

  // IMPORTANTE: Shopify CLI sobrescribe SHOPIFY_API_SECRET con el App Proxy Secret
  // Usamos SHOPIFY_CLIENT_SECRET que contiene el Client Secret correcto (64 hex chars)
  const secret = process.env.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    console.error("❌ SHOPIFY_CLIENT_SECRET not configured");
    return false;
  }

  // Calcular HMAC según documentación oficial de Shopify
  const calculatedHmacDigest = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64");

  // Usar timingSafeEqual para prevenir ataques de timing
  // Los buffers deben ser del mismo tamaño, por eso convertimos ambos strings base64 a Buffer
  try {
    const calculatedBuffer = Buffer.from(calculatedHmacDigest);
    const receivedBuffer = Buffer.from(hmacHeader);
    
    // timingSafeEqual requiere buffers del mismo tamaño
    if (calculatedBuffer.length !== receivedBuffer.length) {
      console.error("❌ HMAC validation failed: Different lengths");
      console.error("Expected:", calculatedHmacDigest);
      console.error("Received:", hmacHeader);
      return false;
    }
    
    const isValid = crypto.timingSafeEqual(calculatedBuffer, receivedBuffer);
    
    if (!isValid) {
      console.error("❌ HMAC validation failed");
      console.error("Expected:", calculatedHmacDigest);
      console.error("Received:", hmacHeader);
    }
    
    return isValid;
  } catch (error) {
    console.error("❌ HMAC validation error:", error);
    return false;
  }
}
