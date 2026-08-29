import prisma from "~/db.server";
import logger from "~/utils/logger.server";
import { OdooService } from "./odoo.service";
import type { OdooCredentials } from "./odoo.service";

const SHOPIFY_API_VERSION = "2025-10";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OdooSyncParams {
	jobId:           number;
	shopId:          number;
	shopDomain:      string;
	accessToken:     string;
	odooCredentials: OdooCredentials;
}

interface SyncProductResult {
	sku:         string;
	productName: string;
	shopifyId?:  string;
	variants:    number;
	action:      "created" | "updated" | "skipped" | "error";
	error?:      string;
}

interface OdooProductTemplate {
	id:                    number;
	name:                  string;
	default_code:          string | false;
	description:           string | false;
	qty_available:         number;
	product_variant_count: number;
	product_variant_ids:   number[];
	image_1920:            string | false;
}

interface OdooProductVariant {
	id:                                    number;
	default_code:                          string | false;
	list_price:                            number;
	weight:                                number;
	qty_available:                         number;
	product_template_attribute_value_ids:  number[];
}

interface OdooAttributeValue {
	id:           number;
	name:         string;
	attribute_id: [number, string] | false;
}

interface OptionValue {
	optionName: string;
	name:       string;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function shopifyGraphQL(
	shopDomain:  string,
	accessToken: string,
	query:       string,
	variables?:  Record<string, any>,
): Promise<any> {
	const url      = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
	const response = await fetch(url, {
		method:  "POST",
		headers: {
			"Content-Type":           "application/json",
			"X-Shopify-Access-Token": accessToken,
		},
		body: JSON.stringify({ query, variables }),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(`Shopify GraphQL ${response.status}: ${body}`);
	}

	const json: any = await response.json();
	if (json.errors?.length) {
		throw new Error(`Shopify GraphQL errors: ${json.errors.map((e: any) => e.message).join(", ")}`);
	}
	return json;
}

async function getFirstLocationId(shopDomain: string, accessToken: string): Promise<string> {
	const query = `
		query {
			locations(first: 1) {
				edges { node { id } }
			}
		}
	`;
	const json  = await shopifyGraphQL(shopDomain, accessToken, query);
	const edges = json?.data?.locations?.edges ?? [];
	if (edges.length === 0) throw new Error("No Shopify locations found");
	return edges[0].node.id;
}

async function findExistingProductId(
	shopDomain:  string,
	accessToken: string,
	skus:        string[],
): Promise<string | null> {
	if (skus.length === 0) return null;
	const searchQuery = skus.map((s) => `sku:${JSON.stringify(s)}`).join(" OR ");
	const query = `
		query findProductBySkus($q: String!) {
			productVariants(first: 1, query: $q) {
				edges { node { product { id } } }
			}
		}
	`;
	const json  = await shopifyGraphQL(shopDomain, accessToken, query, { q: searchQuery });
	const edges = json?.data?.productVariants?.edges ?? [];
	return edges[0]?.node?.product?.id ?? null;
}

async function fetchExistingProductState(
	shopDomain:  string,
	accessToken: string,
	productId:   string,
): Promise<{ hasMedia: boolean; variantIdBySku: Map<string, string> }> {
	const query = `
		query productState($id: ID!) {
			product(id: $id) {
				media(first: 1) { edges { node { id } } }
				variants(first: 100) { edges { node { id sku } } }
			}
		}
	`;
	const json    = await shopifyGraphQL(shopDomain, accessToken, query, { id: productId });
	const product = json?.data?.product;

	const variantIdBySku = new Map<string, string>();
	for (const edge of product?.variants?.edges ?? []) {
		if (edge.node.sku) variantIdBySku.set(edge.node.sku, edge.node.id);
	}

	return { hasMedia: (product?.media?.edges?.length ?? 0) > 0, variantIdBySku };
}

// ── Image upload ──────────────────────────────────────────────────────────────

function sniffImageMime(buffer: Buffer): { mimeType: string; ext: string } {
	if (buffer[0] === 0xff && buffer[1] === 0xd8) return { mimeType: "image/jpeg", ext: "jpg" };
	if (buffer[0] === 0x89 && buffer[1] === 0x50) return { mimeType: "image/png", ext: "png" };
	if (buffer[0] === 0x47 && buffer[1] === 0x49) return { mimeType: "image/gif", ext: "gif" };
	return { mimeType: "image/jpeg", ext: "jpg" };
}

/** Uploads a base64 image (Odoo's image_1920) to Shopify's staged uploads and returns the resourceUrl to attach via productSet's `files`. Returns null (non-fatal) on any failure. */
async function uploadOdooImage(
	shopDomain:    string,
	accessToken:   string,
	base64:        string,
	filenameBase:  string,
): Promise<string | null> {
	try {
		const buffer            = Buffer.from(base64, "base64");
		const { mimeType, ext } = sniffImageMime(buffer);
		const filename          = `${filenameBase}.${ext}`;

		const stagedJson = await shopifyGraphQL(shopDomain, accessToken, `
			mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
				stagedUploadsCreate(input: $input) {
					stagedTargets { url resourceUrl parameters { name value } }
					userErrors { field message }
				}
			}
		`, {
			input: [{ resource: "IMAGE", filename, mimeType, httpMethod: "POST", fileSize: String(buffer.length) }],
		});

		const stagedErrors = stagedJson?.data?.stagedUploadsCreate?.userErrors ?? [];
		if (stagedErrors.length > 0) throw new Error(stagedErrors.map((e: any) => e.message).join(", "));

		const target = stagedJson?.data?.stagedUploadsCreate?.stagedTargets?.[0];
		if (!target) throw new Error("No staged upload target returned");

		const form = new FormData();
		for (const p of target.parameters ?? []) form.append(p.name, p.value);
		form.append("file", new Blob([buffer], { type: mimeType }), filename);

		const uploadRes = await fetch(target.url, { method: "POST", body: form });
		if (!uploadRes.ok) throw new Error(`Staged upload failed: ${uploadRes.status}`);

		return target.resourceUrl as string;
	} catch (err) {
		logger.warn(`Odoo sync: image upload failed — ${err instanceof Error ? err.message : String(err)}`);
		return null;
	}
}

// ── Inventory ─────────────────────────────────────────────────────────────────

async function setInventoryQuantity(
	shopDomain:      string,
	accessToken:     string,
	inventoryItemId: string,
	locationId:      string,
	quantity:        number,
): Promise<void> {
	const json = await shopifyGraphQL(shopDomain, accessToken, `
		mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
			inventorySetQuantities(input: $input) {
				userErrors { field message }
			}
		}
	`, {
		input: {
			name:      "available",
			reason:    "correction",
			quantities: [{ inventoryItemId, locationId, quantity }],
		},
	});
	const errors = json?.data?.inventorySetQuantities?.userErrors ?? [];
	if (errors.length > 0) throw new Error(`inventorySetQuantities errors: ${errors.map((e: any) => e.message).join(", ")}`);
}

async function activateAndSetInventory(
	shopDomain:      string,
	accessToken:     string,
	inventoryItemId: string,
	locationId:      string,
	quantity:        number,
): Promise<void> {
	await shopifyGraphQL(shopDomain, accessToken, `
		mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
			inventoryItemUpdate(id: $id, input: $input) {
				inventoryItem { id }
				userErrors { field message }
			}
		}
	`, { id: inventoryItemId, input: { tracked: true } });

	await shopifyGraphQL(shopDomain, accessToken, `
		mutation inventoryActivate($inventoryItemId: ID!, $locationId: ID!) {
			inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) {
				inventoryLevel { id }
				userErrors { field message }
			}
		}
	`, { inventoryItemId, locationId });

	await setInventoryQuantity(shopDomain, accessToken, inventoryItemId, locationId, quantity);
}

// ── Variant attributes → Shopify options ──────────────────────────────────────

function buildVariantOptionValues(
	variants:    OdooProductVariant[],
	attrValueMap: Map<number, { name: string; attributeName: string }>,
): { optionsOrder: string[]; byVariantId: Map<number, OptionValue[]> } {
	const optionsOrder = new Array<string>();
	const byVariantId   = new Map<number, OptionValue[]>();

	for (const v of variants) {
		const ovs: OptionValue[] = [];
		for (const attrValId of v.product_template_attribute_value_ids ?? []) {
			const info = attrValueMap.get(attrValId);
			if (!info) continue;
			ovs.push({ optionName: info.attributeName, name: info.name });
			if (!optionsOrder.includes(info.attributeName)) optionsOrder.push(info.attributeName);
		}
		byVariantId.set(v.id, ovs);
	}

	return { optionsOrder, byVariantId };
}

function buildProductOptions(
	optionsOrder: string[],
	byVariantId:  Map<number, OptionValue[]>,
): Array<{ name: string; position: number; values: Array<{ name: string }> }> {
	const valuesByOption = new Map<string, string[]>();
	for (const ovs of byVariantId.values()) {
		for (const ov of ovs) {
			const arr = valuesByOption.get(ov.optionName) ?? [];
			if (!arr.includes(ov.name)) arr.push(ov.name);
			valuesByOption.set(ov.optionName, arr);
		}
	}

	return optionsOrder.map((name, idx) => ({
		name,
		position: idx + 1,
		values:   (valuesByOption.get(name) ?? []).map((v) => ({ name: v })),
	}));
}

// ── Product family sync ───────────────────────────────────────────────────────

async function syncOneFamily(
	shopDomain:   string,
	accessToken:  string,
	locationId:   string,
	template:     OdooProductTemplate,
	variants:     OdooProductVariant[],
	attrValueMap: Map<number, { name: string; attributeName: string }>,
): Promise<SyncProductResult> {
	const validVariants = variants.filter((v) => v.default_code);

	if (validVariants.length === 0) {
		return { sku: "", productName: template.name, variants: 0, action: "skipped", error: "Sin SKU — producto no sincronizado" };
	}

	const skus           = validVariants.map((v) => v.default_code as string);
	const isMultiVariant = validVariants.length > 1;

	const existingProductId = await findExistingProductId(shopDomain, accessToken, skus);

	let hasMedia = false;
	let variantIdBySku = new Map<string, string>();
	if (existingProductId) {
		const state = await fetchExistingProductState(shopDomain, accessToken, existingProductId);
		hasMedia       = state.hasMedia;
		variantIdBySku = state.variantIdBySku;
	}

	let productOptions: Array<{ name: string; position: number; values: Array<{ name: string }> }> | undefined;
	let variantOptionValues = new Map<number, OptionValue[]>();
	if (isMultiVariant) {
		const built = buildVariantOptionValues(validVariants, attrValueMap);
		variantOptionValues = built.byVariantId;
		productOptions      = buildProductOptions(built.optionsOrder, variantOptionValues);
	}

	let filesInput: Array<{ originalSource: string; alt: string }> | undefined;
	if (!hasMedia && template.image_1920) {
		const resourceUrl = await uploadOdooImage(shopDomain, accessToken, template.image_1920, skus[0]);
		if (resourceUrl) filesInput = [{ originalSource: resourceUrl, alt: template.name }];
	}

	const variantsInput = validVariants.map((v) => {
		const sku             = v.default_code as string;
		const optionValues    = isMultiVariant
			? (variantOptionValues.get(v.id) ?? [])
			: [{ optionName: "Title", name: "Default Title" }];
		const existingVariantId = variantIdBySku.get(sku);

		return {
			...(existingVariantId && { id: existingVariantId }),
			sku,
			price: v.list_price.toFixed(2),
			optionValues,
		};
	});

	const input: Record<string, any> = {
		title:           template.name,
		descriptionHtml: template.description || "",
		status:          "ACTIVE",
		variants:        variantsInput,
		...(productOptions && { productOptions }),
		...(filesInput && { files: filesInput }),
	};

	const json = await shopifyGraphQL(shopDomain, accessToken, `
		mutation productSet($input: ProductSetInput!, $synchronous: Boolean!, $identifier: ProductSetIdentifiers) {
			productSet(input: $input, synchronous: $synchronous, identifier: $identifier) {
				product {
					id
					variants(first: 100) {
						edges { node { id sku inventoryItem { id tracked } } }
					}
				}
				userErrors { field message }
			}
		}
	`, {
		input,
		synchronous: true,
		identifier:  existingProductId ? { id: existingProductId } : null,
	});

	const errors = json?.data?.productSet?.userErrors ?? [];
	if (errors.length > 0) {
		throw new Error(`productSet errors: ${errors.map((e: any) => e.message).join(", ")}`);
	}

	const product          = json?.data?.productSet?.product;
	const shopifyProductId: string | undefined = product?.id;

	for (const edge of product?.variants?.edges ?? []) {
		const node        = edge.node;
		const odooVariant = validVariants.find((v) => v.default_code === node.sku);
		if (!odooVariant || !node.inventoryItem?.id) continue;

		const stock = Math.max(0, Math.round(odooVariant.qty_available ?? 0));
		try {
			if (node.inventoryItem.tracked) {
				await setInventoryQuantity(shopDomain, accessToken, node.inventoryItem.id, locationId, stock);
			} else {
				await activateAndSetInventory(shopDomain, accessToken, node.inventoryItem.id, locationId, stock);
			}
		} catch (err) {
			logger.warn(`Odoo sync: inventory update failed for SKU ${node.sku} — ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	return {
		sku:         skus[0],
		productName: template.name,
		shopifyId:   shopifyProductId,
		variants:    validVariants.length,
		action:      existingProductId ? "updated" : "created",
	};
}

// ── Main exported function ────────────────────────────────────────────────────

export async function runOdooSync(params: OdooSyncParams): Promise<void> {
	const { jobId, shopId, shopDomain, accessToken, odooCredentials } = params;

	await prisma.odooSyncJob.update({
		where: { id: jobId },
		data:  { status: "RUNNING", startedAt: new Date() },
	});

	const logEntries: SyncProductResult[] = [];
	let syncedCount = 0;
	let errorCount  = 0;

	try {
		const odoo = new OdooService(odooCredentials);

		// Fetch all active product templates, paginated
		const templates: OdooProductTemplate[] = [];
		const PAGE = 100;
		let offset = 0;
		for (;;) {
			const page = await odoo.searchRead<OdooProductTemplate>(
				"product.template",
				[["active", "=", true]],
				["id", "name", "default_code", "description", "qty_available", "product_variant_count", "product_variant_ids", "image_1920"],
				{ limit: PAGE, offset },
			);
			templates.push(...page);
			if (page.length < PAGE) break;
			offset += PAGE;
		}

		logger.info(`Odoo sync [job ${jobId}]: ${templates.length} product templates fetched`);
		await prisma.odooSyncJob.update({ where: { id: jobId }, data: { totalProducts: templates.length } });

		// Fetch all variants (product.product) referenced by these templates, batched
		const allVariantIds = [...new Set(templates.flatMap((t) => t.product_variant_ids ?? []))];
		const variantsById   = new Map<number, OdooProductVariant>();
		for (let i = 0; i < allVariantIds.length; i += 200) {
			const batch = allVariantIds.slice(i, i + 200);
			const rows  = await odoo.searchRead<OdooProductVariant>(
				"product.product",
				[["id", "in", batch]],
				["id", "default_code", "list_price", "weight", "qty_available", "product_template_attribute_value_ids"],
			);
			for (const r of rows) variantsById.set(r.id, r);
		}

		// Fetch all attribute values referenced by those variants, batched
		const allAttrValueIds = [...new Set(
			[...variantsById.values()].flatMap((v) => v.product_template_attribute_value_ids ?? []),
		)];
		const attrValueMap = new Map<number, { name: string; attributeName: string }>();
		for (let i = 0; i < allAttrValueIds.length; i += 200) {
			const batch = allAttrValueIds.slice(i, i + 200);
			const rows  = await odoo.searchRead<OdooAttributeValue>(
				"product.template.attribute.value",
				[["id", "in", batch]],
				["id", "name", "attribute_id"],
			);
			for (const r of rows) {
				if (!r.attribute_id) continue;
				attrValueMap.set(r.id, { name: r.name, attributeName: r.attribute_id[1] });
			}
		}

		const locationId = await getFirstLocationId(shopDomain, accessToken);

		for (let i = 0; i < templates.length; i++) {
			const template = templates[i];
			const variants = (template.product_variant_ids ?? [])
				.map((id) => variantsById.get(id))
				.filter((v): v is OdooProductVariant => Boolean(v));

			try {
				const result = await syncOneFamily(shopDomain, accessToken, locationId, template, variants, attrValueMap);
				logEntries.push(result);
				syncedCount++;
			} catch (err) {
				const errMsg = err instanceof Error ? err.message : String(err);
				logger.error(`Odoo sync [job ${jobId}]: error on product "${template.name}": ${errMsg}`);
				logEntries.push({ sku: template.default_code || "", productName: template.name, variants: variants.length, action: "error", error: errMsg });
				errorCount++;
			}

			if ((i + 1) % 5 === 0) {
				await prisma.odooSyncJob.update({
					where: { id: jobId },
					data:  { syncedProducts: syncedCount, errorCount },
				});
			}

			await sleep(300);
		}

		const errorEntries   = logEntries.filter((e) => e.action === "error");
		const skippedEntries = logEntries.filter((e) => e.action === "skipped");
		const summaryLines: string[] = [
			`Total: ${templates.length} | Creados: ${logEntries.filter((e) => e.action === "created").length} | Actualizados: ${logEntries.filter((e) => e.action === "updated").length} | Sin SKU: ${skippedEntries.length} | Errores: ${errorEntries.length}`,
		];
		if (errorEntries.length > 0) {
			summaryLines.push("--- Errores ---");
			for (const e of errorEntries) summaryLines.push(`• ${e.productName} (${e.sku || "sin SKU"}): ${e.error}`);
		}
		if (skippedEntries.length > 0) {
			summaryLines.push(`--- Sin SKU (${skippedEntries.length}) ---`);
			for (const e of skippedEntries) summaryLines.push(`• ${e.productName}`);
		}
		const summary = summaryLines.join("\n");

		await prisma.odooSyncJob.update({
			where: { id: jobId },
			data:  {
				status:         "COMPLETED",
				syncedProducts: syncedCount,
				errorCount,
				log:            JSON.stringify(logEntries),
				summary,
				completedAt:    new Date(),
			},
		});

		const integration = await prisma.integration.findUnique({ where: { name: "odoo" } });
		if (integration) {
			await prisma.integrationCredential.upsert({
				where: {
					sessionId_integrationId_key: {
						sessionId:     shopDomain,
						integrationId: integration.id,
						key:           "last_sync_at",
					},
				},
				update: { value: new Date().toISOString() },
				create: {
					sessionId:     shopDomain,
					integrationId: integration.id,
					key:           "last_sync_at",
					value:         new Date().toISOString(),
				},
			});
		}

		logger.info(`Odoo sync [job ${jobId}]: COMPLETED. synced=${syncedCount} errors=${errorCount}`);
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : String(err);
		logger.error(`Odoo sync [job ${jobId}]: FAILED — ${errMsg}`);

		await prisma.odooSyncJob.update({
			where: { id: jobId },
			data:  {
				status:      "FAILED",
				errorCount,
				log:         JSON.stringify(logEntries),
				completedAt: new Date(),
			},
		}).catch(() => {});
	}
}
