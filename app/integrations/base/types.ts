/**
 * Tipos comunes para todas las integraciones
 */

export interface SyncResult {
	success: boolean;
	externalId?: string | number;
	error?: string;
	metadata?: Record<string, any>;
}

export interface CredentialField {
	key: string;
	label: string;
	type: 'text' | 'password' | 'url' | 'email';
	required: boolean;
	placeholder?: string;
	helpText?: string;
}

export enum IntegrationFeature {
	SYNC_ORDERS = 'sync_orders',
	SYNC_CUSTOMERS = 'sync_customers',
	SYNC_PRODUCTS = 'sync_products',
	WEBHOOKS = 'webhooks',
	BIDIRECTIONAL = 'bidirectional',
	PIPELINE_STAGES = 'pipeline_stages',
}

export interface IntegrationConfig {
	name: string;
	displayName: string;
	description?: string;
	iconUrl?: string;
	enabled: boolean;
}
