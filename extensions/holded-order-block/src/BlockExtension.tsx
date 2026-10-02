import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

export default function () {
  render(<BlockExtension />, document.body);
}

interface SyncStatus {
  synced: boolean;
  erpId: string | null;
  docUrl: string | null;
  syncedAt: string | null;
}

function BlockExtension() {
  const orderId = shopify.data.selected[0]?.id ?? "";

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncErr, setSyncErr] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }

    shopify.auth.idToken()
      .then((token) => fetch(`/api/holded-order-status?shopifyOrderId=${encodeURIComponent(orderId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }))
      .then((r) => r.json())
      .then((json: any) => {
        setStatus({
          synced: json.synced ?? false,
          erpId: json.erpId ?? null,
          docUrl: json.docUrl ?? null,
          syncedAt: json.syncedAt ?? null,
        });
      })
      .catch(() => setStatus({ synced: false, erpId: null, docUrl: null, syncedAt: null }))
      .finally(() => setLoading(false));
  }, [orderId]);

  const handleSync = async () => {
    if (!orderId) return;
    setSyncing(true);
    setSyncErr(null);

    try {
      const token = await shopify.auth.idToken();
      const res = await fetch("/api/holded-sync-order", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ shopifyOrderId: orderId, force: Boolean(status?.synced) }),
      });
      const json = (await res.json()) as { ok: boolean; erpId?: string; docUrl?: string; error?: string };

      if (json.ok) {
        setStatus({
          synced: true,
          erpId: json.erpId ?? null,
          docUrl: json.docUrl ?? null,
          syncedAt: new Date().toISOString(),
        });
      } else {
        setSyncErr(json.error ?? "Error desconocido");
      }
    } catch (e) {
      setSyncErr(e instanceof Error ? e.message : "Error de red");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <s-admin-block heading="Holded">
      <s-stack direction="block" gap="base">
        {loading ? (
          <s-text color="subdued">Cargando estado…</s-text>
        ) : (
          <>
            <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
              <s-text type="strong">Estado</s-text>
              {status?.synced ? (
                <s-badge tone="success">Sincronizado</s-badge>
              ) : (
                <s-badge tone="caution">No sincronizado</s-badge>
              )}
            </s-stack>

            {status?.synced && status.erpId && (
              <>
                <s-divider></s-divider>
                <s-stack direction="block" gap="small-100">
                  <s-stack direction="inline" gap="base" justifyContent="space-between">
                    <s-text color="subdued">ID Holded</s-text>
                    <s-text>{status.erpId}</s-text>
                  </s-stack>
                  {status.syncedAt && (
                    <s-stack direction="inline" gap="base" justifyContent="space-between">
                      <s-text color="subdued">Fecha</s-text>
                      <s-text>{new Date(status.syncedAt).toLocaleString("es-ES")}</s-text>
                    </s-stack>
                  )}
                  {status.docUrl && (
                    <s-link href={status.docUrl} target="_blank">
                      Ver en Holded ↗
                    </s-link>
                  )}
                </s-stack>
              </>
            )}

            {syncErr && (
              <>
                <s-divider></s-divider>
                <s-text tone="critical">{syncErr}</s-text>
              </>
            )}

            <s-divider></s-divider>

            <s-button
              onClick={handleSync}
              loading={syncing}
              variant={status?.synced ? "tertiary" : "primary"}
            >
              {syncing ? "Enviando…" : status?.synced ? "Reenviar a Holded" : "Enviar a Holded"}
            </s-button>
          </>
        )}
      </s-stack>
    </s-admin-block>
  );
}
