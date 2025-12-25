import { useLoaderData, useActionData, useSubmit, Form } from "react-router";
import { useState, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getIntegrations, getAllCredentialsByShop, saveCredentials, getIntegrationByName } from "../models/Integration.server";

export async function loader({ request }) {
  
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
      // Validar credenciales de Clientify antes de guardar
      if (integrationName === "clientify" && credentials.apikey) {
        console.log("🔍 Validando API key de Clientify...");
        
        try {
          const validationResponse = await fetch("https://api.clientify.net/v1/contacts/", {
            method: "GET",
            headers: {
              "Authorization": `Token ${credentials.apikey}`,
              "Content-Type": "application/json",
            },
          });

          if (!validationResponse.ok) {
            console.error(`❌ Validación fallida: ${validationResponse.status}`);
            return { 
              success: false, 
              error: `API Key inválida. Respuesta de Clientify: ${validationResponse.status}` 
            };
          }

          console.log("✅ API Key de Clientify validada correctamente");
        } catch (validationError) {
          console.error("❌ Error al validar API key:", validationError);
          return { 
            success: false, 
            error: "No se pudo conectar con Clientify. Verifica tu API Key e intenta de nuevo." 
          };
        }
      }

      // Guardar credenciales si la validación fue exitosa
      await saveCredentials(shop, integration.id, credentials);
      return { success: true, message: "Credenciales guardadas correctamente" };
    } catch (error) {
      console.error("❌ Error guardando credenciales:", error);
      return { 
        success: false, 
        error: error.message || "Error al guardar las credenciales" 
      };
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
  const [isEditing, setIsEditing] = useState(false);

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
      setIsEditing(false);
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

      <s-block-stack gap="400">
        <s-card>
          <s-inline-stack align="space-between" blockAlign="center">
            <s-block-stack gap="100">
              <s-text variant="headingMd" as="h2">
                Clientify CRM
              </s-text>
              <s-text variant="bodySm" as="p" tone="subdued">
                Sincroniza clientes, productos y pedidos con tu CRM
              </s-text>
            </s-block-stack>
            {hasClientifyCredentials && (
              <s-badge tone="success">✓ Configurado</s-badge>
            )}
          </s-inline-stack>

          <s-divider></s-divider>

          <s-block-stack gap="300">

                  <s-text-field
                    label="API Key"
                    name="clientify_apikey"
                    value={clientifyData.apikey || ""}
                    onInput={(e) => handleInputChange("clientify", "apikey", e.target.value)}
                    helpText="Obtén tu API Key desde el panel de Clientify en Configuración > API"
                    type="password"
                    disabled={hasClientifyCredentials && !isEditing}
                  >
                  </s-text-field>

                  {hasClientifyCredentials && !isEditing ? (
                    <s-inline-stack gap="300">
                      <s-inline-stack gap="200">
                        <s-icon name="checkCircle" tone="success"></s-icon>
                        <s-text variant="bodyMd" tone="success">
                          Conexión establecida
                        </s-text>
                      </s-inline-stack>
                      <s-button onClick={() => setIsEditing(true)}>
                        Editar API Key
                      </s-button>
                    </s-inline-stack>
                  ) : (
                    <s-inline-stack gap="200">
                      <s-button variant="primary" onClick={handleSave}>
                        Guardar API Key
                      </s-button>
                      {hasClientifyCredentials && (
                        <s-button onClick={() => {
                          setIsEditing(false);
                          const initialData = {};
                          if (allCredentials[currentIntegration]) {
                            initialData[currentIntegration] = allCredentials[currentIntegration].credentials;
                          }
                          setFormData(initialData);
                        }}>
                          Cancelar
                        </s-button>
                      )}
                    </s-inline-stack>
                  )}
                </s-block-stack>

          <s-divider></s-divider>

          <s-inline-stack gap="300">
            <s-link url="https://clientify.com" target="_blank">
              <s-button size="slim" variant="plain">Visitar Clientify</s-button>
            </s-link>
            <s-link url="https://docs.clientify.com/api" target="_blank">
              <s-button size="slim" variant="plain">Documentación API</s-button>
            </s-link>
          </s-inline-stack>
        </s-card>
      </s-block-stack>
    </>
  );
}
