/**
 * Shopify inventory write service.
 * Used for ERP → Shopify direction to adjust inventory levels via GraphQL Admin API.
 */

const INVENTORY_ADJUST_MUTATION = `#graphql
mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
	inventoryAdjustQuantities(input: $input) {
		inventoryAdjustmentGroup {
			reason
			changes { name delta quantityAfterChange }
		}
		userErrors { field message }
	}
}`;

const INVENTORY_ITEM_QUERY = `#graphql
query getInventoryItem($variantId: ID!) {
	productVariant(id: $variantId) {
		inventoryItem { id }
	}
}`;

export interface InventoryAdjustment {
	inventoryItemId: string;
	locationId:      string;
	delta:           number; // positive = add, negative = remove
}

/**
 * Adjusts inventory quantities for one or more items at given locations.
 * @param reason - e.g. "correction", "received", "damaged", "shrinkage", "theft", "other"
 */
export async function adjustShopifyInventory(
	adminGraphql: (query: string, options?: any) => Promise<any>,
	adjustments: InventoryAdjustment[],
	reason: string = "correction"
): Promise<void> {
	const input = {
		reason,
		name: "available",
		changes: adjustments.map((a) => ({
			inventoryItemId: a.inventoryItemId,
			locationId:      a.locationId,
			delta:           a.delta,
		})),
	};

	const response = await adminGraphql(INVENTORY_ADJUST_MUTATION, { variables: { input } });
	const { inventoryAdjustQuantities } = await response.json();

	if (inventoryAdjustQuantities.userErrors?.length > 0) {
		throw new Error(`Shopify inventoryAdjust error: ${JSON.stringify(inventoryAdjustQuantities.userErrors)}`);
	}
}

/**
 * Helper: resolves a variant GID to its inventory item ID.
 */
export async function getInventoryItemIdForVariant(
	adminGraphql: (query: string, options?: any) => Promise<any>,
	variantId: string
): Promise<string> {
	const response = await adminGraphql(INVENTORY_ITEM_QUERY, { variables: { variantId } });
	const { productVariant } = await response.json();

	if (!productVariant?.inventoryItem?.id) {
		throw new Error(`Cannot find inventoryItem for variant ${variantId}`);
	}

	return productVariant.inventoryItem.id;
}
