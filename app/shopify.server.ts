import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

// ── Billing plan keys — import these wherever you need to check/request ───────
export const PLAN_HOLDED = "Holded — €19/month";
export const PLAN_ODOO   = "Odoo — €29/month";

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
  billing: {
    [PLAN_HOLDED]: {
      lineItems: [
        {
          amount:       19,
          currencyCode: "EUR",
          interval:     BillingInterval.Every30Days,
        },
      ],
      trialDays: 14,
    },
    [PLAN_ODOO]: {
      lineItems: [
        {
          amount:       29,
          currencyCode: "EUR",
          interval:     BillingInterval.Every30Days,
        },
      ],
      trialDays: 14,
    },
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
      const shopDomain = session.shop;

      const shopRecord = await prisma.shop.upsert({
        where:  { domain: shopDomain },
        update: { active: true },
        create: { domain: shopDomain, active: true },
      });

      await prisma.session.update({
        where: { id: session.id },
        data:  { shopId: shopRecord.id },
      }).catch(() => null);

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
