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
