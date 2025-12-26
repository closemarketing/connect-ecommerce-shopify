/**
 * Registro centralizado de adaptadores de integración
 * Mantiene un map de todos los adaptadores disponibles
 */

import type { IntegrationAdapter } from './base/integration-adapter.server';
import { ClientifyAdapter } from './clientify/clientify-adapter.server';
import { AgoraAdapter } from './agora/agora-adapter.server';

// Map de adaptadores registrados
const adapters = new Map<string, IntegrationAdapter>();

/**
 * Inicializar y registrar todos los adaptadores
 */
function initializeAdapters() {
	if (adapters.size > 0) {
		return; // Ya inicializados
	}

	// Registrar Clientify
	const clientifyAdapter = new ClientifyAdapter();
	adapters.set(clientifyAdapter.getConfig().name, clientifyAdapter);

	// Registrar Agora
	const agoraAdapter = new AgoraAdapter();
	adapters.set(agoraAdapter.getConfig().name, agoraAdapter);

	console.log(`✅ Adaptadores registrados: ${Array.from(adapters.keys()).join(', ')}`);
}

/**
 * Obtener un adaptador por nombre
 */
export function getAdapter(integrationName: string): IntegrationAdapter | undefined {
	initializeAdapters();
	return adapters.get(integrationName);
}

/**
 * Obtener todos los adaptadores registrados
 */
export function getAllAdapters(): IntegrationAdapter[] {
	initializeAdapters();
	return Array.from(adapters.values());
}

/**
 * Verificar si existe un adaptador para una integración
 */
export function hasAdapter(integrationName: string): boolean {
	initializeAdapters();
	return adapters.has(integrationName);
}

/**
 * Obtener solo los adaptadores habilitados
 */
export function getEnabledAdapters(): IntegrationAdapter[] {
	initializeAdapters();
	return Array.from(adapters.values()).filter(
		adapter => adapter.getConfig().enabled
	);
}

/**
 * Registrar un nuevo adaptador dinámicamente
 * (útil para plugins o extensiones)
 */
export function registerAdapter(adapter: IntegrationAdapter): void {
	const config = adapter.getConfig();
	adapters.set(config.name, adapter);
	console.log(`✅ Adaptador registrado: ${config.displayName}`);
}

// Inicializar al cargar el módulo
initializeAdapters();
