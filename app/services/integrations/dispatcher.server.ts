import type { ERPController, SyncResult } from "../erp/erp-controller.interface";
import { ClientifyController } from "../erp/clientify/clientify.controller";
import { HoldedController } from "../erp/holded/holded.controller";
import db from "../../db.server";
import logger from "../../utils/logger.server";
import {
	logOrderSync,
	logSyncError,
} from "../logging/sync-logger.server";

/**
 * Maps integration name → factory that builds a controller from a credentials object.
 *
 * To register a new integration:
 *   1. Add a row to INTEGRATION_REGISTRY (registry.server.ts).
 *   2. Implement an ERPController under app/services/erp/<name>/.
 *   3. Add the name → factory entry below.
 *   4. Add the integration to prisma/seed.js.
 */
const CONTROLLER_FACTORIES: Record<string, (creds: Record<string, string>) => ERPController> = {
	clientify: (creds) => new ClientifyController(creds.apikey ?? ""),
	holded: (creds) => {
		const docType     = (creds.holded_doc_type ?? "smart") as any;
		const serialNum   = creds.holded_serial || undefined;
		const autoApprove = creds.holded_auto_approve === "true";
		return new HoldedController(creds.apikey ?? "", { docType, serialNum, autoApprove });
	},
};

export function getControllerFactory(name: string) {
	return CONTROLLER_FACTORIES[name];
}

/**
 * Build a controller for a given shop + integration on demand.
 * Returns null if the integration is unknown or has no credentials.
 */
export async function buildControllerForShop(
	shopDomain: string,
	integrationName: string,
): Promise<ERPController | null> {
	const factory = CONTROLLER_FACTORIES[integrationName];
	if (!factory) return null;

	const credRows = await db.integrationCredential.findMany({
		where:   { sessionId: shopDomain, integration: { name: integrationName } },
	});
	if (credRows.length === 0) return null;

	const creds = Object.fromEntries(credRows.map((r) => [r.key, r.value]));
	return factory(creds);
}

export interface ActiveIntegration {
	name:          string;
	displayName:   string;
	integrationId: number;
	controller:    ERPController;
}

/**
 * Returns instantiated controllers for every active integration on a shop
 * that has credentials configured. Inactive or mis-configured ones are skipped.
 */
export async function getActiveControllersForShop(shopDomain: string): Promise<ActiveIntegration[]> {
	const shop = await db.shop.findUnique({ where: { domain: shopDomain } });
	if (!shop) return [];

	const links = await db.shopIntegration.findMany({
		where:   { shopId: shop.id, active: true },
		include: { integration: true },
	});

	const result: ActiveIntegration[] = [];

	for (const link of links) {
		const factory = CONTROLLER_FACTORIES[link.integration.name];
		if (!factory) {
			logger.warn(`Active integration "${link.integration.name}" has no controller factory registered`);
			continue;
		}

		const credRows = await db.integrationCredential.findMany({
			where: { sessionId: shopDomain, integrationId: link.integrationId },
		});

		if (credRows.length === 0) {
			logger.warn(`Active integration "${link.integration.name}" has no credentials for shop "${shopDomain}"`);
			continue;
		}

		const creds = Object.fromEntries(credRows.map((r) => [r.key, r.value]));
		result.push({
			name:          link.integration.name,
			displayName:   link.integration.displayName,
			integrationId: link.integrationId,
			controller:    factory(creds),
		});
	}

	return result;
}

export interface OrderDispatchResult {
	integration: string;
	result:      SyncResult;
}

/**
 * Runs `syncOrderToERP` against every active integration for a shop,
 * logging success/error per integration. Errors in one integration do
 * not abort the others.
 */
export async function dispatchOrderSync(
	shopDomain: string,
	shopId:     number,
	order:      any,
): Promise<OrderDispatchResult[]> {
	const integrations = await getActiveControllersForShop(shopDomain);

	if (integrations.length === 0) {
		logger.warn(`⚠️ No active integrations for shop ${shopDomain}. Order ${order?.order_number} not synced.`);
		return [];
	}

	const results: OrderDispatchResult[] = [];

	for (const { name, displayName, integrationId, controller } of integrations) {
		try {
			logger.info(`🔄 [${displayName}] Syncing order #${order?.order_number}…`);
			const result = await controller.syncOrderToERP(order, shopId);
			results.push({ integration: name, result });

			if (result.success) {
				logger.info(`✅ [${displayName}] Order synced. erpId=${result.erpId}`);
				if (result.erpId !== undefined && order?.id !== undefined) {
					await logOrderSync(
						shopId,
						order.id.toString(),
						Number(result.erpId) || 0,
						{ orderNumber: order.order_number, integration: name },
						result,
						undefined,
						undefined,
						undefined,
						integrationId,
						name,
					).catch(() => null);
				}
			} else {
				logger.error(`❌ [${displayName}] Sync failed: ${result.error}`);
				await logSyncError(
					shopId,
					"ORDER",
					order?.id?.toString() ?? "unknown",
					result.error ?? "Unknown error",
					{ orderNumber: order?.order_number, integration: name },
					undefined,
					undefined,
					undefined,
					integrationId,
					name,
				).catch(() => null);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.error(`❌ [${displayName}] Exception during sync: ${message}`);
			results.push({
				integration: name,
				result:      { success: false, error: message },
			});
			await logSyncError(
				shopId,
				"ORDER",
				order?.id?.toString() ?? "unknown",
				message,
				{ orderNumber: order?.order_number, integration: name },
				undefined,
				undefined,
				undefined,
				integrationId,
				name,
			).catch(() => null);
		}
	}

	return results;
}
