import { useEffect, useState } from "react";
import { useLoaderData, useActionData, useNavigation, Form, Link } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";

import { authenticate, PLAN_HOLDED, PLAN_ODOO } from "~/shopify.server";
import { getIntegrationDefinition } from "~/services/integrations/registry.server";
import { HoldedService } from "~/services/erp/holded/holded.service";
import { OdooService } from "~/services/erp/odoo/odoo.service";
import {
	getIntegrationByName,
	getCredentials,
	saveCredentials,
	deleteCredentials,
	isIntegrationActive,
	setIntegrationActive,
} from "~/models/Integration.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
	const { session } = await authenticate.admin(request);
	const name        = String(params.name);

	const def = getIntegrationDefinition(name);
	if (!def) throw new Response("Integration not found", { status: 404 });

	const integration = await getIntegrationByName(name);
	const credentials = integration ? await getCredentials(session.shop, integration.id) : {};
	const active      = await isIntegrationActive(session.shop, name);

	return { def, credentials, active };
}

export async function action({ request, params }: ActionFunctionArgs) {
	const { session, billing } = await authenticate.admin(request);
	const name                 = String(params.name);

	const def = getIntegrationDefinition(name);
	if (!def) return { success: false, errorKey: "integrations.errorUnknown", name };

	const integration = await getIntegrationByName(name);
	if (!integration) return { success: false, errorKey: "integrations.errorUnknown", name };

	const formData = await request.formData();
	const intent   = String(formData.get("intent") ?? "save");

	if (intent === "delete") {
		await deleteCredentials(session.shop, integration.id);
		await setIntegrationActive(session.shop, name, false);
		return { success: true, message: "integrationDetail.credentialsDeleted" };
	}

	if (intent === "toggle") {
		const next = String(formData.get("active") ?? "false") === "true";
		const plan = name === "holded" ? PLAN_HOLDED : name === "odoo" ? PLAN_ODOO : null;

		if (plan && !process.env.SKIP_BILLING) {
			if (next) {
				// Activating — ensure billing subscription is in place
				const billingCheck = await billing.check({ plans: [plan], isTest: true });
				if (!billingCheck.hasActivePayment) {
					// billing.request throws a redirect — no code after this runs
					await billing.request({ plan, isTest: true, returnUrl: request.url });
				}
			} else {
				// Deactivating — cancel the subscription if one is active
				const billingCheck = await billing.check({ plans: [plan], isTest: true });
				if (billingCheck.hasActivePayment && billingCheck.appSubscriptions.length > 0) {
					await billing.cancel({
						subscriptionId: billingCheck.appSubscriptions[0].id,
						isTest: true,
						prorate: true,
					});
				}
			}
		}

		await setIntegrationActive(session.shop, name, next);
		return { success: true, message: next ? "integrations.toggleActivated" : "integrations.toggleDeactivated", name: def.displayName };
	}

	const credentials: Record<string, string> = {};
	for (const field of def.credentials) {
		const value = String(formData.get(field.key) ?? "").trim();
		if (field.required && !value) return { success: false, errorKey: "integrationDetail.errorRequired", label: field.label };
		credentials[field.key] = value;
	}

	// Validate API key against the actual integration before saving
	if (name === "holded" && credentials.apikey) {
		const holded = new HoldedService(credentials.apikey);
		const result = await holded.validateKey();
		if (!result.ok) {
			if (result.status === 401 || result.status === 403) {
				return { success: false, errorKey: "integrationDetail.errorInvalidApiKey", status: String(result.status) };
			}
			return { success: false, errorKey: "integrationDetail.errorCannotConnect" };
		}
	}

	if (name === "odoo" && credentials.url && credentials.dbname && credentials.username && credentials.apikey) {
		const odoo = new OdooService({
			url:      credentials.url,
			dbname:   credentials.dbname,
			username: credentials.username,
			apikey:   credentials.apikey,
		});
		const ok = await odoo.validateCredentials();
		if (!ok) return { success: false, errorKey: "integrationDetail.errorCannotConnect" };
	}

	if (name === "clientify" && credentials.apikey) {
		try {
			const res = await fetch("https://api.clientify.net/v1/contacts/", {
				method: "GET",
				headers: { Authorization: `Token ${credentials.apikey}`, "Content-Type": "application/json" },
			});
			if (!res.ok) return { success: false, errorKey: "integrationDetail.errorInvalidApiKey", status: String(res.status) };
		} catch {
			return { success: false, errorKey: "integrationDetail.errorCannotConnect" };
		}
	}

	await saveCredentials(session.shop, integration.id, credentials);
	return { success: true, message: "integrationDetail.credentialsSaved" };
}

