import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import logger from "~/utils/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  logger.info(`🗑️  Received ${topic} webhook for ${shop}`);

  try {
    // Marcar la tienda como inactiva
    const shopRecord = await db.shop.findUnique({
      where: { domain: shop }
    });

    if (shopRecord) {
      await db.shop.update({
        where: { id: shopRecord.id },
        data: { active: false }
      });
      logger.info(`✅ Shop ${shop} marked as inactive`);
    } else {
      logger.warn(`⚠️ Shop ${shop} not found in database`);
    }

    // Webhook requests can trigger multiple times and after an app has already been uninstalled.
    // If this webhook already ran, the session may have been deleted previously.
    if (session) {
      await db.session.deleteMany({ where: { shop } });
      logger.info(`🗑️  Deleted sessions for ${shop}`);
    }
  } catch (error) {
    logger.error(`❌ Error processing uninstall webhook for ${shop}:`, error);
    // No lanzar el error, devolver 200 de todos modos
  }

  return new Response();
};

