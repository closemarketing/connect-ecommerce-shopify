/**
 * Ruta de detalle de integración con pestañas
 * /app/integrations/{name}
 */

import { redirect } from "react-router";
import { useLoaderData, useActionData, Form, useNavigation, Link, useSubmit, useFetcher } from "react-router";
import { useState, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
	Page,
	Layout,
	Card,
	Tabs,
	TextField,
	Button,
	Banner,
	FormLayout,
	Text,
	BlockStack,
	InlineStack,
	Badge,
	DataTable,
	Select,
	ChoiceList,
	Icon,
	Modal,
	Box,
	Divider,
} from "@shopify/polaris";
import { CheckCircleIcon, XCircleIcon, ClockIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { getAdapter } from "../integrations/registry.server";
import {
	getIntegrationByName,
	getCredentials,
	saveCredentials,
	getIntegrationStats,
} from "../models/Integration.server";
import db from "../db.server";

const SHOPIFY_ORDER_STATUSES = [
	{ value: "pending", label: "Pendiente" },
	{ value: "authorized", label: "Autorizado" },
	{ value: "partially_paid", label: "Parcialmente pagado" },
	{ value: "paid", label: "Pagado" },
	{ value: "partially_refunded", label: "Parcialmente reembolsado" },
	{ value: "refunded", label: "Reembolsado" },
	{ value: "voided", label: "Anulado" },
];

export async function loader({ request, params }) {
	const { session } = await authenticate.admin(request);
	const { name } = params;

	console.log('🔍 Loader params:', params);
	console.log('🔍 Integration name:', name);
	console.log('🔍 Session shop:', session.shop);

	if (!session.shop) {
		console.error('❌ Session shop is null');
		throw new Response("Sesión inválida", { status: 401 });
	}

	// Obtener adaptador
	const adapter = getAdapter(name);
	if (!adapter) {
		console.error('❌ Adaptador no encontrado para:', name);
		throw new Response("Integración no encontrada", { status: 404 });
	}

	const config = adapter.getConfig();
	console.log('✅ Config obtenido:', config);

	// Obtener integración de BD
	const integration = await getIntegrationByName(name);
	if (!integration) {
		console.error('❌ Integración no encontrada en BD');
		throw new Response("Integración no encontrada en BD", { status: 404 });
	}
	console.log('✅ Integration obtenida:', integration.id);

	// Obtener credenciales
	const credentials = await getCredentials(session.shop, integration.id);
	console.log('✅ Credentials obtenidas');

	// Obtener shop
	const shop = await db.shop.findFirst({
		where: { domain: session.shop },
	});
	console.log('✅ Shop encontrado:', shop?.id);

	// Obtener estadísticas si hay shop
	let stats = null;
	let syncLogs = [];
	let webhookLogs = [];
	
	if (shop) {
		stats = await getIntegrationStats(shop.id, integration.id);
		
		// Obtener últimos sync logs de esta integración
		syncLogs = await db.syncLog.findMany({
			where: {
				shopId: shop.id,
				integrationId: integration.id,
			},
			orderBy: { createdAt: 'desc' },
			take: 20,
		});

		// Obtener últimos webhook logs de esta integración
		webhookLogs = await db.webhookLog.findMany({
			where: {
				shopId: shop.id,
				integrationId: integration.id,
			},
			orderBy: { createdAt: 'desc' },
			take: 20,
		});
	}

	// Obtener campos requeridos
	const requiredFields = adapter.getRequiredCredentials();
	console.log('✅ Required fields:', requiredFields.length);

	// Si es Clientify, obtener pipelines
	let pipelines = null;
	if (name === "clientify" && credentials && Object.keys(credentials).length > 0) {
		console.log('🔄 Intentando obtener pipelines...');
		try {
			if (adapter.getPipelines) {
				pipelines = await adapter.getPipelines(credentials);
				console.log('✅ Pipelines obtenidos:', pipelines?.length || 0);
			}
		} catch (error) {
			console.error("❌ Error cargando pipelines:", error);
		}
	} else {
		console.log('⚠️ No se obtienen pipelines (credenciales no configuradas o integración no es clientify)');
	}

	console.log('✅ Loader completado, retornando datos');

	// Cargar configuración de pipeline
	let pipelineConfig = null;
	let stageMappings = [];
	
	if (shop) {
		pipelineConfig = await db.pipelineConfig.findFirst({
			where: {
				shopId: shop.id,
				integrationId: integration.id,
				isDefault: true,
			},
			include: {
				stageMappings: true,
			},
		});

		if (pipelineConfig) {
			stageMappings = pipelineConfig.stageMappings;
		}
	}

	// Convertir stageMappings a objeto para fácil acceso en el componente
	const stageMappingObject = stageMappings.reduce((acc, mapping) => {
		acc[mapping.shopifyOrderStatus] = mapping.externalStageId;
		return acc;
	}, {});

	return {
		integration: {
			...integration,
			...config,
		},
		credentials: {
			...credentials,
			pipelineId: pipelineConfig?.externalPipelineId,
			stageMapping: stageMappingObject,
		},
		requiredFields,
		stats,
		shop: session.shop,
		pipelines,
		integrationName: name,
		syncLogs,
		webhookLogs,
		pipelineConfig,
		stageMappings,
	};
}

export async function action({ request, params }) {
	const { session } = await authenticate.admin(request);
	const { name } = params;

	const formData = await request.formData();
	const actionType = formData.get("_action");

	const integration = await getIntegrationByName(name);
	if (!integration) {
		return { success: false, error: "Integración no encontrada" };
	}

	if (actionType === "save-credentials") {
		// Recolectar credenciales
		const credentials = {};
		for (const [key, value] of formData.entries()) {
			if (key.startsWith("credential_")) {
				const credKey = key.replace("credential_", "");
				credentials[credKey] = value;
			}
		}

		// Validar credenciales usando el adaptador
		const adapter = getAdapter(name);
		if (adapter) {
			const isValid = await adapter.validateCredentials(credentials);
			if (!isValid) {
				return {
					success: false,
					error: "Credenciales inválidas. Verifica los datos e intenta de nuevo.",
				};
			}
		}

		// Guardar
		await saveCredentials(session.shop, integration.id, credentials);
		return { success: true, message: "Credenciales guardadas correctamente" };
	}

	if (actionType === "save-pipeline") {
		const pipelineId = formData.get("pipelineId");
		const pipelineName = formData.get("pipelineName");
		
		if (!pipelineId) {
			return { success: false, error: "Debes seleccionar un pipeline" };
		}

		// Obtener shop
		const shop = await db.shop.findUnique({ where: { domain: session.shop } });
		if (!shop) {
			return { success: false, error: "Tienda no encontrada" };
		}

		// Verificar si ya existe configuración de pipeline
		const existingConfig = await db.pipelineConfig.findFirst({
			where: {
				shopId: shop.id,
				integrationId: integration.id,
			},
		});

		// Crear o actualizar PipelineConfig
		if (existingConfig) {
			await db.pipelineConfig.update({
				where: { id: existingConfig.id },
				data: {
					externalPipelineId: pipelineId,
					externalPipelineName: pipelineName || 'Pipeline',
					isDefault: true,
				},
			});
		} else {
			// Crear nuevo pipeline config
			const pipelineConfig = await db.pipelineConfig.create({
				data: {
					shopId: shop.id,
					integrationId: integration.id,
					externalPipelineId: pipelineId,
					externalPipelineName: pipelineName || 'Pipeline',
					isDefault: true,
				},
			});

			// Crear auto-mapeo inicial solo si es nuevo
			const credentials = await getCredentials(session.shop, integration.id);
			const adapter = getAdapter(name);
			
			if (adapter && adapter.getPipelines) {
				try {
					const pipelines = await adapter.getPipelines(credentials);
					const selectedPipeline = pipelines.find((p) => String(p.id) === String(pipelineId));
					
					if (selectedPipeline && selectedPipeline.stages && selectedPipeline.stages.length > 0) {
						const stages = selectedPipeline.stages;
						const numStages = stages.length;
						const shopifyStatuses = ['pending', 'authorized', 'partially_paid', 'paid', 'partially_refunded', 'refunded', 'voided'];
						
						// Crear mappings automáticos
						const mappings = shopifyStatuses.map((status, index) => {
							const stageIndex = Math.min(
								Math.floor((index / shopifyStatuses.length) * numStages),
								numStages - 1
							);
							const stage = stages[stageIndex];
							
							return {
								pipelineConfigId: pipelineConfig.id,
								shopifyOrderStatus: status,
								externalStageId: String(stage.id),
								externalStageName: stage.name,
							};
						});
						
						await db.orderStageMapping.createMany({
							data: mappings,
						});
					}
				} catch (error) {
					console.error('❌ Error creando auto-mapeo:', error);
				}
			}
		}

		return { success: true, message: "Pipeline guardado correctamente" };
	}

	if (actionType === "save-stage-mapping") {
		const shopifyStatus = formData.get("shopifyStatus");
		const stageId = formData.get("stageId");
		const stageName = formData.get("stageName");
		
		if (!shopifyStatus || !stageId) {
			return { success: false, error: "Debes seleccionar un estado y un stage" };
		}

		// Obtener shop y pipelineConfig
		const shop = await db.shop.findUnique({ where: { domain: session.shop } });
		if (!shop) {
			return { success: false, error: "Tienda no encontrada" };
		}

		const pipelineConfig = await db.pipelineConfig.findFirst({
			where: {
				shopId: shop.id,
				integrationId: integration.id,
				isDefault: true,
			},
		});

		if (!pipelineConfig) {
			return { success: false, error: "Debes seleccionar un pipeline primero" };
		}

		// Actualizar o crear el mapeo
		await db.orderStageMapping.upsert({
			where: {
				pipelineConfigId_shopifyOrderStatus: {
					pipelineConfigId: pipelineConfig.id,
					shopifyOrderStatus: shopifyStatus,
				},
			},
			update: {
				externalStageId: stageId,
				externalStageName: stageName || 'Stage',
			},
			create: {
				pipelineConfigId: pipelineConfig.id,
				shopifyOrderStatus: shopifyStatus,
				externalStageId: stageId,
				externalStageName: stageName || 'Stage',
			},
		});

		return { success: true, message: "Mapeo de stage guardado correctamente" };
	}

	return { success: false, error: "Acción no válida" };
}

export default function IntegrationDetail() {
	const loaderData = useLoaderData();
	console.log('📦 Loader data recibido:', loaderData);
	
	if (!loaderData) {
		return <div>Cargando...</div>;
	}
	
	const { integration, credentials, requiredFields, stats, pipelines, integrationName, syncLogs, webhookLogs } = loaderData;
	const actionData = useActionData();
	const navigation = useNavigation();
	const [selectedTab, setSelectedTab] = useState(0);

	console.log('🎨 Renderizando IntegrationDetail para:', integrationName);
	
	if (!integration) {
		return <div>Error: No se pudo cargar la integración</div>;
	}

	const isSubmitting = navigation.state === "submitting";

	// Construir tabs dinámicamente
	const tabs = [
		{ id: "credentials", content: "API Key", panelID: "credentials-panel" },
	];

	// Solo para Clientify: agregar pestaña de Pipelines
	if (integrationName === "clientify") {
		tabs.push({ id: "pipelines", content: "Pipelines", panelID: "pipelines-panel" });
	}

	tabs.push(
		{ id: "logs", content: "Sync & Webhook Logs", panelID: "logs-panel" }
	);

	return (
		<Page
			title={integration.displayName}
			backAction={{ content: "Inicio", url: "/app" }}
			subtitle={integration.description}
			titleMetadata={
				integration.enabled ? (
					<Badge tone="success">Habilitada</Badge>
				) : (
					<Badge>Deshabilitada</Badge>
				)
			}
		>
			<Layout>
				<Layout.Section>
					<Card>
						<Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
							{tabs[selectedTab]?.id === "credentials" && (
								<CredentialsTab
									integration={integration}
									credentials={credentials}
									requiredFields={requiredFields}
									actionData={actionData}
									isSubmitting={isSubmitting}
								/>
							)}
							{tabs[selectedTab]?.id === "pipelines" && (
							<PipelinesTab 
								integration={integration} 
								pipelines={pipelines}
								credentials={credentials}
								actionData={actionData}
								isSubmitting={isSubmitting}
							/>
							)}
							{tabs[selectedTab]?.id === "logs" && (
								<LogsTab 
									integration={integration} 
									stats={stats} 
									syncLogs={syncLogs}
									webhookLogs={webhookLogs}
								/>
							)}
						</Tabs>
					</Card>
				</Layout.Section>
			</Layout>
		</Page>
	);
}

function CredentialsTab({ integration, credentials, requiredFields, actionData, isSubmitting }) {
	const submit = useSubmit();
	const shopify = useAppBridge();
	// Estado local para campos de credenciales
	const [formValues, setFormValues] = useState(
		requiredFields.reduce((acc, field) => {
			acc[field.key] = credentials[field.key] || "";
			return acc;
		}, {})
	);
	const [validating, setValidating] = useState(false);
	const [validationError, setValidationError] = useState(null);

	// Mostrar toasts cuando haya respuesta de la validación
	useEffect(() => {
		if (actionData?.success) {
			shopify.toast.show('✅ API Key validada y guardada correctamente', { duration: 3000 });
		} else if (actionData?.error) {
			shopify.toast.show('❌ ' + actionData.error, { duration: 5000, isError: true });
		}
	}, [actionData, shopify]);

	const handleFieldChange = (key, value) => {
		setFormValues((prev) => ({ ...prev, [key]: value }));
		setValidationError(null);
	};

	const handleBlur = async (field) => {
		// Solo validar si es el campo apiToken y ha cambiado
		if (field.key !== 'apiToken') return;
		if (formValues.apiToken === credentials.apiToken) return;
		if (!formValues.apiToken || formValues.apiToken.trim() === '') return;

		setValidating(true);
		setValidationError(null);
		
		// Mostrar toast de que está validando
		shopify.toast.show('🔄 Validando API Key...', { duration: 2000 });

		try {
			// Validar usando la API
			const formData = new FormData();
			formData.append('_action', 'save-credentials');
			formData.append('credential_apiToken', formValues.apiToken);

			// Enviar para validar y guardar
			submit(formData, { method: 'post' });
		} catch (error) {
			setValidationError(error.message || 'Error validando credenciales');
			shopify.toast.show('❌ Error: ' + error.message, { duration: 5000, isError: true });
		} finally {
			setValidating(false);
		}
	};

	return (
		<BlockStack gap="400">
			{actionData?.success && (
				<Banner tone="success" title="Éxito">
					{actionData.message}
				</Banner>
			)}
			{actionData?.error && (
				<Banner tone="critical" title="Error">
					{actionData.error}
				</Banner>
			)}
			{validationError && (
				<Banner tone="critical" title="Error de validación">
					{validationError}
				</Banner>
			)}

			<Form method="post">
				<input type="hidden" name="_action" value="save-credentials" />
				<FormLayout>
					{requiredFields.map((field) => (
						<TextField
							key={field.key}
							label={field.label}
							type={field.type === 'password' ? 'text' : field.type}
							name={`credential_${field.key}`}
							value={formValues[field.key]}
							onChange={(value) => handleFieldChange(field.key, value)}
							onBlur={() => handleBlur(field)}
							placeholder={field.placeholder}
							helpText={validating && field.key === 'apiToken' ? 'Validando...' : field.helpText}
							required={field.required}
							autoComplete="off"
							disabled={validating}
						/>
					))}

					<Text as="p" tone="subdued">
						Las credenciales se validan y guardan automáticamente al completar el campo.
					</Text>
				</FormLayout>
			</Form>
		</BlockStack>
	);
}

function LogsTab({ integration, stats, syncLogs, webhookLogs }) {
	const fetcher = useFetcher();
	const [selectedSyncLog, setSelectedSyncLog] = useState(null);
	const [selectedWebhookLog, setSelectedWebhookLog] = useState(null);
	
	// Recargar logs cuando se entre a la pestaña
	useEffect(() => {
		// Si no hay logs en proceso de carga, recargar
		if (fetcher.state === "idle" && !fetcher.data) {
			fetcher.load(window.location.pathname);
		}
	}, []);

	// Usar logs del fetcher si están disponibles, sino los del loader
	const currentStats = fetcher.data?.stats || stats;
	const currentSyncLogs = fetcher.data?.syncLogs || syncLogs;
	const currentWebhookLogs = fetcher.data?.webhookLogs || webhookLogs;

	const getSyncStatusBadge = (status) => {
		switch (status) {
			case 'SUCCESS':
				return <Badge tone="success" icon={CheckCircleIcon}>SUCCESS</Badge>;
			case 'ERROR':
				return <Badge tone="critical" icon={XCircleIcon}>ERROR</Badge>;
			case 'PENDING':
				return <Badge tone="attention" icon={ClockIcon}>PENDING</Badge>;
			default:
				return <Badge>{status}</Badge>;
		}
	};

	const getSyncTypeBadge = (type) => {
		const colors = {
			'ORDER': 'info',
			'DEAL': 'success',
			'CUSTOMER': 'attention',
			'PRODUCT': 'warning',
		};
		return <Badge tone={colors[type] || 'info'}>{type}</Badge>;
	};

	const formatJSON = (data) => {
		if (!data) return 'N/A';
		try {
			const parsed = typeof data === 'string' ? JSON.parse(data) : data;
			return JSON.stringify(parsed, null, 2);
		} catch {
			return String(data);
		}
	};

	return (
		<BlockStack gap="400">
			{currentStats && (
				<Card>
					<BlockStack gap="400">
						<Text as="h3" variant="headingMd">Resumen de sincronización (últimos 30 días)</Text>
						<InlineStack gap="600" wrap={false}>
							<div style={{ textAlign: 'center', padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '8px', minWidth: '120px' }}>
								<Text as="p" variant="heading2xl" tone="success">{currentStats.successCount}</Text>
								<Text as="p" tone="success" fontWeight="semibold">Exitosas</Text>
							</div>
							<div style={{ textAlign: 'center', padding: '12px', backgroundColor: '#fef2f2', borderRadius: '8px', minWidth: '120px' }}>
								<Text as="p" variant="heading2xl" tone="critical">{currentStats.errorCount}</Text>
								<Text as="p" tone="critical" fontWeight="semibold">Errores</Text>
							</div>
							<div style={{ textAlign: 'center', padding: '12px', backgroundColor: '#fef9f3', borderRadius: '8px', minWidth: '120px' }}>
								<Text as="p" variant="heading2xl" tone="caution">{currentStats.pendingJobs}</Text>
								<Text as="p" tone="caution" fontWeight="semibold">Pendientes</Text>
							</div>
							<div style={{ textAlign: 'center', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', minWidth: '120px' }}>
								<Text as="p" variant="heading2xl">{currentStats.totalSyncs}</Text>
								<Text as="p" fontWeight="semibold">Total</Text>
							</div>
						</InlineStack>
					</BlockStack>
				</Card>
			)}

			<Card>
				<BlockStack gap="400">
					<InlineStack align="space-between">
						<Text as="h3" variant="headingMd">Sync Logs (Últimos 20)</Text>
						<Button 
							loading={fetcher.state === "loading"}
							onClick={() => fetcher.load(window.location.pathname)}
							size="slim"
						>
							Recargar
						</Button>
					</InlineStack>
					{currentSyncLogs && currentSyncLogs.length > 0 ? (
						<div style={{ width: '100%' }}>
							<table style={{ width: '100%', borderCollapse: 'collapse' }}>
								<thead>
									<tr style={{ borderBottom: '1px solid #e5e7eb' }}>
										<th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: '12px', color: '#6b7280' }}>Fecha</th>
										<th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: '12px', color: '#6b7280' }}>Tipo</th>
										<th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: '12px', color: '#6b7280' }}>Shopify ID</th>
										<th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: '12px', color: '#6b7280' }}>External ID</th>
										<th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: '12px', color: '#6b7280' }}>Estado</th>
									</tr>
								</thead>
								<tbody>
									{currentSyncLogs.map((log, index) => (
										<tr 
											key={log.id}
											onClick={() => setSelectedSyncLog(log)}
											style={{ 
												borderBottom: '1px solid #f3f4f6', 
												cursor: 'pointer',
												transition: 'background-color 0.1s'
											}}
											onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
											onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
										>
											<td style={{ padding: '12px 16px', fontSize: '13px' }}>
												{new Date(log.createdAt).toLocaleString('es-ES')}
											</td>
											<td style={{ padding: '12px 16px' }}>
												{getSyncTypeBadge(log.syncType)}
											</td>
											<td style={{ padding: '12px 16px', fontSize: '13px' }}>
												{log.shopifyId}
											</td>
											<td style={{ padding: '12px 16px', fontSize: '13px' }}>
												{log.externalId || '-'}
											</td>
											<td style={{ padding: '12px 16px' }}>
												{getSyncStatusBadge(log.status)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : (
						<Text as="p" tone="subdued">No hay registros de sincronización</Text>
					)}
				</BlockStack>
			</Card>

			<Card>
				<BlockStack gap="400">
					<Text as="h3" variant="headingMd">Webhook Logs (Últimos 20)</Text>
					{currentWebhookLogs && currentWebhookLogs.length > 0 ? (
						<div style={{ width: '100%' }}>
							<table style={{ width: '100%', borderCollapse: 'collapse' }}>
								<thead>
									<tr style={{ borderBottom: '1px solid #e5e7eb' }}>
										<th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: '12px', color: '#6b7280' }}>Fecha</th>
										<th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: '12px', color: '#6b7280' }}>Topic</th>
										<th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: '12px', color: '#6b7280' }}>Estado</th>
										<th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: '12px', color: '#6b7280' }}>Status Code</th>
									</tr>
								</thead>
								<tbody>
									{currentWebhookLogs.map((log, index) => (
										<tr 
											key={log.id}
											onClick={() => setSelectedWebhookLog(log)}
											style={{ 
												borderBottom: '1px solid #f3f4f6', 
												cursor: 'pointer',
												transition: 'background-color 0.1s'
											}}
											onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
											onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
										>
											<td style={{ padding: '12px 16px', fontSize: '13px' }}>
												{new Date(log.createdAt).toLocaleString('es-ES')}
											</td>
											<td style={{ padding: '12px 16px' }}>
												<Badge tone="info">{log.topic}</Badge>
											</td>
											<td style={{ padding: '12px 16px' }}>
												{log.processed 
													? <Badge tone="success" icon={CheckCircleIcon}>Procesado</Badge> 
													: <Badge tone="attention" icon={ClockIcon}>Pendiente</Badge>}
											</td>
											<td style={{ padding: '12px 16px' }}>
												{log.statusCode ? <Badge>{log.statusCode}</Badge> : '-'}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : (
						<Text as="p" tone="subdued">No hay registros de webhooks</Text>
					)}
				</BlockStack>
			</Card>

			{/* Modal para detalles de Sync Log */}
			<Modal
				open={!!selectedSyncLog}
				onClose={() => setSelectedSyncLog(null)}
				title="Detalles del Sync Log"
				large
			>
				<Modal.Section>
					{selectedSyncLog && (
						<BlockStack gap="400">
							<InlineStack gap="400" wrap>
								<div>
									<Text as="p" tone="subdued">ID</Text>
									<Text as="p" fontWeight="semibold">{selectedSyncLog.id}</Text>
								</div>
								<div>
									<Text as="p" tone="subdued">Tipo</Text>
									{getSyncTypeBadge(selectedSyncLog.syncType)}
								</div>
								<div>
									<Text as="p" tone="subdued">Estado</Text>
									{getSyncStatusBadge(selectedSyncLog.status)}
								</div>
								<div>
									<Text as="p" tone="subdued">Fecha</Text>
									<Text as="p" fontWeight="semibold">{new Date(selectedSyncLog.createdAt).toLocaleString('es-ES')}</Text>
								</div>
							</InlineStack>
							
							<Divider />
							
							<InlineStack gap="400" wrap>
								<div>
									<Text as="p" tone="subdued">Shopify ID</Text>
									<Text as="p" fontWeight="semibold">{selectedSyncLog.shopifyId}</Text>
								</div>
								<div>
									<Text as="p" tone="subdued">External ID</Text>
									<Text as="p" fontWeight="semibold">{selectedSyncLog.externalId || 'N/A'}</Text>
								</div>
								{selectedSyncLog.parentOrderId && (
									<div>
										<Text as="p" tone="subdued">Parent Order ID</Text>
										<Text as="p" fontWeight="semibold">{selectedSyncLog.parentOrderId}</Text>
									</div>
								)}
							</InlineStack>

							{selectedSyncLog.method && (
								<>
									<Divider />
									<InlineStack gap="400">
										<div>
											<Text as="p" tone="subdued">Método</Text>
											<Badge>{selectedSyncLog.method}</Badge>
										</div>
										{selectedSyncLog.url && (
											<div style={{ flex: 1 }}>
												<Text as="p" tone="subdued">URL</Text>
												<Text as="p" fontWeight="semibold" breakWord>{selectedSyncLog.url}</Text>
											</div>
										)}
									</InlineStack>
								</>
							)}

							{selectedSyncLog.errorMessage && (
								<>
									<Divider />
									<div>
										<Text as="p" tone="critical" fontWeight="semibold">Error</Text>
										<Box padding="300" background="bg-fill-critical-secondary" borderRadius="200">
											<Text as="p" tone="critical">{selectedSyncLog.errorMessage}</Text>
										</Box>
									</div>
								</>
							)}

							{selectedSyncLog.requestData && (
								<>
									<Divider />
									<div>
										<Text as="p" fontWeight="semibold">Request Data</Text>
										<Box padding="300" background="bg-fill-secondary" borderRadius="200">
											<pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '12px' }}>
												{formatJSON(selectedSyncLog.requestData)}
											</pre>
										</Box>
									</div>
								</>
							)}

							{selectedSyncLog.responseData && (
								<>
									<Divider />
									<div>
										<Text as="p" fontWeight="semibold">Response Data</Text>
										<Box padding="300" background="bg-fill-secondary" borderRadius="200">
											<pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '12px' }}>
												{formatJSON(selectedSyncLog.responseData)}
											</pre>
										</Box>
									</div>
								</>
							)}

							{selectedSyncLog.queryParams && (
								<>
									<Divider />
									<div>
										<Text as="p" fontWeight="semibold">Query Params</Text>
										<Box padding="300" background="bg-fill-secondary" borderRadius="200">
											<pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '12px' }}>
												{formatJSON(selectedSyncLog.queryParams)}
											</pre>
										</Box>
									</div>
								</>
							)}
						</BlockStack>
					)}
				</Modal.Section>
			</Modal>

			{/* Modal para detalles de Webhook Log */}
			<Modal
				open={!!selectedWebhookLog}
				onClose={() => setSelectedWebhookLog(null)}
				title="Detalles del Webhook Log"
				large
			>
				<Modal.Section>
					{selectedWebhookLog && (
						<BlockStack gap="400">
							<InlineStack gap="400" wrap>
								<div>
									<Text as="p" tone="subdued">ID</Text>
									<Text as="p" fontWeight="semibold">{selectedWebhookLog.id}</Text>
								</div>
								<div>
									<Text as="p" tone="subdued">Topic</Text>
									<Badge tone="info">{selectedWebhookLog.topic}</Badge>
								</div>
								<div>
									<Text as="p" tone="subdued">Estado</Text>
									{selectedWebhookLog.processed 
										? <Badge tone="success" icon={CheckCircleIcon}>Procesado</Badge> 
										: <Badge tone="attention" icon={ClockIcon}>Pendiente</Badge>}
								</div>
								<div>
									<Text as="p" tone="subdued">Fecha</Text>
									<Text as="p" fontWeight="semibold">{new Date(selectedWebhookLog.createdAt).toLocaleString('es-ES')}</Text>
								</div>
							</InlineStack>
							
							<Divider />
							
							<InlineStack gap="400" wrap>
								<div>
									<Text as="p" tone="subdued">Shopify ID</Text>
									<Text as="p" fontWeight="semibold">{selectedWebhookLog.shopifyId || 'N/A'}</Text>
								</div>
								{selectedWebhookLog.statusCode && (
									<div>
										<Text as="p" tone="subdued">Status Code</Text>
										<Badge>{selectedWebhookLog.statusCode}</Badge>
									</div>
								)}
							</InlineStack>

							{selectedWebhookLog.errorMessage && (
								<>
									<Divider />
									<div>
										<Text as="p" tone="critical" fontWeight="semibold">Error</Text>
										<Box padding="300" background="bg-fill-critical-secondary" borderRadius="200">
											<Text as="p" tone="critical">{selectedWebhookLog.errorMessage}</Text>
										</Box>
									</div>
								</>
							)}

							{selectedWebhookLog.headers && (
								<>
									<Divider />
									<div>
										<Text as="p" fontWeight="semibold">Headers</Text>
										<Box padding="300" background="bg-fill-secondary" borderRadius="200">
											<pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '12px' }}>
												{formatJSON(selectedWebhookLog.headers)}
											</pre>
										</Box>
									</div>
								</>
							)}

							{selectedWebhookLog.payload && (
								<>
									<Divider />
									<div>
										<Text as="p" fontWeight="semibold">Payload</Text>
										<Box padding="300" background="bg-fill-secondary" borderRadius="200">
											<pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '12px' }}>
												{formatJSON(selectedWebhookLog.payload)}
											</pre>
										</Box>
									</div>
								</>
							)}
						</BlockStack>
					)}
				</Modal.Section>
			</Modal>
		</BlockStack>
	);
}

