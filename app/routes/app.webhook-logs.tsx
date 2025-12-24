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
  const topic = url.searchParams.get("topic") || "all";
  const processed = url.searchParams.get("processed") || "all";

  // Buscar shop
  const shop = await prisma.shop.findUnique({
    where: { domain: session.shop },
  });

  if (!shop) {
    return { webhooks: [], total: 0, page, limit, shop: session.shop };
  }

  // Construir filtros
  const where: any = { shopId: shop.id };
  if (topic !== "all") {
    where.topic = topic;
  }
  if (processed === "true") {
    where.processed = true;
  } else if (processed === "false") {
    where.processed = false;
  }

  // Obtener webhooks con paginación
  const [webhooks, total] = await Promise.all([
    prisma.webhookLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip,
    }),
    prisma.webhookLog.count({ where }),
  ]);

  // Obtener topics únicos
  const topics = await prisma.webhookLog.groupBy({
    by: ["topic"],
    where: { shopId: shop.id },
    _count: true,
  });

  return {
    webhooks,
    total,
    page,
    limit,
    shop: session.shop,
    topics,
    filters: { topic, processed },
  };
};

export default function WebhookLogs() {
  const { webhooks, total, page, limit, shop, topics, filters } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedWebhook, setSelectedWebhook] = useState<any>(null);

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

  const totalProcessed = webhooks.filter((w: any) => w.processed).length;
  const totalErrors = webhooks.filter((w: any) => w.errorMessage).length;

  return (
    <s-page>
      <s-text slot="title" variant="headingMd" as="h1">
        Historial de Webhooks
      </s-text>
      <s-text slot="subtitle" variant="bodySm" as="p">
        {shop} - {total} webhooks recibidos
      </s-text>

      <s-card>
        <div style={{ padding: "12px" }}>
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px", fontSize: "13px" }}>
            <div style={{ flex: 1 }}>
              <strong>Total:</strong> {total}
            </div>
            <div style={{ flex: 1, color: "green" }}>
              <strong>Procesados:</strong> {totalProcessed}
            </div>
            <div style={{ flex: 1, color: "red" }}>
              <strong>Errores:</strong> {totalErrors}
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            <select
              value={filters.topic}
              onChange={(e) => handleFilterChange("topic", e.target.value)}
              style={{ flex: 1, padding: "6px", fontSize: "13px", borderRadius: "4px", border: "1px solid #ccc" }}
            >
              <option value="all">Todos los topics</option>
              {topics.map((t: any) => (
                <option key={t.topic} value={t.topic}>{t.topic} ({t._count})</option>
              ))}
            </select>
            <select
              value={filters.processed}
              onChange={(e) => handleFilterChange("processed", e.target.value)}
              style={{ flex: 1, padding: "6px", fontSize: "13px", borderRadius: "4px", border: "1px solid #ccc" }}
            >
              <option value="all">Todos</option>
              <option value="true">Procesados</option>
              <option value="false">Pendientes</option>
            </select>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e0e0e0", backgroundColor: "#f9f9f9" }}>
                  <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600 }}>Fecha</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600 }}>Topic</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600 }}>ID</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600 }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((webhook: any) => (
                  <tr 
                    key={webhook.id} 
                    onClick={() => setSelectedWebhook(webhook)}
                    style={{ borderBottom: "1px solid #f0f0f0", cursor: "pointer" }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f9f9f9"}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                      {new Date(webhook.createdAt).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <span style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "3px", background: "#e3f2fd", color: "#1976d2" }}>
                        {webhook.topic}
                      </span>
                    </td>
                    <td style={{ padding: "6px 8px", fontSize: "11px", fontFamily: "monospace", color: "#666" }}>
                      {webhook.shopifyId ? webhook.shopifyId.substring(webhook.shopifyId.lastIndexOf('/') + 1) : "-"}
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      {webhook.errorMessage ? (
                        <span style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "3px", background: "#ffebee", color: "#c62828" }}>
                          Error
                        </span>
                      ) : webhook.processed ? (
                        <span style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "3px", background: "#e8f5e9", color: "#2e7d32" }}>
                          OK
                        </span>
                      ) : (
                        <span style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "3px", background: "#fff3e0", color: "#f57c00" }}>
                          Pendiente
                        </span>
                      )}
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

      {selectedWebhook && (
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
          onClick={() => setSelectedWebhook(null)}
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
              <h3 style={{ margin: 0, fontSize: "16px" }}>{selectedWebhook.topic}</h3>
              <button
                onClick={() => setSelectedWebhook(null)}
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
            <div style={{ fontSize: "13px", lineHeight: "1.6", marginBottom: "12px" }}>
              <div><strong>Fecha:</strong> {new Date(selectedWebhook.createdAt).toLocaleString("es-ES")}</div>
              <div><strong>Shopify ID:</strong> {selectedWebhook.shopifyId || "N/A"}</div>
              <div><strong>Procesado:</strong> {selectedWebhook.processed ? "Sí" : "No"}</div>
              {selectedWebhook.errorMessage && (
                <div style={{ color: "red" }}><strong>Error:</strong> {selectedWebhook.errorMessage}</div>
              )}
            </div>
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>Headers</div>
              <pre style={{ background: "#f6f6f7", padding: "8px", borderRadius: "4px", overflow: "auto", maxHeight: "150px", fontSize: "11px", margin: 0 }}>
                {JSON.stringify(JSON.parse(selectedWebhook.headers), null, 2)}
              </pre>
            </div>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>Payload</div>
              <pre style={{ background: "#f6f6f7", padding: "8px", borderRadius: "4px", overflow: "auto", maxHeight: "300px", fontSize: "11px", margin: 0 }}>
                {JSON.stringify(JSON.parse(selectedWebhook.payload), null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </s-page>
  );
}

export { boundary };
