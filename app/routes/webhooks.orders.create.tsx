import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { validateWebhookHmac } from "../utils/webhook-validator.server";
import { syncShopifyOrderToClientify } from "../services/sync-order-to-clientify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("🚀 WEBHOOK CREATE - Route hit!", new Date().toISOString());
  
  // Mostrar todos los headers
  console.log("📝 Headers recibidos:");
  request.headers.forEach((value, key) => {
    console.log(`  ${key}: ${value}`);
  });
  
  try {
    // Obtener el body del webhook
    const rawBody = await request.text();
    console.log("📦 Body length:", rawBody.length);
    
    // Validar HMAC - DESHABILITADO TEMPORALMENTE PARA DESARROLLO
    const hmac = request.headers.get("x-shopify-hmac-sha256");
    console.log("🔑 HMAC recibido:", hmac);
    // if (!validateWebhookHmac(rawBody, hmac)) {
    //   console.error("❌ HMAC validation failed for orders/create");
    //   return new Response("Unauthorized", { status: 401 });
    // }
    
    const payload = JSON.parse(rawBody);
    
    // Obtener shop del header
    const shop = request.headers.get("x-shopify-shop-domain") || "unknown";
    const topic = request.headers.get("x-shopify-topic") || "orders/create";

    console.log(`✅ Received ${topic} webhook for ${shop}`);
    console.log(`Order #${payload.order_number} - ID: ${payload.id}`);

    // Buscar o crear Shop
    let shopRecord = await db.shop.findUnique({
      where: { domain: shop }
    });

    if (!shopRecord) {
      shopRecord = await db.shop.create({
        data: { domain: shop }
      });
      console.log(`📦 Created new shop record for ${shop}`);
    }

    // Guardar pedido en BD
    await db.order.create({
      data: {
        orderId: payload.id.toString(),
        orderNumber: payload.order_number.toString(),
        shopId: shopRecord.id,
        body: rawBody
      }
    });
    console.log(`✅ Order ${payload.order_number} saved to database`);

    // Obtener credenciales de Clientify para esta tienda
    const clientifyCredentials = await db.integrationCredential.findFirst({
      where: {
        sessionId: shop, // Buscar por shop domain
        integration: {
          name: "clientify"
        },
        key: "apikey"
      }
    });

    if (clientifyCredentials) {
      console.log(`🔄 Iniciando sincronización con Clientify...`);
      
      // Sincronizar con Clientify
      const syncResult = await syncShopifyOrderToClientify(
        payload,
        clientifyCredentials.value
      );

      if (syncResult.success) {
        console.log(`✅ Pedido sincronizado con Clientify exitosamente`);
        console.log(`   - Contacto ID: ${syncResult.contactId}`);
        console.log(`   - Productos IDs: ${syncResult.productIds?.join(", ")}`);
        console.log(`   - Oportunidad ID: ${syncResult.dealId}`);
      } else {
        console.error(`❌ Error sincronizando con Clientify: ${syncResult.error}`);
      }
    } else {
      console.warn(`⚠️ No se encontraron credenciales de Clientify para ${shop}. Pedido guardado pero no sincronizado.`);
    }
    
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("❌ ERROR in webhook CREATE:", error);
    console.error("Error details:", error instanceof Error ? error.message : error);
    return new Response(null, { status: 500 });
  }
};
