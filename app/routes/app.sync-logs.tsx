import { type LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useState } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 100;
  const skip = (page - 1) * limit;
  const syncType = url.searchParams.get("type") || "all";
  const status = url.searchParams.get("status") || "all";

  // Buscar shop
  const shop = await prisma.shop.findUnique({
    where: { domain: session.shop },
  });

  if (!shop) {
    return { logs: [], total: 0, page, limit, shop: session.shop };
  }

  // Construir filtros
  const where: any = { shopId: shop.id };
  if (syncType !== "all") {
    where.syncType = syncType;
  }
  if (status !== "all") {
    where.status = status;
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
    filters: { syncType, status },
  };
};

export default function SyncLogs() {
  const { logs, total, page, limit, shop, stats, filters } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedLog, setSelectedLog] = useState<any>(null);

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

  const totalSuccess = stats.filter((s: any) => s.status === "SUCCESS").reduce((acc: number, s: any) => acc + s._count, 0);
  const totalErrors = stats.filter((s: any) => s.status === "ERROR").reduce((acc: number, s: any) => acc + s._count, 0);

  return (
    <s-page>
      <s-text slot="title" variant="headingMd" as="h1">
        Historial de Sincronizaciones
      </s-text>
      <s-text slot="subtitle" variant="bodySm" as="p">
        {shop} - {total} registros
      </s-text>

      <s-card>
        <div style={{ padding: "12px" }}>
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px", fontSize: "13px" }}>
            <div style={{ flex: 1 }}>
              <strong>Total:</strong> {total}
            </div>
            <div style={{ flex: 1, color: "green" }}>
              <strong>Exitosas:</strong> {totalSuccess}
            </div>
            <div style={{ flex: 1, color: "red" }}>
              <strong>Errores:</strong> {totalErrors}
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            <select
              value={filters.syncType}
              onChange={(e) => handleFilterChange("type", e.target.value)}
              style={{ flex: 1, padding: "6px", fontSize: "13px", borderRadius: "4px", border: "1px solid #ccc" }}
            >
              <option value="all">Todos los tipos</option>
              <option value="CUSTOMER">Customer</option>
              <option value="PRODUCT">Product</option>
              <option value="DEAL">Deal</option>
              <option value="ORDER">Order</option>
            </select>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange("status", e.target.value)}
              style={{ flex: 1, padding: "6px", fontSize: "13px", borderRadius: "4px", border: "1px solid #ccc" }}
            >
              <option value="all">Todos</option>
              <option value="SUCCESS">Exitoso</option>
              <option value="ERROR">Error</option>
            </select>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e0e0e0", backgroundColor: "#f9f9f9" }}>
                  <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600 }}>Fecha</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600 }}>Tipo</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600 }}>Shopify ID</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600 }}>Clientify ID</th>
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

          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #e0e0e0" }}>
              <button
                disabled={page <= 1}
                onClick={() => handlePageChange(page - 1)}
                style={{
                  padding: "4px 12px",
                  fontSize: "13px",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                  background: page <= 1 ? "#f0f0f0" : "white",
                  cursor: page <= 1 ? "not-allowed" : "pointer"
                }}
              >
                ‹
              </button>
              <span style={{ fontSize: "13px" }}>Página {page} de {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => handlePageChange(page + 1)}
                style={{
                  padding: "4px 12px",
                  fontSize: "13px",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                  background: page >= totalPages ? "#f0f0f0" : "white",
                  cursor: page >= totalPages ? "not-allowed" : "pointer"
                }}
              >
                ›
              </button>
            </div>
          )}
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
