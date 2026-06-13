import db from "../db.server";

/**
 * Obtiene todas las integraciones disponibles
 */
export async function getIntegrations() {
  return await db.integration.findMany({
    orderBy: { name: "asc" },
  });
}

/**
 * Obtiene una integración por su nombre
 */
export async function getIntegrationByName(name) {
  return await db.integration.findUnique({
    where: { name },
  });
}

/**
 * Crea una integración (uso administrativo)
 */
export async function createIntegration(name, displayName) {
  return await db.integration.create({
    data: {
      name,
      displayName,
    },
  });
}

/**
 * Obtiene las credenciales de una tienda para una integración específica
 */
export async function getCredentials(sessionId, integrationId) {
  const credentials = await db.integrationCredential.findMany({
    where: {
      sessionId,
      integrationId,
    },
    include: {
      integration: true,
    },
  });

  // Convertir array a objeto para facilitar acceso
  return credentials.reduce((acc, cred) => {
    acc[cred.key] = cred.value;
    return acc;
  }, {});
}

/**
 * Guarda o actualiza credenciales de una integración para una tienda
 * @param {string} sessionId - ID de la sesión (shop)
 * @param {number} integrationId - ID de la integración
 * @param {Object} credentials - Objeto con las credenciales {key: value}
 */
export async function saveCredentials(sessionId, integrationId, credentials) {
  const operations = Object.entries(credentials).map(([key, value]) =>
    db.integrationCredential.upsert({
      where: {
        sessionId_integrationId_key: {
          sessionId,
          integrationId,
          key,
        },
      },
      update: {
        value,
        updatedAt: new Date(),
      },
      create: {
        sessionId,
        integrationId,
        key,
        value,
      },
    })
  );

  return await db.$transaction(operations);
}

/**
 * Elimina las credenciales de una integración para una tienda
 */
export async function deleteCredentials(sessionId, integrationId) {
  return await db.integrationCredential.deleteMany({
    where: {
      sessionId,
      integrationId,
    },
  });
}

/**
 * Verifica si una tienda tiene credenciales configuradas para una integración
 */
export async function hasCredentials(sessionId, integrationId) {
  const count = await db.integrationCredential.count({
    where: {
      sessionId,
      integrationId,
    },
  });
  return count > 0;
}

/**
 * Obtiene todas las credenciales de una tienda (todas las integraciones)
 */
export async function getAllCredentialsByShop(sessionId) {
  const credentials = await db.integrationCredential.findMany({
    where: { sessionId },
    include: {
      integration: true,
    },
  });

  // Agrupar por integración
  return credentials.reduce((acc, cred) => {
    if (!acc[cred.integration.name]) {
      acc[cred.integration.name] = {
        integrationId: cred.integrationId,
        displayName: cred.integration.displayName,
        credentials: {},
      };
    }
    acc[cred.integration.name].credentials[cred.key] = cred.value;
    return acc;
  }, {});
}

/**
 * Garantiza que exista un registro Shop para el dominio dado y devuelve el id.
 */
async function ensureShopId(shopDomain) {
  const shop = await db.shop.upsert({
    where:  { domain: shopDomain },
    update: {},
    create: { domain: shopDomain },
  });
  return shop.id;
}

/**
 * Devuelve el estado (activo/inactivo + credenciales) de cada integración
 * disponible para una tienda. Retorna una entrada por cada Integration en BD.
 */
export async function getShopIntegrationsState(shopDomain) {
  const shopId        = await ensureShopId(shopDomain);
  const integrations  = await db.integration.findMany({ orderBy: { name: "asc" } });
  const shopLinks     = await db.shopIntegration.findMany({ where: { shopId } });
  const allCreds      = await getAllCredentialsByShop(shopDomain);

  const linkByIntId = new Map(shopLinks.map((l) => [l.integrationId, l]));

  return integrations.map((integration) => {
    const link        = linkByIntId.get(integration.id);
    const credsBundle = allCreds[integration.name];
    return {
      id:            integration.id,
      name:          integration.name,
      displayName:   integration.displayName,
      active:        Boolean(link?.active),
      hasCredentials: Boolean(credsBundle && Object.keys(credsBundle.credentials).length > 0),
      credentials:   credsBundle?.credentials ?? {},
    };
  });
}

/**
 * Devuelve sólo las integraciones activas para una tienda.
 */
export async function getActiveIntegrations(shopDomain) {
  const shopId = await ensureShopId(shopDomain);
  const links  = await db.shopIntegration.findMany({
    where:   { shopId, active: true },
    include: { integration: true },
    orderBy: { integration: { name: "asc" } },
  });
  return links.map((l) => ({
    id:          l.integration.id,
    name:        l.integration.name,
    displayName: l.integration.displayName,
  }));
}

/**
 * Activa o desactiva una integración para una tienda.
 * Si no existe registro ShopIntegration lo crea.
 */
export async function setIntegrationActive(shopDomain, integrationName, active) {
  const shopId      = await ensureShopId(shopDomain);
  const integration = await getIntegrationByName(integrationName);
  if (!integration) {
    throw new Error(`Integración no encontrada: ${integrationName}`);
  }

  return db.shopIntegration.upsert({
    where:  { shopId_integrationId: { shopId, integrationId: integration.id } },
    update: { active },
    create: { shopId, integrationId: integration.id, active },
  });
}

/**
 * Indica si una integración concreta está activa para una tienda.
 */
export async function isIntegrationActive(shopDomain, integrationName) {
  const shopId      = await ensureShopId(shopDomain);
  const integration = await getIntegrationByName(integrationName);
  if (!integration) return false;

  const link = await db.shopIntegration.findUnique({
    where: { shopId_integrationId: { shopId, integrationId: integration.id } },
  });
  return Boolean(link?.active);
}
