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
	logger.info("🚀 WEBHOOK UPDATED - Route hit!", { ts: new Date().toISOString() });

	let webhookLogId: number | null = null;
	let shopRecord:   any           = null;
	let rawBody                     = "";
	let payload:      any           = null;

	try {
		rawBody = await request.text();

		const shop  = request.headers.get("x-shopify-shop-domain") ?? "unknown";
		const topic = request.headers.get("x-shopify-topic")       ?? "orders/updated";
		const hmac  = request.headers.get("x-shopify-hmac-sha256");

		payload = JSON.parse(rawBody);

		logger.info(`🔄 Received ${topic} webhook for ${shop}`);
		logger.info(`Order #${payload.order_number} - ID: ${payload.id} updated`);

		const validation = await validateShopIsActive(shop, topic, payload.id?.toString(), rawBody, {
			"x-shopify-topic":       topic,
			"x-shopify-shop-domain": shop,
			"x-shopify-hmac-sha256": hmac,
		});
		if (!validation) return new Response(null, { status: 200 });

		shopRecord   = validation.shop;
		webhookLogId = validation.webhookLogId;

		// Skip if there's no previous successful sync for any integration —
		// this update most likely arrived before the create webhook finished.
		const prior = await db.syncLog.findFirst({
			where: {
				shopId:    shopRecord.id,
				syncType:  "ORDER",
				shopifyId: payload.id.toString(),
				status:    "SUCCESS",
			},
		});

		if (!prior) {
			logger.info(`⏭️  Order ${payload.order_number} has no previous successful sync - skipping`);
			if (webhookLogId) await markWebhookAsProcessed(webhookLogId);
			return new Response(null, { status: 200 });
		}

		// Persist updated order
		await db.order.upsert({
			where:  { orderId: payload.id.toString() },
			update: { body: rawBody },
			create: {
				orderId:     payload.id.toString(),
				orderNumber: payload.order_number.toString(),
				shopId:      shopRecord.id,
				body:        rawBody,
			},
		});
		logger.info(`✅ Order ${payload.order_number} updated in database`);

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
		logger.error("❌ ERROR in webhook UPDATED:", error);

		if (webhookLogId) {
			await markWebhookAsError(
				webhookLogId,
				error instanceof Error ? error.message : String(error),
			);
		} else if (shopRecord) {
			try {
				await createWebhookLog({
					shopId:    shopRecord.id,
					topic:     request.headers.get("x-shopify-topic") ?? "orders/updated",
					shopifyId: payload?.id?.toString() ?? "unknown",
					headers: {
						"x-shopify-topic":       request.headers.get("x-shopify-topic"),
						"x-shopify-shop-domain": request.headers.get("x-shopify-shop-domain"),
						"x-shopify-hmac-sha256": request.headers.get("x-shopify-hmac-sha256"),
					},
					payload:      rawBody || "{}",
					hmacValid:    true,
					processed:    true,
					errorMessage: error instanceof Error ? error.message : String(error),
				});
			} catch (logError) {
				logger.error("❌ Could not create webhook error log:", logError);
			}
		}

		return new Response(null, { status: 500 });
	}
};
