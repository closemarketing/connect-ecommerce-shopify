import type { ActionFunctionArgs } from "react-router";
import db from "~/db.server";
import logger from "~/utils/logger.server";
import { validateShopIsActive } from "~/utils/shop-validator.server";
import { dispatchOrderSync } from "~/services/integrations/dispatcher.server";
import {
	createWebhookLog,
	markWebhookAsProcessed,
	markWebhookAsError,
} from "~/services/logging/webhook-logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
	logger.info("🚀 WEBHOOK CREATE - Route hit!", { ts: new Date().toISOString() });

	let webhookLogId: number | null = null;
	let shopRecord:   any           = null;
	let rawBody                     = "";
	let payload:      any           = null;

	try {
		rawBody = await request.text();

		const shop  = request.headers.get("x-shopify-shop-domain") ?? "unknown";
		const topic = request.headers.get("x-shopify-topic")       ?? "orders/create";
		const hmac  = request.headers.get("x-shopify-hmac-sha256");

		payload = JSON.parse(rawBody);

		logger.info(`✅ Received ${topic} webhook for ${shop}`);
		logger.info(`Order #${payload.order_number} - ID: ${payload.id}`);

		const validation = await validateShopIsActive(shop, topic, payload.id?.toString(), rawBody, {
			"x-shopify-topic":       topic,
			"x-shopify-shop-domain": shop,
			"x-shopify-hmac-sha256": hmac,
		});
		if (!validation) return new Response(null, { status: 200 });

		shopRecord   = validation.shop;
		webhookLogId = validation.webhookLogId;

		// Persist order
		await db.order.upsert({
			where:  { orderId: payload.id.toString() },
			update: {
				orderNumber: payload.order_number.toString(),
				body:        rawBody,
				updatedAt:   new Date(),
			},
			create: {
				orderId:     payload.id.toString(),
				orderNumber: payload.order_number.toString(),
				shopId:      shopRecord.id,
				body:        rawBody,
			},
		});
		logger.info(`✅ Order ${payload.order_number} saved to database`);

		// Dispatch to all active integrations
		const results = await dispatchOrderSync(shop, shopRecord.id, payload);

		if (webhookLogId) {
			if (results.length === 0) {
				await markWebhookAsProcessed(webhookLogId);
			} else {
				const errors = results.filter((r) => !r.result.success);
				if (errors.length === results.length) {
					await markWebhookAsError(
						webhookLogId,
						errors.map((e) => `[${e.integration}] ${e.result.error}`).join(" | "),
					);
				} else {
					await markWebhookAsProcessed(webhookLogId);
				}
			}
		}

		return new Response(null, { status: 200 });
	} catch (error) {
		logger.error("❌ ERROR in webhook CREATE:", error);

		if (webhookLogId) {
			await markWebhookAsError(
				webhookLogId,
				error instanceof Error ? error.message : "Unknown error",
			);
		} else if (shopRecord) {
			try {
				await createWebhookLog({
					shopId:    shopRecord.id,
					topic:     request.headers.get("x-shopify-topic") ?? "orders/create",
					shopifyId: payload?.id?.toString() ?? "unknown",
					headers: {
						"x-shopify-topic":       request.headers.get("x-shopify-topic"),
						"x-shopify-shop-domain": request.headers.get("x-shopify-shop-domain"),
						"x-shopify-hmac-sha256": request.headers.get("x-shopify-hmac-sha256"),
					},
					payload:      rawBody || "{}",
					hmacValid:    true,
					processed:    true,
					errorMessage: error instanceof Error ? error.message : "Unknown error",
				});
			} catch (logError) {
				logger.error("❌ Could not create webhook error log:", logError);
			}
		}

		return new Response(null, { status: 500 });
	}
};
