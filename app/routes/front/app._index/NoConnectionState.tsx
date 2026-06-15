import { useState } from "react";
import { useTranslation } from "react-i18next";

const ALL_INTEGRATIONS = [
  { name: "holded",      label: "Holded",          subKey: "integrationsRegistry.holded_sub",      color: "#7C3AED", available: true  },
  { name: "clientify",   label: "Clientify",        subKey: "integrationsRegistry.clientify_sub",   color: "#EA580C", available: false },
  { name: "odoo",        label: "Odoo",             subKey: "integrationsRegistry.odoo_sub",        color: "#6B21A8", available: false },
  { name: "woocommerce", label: "WooCommerce",      subKey: "integrationsRegistry.woocommerce_sub", color: "#3B82F6", available: false },
  { name: "sap",         label: "SAP Business One", subKey: "integrationsRegistry.sap_sub",         color: "#2563EB", available: false },
  { name: "hubspot",     label: "HubSpot",          subKey: "integrationsRegistry.hubspot_sub",     color: "#DC2626", available: false },
];

interface Props {
  shop: string;
}

export function NoConnectionState({ shop }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const { t } = useTranslation();

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

      {/* Hero */}
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
        <div
          style={{ fontSize: "14px", color: "#666", maxWidth: "420px", margin: "0 auto", lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: t("home.heroSub", { shop }) }}
        />
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
