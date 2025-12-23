import { describe, it, expect, beforeAll } from 'vitest';
import { mockShopifyOrder } from '../fixtures/shopify-order.mock';
import { syncShopifyDealToClientify } from '../../app/services/sync-deal-to-clientify.server';
import { syncShopifyCustomerToClientifyContact } from '../../app/services/sync-customer-to-clientify.server';
import { mapShopifyOrderToClientifyDeal } from '../../app/services/clientify-mapper.server';
import { ClientifyService } from '../../app/services/clientify.server';
import db from '../../app/db.server';

/**
 * Tests de integración reales con Clientify para Deals
 * Estos tests hacen llamadas reales a la API de Clientify
 * Requiere: TEST_SHOP_DOMAIN en las variables de entorno para identificar el shop de prueba
 */
describe('Deal Integration - Sync to Clientify', () => {
  let apiToken: string;
  let testShopDomain: string;
  let ownerId: number;

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
    
    // Obtener el owner ID desde la cuenta de Clientify
    const clientifyService = new ClientifyService({ apiToken });
    const accountInfo = await clientifyService.getAccountInfo();
    ownerId = accountInfo.id;
    
    console.log(`✅ Usando shop de prueba: ${testShopDomain}`);
    console.log(`✅ API Token encontrado para Clientify`);
    console.log(`✅ Owner ID obtenido: ${ownerId}`);
  });

  it('debería crear un deal en Clientify usando el customer de la order y owner', async () => {
    // Primero sincronizar el customer para obtener un contact_id real
    const { customer } = mockShopifyOrder;
    const contact = await syncShopifyCustomerToClientifyContact(customer, apiToken);
    
    console.log(`✅ Contacto sincronizado con ID: ${contact.id}`);
    
    // Mapear el pedido a un deal de Clientify (sin items por ahora, con owner)
    const dealData = mapShopifyOrderToClientifyDeal(mockShopifyOrder, contact.id, [], ownerId);

    // Sincronizar el deal
    const result = await syncShopifyDealToClientify(dealData, apiToken);

    // Verificar que se devuelve un deal con ID
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.id).toBeTypeOf('number');
    expect(result.id).toBeGreaterThan(0);
    
    console.log(`✅ Deal creado con ID: ${result.id}`);
  });

 
});
