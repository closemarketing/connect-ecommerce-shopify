import { useEffect, useState } from "react";
import {
	useLoaderData,
	useActionData,
	useNavigation,
	Form,
	Link,
} from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

import { authenticate } from "~/shopify.server";
import {
	getIntegrationDefinition,
} from "~/services/integrations/registry.server";
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
	if (!def) {
		throw new Response("Integration not found", { status: 404 });
	}

	const integration = await getIntegrationByName(name);
	const credentials = integration ? await getCredentials(session.shop, integration.id) : {};
	const active      = await isIntegrationActive(session.shop, name);

	return { def, credentials, active };
}

export async function action({ request, params }: ActionFunctionArgs) {
	const { session } = await authenticate.admin(request);
	const name        = String(params.name);

	const def = getIntegrationDefinition(name);
	if (!def) {
		return { success: false, error: "Integración no encontrada" };
	}

	const integration = await getIntegrationByName(name);
	if (!integration) {
		return { success: false, error: "Integración no inicializada en BD (ejecuta el seed)" };
	}

	const formData = await request.formData();
	const intent   = String(formData.get("intent") ?? "save");

	if (intent === "delete") {
		await deleteCredentials(session.shop, integration.id);
		await setIntegrationActive(session.shop, name, false);
		return { success: true, message: "Credenciales eliminadas" };
	}

	if (intent === "toggle") {
		const next = String(formData.get("active") ?? "false") === "true";
		await setIntegrationActive(session.shop, name, next);
		return {
			success: true,
			message: next ? `${def.displayName} activada` : `${def.displayName} desactivada`,
		};
	}

	// Save credentials
	const credentials: Record<string, string> = {};
	for (const field of def.credentials) {
		const value = String(formData.get(field.key) ?? "").trim();
		if (field.required && !value) {
			return { success: false, error: `${field.label} es obligatorio` };
		}
		credentials[field.key] = value;
	}

	// Optional integration-specific validation hook (Clientify API key check)
	if (name === "clientify" && credentials.apikey) {
		try {
			const res = await fetch("https://api.clientify.net/v1/contacts/", {
				method:  "GET",
				headers: {
					Authorization: `Token ${credentials.apikey}`,
					"Content-Type": "application/json",
				},
			});
			if (!res.ok) {
				return {
					success: false,
					error:   `API Key inválida. Respuesta de Clientify: ${res.status}`,
				};
			}
		} catch {
			return {
				success: false,
				error:   "No se pudo conectar con Clientify. Verifica tu API Key.",
			};
		}
	}

	await saveCredentials(session.shop, integration.id, credentials);
	return { success: true, message: "Credenciales guardadas" };
}

export default function IntegrationDetail() {
	const { def, credentials, active } = useLoaderData<typeof loader>();
	const actionData                   = useActionData<typeof action>();
	const navigation                   = useNavigation();
	const shopify                      = useAppBridge();

	const [values, setValues] = useState<Record<string, string>>(credentials);
	const isSubmitting        = navigation.state === "submitting";

	useEffect(() => { setValues(credentials); }, [credentials]);

	useEffect(() => {
		if (!actionData) return;
		if (actionData.success && actionData.message) {
			shopify.toast.show(actionData.message);
		} else if (!actionData.success && actionData.error) {
			shopify.toast.show(actionData.error, { isError: true });
		}
	}, [actionData, shopify]);

	const hasCredentials = Object.keys(credentials).length > 0;

	return (
		<s-block-stack gap="400" style={{ padding: "16px" }}>
				{/* Status card */}
				<s-card>
					<s-inline-stack align="space-between" blockAlign="center">
						<s-block-stack gap="100">
							<s-text variant="headingSm" as="h3">Estado</s-text>
							<s-inline-stack gap="200">
								{active ? (
									<s-badge tone="success">Activa</s-badge>
								) : hasCredentials ? (
									<s-badge tone="info">Configurada (inactiva)</s-badge>
								) : (
									<s-badge>Sin configurar</s-badge>
								)}
							</s-inline-stack>
						</s-block-stack>

						{hasCredentials && (
							<Form method="post">
								<input type="hidden" name="intent" value="toggle" />
								<input type="hidden" name="active" value={String(!active)} />
								<s-button
									type="submit"
									variant={active ? undefined : "primary"}
									tone={active ? "critical" : undefined}
									disabled={isSubmitting}
								>
									{active ? "Desactivar" : "Activar"}
								</s-button>
							</Form>
						)}
					</s-inline-stack>
				</s-card>

				{/* Credentials form */}
				<s-card>
					<Form method="post">
						<input type="hidden" name="intent" value="save" />
						<s-block-stack gap="300">
							<s-text variant="headingSm" as="h3">Credenciales</s-text>
							<s-divider></s-divider>

							{def.credentials.map((field) => (
								<s-text-field
									key={field.key}
									label={field.label}
									name={field.key}
									type={field.type}
									value={values[field.key] ?? ""}
									helpText={field.helpText}
									placeholder={field.placeholder}
									onInput={(e: any) =>
										setValues((v) => ({ ...v, [field.key]: e.target.value }))
									}
								></s-text-field>
							))}

							<s-inline-stack gap="200">
								<s-button variant="primary" type="submit" disabled={isSubmitting}>
									{hasCredentials ? "Actualizar" : "Guardar"}
								</s-button>

								{hasCredentials && (
									<s-button
										type="submit"
										tone="critical"
										variant="plain"
										name="intent"
										value="delete"
										disabled={isSubmitting}
									>
										Eliminar credenciales
									</s-button>
								)}
							</s-inline-stack>
						</s-block-stack>
					</Form>
				</s-card>

				{/* Sub-routes (e.g. Pipelines for Clientify) */}
				{def.subRoutes && def.subRoutes.length > 0 && (
					<s-card>
						<s-block-stack gap="200">
							<s-text variant="headingSm" as="h3">Configuración avanzada</s-text>
							<s-divider></s-divider>
							<s-inline-stack gap="200">
								{def.subRoutes.map((sr) => (
									<Link key={sr.path} to={`/app/${sr.path}`}>
										<s-button>{sr.label}</s-button>
									</Link>
								))}
							</s-inline-stack>
						</s-block-stack>
					</s-card>
				)}

				{/* Links */}
				<s-card>
					<s-inline-stack gap="300">
						{def.websiteUrl && (
							<s-link url={def.websiteUrl} target="_blank">
								<s-button size="slim" variant="plain">Visitar sitio web</s-button>
							</s-link>
						)}
						{def.docsUrl && (
							<s-link url={def.docsUrl} target="_blank">
								<s-button size="slim" variant="plain">Documentación API</s-button>
							</s-link>
						)}
					</s-inline-stack>
				</s-card>
			</s-block-stack>
	);
}
