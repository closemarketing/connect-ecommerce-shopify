// Shim — deal sync is now part of syncOrderToERP in ClientifyController
import { ClientifyService, type ClientifyDeal } from "../erp/clientify/clientify.service";
import { mapShopifyOrderToClientifyDeal } from "../erp/clientify/clientify.service-helper";

export { mapShopifyOrderToClientifyDeal };
export type { ClientifyDeal };

export async function syncShopifyDealToClientify(
	dealData: ClientifyDeal,
	apiToken: string
): Promise<{ id: number }> {
	const service = new ClientifyService(apiToken);
	const id = await service.syncDeal(dealData);
	return { id };
}
