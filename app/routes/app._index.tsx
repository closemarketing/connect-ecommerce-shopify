import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, Link } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
	Page,
	Layout,
	Card,
	Text,
	Badge,
	InlineStack,
	BlockStack,
	Button,
	Box,
} from "@shopify/polaris";
import { SettingsIcon } from "@shopify/polaris-icons";

import { authenticate } from "../shopify.server";
import shopify from "../shopify.server";
import prisma from "../db.server";
import { getIntegrations, getAllCredentialsByShop } from "../models/Integration.server";
import { getAllAdapters } from "../integrations/registry.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  
  // Crear o actualizar el registro de Shop
  const shopDomain = session.shop;
  let shopRecord = await prisma.shop.findUnique({
    where: { domain: shopDomain }
  });

  if (!shopRecord) {
    console.log('📦 Creando nuevo Shop:', shopDomain);
    shopRecord = await prisma.shop.create({
      data: { domain: shopDomain }
    });
    console.log('✅ Shop creado con ID:', shopRecord.id);
  }

  // Actualizar la sesión con el shopId si no lo tiene
  if (!session.shopId) {
    console.log('🔄 Actualizando sesión con shopId:', shopRecord.id);
    await prisma.session.update({
      where: { id: session.id },
      data: { shopId: shopRecord.id }
    });
  }
  
  // Registrar webhooks automáticamente si no existen
  try {
    await shopify.registerWebhooks({ session });
  } catch (error) {
    console.error("Error registering webhooks:", error);
  }

  // Obtener integraciones
  const integrations = await getIntegrations();
  const adapters = getAllAdapters();
  const allCredentials = await getAllCredentialsByShop(shopDomain);

  // Combinar información de BD con adapters
  const integrationsWithConfig = integrations.map((integration) => {
    const adapter = adapters.find((a) => a.getConfig().name === integration.name);
    const config = adapter?.getConfig() || {};
    const credentials = allCredentials[integration.id];
    const hasCredentials = credentials && Object.keys(credentials).length > 0;

    return {
      ...integration,
      ...config,
      hasCredentials,
    };
  });

  return {
    shop: shopDomain,
    integrations: integrationsWithConfig,
  };
}

export default function Index() {
  const { shop, integrations } = useLoaderData<typeof loader>();

  return (
    <Page title="Integraciones" subtitle="Conecta tu tienda con sistemas externos">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Text as="p" tone="subdued">
              Gestiona las integraciones de tu tienda con CRMs, ERPs y otros sistemas.
            </Text>

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', 
              gap: '1rem' 
            }}>
              {integrations.map((integration: any) => (
                <Card key={integration.id}>
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="start">
                      <BlockStack gap="200">
                        <Text as="h2" variant="headingMd">
                          {integration.displayName}
                        </Text>
                        {integration.description && (
                          <Text as="p" tone="subdued">
                            {integration.description}
                          </Text>
                        )}
                      </BlockStack>
                      <Badge tone={integration.enabled ? "success" : "info"}>
                        {integration.enabled ? "Activa" : "Inactiva"}
                      </Badge>
                    </InlineStack>

                    <InlineStack gap="200" align="space-between">
                      <InlineStack gap="200">
                        {integration.hasCredentials ? (
                          <Badge tone="success">● Configurada</Badge>
                        ) : (
                          <Badge tone="attention">○ Sin configurar</Badge>
                        )}
                      </InlineStack>

                      <Link to={`/app/integrations/${integration.name}`}>
                        <Button icon={SettingsIcon}>
                          Configurar
                        </Button>
                      </Link>
                    </InlineStack>
                  </BlockStack>
                </Card>
              ))}
            </div>

            {integrations.length === 0 && (
              <Card>
                <Box padding="800">
                  <BlockStack gap="200" inlineAlign="center">
                    <Text as="p" variant="bodyMd" tone="subdued">
                      No hay integraciones disponibles
                    </Text>
                  </BlockStack>
                </Box>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export { boundary };