export default function IntegrationDetail() {
	const { def, credentials, active } = useLoaderData<typeof loader>();
	const actionData                   = useActionData<typeof action>();
	const navigation                   = useNavigation();
	const shopify                      = useAppBridge();

	const [values, setValues] = useState<Record<string, string>>(credentials);
	const isSubmitting        = navigation.state === "submitting";
	const { t } = useTranslation();

	useEffect(() => { setValues(credentials); }, [credentials]);

	useEffect(() => {
		if (!actionData) return;
		if (actionData.success && actionData.message) {
			const msg = (actionData as any).name
				? t(actionData.message, { name: (actionData as any).name })
				: t(actionData.message);
			shopify.toast.show(msg);
		} else if (!actionData.success && (actionData as any).errorKey) {
			const d = actionData as any;
			shopify.toast.show(t(d.errorKey, { label: d.label, status: d.status }), { isError: true });
		}
	}, [actionData, shopify, t]);

	const hasCredentials = Object.keys(credentials).length > 0;

	const statusColor  = active ? { bg: "#e8faf0", color: "#2a7a2a", dot: "#2a7a2a", label: t("integrations.statusActive") }
	                   : hasCredentials ? { bg: "#e8f4ff", color: "#0050b3", dot: "#0050b3", label: t("integrations.statusConfigured") }
	                   : { bg: "#f0f0f0", color: "#666", dot: "#aaa", label: t("integrations.statusNotConfigured") };

	return (
		<div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "16px", alignItems: "start" }}>

			{/* Left — Credentials */}
			<div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e8e8e8", overflow: "hidden" }}>
				<div style={{ padding: "18px 20px", borderBottom: "1px solid #f0f0f0" }}>
					<span style={{ fontWeight: 700, fontSize: "15px", color: "#1a1a1a" }}>{t("integrationDetail.sectionCredentials")}</span>
				</div>
				<div style={{ padding: "20px" }}>
					<Form method="post">
						<input type="hidden" name="intent" value="save" />
						<div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
							{def.credentials.map((field) => (
								<div key={field.key}>
									<label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#444", marginBottom: "6px" }}>
										{field.label}
										{field.required && <span style={{ color: "#c0392b", marginLeft: "3px" }}>*</span>}
									</label>
									<input
										name={field.key}
										type={field.type === "password" ? "password" : "text"}
										placeholder={field.placeholder ?? ""}
										value={values[field.key] ?? ""}
										onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
										style={{
											width: "100%", padding: "9px 12px", fontSize: "14px",
											border: "1px solid #e0e0e0", borderRadius: "8px",
											outline: "none", boxSizing: "border-box",
											background: "#fafafa",
										}}
									/>
									{field.helpText && (
										<p style={{ fontSize: "12px", color: "#888", marginTop: "5px" }}>{field.helpText}</p>
									)}
								</div>
							))}

							{actionData && !actionData.success && actionData.error && (
								<div style={{
									background: "#fff5f5", border: "1px solid #ffc5c5",
									borderRadius: "8px", padding: "10px 14px",
									fontSize: "13px", color: "#c0392b",
								}}>
									⚠️ {actionData.error}
								</div>
							)}

							<div style={{ display: "flex", gap: "10px", alignItems: "center", paddingTop: "4px" }}>
								<button
									type="submit"
									disabled={isSubmitting}
									style={{
										background: "#1a1a1a", color: "#fff", border: "none",
										borderRadius: "8px", padding: "9px 20px",
										fontSize: "14px", fontWeight: 600, cursor: "pointer",
										opacity: isSubmitting ? 0.6 : 1,
									}}
								>
									{isSubmitting ? t("common.saving") : hasCredentials ? t("common.update") : t("common.save")}
								</button>

								{hasCredentials && (
									<button
										type="submit"
										name="intent"
										value="delete"
										disabled={isSubmitting}
										style={{
											background: "transparent", color: "#c0392b", border: "none",
											fontSize: "13px", cursor: "pointer", padding: "9px 0",
										}}
									>
										{t("integrationDetail.deleteCredentials")}
									</button>
								)}
							</div>
						</div>
					</Form>
				</div>
			</div>

			{/* Right column */}
			<div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

				{/* Status card */}
				<div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e8e8e8", padding: "18px 20px" }}>
					<div style={{ fontSize: "13px", fontWeight: 600, color: "#444", marginBottom: "12px" }}>{t("integrationDetail.sectionStatus")}</div>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
						<span style={{
							display: "inline-flex", alignItems: "center", gap: "6px",
							background: statusColor.bg, color: statusColor.color,
							borderRadius: "20px", padding: "4px 12px", fontSize: "13px", fontWeight: 500,
						}}>
							<span style={{ width: "7px", height: "7px", borderRadius: "50%", background: statusColor.dot, display: "inline-block" }} />
							{statusColor.label}
						</span>

						{hasCredentials && (
							<Form method="post">
								<input type="hidden" name="intent" value="toggle" />
								<input type="hidden" name="active" value={String(!active)} />
								<button
									type="submit"
									disabled={isSubmitting}
									style={{
										background: active ? "#fff5f5" : "#1a1a1a",
										color: active ? "#c0392b" : "#fff",
										border: active ? "1px solid #ffc5c5" : "none",
										borderRadius: "8px", padding: "6px 14px",
										fontSize: "13px", fontWeight: 600, cursor: "pointer",
									}}
								>
									{active ? t("common.deactivate") : t("common.activate")}
								</button>
							</Form>
						)}
					</div>
				</div>

				{/* Sub-routes */}
				{def.subRoutes && def.subRoutes.length > 0 && (
					<div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e8e8e8", padding: "18px 20px" }}>
						<div style={{ fontSize: "13px", fontWeight: 600, color: "#444", marginBottom: "12px" }}>{t("integrationDetail.sectionAdvanced")}</div>
						<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
							{def.subRoutes.map((sr) => (
								<Link
									key={sr.path}
									to={`/app/${sr.path}`}
									style={{
										display: "block", padding: "9px 14px",
										background: "#f5f5f5", borderRadius: "8px",
										fontSize: "14px", color: "#1a1a1a", textDecoration: "none",
										fontWeight: 500,
									}}
								>
									{sr.label} →
								</Link>
							))}
						</div>
					</div>
				)}

				{/* Links */}
				{(def.websiteUrl || def.docsUrl) && (
					<div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e8e8e8", padding: "18px 20px" }}>
						<div style={{ fontSize: "13px", fontWeight: 600, color: "#444", marginBottom: "12px" }}>{t("integrationDetail.sectionResources")}</div>
						<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
							{def.websiteUrl && (
								<a href={def.websiteUrl} target="_blank" rel="noreferrer" style={{
									fontSize: "13px", color: "#0050b3", textDecoration: "none",
									display: "flex", alignItems: "center", gap: "5px",
								}}>
									{t("common.visitWebsite")}
								</a>
							)}
							{def.docsUrl && (
								<a href={def.docsUrl} target="_blank" rel="noreferrer" style={{
									fontSize: "13px", color: "#0050b3", textDecoration: "none",
									display: "flex", alignItems: "center", gap: "5px",
								}}>
									{t("common.apiDocs")}
								</a>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
