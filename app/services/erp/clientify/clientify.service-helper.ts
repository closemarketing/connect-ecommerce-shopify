import type { ClientifyContact, ClientifyDeal, ClientifyProduct } from "./clientify.service";

/**
 * Auxiliary mapping / transformation functions for Clientify data.
 * Pure utilities — no API calls, no business logic.
 */

// ── Contact mappers ───────────────────────────────────────────────────────────

/**
 * Builds a Clientify contact from a Shopify order's customer + billing address.
 */
export function mapShopifyOrderToClientifyContact(order: any): ClientifyContact {
	const customer        = order.customer || {};
	const billing         = order.billing_address || {};
	const shipping        = order.shipping_address || {};

	const contact: ClientifyContact = {
		first_name:  customer.first_name || "",
		last_name:   customer.last_name || "",
		email:       customer.email || "",
		phone:       billing.phone || shipping.phone || customer.phone || "",
		mobile:      customer.phone || billing.phone || "",
		address:     billing.address1 || "",
		address_2:   billing.address2 || "",
		city:        billing.city || "",
		state:       billing.province || "",
		postal_code: billing.zip || "",
		country:     billing.country_code || billing.country || "",
		taxpayer_identification_number:
			customer.tax_exemptions?.[0] || billing.company || "",
	};

	const customFields: Array<{ field: string; value: string }> = [];
	if (customer.id) customFields.push({ field: "shopify_customer_id", value: customer.id.toString() });
	if (customFields.length > 0) contact.custom_fields = customFields;

	return contact;
}

/**
 * Builds a Clientify contact from a standalone Shopify customer object.
 */
export function mapShopifyCustomerToClientifyContact(customer: any): ClientifyContact {
	const addr = customer.default_address || {};

	const contact: ClientifyContact = {
		first_name:  customer.first_name || "",
		last_name:   customer.last_name || "",
		email:       customer.email || "",
		phone:       customer.phone || addr.phone || "",
		mobile:      customer.phone || "",
		address:     addr.address1 || "",
		address_2:   addr.address2 || "",
		city:        addr.city || "",
		state:       addr.province || "",
		postal_code: addr.zip || "",
		country:     addr.country_code || addr.country || "",
		taxpayer_identification_number: addr.company || "",
	};

	if (customer.id) {
		contact.custom_fields = [{ field: "shopify_customer_id", value: customer.id.toString() }];
	}

	return contact;
}

// ── Product mappers ───────────────────────────────────────────────────────────

/**
 * Builds a Clientify product from a Shopify order line_item.
 * @param ownerId  Clientify account user_id (owner of the product record)
 */
export function mapShopifyLineItemToClientifyProduct(lineItem: any, ownerId?: number): ClientifyProduct {
	const customFields: Array<{ field: string; value: string }> = [];
	if (lineItem.product_id) customFields.push({ field: "shopify_product_id", value: lineItem.product_id.toString() });
	if (lineItem.variant_id) customFields.push({ field: "shopify_variant_id", value: lineItem.variant_id.toString() });
	if (lineItem.sku)        customFields.push({ field: "shopify_sku",         value: lineItem.sku });

	const product: ClientifyProduct = {
		sku:           lineItem.sku || lineItem.variant_id?.toString() || "",
		name:          lineItem.title || lineItem.name || "",
		description:   lineItem.variant_title || lineItem.name || "",
		price:         parseFloat(lineItem.price) || 0,
		custom_fields: customFields.length > 0 ? customFields : undefined,
	};

	if (ownerId) product.owner = ownerId;

	return product;
}

// ── Deal mappers ──────────────────────────────────────────────────────────────

/**
 * Builds a Clientify deal from a Shopify order.
 */
export function mapShopifyOrderToClientifyDeal(
	order: any,
	contactId: number,
	productItems: Array<{ product_id: number; quantity: number }>,
	ownerId?: number
): ClientifyDeal {
	const customFields: Array<{ field: string; value: string }> = [];
	if (order.id)                  customFields.push({ field: "shopify_order_id",           value: order.id.toString() });
	if (order.order_number)        customFields.push({ field: "shopify_order_number",        value: order.order_number.toString() });
	if (order.financial_status)    customFields.push({ field: "shopify_order_status",        value: order.financial_status });
	if (order.fulfillment_status)  customFields.push({ field: "shopify_fulfillment_status",  value: order.fulfillment_status });
	if (order.total_tax)           customFields.push({ field: "shopify_total_tax",           value: order.total_tax });
	if (order.total_discounts)     customFields.push({ field: "shopify_total_discounts",     value: order.total_discounts });
	if (order.total_shipping_price_set?.shop_money?.amount) {
		customFields.push({ field: "shopify_shipping_price", value: order.total_shipping_price_set.shop_money.amount });
	}

	const deal: ClientifyDeal = {
		name:        `Pedido #${order.order_number} - ${order.id}`,
		contact_id:  contactId,
		amount:      parseFloat(order.total_price) || 0,
		currency:    order.currency || "EUR",
		description: `Pedido Shopify #${order.order_number}\nEstado financiero: ${order.financial_status}\nEstado de envío: ${order.fulfillment_status || "pendiente"}`,
		products:    productItems,
		custom_fields: customFields.length > 0 ? customFields : undefined,
	};

	if (ownerId) deal.owner = ownerId;

	return deal;
}

/**
 * Converts already-synced Clientify product IDs + Shopify line_items into deal product entries.
 */
export function mapLineItemsToClientifyDealItems(
	lineItems: any[],
	clientifyProductIds: number[]
): Array<{ product_id: number; quantity: number }> {
	return lineItems.map((item, index) => ({
		product_id: clientifyProductIds[index],
		quantity:   item.quantity || 1,
	}));
}
