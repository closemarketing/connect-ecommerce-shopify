import { useEffect } from "react";
import { useFetcher } from "react-router";
import { useTranslation } from "react-i18next";
import type { HoldedDashboardData } from "./holded-dashboard-data.server";

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)    return `hace ${diff}s`;
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return `hace ${Math.floor(diff / 86400)}d`;
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })} · ${d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
}

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  SUCCESS: { bg: "#e8faf0", color: "#1a7a3a", label: "Sincronizado" },
  ERROR:   { bg: "#fff0f0", color: "#c0392b", label: "Error"        },
  PENDING: { bg: "#fff8e8", color: "#a05a00", label: "Pendiente"    },
};

interface Props {
  data: HoldedDashboardData;
}

export function HoldedDashboard({ data }: Props) {
  const { products, orders, recentOrders } = data;
  const { t } = useTranslation();
  const syncFetcher = useFetcher<{
    ok: boolean;
    result?: { total: number; created: number; updated: number; errors: number; skipped: number };
  }>();

  const isSyncing = syncFetcher.state !== "idle";

  useEffect(() => {
    if (syncFetcher.state === "idle" && syncFetcher.data) {
      const d = syncFetcher.data;
      if (d.ok && d.result) {
        const { created, updated, errors } = d.result;
        const msg = `Sync done: ${created} created, ${updated} updated${errors > 0 ? `, ${errors} errors` : ""}`;
        try { (window as any).shopify?.toast?.show(msg); } catch {}
        console.info("[ProductSync]", msg);
      } else {
        console.warn("[ProductSync] failed:", d);
      }
    }
  }, [syncFetcher.state, syncFetcher.data]);

  return (
    <div style={{ background: "#f1f3f5", minHeight: "100vh", padding: "24px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "18px" }}>🔗</span>
          <span style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a1a" }}>{t("home.title")}</span>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <syncFetcher.Form method="post" action="/app/sync-products">
            <button
              type="submit"
              disabled={isSyncing}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                background: isSyncing ? "#555" : "#1a1a1a", color: "#fff", border: "none",
                borderRadius: "8px", padding: "8px 16px",
                fontSize: "13px", fontWeight: 600,
                cursor: isSyncing ? "not-allowed" : "pointer",
                opacity: isSyncing ? 0.7 : 1,
              }}
            >
              <span style={{ display: "inline-block", animation: isSyncing ? "spin 1s linear infinite" : "none" }}>↻</span>
              {isSyncing ? t("home.syncRunning") : t("home.syncNow")}
            </button>
          </syncFetcher.Form>
          <button style={{
            background: "#fff", border: "1px solid #e0e0e0",
            borderRadius: "8px", padding: "8px 12px",
            fontSize: "16px", cursor: "pointer", color: "#666",
          }}>···</button>
        </div>
      </div>

      {/* Products */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#888", letterSpacing: "0.06em" }}>
            {t("home.sectionProducts")}
          </span>
          <a href="/app/products" style={{ fontSize: "12px", color: "#0050b3", textDecoration: "none", fontWeight: 500 }}>
            {t("home.seeAll")}
          </a>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
          {[
            { icon: "☁️",  value: products.availableInERPSku, label: t("home.prodAvailableInHolded"), sub: products.withoutSku > 0 ? `${products.withoutSku} sin SKU` : t("home.prodAvailableSub"),  iconBg: "#e8f0ff" },
            { icon: "🛍️", value: products.inShopify,      label: t("home.prodInShopify"),         sub: t("home.prodInShopifySub"),   iconBg: "#f0f0f0" },
            { icon: "⬇️",  value: products.toImport,       label: t("home.prodToImport"),          sub: t("home.prodToImportSub"),    iconBg: "#fff8e8" },
            { icon: "⚠️",  value: products.notInAPI,       label: t("home.prodNotInAPI"),          sub: t("home.prodNotInAPISub"),    iconBg: "#fff0f0" },
          ].map((s) => (
            <div key={s.label} style={{
              background: "#fff", borderRadius: "10px", border: "1px solid #e8e8e8",
              padding: "16px", display: "flex", alignItems: "center", gap: "12px",
            }}>
              <div style={{
                width: "40px", height: "40px", borderRadius: "10px",
                background: s.iconBg, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: "18px", flexShrink: 0,
              }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: "24px", fontWeight: 700, color: "#1a1a1a", lineHeight: 1.1 }}>{s.value}</div>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#1a1a1a", marginTop: "2px" }}>{s.label}</div>
                <div style={{ fontSize: "11px", color: "#aaa", marginTop: "1px" }}>{s.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Orders */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#888", letterSpacing: "0.06em" }}>
            {t("home.sectionOrders")}
          </span>
          <a href="/app/sync-logs" style={{ fontSize: "12px", color: "#0050b3", textDecoration: "none", fontWeight: 500 }}>
            {t("home.seeAll")}
          </a>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
          <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e8e8e8", padding: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#666" }}>{t("home.ordSynced")}</span>
              <span style={{ fontSize: "16px", color: "#2a7a2a" }}>✓</span>
            </div>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "#1a1a1a" }}>{orders.synced.toLocaleString()}</div>
            <div style={{ fontSize: "11px", color: "#aaa", marginTop: "2px" }}>{t("home.ordLast30")}</div>
          </div>
          <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e8e8e8", padding: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#666" }}>{t("home.ordErrors")}</span>
              <span style={{ fontSize: "16px", color: orders.errors > 0 ? "#c0392b" : "#aaa" }}>⊘</span>
            </div>
            <div style={{ fontSize: "28px", fontWeight: 700, color: orders.errors > 0 ? "#c0392b" : "#1a1a1a" }}>{orders.errors}</div>
            <div style={{ fontSize: "11px", color: orders.errors > 0 ? "#c0392b" : "#aaa", marginTop: "2px" }}>
              {orders.errors > 0 ? t("home.ordRequireAttention") : t("home.ordNoErrors")}
            </div>
          </div>
          <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e8e8e8", padding: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#666" }}>{t("home.ordPending")}</span>
              <span style={{ fontSize: "16px", color: "#a05a00" }}>◷</span>
            </div>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "#1a1a1a" }}>{orders.pending}</div>
            <div style={{ fontSize: "11px", color: "#aaa", marginTop: "2px" }}>{t("home.ordInQueue")}</div>
          </div>
          <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e8e8e8", padding: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#666" }}>{t("home.ordLastSync")}</span>
              <span style={{ fontSize: "16px", color: "#888" }}>↻</span>
            </div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a1a" }}>
              {orders.lastSync ? timeAgo(orders.lastSync) : "—"}
            </div>
            <div style={{ fontSize: "11px", color: "#aaa", marginTop: "2px" }}>{t("home.ordAutoSync")}</div>
          </div>
        </div>
      </div>

      {/* Recent orders table */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e8e8e8", overflow: "hidden" }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid #f0f0f0",
        }}>
          <span style={{ fontWeight: 700, fontSize: "15px", color: "#1a1a1a" }}>
            {t("home.recentOrdersTitle")}
          </span>
          <a href="/app/sync-logs" style={{ fontSize: "13px", color: "#0050b3", textDecoration: "none", fontWeight: 500 }}>
            {t("home.seeAllOrders")}
          </a>
        </div>

        {recentOrders.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center", color: "#aaa", fontSize: "14px" }}>
            {t("home.noOrdersSynced")}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                {[t("home.colOrder"), t("home.colCustomer"), t("home.colDate"), t("home.colTotal"), t("home.colDest"), t("home.colStatus")].map((h) => (
                  <th key={h} style={{
                    padding: "10px 16px", textAlign: "left",
                    fontWeight: 600, color: "#888", fontSize: "12px",
                    borderBottom: "1px solid #f0f0f0",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => {
                const badge = STATUS_BADGE[order.status] ?? STATUS_BADGE.PENDING;
                return (
                  <tr key={order.id}
                    style={{ borderBottom: "1px solid #f5f5f5" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "12px 16px" }}>
                      <a href="/app/sync-logs" style={{ color: "#0050b3", textDecoration: "none", fontWeight: 600 }}>
                        {order.orderNumber}
                      </a>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#1a1a1a" }}>{order.customerName}</td>
                    <td style={{ padding: "12px 16px", color: "#888", fontSize: "13px" }}>{formatDateTime(order.createdAt)}</td>
                    <td style={{ padding: "12px 16px", fontWeight: 500, color: "#1a1a1a" }}>{order.total}</td>
                    <td style={{ padding: "12px 16px", color: "#888", fontSize: "13px" }}>{order.destination}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: "5px",
                        background: badge.bg, color: badge.color,
                        borderRadius: "20px", padding: "3px 10px",
                        fontSize: "12px", fontWeight: 500,
                      }}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: badge.color, display: "inline-block" }} />
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
