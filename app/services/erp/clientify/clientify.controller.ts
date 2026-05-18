import type { ERPController, SyncResult } from "../erp-controller.interface";
import { ClientifyService } from "./clientify.service";
import {
	mapShopifyOrderToClientifyContact,
	mapShopifyCustomerToClientifyContact,
	mapShopifyLineItemToClientifyProduct,
	mapShopifyOrderToClientifyDeal,
	mapLineItemsToClientifyDealItems,
} from "./clientify.service-helper";
import {
	logCustomerSync,
	logProductSync,
	logDealSync,
	logSyncError,
} from "../../logging/sync-logger.server";
import logger from "../../../utils/logger.server";
import db from "../../../db.server";

/**
 * Clientify ERP controller.
 *
 * Receives credentials in the constructor and exposes high-level sync operations.
 * Raw API calls are delegated to ClientifyService.
 * Data mapping is delegated to clientify.service-helper.
 *
 * Direction support:
 *   SHOPIFY → CLIENTIFY  ✅  (syncOrderToERP)
 *   CLIENTIFY → SHOPIFY  ❌  (Clientify is a CRM — does not own product/inventory master data)
 */
export class ClientifyController implements ERPController {
	private service: ClientifyService;

	constructor(private apikey: string) {
		this.service = new ClientifyService(apikey);
	}

	getName(): string {
		return "clientify";
	}

	// ── Credentials ───────────────────────────────────────────────────────────

	async validateCredentials(): Promise<boolean> {
		try {
			await this.service.getAccountInfo();
			return true;
		} catch {
			return false;
		}
	}

	// ── Shopify → ERP ─────────────────────────────────────────────────────────

	/**
	 * Full order sync: contact → products → deal.
	 * Called by the orders/create and orders/updated Shopify webhooks.
	 */
	async syncOrderToERP(orderData: any, shopId: number): Promise<SyncResult> {
		try {
			const order = typeof orderData === "string" ? JSON.parse(orderData) : orderData;

			logger.info(`🔄 Iniciando sincronización del pedido #${order.order_number} con Clientify...`);

			// Step 1 — Contact
			logger.info("👤 Paso 1/3: Sincronizando contacto...");
			const contactData = mapShopifyOrderToClientifyContact(order);
			const contactId   = await this.service.syncContact(contactData);
			logger.info(`✅ Contacto sincronizado con ID: ${contactId}`);

			if (order.customer?.id) {
				await logCustomerSync(shopId, order.customer.id.toString(), contactId, contactData, { id: contactId, ...contactData }, order.id?.toString()).catch(() => null);
			}

			// Step 1.5 — Account owner
			logger.info("🔑 Paso 1.5/3: Obteniendo información de cuenta Clientify...");
			const account = await this.service.getAccountInfo();
			const ownerId = account.user_id;
			logger.info(`✅ Owner ID: ${ownerId} (${account.name})`);

			// Step 2 — Products
			logger.info(`📦 Paso 2/3: Sincronizando ${order.line_items?.length || 0} productos...`);
			const productIds: number[] = [];

			for (const lineItem of (order.line_items || [])) {
				const productData = mapShopifyLineItemToClientifyProduct(lineItem, ownerId);
				const productId   = await this.service.syncProduct(productData);
				productIds.push(productId);

				if (lineItem.variant_id) {
					await logProductSync(shopId, lineItem.variant_id.toString(), productId, { sku: lineItem.sku, name: lineItem.title }, { id: productId, ...productData }, order.id?.toString()).catch(() => null);
				}
			}

			logger.info(`✅ Productos sincronizados: ${productIds.join(", ")}`);

			// Step 3 — Deal
			logger.info("💰 Paso 3/3: Sincronizando oportunidad...");
			const dealItems = mapLineItemsToClientifyDealItems(order.line_items || [], productIds);
			const dealData  = mapShopifyOrderToClientifyDeal(order, contactId, dealItems, ownerId);

			// Attach pipeline/stage from DB config
			const pipelineConfig = await db.pipelineConfig.findFirst({ where: { shopId, isDefault: true }, include: { stageMappings: true } });

			if (pipelineConfig) {
				const status       = order.financial_status || "pending";
				const stageMapping = pipelineConfig.stageMappings.find((m) => m.shopifyOrderStatus === status);

				if (stageMapping) {
					dealData.pipeline       = `https://api.clientify.net/v1/deals/pipelines/${pipelineConfig.externalPipelineId}/`;
					dealData.pipeline_stage = `https://api.clientify.net/v1/deals/pipelines/stages/${stageMapping.externalStageId}/`;
					logger.info(`📍 Pipeline: ${pipelineConfig.externalPipelineName}, Stage: ${stageMapping.externalStageName} (${status})`);
				} else {
					logger.warn(`⚠️ No se encontró mapeo para el estado: ${status}`);
				}
			} else {
				logger.warn(`⚠️ No hay pipeline configurado como default para shopId: ${shopId}`);
			}

			const dealId = await this.service.syncDeal(dealData);
			logger.info(`✅ Oportunidad sincronizada con ID: ${dealId}`);

			await logDealSync(shopId, order.id?.toString(), dealId, dealData, { id: dealId, ...dealData }, order.id?.toString()).catch(() => null);

			logger.info(`🎉 Sincronización completada para pedido #${order.order_number}`);

			return { success: true, erpId: dealId, shopifyId: order.id?.toString(), action: "created" };
		} catch (error) {
			const order      = typeof orderData === "string" ? JSON.parse(orderData) : orderData;
			const errMessage = error instanceof Error ? error.message : "Error desconocido";

			logger.error("❌ Error en sincronización con Clientify:", error);
			await logSyncError(shopId, "ORDER", order.id?.toString() || "unknown", errMessage, { orderNumber: order.order_number }).catch(() => null);

			return { success: false, error: errMessage };
		}
	}

	/**
	 * Syncs a standalone Shopify customer (customers/create, customers/updated).
	 */
	async syncCustomerToERP(customer: any, shopId: number): Promise<SyncResult> {
		try {
			const contactData = mapShopifyCustomerToClientifyContact(customer);
			const contactId   = await this.service.syncContact(contactData);

			await logCustomerSync(shopId, customer.id?.toString(), contactId, contactData, { id: contactId, ...contactData }).catch(() => null);

			logger.info(`✅ Cliente sincronizado con ID: ${contactId}`);
			return { success: true, erpId: contactId, shopifyId: customer.id?.toString(), action: "created" };
		} catch (error) {
			const errMessage = error instanceof Error ? error.message : "Error desconocido";
			logger.error("❌ Error sincronizando cliente:", error);
			return { success: false, error: errMessage };
		}
	}

	// ── ERP → Shopify ─────────────────────────────────────────────────────────
	// Clientify is a CRM — it does not own product or inventory master data,
	// so inbound webhook sync to Shopify is not applicable.

	async processWebhook(
		_payload: any,
		_event: string,
		_adminGraphql: (query: string, options?: any) => Promise<any>,
		_shopId: number
	): Promise<SyncResult> {
		return { success: false, error: "Clientify does not send inbound webhooks to this app." };
	}
}
