/**
 * Adaptador de Clientify CRM
 * Implementa la interface IntegrationAdapter para Clientify
 */

import type { IntegrationAdapter } from '../base/integration-adapter.server';
import type { SyncResult, CredentialField, IntegrationConfig } from '../base/types';
import { IntegrationFeature } from '../base/types';
import type { SyncResult as ClientifySyncResult } from '../base/types';
import { ClientifyService } from './clientify-api.server';
import { syncShopifyOrderToClientify } from './sync-order.server';
import { listClientifyPipelines, listClientifyStages } from './pipeline.server';
import { CredentialsError, SyncError } from '../base/errors';

export class ClientifyAdapter implements IntegrationAdapter {
	getConfig(): IntegrationConfig {
		return {
			name: 'clientify',
			displayName: 'Clientify CRM',
			description: 'Sistema de CRM para gestión de contactos, ventas y oportunidades',
			iconUrl: '/assets/clientify-logo.png',
			enabled: true,
		};
	}

	getRequiredCredentials(): CredentialField[] {
		return [
			{
				key: 'apiToken',
				label: 'API Token',
				type: 'text',
				required: true,
				placeholder: 'Tu token de API de Clientify',
				helpText: 'Puedes obtener tu token en Clientify: Configuración > API > Generar nuevo token',
			},
		];
	}

	getSupportedFeatures(): IntegrationFeature[] {
		return [
			IntegrationFeature.SYNC_ORDERS,
			IntegrationFeature.SYNC_CUSTOMERS,
			IntegrationFeature.SYNC_PRODUCTS,
			IntegrationFeature.PIPELINE_STAGES,
		];
	}

	async validateCredentials(credentials: Record<string, string>): Promise<boolean> {
		try {
			const apiToken = credentials.apiToken;
			if (!apiToken) {
				throw new CredentialsError('clientify', 'API Token es requerido');
			}

			// Intentar obtener información de la cuenta para validar
			const clientify = new ClientifyService({ apiToken });
			await clientify.getAccountInfo();
			
			return true;
		} catch (error: any) {
			console.error('❌ Error validando credenciales de Clientify:', error);
			return false;
		}
	}

	async syncCustomer(
		shopifyCustomer: any,
		credentials: Record<string, string>
	): Promise<ClientifySyncResult> {
		try {
			// TODO: Implementar sincronización de cliente individual
			// Por ahora se sincroniza como parte de syncOrder
			return {
				success: false,
				error: 'Sincronización de clientes individuales no implementada aún',
			};
		} catch (error: any) {
			throw new SyncError('clientify', 'customer', error.message, error);
		}
	}

	async syncProduct(
		shopifyProduct: any,
		credentials: Record<string, string>
	): Promise<ClientifySyncResult> {
		try {
			// TODO: Implementar sincronización de producto individual
			// Por ahora se sincroniza como parte de syncOrder
			return {
				success: false,
				error: 'Sincronización de productos individuales no implementada aún',
			};
		} catch (error: any) {
			throw new SyncError('clientify', 'product', error.message, error);
		}
	}

	async syncOrder(
		shopifyOrder: any,
		credentials: Record<string, string>
	): Promise<ClientifySyncResult> {
		try {
			const apiToken = credentials.apiToken;
			if (!apiToken) {
				throw new CredentialsError('clientify', 'API Token no configurado');
			}

			// Usar la función existente de sincronización
			const result = await syncShopifyOrderToClientify(shopifyOrder, apiToken);

			return {
				success: result.success,
				externalId: result.dealId?.toString(),
				error: result.error,
				metadata: {
					contactId: result.contactId,
					productIds: result.productIds,
					dealId: result.dealId,
				},
			};
		} catch (error: any) {
			throw new SyncError('clientify', 'order', error.message, error);
		}
	}

	async getPipelines(credentials: Record<string, string>): Promise<Array<{
		id: string;
		name: string;
		stages: Array<{ id: string; name: string }>;
	}>> {
		try {
			const apiToken = credentials.apiToken;
			if (!apiToken) {
				throw new CredentialsError('clientify', 'API Token no configurado');
			}

			// Obtener pipelines y stages
			const [pipelines, allStages] = await Promise.all([
				listClientifyPipelines(apiToken),
				listClientifyStages(apiToken),
			]);

			// Mapear stages a sus pipelines
			const pipelinesWithStages = pipelines.map((pipeline) => {
				// Filtrar stages que pertenecen a este pipeline
				const pipelineStages = allStages.filter(
					(stage) => stage.pipeline === pipeline.url
				);

				return {
					id: pipeline.id.toString(),
					name: pipeline.name,
					stages: pipelineStages.map((stage) => ({
						id: stage.id.toString(),
						name: stage.name,
					})),
				};
			});

			return pipelinesWithStages;
		} catch (error: any) {
			throw new SyncError('clientify', 'pipelines', error.message, error);
		}
	}
}
