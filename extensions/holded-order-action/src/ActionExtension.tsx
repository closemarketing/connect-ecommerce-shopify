import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useState } from "preact/hooks";

export default function () {
  render(<ActionExtension />, document.body);
}

function ActionExtension() {
  const orderId = shopify.data.selected[0]?.id ?? "";

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [erpId, setErpId] = useState<string | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const handleSync = async () => {
    if (!orderId) return;
    setStatus("loading");
    setErrMsg(null);

    try {
      const form = new FormData();
      form.append("shopifyOrderId", orderId);

      const res = await fetch("/api/holded-sync-order", {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as { ok: boolean; erpId?: string; docUrl?: string; error?: string };

      if (json.ok) {
        setErpId(json.erpId ?? null);
        setDocUrl(json.docUrl ?? null);
        setStatus("success");
      } else {
        setErrMsg(json.error ?? "Error desconocido");
        setStatus("error");
      }
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Error de red");
      setStatus("error");
    }
  };

  return (
    <s-admin-action heading="Enviar a Holded">
      <s-button
        slot="primary-action"
        variant="primary"
        loading={status === "loading"}
        onClick={status === "success" ? () => shopify.close() : handleSync}
      >
        {status === "success" ? "Cerrar" : "Enviar a Holded"}
      </s-button>
      <s-button slot="secondary-actions" onClick={() => shopify.close()}>
        Cancelar
      </s-button>

      <s-stack direction="block" gap="base">
        {status === "idle" && <s-text>Sincroniza este pedido con Holded para generar el documento correspondiente.</s-text>}

        {status === "loading" && <s-text>Enviando pedido a Holded…</s-text>}

        {status === "success" && (
          <s-banner tone="success" heading="Pedido enviado correctamente">
            <s-stack direction="block" gap="small-100">
              {erpId && <s-text>ID Holded: {erpId}</s-text>}
              {docUrl && (
                <s-link href={docUrl} target="_blank">
                  Ver documento en Holded ↗
                </s-link>
              )}
            </s-stack>
          </s-banner>
        )}

        {status === "error" && (
          <s-banner tone="critical" heading="Error">
            <s-text>{errMsg}</s-text>
          </s-banner>
        )}
      </s-stack>
    </s-admin-action>
  );
}
