# Plan de Desarrollo - Tutorial Shopify QR Code App con React Router

## Fecha: 21 de Diciembre, 2025

Este documento detalla cada paso del tutorial oficial de Shopify para construir una aplicación de códigos QR usando React Router.

---

## 📋 Resumen del Tutorial

**Objetivo:** Construir una aplicación que genera códigos QR para productos. Cuando se escanea el código QR, lleva al usuario a un checkout con el producto o a la página del producto. La app registra cada escaneo y muestra métricas al usuario.

**Tecnologías:**
- React Router
- Prisma (base de datos)
- Polaris Web Components (UI)
- Shopify App Bridge
- GraphQL Admin API

---

## 📦 Requisitos Previos

### Paquetes a Instalar:
1. ✅ **App Scaffolded** - React Router template (ya existe)
2. ⬜ **qrcode** - Para crear códigos QR
3. ⬜ **@shopify/polaris-icons** - Imágenes placeholder para UI
4. ⬜ **tiny-invariant** - Para manejo de errores en loaders

**Acción:** Instalar los paquetes faltantes con npm

---

## 🗄️ PASO 1: Agregar el Modelo de Datos QR Code a la Base de Datos

### 1.1 Crear la Tabla

**Archivo a modificar:** `prisma/schema.prisma`

**Qué voy a hacer:**
- Agregar el modelo `QRCode` con los siguientes campos:
  - `id` (Int, @id, autoincrement) - Clave primaria
  - `title` (String) - Nombre del QR code especificado por el usuario
  - `shop` (String) - Tienda propietaria del QR code
  - `productId` (String) - ID del producto
  - `productHandle` (String) - Handle para crear URL de destino
  - `productVariantId` (String) - ID de variante para URL de destino
  - `destination` (String) - Destino del QR code
  - `scans` (Int, default: 0) - Número de veces escaneado
  - `createdAt` (DateTime, default: now()) - Fecha de creación

**Código a agregar:**
```prisma
model QRCode {
  id               Int      @id @default(autoincrement())
  title            String
  shop             String
  productId        String
  productHandle    String
  productVariantId String
  destination      String
  scans            Int      @default(0)
  createdAt        DateTime @default(now())
}
```

### 1.2 Migrar la Base de Datos

**Comandos a ejecutar:**
```bash
npm run prisma migrate dev -- --name add-qrcode-table
npm run prisma studio  # Para verificar
```

**Qué voy a hacer:**
- Ejecutar la migración para crear la tabla QRCode en la base de datos
- Abrir Prisma Studio para verificar que la tabla se creó correctamente

---

## 📊 PASO 2: Obtener Datos de QR Code y Producto

### 2.1 Crear el Modelo

**Archivo a crear:** `app/models/QRCode.server.js`

**Qué voy a hacer:**
- Crear carpeta `app/models` si no existe
- Crear archivo para funciones de servidor del modelo QRCode

### 2.2 Obtener QR Codes

**Funciones a crear en `QRCode.server.js`:**

1. **`getQRCode(id, graphql)`**
   - Obtiene un solo QR code por ID usando Prisma FindFirst
   - Suplementa con datos del producto
   - Retorna null si no existe

2. **`getQRCodes(shop, graphql)`**
   - Obtiene múltiples QR codes de una tienda usando Prisma FindMany
   - Ordena por ID descendente
   - Retorna array vacío si no hay códigos
   - Suplementa cada código con datos del producto

### 2.3 Obtener la Imagen del QR Code

**Función a crear:** `getQRCodeImage(id)`
- Construye URL: `/qrcodes/${id}/scan`
- Usa paquete `qrcode` para generar imagen base64
- Retorna dataURL de la imagen

### 2.4 Obtener URL de Destino

**Función a crear:** `getDestinationUrl(qrCode)`
- Si destino es "product": URL a página de producto
- Si destino es "cart": URL a checkout con producto en carrito
- Construye URL condicionalemente según la selección del comerciante

### 2.5 Obtener Datos Adicionales de Producto

**Función a crear:** `supplementQRCode(qrCode, graphql)`
- Consulta GraphQL Admin API para obtener:
  - Título del producto
  - URL e imagen del primer producto destacado
  - Texto alt de la imagen
