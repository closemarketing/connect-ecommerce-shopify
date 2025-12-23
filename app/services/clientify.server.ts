const CLIENTIFY_API_URL = "https://api.clientify.net/v1";

interface ClientifyConfig {
  apiToken: string;
}

interface ClientifyContact {
  id?: number;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  mobile?: string;
  address?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  taxpayer_identification_number?: string;
  custom_fields?: Record<string, any>;
}

interface ClientifyProduct {
  id?: number;
  sku: string;
  name: string;
  description?: string;
  price: number;
  owner?: number;
  custom_fields?: Record<string, any>;
}

interface ClientifyDeal {
  id?: number;
  name: string;
  contact_id: number;
  owner?: number;
  amount?: number;
  currency?: string;
  description?: string;
  items?: Array<{
    product_id: number;
    quantity: number;
    price: number;
  }>;
  custom_fields?: Record<string, any>;
}

interface ClientifyAccountInfo {
  user_id: number;
  name: string;
  email: string;
  username?: string;
  company?: string;
  timezone?: string;
  language?: string;
  [key: string]: any;
}

export class ClientifyService {
  private apiToken: string;

  constructor(config: ClientifyConfig) {
    this.apiToken = config.apiToken;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${CLIENTIFY_API_URL}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        "Authorization": `Token ${this.apiToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Clientify API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  // ==================== CUENTA ====================
  
  /**
   * Obtiene información de la cuenta de Clientify
   */
  async getAccountInfo(): Promise<ClientifyAccountInfo> {
    console.log('📋 Obteniendo información de la cuenta de Clientify...');
    const accountInfo = await this.request('/me');
    console.log(`✅ Cuenta: ${accountInfo.name} (${accountInfo.email})`);
    return accountInfo;
  }

  // ==================== CONTACTOS ====================
  
  /**
   * Busca un contacto por custom field shopify_id
   */
  private async findContactByShopifyId(shopifyId: string): Promise<ClientifyContact | null> {
    try {
      const response = await this.request(`/contacts/?in_shopify=${shopifyId}`);
      console.log("RESPONSE CLIENTIFY", response);
      throw new Error("TESTING ERROR LOG");
      return response.results?.[0] || null;
    } catch (error) {
      console.error("Error buscando contacto por Shopify ID:", error);
      return null;
    }
  }

  /**
   * Busca un contacto por NIF
   */
  private async findContactByNif(nif: string): Promise<ClientifyContact | null> {
    if (!nif) return null;
    try {
      const response = await this.request(`/contacts/?taxpayer_identification_number=${encodeURIComponent(nif)}`);
      return response.results?.[0] || null;
    } catch (error) {
      console.error("Error buscando contacto por NIF:", error);
      return null;
    }
  }

  /**
   * Busca un contacto por email
   */
  async findContactByEmail(email: string): Promise<ClientifyContact | null> {
    if (!email) return null;
    try {
      const response = await this.request(`/contacts/?email=${encodeURIComponent(email)}`);
      return response.results?.[0] || null;
    } catch (error) {
      console.error("Error buscando contacto por email:", error);
      return null;
    }
  }

  /**
   * Sincroniza un contacto: busca por shopify_id, NIF, email o crea uno nuevo
   */
  async syncContact(contactData: ClientifyContact): Promise<number> {
    const shopifyId = contactData.custom_fields?.shopify_customer_id;
    // 1. Buscar por Shopify ID
    let existingContact = await this.findContactByShopifyId(shopifyId);
    
    // 3. Si no existe, buscar por email
    if (!existingContact && contactData.email) {
      existingContact = await this.findContactByEmail(contactData.email);
    }

    // 4. Actualizar o crear
    if (existingContact) {
      console.log(`✅ Contacto encontrado en Clientify (ID: ${existingContact.id}), actualizando...`);
      await this.request(`/contacts/${existingContact.id}/`, {
        method: "PUT",
        body: JSON.stringify(contactData),
      });
      return existingContact.id!;
    } else {
      console.log(`📦 Creando nuevo contacto en Clientify...`);
      const newContact = await this.request(`/contacts/`, {
        method: "POST",
        body: JSON.stringify(contactData),
      });
      console.log(`✅ Contacto creado con ID: ${newContact.id}`);
      return newContact.id;
    }
  }

  // ==================== PRODUCTOS ====================
  
  /**
   * Busca un producto por custom field shopify_product_id
   */
  private async findProductByShopifyId(shopifyId: string): Promise<ClientifyProduct | null> {
    try {
      const response = await this.request(`/products/?custom_fields__shopify_product_id=${shopifyId}`);
      return response.results?.[0] || null;
    } catch (error) {
      console.error("Error buscando producto por Shopify ID:", error);
      return null;
    }
  }

  /**
   * Busca un producto por SKU
   */
  private async findProductBySku(sku: string): Promise<ClientifyProduct | null> {
    if (!sku) return null;
    try {
      const response = await this.request(`/products/?sku=${encodeURIComponent(sku)}`);
      return response.results?.[0] || null;
    } catch (error) {
      console.error("Error buscando producto por SKU:", error);
      return null;
    }
  }

  /**
   * Sincroniza un producto: busca por shopify_id, SKU o crea uno nuevo
   */
  async syncProduct(productData: ClientifyProduct): Promise<number> {
    const shopifyId = productData.custom_fields?.shopify_product_id;
    
    // 1. Buscar por Shopify ID
    let existingProduct = await this.findProductByShopifyId(shopifyId);
    
    // 2. Si no existe, buscar por SKU
    if (!existingProduct && productData.sku) {
      existingProduct = await this.findProductBySku(productData.sku);
    }

    // 3. Actualizar o crear
    if (existingProduct) {
      console.log(`✅ Producto encontrado en Clientify (ID: ${existingProduct.id}), actualizando...`);
      
      // Crear copia de productData sin el SKU para actualización
      const { sku, ...productDataWithoutSku } = productData;
      
      await this.request(`/products/${existingProduct.id}/`, {
        method: "PUT",
        body: JSON.stringify(productDataWithoutSku),
      });
      return existingProduct.id!;
    } else {
      console.log(`📦 Creando nuevo producto en Clientify...`);
      const newProduct = await this.request(`/products/`, {
        method: "POST",
        body: JSON.stringify(productData),
      });
      console.log(`✅ Producto creado con ID: ${newProduct.id}`);
      return newProduct.id;
    }
  }

  // ==================== OPORTUNIDADES ====================
  
  /**
   * Busca una oportunidad por ID de pedido de Shopify
   */
  private async findDealByShopifyOrderId(shopifyOrderId: string): Promise<ClientifyDeal | null> {
    if (!shopifyOrderId) return null;
    try {
      const response = await this.request(`/deals/?query=${encodeURIComponent(shopifyOrderId)}`);
      return response.results?.[0] || null;
    } catch (error) {
      console.error("Error buscando deal por Shopify Order ID:", error);
      return null;
    }
  }

  /**
   * Sincroniza una oportunidad: busca por shopify_order_id o crea una nueva
   */
  async syncDeal(dealData: ClientifyDeal): Promise<number> {
    const shopifyOrderId = dealData.custom_fields?.shopify_order_id;
    
    // 1. Buscar por Shopify Order ID
    let existingDeal = await this.findDealByShopifyOrderId(shopifyOrderId);

    // 2. Actualizar o crear
    if (existingDeal) {
      console.log(`✅ Deal encontrado en Clientify (ID: ${existingDeal.id}), actualizando...`);
      await this.request(`/deals/${existingDeal.id}/`, {
        method: "PUT",
        body: JSON.stringify(dealData),
      });
      return existingDeal.id!;
    } else {
      console.log(`📦 Creando nuevo deal en Clientify...`);
      const newDeal = await this.request(`/deals/`, {
        method: "POST",
        body: JSON.stringify(dealData),
      });
      console.log(`✅ Deal creado con ID: ${newDeal.id}`);
      return newDeal.id;
    }
  }

  /**
   * Crea una oportunidad ganada con productos asociados
   * @deprecated Usa syncDeal en su lugar
   */
  async createDeal(dealData: ClientifyDeal): Promise<number> {
    console.log(`📦 Creando oportunidad en Clientify...`);
    const newDeal = await this.request(`/deals/`, {
      method: "POST",
      body: JSON.stringify(dealData),
    });
    console.log(`✅ Oportunidad creada con ID: ${newDeal.id}`);
    return newDeal.id;
  }
}

export type { ClientifyContact, ClientifyProduct, ClientifyDeal, ClientifyAccountInfo };
