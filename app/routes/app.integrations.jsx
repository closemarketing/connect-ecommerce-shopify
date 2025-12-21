import { useLoaderData, useActionData, useSubmit, Form } from "react-router";
import { useState, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

export async function loader({ request }) {
  const { authenticate } = await import("../shopify.server");
  const {
    getIntegrations,
    getAllCredentialsByShop,
  } = await import("../models/Integration.server");
  
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Obtener todas las integraciones disponibles
  const integrations = await getIntegrations();

  // Obtener todas las credenciales configuradas para esta tienda
  const allCredentials = await getAllCredentialsByShop(shop);

  return {
    integrations,
    allCredentials,
    shop,
  };
}

export async function action({ request }) {
  const { authenticate } = await import("../shopify.server");
  const {
    saveCredentials,
    getIntegrationByName,
  } = await import("../models/Integration.server");
  
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const action = formData.get("action");
  const integrationName = formData.get("integrationName");

  if (action === "save") {
    // Obtener la integración
    const integration = await getIntegrationByName(integrationName);
    
    if (!integration) {
      throw new Response(JSON.stringify({ error: "Integración no encontrada" }), { 
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Recolectar todas las credenciales del formulario
    const credentials = {};
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("credential_")) {
        const credentialKey = key.replace("credential_", "");
        credentials[credentialKey] = value;
      }
    }

    try {
      await saveCredentials(shop, integration.id, credentials);
      return { success: true, message: "Credenciales guardadas correctamente" };
    } catch (error) {
      throw new Response(JSON.stringify({ error: error.message }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  throw new Response(JSON.stringify({ error: "Acción no válida" }), { 
    status: 400,
    headers: { "Content-Type": "application/json" }
  });
}

export default function Integrations() {
  const { integrations, allCredentials, shop } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const shopify = useAppBridge();

  const [formData, setFormData] = useState({});
  const [showSaveBar, setShowSaveBar] = useState(false);
  const [currentIntegration, setCurrentIntegration] = useState("clientify");

  // Cargar credenciales existentes
  useEffect(() => {
    const initialData = {};
    if (allCredentials[currentIntegration]) {
      initialData[currentIntegration] = allCredentials[currentIntegration].credentials;
    }
    setFormData(initialData);
  }, [currentIntegration, allCredentials]);

  // Mostrar notificación cuando se guarden las credenciales
  useEffect(() => {
    if (actionData?.success) {
      shopify.toast.show(actionData.message);
      setShowSaveBar(false);
    } else if (actionData?.error) {
      shopify.toast.show(actionData.error, { isError: true });
    }
  }, [actionData, shopify]);

  const handleInputChange = (integration, key, value) => {
    setFormData((prev) => ({
      ...prev,
      [integration]: {
        ...prev[integration],
        [key]: value,
      },
    }));
    setShowSaveBar(true);
  };

  const handleSave = () => {
    const form = new FormData();
    form.append("action", "save");
    form.append("integrationName", currentIntegration);
    
    const integrationData = formData[currentIntegration] || {};
    Object.entries(integrationData).forEach(([key, value]) => {
      form.append(`credential_${key}`, value);
    });

    submit(form, { method: "post" });
  };

  const handleDiscard = () => {
    const initialData = {};
    if (allCredentials[currentIntegration]) {
      initialData[currentIntegration] = allCredentials[currentIntegration].credentials;
    }
    setFormData(initialData);
    setShowSaveBar(false);
  };

  useEffect(() => {
    if (showSaveBar) {
      shopify.saveBar.show('integration-save-bar');
    } else {
      shopify.saveBar.hide('integration-save-bar');
    }
  }, [showSaveBar, shopify]);

  const clientifyData = formData.clientify || {};
  const hasClientifyCredentials = allCredentials.clientify?.credentials?.apikey;

  return (
    <>
      <ui-save-bar id="integration-save-bar">
        <button variant="primary" onClick={handleSave}></button>
        <button onClick={handleDiscard}></button>
      </ui-save-bar>

      <ui-title-bar title="Integraciones"></ui-title-bar>

      <s-block-stack gap="500">
        <s-layout>
          <s-layout-section variant="oneThird">
            <s-card>
              <s-block-stack gap="200">
                <s-text variant="headingMd" as="h2">
                  Configuración de Integraciones
                </s-text>
                <s-text variant="bodyMd" as="p" tone="subdued">
                  Conecta tus herramientas favoritas con tu tienda. Configura las credenciales necesarias para cada integración.
                </s-text>
              </s-block-stack>
            </s-card>
          </s-layout-section>

          <s-layout-section>
            {/* Clientify Integration */}
            <s-card>
              <s-block-stack gap="400">
                <s-inline-stack align="space-between" blockAlign="center">
                  <s-block-stack gap="100">
                    <s-text variant="headingLg" as="h2">
                      Clientify
                    </s-text>
                    <s-text variant="bodyMd" as="p" tone="subdued">
                      CRM para gestión de clientes y ventas
                    </s-text>
                  </s-block-stack>
                  {hasClientifyCredentials && (
                    <s-badge tone="success">Configurado</s-badge>
                  )}
                </s-inline-stack>

                <s-divider></s-divider>

                <s-block-stack gap="400">
                  <s-text variant="headingMd" as="h3">
                    Credenciales
                  </s-text>

                  <s-text-field
                    label="API Key"
                    name="clientify_apikey"
                    value={clientifyData.apikey || ""}
                    onInput={(e) => handleInputChange("clientify", "apikey", e.target.value)}
                    helpText="Obtén tu API Key desde el panel de Clientify en Configuración > API"
                    type="password"
                  >
                  </s-text-field>

                  {hasClientifyCredentials && (
                    <s-inline-stack gap="200">
                      <s-icon name="checkCircle" tone="success"></s-icon>
                      <s-text variant="bodyMd" tone="success">
                        Conexión establecida
                      </s-text>
                    </s-inline-stack>
                  )}
                </s-block-stack>

                <s-divider></s-divider>

                <s-block-stack gap="200">
                  <s-text variant="headingMd" as="h3">
                    Información
                  </s-text>
                  <s-text variant="bodyMd" as="p">
                    Clientify es un CRM que te permite gestionar tus clientes, oportunidades de venta y campañas de marketing.
                  </s-text>
                  <s-inline-stack gap="200">
                    <s-link url="https://clientify.com" target="_blank">
                      Visitar Clientify
                    </s-link>
                    <s-link url="https://docs.clientify.com/api" target="_blank">
                      Documentación API
                    </s-link>
                  </s-inline-stack>
                </s-block-stack>
              </s-block-stack>
            </s-card>

            {/* Placeholder para futuras integraciones */}
            <s-card>
              <s-block-stack gap="300" alignment="center">
                <s-icon name="apps" tone="subdued"></s-icon>
                <s-text variant="headingMd" as="h2" alignment="center">
                  Próximamente más integraciones
                </s-text>
                <s-text variant="bodyMd" as="p" tone="subdued" alignment="center">
                  Estamos trabajando para añadir más integraciones que te ayuden a potenciar tu negocio.
                </s-text>
              </s-block-stack>
            </s-card>
          </s-layout-section>
        </s-layout>
      </s-block-stack>
    </>
  );
}
