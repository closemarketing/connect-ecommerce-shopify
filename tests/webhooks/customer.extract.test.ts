import { describe, it, expect } from 'vitest';
import { mockShopifyOrder } from '../fixtures/shopify-order.mock';

describe('Customer Extract from Shopify Order', () => {
  it('debería extraer el customer de la order correctamente', () => {
    // Extraer el customer de la order
    const { customer } = mockShopifyOrder;
    
    // Verificar que el customer existe
    expect(customer).toBeDefined();
    expect(customer).not.toBeNull();
  });

  it('debería tener todos los campos básicos del customer', () => {
    const { customer } = mockShopifyOrder;
    
    // Campos identificadores
    expect(customer.id).toBe(7112096006387);
    expect(customer.admin_graphql_api_id).toBe('gid://shopify/Customer/7112096006387');
    
    // Información personal
    expect(customer.first_name).toBe('Juan');
    expect(customer.last_name).toBe('Pérez García');
    expect(customer.email).toBe('juan.perez@example.com');
    expect(customer.phone).toBe('+34612345678');
    
    // Estado y verificación
    expect(customer.state).toBe('enabled');
    expect(customer.verified_email).toBe(true);
  });

  it('debería tener campos de marketing correctamente configurados', () => {
    const { customer } = mockShopifyOrder;
    
    // Marketing
    expect(customer.accepts_marketing).toBe(false);
    expect(customer.accepts_marketing_updated_at).toBe('2025-12-20T15:20:00-05:00');
    expect(customer.marketing_opt_in_level).toBeNull();
    
    // Email marketing consent
    expect(customer.email_marketing_consent).toBeDefined();
    expect(customer.email_marketing_consent.state).toBe('not_subscribed');
    expect(customer.email_marketing_consent.opt_in_level).toBe('single_opt_in');
    expect(customer.email_marketing_consent.consent_updated_at).toBeNull();
    
    // SMS marketing consent
    expect(customer.sms_marketing_consent).toBeNull();
  });

  it('debería tener campos de fecha correctos', () => {
    const { customer } = mockShopifyOrder;
    
    expect(customer.created_at).toBe('2025-12-20T15:20:00-05:00');
    expect(customer.updated_at).toBe('2025-12-21T10:30:00-05:00');
  });

  it('debería tener campos fiscales y de moneda', () => {
    const { customer } = mockShopifyOrder;
    
    expect(customer.tax_exempt).toBe(false);
    expect(customer.tax_exemptions).toEqual([]);
    expect(customer.currency).toBe('EUR');
  });

  it('debería tener campos opcionales correctos', () => {
    const { customer } = mockShopifyOrder;
    
    expect(customer.note).toBeNull();
    expect(customer.multipass_identifier).toBeNull();
    expect(customer.tags).toBe('');
  });

  it('debería tener una dirección por defecto completa', () => {
    const { customer } = mockShopifyOrder;
    
    expect(customer.default_address).toBeDefined();
    expect(customer.default_address).not.toBeNull();
    
    const address = customer.default_address;
    
    // IDs y referencias
    expect(address.id).toBe(8976543210123);
    expect(address.customer_id).toBe(7112096006387);
    expect(address.default).toBe(true);
    
    // Información personal
    expect(address.first_name).toBe('Juan');
    expect(address.last_name).toBe('Pérez García');
    expect(address.name).toBe('Juan Pérez García');
    expect(address.company).toBe('Mi Empresa SL');
    
    // Dirección
    expect(address.address1).toBe('Calle Mayor 123');
    expect(address.address2).toBe('Piso 3, Puerta B');
    expect(address.city).toBe('Madrid');
    expect(address.province).toBe('Madrid');
    expect(address.province_code).toBe('M');
    expect(address.zip).toBe('28001');
    
    // País
    expect(address.country).toBe('Spain');
    expect(address.country_code).toBe('ES');
    expect(address.country_name).toBe('Spain');
    
    // Contacto
    expect(address.phone).toBe('+34612345678');
  });

  it('debería poder extraer todos los datos del customer en un objeto estructurado', () => {
    const { customer } = mockShopifyOrder;
    
    const customerData = {
      // Identificación
      id: customer.id,
      admin_graphql_api_id: customer.admin_graphql_api_id,
      
      // Información personal
      first_name: customer.first_name,
      last_name: customer.last_name,
      email: customer.email,
      phone: customer.phone,
      
      // Estado
      state: customer.state,
      verified_email: customer.verified_email,
      
      // Marketing
      accepts_marketing: customer.accepts_marketing,
      email_marketing_consent: customer.email_marketing_consent,
      sms_marketing_consent: customer.sms_marketing_consent,
      
      // Fiscal
      tax_exempt: customer.tax_exempt,
      tax_exemptions: customer.tax_exemptions,
      
      // Otros
      currency: customer.currency,
      tags: customer.tags,
      note: customer.note,
      
      // Fechas
      created_at: customer.created_at,
      updated_at: customer.updated_at,
      
      // Dirección
      default_address: customer.default_address,
    };
    
    // Verificar que todos los campos se extrajeron correctamente
    expect(customerData.id).toBe(7112096006387);
    expect(customerData.first_name).toBe('Juan');
    expect(customerData.last_name).toBe('Pérez García');
    expect(customerData.email).toBe('juan.perez@example.com');
    expect(customerData.phone).toBe('+34612345678');
    expect(customerData.state).toBe('enabled');
    expect(customerData.verified_email).toBe(true);
    expect(customerData.currency).toBe('EUR');
    expect(customerData.default_address).toBeDefined();
    expect(customerData.default_address.city).toBe('Madrid');
  });

  it('debería validar que el email del customer coincide con el email de la order', () => {
    const { customer, email } = mockShopifyOrder;
    
    expect(customer.email).toBe(email);
    expect(customer.email).toBe('juan.perez@example.com');
  });
});
