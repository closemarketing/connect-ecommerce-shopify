# Comandos Útiles del Proyecto - connect-ecommerce-shopify

## 🚀 Desarrollo

### Iniciar la aplicación
```bash
npm run dev
# O directamente:
shopify app dev
```
Inicia el servidor de desarrollo de Shopify con hot-reload. Incluye:
- React Router dev server
- Cloudflare tunnel
- GraphiQL server
- Proxy server

### Comandos interactivos durante desarrollo
Una vez que `npm run dev` está corriendo, puedes usar:
- **(p)** - Abrir preview en el navegador
- **(g)** - Abrir GraphiQL en el navegador
- **(d)** - Ver estado de desarrollo
- **(a)** - Ver información de la app
- **(s)** - Ver información de la tienda
- **(q)** - Salir

### Reiniciar servidor con reset
```bash
npm run dev -- --reset
# O directamente:
shopify app dev --reset
```
Reinicia la configuración de la app (borra configuración local y vuelve a preguntar por tienda, etc.)

### Especificar puerto de GraphiQL
```bash
shopify app dev --graphiql-port 3457
```
Usa un puerto específico para GraphiQL en lugar de uno aleatorio.

### Ver información de la app
```bash
shopify app info
```
Muestra información detallada de la app configurada (nombre, ID, organización, URLs, etc.)

### Ver versiones de las herramientas
```bash
shopify version
```
Muestra la versión del CLI de Shopify instalado.

---

## 🗄️ Base de Datos (Prisma)

### Generar cliente de Prisma
```bash
npx prisma generate
```
Genera el cliente de Prisma después de cambios en el schema.

### Crear migración
```bash
.\node_modules\.bin\prisma migrate dev --name nombre-de-la-migracion
```
Crea y aplica una nueva migración. Usar `.\node_modules\.bin\prisma` en lugar de
`npx prisma` en Node 20 para evitar que npx resuelva Prisma v7 (requiere Node ≥ 22).

### Aplicar migraciones (producción)
```bash
.\node_modules\.bin\prisma migrate deploy
.\node_modules\.bin\prisma generate
```
Aplica migraciones pendientes y regenera el cliente. Usar siempre estos dos
comandos juntos en producción (ver también `npm run docker-start`).

### Resetear base de datos
```bash
npx prisma migrate reset
```
⚠️ **CUIDADO:** Elimina todos los datos y reaplica todas las migraciones.

### Abrir Prisma Studio
```bash
npm run prisma studio
```
Abre interfaz web en http://localhost:5555 para ver/editar datos de la BD.

### Ver estado de migraciones
```bash
npx prisma migrate status
```
Muestra qué migraciones están aplicadas o pendientes.

### Formatear schema.prisma
```bash
npx prisma format
```
Formatea el archivo schema.prisma automáticamente.

---

## 🔗 Gestión de Integraciones

### Poblar integraciones disponibles en la BD
```bash
node prisma/seed.js
```
Inserta o actualiza las filas de `Integration` (clientify, holded, …).
Ejecutar siempre que se añada una nueva integración al seed.

### Añadir una nueva integración — checklist

```
1. app/services/integrations/registry.server.ts
   → añadir entrada en INTEGRATION_REGISTRY (metadatos UI: nombre, icono, campos)

2. app/services/erp/<name>/<name>.controller.ts
   → implementar ERPController: syncOrderToERP() y processWebhook()

3. app/services/integrations/dispatcher.server.ts
   → añadir factory en CONTROLLER_FACTORIES: { name: (creds) => new Controller(creds) }

4. prisma/seed.js
   → añadir { name: "slug", displayName: "Nombre" } en INTEGRATIONS[]
   → ejecutar:  node prisma/seed.js
```

Ver documentación completa: `docs/PROJECT.md#cómo-añadir-una-nueva-integración`

### Crear migración para cambios en el schema
```bash
.\node_modules\.bin\prisma migrate dev --name descripcion-del-cambio
.\node_modules\.bin\prisma generate
```

---

## 🏗️ Build y Producción

### Construir para producción
```bash
npm run build
```
Compila la aplicación para producción.

### Iniciar servidor de producción
```bash
npm run start
```
Inicia el servidor de producción (requiere build previo).

### Setup completo (Docker)
```bash
npm run docker-start
```
Ejecuta setup completo: genera Prisma y aplica migraciones, luego inicia servidor.

---

## 📦 Shopify CLI

### Inicializar nuevo proyecto
```bash
shopify app init
```
Crea un nuevo proyecto de app de Shopify desde cero.

### Generar extensiones/componentes
```bash
npm run generate
# O directamente:
shopify app generate
```
Genera nuevas extensiones usando el CLI de Shopify (theme extension, function, etc.)

### Desplegar app
```bash
npm run deploy
# O directamente:
shopify app deploy
```
Despliega la aplicación a Shopify.

### Configurar app
```bash
npm run config:link
# O directamente:
shopify app config link
```
Vincula la app local con una app de Shopify existente.

