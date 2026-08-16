import { useFetcher, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { getActiveControllersForShop } from "~/services/integrations/dispatcher.server";

const ORDER_QUERY = `#graphql
  query getOrder($id: ID!) {
    order(id: $id) {
      id
      name
      email
      totalPriceSet { shopMoney { amount currencyCode } }
      customer { firstName lastName email }
      lineItems(first: 50) {
        edges {
          node { title quantity sku originalUnitPriceSet { shopMoney { amount } } }
        }
      }
      billingAddress { address1 address2 city zip countryCode company phone }
      shippingLines(first: 5) { edges { node { title originalPriceSet { shopMoney { amount } } } } }
      note
      createdAt
    }
  }
`;

interface IntegrationSyncState {
  name:        string;
  displayName: string;
  erpId:       string | null;
  docUrl:      string | null;
}

// ── Loader ────────────────────────────────────────────────────────────────────

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const numericId = params.id ?? "";
  const gqlId     = `gid://shopify/Order/${numericId}`;

  const gqlResponse = await admin.graphql(ORDER_QUERY, { variables: { id: gqlId } });
  const gqlData     = await gqlResponse.json();
  const order       = gqlData?.data?.order ?? null;

  // One row per active integration — connector-agnostic. Adding a new ERP under
  // app/services/erp/<name>/ (with a controller factory in dispatcher.server.ts)
  // is all it takes for it to show up here, no changes needed in this route.
  let integrationSyncStates: IntegrationSyncState[] = [];
  if (order) {
    const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
    if (shop) {
      const activeIntegrations = await getActiveControllersForShop(session.shop);

      integrationSyncStates = await Promise.all(
        activeIntegrations.map(async ({ name, displayName, controller }) => {
          const syncLog = await prisma.syncLog.findFirst({
            where: {
              shopId:    shop.id,
              syncType:  "ORDER",
              shopifyId: numericId,
              status:    "SUCCESS",
              erpName:   name,
            },
            orderBy: { createdAt: "desc" },
          });

          if (!syncLog?.externalId) {
            return { name, displayName, erpId: null, docUrl: null };
          }

          let previousResult: Record<string, any> = {};
          try {
            previousResult = syncLog.responseData ? JSON.parse(syncLog.responseData) : {};
          } catch {
            // Older log rows may pre-date structured responseData — ignore.
          }

          const docUrl = controller.getRecordUrl?.({
            ...previousResult,
            success: true,
            erpId:   syncLog.externalId,
          }) ?? null;

          return { name, displayName, erpId: String(syncLog.externalId), docUrl };
        }),
      );
    }
  }

  return { order, numericId, gqlId, integrationSyncStates };
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function OrderDetailPage() {
  const { order, gqlId, integrationSyncStates } = useLoaderData<typeof loader>();

  if (!order) {
    return (
      <div style={{ padding: "24px" }}>
        <p style={{ color: "#c0392b" }}>Pedido no encontrado.</p>
      </div>
    );
  }

  const customer = order.customer;
  const total    = order.totalPriceSet?.shopMoney;

  return (
    <>
      <ui-title-bar title={`Pedido ${order.name}`}></ui-title-bar>

      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "24px", fontFamily: "sans-serif" }}>

        {/* Order header */}
        <div style={cardStyle}>
          <h2 style={headingStyle}>{order.name}</h2>
          <div style={{ display: "flex", gap: "32px", flexWrap: "wrap", marginTop: "12px" }}>
            <div>
              <div style={labelStyle}>Cliente</div>
              <div style={valueStyle}>
                {customer ? `${customer.firstName} ${customer.lastName}`.trim() : "—"}
              </div>
            </div>
            <div>
              <div style={labelStyle}>Email</div>
              <div style={valueStyle}>{order.email ?? customer?.email ?? "—"}</div>
            </div>
            <div>
              <div style={labelStyle}>Total</div>
              <div style={valueStyle}>
                {total ? `${total.amount} ${total.currencyCode}` : "—"}
              </div>
            </div>
            <div>
              <div style={labelStyle}>Fecha</div>
              <div style={valueStyle}>
                {order.createdAt ? new Date(order.createdAt).toLocaleString("es-ES") : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Line items */}
        <div style={cardStyle}>
          <h3 style={headingStyle}>Líneas del pedido</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", marginTop: "12px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e0e0e0", background: "#f9f9f9" }}>
                <th style={thStyle}>Producto</th>
                <th style={thStyle}>SKU</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Cant.</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Precio</th>
              </tr>
            </thead>
            <tbody>
              {(order.lineItems?.edges ?? []).map((e: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={tdStyle}>{e.node.title}</td>
                  <td style={tdStyle}>{e.node.sku || "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{e.node.quantity}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {e.node.originalUnitPriceSet?.shopMoney?.amount ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* One sync card per active integration */}
        {integrationSyncStates.length === 0 ? (
          <div style={cardStyle}>
            <p style={{ fontSize: "13px", color: "#6b7280", margin: 0 }}>
              No hay ninguna integración activa para esta tienda.
            </p>
          </div>
        ) : (
          integrationSyncStates.map((state) => (
            <IntegrationSyncCard key={state.name} gqlId={gqlId} state={state} />
          ))
        )}

      </div>
    </>
  );
}

// ── Per-integration sync card ────────────────────────────────────────────────

function IntegrationSyncCard({ gqlId, state }: { gqlId: string; state: IntegrationSyncState }) {
  const fetcher = useFetcher<{ ok: boolean; erpId?: string; docUrl?: string; error?: string }>({
    key: `sync-order-${state.name}`,
  });

  const isSyncing  = fetcher.state !== "idle";
  const syncResult = fetcher.data;

  const erpId  = syncResult?.erpId  ?? state.erpId  ?? null;
  const docUrl = syncResult?.docUrl ?? state.docUrl;
  const isSynced = !!erpId;

  const handleSync = () => {
    const form = new FormData();
    form.append("shopifyOrderId", gqlId);
    form.append("integration", state.name);
    fetcher.submit(form, { method: "post", action: "/api/sync-order" });
  };

  return (
    <div style={cardStyle}>
      <h3 style={headingStyle}>Sincronización {state.displayName}</h3>

      <div style={{ marginTop: "12px" }}>
        {isSynced ? (
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span style={syncedBadgeStyle}>Sincronizado</span>
            <span style={{ fontSize: "13px", color: "#444" }}>ID: {erpId}</span>
            {docUrl ? (
              <button
                onClick={() => window.open(docUrl, "_blank", "noopener")}
                style={{ fontSize: "13px", color: "#0050b3", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
              >
                Ver en {state.displayName} ↗
              </button>
            ) : null}
          </div>
        ) : (
          <span style={unsyncedBadgeStyle}>No sincronizado</span>
        )}
      </div>

      {syncResult && !syncResult.ok && (
        <div style={{ marginTop: "12px", padding: "10px 14px", background: "#fff0f0", borderRadius: "6px", fontSize: "13px", color: "#c0392b" }}>
          Error: {syncResult.error}
        </div>
      )}

      <div style={{ marginTop: "16px" }}>
        <button
          onClick={handleSync}
          disabled={isSyncing}
          style={{
            padding:       "8px 16px",
            fontSize:      "14px",
            fontWeight:    600,
            borderRadius:  "6px",
            border:        "none",
            background:    isSyncing ? "#ccc" : "#008060",
            color:         "white",
            cursor:        isSyncing ? "not-allowed" : "pointer",
          }}
        >
          {isSyncing ? "Sincronizando…" : `Sincronizar con ${state.displayName}`}
        </button>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background:   "white",
  borderRadius: "8px",
  border:       "1px solid #e5e7eb",
  padding:      "20px 24px",
  marginBottom: "16px",
};

const headingStyle: React.CSSProperties = {
  margin:     0,
  fontSize:   "16px",
  fontWeight: 600,
  color:      "#111827",
};

const labelStyle: React.CSSProperties = {
  fontSize:   "12px",
  color:      "#6b7280",
  marginBottom: "2px",
};

const valueStyle: React.CSSProperties = {
  fontSize: "14px",
  color:    "#111827",
};

const thStyle: React.CSSProperties = {
  padding:    "6px 10px",
  textAlign:  "left",
  fontWeight: 600,
  fontSize:   "12px",
  color:      "#6b7280",
};

const tdStyle: React.CSSProperties = {
  padding:    "7px 10px",
  whiteSpace: "nowrap",
};

const syncedBadgeStyle: React.CSSProperties = {
  display:      "inline-block",
  padding:      "3px 10px",
  borderRadius: "12px",
  fontSize:     "12px",
  fontWeight:   600,
  background:   "#e8faf0",
  color:        "#2a7a2a",
};

const unsyncedBadgeStyle: React.CSSProperties = {
  display:      "inline-block",
  padding:      "3px 10px",
  borderRadius: "12px",
  fontSize:     "12px",
  fontWeight:   500,
  background:   "#f3f4f6",
  color:        "#6b7280",
};
