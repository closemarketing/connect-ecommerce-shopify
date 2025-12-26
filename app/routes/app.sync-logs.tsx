import { type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useState } from "react";
import { syncShopifyOrderToClientify } from "../integrations/clientify/sync-order.server";
import logger from "../utils/logger.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 100;
  const skip = (page - 1) * limit;
  const syncType = url.searchParams.get("type") || "all";
  const status = url.searchParams.get("status") || "all";
  const orderSearch = url.searchParams.get("orderSearch") || "";

  // Buscar o crear shop
  let shop = await prisma.shop.findUnique({
    where: { domain: session.shop },
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: { domain: session.shop },
    });
  }

  // Construir filtros
  const where: any = { shopId: shop.id };
  if (syncType !== "all") {
    where.syncType = syncType;
  }
  if (status !== "all") {
    where.status = status;
  }
  // Filtro por Order ID: busca registros donde shopifyId o parentOrderId coincidan
  if (orderSearch) {
    where.OR = [
      { shopifyId: { contains: orderSearch } },
      { parentOrderId: { contains: orderSearch } }
    ];
  }

  // Obtener logs con paginación
  const [logs, total] = await Promise.all([
    prisma.syncLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip,
    }),
    prisma.syncLog.count({ where }),
  ]);

  // Obtener estadísticas
  const stats = await prisma.syncLog.groupBy({
    by: ["syncType", "status"],
    where: { shopId: shop.id },
    _count: true,
  });

  return {
    logs,
    total,
    page,
    limit,
    shop: session.shop,
    stats,
    filters: { syncType, status, orderSearch },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "resync_order") {
    const shopifyOrderId = formData.get("shopifyOrderId") as string;
    let webhookLogId: number | null = null;

    try {
      // Buscar shop
      const shop = await prisma.shop.findUnique({
        where: { domain: session.shop },
      });

      if (!shop) {
        return { success: false, error: "Shop not found" };
      }

      // Normalizar el Order ID al formato GID de GraphQL
      let normalizedOrderId = shopifyOrderId.trim();
      if (!normalizedOrderId.startsWith("gid://")) {
        // Si es solo el número, construir el GID completo
        normalizedOrderId = `gid://shopify/Order/${normalizedOrderId.replace(/\D/g, "")}`;
      }

      // Crear registro de webhook log para la sincronización manual
      const webhookLog = await prisma.webhookLog.create({
        data: {
          shopId: shop.id,
          topic: "manual_sync",
          shopifyId: normalizedOrderId.split("/").pop() || shopifyOrderId,
          headers: JSON.stringify({
            "x-manual-sync": "true",
            "x-user": session.shop,
          }),
          payload: JSON.stringify({ orderId: normalizedOrderId, source: "manual_sync" }),
          hmacValid: true,
          processed: false,
        },
      });
      webhookLogId = webhookLog.id;

      // Obtener la orden de Shopify mediante GraphQL
      logger.info(`🔄 Obteniendo orden ${normalizedOrderId} de Shopify (GraphQL)...`);
      
      const response = await admin.graphql(
        `#graphql
          query getOrder($id: ID!) {
            order(id: $id) {
              id
              name
              email
              createdAt
              updatedAt
              currencyCode
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              displayFinancialStatus
              customer {
                id
                firstName
                lastName
                email
                phone
              }
              shippingAddress {
                address1
                address2
                city
                province
                zip
                country
                phone
              }
              lineItems(first: 100) {
                nodes {
                  id
                  title
                  quantity
                  variant {
                    id
                    title
                    price
                    sku
                    product {
                      id
                      title
                    }
                  }
                  originalUnitPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                }
              }
            }
          }`,
        {
          variables: {
            id: normalizedOrderId,
          },
        }
      );

      const responseData = await response.json();

      // Verificar si hay errores en la respuesta de GraphQL
      if ('errors' in responseData && responseData.errors) {
        const errorMessage = responseData.errors.map((e: any) => e.message).join(", ");
        logger.error("❌ GraphQL errors:", responseData.errors);
        
        // Marcar webhook log con error
        if (webhookLogId) {
          await prisma.webhookLog.update({
            where: { id: webhookLogId },
            data: { 
              processed: true,
              errorMessage: `GraphQL Error: ${errorMessage}`
            },
          });
        }
        
        return { success: false, error: `GraphQL Error: ${errorMessage}` };
      }

      if (!('data' in responseData) || !responseData.data?.order) {
        // Marcar webhook log con error
        if (webhookLogId) {
          await prisma.webhookLog.update({
            where: { id: webhookLogId },
            data: { 
              processed: true,
              errorMessage: "Order not found in Shopify"
            },
          });
        }
        return { success: false, error: "Order not found in Shopify" };
      }

      const order = responseData.data.order;

      // Convertir formato GraphQL a formato REST para compatibilidad con syncShopifyOrderToClientify
      const restFormatOrder = {
        id: order.id.split("/").pop() || "",
        order_number: order.name.replace("#", ""),
        email: order.email || "",
        created_at: order.createdAt,
        updated_at: order.updatedAt,
        currency: order.currencyCode,
        total_price: order.totalPriceSet.shopMoney.amount,
        financial_status: order.displayFinancialStatus.toLowerCase(),
        customer: order.customer ? {
          id: order.customer.id.split("/").pop(),
          first_name: order.customer.firstName,
          last_name: order.customer.lastName,
          email: order.customer.email,
          phone: order.customer.phone,
        } : null,
        shipping_address: order.shippingAddress || {},
        line_items: order.lineItems.nodes.map((item: any) => ({
          id: item.id.split("/").pop(),
          title: item.title,
          quantity: item.quantity,
          price: item.originalUnitPriceSet.shopMoney.amount,
          sku: item.variant?.sku || "",
          product_id: item.variant?.product?.id?.split("/").pop() || "",
          variant_id: item.variant?.id?.split("/").pop() || "",
        })),
      };

      // Obtener credenciales de Clientify
      const clientifyCredentials = await prisma.integrationCredential.findFirst({
        where: {
          sessionId: session.shop,
          integration: { name: "clientify" },
          key: "apikey",
        },
      });

      if (!clientifyCredentials) {
        // Marcar webhook log con error
        if (webhookLogId) {
          await prisma.webhookLog.update({
            where: { id: webhookLogId },
            data: { 
              processed: true,
              errorMessage: "Clientify credentials not configured"
            },
          });
        }
        return { success: false, error: "Clientify credentials not configured" };
      }

      // Re-sincronizar con Clientify
      logger.info(`🔄 Re-sincronizando orden ${shopifyOrderId}...`);
      const syncResult = await syncShopifyOrderToClientify(
        restFormatOrder,
        clientifyCredentials.value,
        shop.id
      );

      if (syncResult.success) {
        logger.info(`✅ Orden re-sincronizada exitosamente`);
        
        // Marcar webhook log como procesado
        if (webhookLogId) {
          await prisma.webhookLog.update({
            where: { id: webhookLogId },
            data: { processed: true },
          });
        }
        
        return { 
          success: true, 
          message: `Orden re-sincronizada correctamente. Deal ID: ${syncResult.dealId}`,
          dealId: syncResult.dealId 
        };
      } else {
        logger.error(`❌ Error re-sincronizando orden:`, syncResult.error);
        
        // Marcar webhook log con error
        if (webhookLogId) {
          await prisma.webhookLog.update({
            where: { id: webhookLogId },
            data: { 
              processed: true,
              errorMessage: syncResult.error || "Unknown error during sync"
            },
          });
        }
        
        return { 
          success: false, 
          error: syncResult.error || "Unknown error during sync" 
        };
      }
    } catch (error) {
      logger.error("❌ Error en re-sync:", error);
      
      // Marcar webhook log con error si existe
      if (webhookLogId) {
        try {
          await prisma.webhookLog.update({
            where: { id: webhookLogId },
            data: { 
              processed: true,
              errorMessage: error instanceof Error ? error.message : String(error)
            },
          });
        } catch (logError) {
          logger.error("❌ Error actualizando webhook log:", logError);
        }
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  return { success: false, error: "Invalid action" };
};

export default function SyncLogs() {
  const { logs, total, page, limit, shop, stats, filters } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [manualOrderId, setManualOrderId] = useState("");
  const fetcher = useFetcher();

  const totalPages = Math.ceil(total / limit);

  const handleFilterChange = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value === "all") {
      newParams.delete(key);
    } else {
      newParams.set(key, value);
    }
    newParams.delete("page");
    setSearchParams(newParams);
  };

  const handlePageChange = (newPage: number) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("page", newPage.toString());
    setSearchParams(newParams);
  };

  const totalSuccess = (stats || []).filter((s: any) => s.status === "SUCCESS").reduce((acc: number, s: any) => acc + s._count, 0);
  const totalErrors = (stats || []).filter((s: any) => s.status === "ERROR").reduce((acc: number, s: any) => acc + s._count, 0);

  const handleManualSync = () => {
    if (!manualOrderId.trim()) {
      alert("Por favor ingresa un Order ID de Shopify");
      return;
    }
    
    if (!confirm(`¿Sincronizar orden ${manualOrderId}?\n\nEsto creará un nuevo contacto/productos/deal en Clientify.`)) {
      return;
    }

    const formData = new FormData();
    formData.append("action", "resync_order");
    formData.append("shopifyOrderId", manualOrderId.trim());

    fetcher.submit(formData, { method: "post" });
    setManualOrderId("");
  };

  // Mostrar mensaje de éxito/error y recargar la página
  if (fetcher.data && fetcher.state === "idle") {
    if (fetcher.data.success) {
      alert(`✅ ${fetcher.data.message}`);
      window.location.reload();
    } else if (fetcher.data.error) {
      alert(`❌ Error: ${fetcher.data.error}`);
      // No recargar en error, permitir que el usuario corrija el ID
    }
  }

  return (
    <s-page>
      <s-text slot="title" variant="headingMd" as="h1">
        Historial de Sincronizaciones
      </s-text>

      {/* Card de Sincronización Manual */}
      <s-card>
        <div style={{ padding: "16px" }}>
          <h3 style={{ margin: "0 0 12px 0", fontSize: "15px", fontWeight: 600 }}>
            🔄 Sincronizar Orden Manualmente
          </h3>
          <div style={{ 
            padding: "12px", 
            background: "#dbeafe", 
            border: "1px solid #93c5fd", 
            borderRadius: "4px",
            marginBottom: "12px" 
          }}>
            <p style={{ margin: "0", fontSize: "13px", color: "#1e40af" }}>
              ℹ️ Esta función requiere aprobación de "Protected Customer Data" de Shopify. 
              Funcionará automáticamente cuando Shopify apruebe el acceso.
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: "13px", marginBottom: "4px", fontWeight: 500 }}>
                Order ID de Shopify
              </label>
              <input
                type="text"
                placeholder="Ej: gid://shopify/Order/1234567890 o 1234567890"
                value={manualOrderId}
                onChange={(e) => setManualOrderId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleManualSync();
                  }
                }}
                disabled={fetcher.state === "submitting"}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: "13px",
                  borderRadius: "4px",
                  border: "1px solid #d1d5db",
                  fontFamily: "monospace"
                }}
              />
            </div>
            <button
              onClick={handleManualSync}
              disabled={fetcher.state === "submitting" || !manualOrderId.trim()}
              style={{
                padding: "8px 16px",
                fontSize: "13px",
                borderRadius: "4px",
                border: "1px solid #008060",
                background: "#008060",
                color: "white",
                cursor: (fetcher.state === "submitting" || !manualOrderId.trim()) ? "not-allowed" : "pointer",
                opacity: (fetcher.state === "submitting" || !manualOrderId.trim()) ? 0.6 : 1,
                fontWeight: 500
              }}
            >
              {fetcher.state === "submitting" ? "Sincronizando..." : "Sincronizar"}
            </button>
          </div>
          <p style={{ margin: "12px 0 0 0", fontSize: "12px", color: "#6b7280" }}>
            💡 Si no recibiste el webhook de una orden, intenta sincronizarla manualmente aquí.
          </p>
        </div>
      </s-card>

      {/* Card de Logs */}
      <s-card>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #e5e7eb" }}>
          <s-inline-stack gap="400" align="space-between" wrap={false}>
            <s-inline-stack gap="300" blockAlign="center">
              <s-text variant="bodySm" as="span" tone="subdued">🏪 {shop}</s-text>
              <s-text variant="bodySm" as="span" tone="subdued">•</s-text>
              <s-text variant="bodySm" as="span" tone="subdued">Total: <strong>{total}</strong></s-text>
              <s-text variant="bodySm" as="span" tone="subdued">•</s-text>
              <s-text variant="bodySm" as="span" style={{ color: "#008060" }}>Exitosos: <strong>{totalSuccess}</strong></s-text>
              <s-text variant="bodySm" as="span" tone="subdued">•</s-text>
              <s-text variant="bodySm" as="span" style={{ color: "#d72c0d" }}>Errores: <strong>{totalErrors}</strong></s-text>
            </s-inline-stack>
            <s-inline-stack gap="100" blockAlign="center">
              <input
                type="text"
                placeholder="Buscar Order ID..."
                defaultValue={filters?.orderSearch || ""}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleFilterChange("orderSearch", e.currentTarget.value);
                  }
                }}
                style={{ padding: "3px 8px", fontSize: "12px", borderRadius: "4px", border: "1px solid #d1d5db", minWidth: "150px" }}
              />
              <select
                value={filters?.syncType || "all"}
                onChange={(e) => handleFilterChange("type", e.target.value)}
                style={{ padding: "3px 6px", fontSize: "12px", borderRadius: "4px", border: "1px solid #d1d5db" }}
              >
                <option value="all">Tipo</option>
                <option value="CUSTOMER">Customer</option>
                <option value="PRODUCT">Product</option>
                <option value="DEAL">Deal</option>
                <option value="ORDER">Order</option>
              </select>
              <select
                value={filters?.status || "all"}
                onChange={(e) => handleFilterChange("status", e.target.value)}
                style={{ padding: "3px 6px", fontSize: "12px", borderRadius: "4px", border: "1px solid #d1d5db" }}
              >
                <option value="all">Estado</option>
                <option value="SUCCESS">Exitoso</option>
                <option value="ERROR">Error</option>
              </select>
              {totalPages > 1 && (
                <s-inline-stack gap="100" blockAlign="center">
                  <button
                    disabled={page <= 1}
                    onClick={() => handlePageChange(page - 1)}
                    style={{
                      padding: "3px 8px",
                      fontSize: "12px",
                      borderRadius: "3px",
                      border: "1px solid #d1d5db",
                      background: page <= 1 ? "#f3f4f6" : "white",
                      cursor: page <= 1 ? "not-allowed" : "pointer"
                    }}
                  >
                    ‹
                  </button>
                  <s-text variant="bodySm" as="span">{page}/{totalPages}</s-text>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => handlePageChange(page + 1)}
                    style={{
                      padding: "3px 8px",
                      fontSize: "12px",
                      borderRadius: "3px",
                      border: "1px solid #d1d5db",
                      background: page >= totalPages ? "#f3f4f6" : "white",
                      cursor: page >= totalPages ? "not-allowed" : "pointer"
                    }}
                  >
                    ›
                  </button>
                </s-inline-stack>
              )}
            </s-inline-stack>
          </s-inline-stack>
        </div>

        <div style={{ padding: "0" }}>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e0e0e0", backgroundColor: "#f9f9f9" }}>
                  <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600 }}>Fecha</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600 }}>Tipo</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600 }}>Shopify ID</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600 }}>Clientify ID</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600 }}>Parent Order</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600 }}>Estado</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600 }}>Error</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log: any) => (
                  <tr 
                    key={log.id} 
                    onClick={() => setSelectedLog(log)}
                    style={{ borderBottom: "1px solid #f0f0f0", cursor: "pointer" }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f9f9f9"}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                      {new Date(log.createdAt).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <span style={{
                        fontSize: "11px",
                        padding: "2px 6px",
                        borderRadius: "3px",
                        background: log.syncType === "CUSTOMER" ? "#e3f2fd" : log.syncType === "PRODUCT" ? "#e8f5e9" : log.syncType === "DEAL" ? "#fff3e0" : "#f3e5f5",
                        color: log.syncType === "CUSTOMER" ? "#1976d2" : log.syncType === "PRODUCT" ? "#2e7d32" : log.syncType === "DEAL" ? "#f57c00" : "#7b1fa2"
                      }}>
                        {log.syncType}
                      </span>
                    </td>
                    <td style={{ padding: "6px 8px", fontSize: "11px", fontFamily: "monospace", color: "#666" }}>
                      {log.shopifyId.length > 20 ? log.shopifyId.substring(log.shopifyId.lastIndexOf('/') + 1) : log.shopifyId}
                    </td>
                    <td style={{ padding: "6px 8px", fontSize: "11px", fontFamily: "monospace", color: "#666" }}>
                      {log.clientifyId || "-"}
                    </td>
                    <td style={{ padding: "6px 8px", fontSize: "11px", fontFamily: "monospace", color: "#999" }}>
                      {log.parentOrderId || "-"}
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <span style={{
                        fontSize: "11px",
                        padding: "2px 6px",
                        borderRadius: "3px",
                        background: log.status === "SUCCESS" ? "#e8f5e9" : "#ffebee",
                        color: log.status === "SUCCESS" ? "#2e7d32" : "#c62828"
                      }}>
                        {log.status === "SUCCESS" ? "OK" : "ERROR"}
                      </span>
                    </td>
                    <td style={{ padding: "6px 8px", maxWidth: "300px", fontSize: "11px" }}>
                      {log.errorMessage ? (
                        <span style={{ color: "#c62828" }}>
                          {log.errorMessage.length > 80 ? log.errorMessage.substring(0, 80) + "..." : log.errorMessage}
                        </span>
                      ) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </s-card>

      {selectedLog && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }}
          onClick={() => setSelectedLog(null)}
        >
          <div
            style={{
              background: "white",
              borderRadius: "6px",
              padding: "16px",
              maxWidth: "700px",
              maxHeight: "80vh",
              overflow: "auto",
              width: "90%"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ margin: 0, fontSize: "16px" }}>
                Sync: {selectedLog.syncType}
              </h3>
              <button
                onClick={() => setSelectedLog(null)}
                style={{
                  padding: "4px 12px",
                  fontSize: "13px",
                  borderRadius: "3px",
                  border: "1px solid #ccc",
                  background: "white",
                  cursor: "pointer"
                }}
              >
                ✕
              </button>
            </div>
            
            <div style={{ fontSize: "13px", lineHeight: "1.8", marginBottom: "12px" }}>
              <div><strong>ID:</strong> {selectedLog.id}</div>
              <div><strong>Fecha:</strong> {new Date(selectedLog.createdAt).toLocaleString("es-ES")}</div>
              <div><strong>Tipo:</strong> {selectedLog.syncType}</div>
              <div><strong>Shopify ID:</strong> <code style={{ fontSize: "11px", background: "#f6f6f7", padding: "2px 4px", borderRadius: "3px" }}>{selectedLog.shopifyId}</code></div>
              <div><strong>Clientify ID:</strong> {selectedLog.clientifyId || "N/A"}</div>
              {selectedLog.parentOrderId && (
                <div><strong>Parent Order ID:</strong> <code style={{ fontSize: "11px", background: "#f6f6f7", padding: "2px 4px", borderRadius: "3px" }}>{selectedLog.parentOrderId}</code></div>
              )}
              <div>
                <strong>Estado:</strong>{" "}
                <span style={{
                  fontSize: "11px",
                  padding: "2px 6px",
                  borderRadius: "3px",
                  background: selectedLog.status === "SUCCESS" ? "#e8f5e9" : "#ffebee",
                  color: selectedLog.status === "SUCCESS" ? "#2e7d32" : "#c62828"
                }}>
                  {selectedLog.status}
                </span>
              </div>
              {selectedLog.errorMessage && (
                <div style={{ marginTop: "8px", padding: "8px", background: "#ffebee", borderRadius: "4px", color: "#c62828" }}>
                  <strong>Error:</strong> {selectedLog.errorMessage}
                </div>
              )}
            </div>

            {selectedLog.requestData && (
              <div style={{ marginBottom: "12px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>Request Data (enviado a Clientify)</div>
                <pre style={{ background: "#f6f6f7", padding: "8px", borderRadius: "4px", overflow: "auto", maxHeight: "200px", fontSize: "11px", margin: 0 }}>
                  {JSON.stringify(JSON.parse(selectedLog.requestData), null, 2)}
                </pre>
              </div>
            )}

            {selectedLog.responseData && (
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>Response Data (respuesta de Clientify)</div>
                <pre style={{ background: "#f6f6f7", padding: "8px", borderRadius: "4px", overflow: "auto", maxHeight: "300px", fontSize: "11px", margin: 0 }}>
                  {JSON.stringify(JSON.parse(selectedLog.responseData), null, 2)}
                </pre>
              </div>
            )}

            {!selectedLog.requestData && !selectedLog.responseData && (
              <div style={{ padding: "16px", textAlign: "center", color: "#666", fontSize: "13px", background: "#f9f9f9", borderRadius: "4px" }}>
                No hay datos de request/response almacenados
              </div>
            )}
          </div>
        </div>
      )}
    </s-page>
  );
}

export { boundary };
