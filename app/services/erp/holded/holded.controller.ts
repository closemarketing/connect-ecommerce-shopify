import type { ERPController, SyncResult } from "../erp-controller.interface";
import { HoldedService } from "./holded.service";
import type { HoldedContact, HoldedInvoiceItem } from "./holded.service";

const NOT_IMPLEMENTED = (method: string): SyncResult => ({
	success: false,
	error:   `Holded — ${method} not yet implemented.`,
});

/**
 * Holded ERP controller.
 *
 * Credentials required:
 *   apikey — Holded API key (https://app.holded.com/api)
 *
 * Sync flow (Shopify → Holded):
 *   1. Upsert contact from Shopify customer data
 *   2. Upsert products from order line items
 *   3. Create invoice linked to the contact
 */
export class HoldedController implements ERPController {
	private service: HoldedService;

	constructor(private readonly apikey: string) {
		this.service = new HoldedService(apikey);
	}

	getName(): string {
		return "holded";
	}

	async validateCredentials(): Promise<boolean> {
		const result = await this.service.validateKey();
		return result.ok;
	}

	// ── Shopify → ERP ─────────────────────────────────────────────────────────

	async syncOrderToERP(order: any, _shopId: number): Promise<SyncResult> {
		try {
			// 1. Upsert contact
			const contactId = await this.upsertContact(order);

			// 2. Build invoice items — upsert products when possible
			const items = await this.buildInvoiceItems(order);

			// 3. Create invoice
			const invoiceDate = order.created_at
				? Math.floor(new Date(order.created_at).getTime() / 1000)
				: Math.floor(Date.now() / 1000);

			const notes = [
				`Shopify Order #${order.order_number ?? order.name ?? ""}`,
				order.note ? `Note: ${order.note}` : "",
			].filter(Boolean).join(" | ");

			const invoice = await this.service.createInvoice({
				contactId,
				date:  invoiceDate,
				notes,
				items,
			});

			return {
				success:   true,
				erpId:     invoice.id,
				shopifyId: String(order.id),
				action:    "created",
			};
		} catch (err) {
			return {
				success: false,
				error:   err instanceof Error ? err.message : String(err),
			};
		}
	}

	// ── ERP → Shopify ─────────────────────────────────────────────────────────

	async processWebhook(
		_payload: any,
		_event: string,
		_adminGraphql: (query: string, options?: any) => Promise<any>,
		_shopId: number,
	): Promise<SyncResult> {
		return NOT_IMPLEMENTED("processWebhook");
	}

	// ── Private helpers ───────────────────────────────────────────────────────

	/**
	 * Find or create a Holded contact from a Shopify order's customer/billing data.
	 * Returns the Holded contact ID.
	 */
	private async upsertContact(order: any): Promise<string> {
		const billing  = order.billing_address ?? {};
		const customer = order.customer ?? {};

		const name =
			billing.name ||
			[customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
			billing.company ||
			"Unknown Customer";

		const email = customer.email || order.email || billing.email;

		// Try to find existing contact by email
		if (email) {
			const existing = await this.service.searchContacts(email);
			const match    = existing.find(
				(c) => c.email?.toLowerCase() === email.toLowerCase(),
			);
			if (match?.id) return match.id;
		}

		const contactData: HoldedContact = {
			name,
			type: "client",
			...(email                          && { email }),
			...(customer.phone || billing.phone && { phone: customer.phone || billing.phone }),
			...(billing.address1               && { address: [billing.address1, billing.address2].filter(Boolean).join(", ") }),
			...(billing.city                   && { city: billing.city }),
			...(billing.zip                    && { postalCode: billing.zip }),
			...(billing.country_code           && { countryCode: billing.country_code }),
			...(billing.company                && { name: billing.company, contactPersons: [{ name, email }] }),
		};

		const created = await this.service.createContact(contactData);
		return created.id;
	}

	/**
	 * Maps Shopify line items to Holded invoice items.
	 * Tries to match existing Holded products by SKU; falls back to plain name lines.
	 */
	private async buildInvoiceItems(order: any): Promise<HoldedInvoiceItem[]> {
		const lineItems: any[] = order.line_items ?? [];
		const items: HoldedInvoiceItem[] = [];

		for (const li of lineItems) {
			const price    = parseFloat(li.price ?? "0");
			const units    = li.quantity ?? 1;
			const discount = li.discount_allocations?.reduce(
				(sum: number, d: any) => sum + parseFloat(d.amount ?? "0"),
				0,
			) ?? 0;

			// Try to find product in Holded by SKU
			let productId: string | undefined;
			if (li.sku) {
				try {
					const page = await this.service.listProducts(50);
					const hit  = page.items?.find(
						(p: any) => p.sku && p.sku.toLowerCase() === li.sku.toLowerCase(),
					);
					if (hit?.id) productId = hit.id;
				} catch {
					// Non-fatal — fall back to name-only line
				}
			}

			items.push({
				...(productId && { productId }),
				name:     li.title ?? li.name ?? "Product",
				units,
				price,
				...(discount > 0 && { discount: Math.round((discount / (price * units)) * 100) }),
			});
		}

		// Shipping line
		if (order.shipping_lines?.length > 0) {
			const shipping = order.shipping_lines[0];
			const shippingPrice = parseFloat(shipping.price ?? "0");
			if (shippingPrice > 0) {
				items.push({
					name:  shipping.title ?? "Shipping",
					units: 1,
					price: shippingPrice,
				});
			}
		}

		return items;
	}
}
