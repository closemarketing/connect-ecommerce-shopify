/**
 * Integration registry — metadata for every supported integration.
 *
 * To add a new integration:
 *   1. Add an entry to INTEGRATION_REGISTRY below.
 *   2. Add it to prisma/seed.js so the DB row exists.
 *   3. Implement the service in app/services/erp/<name>/.
 */

export interface CredentialField {
	key:         string;
	label:       string;
	type:        "text" | "password" | "url" | "email";
	helpText?:   string;
	required?:   boolean;
	placeholder?: string;
}

export interface IntegrationDefinition {
	name:         string;          // unique slug, must match DB Integration.name
	hidden?:      boolean;         // if true, not shown in the integrations list
	displayName:  string;
	description:  string;
	icon?:        string;          // emoji or asset path
	logoUrl?:     string;          // URL to logo image shown in the integration card
	docsUrl?:     string;
	websiteUrl?:  string;
	credentials:  CredentialField[];
	/** Sub-routes shown in the left nav when this integration is active */
	subRoutes?: Array<{
		path:  string;            // relative to /app/integrations/<name>/
		label: string;
	}>;
}

export const INTEGRATION_REGISTRY: IntegrationDefinition[] = [
	{
		name:        "clientify",
		hidden:      true,
		displayName: "Clientify",
		description: "Sincroniza clientes, productos y pedidos con Clientify CRM.",
		icon:        "🟢",
		docsUrl:     "https://docs.clientify.com/api",
		websiteUrl:  "https://clientify.com",
		credentials: [
			{
				key:         "apikey",
				label:       "API Key",
				type:        "password",
				required:    true,
				helpText:    "Obtén tu API Key desde el panel de Clientify en Configuración > API.",
				placeholder: "Token de Clientify",
			},
		],
		subRoutes: [
			{ path: "pipelines", label: "Pipelines" },
		],
	},
	{
		name:        "holded",
		displayName: "Holded",
		description: "Sincroniza contactos, productos y facturas con Holded ERP.",
		icon:        "🟣",
		docsUrl:     "https://developers.holded.com/reference",
		websiteUrl:  "https://www.holded.com",
		credentials: [
			{
				key:      "apikey",
				label:    "API Key",
				type:     "password",
				required: true,
				helpText: "Genera tu API Key en Holded > Configuración > Desarrolladores.",
			},
		],
		subRoutes: [
			{ path: "holded", label: "Configuración de pedidos" },
		],
	},
];

export function getIntegrationDefinition(name: string): IntegrationDefinition | undefined {
	return INTEGRATION_REGISTRY.find((i) => i.name === name);
}

export function listIntegrationDefinitions(): IntegrationDefinition[] {
	return INTEGRATION_REGISTRY.filter((i) => !i.hidden);
}
