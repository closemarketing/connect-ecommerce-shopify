// Clientify Integration Exports
export { ClientifyAdapter } from './clientify-adapter.server';
export { ClientifyService } from './clientify-api.server';
export type { ClientifyContact, ClientifyProduct, ClientifyDeal } from './clientify-api.server';

// Sync functions
export { syncShopifyOrderToClientify } from './sync-order.server';
export { syncShopifyCustomerToClientifyContact } from './sync-customer.server';
export { syncShopifyLineItemsToClientifyProducts } from './sync-product.server';
export { syncShopifyDealToClientify } from './sync-deal.server';
export { syncCompleteShopifyOrderToClientify } from './sync-complete-order.server';

// Mappers
export {
	mapShopifyCustomerToClientifyContact,
	mapShopifyOrderToClientifyDeal,
	mapShopifyLineItemToClientifyProduct,
	mapShopifyProductToClientifyProduct,
} from './clientify-mapper.server';

// Pipeline
export {
	getClientifyPipelines,
	getClientifyPipelineStages,
	saveClientifyPipelineConfig,
	saveClientifyOrderStageMapping,
	getClientifyPipelineConfig,
	getClientifyOrderStageMapping,
} from './pipeline.server';
