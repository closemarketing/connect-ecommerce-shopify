import { ClientifyService, type ClientifyContact } from "./clientify.server";

/**
 * Mapea un customer de Shopify a un contacto de Clientify
 */
function mapShopifyCustomerToClientifyContact(customer: any): ClientifyContact {
  const defaultAddress = customer.default_address || {};

 let ClientifyContact: ClientifyContact = {
    first_name: customer.first_name || "",
    last_name: customer.last_name || "",
    email: customer.email || "",
    phone: customer.phone || defaultAddress.phone || "",
    mobile: customer.phone || "",
    // Dirección por defecto
    address: defaultAddress.address1 || "",
    address_2: defaultAddress.address2 || "",
    city: defaultAddress.city || "",
    state: defaultAddress.province || "",
    postal_code: defaultAddress.zip || "",
    country: defaultAddress.country_code || defaultAddress.country || "",
    // Empresa si está disponible
    taxpayer_identification_number: defaultAddress.company || "",
  };

  if( customer.id ) {
    ClientifyContact.custom_fields = [
        {
            field:`shopify_customer_id`, value: `${customer.id.toString()}`,

        }
    ];
  }

  return ClientifyContact;
}

/**
 * Sincroniza un customer de Shopify con un contacto de Clientify
 * 
 * @param customer - Customer de Shopify
 * @param apiToken - Token de API de Clientify
 * @returns El contacto sincronizado con su ID
 */
export async function syncShopifyCustomerToClientifyContact(
  customer: any,
  apiToken: string
): Promise<ClientifyContact & { id: number }> {
  const clientifyService = new ClientifyService({ apiToken });
  
  // Mapear customer de Shopify a contacto de Clientify
  const contactData = mapShopifyCustomerToClientifyContact(customer);
  console.log('📤 Datos mapeados para Clientify:', contactData);
  
  // Sincronizar contacto (busca por email y crea o actualiza)
  const contactId = await clientifyService.syncContact(contactData);
  console.log('✅ Resultado de syncContact - ID:', contactId);
  
  const result = {
    ...contactData,
    id: contactId,
  };
  console.log('📦 Resultado final:', result);
  
  return result;
}

export { mapShopifyCustomerToClientifyContact };
