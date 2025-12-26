# Clientify Services

Servicios relacionados con la integración de Clientify.

## Archivos

### `clientify.server.ts`
Cliente HTTP para la API de Clientify. Maneja todas las peticiones a la API.

**Exports:**
- `ClientifyService` - Clase principal con métodos para contacts, products, deals, etc.
- Types: `ClientifyContact`, `ClientifyProduct`, `ClientifyDeal`, etc.

### `clientify-mapper.server.ts`
Funciones de mapeo entre modelos de Shopify y Clientify.

**Exports:**
- `mapShopifyOrderToClientifyContact()` - Convierte customer de Shopify a contact de Clientify
- `mapShopifyOrderToClientifyDeal()` - Convierte order de Shopify a deal de Clientify  
- `mapLineItemsToClientifyDealItems()` - Convierte line items a deal items

### `sync-customer-to-clientify.server.ts`
Sincroniza clientes de Shopify con Clientify.

**Exports:**
- `syncShopifyCustomerToClientifyContact()` - Busca o crea un contacto en Clientify

### `sync-products-to-clientify.server.ts`
Sincroniza productos de Shopify con Clientify.

**Exports:**
- `syncShopifyLineItemsToClientifyProducts()` - Sincroniza line items como productos

### `sync-deal-to-clientify.server.ts`
Sincroniza deals (oportunidades) de Shopify con Clientify.

**Exports:**
- `syncShopifyDealToClientify()` - Crea o actualiza un deal en Clientify

### `sync-order-to-clientify.server.ts`
Orquesta la sincronización completa de una orden (customer + products + deal).

**Exports:**
- `syncShopifyOrderToClientify()` - Sincroniza una orden completa con Clientify

## Flujo de sincronización

```
syncShopifyOrderToClientify()
  ├─> syncShopifyCustomerToClientifyContact() → Crea/actualiza contacto
  ├─> syncShopifyLineItemsToClientifyProducts() → Crea/actualiza productos  
  └─> syncShopifyDealToClientify() → Crea deal vinculado al contacto
```
