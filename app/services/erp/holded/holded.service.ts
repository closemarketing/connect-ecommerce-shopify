const BASE_URL = "https://api.holded.com/api/v2";

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface HoldedContact {
	id?: string;
	name: string;
	email?: string;
	phone?: string;
	mobile?: string;
	address?: string;
	city?: string;
	postalCode?: string;
	countryCode?: string;
	taxid?: string;
	type?: "client" | "supplier" | "debtor" | "creditor";
	[key: string]: any;
}

export interface HoldedProduct {
	id?: string;
	name: string;
	sku?: string;
	price?: number;
	tax?: string;
	description?: string;
	[key: string]: any;
}

export interface HoldedInvoiceItem {
	productId?: string;
	name: string;
	units: number;
	price: number;
	tax?: string;
	discount?: number;
}

export interface HoldedInvoice {
	id?: string;
	contactId: string;
	date?: number;          // Unix timestamp
	notes?: string;
	items?: HoldedInvoiceItem[];
	salesChannelId?: string;
	[key: string]: any;
}

export interface HoldedListResponse<T> {
	items: T[];
	cursor?: string;
	has_more?: boolean;
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Raw HTTP client for the Holded REST API v2.
 * Uses Bearer token (Authorization: Bearer <apikey>).
 * Each method maps 1-to-1 to one API endpoint.
 */
export class HoldedService {
	constructor(private readonly apikey: string) {}

	private async request<T = any>(
		path: string,
		options: RequestInit = {},
	): Promise<T> {
		const url      = `${BASE_URL}${path}`;
		const response = await fetch(url, {
			...options,
			headers: {
				Authorization:  `Bearer ${this.apikey}`,
				"Content-Type": "application/json",
				Accept:         "application/json",
				...(options.headers ?? {}),
			},
		});

		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(`Holded API ${response.status}: ${body}`);
		}

		// 204 No Content
		if (response.status === 204) return undefined as T;

		return response.json() as Promise<T>;
	}

	// ── Auth / Validation ─────────────────────────────────────────────────────

	/**
	 * Validates the API key by listing contacts with a limit of 1.
	 * Returns { ok: true } on success, throws on failure so callers
	 * can inspect the error message.
	 */
	async validateKey(): Promise<{ ok: boolean; status?: number; message?: string }> {
		const url      = `${BASE_URL}/contacts?limit=1`;
		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${this.apikey}`,
				Accept:        "application/json",
			},
		});

		if (response.ok) return { ok: true };

		const body = await response.text().catch(() => "");
		return { ok: false, status: response.status, message: body };
	}

	// ── Contacts ──────────────────────────────────────────────────────────────

	async listContacts(limit = 50, cursor?: string): Promise<HoldedListResponse<HoldedContact>> {
		const params = new URLSearchParams({ limit: String(limit) });
		if (cursor) params.set("cursor", cursor);
		return this.request<HoldedListResponse<HoldedContact>>(`/contacts?${params}`);
	}

	async getContact(id: string): Promise<HoldedContact> {
		return this.request<HoldedContact>(`/contacts/${id}`);
	}

	async createContact(data: HoldedContact): Promise<{ id: string }> {
		return this.request<{ id: string }>("/contacts", {
			method: "POST",
			body:   JSON.stringify(data),
		});
	}

	async updateContact(id: string, data: Partial<HoldedContact>): Promise<{ id: string }> {
		return this.request<{ id: string }>(`/contacts/${id}`, {
			method: "PUT",
			body:   JSON.stringify(data),
		});
	}

	/** Search contacts by name — returns matching contacts array */
	async searchContacts(query: string): Promise<HoldedContact[]> {
		const params = new URLSearchParams({ name: query });
		const res    = await this.request<HoldedListResponse<HoldedContact>>(`/contacts/search?${params}`);
		return res?.items ?? [];
	}

	// ── Products ──────────────────────────────────────────────────────────────

	async listProducts(limit = 50, cursor?: string): Promise<HoldedListResponse<HoldedProduct>> {
		const params = new URLSearchParams({ limit: String(limit) });
		if (cursor) params.set("cursor", cursor);
		return this.request<HoldedListResponse<HoldedProduct>>(`/products?${params}`);
	}

	async getProduct(id: string): Promise<HoldedProduct> {
		return this.request<HoldedProduct>(`/products/${id}`);
	}

	async createProduct(data: HoldedProduct): Promise<{ id: string }> {
		return this.request<{ id: string }>("/products", {
			method: "POST",
			body:   JSON.stringify(data),
		});
	}

	async updateProduct(id: string, data: Partial<HoldedProduct>): Promise<{ id: string }> {
		return this.request<{ id: string }>(`/products/${id}`, {
			method: "PUT",
			body:   JSON.stringify(data),
		});
	}

	async updateProductStock(id: string, quantity: number, warehouseId?: string): Promise<any> {
		const body: Record<string, any> = { quantity };
		if (warehouseId) body.warehouseId = warehouseId;
		return this.request(`/products/${id}/stock`, {
			method: "PUT",
			body:   JSON.stringify(body),
		});
	}

	// ── Sales Invoices ────────────────────────────────────────────────────────

	async listInvoices(limit = 50, cursor?: string): Promise<HoldedListResponse<HoldedInvoice>> {
		const params = new URLSearchParams({ limit: String(limit) });
		if (cursor) params.set("cursor", cursor);
		return this.request<HoldedListResponse<HoldedInvoice>>(`/invoices?${params}`);
	}

	async getInvoice(id: string): Promise<HoldedInvoice> {
		return this.request<HoldedInvoice>(`/invoices/${id}`);
	}

	async createInvoice(data: HoldedInvoice): Promise<{ id: string }> {
		return this.request<{ id: string }>("/invoices", {
			method: "POST",
			body:   JSON.stringify(data),
		});
	}

	async updateInvoice(id: string, data: Partial<HoldedInvoice>): Promise<{ id: string }> {
		return this.request<{ id: string }>(`/invoices/${id}`, {
			method: "PUT",
			body:   JSON.stringify(data),
		});
	}

	// ── Sales Receipts ────────────────────────────────────────────────────────

	async createSalesReceipt(data: HoldedInvoice): Promise<{ id: string }> {
		return this.request<{ id: string }>("/sales-receipts", {
			method: "POST",
			body:   JSON.stringify(data),
		});
	}

	// ── Taxes ─────────────────────────────────────────────────────────────────

	async listTaxes(): Promise<any[]> {
		const res = await this.request<any>("/taxes");
		return Array.isArray(res) ? res : (res?.items ?? []);
	}

	// ── Warehouses ────────────────────────────────────────────────────────────

	async listWarehouses(): Promise<any[]> {
		const res = await this.request<any>("/warehouses");
		return Array.isArray(res) ? res : (res?.items ?? []);
	}

	// ── Sales Channels ────────────────────────────────────────────────────────

	async listSalesChannels(): Promise<any[]> {
		const res = await this.request<any>("/sales-channels");
		return Array.isArray(res) ? res : (res?.items ?? []);
	}
}
