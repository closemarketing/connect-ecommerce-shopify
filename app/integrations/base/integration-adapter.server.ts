/**
 * Interface base para adaptadores de integración
 * Cada sistema externo (Clientify, Agora, etc.) debe implementar este adapter
 */

import type { SyncResult, CredentialField, IntegrationFeature, IntegrationConfig } from './types';

export interface IntegrationAdapter {
	/**
	 * Configuración básica de la integración
	 */
	getConfig(): IntegrationConfig;

	/**
	 * Obtener los campos de credenciales requeridos
	 */
	getRequiredCredentials(): CredentialField[];

	/**
	 * Características soportadas por esta integración
	 */
	getSupportedFeatures(): IntegrationFeature[];

	/**
	 * Validar que las credenciales sean correctas
	 */
	validateCredentials(credentials: Record<string, string>): Promise<boolean>;

	/**
	 * Sincronizar un cliente de Shopify al sistema externo
	 */
	syncCustomer(
		shopifyCustomer: any,
		credentials: Record<string, string>
	): Promise<SyncResult>;

	/**
	 * Sincronizar un producto de Shopify al sistema externo
	 */
	syncProduct(
		shopifyProduct: any,
		credentials: Record<string, string>
	): Promise<SyncResult>;

	/**
	 * Sincronizar un pedido de Shopify al sistema externo
	 */
	syncOrder(
		shopifyOrder: any,
		credentials: Record<string, string>
	): Promise<SyncResult>;

	/**
	 * Obtener pipelines disponibles (si aplica)
	 */
	getPipelines?(credentials: Record<string, string>): Promise<Array<{
		id: string;
		name: string;
		stages: Array<{ id: string; name: string }>;
	}>>;
}
