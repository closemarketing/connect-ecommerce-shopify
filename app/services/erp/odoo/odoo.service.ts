/**
 * Raw JSON-RPC client for Odoo's standard external API.
 * Docs: https://www.odoo.com/documentation/18.0/developer/reference/external_api.html
 *
 * Every instance is single-shop: credentials are injected once and the
 * session uid is cached after the first successful login.
 */

export interface OdooCredentials {
	url:      string;
	dbname:   string;
	username: string;
	apikey:   string; // Password or Odoo 17+ API key
}

interface JsonRpcResponse<T> {
	jsonrpc: string;
	id?:     number;
	result?: T;
	error?: {
		code:    number;
		message: string;
		data?:   { message?: string; debug?: string };
	};
}

export class OdooService {
	private readonly baseUrl: string;
	private uid?: number;

	constructor(private readonly creds: OdooCredentials) {
		this.baseUrl = (creds.url ?? "").replace(/\/+$/, "");
	}

	private async call<T = any>(service: "common" | "object", method: string, args: any[]): Promise<T> {
		if (!this.baseUrl || !this.creds.dbname || !this.creds.username || !this.creds.apikey) {
			throw new Error("Odoo credentials incomplete (url, dbname, username, apikey required)");
		}

		const response = await fetch(`${this.baseUrl}/jsonrpc`, {
			method:  "POST",
			headers: { "Content-Type": "application/json" },
			body:    JSON.stringify({
				jsonrpc: "2.0",
				method:  "call",
				params:  { service, method, args },
				id:      Math.floor(Math.random() * 1_000_000),
			}),
		});

		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(`Odoo JSON-RPC ${response.status}: ${body}`);
		}

		const json = (await response.json()) as JsonRpcResponse<T>;
		if (json.error) {
			const message = json.error.data?.message ?? json.error.message ?? "Odoo JSON-RPC error";
			throw new Error(message);
		}
		return json.result as T;
	}

	// ── Auth ──────────────────────────────────────────────────────────────────

	async login(): Promise<number> {
		if (this.uid) return this.uid;

		const uid = await this.call<number | false>("common", "login", [
			this.creds.dbname,
			this.creds.username,
			this.creds.apikey,
		]);

		if (!uid) throw new Error("Odoo login failed — check url/dbname/username/apikey");

		this.uid = uid;
		return uid;
	}

	async validateCredentials(): Promise<boolean> {
		try {
			await this.login();
			return true;
		} catch {
			return false;
		}
	}

	// ── Generic object access ────────────────────────────────────────────────

	private async executeKw<T = any>(
		model:  string,
		method: string,
		args:   any[] = [],
		kwargs: Record<string, any> = {},
	): Promise<T> {
		const uid = await this.login();
		return this.call<T>("object", "execute_kw", [
			this.creds.dbname,
			uid,
			this.creds.apikey,
			model,
			method,
			args,
			kwargs,
		]);
	}

	async searchRead<T = any>(
		model:  string,
		domain: any[] = [],
		fields: string[] = [],
		opts:   { limit?: number; offset?: number } = {},
	): Promise<T[]> {
		return this.executeKw<T[]>(model, "search_read", [domain], { fields, ...opts });
	}

	async create(model: string, data: Record<string, any>): Promise<number> {
		return this.executeKw<number>(model, "create", [data]);
	}

	async write(model: string, ids: number[], data: Record<string, any>): Promise<boolean> {
		return this.executeKw<boolean>(model, "write", [ids, data]);
	}

	/** Calls an arbitrary method (e.g. `action_confirm`) on one or more records. */
	async callMethod<T = any>(model: string, method: string, args: any[] = []): Promise<T> {
		return this.executeKw<T>(model, method, args);
	}
}
