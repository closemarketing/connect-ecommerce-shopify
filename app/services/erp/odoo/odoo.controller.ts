import type { ERPController, SyncResult } from "../erp-controller.interface";
import { OdooService } from "./odoo.service";
import type { OdooCredentials } from "./odoo.service";

const NOT_IMPLEMENTED = (method: string): SyncResult => ({
	success: false,
	error:   `Odoo — ${method} not yet implemented.`,
});

interface OdooPartner {
	id: number;
}

interface OdooProduct {
	id:           number;
	default_code: string;
}

interface OdooSaleOrder {
	id:      number;
	locked?: boolean;
}

interface OdooSaleOrderLine {
	id:         number;
	product_id: [number, string] | false;
}

/**
 * Odoo ERP controller.
 *
 * Credentials required:
 *   url, dbname, username, apikey — see OdooService.
 *
 * Sync flow (Shopify → Odoo):
 *   1. Find/create contact (res.partner) — matched by VAT (billing_address.vat),
 *      falling back to email, same lookup order Holded already uses for its
 *      own contactCode.
 *   2. Match line items to Odoo products (product.product) by SKU = default_code.
 *   3. Find/create the sale.order, keyed by client_order_ref = Shopify order name.
 *   4. Diff order lines granularly (create/update/delete) on update.
 *   5. Confirm the order (action_confirm) — a Shopify order is always an
 *      already-placed sale, never a quotation.
 *
 * ERP → Shopify direction is not applicable for order sync (Odoo does not
 * push webhooks back to this app for orders); product sync is handled by a
 * separate scheduled job, not this controller.
 */
export class OdooController implements ERPController {
	private service: OdooService;

	constructor(private readonly creds: OdooCredentials) {
		this.service = new OdooService(creds);
	}

	getName(): string {
		return "odoo";
	}

	async validateCredentials(): Promise<boolean> {
		return this.service.validateCredentials();
	}

	// ── Shopify → ERP ─────────────────────────────────────────────────────────

