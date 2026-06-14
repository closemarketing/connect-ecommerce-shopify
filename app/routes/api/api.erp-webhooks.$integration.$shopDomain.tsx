import { type ActionFunctionArgs } from "react-router";
import db from "~/db.server";
import logger from "~/utils/logger.server";
import { buildControllerForShop } from "~/services/integrations/dispatcher.server";

/**
 * Inbound ERP webhook receiver.
 * URL pattern: /api/erp-webhooks/:integration/:shopDomain
 *
 * Example: POST /api/erp-webhooks/holded/mystore.myshopify.com
 *
 * The integration name is resolved against the controller factory registry
 * declared in services/integrations/dispatcher.server.ts.
 */
export async function action({ request, params }: ActionFunctionArgs) {
	const { integration, shopDomain } = params as { integration: string; shopDomain: string };

	const shop = await db.shop.findUnique({ where: { domain: shopDomain } });
	if (!shop) {
		logger.warn(`ERP webhook: shop not found "${shopDomain}"`);
		return new Response("Shop not found", { status: 404 });
	}

	const rawBody = await request.text();
	let payload: unknown;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		return new Response("Invalid JSON", { status: 400 });
	}

	const controller = await buildControllerForShop(shopDomain, integration);
	if (!controller) {
		logger.warn(`ERP webhook: no controller or credentials for "${integration}" on "${shopDomain}"`);
		return new Response("Not configured", { status: 422 });
	}

	const event = request.headers.get("X-ERP-Event") ?? request.headers.get("X-Event-Type") ?? "unknown";

	const { default: shopify } = await import("~/shopify.server");
	const { admin } = await shopify.unauthenticated.admin(shopDomain);

	logger.info(`📥 ERP webhook: integration=${integration}, shop=${shopDomain}, event=${event}`);

	const result = await controller.processWebhook(payload, event, admin.graphql, shop.id);

	if (!result.success) {
		logger.error(`ERP webhook handler error: ${result.error}`);
		return new Response(JSON.stringify({ ok: false, error: result.error }), {
			status: 422,
			headers: { "Content-Type": "application/json" },
		});
	}

	logger.info(`✅ ERP webhook processed: integration=${integration}, erpId=${result.erpId}`);
	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

// Disallow GET access
export async function loader() {
	return new Response("Method Not Allowed", { status: 405 });
}
