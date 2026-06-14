// Shim — product sync is now part of syncOrderToERP in ClientifyController
import { ClientifyService, type ClientifyProduct } from "../erp/clientify/clientify.service";
import { mapShopifyLineItemToClientifyProduct } from "../erp/clientify/clientify.service-helper";

export { mapShopifyLineItemToClientifyProduct };
export type { ClientifyProduct };

export async function syncShopifyLineItemToClientifyProduct(
	lineItem: any,
	apiToken: string,
	ownerId?: number
): Promise<ClientifyProduct & { id: number }> {
	const service = new ClientifyService(apiToken);
	const mapped = mapShopifyLineItemToClientifyProduct(lineItem, ownerId);
	const id = await service.syncProduct(mapped);
	return { ...mapped, id };
}

export async function syncShopifyLineItemsToClientifyProducts(
	lineItems: any[],
	apiToken: string,
	ownerId?: number
): Promise<ClientifyProduct[]> {
	return Promise.all(lineItems.map(item =>
		syncShopifyLineItemToClientifyProduct(item, apiToken, ownerId)
	));
}
