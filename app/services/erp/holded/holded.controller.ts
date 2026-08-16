import type { ERPController, SyncResult } from "../erp-controller.interface";
import { HoldedService } from "./holded.service";
import type { HoldedContact, HoldedInvoice, HoldedInvoiceItem, HoldedDocType } from "./holded.service";
import prisma from "../../../db.server";

const NOT_IMPLEMENTED = (method: string): SyncResult => ({
	success: false,
	error:   `Holded — ${method} not yet implemented.`,
});

export interface HoldedOrderSettings {
	docType: "smart" | HoldedDocType;
	serialNum?: string;
	autoApprove: boolean;
}

const HOLDED_DOC_URL: Record<HoldedDocType, string> = {
	invoice:      "https://app.holded.com/invoicing/invoices",
	salesreceipt: "https://app.holded.com/invoicing/salesreceipts",
	salesorder:   "https://app.holded.com/invoicing/salesorders",
	waybill:      "https://app.holded.com/invoicing/waybills",
};

export function holdedDocUrl(doctype: HoldedDocType, id: string): string {
	return `${HOLDED_DOC_URL[doctype]}/${id}`;
}

/**
 * Holded ERP controller.
 *
 * Credentials required:
 *   apikey — Holded API key (https://app.holded.com/api)
 *
 * Sync flow (Shopify → Holded):
 *   1. Upsert contact from Shopify customer data
 *   2. Build document items from order line items
 *   3. Create document (invoice / salesreceipt / salesorder / waybill)
 *   4. Optionally approve the document
 */
export class HoldedController implements ERPController {
	private service: HoldedService;

	constructor(
		private readonly apikey: string,
		private readonly orderSettings: HoldedOrderSettings = { docType: "smart", autoApprove: false },
	) {
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

	async syncOrderToERP(order: any, shopId: number): Promise<SyncResult> {
		try {
			const shopifyId = String(order.id);

			// A Holded document (invoice/receipt/order/waybill) has no natural upsert key,
			// so re-running the sync for an order already synced would create a duplicate
			// document in Holded. Guard against that using our own sync ledger.
			const existing = await this.findExistingSync(shopId, shopifyId);
			if (existing) return existing;

			const { contactId, contactCode } = await this.upsertContact(order);

			const resolvedDocType = this.resolveDocType(contactCode);

			const items = await this.buildInvoiceItems(order);

			const invoiceDate = order.created_at
				? Math.floor(new Date(order.created_at).getTime() / 1000)
				: Math.floor(Date.now() / 1000);

			const notes = [
				`Shopify Order #${order.order_number ?? order.name ?? ""}`,
				order.note ? `Note: ${order.note}` : "",
			].filter(Boolean).join(" | ");

			const payload: HoldedInvoice = {
				contactId,
				date:  invoiceDate,
				notes,
				items,
				...(this.orderSettings.serialNum && { numSerie: this.orderSettings.serialNum }),
			};

			const doc = await this.createDocument(resolvedDocType, payload);

			if (this.orderSettings.autoApprove) {
				await this.service.approveDocument(resolvedDocType, doc.id);
			}

			return {
				success:   true,
				erpId:     doc.id,
				shopifyId,
				action:    "created",
				docType:   resolvedDocType,
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
	 * Returns a SyncResult for an order that already has a successful "holded" ORDER
	 * sync log, or null if none exists yet.
	 */
	private async findExistingSync(shopId: number, shopifyId: string): Promise<SyncResult | null> {
		const existing = await prisma.syncLog.findFirst({
			where:   { shopId, syncType: "ORDER", shopifyId, erpName: "holded", status: "SUCCESS" },
			orderBy: { createdAt: "desc" },
		});
		if (!existing?.externalId) return null;

		let docType: string | undefined;
		try {
			docType = existing.responseData ? JSON.parse(existing.responseData).docType : undefined;
		} catch {
			// Older log rows may pre-date the docType field — ignore.
		}

		return {
			success: true,
			erpId:   existing.externalId,
			shopifyId,
			action:  "skipped",
			docType,
		};
	}

	private resolveDocType(contactCode: string): HoldedDocType {
		if (this.orderSettings.docType !== "smart") {
			return this.orderSettings.docType as HoldedDocType;
		}
		// Smart mode: no VAT/NIF → salesreceipt; VAT/NIF present → invoice
		return contactCode ? "invoice" : "salesreceipt";
	}

	private async createDocument(doctype: HoldedDocType, data: HoldedInvoice): Promise<{ id: string }> {
		switch (doctype) {
			case "invoice":
				return this.service.createInvoice(data);
			case "salesreceipt":
				return this.service.createSalesReceipt(data);
			case "salesorder":
				return this.service.createSalesOrder(data);
			case "waybill":
				return this.service.createWaybill(data);
		}
	}

	/**
	 * Find or create a Holded contact from a Shopify order's customer/billing data.
	 * Returns contactId and contactCode (VAT/NIF, empty string if none).
	 */
	private async upsertContact(order: any): Promise<{ contactId: string; contactCode: string }> {
		const billing  = order.billing_address ?? {};
		const customer = order.customer ?? {};

		const name =
			billing.company ||
			billing.name ||
			[customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
			"Unknown Customer";

		const email = customer.email || order.email || billing.email;
		const contactCode = billing.vat ?? "";

		if (email) {
			const existing = await this.service.searchContacts(email);
			const match    = existing.find(
				(c) => c.email?.toLowerCase() === email.toLowerCase(),
			);
			if (match?.id) return { contactId: match.id, contactCode: match.taxid ?? contactCode };
		}

		const contactData: HoldedContact = {
			name,
			type: "client",
			...(email                                         && { email }),
			...(customer.phone || billing.phone               ? { phone: customer.phone || billing.phone } : {}),
			...(billing.address1                              && { address: [billing.address1, billing.address2].filter(Boolean).join(", ") }),
			...(billing.city                                  && { city: billing.city }),
			...(billing.zip                                   && { postalCode: billing.zip }),
			...(billing.country_code                          && { countryCode: billing.country_code }),
			...(contactCode                                   && { taxid: contactCode }),
			...(billing.company && { contactPersons: [{ name: [customer.first_name, customer.last_name].filter(Boolean).join(" ") || name, email }] }),
		};

		const created = await this.service.createContact(contactData);
		return { contactId: created.id, contactCode };
	}

	/**
	 * Maps Shopify line items to Holded document items.
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

		if (order.shipping_lines?.length > 0) {
			const shipping      = order.shipping_lines[0];
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
