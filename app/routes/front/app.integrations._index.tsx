import { useLoaderData, Link, Form, useNavigation, useActionData } from "react-router";
import { useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

import { authenticate } from "~/shopify.server";
import {
	getShopIntegrationsState,
	setIntegrationActive,
} from "~/models/Integration.server";
import {
	listIntegrationDefinitions,
	getIntegrationDefinition,
} from "~/services/integrations/registry.server";

type IntegrationRow = {
	id:             number;
	name:           string;
	displayName:    string;
	active:         boolean;
	hasCredentials: boolean;
};

export async function loader({ request }: LoaderFunctionArgs) {
	const { session } = await authenticate.admin(request);

	const dbState = await getShopIntegrationsState(session.shop);

	// Merge DB state with registry metadata (registry is source of truth for UI).
	const rows = listIntegrationDefinitions().map((def) => {
		const row = dbState.find((r: IntegrationRow) => r.name === def.name);
		return {
			name:           def.name,
			displayName:    def.displayName,
			description:    def.description,
			icon:           def.icon ?? "🔌",
			logoUrl:        def.logoUrl ?? null,
			active:         Boolean(row?.active),
			hasCredentials: Boolean(row?.hasCredentials),
		};
	});

	return { integrations: rows, shop: session.shop };
}

export async function action({ request }: ActionFunctionArgs) {
	const { session } = await authenticate.admin(request);
	const formData    = await request.formData();
	const intent      = String(formData.get("intent") ?? "");
	const name        = String(formData.get("name") ?? "");

	if (intent === "toggle") {
		const def = getIntegrationDefinition(name);
		if (!def) {
			return { success: false, error: `Integración desconocida: ${name}` };
		}
		const nextActive = String(formData.get("active") ?? "false") === "true";

		// Block enabling without credentials configured.
		if (nextActive) {
			const state = await getShopIntegrationsState(session.shop);
			const row   = state.find((r: IntegrationRow) => r.name === name);
			if (!row?.hasCredentials) {
				return {
					success: false,
					error:   `Configura primero las credenciales de ${def.displayName}.`,
				};
			}
		}

		await setIntegrationActive(session.shop, name, nextActive);
		return {
			success: true,
			message: nextActive
				? `${def.displayName} activada`
				: `${def.displayName} desactivada`,
		};
	}

	return { success: false, error: "Acción no válida" };
}

export default function Integrations() {
	const { integrations } = useLoaderData<typeof loader>();
	const actionData       = useActionData<typeof action>();
	const navigation       = useNavigation();
	const shopify          = useAppBridge();

	useEffect(() => {
		if (!actionData) return;
		if (actionData.success && actionData.message) {
			shopify.toast.show(actionData.message);
		} else if (!actionData.success && actionData.error) {
			shopify.toast.show(actionData.error, { isError: true });
		}
	}, [actionData, shopify]);

	const isSubmitting = navigation.state === "submitting";

	return (
		<s-page>
			<s-text slot="title" variant="headingMd" as="h1">
				Integraciones
			</s-text>
			<s-text slot="subtitle" variant="bodyMd" as="p">
				Manage your connected sales channel integrations.
			</s-text>

			<ui-title-bar title="Integraciones"></ui-title-bar>

			<div style={{
				display:               "grid",
				gridTemplateColumns:   "repeat(auto-fill, minmax(220px, 1fr))",
				gap:                   "16px",
			}}>
				{integrations.map((i) => (
					<div
						key={i.name}
						style={{
							background:    "white",
							borderRadius:  "12px",
							padding:       "28px 20px 20px",
							display:       "flex",
							flexDirection: "column",
							alignItems:    "center",
							gap:           "10px",
							boxShadow:     "0 1px 4px rgba(0,0,0,0.08)",
							textAlign:     "center",
						}}
					>
						{/* Logo */}
						{i.logoUrl ? (
							<img
								src={i.logoUrl}
								alt={i.displayName}
								style={{ width: "80px", height: "80px", objectFit: "contain" }}
								onError={(e) => {
									const target = e.target as HTMLImageElement;
									target.style.display = "none";
									const next = target.nextElementSibling as HTMLElement | null;
									if (next) next.style.display = "block";
								}}
							/>
						) : null}
						<span
							style={{
								fontSize:   "48px",
								lineHeight: "1",
								display:    i.logoUrl ? "none" : "block",
							}}
						>
							{i.icon}
						</span>

						{/* Name */}
						<span style={{ fontWeight: 600, fontSize: "15px", color: "#1a1a1a" }}>
							{i.displayName}
						</span>

						{/* Description */}
						<span style={{ fontSize: "13px", color: "#6b7177", lineHeight: "1.5" }}>
							{i.description}
						</span>

						{/* Status badge */}
						{i.active ? (
							<span style={{
								background:   "#2a7a2a",
								color:        "white",
								borderRadius: "20px",
								padding:      "4px 16px",
								fontSize:     "12px",
								fontWeight:   500,
							}}>
								Active
							</span>
						) : i.hasCredentials ? (
							<span style={{
								background:   "#e0edff",
								color:        "#0050b3",
								borderRadius: "20px",
								padding:      "4px 16px",
								fontSize:     "12px",
								fontWeight:   500,
							}}>
								Configurada
							</span>
						) : (
							<span style={{
								background:   "#f0f0f0",
								color:        "#6b7177",
								borderRadius: "20px",
								padding:      "4px 16px",
								fontSize:     "12px",
								fontWeight:   500,
							}}>
								Sin configurar
							</span>
						)}

						{/* Actions */}
						<div style={{
							display:         "flex",
							gap:             "8px",
							marginTop:       "6px",
							flexWrap:        "wrap",
							justifyContent:  "center",
						}}>
							<Link to={`/app/integrations/${i.name}`}>
								<s-button size="slim">
									{i.hasCredentials ? "Configurar" : "Añadir credenciales"}
								</s-button>
							</Link>

							<Form method="post">
								<input type="hidden" name="intent" value="toggle" />
								<input type="hidden" name="name" value={i.name} />
								<input type="hidden" name="active" value={String(!i.active)} />
								<s-button
									size="slim"
									variant={i.active ? undefined : "primary"}
									tone={i.active ? "critical" : undefined}
									type="submit"
									disabled={isSubmitting || (!i.active && !i.hasCredentials)}
								>
									{i.active ? "Desactivar" : "Activar"}
								</s-button>
							</Form>
						</div>
					</div>
				))}
			</div>
		</s-page>
	);
}