- Retorna objeto combinado con:
  - Datos del QR code de Prisma
  - Datos del producto de GraphQL
  - Imagen QR usando `getQRCodeImage()`
  - URL destino usando `getDestinationUrl()`

### 2.6 Validar QR Codes

**Función a crear:** `validateQRCode(data)`
- Valida que existan valores para:
  - title
  - productId
  - destination
- Retorna objeto de errores para campos faltantes
- Será usado por la acción del formulario

**Código completo a implementar:** Ver código del tutorial con imports, GraphQL query, y todas las funciones.

---

## 📝 PASO 3: Crear Formulario de QR Code

### 3.1 Configurar la Ruta del Formulario

**Archivo a crear:** `app/routes/app.qrcodes.$id.jsx`

**Qué voy a hacer:**
- Crear formulario que puede crear, actualizar o eliminar QR code
- Usar segmento dinámico:
  - `/app/qrcodes/new` - crear nuevo
  - `/app/qrcodes/1` - editar existente (1 = ID)
- Usar layout de `app/routes/app.jsx` para autenticación

### 3.2 Autenticar el Usuario

**Función loader a crear:**
- Usar `authenticate.admin(request)` de shopify-app-react-router
- Obtener `admin` object para:
  - Información de sesión (shop)
  - Acceso a GraphQL Admin API
- Si `params.id === "new"`: retornar estado inicial vacío
- Si no: retornar datos del QR code con `getQRCode()`

### 3.3 Retornar Respuesta JSON

**En el loader:**
- Para ID "new": `{ destination: "product", title: "" }`
- Para ID existente: datos completos del QR code

### 3.4 Manejar Estado del Formulario

**Variables de estado a crear:**
- `initialFormState` - Estado inicial copiado del loader
- `formState` - Estado actual que cambia con inputs del usuario
- `errors` - Errores de validación de `useActionData()`
- `isSaving` - Estado de red usando `useNavigation()`
- `isDirty` - Detecta si el formulario cambió

### 3.5 Agregar Selector de Producto

**Función a crear:** `selectProduct()`
- Usar App Bridge `ResourcePicker` action
- Abrir modal para seleccionar producto
- Guardar selección en formState

### 3.6 Submit

**Funciones a crear:**
- `handleSave()` - Guardar QR code
- `handleDelete()` - Eliminar QR code (solo si no es nuevo)
- Usar `useSubmit()` de React Router

### 3.7 Layout del Formulario

**Componentes Polaris a usar:**
- `s-page` - Estructura de página
- `s-section` - Secciones
- `s-box` con `slot="aside"` - Columna lateral
- Dos columnas: formulario principal y preview

### 3.8 Breadcrumbs

**Componente a agregar:**
- `s-page` con título dinámico:
  - "Create QR code" para nuevos
  - "Edit QR code" para existentes
- Link breadcrumb para volver a lista

### 3.9 Campo de Título

**Componente a agregar:**
- `s-text-field` para el título
- Actualiza `formState` onChange
- Muestra errores de validación

### 3.10 Selección de Producto

**Componentes a agregar:**
- Si no hay producto: `s-button` para `selectProduct()`
- Si hay producto:
  - `s-image` para imagen del producto
  - `s-clickable` para cambiar producto
  - `s-icon` para icono
  - `s-box` y `s-stack` para layout

### 3.11 Opciones de Destino

**Componentes a agregar:**
- `s-select` con opciones:
  - "Product page" 
  - "Checkout"
- Actualiza `formState` onChange
- `s-link` para vista previa (solo en edición)

### 3.12 Preview del QR Code

**Componentes a agregar:**
- `s-box` con `slot="aside"` para posicionar
- Si existe QR code: `s-image` con la imagen
- Si no existe: `s-text` con color="subdued"
- Botones para:
  - Vista previa de URL pública
  - Descargar QR code

### 3.13 Save Bar

**Componente a agregar:**
- `shopify.saveBar` y `ui-save-bar`
- Botones Save y Discard
- Usar `useSubmit()` para enviar datos
- Limpiar formState después de guardar

### 3.14 Crear, Actualizar o Eliminar QR Code

