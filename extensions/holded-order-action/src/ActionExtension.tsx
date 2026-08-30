import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useState } from "preact/hooks";

export default function () {
  render(<ActionExtension />, document.body);
}

function ActionExtension() {
  const orderId = shopify.data.selected[0]?.id ?? "";
  const t = (key: string, options?: Record<string, string | number>) =>
    shopify.i18n.translate(key, options) as string;

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [erpId, setErpId] = useState<string | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const handleSync = async () => {
    if (!orderId) return;
    setStatus("loading");
    setErrMsg(null);

    try {
      const token = await shopify.auth.idToken();
      const res = await fetch("/api/holded-sync-order", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ shopifyOrderId: orderId }),
      });
      const json = (await res.json()) as { ok: boolean; erpId?: string; docUrl?: string; error?: string };

      if (json.ok) {
        setErpId(json.erpId ?? null);
        setDocUrl(json.docUrl ?? null);
        setStatus("success");
      } else {
        setErrMsg(json.error ?? t("unknown_error"));
        setStatus("error");
      }
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : t("network_error"));
      setStatus("error");
    }
  };

  return (
    <s-admin-action heading={t("action_title")}>
      <s-button
        slot="primary-action"
        variant="primary"
        loading={status === "loading"}
        onClick={status === "success" ? () => shopify.close() : handleSync}
      >
        {status === "success" ? t("close") : t("send")}
      </s-button>
      <s-button slot="secondary-actions" onClick={() => shopify.close()}>
        {t("cancel")}
      </s-button>

      <s-stack direction="block" gap="base">
        {status === "idle" && <s-text>{t("description")}</s-text>}

        {status === "loading" && <s-text>{t("sending")}</s-text>}

        {status === "success" && (
          <s-banner tone="success" heading={t("success_title")}>
            <s-stack direction="block" gap="small-100">
              {erpId && <s-text>{t("holded_id", { erpId })}</s-text>}
              {docUrl && (
                <s-link href={docUrl} target="_blank">
                  {t("view_document")}
                </s-link>
              )}
            </s-stack>
          </s-banner>
        )}

        {status === "error" && (
          <s-banner tone="critical" heading={t("error_title")}>
            <s-text>{errMsg}</s-text>
          </s-banner>
        )}
      </s-stack>
    </s-admin-action>
  );
}
