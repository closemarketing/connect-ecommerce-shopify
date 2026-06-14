/**
 * Shopify customer write service.
 * Used for ERP → Shopify direction to create or update customers via GraphQL Admin API.
 */

const CUSTOMER_CREATE_MUTATION = `#graphql
mutation customerCreate($input: CustomerInput!) {
	customerCreate(input: $input) {
		customer { id email firstName lastName phone }
		userErrors { field message }
	}
}`;

const CUSTOMER_UPDATE_MUTATION = `#graphql
mutation customerUpdate($input: CustomerInput!) {
	customerUpdate(input: $input) {
		customer { id email firstName lastName phone }
		userErrors { field message }
	}
}`;

export interface ShopifyCustomerInput {
	email:     string;
	firstName?: string;
	lastName?:  string;
	phone?:     string;
	tags?:      string[];
}

export interface ShopifyCustomerResult {
	id:         string;
	email:      string;
	firstName?: string;
	lastName?:  string;
}

/**
 * Creates a new Shopify customer.
 * @param adminGraphql - The authenticated Shopify Admin GraphQL function
 */
export async function createShopifyCustomer(
	adminGraphql: (query: string, options?: any) => Promise<any>,
	input: ShopifyCustomerInput
): Promise<ShopifyCustomerResult> {
	const response = await adminGraphql(CUSTOMER_CREATE_MUTATION, { variables: { input } });
	const { customerCreate } = await response.json();

	if (customerCreate.userErrors?.length > 0) {
		throw new Error(`Shopify customerCreate error: ${JSON.stringify(customerCreate.userErrors)}`);
	}

	return customerCreate.customer;
}

/**
 * Updates an existing Shopify customer.
 * @param adminGraphql - The authenticated Shopify Admin GraphQL function
 * @param shopifyCustomerId - GID string, e.g. "gid://shopify/Customer/123"
 */
export async function updateShopifyCustomer(
	adminGraphql: (query: string, options?: any) => Promise<any>,
	shopifyCustomerId: string,
	input: Partial<ShopifyCustomerInput>
): Promise<ShopifyCustomerResult> {
	const response = await adminGraphql(CUSTOMER_UPDATE_MUTATION, {
		variables: { input: { id: shopifyCustomerId, ...input } },
	});
	const { customerUpdate } = await response.json();

	if (customerUpdate.userErrors?.length > 0) {
		throw new Error(`Shopify customerUpdate error: ${JSON.stringify(customerUpdate.userErrors)}`);
	}

	return customerUpdate.customer;
}
