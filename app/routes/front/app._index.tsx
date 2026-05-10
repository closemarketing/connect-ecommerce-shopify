import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, Link } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "~/shopify.server";
import shopify from "~/shopify.server";
import prisma from "~/db.server";

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

  return {
    shop: shopDomain,
  };
}

export default function Index() {
  const { shop } = useLoaderData<typeof loader>();

  return (
    <s-page>
      <s-text slot="title" variant="headingMd" as="h1">
        Bienvenido a Clientify para Shopify
      </s-text>
      <s-text slot="subtitle" variant="bodyMd" as="p">
        Sincroniza automáticamente tus pedidos, clientes y productos con Clientify CRM. Tu tienda <strong>{shop}</strong> está conectada.
      </s-text>

      <s-layout>
        <s-layout-section>
          <s-card>
            <s-block-stack gap="400">
              <s-text variant="headingMd" as="h2">
                Pasos para comenzar
              </s-text>
              <s-divider></s-divider>
              
              <s-block-stack gap="300">
                <s-block-stack gap="100">
                  <s-text variant="headingSm" as="h3">
                    1. Configura tu API Key
                  </s-text>
                  <s-text variant="bodyMd" as="p" tone="subdued">
                    Ve a la sección de Integraciones y añade tu API Key de Clientify para comenzar la sincronización.
                  </s-text>
                  <div>
                    <Link to="/app/integrations">
                      <s-button>Configurar ahora</s-button>
                    </Link>
                  </div>
                </s-block-stack>

                <s-divider></s-divider>

                <s-block-stack gap="100">
                  <s-text variant="headingSm" as="h3">
                    2. Sincronización automática
                  </s-text>
                  <s-text variant="bodyMd" as="p" tone="subdued">
                    Los pedidos se sincronizan automáticamente. Clientes, productos y oportunidades se crean en Clientify.
                  </s-text>
                </s-block-stack>

                <s-divider></s-divider>

                <s-block-stack gap="100">
                  <s-text variant="headingSm" as="h3">
                    3. Monitorea el proceso
                  </s-text>
                  <s-text variant="bodyMd" as="p" tone="subdued">
                    Revisa los logs de sincronización y webhooks para asegurar que todo funciona correctamente.
                  </s-text>
                  <div>
                    <Link to="/app/sync-logs">
                      <s-button variant="plain">Ver logs</s-button>
                    </Link>
                  </div>
                </s-block-stack>
              </s-block-stack>
            </s-block-stack>
          </s-card>
        </s-layout-section>

        <s-layout-section>
          <s-card>
            <s-block-stack gap="400">
              <s-text variant="headingMd" as="h2">
                Características principales
              </s-text>
              <s-divider></s-divider>
              <s-block-stack gap="300">
                <s-block-stack gap="100">
                  <s-text variant="headingSm" as="h4">
                    Sincronización de clientes
                  </s-text>
                  <s-text variant="bodyMd" as="p" tone="subdued">
                    Los datos de tus clientes se transfieren automáticamente a Clientify como contactos.
                  </s-text>
                </s-block-stack>

                <s-block-stack gap="100">
                  <s-text variant="headingSm" as="h4">
                    Productos actualizados
                  </s-text>
                  <s-text variant="bodyMd" as="p" tone="subdued">
                    Mantén tu catálogo de productos sincronizado con precios y descripciones actuales.
                  </s-text>
                </s-block-stack>

                <s-block-stack gap="100">
                  <s-text variant="headingSm" as="h4">
                    Oportunidades de venta
                  </s-text>
                  <s-text variant="bodyMd" as="p" tone="subdued">
                    Cada pedido crea una oportunidad en Clientify con todos los detalles y productos.
                  </s-text>
                </s-block-stack>

                <s-block-stack gap="100">
                  <s-text variant="headingSm" as="h4">
                    Logs detallados
                  </s-text>
                  <s-text variant="bodyMd" as="p" tone="subdued">
                    Revisa el historial completo de sincronizaciones con datos de request y response.
                  </s-text>
                </s-block-stack>
              </s-block-stack>
            </s-block-stack>
          </s-card>
        </s-layout-section>
      </s-layout>
    </s-page>
  );
}

export { boundary };
