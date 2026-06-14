import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useState, useEffect } from "react";
import { useFetcher } from "react-router";
import { useTranslation } from "react-i18next";

import { authenticate } from "~/shopify.server";
import shopify from "~/shopify.server";
import prisma from "~/db.server";
import { isIntegrationActive } from "~/models/Integration.server";

const ALL_INTEGRATIONS = [
  { name: "holded",      label: "Holded",          subKey: "integrationsRegistry.holded_sub",      color: "#7C3AED", available: true  },
  { name: "clientify",   label: "Clientify",        subKey: "integrationsRegistry.clientify_sub",   color: "#EA580C", available: false },
  { name: "odoo",        label: "Odoo",             subKey: "integrationsRegistry.odoo_sub",        color: "#6B21A8", available: false },
  { name: "woocommerce", label: "WooCommerce",      subKey: "integrationsRegistry.woocommerce_sub", color: "#3B82F6", available: false },
  { name: "sap",         label: "SAP Business One", subKey: "integrationsRegistry.sap_sub",         color: "#2563EB", available: false },
  { name: "hubspot",     label: "HubSpot",          subKey: "integrationsRegistry.hubspot_sub",     color: "#DC2626", available: false },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const shopRecord = await prisma.shop.upsert({
    where:  { domain: shopDomain },
    update: {},
    create: { domain: shopDomain },
  });

  if (!session.shopId) {
    await prisma.session.update({
      where: { id: session.id },
      data:  { shopId: shopRecord.id },
    }).catch(() => null);
  }

  try { await shopify.registerWebhooks({ session }); } catch {}

  const holdedActive = await isIntegrationActive(shopDomain, "holded");

  if (!holdedActive) {
    return { shop: shopDomain, holdedActive: false, dashboard: null };
  }

  // ── Dashboard data (only when connected) ─────────────────────────────────

  // Shopify product count
  const productResponse = await admin.graphql(`#graphql
    query { productsCount { count } }
  `).catch(() => null);
  const productCountJson = await productResponse?.json().catch(() => null);
  const shopifyProductCount = productCountJson?.data?.productsCount?.count ?? 0;

  // Sync logs stats (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [syncedCount, errorCount, pendingCount, lastSync, recentLogs] = await Promise.all([
    prisma.syncLog.count({
      where: { shopId: shopRecord.id, status: "SUCCESS", syncType: "ORDER", createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.syncLog.count({
      where: { shopId: shopRecord.id, status: "ERROR", syncType: "ORDER", createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.syncLog.count({
      where: { shopId: shopRecord.id, status: "SUCCESS", syncType: "ORDER", createdAt: { gte: thirtyDaysAgo } },
    }).then(() => 0), // pending not tracked yet, placeholder
    prisma.syncLog.findFirst({
      where:   { shopId: shopRecord.id, syncType: "ORDER" },
      orderBy: { createdAt: "desc" },
      select:  { createdAt: true, status: true },
    }),
    // Recent order sync logs with enough detail for the table
    prisma.syncLog.findMany({
      where:   { shopId: shopRecord.id, syncType: "ORDER" },
      orderBy: { createdAt: "desc" },
      take:    10,
      select:  {
        id:           true,
        shopifyId:    true,
        externalId:   true,
        status:       true,
        errorMessage: true,
        createdAt:    true,
        erpName:      true,
        responseData: true,
        requestData:  true,
      },
    }),
  ]);

  // Parse customer name from requestData JSON when available
  const recentOrders = recentLogs.map((log) => {
    let customerName = "—";
    let orderNumber  = log.shopifyId ?? "—";
    let total        = "—";

    try {
      const req = log.requestData ? JSON.parse(log.requestData) : null;
      if (req) {
        const customer = req.customer;
        if (customer) {
          customerName = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customerName;
        }
        if (req.order_number || req.name) orderNumber = `#${req.order_number ?? req.name}`;
        if (req.total_price) total = `€${parseFloat(req.total_price).toFixed(2)}`;
      }
    } catch {}

    return {
      id:           log.id,
      orderNumber,
      customerName,
      total,
      destination:  log.erpName ?? "Holded",
      status:       log.status,
      errorMessage: log.errorMessage,
      createdAt:    log.createdAt.toISOString(),
    };
  });

  return {
    shop: shopDomain,
    holdedActive: true,
    dashboard: {
      products: {
        inShopify:     shopifyProductCount,
        availableInERP: 0,   // would need a Holded API call — placeholder
        toImport:      0,
        notInAPI:      shopifyProductCount,
      },
      orders: {
        synced:  syncedCount,
        errors:  errorCount,
        pending: 0,
        lastSync: lastSync ? lastSync.createdAt.toISOString() : null,
      },
      recentOrders,
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function Index() {
  const { shop, holdedActive, dashboard } = useLoaderData<typeof loader>();
  const [selected, setSelected] = useState<string | null>(null);
  const { t } = useTranslation();
  const syncFetcher = useFetcher<{ ok: boolean; result?: { total: number; created: number; updated: number; errors: number; skipped: number } }>();
  const shopify     = (globalThis as any).__shopify_app_bridge;

  const isSyncing = syncFetcher.state !== "idle";

  // Show toast when sync completes
  useEffect(() => {
    if (syncFetcher.state === "idle" && syncFetcher.data) {
      const d = syncFetcher.data;
      if (d.ok && d.result) {
        const { created, updated, errors } = d.result;
        const msg = `Sync done: ${created} created, ${updated} updated${errors > 0 ? `, ${errors} errors` : ""}`;
        // Use Shopify App Bridge toast if available, otherwise console
        try { (window as any).shopify?.toast?.show(msg); } catch {}
        console.info("[ProductSync]", msg);
      } else {
        console.warn("[ProductSync] failed:", d);
      }
    }
  }, [syncFetcher.state, syncFetcher.data]);

  // ── CONNECTED DASHBOARD ───────────────────────────────────────────────────
  if (holdedActive && dashboard) {
    const { products, orders, recentOrders } = dashboard;

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
                <span style={{
                  display: "inline-block",
                  animation: isSyncing ? "spin 1s linear infinite" : "none",
                }}>↻</span>
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

        {/* ── PRODUCTS section ── */}
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
              { icon: "☁️",  value: products.availableInERP, label: t("home.prodAvailableInHolded"), sub: t("home.prodAvailableSub"),  iconBg: "#e8f0ff" },
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

        {/* ── ORDERS section ── */}
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
            {/* Synced */}
            <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e8e8e8", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#666" }}>{t("home.ordSynced")}</span>
                <span style={{ fontSize: "16px", color: "#2a7a2a" }}>✓</span>
              </div>
              <div style={{ fontSize: "28px", fontWeight: 700, color: "#1a1a1a" }}>{orders.synced.toLocaleString()}</div>
              <div style={{ fontSize: "11px", color: "#aaa", marginTop: "2px" }}>{t("home.ordLast30")}</div>
            </div>
            {/* Errors */}
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
            {/* Pending */}
            <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e8e8e8", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#666" }}>{t("home.ordPending")}</span>
                <span style={{ fontSize: "16px", color: "#a05a00" }}>◷</span>
              </div>
              <div style={{ fontSize: "28px", fontWeight: 700, color: "#1a1a1a" }}>{orders.pending}</div>
              <div style={{ fontSize: "11px", color: "#aaa", marginTop: "2px" }}>{t("home.ordInQueue")}</div>
            </div>
            {/* Last sync */}
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

        {/* ── RECENT ORDERS table ── */}
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

  // ── EMPTY STATE (no connection) ───────────────────────────────────────────
  return (
    <div style={{ background: "#f1f3f5", minHeight: "100vh", padding: "24px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "18px" }}>🔗</span>
          <span style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a1a" }}>{t("home.title")}</span>
        </div>
        <button style={{
          background: "#fff", border: "1px solid #e0e0e0", borderRadius: "8px",
          padding: "8px 12px", fontSize: "18px", cursor: "pointer", color: "#666", lineHeight: 1,
        }}>···</button>
      </div>

      {/* Warning banner */}
      <div style={{
        background: "#fff8ee", border: "1px solid #fcd9a0", borderRadius: "10px",
        padding: "14px 18px", marginBottom: "20px",
        display: "flex", alignItems: "center", gap: "10px",
      }}>
        <span style={{ fontSize: "18px" }}>⚠️</span>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a" }}>{t("home.noConnectionTitle")}</div>
          <div style={{ fontSize: "13px", color: "#888", marginTop: "2px" }}>{t("home.noConnectionSub")}</div>
        </div>
      </div>

      {/* Hero empty state */}
      <div style={{
        background: "#fff", borderRadius: "12px", border: "1px solid #e8e8e8",
        padding: "48px 24px", marginBottom: "20px", textAlign: "center",
      }}>
        <div style={{
          width: "80px", height: "80px", borderRadius: "20px", background: "#f0f4ff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "36px", margin: "0 auto 20px",
        }}>🔗</div>
        <div style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a1a", marginBottom: "10px" }}>
          {t("home.heroTitle")}
        </div>
        <div style={{ fontSize: "14px", color: "#666", maxWidth: "420px", margin: "0 auto", lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: t("home.heroSub", { shop }) }} />
      </div>

      {/* Integration picker */}
      <div>
        <div style={{ fontSize: "12px", fontWeight: 600, color: "#888", letterSpacing: "0.06em", marginBottom: "12px" }}>
          {t("home.chooseIntegration")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "12px" }}>
          {ALL_INTEGRATIONS.map((i) => {
            const isSelected = selected === i.name;
            return (
              <button
                key={i.name}
                disabled={!i.available}
                onClick={() => i.available && setSelected(isSelected ? null : i.name)}
                style={{
                  background: isSelected ? "#f0f4ff" : "#fff",
                  border: isSelected ? "1.5px solid #3b82f6" : "1px solid #e8e8e8",
                  borderRadius: "10px", padding: "14px 16px",
                  display: "flex", alignItems: "center", gap: "12px",
                  cursor: i.available ? "pointer" : "default",
                  opacity: i.available ? 1 : 0.45,
                  textAlign: "left", position: "relative",
                }}
              >
                <div style={{
                  width: "40px", height: "40px", borderRadius: "10px",
                  background: i.color, color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "16px", fontWeight: 700, flexShrink: 0,
                }}>
                  {i.label[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a" }}>{i.label}</div>
                  <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>{t(i.subKey)}</div>
                </div>
                {isSelected && (
                  <div style={{
                    position: "absolute", top: "10px", right: "10px",
                    width: "18px", height: "18px", borderRadius: "50%",
                    background: "#3b82f6", display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: "11px", color: "#fff",
                  }}>✓</div>
                )}
                {!i.available && (
                  <div style={{
                    position: "absolute", top: "10px", right: "10px",
                    fontSize: "10px", color: "#aaa", fontWeight: 500,
                  }}>{t("common.comingSoon")}</div>
                )}
              </button>
            );
          })}
        </div>

        {/* Connect bar */}
        <div style={{
          background: "#fff", border: "1px solid #e8e8e8", borderRadius: "10px",
          padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: "14px", color: selected ? "#1a1a1a" : "#aaa" }}>
            {selected
              ? t("home.selected", { label: ALL_INTEGRATIONS.find((i) => i.name === selected)?.label })
              : t("home.selectToContinue")}
          </span>
          <a
            href={selected ? `/app/integrations/${selected}` : undefined}
            onClick={(e) => !selected && e.preventDefault()}
            style={{
              background: selected ? "#1a1a1a" : "#f0f0f0",
              color: selected ? "#fff" : "#aaa",
              border: "none", borderRadius: "8px",
              padding: "8px 20px", fontSize: "14px", fontWeight: 600,
              cursor: selected ? "pointer" : "default",
              textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px",
            }}
          >
            {t("common.connect")}
          </a>
        </div>
      </div>

    </div>
  );
}

export { boundary };
