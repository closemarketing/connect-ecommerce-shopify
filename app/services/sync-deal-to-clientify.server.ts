import { ClientifyService, type ClientifyDeal } from "./clientify.server";

/**
 * Sincroniza un deal de Shopify con una oportunidad de Clientify
 * 
 * @param dealData - Datos del deal en formato Clientify
 * @param apiToken - Token de API de Clientify
 * @returns El deal creado con su ID
 */
export async function syncShopifyDealToClientify(
  dealData: ClientifyDeal,
  apiToken: string
): Promise<ClientifyDeal & { id: number }> {
  const clientifyService = new ClientifyService({ apiToken });
  
  console.log('📤 Datos del deal para Clientify:', dealData);
  
  // Crear oportunidad en Clientify
  const dealId = await clientifyService.createDeal(dealData);
  console.log('✅ Resultado de createDeal - ID:', dealId);
  
  const result = {
    ...dealData,
    id: dealId,
  };
  console.log('📦 Resultado final del deal:', result);
  
  return result;
}
