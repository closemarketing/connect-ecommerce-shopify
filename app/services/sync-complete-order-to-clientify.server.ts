import { ClientifyController } from "./erp/clientify/clientify.controller";

interface OrderSyncResult {
	success: boolean;
	dealId?: number;
	error?: string;
}

export async function syncCompleteShopifyOrderToClientify(
	order: any,
	apiToken: string,
	shopId?: number
): Promise<OrderSyncResult> {
	const controller = new ClientifyController(apiToken);
	const result = await controller.syncOrderToERP(order, shopId ?? 0);
	return {
		success: result.success,
		dealId: result.erpId as number | undefined,
		error: result.error,
	};
}