	async syncOrderToERP(order: any, _shopId: number): Promise<SyncResult> {
		try {
			const partnerId = await this.upsertPartner(order);
			const newLines  = await this.buildOrderLines(order);

			if (newLines.length === 0) {
				return { success: false, error: "Ningún producto del pedido coincide con un SKU en Odoo" };
			}

			const clientOrderRef = String(order.name ?? order.order_number ?? order.id);

			const existing = await this.service.searchRead<OdooSaleOrder>(
				"sale.order",
				[["client_order_ref", "=", clientOrderRef]],
				["id", "locked"],
			);

			let saleOrderId: number;
			let action: "created" | "updated" = "created";

			if (existing.length === 0) {
				saleOrderId = await this.service.create("sale.order", {
					client_order_ref: clientOrderRef,
					partner_id:       partnerId,
					order_line:       newLines.map((line) => [0, 0, line]),
				});
			} else {
				if (existing[0].locked) {
					return { success: false, error: "El pedido está bloqueado en Odoo (locked)" };
				}
				saleOrderId  = existing[0].id;
				action       = "updated";
				const lineCommands = await this.buildLineDiffCommands(saleOrderId, newLines);
				await this.service.write("sale.order", [saleOrderId], {
					partner_id: partnerId,
					order_line: lineCommands,
				});
			}

			await this.service.callMethod("sale.order", "action_confirm", [[saleOrderId]]);

			return {
				success:      true,
				erpId:        saleOrderId,
				shopifyId:    String(order.id),
				action,
				documentType: "sale.order",
			};
		} catch (err) {
			return { success: false, error: err instanceof Error ? err.message : String(err) };
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
	 * Find or create a res.partner from a Shopify order's customer/billing data.
	 * Matched by VAT (order.billing_address.vat — same field Holded already
	 * reads for its own contactCode), falling back to email.
	 */
	private async upsertPartner(order: any): Promise<number> {
		const billing  = order.billing_address ?? {};
		const customer = order.customer ?? {};

		const name =
			billing.company ||
			billing.name ||
			[customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
			"Unknown Customer";

		const email = customer.email || order.email || billing.email || "";
		const vat    = billing.vat ?? "";

		const searches: Array<[string, string]> = [];
		if (vat) searches.push(["vat", vat]);
		if (email) searches.push(["email", email]);

		for (const [field, value] of searches) {
			const found = await this.service.searchRead<OdooPartner>("res.partner", [[field, "=", value]], ["id"]);
			if (found.length > 0) {
				await this.service.write("res.partner", [found[0].id], this.buildPartnerPayload(order, name, email, vat));
				return found[0].id;
			}
		}

		return this.service.create("res.partner", this.buildPartnerPayload(order, name, email, vat));
	}

	private buildPartnerPayload(order: any, name: string, email: string, vat: string): Record<string, any> {
		const billing  = order.billing_address ?? {};
		const customer = order.customer ?? {};

		return {
			name,
			...(vat && { vat }),
			...(email && { email }),
			...((customer.phone || billing.phone) && { phone: customer.phone || billing.phone }),
			...(billing.address1 && { street: [billing.address1, billing.address2].filter(Boolean).join(", ") }),
			...(billing.city && { city: billing.city }),
			...(billing.zip && { zip: billing.zip }),
			...(billing.company && { is_company: true }),
		};
	}

	/**
	 * Matches Shopify line items to Odoo products by SKU (default_code).
	 * Lines without a matching product are skipped — Odoo has no concept
	 * of a "name only" sale order line the way Holded invoices do.
	 */
	private async buildOrderLines(order: any): Promise<Array<Record<string, any>>> {
		const lineItems: any[] = order.line_items ?? [];
		const skus = [...new Set(lineItems.map((li) => li.sku).filter(Boolean))];

		const products = skus.length > 0
			? await this.service.searchRead<OdooProduct>(
				"product.product",
				[["default_code", "in", skus]],
				["id", "default_code"],
			)
			: [];

		const lines: Array<Record<string, any>> = [];
		for (const li of lineItems) {
			const match = products.find((p) => p.default_code === li.sku);
			if (!match) continue;

			lines.push({
				product_id:       match.id,
				name:             li.title ?? li.name ?? "",
				product_uom_qty:  li.quantity ?? 1,
				price_unit:       parseFloat(li.price ?? "0"),
			});
		}
		return lines;
	}

	/**
	 * Builds granular sale.order.line commands for an update: reuse existing
	 * lines matched by product_id, create new ones, delete lines whose
	 * product is no longer in the Shopify order (including orphan lines
	 * with no product_id at all).
	 */
	private async buildLineDiffCommands(
		saleOrderId: number,
		newLines:    Array<Record<string, any>>,
	): Promise<Array<[number, number, any]>> {
		const existingLines = await this.service.searchRead<OdooSaleOrderLine>(
			"sale.order.line",
			[["order_id", "=", saleOrderId]],
			["id", "product_id"],
		);

		const existingByProduct = new Map<number, number>();
		const orphanLineIds: number[] = [];
		for (const line of existingLines) {
			if (line.product_id) {
				existingByProduct.set(line.product_id[0], line.id);
			} else {
				orphanLineIds.push(line.id);
			}
		}

		const commands: Array<[number, number, any]> = [];
		const usedProductIds = new Set<number>();

		for (const line of newLines) {
			const existingLineId = existingByProduct.get(line.product_id);
			if (existingLineId) {
				commands.push([1, existingLineId, line]);
				usedProductIds.add(line.product_id);
			} else {
				commands.push([0, 0, line]);
			}
		}

		for (const [productId, lineId] of existingByProduct) {
			if (!usedProductIds.has(productId)) commands.push([2, lineId, 0]);
		}
		for (const lineId of orphanLineIds) commands.push([2, lineId, 0]);

		return commands;
	}
}
