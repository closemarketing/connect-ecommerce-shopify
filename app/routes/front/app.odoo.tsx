import { useState, useEffect } from "react";
import { useLoaderData, useActionData, useSubmit, useRevalidator } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import {
  getIntegrationByName,
  getCredentials,
  saveCredentials,
} from "~/models/Integration.server";
import { OdooService } from "~/services/erp/odoo/odoo.service";
import logger from "~/utils/logger.server";

// ── Loader ────────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  let shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) {
    shop = await prisma.shop.create({ data: { domain: session.shop } });
  }

  const odooIntegration = await getIntegrationByName("odoo");
  const credentials     = odooIntegration
    ? await getCredentials(session.shop, odooIntegration.id)
    : {};

  const latestJob = await prisma.odooSyncJob.findFirst({
    where:   { shopId: shop.id },
    orderBy: { createdAt: "desc" },
  });

  const recentJobs = await prisma.odooSyncJob.findMany({
    where:   { shopId: shop.id },
    orderBy: { createdAt: "desc" },
    take:    10,
  });

  const lastSyncAt    = (credentials as any).last_sync_at || null;
  const intervalHours = parseInt((credentials as any).sync_interval_hours || "24", 10);
  const nextSyncAt    = lastSyncAt
    ? new Date(new Date(lastSyncAt).getTime() + intervalHours * 3_600_000).toISOString()
    : null;
  const isSyncDue    = nextSyncAt ? new Date() >= new Date(nextSyncAt) : false;
  const isJobRunning = latestJob?.status === "RUNNING" || latestJob?.status === "PENDING";

  const isConfigured = !!(
    (credentials as any).url &&
    (credentials as any).dbname &&
    (credentials as any).username &&
    (credentials as any).apikey
  );

  // Auto-trigger if sync is due and no job is already running
  if (isConfigured && isSyncDue && !isJobRunning) {
    const offlineSession = await prisma.session.findFirst({
      where: { shop: session.shop, isOnline: false },
    });
    if (offlineSession?.accessToken) {
      const newJob = await prisma.odooSyncJob.create({
        data: { shopId: shop.id, status: "PENDING" },
      });
      const { runOdooSync } = await import(
        "~/services/erp/odoo/sync-products-from-odoo.server"
      );
      runOdooSync({
        jobId:       newJob.id,
        shopId:      shop.id,
        shopDomain:  session.shop,
        accessToken: offlineSession.accessToken,
        odooCredentials: {
          url:      (credentials as any).url,
          dbname:   (credentials as any).dbname,
          username: (credentials as any).username,
          apikey:   (credentials as any).apikey,
        },
      }).catch((err: Error) => logger.error("Auto-sync Odoo error:", err));
    }
  }

  return {
    credentials,
    latestJob,
    recentJobs,
    shop:         session.shop,
    isConfigured,
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
    const url                = String(formData.get("url") ?? "").trim();
    const dbname              = String(formData.get("dbname") ?? "").trim();
    const username            = String(formData.get("username") ?? "").trim();
    const apikey              = String(formData.get("apikey") ?? "").trim();
    const syncIntervalHrs     = String(formData.get("sync_interval_hours") ?? "24").trim();

    if (!url || !dbname || !username || !apikey) {
      return { success: false, error: "URL, base de datos, usuario y API Key son requeridos." };
    }

    const odoo = new OdooService({ url, dbname, username, apikey });
    const ok   = await odoo.validateCredentials();
    if (!ok) {
      return { success: false, error: "No se pudo conectar con Odoo. Revisa la URL, base de datos, usuario y API Key." };
    }

    const integration = await getIntegrationByName("odoo");
    if (!integration) {
      return { success: false, error: "Integración Odoo no encontrada en BD." };
    }

    await saveCredentials(session.shop, integration.id, {
      url,
      dbname,
      username,
      apikey,
      sync_interval_hours: syncIntervalHrs,
    });

    return { success: true, message: "Credenciales guardadas correctamente." };
  }

  if (intent === "sync_now") {
    let shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
    if (!shop) shop = await prisma.shop.create({ data: { domain: session.shop } });

    const runningJob = await prisma.odooSyncJob.findFirst({
      where:   { shopId: shop.id, status: { in: ["RUNNING", "PENDING"] } },
      orderBy: { createdAt: "desc" },
    });
    if (runningJob) {
      return { success: false, error: "Ya hay una sincronización en curso." };
    }

    const integration = await getIntegrationByName("odoo");
    const credentials = integration
      ? await getCredentials(session.shop, integration.id)
      : {};

    const creds = credentials as Record<string, string>;
    if (!creds.url || !creds.dbname || !creds.username || !creds.apikey) {
      return { success: false, error: "Configura la conexión con Odoo primero." };
    }

    const offlineSession = await prisma.session.findFirst({
      where: { shop: session.shop, isOnline: false },
    });
    if (!offlineSession?.accessToken) {
      return { success: false, error: "No se encontró sesión offline con access token." };
    }

    const newJob = await prisma.odooSyncJob.create({
      data: { shopId: shop.id, status: "PENDING" },
    });

    const { runOdooSync } = await import(
      "~/services/erp/odoo/sync-products-from-odoo.server"
    );
    runOdooSync({
      jobId:       newJob.id,
      shopId:      shop.id,
      shopDomain:  session.shop,
      accessToken: offlineSession.accessToken,
      odooCredentials: {
        url:      creds.url,
        dbname:   creds.dbname,
        username: creds.username,
        apikey:   creds.apikey,
      },
    }).catch((err: Error) => logger.error("Manual sync Odoo error:", err));

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

export default function OdooPage() {
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

  const [url, setUrl]                             = useState(creds.url ?? "");
  const [dbname, setDbname]                       = useState(creds.dbname ?? "");
  const [username, setUsername]                   = useState(creds.username ?? "");
  const [apiKey, setApiKey]                       = useState(creds.apikey ?? "");
  const [syncIntervalHours, setSyncIntervalHours] = useState(String(intervalHours));
  const [isEditingKey, setIsEditingKey]           = useState(!isConfigured);
  const [showSaveBar, setShowSaveBar]             = useState(false);

  const isRunning =
    latestJob?.status === "RUNNING" || latestJob?.status === "PENDING";
  const progress = latestJob?.totalProducts
    ? Math.round((latestJob.syncedProducts / latestJob.totalProducts) * 100)
    : 0;

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => revalidator.revalidate(), 3_000);
    return () => clearInterval(interval);
  }, [isRunning, revalidator]);

  useEffect(() => {
    if (!actionData) return;
    if ((actionData as any).success) {
      shopify.toast.show((actionData as any).message ?? "OK");
    } else if ((actionData as any).error) {
      shopify.toast.show((actionData as any).error, { isError: true });
    }
  }, [actionData, shopify]);

  useEffect(() => {
    if (showSaveBar) {
      shopify.saveBar.show("odoo-save-bar");
    } else {
      shopify.saveBar.hide("odoo-save-bar");
    }
  }, [showSaveBar, shopify]);

  const handleSaveCredentials = () => {
    const form = new FormData();
    form.append("intent", "save_credentials");
    form.append("url", url);
    form.append("dbname", dbname);
    form.append("username", username);
    form.append("apikey", apiKey);
    form.append("sync_interval_hours", syncIntervalHours);
    submit(form, { method: "post" });
    setShowSaveBar(false);
  };

  const handleDiscard = () => {
    setUrl(creds.url ?? "");
    setDbname(creds.dbname ?? "");
    setUsername(creds.username ?? "");
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
      <ui-save-bar id="odoo-save-bar">
        <button variant="primary" onClick={handleSaveCredentials}></button>
        <button onClick={handleDiscard}></button>
      </ui-save-bar>

      <ui-title-bar title="Sincronización Odoo"></ui-title-bar>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", alignItems: "start" }}>

          {/* Config card */}
          <div style={cardStyle}>
            <h2 style={sectionHeading}>Configuración</h2>
            <hr style={dividerStyle} />

            {isConfigured && !isEditingKey ? (
              <div style={{ marginBottom: "16px" }}>
                <div style={fieldLabel}>Conexión</div>
                <div style={{ fontSize: "13px", color: "#374151", marginTop: "4px" }}>{creds.url}</div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>{creds.dbname} · {creds.username}</div>
                <button onClick={() => setIsEditingKey(true)} style={{ ...slimBtn, marginTop: "8px" }}>Editar conexión</button>
              </div>
            ) : (
              <div style={{ marginBottom: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label style={fieldLabel}>URL del servidor</label>
                  <input
                    type="text"
                    placeholder="https://miempresa.odoo.com"
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); setShowSaveBar(true); }}
                    style={{ ...inputStyle, marginTop: "4px" }}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>Base de datos</label>
                  <input
                    type="text"
                    value={dbname}
                    onChange={(e) => { setDbname(e.target.value); setShowSaveBar(true); }}
                    style={{ ...inputStyle, marginTop: "4px" }}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>Usuario</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setShowSaveBar(true); }}
                    style={{ ...inputStyle, marginTop: "4px" }}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>API Key</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => { setApiKey(e.target.value); setShowSaveBar(true); }}
                    style={{ ...inputStyle, marginTop: "4px" }}
                  />
                  <div style={helpText}>API Key generada en el perfil del usuario de Odoo (o su contraseña).</div>
                </div>
                {isConfigured && (
                  <button
                    onClick={() => {
                      setIsEditingKey(false);
                      setUrl(creds.url ?? "");
                      setDbname(creds.dbname ?? "");
                      setUsername(creds.username ?? "");
                      setApiKey(creds.apikey ?? "");
                      setShowSaveBar(false);
                    }}
                    style={{ ...slimBtn, alignSelf: "flex-start" }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            )}

            <div style={{ marginBottom: "16px" }}>
              <label style={fieldLabel}>Intervalo de sincronización automática</label>
              <select
                value={syncIntervalHours}
                onChange={(e) => { setSyncIntervalHours(e.target.value); setShowSaveBar(true); }}
                style={{ ...inputStyle, marginTop: "4px" }}
              >
                <option value="1">Cada 1 hora</option>
                <option value="6">Cada 6 horas</option>
                <option value="12">Cada 12 horas</option>
                <option value="24">Cada 24 horas</option>
                <option value="48">Cada 48 horas</option>
              </select>
            </div>

            <button onClick={handleSaveCredentials} style={primaryBtn}>
              Guardar configuración
            </button>
          </div>

          {/* Sync status card */}
          <div style={cardStyle}>
            <h2 style={sectionHeading}>Estado de Sincronización</h2>
            <hr style={dividerStyle} />

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
              <div style={{ display: "flex", gap: "8px", fontSize: "13px" }}>
                <span style={{ color: "#6b7280", minWidth: "160px" }}>Última sincronización:</span>
                <span>{formatDate(lastSyncAt)}</span>
              </div>
              <div style={{ display: "flex", gap: "8px", fontSize: "13px" }}>
                <span style={{ color: "#6b7280", minWidth: "160px" }}>Próxima sincronización:</span>
                <span>{formatDate(nextSyncAt)}</span>
              </div>
            </div>

            {latestJob?.status === "COMPLETED" && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>Últimos resultados:</div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ ...badge, background: "#e8faf0", color: "#2a7a2a" }}>{lastResults.updated} actualizados</span>
                  <span style={{ ...badge, background: "#e8f0ff", color: "#0050b3" }}>{lastResults.created} creados</span>
                  {lastResults.errors > 0 && (
                    <span style={{ ...badge, background: "#fff0f0", color: "#c0392b" }}>{lastResults.errors} errores</span>
                  )}
                </div>
              </div>
            )}

            {isRunning && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>
                  <span>Progreso</span>
                  <span>{latestJob?.syncedProducts ?? 0} / {latestJob?.totalProducts ?? "…"}</span>
                </div>
                <div style={{ height: "8px", background: "#e5e7eb", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ height: "8px", width: `${progress}%`, background: "#ea580c", borderRadius: "4px", transition: "width 0.5s ease" }} />
                </div>
                <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>Sincronizando… {progress}%</div>
              </div>
            )}

            <button
              onClick={handleSyncNow}
              disabled={isRunning || !isConfigured}
              style={{ ...primaryBtn, opacity: (isRunning || !isConfigured) ? 0.5 : 1, cursor: (isRunning || !isConfigured) ? "not-allowed" : "pointer" }}
            >
              {isRunning ? "Sincronizando…" : "Sincronizar Ahora"}
            </button>
          </div>

        </div>

        {/* Recent jobs table */}
        <div style={cardStyle}>
          <h2 style={sectionHeading}>Historial de Sincronizaciones</h2>
          <hr style={dividerStyle} />

          {recentJobs.length === 0 ? (
            <p style={{ fontSize: "13px", color: "#6b7280" }}>No hay sincronizaciones registradas todavía.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e0e0e0", background: "#f9f9f9" }}>
                    <th style={thStyle}>Fecha</th>
                    <th style={thStyle}>Estado</th>
                    <th style={thStyle}>Total</th>
                    <th style={thStyle}>Actualizados</th>
                    <th style={thStyle}>Creados</th>
                    <th style={thStyle}>Errores</th>
                    <th style={thStyle}>Duración</th>
                    <th style={thStyle}>Resumen</th>
                  </tr>
                </thead>
                <tbody>
                  {(recentJobs as any[]).map((job) => {
                    const r = getLastResults(job.log);
                    const b = STATUS_BADGE[job.status] ?? STATUS_BADGE.PENDING;
                    return (
                      <tr key={job.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                        <td style={tdStyle}>{formatDate(job.createdAt)}</td>
                        <td style={tdStyle}>
                          <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 500, background: b.bg, color: b.color }}>
                            {b.label}
                          </span>
                        </td>
                        <td style={tdStyle}>{job.totalProducts ?? "—"}</td>
                        <td style={tdStyle}>{r.updated}</td>
                        <td style={tdStyle}>{r.created}</td>
                        <td style={{ ...tdStyle, color: r.errors > 0 ? "#c0392b" : "inherit" }}>{r.errors}</td>
                        <td style={tdStyle}>{formatDuration(job.startedAt, job.completedAt)}</td>
                        <td style={{ ...tdStyle, maxWidth: "260px" }}>
                          {job.summary ? (
                            <details>
                              <summary style={{ cursor: "pointer", fontSize: "11px", color: r.errors > 0 ? "#c0392b" : "#555" }}>
                                {r.errors > 0 ? `Ver ${r.errors} errores` : "Ver detalle"}
                              </summary>
                              <pre style={{ marginTop: "6px", fontSize: "10px", color: "#444", whiteSpace: "pre-wrap", background: "#f8f8f8", padding: "6px", borderRadius: "4px", maxHeight: "200px", overflowY: "auto" }}>
                                {job.summary}
                              </pre>
                            </details>
                          ) : "—"}
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
    </>
  );
}

const cardStyle: React.CSSProperties = {
  background:   "white",
  borderRadius: "8px",
  border:       "1px solid #e5e7eb",
  padding:      "20px 24px",
};

const sectionHeading: React.CSSProperties = {
  margin:     0,
  fontSize:   "16px",
  fontWeight: 600,
  color:      "#111827",
};

const dividerStyle: React.CSSProperties = {
  border:     "none",
  borderTop:  "1px solid #f0f0f0",
  margin:     "14px 0",
};

const fieldLabel: React.CSSProperties = {
  display:    "block",
  fontSize:   "13px",
  fontWeight: 500,
  color:      "#374151",
};

const helpText: React.CSSProperties = {
  fontSize:  "12px",
  color:     "#6b7280",
  marginTop: "4px",
};

const inputStyle: React.CSSProperties = {
  display:      "block",
  width:        "100%",
  padding:      "8px 12px",
  fontSize:     "14px",
  borderRadius: "6px",
  border:       "1px solid #d1d5db",
  background:   "white",
  boxSizing:    "border-box",
};

const primaryBtn: React.CSSProperties = {
  padding:      "8px 16px",
  fontSize:     "14px",
  fontWeight:   600,
  borderRadius: "6px",
  border:       "none",
  background:   "#ea580c",
  color:        "white",
  cursor:       "pointer",
};

const slimBtn: React.CSSProperties = {
  padding:      "4px 10px",
  fontSize:     "13px",
  borderRadius: "5px",
  border:       "1px solid #d1d5db",
  background:   "white",
  cursor:       "pointer",
  color:        "#374151",
};

const badge: React.CSSProperties = {
  display:      "inline-block",
  padding:      "2px 10px",
  borderRadius: "12px",
  fontSize:     "12px",
  fontWeight:   500,
};

const thStyle: React.CSSProperties = {
  padding:    "6px 10px",
  textAlign:  "left",
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding:    "7px 10px",
  whiteSpace: "nowrap",
};
