# Tests - Shopify Clientify App

## 📋 Descripción

Este directorio contiene los tests automatizados para la aplicación de sincronización de Shopify con Clientify CRM.

## 🚀 Ejecutar Tests

```bash
# Ejecutar todos los tests
npm test

# Ejecutar tests en modo single-run (sin watch)
npm run test:run

# Ejecutar tests con interfaz visual
npm run test:ui

# Ejecutar un test específico
npm test customer.integration.test.ts
```

## ⚙️ Configuración de Tests de Integración

Los tests de integración hacen llamadas reales a Clientify. Para ejecutarlos:

1. **Crea un archivo `.env.test`** (basado en `.env.test.example`):
```bash
TEST_SHOP_DOMAIN=tu-shop-de-prueba.myshopify.com
```

2. **Asegúrate de que el shop de prueba tenga credenciales de Clientify** configuradas en la base de datos

3. Los tests buscarán automáticamente el API key de Clientify para ese shop

## 📁 Estructura

```
tests/
├── setup.ts                                  # Configuración global de tests
├── fixtures/                                 # Datos de prueba
│   └── shopify-order.mock.ts               # Mock de pedido de Shopify
└── webhooks/                                 # Tests de webhooks
    ├── orders.create.test.ts                # Test del webhook orders/create
    ├── customer.extract.test.ts             # Test de extracción de customer
    └── customer.integration.test.ts         # Test de integración con Clientify
```

## 🧪 Tests Implementados

### Webhook orders/create

Tests que verifican el procesamiento completo de un pedido de Shopify:

#### ✅ Estructura del Pedido
- Verifica que el pedido de Shopify tenga la estructura correcta
- Valida ID, número de pedido y email

#### ✅ Datos del Cliente
- Verifica que los datos del cliente estén completos
- Valida: ID, email, nombre, apellido, teléfono

#### ✅ Dirección de Facturación
- Verifica dirección completa con todos los campos
- Valida: nombre, empresa, dirección, ciudad, código postal, país, teléfono

#### ✅ Líneas de Productos
- Verifica que haya productos en el pedido

### Customer Extract

Tests que verifican la extracción del customer desde la order de Shopify:

#### ✅ Extracción de Customer
- Verifica que el customer se extrae correctamente
- Valida todos los campos: ID, nombre, email, teléfono
- Valida campos de marketing y preferencias
- Valida dirección por defecto completa

### Customer Integration (Clientify)

Tests de integración reales con Clientify:

#### ✅ Sincronización Real
- Sincroniza un customer de Shopify con Clientify
- Verifica que devuelve un ID válido de Clientify
- Valida el mapeo de datos al formato de Clientify
- Verifica actualización cuando el contacto ya existe
- Valida campos personalizados (custom_fields)
- Valida: product_id, SKU, título, cantidad, precio, vendor

#### ✅ Totales del Pedido
- Verifica cálculos correctos
- Valida: subtotal, impuestos, total, moneda, estado de pago

#### ✅ Mapeo a Clientify

**Contacto:**
- Extracción de datos del cliente para crear contacto en Clientify
- Valida campos: nombre, apellido, email, teléfono, empresa, dirección
- Verifica custom_field shopify_id

**Productos:**
- Extracción de productos para sincronizar con Clientify
- Valida: nombre, referencia (SKU), precio
- Verifica custom_field shopify_id por producto

**Oportunidad (Deal):**
- Extracción de datos para crear oportunidad ganada
- Valida: nombre del deal, monto total, estado "won", moneda
- Verifica items del pedido con cantidades y precios unitarios

#### ✅ Integración Completa
- Verifica que todos los datos necesarios estén presentes
- Valida el flujo completo: contacto → productos → oportunidad

## 📝 Mock de Pedido

El archivo `shopify-order.mock.ts` contiene un ejemplo completo y realista de un pedido de Shopify con:

- **Cliente:** Juan Pérez García (juan.perez@example.com)
- **Empresa:** Mi Empresa SL
- **Dirección:** Madrid, España
- **Productos:**
  - 2x Portátil Lenovo ThinkPad (€899.99 c/u)
  - 1x Mouse Logitech MX Master 3 (€99.99)
- **Total:** €238.47 (IVA incluido)
- **Estado:** Pagado

Este mock se basa en la estructura oficial de la API de Shopify y contiene todos los campos necesarios para la sincronización con Clientify.

## 🔄 Flujo de Sincronización Testeado

```
Webhook Shopify (orders/create)
    ↓
1. Guardar pedido en BD local
    ↓
2. Buscar credenciales de Clientify
    ↓
3. Sincronizar Contacto
   - Buscar por shopify_id → NIF → email
   - Crear o actualizar
    ↓
4. Sincronizar Productos
   - Buscar por shopify_id → SKU
   - Crear o actualizar cada producto
    ↓
5. Crear Oportunidad Ganada
   - Asociar al contacto
   - Incluir items con cantidades
   - Marcar como "won"
```

## 📚 Tecnologías

- **Vitest** - Framework de testing rápido y moderno
- **@vitest/ui** - Interfaz visual para los tests
- **TypeScript** - Tipado estático para mayor seguridad

## 🎯 Próximos Tests

- [ ] Test de validación de API key de Clientify
- [ ] Test de manejo de errores en sincronización
- [ ] Test de actualización de pedidos (orders/updated)
- [ ] Test de cancelación de pedidos (orders/cancelled)
- [ ] Test de reintentos en caso de fallo de API
- [ ] Tests de integración con base de datos real
- [ ] Tests end-to-end con API de Clientify en sandbox

## 📖 Documentación

- [Shopify Order API](https://shopify.dev/docs/api/admin-rest/latest/resources/order)
- [Clientify API](https://developer.clientify.com)
- [Vitest Documentation](https://vitest.dev/)