```bash
npm run config:use
# O directamente:
shopify app config use
```
Cambia la configuración activa de la app.

### Variables de entorno
```bash
npm run env
# O directamente:
shopify app env
```
Administra variables de entorno de la app.

```bash
shopify app env show
```
Muestra las variables de entorno actuales.

```bash
shopify app env pull
```
Descarga variables de entorno desde Shopify Partners.

### Versiones y extensiones
```bash
shopify app versions list
```
Lista todas las versiones de la app.

```bash
shopify app release --version [VERSION]
```
Publica una versión específica de la app.

### Webhook testing
```bash
shopify app webhook trigger --topic [TOPIC]
```
Dispara un webhook de prueba (ej: `products/create`, `orders/create`)

### Shopify CLI directo
```bash
npm run shopify [comando]
# O directamente:
shopify [comando]
```
Ejecuta cualquier comando de Shopify CLI.

### Comandos de autenticación
```bash
shopify auth logout
```
Cierra sesión de Shopify CLI.

```bash
shopify logout
```
Cierra sesión de todas las cuentas.

---

## 🧪 Testing y Calidad

### Linter
```bash
npm run lint
```
Ejecuta ESLint para verificar código.

### Type checking
```bash
npm run typecheck
```
Verifica tipos de TypeScript sin compilar.

---

## 🔧 Otras Herramientas

### GraphQL Code Generator
```bash
npm run graphql-codegen
```
Genera tipos de TypeScript desde queries GraphQL.

### Vite
```bash
npm run vite
```
Ejecuta comandos de Vite directamente.

---

## 🐛 Solución de Problemas

### Error de permisos en Prisma (Windows)
```bash
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
npx prisma generate
```
Cierra procesos de Node que bloquean archivos de Prisma.

### Limpiar y regenerar todo
```bash
# 1. Detener todos los servidores
# 2. Eliminar node_modules
Remove-Item -Recurse -Force node_modules

# 3. Reinstalar dependencias
npm install

# 4. Regenerar Prisma
npx prisma generate

# 5. Aplicar migraciones
npm run prisma migrate dev
```

### Resetear configuración de la app
```bash
npm run dev -- --reset
```
Reinicia la configuración de la app durante desarrollo.

---

## 📝 Dependencias clave del proyecto

- `@shopify/shopify-app-react-router` — SDK Shopify para React Router v7
- `@prisma/client` + `prisma` — ORM + migraciones
- `react-router` — Framework SSR
- `winston` — Logging estructurado
- `zod` — Validación de esquemas
- `vitest` — Testing

### Instalar nueva dependencia
```bash
npm install [paquete]
```

### Instalar dependencia de desarrollo
```bash
npm install -D [paquete]
```

---

## 🌐 URLs Importantes

Una vez que `npm run dev` esté corriendo:

- **Preview de la app:** Se muestra en la terminal
- **GraphiQL:** http://localhost:3457/graphiql (puerto puede variar)
- **Prisma Studio:** http://localhost:5555 (cuando se ejecuta `npm run prisma studio`)
- **Cloudflare Tunnel:** Se muestra en la terminal (cambia en cada inicio)

---

## 📚 Comandos de Referencia Rápida

```bash
# Desarrollo diario
npm run dev                                       # Iniciar desarrollo
shopify app dev --reset                           # Reiniciar con reset de config
npm run prisma studio                             # Ver base de datos en el navegador

# Base de datos
.\node_modules\.bin\prisma migrate dev --name x  # Nueva migración
.\node_modules\.bin\prisma generate               # Regenerar cliente
.\node_modules\.bin\prisma migrate deploy         # Aplicar en producción
node prisma/seed.js                               # Insertar/actualizar integraciones

# Shopify CLI
shopify app info                                  # Info de la app
shopify app generate                              # Generar extensión
shopify app webhook trigger                       # Probar webhooks
shopify app env show                              # Ver variables de entorno
shopify version                                   # Versión del CLI

# Build y despliegue
npm run build                                     # Compilar
npm run deploy                                    # Desplegar

# Calidad de código
npm run lint                                      # Verificar código
npm run typecheck                                 # Verificar tipos TypeScript
```

---

## 🔐 Variables de Entorno

Las variables de entorno se gestionan automáticamente por Shopify CLI, pero puedes verificarlas:

```bash
npm run env show
```

Variables importantes:
- `SHOPIFY_APP_URL` - URL de la app (usada para generar QR codes)
- `DATABASE_URL` - Conexión a base de datos (SQLite por defecto)
- `SHOPIFY_API_KEY` - API key de la app
- `SHOPIFY_API_SECRET` - Secret de la app

---

## 📖 Documentación

- [Shopify Apps](https://shopify.dev/docs/apps)
- [React Router](https://reactrouter.com/)
- [Prisma](https://www.prisma.io/docs)
- [Polaris Web Components](https://shopify.dev/docs/api/app-home/polaris-web-components)
- [GraphQL Admin API](https://shopify.dev/docs/api/admin-graphql)
