import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import shopify from "../shopify.server";
import prisma from "../db.server";

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
      <s-text slot="title" variant="headingLg" as="h1">
        Bienvenido
      </s-text>

      <s-layout>
        <s-layout-section>
          <s-card>
            <s-block-stack gap="400">
              <s-text variant="headingMd" as="h2">
                Shopify Clientify App
              </s-text>
              <s-text variant="bodyMd" as="p">
                Esta aplicación sincroniza automáticamente tus pedidos de Shopify con Clientify CRM.
              </s-text>
              <s-divider></s-divider>
              <s-block-stack gap="200">
                <s-text variant="headingMd" as="h3">
                  Configuración
                </s-text>
                <s-text variant="bodyMd" as="p">
                  Para empezar a usar la aplicación, ve a la sección de Integraciones y configura tu API Key de Clientify.
                </s-text>
              </s-block-stack>
            </s-block-stack>
          </s-card>
        </s-layout-section>
      </s-layout>
    </s-page>
  );
}

export { boundary };
