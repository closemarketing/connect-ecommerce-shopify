/**
 * Adaptador de Agora ERP
 * Implementa la interface IntegrationAdapter para Agora
 * NOTA: Implementación pendiente - stub básico
 */

import type { IntegrationAdapter } from '../base/integration-adapter.server';
import type { SyncResult, CredentialField, IntegrationConfig } from '../base/types';
import { IntegrationFeature } from '../base/types';
import type { SyncResult as AgoraSyncResult } from '../base/types';
import { CredentialsError, SyncError } from '../base/errors';

export class AgoraAdapter implements IntegrationAdapter {
	getConfig(): IntegrationConfig {
		return {
			name: 'agora',
			displayName: 'Agora ERP',
			description: 'Sistema ERP para gestión integral de ventas, inventario y facturación',
			iconUrl: '/assets/agora-logo.png',
			enabled: false, // Deshabilitado hasta completar implementación
		};
	}

	getRequiredCredentials(): CredentialField[] {
		return [
			{
				key: 'apiKey',
				label: 'API Key',
				type: 'password',
				required: true,
				placeholder: 'Tu API Key de Agora',
				helpText: 'Obtén tu API Key desde el panel de Agora',
			},
			{
				key: 'customerId',
				label: 'Customer ID',
				type: 'text',
				required: true,
				placeholder: 'ID de tu cuenta',
				helpText: 'ID de cliente proporcionado por Agora',
			},
			{
				key: 'apiUrl',
				label: 'API URL',
				type: 'url',
				required: false,
				placeholder: 'https://api.agora.com/v1/',
				helpText: 'URL base de la API (dejar vacío para usar la predeterminada)',
			},
		];
	}

	getSupportedFeatures(): IntegrationFeature[] {
		return [
			IntegrationFeature.SYNC_ORDERS,
			IntegrationFeature.SYNC_CUSTOMERS,
			IntegrationFeature.SYNC_PRODUCTS,
		];
	}

	async validateCredentials(credentials: Record<string, string>): Promise<boolean> {
		try {
			const { apiKey, customerId } = credentials;
			
			if (!apiKey || !customerId) {
				throw new CredentialsError('agora', 'API Key y Customer ID son requeridos');
			}

			// TODO: Implementar validación real contra API de Agora
			console.log('⚠️ Validación de credenciales Agora - stub (no implementado)');
			
			return false; // Por ahora siempre falla hasta implementar
		} catch (error: any) {
			console.error('❌ Error validando credenciales de Agora:', error);
			return false;
		}
	}

	async syncCustomer(
		shopifyCustomer: any,
		credentials: Record<string, string>
	): Promise<AgoraSyncResult> {
		throw new SyncError('agora', 'customer', 'Integración Agora no implementada aún');
	}

	async syncProduct(
		shopifyProduct: any,
		credentials: Record<string, string>
	): Promise<AgoraSyncResult> {
		throw new SyncError('agora', 'product', 'Integración Agora no implementada aún');
	}

	async syncOrder(
		shopifyOrder: any,
		credentials: Record<string, string>
	): Promise<AgoraSyncResult> {
		throw new SyncError('agora', 'order', 'Integración Agora no implementada aún');
	}
}
