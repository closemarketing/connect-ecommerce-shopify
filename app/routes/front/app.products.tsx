import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { useTranslation } from "react-i18next";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query getProducts {
        products(first: 50) {
          edges {
            node {
              id
              title
              handle
              status
              createdAt
              totalInventory
              variants(first: 1) {
                edges {
                  node {
                    id
                    price
                    inventoryQuantity
                  }
                }
              }
              featuredImage {
                url
                altText
              }
            }
          }
        }
      }
    `
  );

  const responseJson = await response.json();
  const products = responseJson.data?.products?.edges?.map((edge: any) => edge.node) || [];

  // Stats
  const total      = products.length;
  const active     = products.filter((p: any) => p.status === "ACTIVE").length;
  const draft      = products.filter((p: any) => p.status === "DRAFT").length;
  const noStock    = products.filter((p: any) => p.totalInventory === 0).length;

  // Last sync from SyncLog
  const shopRecord = await prisma.shop.findUnique({ where: { domain: session.shop } });
  const lastSync = shopRecord ? await prisma.syncLog.findFirst({
    where: { shopId: shopRecord.id, syncType: "PRODUCT" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, status: true },
  }).catch(() => null) : null;

  return { products, stats: { total, active, draft, noStock }, lastSync };
}

function timeAgo(date: string | Date) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60)   return `hace ${diff}s`;
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return `hace ${Math.floor(diff / 86400)}d`;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export default function Products() {
  const { products, stats, lastSync } = useLoaderData<typeof loader>();
  const { t } = useTranslation();

  return (
    <div style={{ background: "#f1f3f5", minHeight: "100vh", padding: "24px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "20px" }}>📦</span>
          <span style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a1a" }}>{t("products.pageTitle")}</span>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={{
            display: "flex", alignItems: "center", gap: "6px",
            background: "#1a1a1a", color: "#fff", border: "none",
            borderRadius: "8px", padding: "8px 16px", fontSize: "14px",
            fontWeight: 600, cursor: "pointer",
          }}>
            {t("common.syncNow")}
          </button>
          <button style={{
            background: "#fff", border: "1px solid #e0e0e0",
            borderRadius: "8px", padding: "8px 12px", fontSize: "16px",
            cursor: "pointer", color: "#666",
          }}>···</button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
        {[
          { icon: "🛍️", value: stats.total,   label: t("products.statTotal"),  sub: t("products.statTotalSub"),        color: "#e8f4ff", iconBg: "#d0e8ff" },
          { icon: "✅", value: stats.active,   label: t("products.statActive"), sub: t("products.statActiveSub"),    color: "#e8faf0", iconBg: "#c6f0d8" },
          { icon: "📝", value: stats.draft,    label: t("products.statDraft"),                sub: t("products.statDraftSub"),  color: "#f5f5f5", iconBg: "#e8e8e8" },
          { icon: "⚠️", value: stats.noStock,  label: t("products.statNoStock"),         sub: t("products.statNoStockSub"),         color: "#fff8e8", iconBg: "#fde9b0" },
        ].map((s) => (
          <div key={s.label} style={{
            background: "#fff", borderRadius: "12px", padding: "18px 20px",
            border: "1px solid #e8e8e8", display: "flex", alignItems: "center", gap: "14px",
          }}>
            <div style={{
              width: "44px", height: "44px", borderRadius: "10px",
              background: s.iconBg, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: "20px", flexShrink: 0,
            }}>
              {s.icon}
            </div>
            <div>
              <div style={{ fontSize: "26px", fontWeight: 700, color: "#1a1a1a", lineHeight: 1.1 }}>{s.value}</div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a", marginTop: "2px" }}>{s.label}</div>
              <div style={{ fontSize: "12px", color: "#888", marginTop: "1px" }}>{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Last sync banner */}
      {lastSync && (
        <div style={{
          background: lastSync.status === "SUCCESS" ? "#f0faf4" : "#fff5f5",
          border: `1px solid ${lastSync.status === "SUCCESS" ? "#b8e6c8" : "#ffc5c5"}`,
          borderRadius: "10px", padding: "12px 18px", marginBottom: "20px",
          display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", color: "#333",
        }}>
          <span style={{ fontSize: "16px" }}>{lastSync.status === "SUCCESS" ? "✅" : "⚠️"}</span>
          <span>
            {t("products.lastSyncPrefix")}{" "}
            <strong>{timeAgo(lastSync.createdAt)}</strong>
            {" · "}
            <span style={{ color: lastSync.status === "SUCCESS" ? "#2a7a2a" : "#c0392b" }}>
              {lastSync.status === "SUCCESS" ? t("products.lastSyncCompleted") : t("products.lastSyncErrors")}
            </span>
          </span>
        </div>
      )}

      {/* Table card */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e8e8e8", overflow: "hidden" }}>

        {/* Table header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid #f0f0f0",
        }}>
          <span style={{ fontWeight: 700, fontSize: "15px", color: "#1a1a1a" }}>
            {t("products.tableTitle")}
          </span>
          <span style={{ fontSize: "13px", color: "#888" }}>{t("products.tableCount", { count: stats.total })}</span>
        </div>

        {products.length === 0 ? (
          <div style={{ padding: "60px 20px", textAlign: "center", color: "#888", fontSize: "14px" }}>
            {t("products.empty")}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  {[t("products.colProduct"), t("products.colStatus"), t("products.colInventory"), t("products.colPrice"), t("products.colCreated")].map((h) => (
                    <th key={h} style={{
                      padding: "10px 16px", textAlign: "left",
                      fontWeight: 600, color: "#666", fontSize: "12px",
                      borderBottom: "1px solid #f0f0f0",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((product: any) => {
                  const price = product.variants.edges[0]?.node?.price;
                  const isActive = product.status === "ACTIVE";
                  return (
                    <tr key={product.id} style={{ borderBottom: "1px solid #f5f5f5" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {/* Product */}
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          {product.featuredImage ? (
                            <img
                              src={product.featuredImage.url}
                              alt={product.featuredImage.altText || product.title}
                              style={{ width: "40px", height: "40px", objectFit: "cover", borderRadius: "6px", flexShrink: 0 }}
                            />
                          ) : (
                            <div style={{
                              width: "40px", height: "40px", borderRadius: "6px",
                              background: "#f0f0f0", flexShrink: 0,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: "18px",
                            }}>📦</div>
                          )}
                          <div>
                            <div style={{ fontWeight: 500, color: "#1a1a1a" }}>{product.title}</div>
                            <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>{product.handle}</div>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: "5px",
                          padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 500,
                          background: isActive ? "#e8faf0" : "#f5f5f5",
                          color: isActive ? "#2a7a2a" : "#666",
                        }}>
                          <span style={{
                            width: "6px", height: "6px", borderRadius: "50%",
                            background: isActive ? "#2a7a2a" : "#aaa", display: "inline-block",
                          }} />
                          {isActive ? t("products.statusActive") : product.status.toLowerCase()}
                        </span>
                      </td>

                      {/* Inventory */}
                      <td style={{ padding: "12px 16px", color: product.totalInventory === 0 ? "#e67e22" : "#1a1a1a", fontWeight: product.totalInventory === 0 ? 600 : 400 }}>
                        {product.totalInventory !== null ? product.totalInventory : "—"}
                      </td>

                      {/* Price */}
                      <td style={{ padding: "12px 16px", fontWeight: 500, color: "#1a1a1a" }}>
                        {price ? `€${parseFloat(price).toFixed(2)}` : "—"}
                      </td>

                      {/* Created */}
                      <td style={{ padding: "12px 16px", color: "#888", fontSize: "13px" }}>
                        {formatDate(product.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export { boundary };
