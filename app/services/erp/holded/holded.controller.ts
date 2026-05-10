import type { ERPController, SyncResult } from "../erp-controller.interface";
import { HoldedService } from "./holded.service";

const NOT_IMPLEMENTED = (method: string): SyncResult => ({
	success: false,
	error:   `Holded — ${method} not yet implemented.`,
});

/**
 * Holded ERP controller — skeleton.
 * Full implementation is scheduled for a future phase.
 *
 * Credentials expected (passed via constructor):
 *   apikey — Holded API key (https://app.holded.com/api)
 */
export class HoldedController implements ERPController {
	private service: HoldedService;

	constructor(private apikey: string) {
		this.service = new HoldedService(apikey);
	}

	getName(): string {
		return "holded";
	}

	async validateCredentials(): Promise<boolean> {
		return this.service.validateKey();
	}

	// ── Shopify → ERP ─────────────────────────────────────────────────────────

	async syncOrderToERP(_order: any, _shopId: number): Promise<SyncResult> {
		return NOT_IMPLEMENTED("syncOrderToERP");
	}

	// ── ERP → Shopify ─────────────────────────────────────────────────────────

	async processWebhook(
		_payload: any,
		_event: string,
		_adminGraphql: (query: string, options?: any) => Promise<any>,
		_shopId: number
	): Promise<SyncResult> {
		return NOT_IMPLEMENTED("processWebhook");
	}
}
