// Shim — delegates to ClientifyController
import { ClientifyController } from "../erp/clientify/clientify.controller";

export async function syncShopifyOrderToClientify(
order: any,
clientifyApiToken: string,
shopId?: number
): Promise<{ success: boolean; dealId?: number; error?: string }> {
const controller = new ClientifyController(clientifyApiToken);
const result     = await controller.syncOrderToERP(order, shopId ?? 0);
return {
success: result.success,
dealId:  result.erpId as number | undefined,
error:   result.error,
};
}
