import type { ClientifyContact, ClientifyProduct, ClientifyDeal } from "./clientify.server";

/**
 * Convierte un pedido de Shopify a un contacto de Clientify
 */
export function mapShopifyOrderToClientifyContact(order: any): ClientifyContact {
  const customer = order.customer || {};
  const billingAddress = order.billing_address || {};
  const shippingAddress = order.shipping_address || {};

  const contact: ClientifyContact = {
    first_name: customer.first_name || "",
    last_name: customer.last_name || "",
    email: customer.email || "",
    phone: billingAddress.phone || shippingAddress.phone || customer.phone || "",
    mobile: customer.phone || billingAddress.phone || "",
    // Dirección de facturación
    address: billingAddress.address1 || "",
    address_2: billingAddress.address2 || "",
    city: billingAddress.city || "",
    state: billingAddress.province || "",
    postal_code: billingAddress.zip || "",
    country: billingAddress.country_code || billingAddress.country || "",
    // NIF/CIF (si está disponible en los campos del cliente)
    taxpayer_identification_number: customer.tax_exemptions?.[0] || billingAddress.company || "",
  };

  // Solo incluir custom_fields con valores no vacíos
  const customFields = [];
  if (customer.id) {
    customFields.push({ field: "shopify_customer_id", value: customer.id.toString() });
  }

  if (customFields.length > 0) {
    contact.custom_fields = customFields;
  }

  return contact;
}

/**
 * Convierte un line_item de Shopify a un producto de Clientify
 */
export function mapShopifyLineItemToClientifyProduct(lineItem: any): ClientifyProduct {
  // Solo incluir custom_fields con valores no vacíos
  const customFields = [];
  if (lineItem.product_id) {
    customFields.push({ field: "shopify_product_id", value: lineItem.product_id.toString() });
  }
  if (lineItem.variant_id) {
    customFields.push({ field: "shopify_variant_id", value: lineItem.variant_id.toString() });
  }
  if (lineItem.sku) {
    customFields.push({ field: "shopify_sku", value: lineItem.sku });
  }

  return {
    sku: lineItem.product_id?.toString() || lineItem.sku || "",
    name: lineItem.title || lineItem.name || "",
    description: lineItem.variant_title || lineItem.variant_name || "",
    price: parseFloat(lineItem.price) || 0,
    custom_fields: customFields.length > 0 ? customFields : undefined,
  };
}

/**
 * Convierte un pedido de Shopify a una oportunidad de Clientify
 */
export function mapShopifyOrderToClientifyDeal(
  order: any,
  contactId: number,
  productItems: Array<{ product_id: number; quantity: number; price: number }>,
  ownerId?: number
): ClientifyDeal {
  // Solo incluir custom_fields con valores no vacíos
  const customFields = [];
  if (order.id) {
    customFields.push({ field: "shopify_order_id", value: order.id.toString() });
  }
  if (order.order_number) {
    customFields.push({ field: "shopify_order_number", value: order.order_number.toString() });
  }
  if (order.financial_status) {
    customFields.push({ field: "shopify_order_status", value: order.financial_status });
  }
  if (order.fulfillment_status) {
    customFields.push({ field: "shopify_fulfillment_status", value: order.fulfillment_status });
  }
  if (order.total_tax) {
    customFields.push({ field: "shopify_total_tax", value: order.total_tax });
  }
  if (order.total_discounts) {
    customFields.push({ field: "shopify_total_discounts", value: order.total_discounts });
  }
  if (order.total_shipping_price_set?.shop_money?.amount) {
    customFields.push({ field: "shopify_shipping_price", value: order.total_shipping_price_set.shop_money.amount });
  }

  const deal: ClientifyDeal = {
    name: `Pedido #${order.order_number} - ${order.id}`,
    contact_id: contactId,
    amount: parseFloat(order.total_price) || 0,
    currency: order.currency || "EUR",
    description: `Pedido Shopify #${order.order_number}\nEstado financiero: ${order.financial_status}\nEstado de envío: ${order.fulfillment_status || "pendiente"}`,
    items: productItems,
    custom_fields: customFields.length > 0 ? customFields : undefined,
  };

  // Solo incluir owner si está disponible
  if (ownerId) {
    deal.owner = ownerId;
  }

  return deal;
}

/**
 * Convierte los line_items de un pedido a items de oportunidad con IDs de Clientify
 */
export function mapLineItemsToClientifyDealItems(
  lineItems: any[],
  clientifyProductIds: number[]
): Array<{ product_id: number; quantity: number; price: number }> {
  return lineItems.map((item, index) => ({
    product_id: clientifyProductIds[index],
    quantity: item.quantity || 1,
    price: parseFloat(item.price) || 0,
  }));
}
