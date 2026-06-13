import { useState, useEffect } from "react";
import { useLoaderData, useActionData, useSubmit, useRevalidator } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  getIntegrationByName,
  getCredentials,
  saveCredentials,
} from "../models/Integration.server";
import { HoldedInvoicingService } from "../services/holded/holded.server";
import logger from "../utils/logger.server";

// ── Loader ────────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  let shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) {
    shop = await prisma.shop.create({ data: { domain: session.shop } });
  }

  const holdedIntegration = await getIntegrationByName("holded");
  const credentials       = holdedIntegration
    ? await getCredentials(session.shop, holdedIntegration.id)
    : {};

  const latestJob = await prisma.holdedSyncJob.findFirst({
    where:   { shopId: shop.id },
    orderBy: { createdAt: "desc" },
  });

  const recentJobs = await prisma.holdedSyncJob.findMany({
    where:   { shopId: shop.id },
    orderBy: { createdAt: "desc" },
    take:    10,
  });

  const lastSyncAt     = (credentials as any).last_sync_at || null;
  const intervalHours  = parseInt((credentials as any).sync_interval_hours || "24", 10);
  const nextSyncAt     = lastSyncAt
    ? new Date(new Date(lastSyncAt).getTime() + intervalHours * 3_600_000).toISOString()
    : null;
  const isSyncDue  = nextSyncAt ? new Date() >= new Date(nextSyncAt) : false;
  const isJobRunning =
    latestJob?.status === "RUNNING" || latestJob?.status === "PENDING";

  // Auto-trigger if sync is due and no job is already running
  if ((credentials as any).apikey && isSyncDue && !isJobRunning) {
    const offlineSession = await prisma.session.findFirst({
      where: { shop: session.shop, isOnline: false },
    });
    if (offlineSession?.accessToken) {
      const newJob = await prisma.holdedSyncJob.create({
        data: { shopId: shop.id, status: "PENDING" },
      });
      const { runHoldedSync } = await import(
        "../services/holded/sync-products-from-holded.server"
      );
      runHoldedSync({
        jobId:        newJob.id,
        shopId:       shop.id,
        shopDomain:   session.shop,
        accessToken:  offlineSession.accessToken,
        holdedApiKey: (credentials as any).apikey,
      }).catch((err: Error) => logger.error("Auto-sync Holded error:", err));
    }
  }

  return {
    credentials,
    latestJob,
    recentJobs,
    shop:         session.shop,
    isConfigured: !!(credentials as any).apikey,
    nextSyncAt,
    lastSyncAt,
    intervalHours,
  };
};