**Función action a crear:**
- Usar `authenticate.admin(request)` para obtener session
- Obtener datos del formulario
- Si es DELETE: eliminar y redirigir a index
- Si es POST/PUT:
  - Validar con `validateQRCode()`
  - Retornar errores si hay
  - Crear/actualizar en base de datos
  - Redirigir a `/app/qrcodes/$id`

**Código completo:** Ver archivo completo del tutorial con todos los componentes JSX

---

## 📋 PASO 4: Listar QR Codes

### 4.1 Cargar QR Codes

**Archivo a modificar:** `app/routes/app._index.jsx`

**Función loader a crear:**
- Autenticar con `authenticate.admin(request)`
- Obtener QR codes con `getQRCodes(session.shop, admin.graphql)`
- Retornar `{ qrCodes }`

### 4.2 Crear Estado Vacío

**Componente a crear:** `EmptyQRCodeState`
- Usar componentes Polaris:
  - `s-section`
  - `s-grid`
  - `s-box`
  - `s-heading`
  - `s-paragraph`
  - `s-button` - enlace a `/app/qrcodes/new`
- Mostrar cuando no hay QR codes

### 4.3 Crear Tabla Index

**Componente a crear:** Tabla con `s-table`
- Columnas:
  - Título del QR code
  - Producto
  - Fecha de creación
  - Número de escaneos
- Header de título con `listSlot="primary"`

### 4.4 Crear Filas de Tabla

**Componentes a usar:**
- `s-table-row` para cada QR code
- `s-table-cell` para cada columna
- `s-image` para imagen del producto
- `s-text` para texto
- `s-link` para enlaces

### 4.5 Advertir si Producto Eliminado

**Componente a agregar:**
- Verificar propiedad `isDeleted` del QR code
- Si es true: mostrar `s-badge` con advertencia
- `isDeleted` es true cuando el título del producto está vacío en GraphQL

### 4.6 Layout de la Página

**Componentes a usar:**
- `s-page` con título "QR codes"
- Botón primary para crear nuevo QR code
- Renderizar EmptyState o Tabla según haya datos

**Código completo:** Ver archivo completo del tutorial

---

## 🌐 PASO 5: Agregar Ruta Pública de QR Code

### 5.1 Crear Ruta Pública

**Archivo a crear:** `app/routes/qrcodes.$id.jsx`

**Qué voy a hacer:**
- Crear página pública para renderizar QR code
- NO usa autenticación
- NO se renderiza dentro del admin de Shopify
- NO usa el layout app

### 5.2 Cargar el QR Code

**Función loader a crear:**
- Verificar que existe ID en params con `invariant`
- Cargar QR code de Prisma con `db.qRCode.findFirst`
- Si no existe, lanzar error con `invariant`
- Retornar título e imagen del QR code

### 5.3 Renderizar Imagen del QR Code

**Componente default a exportar:**
- Usar `useLoaderData()` para obtener image y title
- Renderizar `<img>` con el QR code
- Escanear esta imagen lleva a la URL de destino

**Código completo:** Ver código del tutorial

---

## 🔄 PASO 6: Redirigir al Cliente a la URL de Destino

### 6.1 Crear Ruta de Escaneo

**Archivo a crear:** `app/routes/qrcodes.$id.scan.jsx`

**Qué voy a hacer:**
- Crear ruta pública que maneja escaneos de QR code

### 6.2 Validar ID del QR Code

**Función loader a crear:**
- Verificar que existe ID con `invariant`
- Cargar QR code de Prisma
- Si no existe, lanzar error con `invariant`

### 6.3 Incrementar Contador de Escaneos

**En el loader:**
- Usar `db.qRCode.update()` para incrementar campo `scans`

### 6.4 Redirigir

**En el loader:**
- Obtener URL destino con `getDestinationUrl(qrCode)`
- Usar `redirect()` para redirigir al usuario
- Retornar el redirect

**Código completo:** Ver código del tutorial

---

## 🧪 PASO 7: Previsualizar y Probar la App

### 7.1 Iniciar Servidor

**Comandos a ejecutar:**
```bash
shopify app dev
```

**Qué voy a hacer:**
- Navegar al directorio de la app
- Ejecutar el comando dev
- Presionar 'p' para abrir consola de desarrollador
- Click en preview link
- Instalar app si se solicita

