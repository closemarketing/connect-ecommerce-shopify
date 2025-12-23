import { describe, it, expect, beforeAll } from 'vitest';
import { mockShopifyOrder } from '../fixtures/shopify-order.mock';
import { syncCompleteShopifyOrderToClientify } from '../../app/services/sync-complete-order-to-clientify.server';
import db from '../../app/db.server';

/**
 * Tests de integración completa con Clientify
 * Sincroniza customer, productos y deal en una sola operación
 * Requiere: TEST_SHOP_DOMAIN en las variables de entorno
 */
describe('Complete Order Integration - Sync to Clientify', () => {
  let apiToken: string;
  let testShopDomain: string;

  beforeAll(async () => {
    // Obtener el shop de prueba desde las variables de entorno
    testShopDomain = process.env.TEST_SHOP_DOMAIN || '';
    
    if (!testShopDomain) {
      throw new Error('TEST_SHOP_DOMAIN no está configurado en las variables de entorno. Ejemplo: test-shop.myshopify.com');
    }

    // Buscar id de integración de Clientify
    const clientifyIntegration = await db.integration.findFirst({
      where: {
        name: 'clientify'
      },
      select: {
        id: true
      }
    });

    if (!clientifyIntegration) {
      throw new Error('No se encontró la integración de Clientify en la base de datos.');
    }

    // Buscar las credenciales de Clientify para el shop de prueba
    const integrationCredential = await db.integrationCredential.findFirst({
      where: {
        sessionId: testShopDomain,
        integrationId: clientifyIntegration.id,
        key: 'apiKey',
      },
    });

    if (!integrationCredential || !integrationCredential.value) {
      throw new Error(`No se encontraron credenciales de Clientify para el shop: ${testShopDomain}`);
    }

    apiToken = integrationCredential.value;
    
    console.log(`✅ Usando shop de prueba: ${testShopDomain}`);
    console.log(`✅ API Token encontrado para Clientify`);
  });

  it('debería sincronizar una order completa de Shopify con Clientify', async () => {
    // Sincronizar order completa usando los datos del mock
    const result = await syncCompleteShopifyOrderToClientify(mockShopifyOrder, apiToken);

    // Verificar que la sincronización fue exitosa
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

    console.log(`✅ Sincronización completa exitosa`);
  });

  
});