// ── Action ────────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData    = await request.formData();
  const intent      = String(formData.get("intent") ?? "");

  if (intent === "save_credentials") {
    const apikey          = String(formData.get("apikey") ?? "").trim();
    const syncIntervalHrs = String(formData.get("sync_interval_hours") ?? "24").trim();

    if (!apikey) {
      return { success: false, error: "La API Key es requerida." };
    }

    // Validate before saving
    const holded = new HoldedInvoicingService(apikey);
    const test   = await holded.testConnection();
    if (!test.ok) {
      return {
        success: false,
        error: `API Key inválida o no se pudo conectar con Holded: ${test.error ?? ""}`,
      };
    }

    const integration = await getIntegrationByName("holded");
    if (!integration) {
      return { success: false, error: "Integración Holded no encontrada en BD." };
    }

    await saveCredentials(session.shop, integration.id, {
      apikey,
      sync_interval_hours: syncIntervalHrs,
    });

    return { success: true, message: "Credenciales guardadas correctamente." };
  }

  if (intent === "sync_now") {
    let shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
    if (!shop) shop = await prisma.shop.create({ data: { domain: session.shop } });

    const runningJob = await prisma.holdedSyncJob.findFirst({
      where:   { shopId: shop.id, status: { in: ["RUNNING", "PENDING"] } },
      orderBy: { createdAt: "desc" },
    });
    if (runningJob) {
      return { success: false, error: "Ya hay una sincronización en curso." };
    }

    const integration = await getIntegrationByName("holded");
    const credentials = integration
      ? await getCredentials(session.shop, integration.id)
      : {};

    if (!(credentials as any).apikey) {
      return { success: false, error: "Configura la API Key de Holded primero." };
    }

    const offlineSession = await prisma.session.findFirst({
      where: { shop: session.shop, isOnline: false },
    });
    if (!offlineSession?.accessToken) {
      return { success: false, error: "No se encontró sesión offline con access token." };
    }

    const newJob = await prisma.holdedSyncJob.create({
      data: { shopId: shop.id, status: "PENDING" },
    });

    const { runHoldedSync } = await import(
      "../services/holded/sync-products-from-holded.server"
    );
    runHoldedSync({
      jobId:        newJob.id,
      shopId:       shop.id,
      shopDomain:   session.shop,
      accessToken:  offlineSession.accessToken,
      holdedApiKey: (credentials as any).apikey,
    }).catch((err: Error) => logger.error("Manual sync Holded error:", err));

    return { success: true, message: "Sincronización iniciada.", jobId: newJob.id };
  }

  return { success: false, error: "Acción no válida." };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-ES", {
    day:    "2-digit",
    month:  "2-digit",
    year:   "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(startedAt: string | null | undefined, completedAt: string | null | undefined): string {
  if (!startedAt || !completedAt) return "—";
  const secs = Math.round(
    (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000,
  );
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function getLastResults(log: string | null | undefined): { updated: number; created: number; errors: number } {
  if (!log) return { updated: 0, created: 0, errors: 0 };
  try {
    const entries: Array<{ action: string }> = JSON.parse(log);
    return {
      updated: entries.filter((e) => e.action === "updated").length,
      created: entries.filter((e) => e.action === "created").length,
      errors:  entries.filter((e) => e.action === "error").length,
    };
  } catch {
    return { updated: 0, created: 0, errors: 0 };
  }
}

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  PENDING:   { bg: "#e8f4ff", color: "#0050b3", label: "Pendiente" },
  RUNNING:   { bg: "#fff8e1", color: "#b45309", label: "Ejecutando" },
  COMPLETED: { bg: "#e8faf0", color: "#2a7a2a", label: "Completado" },
  FAILED:    { bg: "#fff0f0", color: "#c0392b", label: "Fallido"    },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function HoldedPage() {
  const {
    credentials,
    latestJob,
    recentJobs,
    isConfigured,
    nextSyncAt,
    lastSyncAt,
    intervalHours,
  } = useLoaderData<typeof loader>();

  const actionData  = useActionData<typeof action>();
  const submit      = useSubmit();
  const shopify     = useAppBridge();
  const revalidator = useRevalidator();

  const creds = credentials as Record<string, string>;

  const [apiKey, setApiKey]                     = useState(creds.apikey ?? "");
  const [syncIntervalHours, setSyncIntervalHours] = useState(String(intervalHours));
  const [isEditingKey, setIsEditingKey]          = useState(!isConfigured);
  const [showSaveBar, setShowSaveBar]            = useState(false);

  const isRunning =
    latestJob?.status === "RUNNING" || latestJob?.status === "PENDING";
  const progress = latestJob?.totalProducts
    ? Math.round((latestJob.syncedProducts / latestJob.totalProducts) * 100)
    : 0;

  // Poll every 3 s while a job is active
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => revalidator.revalidate(), 3_000);
    return () => clearInterval(interval);
  }, [isRunning, revalidator]);

  // Toast on action result
  useEffect(() => {
    if (!actionData) return;
    if ((actionData as any).success) {
      shopify.toast.show((actionData as any).message ?? "OK");
    } else if ((actionData as any).error) {
      shopify.toast.show((actionData as any).error, { isError: true });
    }
  }, [actionData, shopify]);

  // Show/hide save bar
  useEffect(() => {
    if (showSaveBar) {
      shopify.saveBar.show("holded-save-bar");
    } else {
      shopify.saveBar.hide("holded-save-bar");
    }
  }, [showSaveBar, shopify]);

  const handleSaveCredentials = () => {
    const form = new FormData();
    form.append("intent", "save_credentials");
    form.append("apikey", apiKey);
    form.append("sync_interval_hours", syncIntervalHours);
    submit(form, { method: "post" });
    setShowSaveBar(false);
  };

  const handleDiscard = () => {
    setApiKey(creds.apikey ?? "");
    setSyncIntervalHours(String(intervalHours));
    setIsEditingKey(!isConfigured);
    setShowSaveBar(false);
  };

  const handleSyncNow = () => {
    const form = new FormData();
    form.append("intent", "sync_now");
    submit(form, { method: "post" });
  };

  const lastResults = getLastResults(latestJob?.log);

  return (
    <>
      <ui-save-bar id="holded-save-bar">
        <button variant="primary" onClick={handleSaveCredentials}></button>
        <button onClick={handleDiscard}></button>
      </ui-save-bar>

      <ui-title-bar title="Sincronización Holded"></ui-title-bar>

      <s-block-stack gap="400">

        {/* ── Config + Sync status side by side ── */}
        <s-layout>

          {/* Config card */}
          <s-layout-section>
            <s-card>
              <s-block-stack gap="300">
                <s-text variant="headingMd" as="h2">Configuración</s-text>
                <s-divider></s-divider>

                {/* API key */}
                {isConfigured && !isEditingKey ? (
                  <s-block-stack gap="200">
                    <s-text variant="bodySm" as="p" tone="subdued">API Key</s-text>
                    <s-inline-stack gap="200" blockAlign="center">
                      <s-text variant="bodyMd" as="p">••••••••••••••••</s-text>
                      <s-button size="slim" onClick={() => setIsEditingKey(true)}>
                        Editar API Key
                      </s-button>
                    </s-inline-stack>
                  </s-block-stack>
                ) : (
                  <s-block-stack gap="200">
                    <s-text-field
                      label="API Key de Holded"
                      value={apiKey}
                      type="password"
                      helpText="Genera tu API Key en Holded &gt; Configuración &gt; Desarrolladores."
                      onInput={(e: any) => {
                        setApiKey(e.target.value);
                        setShowSaveBar(true);
                      }}
                    ></s-text-field>
                    {isConfigured && (
                      <s-button
                        size="slim"
                        onClick={() => {
                          setIsEditingKey(false);
                          setApiKey(creds.apikey ?? "");
                          setShowSaveBar(false);
                        }}
                      >
                        Cancelar
                      </s-button>
                    )}
                  </s-block-stack>
                )}

                {/* Sync interval */}
                <s-block-stack gap="100">
                  <s-text variant="bodySm" as="label">
                    Intervalo de sincronización automática
                  </s-text>
                  <select
                    value={syncIntervalHours}
                    onChange={(e) => {
                      setSyncIntervalHours(e.target.value);
                      setShowSaveBar(true);
                    }}
                    style={{
                      padding:      "8px 12px",
                      fontSize:     "14px",
                      borderRadius: "6px",
                      border:       "1px solid #d1d5db",
                      background:   "white",
                      cursor:       "pointer",
                      width:        "100%",
                    }}
                  >
                    <option value="1">Cada 1 hora</option>
                    <option value="6">Cada 6 horas</option>
                    <option value="12">Cada 12 horas</option>
                    <option value="24">Cada 24 horas</option>
                    <option value="48">Cada 48 horas</option>
                  </select>
                </s-block-stack>

                {/* Save button (also available via save bar) */}
                <s-button variant="primary" onClick={handleSaveCredentials}>
                  Guardar configuración
                </s-button>
              </s-block-stack>
            </s-card>
          </s-layout-section>

          {/* Sync status card */}
          <s-layout-section>
            <s-card>
              <s-block-stack gap="300">
                <s-text variant="headingMd" as="h2">Estado de Sincronización</s-text>
                <s-divider></s-divider>

                <s-block-stack gap="200">
                  <s-inline-stack gap="200" blockAlign="center">
                    <s-text variant="bodySm" as="span" tone="subdued">Última sincronización:</s-text>
                    <s-text variant="bodySm" as="span">{formatDate(lastSyncAt)}</s-text>
                  </s-inline-stack>
                  <s-inline-stack gap="200" blockAlign="center">
                    <s-text variant="bodySm" as="span" tone="subdued">Próxima sincronización:</s-text>
                    <s-text variant="bodySm" as="span">{formatDate(nextSyncAt)}</s-text>
                  </s-inline-stack>
                </s-block-stack>

                {latestJob?.status === "COMPLETED" && (
                  <s-block-stack gap="100">
                    <s-text variant="bodySm" as="p" tone="subdued">Últimos resultados:</s-text>
                    <s-inline-stack gap="300">
                      <s-badge tone="success">{lastResults.updated} actualizados</s-badge>
                      <s-badge tone="info">{lastResults.created} creados</s-badge>
                      {lastResults.errors > 0 && (
                        <s-badge tone="critical">{lastResults.errors} errores</s-badge>
                      )}
                    </s-inline-stack>
                  </s-block-stack>
                )}

                {isRunning && (
                  <s-block-stack gap="100">
                    <s-inline-stack gap="200" blockAlign="center">
                      <s-text variant="bodySm" as="span" tone="subdued">Progreso:</s-text>
                      <s-text variant="bodySm" as="span">
                        {latestJob?.syncedProducts ?? 0} / {latestJob?.totalProducts ?? "…"}
                      </s-text>
                    </s-inline-stack>
                    <div
                      style={{
                        height:       "8px",
                        background:   "#e5e7eb",
                        borderRadius: "4px",
                        overflow:     "hidden",
                      }}
                    >
                      <div
                        style={{
                          height:       "8px",
                          width:        `${progress}%`,
                          background:   "#008060",
                          borderRadius: "4px",
                          transition:   "width 0.5s ease",
                        }}
                      />
                    </div>
                    <s-text variant="bodySm" as="p" tone="subdued">
                      Sincronizando… {progress}%
                    </s-text>
                  </s-block-stack>
                )}

                <s-button
                  variant="primary"
                  onClick={handleSyncNow}
                  disabled={isRunning || !isConfigured}
                >
                  {isRunning ? "Sincronizando…" : "Sincronizar Ahora"}
                </s-button>
              </s-block-stack>
            </s-card>
          </s-layout-section>

        </s-layout>

        {/* ── Recent jobs table ── */}
        <s-card>
          <s-block-stack gap="300">
            <s-text variant="headingMd" as="h2">Historial de Sincronizaciones</s-text>
            <s-divider></s-divider>

            {recentJobs.length === 0 ? (
              <s-text variant="bodySm" as="p" tone="subdued">
                No hay sincronizaciones registradas todavía.
              </s-text>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width:           "100%",
                    borderCollapse:  "collapse",
                    fontSize:        "13px",
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e0e0e0", background: "#f9f9f9" }}>
                      <th style={thStyle}>Fecha</th>
                      <th style={thStyle}>Estado</th>
                      <th style={thStyle}>Total</th>
                      <th style={thStyle}>Actualizados</th>
                      <th style={thStyle}>Creados</th>
                      <th style={thStyle}>Errores</th>
                      <th style={thStyle}>Duración</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(recentJobs as any[]).map((job) => {
                      const r = getLastResults(job.log);
                      const badge = STATUS_BADGE[job.status] ?? STATUS_BADGE.PENDING;
                      return (
                        <tr
                          key={job.id}
                          style={{ borderBottom: "1px solid #f0f0f0" }}
                        >
                          <td style={tdStyle}>{formatDate(job.createdAt)}</td>
                          <td style={tdStyle}>
                            <span
                              style={{
                                display:      "inline-block",
                                padding:      "2px 8px",
                                borderRadius: "12px",
                                fontSize:     "11px",
                                fontWeight:   500,
                                background:   badge.bg,
                                color:        badge.color,
                              }}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <td style={tdStyle}>{job.totalProducts ?? "—"}</td>
                          <td style={tdStyle}>{r.updated}</td>
                          <td style={tdStyle}>{r.created}</td>
                          <td style={{ ...tdStyle, color: r.errors > 0 ? "#c0392b" : "inherit" }}>
                            {r.errors}
                          </td>
                          <td style={tdStyle}>
                            {formatDuration(job.startedAt, job.completedAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </s-block-stack>
        </s-card>

      </s-block-stack>
    </>
  );
}

const thStyle: React.CSSProperties = {
  padding:   "6px 10px",
  textAlign: "left",
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding:    "7px 10px",
  whiteSpace: "nowrap",
};
