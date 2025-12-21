import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  webhooks: {
    ORDERS_CREATE: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks/orders/create",
    },
    ORDERS_UPDATED: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks/orders/updated",
    },
    ORDERS_CANCELLED: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks/orders/cancelled",
    },
  },
  hooks: {
    afterAuth: async ({ session }) => {
      console.log('🔵 afterAuth hook ejecutado para:', session.shop);
      
      // Crear o buscar el registro de Shop y actualizar la sesión con shopId
      const shopDomain = session.shop;
      let shopRecord = await prisma.shop.findUnique({
        where: { domain: shopDomain }
      });

      if (!shopRecord) {
        console.log('📦 Creando nuevo Shop:', shopDomain);
        shopRecord = await prisma.shop.create({
          data: { domain: shopDomain }
        });
        console.log('✅ Shop creado con ID:', shopRecord.id);
      } else {
        console.log('✅ Shop encontrado con ID:', shopRecord.id);
      }

      // Actualizar la sesión con el shopId
      console.log('🔄 Actualizando sesión con shopId:', shopRecord.id);
      await prisma.session.update({
        where: { id: session.id },
        data: { shopId: shopRecord.id }
      });
      console.log('✅ Sesión actualizada correctamente');

      shopify.registerWebhooks({ session });
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
