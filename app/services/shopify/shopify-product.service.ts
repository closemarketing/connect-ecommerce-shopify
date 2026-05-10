/**
 * Shopify product write service.
 * Used for ERP → Shopify direction to update product details via GraphQL Admin API.
 */

const PRODUCT_UPDATE_MUTATION = `#graphql
mutation productUpdate($input: ProductInput!) {
	productUpdate(input: $input) {
		product { id title status }
		userErrors { field message }
	}
}`;

const VARIANT_BULK_UPDATE_MUTATION = `#graphql
mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
	productVariantsBulkUpdate(productId: $productId, variants: $variants) {
		productVariants { id sku price }
		userErrors { field message }
	}
}`;

export interface ShopifyProductInput {
	id:      string; // GID: "gid://shopify/Product/123"
	title?:  string;
	status?: "ACTIVE" | "DRAFT" | "ARCHIVED";
	tags?:   string[];
}

export interface ShopifyVariantInput {
	id:    string; // GID: "gid://shopify/ProductVariant/456"
	price?: string;
	sku?:   string;
}

/**
 * Updates a Shopify product.
 */
export async function updateShopifyProduct(
	adminGraphql: (query: string, options?: any) => Promise<any>,
	input: ShopifyProductInput
): Promise<{ id: string; title: string }> {
	const response = await adminGraphql(PRODUCT_UPDATE_MUTATION, { variables: { input } });
	const { productUpdate } = await response.json();

	if (productUpdate.userErrors?.length > 0) {
		throw new Error(`Shopify productUpdate error: ${JSON.stringify(productUpdate.userErrors)}`);
	}

	return productUpdate.product;
}

/**
 * Bulk-updates product variants (price, SKU, etc.).
 */
export async function bulkUpdateShopifyVariants(
	adminGraphql: (query: string, options?: any) => Promise<any>,
	productId: string,
	variants: ShopifyVariantInput[]
): Promise<Array<{ id: string; sku: string; price: string }>> {
	const response = await adminGraphql(VARIANT_BULK_UPDATE_MUTATION, {
		variables: { productId, variants },
	});
	const { productVariantsBulkUpdate } = await response.json();

	if (productVariantsBulkUpdate.userErrors?.length > 0) {
		throw new Error(`Shopify variantBulkUpdate error: ${JSON.stringify(productVariantsBulkUpdate.userErrors)}`);
	}

	return productVariantsBulkUpdate.productVariants;
}
