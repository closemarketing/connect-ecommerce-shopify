// Shim — delegates to ClientifyController
import { ClientifyController } from "../erp/clientify/clientify.controller";

export async function syncShopifyCustomerToClientifyContact(
customer: any,
apiToken: string
): Promise<{ id: number; success: boolean; error?: string }> {
const controller = new ClientifyController(apiToken);
const result     = await controller.syncCustomerToERP(customer, 0);
return {
success: result.success,
id:      (result.erpId as number) ?? 0,
error:   result.error,
};
}
