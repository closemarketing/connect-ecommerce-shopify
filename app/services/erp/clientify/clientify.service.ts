import logger from "../../../utils/logger.server";
import { createSyncLog } from "../../logging/sync-logger.server";

const CLIENTIFY_API_URL = "https://api.clientify.net/v1";

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface ClientifyContact {
	id?: number;
	first_name: string;
	last_name: string;
	email: string;
	phone?: string;
	mobile?: string;
	address?: string;
	address_2?: string;
	city?: string;
	state?: string;
	postal_code?: string;
	country?: string;
	taxpayer_identification_number?: string;
	custom_fields?: Array<{ field: string; value: string }>;
}

export interface ClientifyProduct {
	id?: number;
	sku: string;
	name: string;
	description?: string;
	price: number;
	owner?: number;
	custom_fields?: Array<{ field: string; value: string }>;
}

export interface ClientifyDeal {
	id?: number;
	name: string;
	contact_id: number;
	owner?: number;
	amount?: number;
	currency?: string;
	description?: string;
	pipeline?: string;
	pipeline_stage?: string;
	products?: Array<{ product_id: number; quantity: number }>;
	custom_fields?: Array<{ field: string; value: string }>;
}

export interface ClientifyAccountInfo {
	user_id: number;
	name: string;
	email: string;
	username?: string;
	company?: string;
	timezone?: string;
	language?: string;
	[key: string]: any;
}

export interface ClientifyPipeline {
	id: number;
	url: string;
	name: string;
	stages?: ClientifyStage[];
}

export interface ClientifyStage {
	id: number;
	url: string;
	pipeline: string;
	name: string;
	position: number;
	probability: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Raw HTTP client for the Clientify REST API.
 * No business logic — each method maps 1-to-1 to one API endpoint call.
 */
export class ClientifyService {
	constructor(private apikey: string) {}

