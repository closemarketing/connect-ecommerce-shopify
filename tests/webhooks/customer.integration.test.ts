import { describe, it, expect, beforeAll } from 'vitest';
import { mockShopifyOrder } from '../fixtures/shopify-order.mock';
import { syncShopifyCustomerToClientifyContact } from '../../app/integrations/clientify/sync-customer.server';
import db from '../../app/db.server';

/**
 * Tests de integración reales con Clientify
 * Estos tests hacen llamadas reales a la API de Clientify
 * Requiere: TEST_SHOP_DOMAIN en las variables de entorno para identificar el shop de prueba
 */
describe('Customer Integration - Sync to Clientify', () => {
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
        key: 'apiToken',
      },
    });
    
    if (!integrationCredential || !integrationCredential.value) {
      throw new Error(`No se encontraron credenciales de Clientify para el shop: ${testShopDomain}`);
    }

    apiToken = integrationCredential.value;
    console.log(`✅ Usando shop de prueba: ${testShopDomain}`);
    console.log(`✅ API Token encontrado para Clientify`);
  });

  it('debería sincronizar un customer de Shopify con Clientify y devolver un ID', async () => {
    // Extraer customer de la order
    const { customer } = mockShopifyOrder;

    // Sincronizar customer con Clientify
    const result = await syncShopifyCustomerToClientifyContact(customer, apiToken);

    // Verificar que se devuelve un contacto con ID
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.id).toBeTypeOf('number');
    expect(result.id).toBeGreaterThan(0);
    
    console.log(`✅ Contacto sincronizado con ID: ${result.id}`);
  });


});
