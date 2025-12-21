import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, Link } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { getQRCodes } from "../models/QRCode.server";
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
  
  const qrCodes = await getQRCodes(session.shop, admin.graphql);

  return {
    qrCodes,
  };
}

const EmptyQRCodeState = () => (
  <s-section accessibilityLabel="Empty state section">
    <s-grid gap="base" justifyItems="center" paddingBlock="large-400">
      <s-box maxInlineSize="200px" maxBlockSize="200px">
        <s-image
          aspectRatio="1/0.5"
          src="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          alt="A stylized graphic of a document"
        />
      </s-box>
      <s-stack gap="large-200" alignment="center">
        <s-heading>Create unique QR codes for your products</s-heading>
        <s-paragraph tone="subdued" alignment="center">
          QR codes are a great way to drive customers to your products. Start by
          creating a QR code.
        </s-paragraph>
        <Link to="/app/qrcodes/new">
          <s-button variant="primary">Create QR code</s-button>
        </Link>
      </s-stack>
    </s-grid>
  </s-section>
);

function truncate(str: string, { length = 25 } = {}) {
  if (!str) return "";
  if (str.length <= length) return str;
  return str.slice(0, length) + "…";
}

const QRTable = ({ qrCodes }: { qrCodes: any[] }) => (
  <s-table>
    <s-table-header listSlot="primary" slot="header">
      Title
    </s-table-header>
    <s-table-header slot="header">Product</s-table-header>
    <s-table-header slot="header">Date created</s-table-header>
    <s-table-header slot="header">Scans</s-table-header>
    {qrCodes.map((qrCode) => (
      <s-table-row key={qrCode.id}>
        <s-table-cell listSlot="primary">
          <Link to={`/app/qrcodes/${qrCode.id}`}>
            <s-link>{truncate(qrCode.title)}</s-link>
          </Link>
        </s-table-cell>
        <s-table-cell>
          <s-stack gap="base" alignment="center">
            {qrCode.productImage && (
              <s-image
                source={qrCode.productImage}
                alt={qrCode.productAlt}
                aspectRatio="1/1"
                width="30px"
              />
            )}
            <s-stack gap="none">
              <s-text fontWeight="bold">{truncate(qrCode.productTitle)}</s-text>
              {qrCode.productDeleted && (
                <s-badge tone="critical">Product deleted</s-badge>
              )}
            </s-stack>
          </s-stack>
        </s-table-cell>
        <s-table-cell>
          {new Date(qrCode.createdAt).toLocaleDateString()}
        </s-table-cell>
        <s-table-cell>{qrCode.scans}</s-table-cell>
      </s-table-row>
    ))}
  </s-table>
);

export default function Index() {
  const { qrCodes } = useLoaderData<typeof loader>();

  return (
    <s-page>
      <s-text slot="title" variant="headingLg" as="h1">
        QR codes
      </s-text>
      <Link to="/app/qrcodes/new" slot="primary-action">
        <s-button variant="primary">Create QR code</s-button>
      </Link>

      {qrCodes.length === 0 ? <EmptyQRCodeState /> : <QRTable qrCodes={qrCodes} />}
    </s-page>
  );
}

export { boundary };