### 7.2 Probar Index y Formulario de QR Code

**Pruebas a realizar:**

1. **Crear QR code:**
   - Click en "Create QR code"
   - Verificar URL `/app/qrcode/new`
   - Verificar título "Create QR code"

2. **Validación:**
   - Intentar submit sin título
   - Intentar submit sin producto
   - Verificar que se muestran errores

3. **Crear QR codes:**
   - Crear varios QR codes con diferentes productos y destinos
   - Click en breadcrumb "QR codes" para volver

4. **Lista de QR codes:**
   - Verificar que aparecen los códigos creados
   - Click en un QR code
   - Verificar URL `/app/qrcode/<id>`
   - Verificar título "Edit QR code"

5. **Eliminar:**
   - Click en Delete en página de edición
   - Verificar redirección a index
   - Verificar que el QR code se eliminó de la lista

### 7.3 Probar Funcionalidad de Escaneo

**Pruebas a realizar:**

1. Desde index, click en QR code existente
2. En formulario, click "Go to public URL"
3. Se abre nueva pestaña con URL pública
4. Escanear QR code con teléfono
5. Verificar redirección a URL de destino
6. Volver a index
7. Verificar que contador de escaneos incrementó

---

## ✅ Tutorial Completo

### Próximos Pasos Sugeridos:

1. **Webhooks** - Mantenerse sincronizado con Shopify (ej: products/update para actualizar handles)
2. **Explorar GraphQL Admin API** - Aprender sobre tipos y operaciones disponibles
3. **Extender Shopify** - Aprender sobre lugares donde las apps pueden agregar funcionalidad
4. **Distribución** - Decidir cómo compartir la app (App Store, billing, etc.)
5. **Deployment** - Desplegar a ambiente de testing o producción

---

## 📋 Checklist de Implementación

### Preparación:
- [ ] Instalar paquetes: qrcode, @shopify/polaris-icons, tiny-invariant

### Paso 1 - Base de Datos:
- [ ] Modificar schema.prisma con modelo QRCode
- [ ] Ejecutar migración
- [ ] Verificar en Prisma Studio

### Paso 2 - Modelo de Datos:
- [ ] Crear carpeta app/models
- [ ] Crear QRCode.server.js
- [ ] Implementar getQRCode()
- [ ] Implementar getQRCodes()
- [ ] Implementar getQRCodeImage()
- [ ] Implementar getDestinationUrl()
- [ ] Implementar supplementQRCode()
- [ ] Implementar validateQRCode()

### Paso 3 - Formulario:
- [ ] Crear app/routes/app.qrcodes.$id.jsx
- [ ] Implementar loader
- [ ] Implementar action
- [ ] Implementar manejo de estado
- [ ] Implementar selectProduct()
- [ ] Implementar layout con Polaris
- [ ] Implementar todos los componentes del formulario

### Paso 4 - Lista:
- [ ] Modificar app/routes/app._index.jsx
- [ ] Implementar loader
- [ ] Implementar EmptyQRCodeState
- [ ] Implementar tabla de QR codes
- [ ] Implementar layout de página

### Paso 5 - Ruta Pública:
- [ ] Crear app/routes/qrcodes.$id.jsx
- [ ] Implementar loader
- [ ] Implementar componente de renderizado

### Paso 6 - Escaneo:
- [ ] Crear app/routes/qrcodes.$id.scan.jsx
- [ ] Implementar loader con validación
- [ ] Implementar incremento de contador
- [ ] Implementar redirect

### Paso 7 - Pruebas:
- [ ] Ejecutar shopify app dev
- [ ] Probar creación de QR codes
- [ ] Probar validación
- [ ] Probar edición
- [ ] Probar eliminación
- [ ] Probar escaneo
- [ ] Verificar contador de escaneos

---

**Documentación de Referencia:**
- Tutorial completo: https://shopify.dev/docs/apps/build/build?framework=reactRouter
- Repo ejemplo: https://github.com/Shopify/example-app--qr-code--remix/tree/upgrade-to-react-router/
- Polaris Web Components: https://shopify.dev/docs/api/app-home/polaris-web-components
- App Bridge: https://shopify.dev/docs/api/app-bridge
- GraphQL Admin API: https://shopify.dev/docs/api/admin-graphql