	private async request(endpoint: string, options: RequestInit = {}) {
		const url      = `${CLIENTIFY_API_URL}${endpoint}`;
		const response = await fetch(url, {
			...options,
			headers: {
				Authorization:  `Token ${this.apikey}`,
				"Content-Type": "application/json",
				...options.headers,
			},
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Clientify API error ${response.status}: ${error}`);
		}

		return response.json();
	}

	// ── Account ───────────────────────────────────────────────────────────────

	async getAccountInfo(): Promise<ClientifyAccountInfo> {
		logger.info("📋 Obteniendo información de la cuenta de Clientify...");
		const info = await this.request("/me");
		logger.info(`✅ Cuenta: ${info.name} (${info.email})`);
		return info;
	}

	// ── Contacts ──────────────────────────────────────────────────────────────

	async findContactByShopifyId(shopifyId: string): Promise<ClientifyContact | null> {
		try {
			const res = await this.request(`/contacts/?in_shopify=${shopifyId}`);
			return res.results?.[0] || null;
		} catch (error) {
			logger.error("Error buscando contacto por Shopify ID:", error);
			return null;
		}
	}

	async findContactByNif(nif: string): Promise<ClientifyContact | null> {
		if (!nif) return null;
		try {
			const res = await this.request(`/contacts/?taxpayer_identification_number=${encodeURIComponent(nif)}`);
			return res.results?.[0] || null;
		} catch (error) {
			logger.error("Error buscando contacto por NIF:", error);
			return null;
		}
	}

	async findContactByEmail(email: string): Promise<ClientifyContact | null> {
		if (!email) return null;
		try {
			const res = await this.request(`/contacts/?email=${encodeURIComponent(email)}`);
			return res.results?.[0] || null;
		} catch (error) {
			logger.error("Error buscando contacto por email:", error);
			return null;
		}
	}

	async createContact(data: ClientifyContact): Promise<ClientifyContact> {
		return this.request("/contacts/", { method: "POST", body: JSON.stringify(data) });
	}

	async updateContact(id: number, data: ClientifyContact): Promise<void> {
		await this.request(`/contacts/${id}/`, { method: "PUT", body: JSON.stringify(data) });
	}

	/** Create-or-update: resolves by shopify_customer_id custom field, then email. */
	async syncContact(data: ClientifyContact): Promise<number> {
		const shopifyId  = data.custom_fields?.find((f) => f.field === "shopify_customer_id")?.value;
		let existing     = shopifyId ? await this.findContactByShopifyId(shopifyId) : null;
		if (!existing && data.email) existing = await this.findContactByEmail(data.email);

		if (existing) {
			logger.info(`✅ Contacto encontrado (ID: ${existing.id}), actualizando...`);
			await this.updateContact(existing.id!, data);
			return existing.id!;
		}

		logger.info("📦 Creando nuevo contacto en Clientify...");
		const created = await this.createContact(data);
		logger.info(`✅ Contacto creado con ID: ${created.id}`);
		return created.id!;
	}

	// ── Products ──────────────────────────────────────────────────────────────

	async findProductByShopifyId(shopifyId: string): Promise<ClientifyProduct | null> {
		try {
			const res = await this.request(`/products/?custom_fields__shopify_product_id=${shopifyId}`);
			return res.results?.[0] || null;
		} catch (error) {
			logger.error("Error buscando producto por Shopify ID:", error);
			return null;
		}
	}

	async findProductBySku(sku: string): Promise<ClientifyProduct | null> {
		if (!sku) return null;
		try {
			const res = await this.request(`/products/?sku=${encodeURIComponent(sku)}`);
			return res.results?.[0] || null;
		} catch (error) {
			logger.error("Error buscando producto por SKU:", error);
			return null;
		}
	}

	async createProduct(data: ClientifyProduct): Promise<ClientifyProduct> {
		return this.request("/products/", { method: "POST", body: JSON.stringify(data) });
	}

	async updateProduct(id: number, data: Omit<ClientifyProduct, "sku">): Promise<void> {
		await this.request(`/products/${id}/`, { method: "PUT", body: JSON.stringify(data) });
	}

	/** Create-or-update: resolves by shopify_variant_id custom field, then SKU. */
	async syncProduct(data: ClientifyProduct): Promise<number> {
		const variantId  = data.custom_fields?.find((f) => f.field === "shopify_variant_id")?.value;
		let existing     = variantId ? await this.findProductByShopifyId(variantId) : null;
		if (!existing && data.sku) existing = await this.findProductBySku(data.sku);

		if (existing) {
			logger.info(`✅ Producto encontrado (ID: ${existing.id}), actualizando...`);
			const { sku: _sku, ...withoutSku } = data;
			await this.updateProduct(existing.id!, withoutSku);
			return existing.id!;
		}

		logger.info("📦 Creando nuevo producto en Clientify...");
		const created = await this.createProduct(data);
		logger.info(`✅ Producto creado con ID: ${created.id}`);
		return created.id!;
	}

	// ── Deals ─────────────────────────────────────────────────────────────────

	async findDealByShopifyOrderId(shopifyOrderId: string): Promise<ClientifyDeal | null> {
		if (!shopifyOrderId) return null;
		try {
			const res = await this.request(`/deals/?query=${encodeURIComponent(shopifyOrderId)}`);
			return res.results?.[0] || null;
		} catch (error) {
			logger.error("Error buscando deal por Shopify Order ID:", error);
			return null;
		}
	}

	async createDeal(data: ClientifyDeal): Promise<ClientifyDeal> {
		return this.request("/deals/", { method: "POST", body: JSON.stringify(data) });
	}

	async updateDeal(id: number, data: ClientifyDeal): Promise<void> {
		await this.request(`/deals/${id}/`, { method: "PUT", body: JSON.stringify(data) });
	}

	/** Create-or-update: resolves by shopify_order_id custom field. */
	async syncDeal(data: ClientifyDeal): Promise<number> {
		const shopifyOrderId = data.custom_fields?.find((f) => f.field === "shopify_order_id")?.value;
		const existing       = shopifyOrderId ? await this.findDealByShopifyOrderId(shopifyOrderId) : null;

		if (existing) {
			logger.info(`✅ Deal encontrado (ID: ${existing.id}), actualizando...`);
			await this.updateDeal(existing.id!, data);
			return existing.id!;
		}

		logger.info("📦 Creando nuevo deal en Clientify...");
		const created = await this.createDeal(data);
		logger.info(`✅ Deal creado con ID: ${created.id}`);
		return created.id!;
	}

	// ── Pipelines ─────────────────────────────────────────────────────────────

	async listPipelines(): Promise<ClientifyPipeline[]> {
		const res = await fetch(`${CLIENTIFY_API_URL}/deals/pipelines/`, {
			headers: { Authorization: `Token ${this.apikey}`, "Content-Type": "application/json" },
		});
		if (!res.ok) throw new Error(`Error al obtener pipelines: ${res.statusText}`);
		const data = await res.json();
		logger.info(`✅ ${data.results?.length || 0} pipelines obtenidos`);
		return data.results || [];
	}

	async getPipeline(pipelineId: number): Promise<ClientifyPipeline> {
		const res = await fetch(`${CLIENTIFY_API_URL}/deals/pipelines/${pipelineId}/`, {
			headers: { Authorization: `Token ${this.apikey}`, "Content-Type": "application/json" },
		});
		if (!res.ok) throw new Error(`Error al obtener pipeline ${pipelineId}: ${res.statusText}`);
		return res.json();
	}

	async createPipeline(name: string, shopId: number): Promise<ClientifyPipeline> {
		const body = { name, stages: [], is_default: false };
		const url  = `${CLIENTIFY_API_URL}/deals/pipelines/`;

		const res = await fetch(url, {
			method:  "POST",
			headers: { Authorization: `Token ${this.apikey}`, "Content-Type": "application/json" },
			body:    JSON.stringify(body),
		});

		if (!res.ok) {
			const errorText = await res.text();
			await createSyncLog({ shopId, syncType: "PIPELINE", shopifyId: `pipeline-${name}`, status: "ERROR", method: "POST", url, errorMessage: `${res.status}: ${errorText.substring(0, 500)}`, requestData: body }).catch(() => null);
			throw new Error(`Error al crear pipeline: ${res.status} ${errorText}`);
		}

		const pipeline = await res.json();
		await createSyncLog({ shopId, syncType: "PIPELINE", shopifyId: `pipeline-${name}`, externalId: pipeline.id, status: "SUCCESS", method: "POST", url, requestData: body, responseData: pipeline }).catch(() => null);
		logger.info(`✅ Pipeline "${name}" creado con ID: ${pipeline.id}`);
		return pipeline;
	}

	async listStagesAll(): Promise<ClientifyStage[]> {
		let all: ClientifyStage[] = [];
		let nextUrl: string | null = `${CLIENTIFY_API_URL}/deals/pipelines/stages/`;

		while (nextUrl) {
			const res = await fetch(nextUrl, {
				headers: { Authorization: `Token ${this.apikey}`, "Content-Type": "application/json" },
			});
			if (!res.ok) throw new Error(`Error al obtener stages: ${res.statusText}`);
			const page: { results: ClientifyStage[]; next: string | null } = await res.json();
			all     = all.concat(page.results || []);
			nextUrl = page.next;
		}

		return all;
	}

	async getStagesByPipeline(pipelineId: number): Promise<ClientifyStage[]> {
		const all         = await this.listStagesAll();
		const pipelineUrl = `${CLIENTIFY_API_URL}/deals/pipelines/${pipelineId}/`;
		return all.filter((s) => s.pipeline === pipelineUrl);
	}

	async createStage(pipelineId: number, name: string, shopId: number, position: number = 1, probability: number = 0): Promise<ClientifyStage> {
		const body = { name, position, probability, pipeline: `${CLIENTIFY_API_URL}/deals/pipelines/${pipelineId}/` };
		const url  = `${CLIENTIFY_API_URL}/deals/pipelines/stages/`;

		const res = await fetch(url, {
			method:  "POST",
			headers: { Authorization: `Token ${this.apikey}`, "Content-Type": "application/json" },
			body:    JSON.stringify(body),
		});

		if (!res.ok) {
			const errorText = await res.text();
			await createSyncLog({ shopId, syncType: "STAGE", shopifyId: `stage-${pipelineId}-${name}`, status: "ERROR", method: "POST", url, errorMessage: `${res.status}: ${errorText}`, requestData: body }).catch(() => null);
			throw new Error(`Error al crear stage: ${res.statusText}`);
		}

		const stage = await res.json();
		await createSyncLog({ shopId, syncType: "STAGE", shopifyId: `stage-${pipelineId}-${name}`, externalId: stage.id, status: "SUCCESS", method: "POST", url, requestData: body, responseData: stage }).catch(() => null);
		logger.info(`✅ Stage "${name}" creado con ID: ${stage.id}`);
		return stage;
	}

	async updateStage(stageId: number, name: string, shopId: number, probability?: number): Promise<ClientifyStage> {
		const body: any = { name };
		if (probability !== undefined) body.probability = probability;
		const url = `${CLIENTIFY_API_URL}/deals/pipelines/stages/${stageId}/`;

		const res = await fetch(url, {
			method:  "PATCH",
			headers: { Authorization: `Token ${this.apikey}`, "Content-Type": "application/json" },
			body:    JSON.stringify(body),
		});

		if (!res.ok) {
			const errorText = await res.text();
			await createSyncLog({ shopId, syncType: "STAGE", shopifyId: `stage-update-${stageId}`, status: "ERROR", method: "PATCH", url, errorMessage: `${res.status}: ${errorText}`, requestData: body }).catch(() => null);
			throw new Error(`Error al actualizar stage: ${res.statusText}`);
		}

		const stage = await res.json();
		await createSyncLog({ shopId, syncType: "STAGE", shopifyId: `stage-update-${stageId}`, externalId: stage.id, status: "SUCCESS", method: "PATCH", url, requestData: body, responseData: stage }).catch(() => null);
		return stage;
	}

	async pipelineExists(name: string): Promise<ClientifyPipeline | null> {
		const all = await this.listPipelines();
		return all.find((p) => p.name.toLowerCase() === name.toLowerCase()) || null;
	}
}
