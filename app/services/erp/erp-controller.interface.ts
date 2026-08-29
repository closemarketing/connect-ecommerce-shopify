/**
 * Shared result type returned by every ERP operation.
 */
export interface SyncResult {
	success: boolean;
	/** ID of the record in the ERP system */
	erpId?: string | number;
	/** ID of the record in Shopify */
	shopifyId?: string;
	/** Human-readable error message when success = false */
	error?: string;
	/** What operation was performed */
	action?: "created" | "updated" | "skipped";
	/** Type of document created by the ERP, when applicable */
	documentType?: string;
}

/**
 * Contract every ERP controller must implement.
 *
 * Credentials are injected via the constructor — each controller
 * receives only the key/value pairs it needs.
 *
 * Two sync directions:
 *   SHOPIFY → ERP : triggered by Shopify webhooks  (syncOrderToERP)
 *   ERP → SHOPIFY : triggered by ERP webhooks       (processWebhook)
 */
export interface ERPController {
	/** Unique slug, e.g. "clientify", "holded" */
	getName(): string;

	/** Verify that the injected credentials are valid against the ERP API */
	validateCredentials(): Promise<boolean>;

	/**
	 * Full order sync: contact + products + deal/invoice in the ERP.
	 * Triggered by orders/create and orders/updated Shopify webhooks.
	 */
	syncOrderToERP(order: any, shopId: number): Promise<SyncResult>;

	/**
	 * Entry point for inbound ERP webhooks (ERP → Shopify direction).
	 * The controller decides which sub-handler to call based on `event`.
	 *
	 * @param payload     Parsed JSON body sent by the ERP
	 * @param event       Event identifier (from header or URL)
	 * @param adminGraphql Bound Shopify Admin GraphQL client
	 * @param shopId      Internal DB shop ID
	 */
	processWebhook(
		payload: any,
		event: string,
		adminGraphql: (query: string, options?: any) => Promise<any>,
		shopId: number
	): Promise<SyncResult>;
}
