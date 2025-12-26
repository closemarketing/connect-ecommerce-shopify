import { describe, it, expect, beforeAll } from 'vitest';
import { mockShopifyOrder } from '../fixtures/shopify-order.mock';
import { 
  syncShopifyLineItemToClientifyProduct,
  syncShopifyLineItemsToClientifyProducts 
} from '../../app/integrations/clientify/sync-product.server';
import { ClientifyService } from '../../app/integrations/clientify/clientify-api.server';
import db from '../../app/db.server';

/**
 * Tests de integración reales con Clientify para Productos
 * Estos tests hacen llamadas reales a la API de Clientify
 * Requiere: TEST_SHOP_DOMAIN en las variables de entorno para identificar el shop de prueba
 */
describe('Products Integration - Sync to Clientify', () => {
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
        key: 'apiToken',
      },
    });

    if (!integrationCredential || !integrationCredential.value) {
      throw new Error(`No se encontraron credenciales de Clientify para el shop: ${testShopDomain}`);
    }

    apiToken = integrationCredential.value;
    
    // Obtener el owner ID desde la cuenta de Clientify
    const clientifyService = new ClientifyService({ apiToken });
    const accountInfo = await clientifyService.getAccountInfo();
    ownerId = accountInfo.user_id;
    
    console.log(`✅ Usando shop de prueba: ${testShopDomain}`);
    console.log(`✅ API Token encontrado para Clientify`);
    console.log(`✅ Owner ID obtenido: ${ownerId}`);
  });

  it('debería sincronizar un line_item individual de Shopify con Clientify', async () => {
    // Tomar el primer line_item de la order
    const lineItem = mockShopifyOrder.line_items[0];
    
    // Sincronizar el producto con owner
    const result = await syncShopifyLineItemToClientifyProduct(lineItem, apiToken, ownerId);

    // Verificar que se devuelve un producto con ID
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.id).toBeTypeOf('number');
    expect(result.id).toBeGreaterThan(0);
    
    console.log(`✅ Producto sincronizado con ID: ${result.id}`);
  });

  it('debería sincronizar todos los line_items de la order con owner', async () => {
    // Sincronizar todos los productos de la order con owner
    const results = await syncShopifyLineItemsToClientifyProducts(
      mockShopifyOrder.line_items,
      apiToken,
      ownerId
    );

    // Verificar que se sincronizan todos los productos
    expect(results).toBeDefined();
    expect(results.length).toBe(2); // La order mock tiene 2 productos
    
    // Verificar que todos tienen ID y owner
    results.forEach(product => {
      expect(product.id).toBeDefined();
      expect(product.id).toBeTypeOf('number');
      expect(product.id).toBeGreaterThan(0);
      expect(product.owner).toBe(ownerId);
    });

    console.log(`✅ ${results.length} productos sincronizados con owner ${ownerId}`);
    console.log(`📋 IDs: ${results.map(p => p.id).join(', ')}`);
  });
});