function PipelinesTab({ integration, pipelines, credentials, actionData, isSubmitting }) {
	const submit = useSubmit();
	const shopify = useAppBridge();
	const [selectedPipeline, setSelectedPipeline] = useState(
		credentials?.pipelineId ? [credentials.pipelineId] : []
	);

	// Mostrar toasts cuando haya respuesta
	useEffect(() => {
		if (actionData?.success && actionData?.message?.includes('Pipeline')) {
			shopify.toast.show('✅ ' + actionData.message, { duration: 3000 });
		} else if (actionData?.error && actionData?.error?.includes('pipeline')) {
			shopify.toast.show('❌ ' + actionData.error, { duration: 5000, isError: true });
		}
	}, [actionData, shopify]);

	const handlePipelineChange = (selected) => {
		setSelectedPipeline(selected);
		
		if (selected.length > 0) {
			// Encontrar el pipeline seleccionado para obtener su nombre
			const pipeline = pipelines?.find((p) => String(p.id) === selected[0]);
			
			// Autoguardar cuando se selecciona un pipeline
			const formData = new FormData();
			formData.append('_action', 'save-pipeline');
			formData.append('pipelineId', selected[0]);
			formData.append('pipelineName', pipeline?.name || pipeline?.title || 'Pipeline');
			submit(formData, { method: 'post' });
			shopify.toast.show('📥 Guardando pipeline...', { duration: 2000 });
		}
	};

	// Encontrar el pipeline seleccionado para mostrar sus stages
	const selectedPipelineData = pipelines?.find(
		(p) => String(p.id) === selectedPipeline[0]
	);

	return (
		<BlockStack gap="400">
			{!pipelines && (
				<Banner tone="info">
					Configura tus credenciales para ver los pipelines disponibles.
				</Banner>
			)}

			{pipelines && (
				<>
					<Card>
						<BlockStack gap="400">
							<Text as="h3" variant="headingMd">Pipelines de Clientify</Text>
							<Text as="p" tone="subdued">
								Selecciona el pipeline donde se crearán los deals de nuevos pedidos
							</Text>
							
							{pipelines.length > 0 ? (
								<Form method="post">
									<input type="hidden" name="_action" value="save-pipeline" />
									<ChoiceList
										title=""
										choices={pipelines.map((p) => ({
											label: `${p.name || p.title || 'Sin nombre'} (${p.stages?.length || 0} stages)`,
											value: String(p.id),
										}))}
										selected={selectedPipeline}
										onChange={handlePipelineChange}
									/>
								</Form>
							) : (
								<Text as="p" tone="subdued">No se encontraron pipelines</Text>
							)}
						</BlockStack>
					</Card>

					{selectedPipelineData && selectedPipelineData.stages && selectedPipelineData.stages.length > 0 && (
						<>
							<Card>
								<BlockStack gap="400">
									<Text as="h3" variant="headingMd">
										Stages del Pipeline: {selectedPipelineData.name}
									</Text>
									<Text as="p" tone="subdued">
										Estos son los stages disponibles en este pipeline.
									</Text>
									
									<DataTable
										columnContentTypes={['text', 'text']}
										headings={['Stage', 'ID']}
										rows={selectedPipelineData.stages.map((stage, index) => [
											`${index + 1}. ${stage.name}`,
											String(stage.id)
										])}
									/>
								</BlockStack>
							</Card>

							<Card>
								<BlockStack gap="400">
									<Text as="h3" variant="headingMd">
										Mapeo de Estados de Shopify
									</Text>
									<Text as="p" tone="subdued">
										Asigna un stage de Clientify para cada estado financiero de pedidos de Shopify. Los pedidos cambiarán automáticamente de stage según su estado.
									</Text>

									<DataTable
										columnContentTypes={['text', 'text']}
										headings={['Estado de Shopify', 'Stage de Clientify']}
										rows={SHOPIFY_ORDER_STATUSES.map((status) => {
											const mappedStageId = credentials?.stageMapping?.[status.value];
											const mappedStage = selectedPipelineData.stages.find(
												(s) => String(s.id) === String(mappedStageId)
											);
											return [
												status.label,
												<Form method="post" key={status.value}>
													<input type="hidden" name="_action" value="save-stage-mapping" />
													<input type="hidden" name="shopifyStatus" value={status.value} />
													<Select
														label=""
														name="stageId"
														options={[
															{ label: 'Seleccionar stage...', value: '' },
															...selectedPipelineData.stages.map((stage) => ({
																label: stage.name,
																value: String(stage.id),
															}))
														]}
														value={mappedStageId ? String(mappedStageId) : ''}
														onChange={(value) => {
															if (value) {
															const stage = selectedPipelineData.stages.find(s => String(s.id) === value);
															const form = new FormData();
															form.append('_action', 'save-stage-mapping');
															form.append('shopifyStatus', status.value);
															form.append('stageId', value);
															form.append('stageName', stage?.name || 'Stage');
																submit(form, { method: 'post' });
																shopify.toast.show('📥 Guardando mapeo...', { duration: 2000 });
															}
														}}
													/>
												</Form>
											];
										})}
									/>

									<Banner tone="info">
										<p>
											<strong>Nota:</strong> Los nuevos pedidos se crearán inicialmente en el primer stage "{selectedPipelineData.stages[0]?.name}". 
											Cuando el estado financiero del pedido cambie en Shopify, el deal se moverá automáticamente al stage correspondiente.
										</p>
									</Banner>
								</BlockStack>
							</Card>
						</>
					)}
				</>
			)}
		</BlockStack>
	);
}
