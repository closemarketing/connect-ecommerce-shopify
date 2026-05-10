import logger from "../../../utils/logger.server";

const HOLDED_API_URL = "https://api.holded.com/api";

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface HoldedContact {
	id?: string;
	name: string;
	email?: string;
	phone?: string;
	address?: string;
	city?: string;
	postalCode?: string;
	countryCode?: string;
	taxid?: string;
	[key: string]: any;
}

export interface HoldedProduct {
	id?: string;
	name: string;
	sku?: string;
	price?: number;
	taxid?: string;
	[key: string]: any;
}

export interface HoldedInvoice {
	id?: string;
	contactId: string;
	date?: number;
	notes?: string;
	items?: Array<{ productId?: string; name: string; units: number; price: number; tax?: string }>;
	[key: string]: any;
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Raw HTTP client for the Holded REST API.
 * No business logic — each method maps 1-to-1 to one API endpoint call.
 */
export class HoldedService {
	constructor(private apikey: string) {}

	private async request(path: string, options: RequestInit = {}) {
		const url      = `${HOLDED_API_URL}${path}`;
		const response = await fetch(url, {
			...options,
			headers: {
				key:            this.apikey,
				"Content-Type": "application/json",
				...options.headers,
			},
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Holded API error ${response.status}: ${error}`);
		}

		return response.json();
	}

	// ── Account ───────────────────────────────────────────────────────────────

	/** Validates the API key by hitting a lightweight endpoint. */
	async validateKey(): Promise<boolean> {
		try {
			await this.request("/invoicing/v1/contacts?limit=1");
			return true;
		} catch {
			return false;
		}
	}

	// ── Contacts ──────────────────────────────────────────────────────────────

	async listContacts(limit = 50, page = 1): Promise<HoldedContact[]> {
		const res = await this.request(`/invoicing/v1/contacts?limit=${limit}&page=${page}`);
		logger.info(`✅ ${res.length || 0} contactos obtenidos de Holded`);
		return Array.isArray(res) ? res : [];
	}

	async getContact(id: string): Promise<HoldedContact> {
		return this.request(`/invoicing/v1/contacts/${id}`);
	}

	async createContact(data: HoldedContact): Promise<HoldedContact> {
		logger.info(`📦 Creando contacto "${data.name}" en Holded...`);
		return this.request("/invoicing/v1/contacts", { method: "POST", body: JSON.stringify(data) });
	}

	async updateContact(id: string, data: Partial<HoldedContact>): Promise<HoldedContact> {
		logger.info(`🔄 Actualizando contacto ${id} en Holded...`);
		return this.request(`/invoicing/v1/contacts/${id}`, { method: "PUT", body: JSON.stringify(data) });
	}

	// ── Products ──────────────────────────────────────────────────────────────

	async listProducts(limit = 50, page = 1): Promise<HoldedProduct[]> {
		const res = await this.request(`/invoicing/v1/products?limit=${limit}&page=${page}`);
		return Array.isArray(res) ? res : [];
	}

	async getProduct(id: string): Promise<HoldedProduct> {
		return this.request(`/invoicing/v1/products/${id}`);
	}

	async createProduct(data: HoldedProduct): Promise<HoldedProduct> {
		return this.request("/invoicing/v1/products", { method: "POST", body: JSON.stringify(data) });
	}

	// ── Invoices ──────────────────────────────────────────────────────────────

	async createInvoice(data: HoldedInvoice): Promise<HoldedInvoice> {
		logger.info("📦 Creando factura en Holded...");
		return this.request("/invoicing/v1/invoices", { method: "POST", body: JSON.stringify(data) });
	}

	async getInvoice(id: string): Promise<HoldedInvoice> {
		return this.request(`/invoicing/v1/invoices/${id}`);
	}
}
