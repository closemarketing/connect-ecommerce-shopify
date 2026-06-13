# Guía de Deploy a Producción - Shopi-Clientify-App

## Requisitos Previos

- ✅ Servidor Linux con MySQL instalado
- ✅ Acceso SSH al servidor
- ✅ Dominio o IP pública del servidor
- ✅ Cuenta Shopify Partner con la app creada

---

## 1. Preparar Base de Datos en el Servidor

### Conectar al servidor por SSH
```bash
ssh usuario@tu-servidor.com
```

### Crear base de datos MySQL
```bash
mysql -u root -p
```

```sql
CREATE DATABASE clientify_shopify CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'shopify_user'@'localhost' IDENTIFIED BY 'tu_password_seguro';
GRANT ALL PRIVILEGES ON clientify_shopify.* TO 'shopify_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### Permitir conexiones remotas (si la app se hostea en Shopify Oxygen)
Editar `/etc/mysql/mysql.conf.d/mysqld.cnf`:
```bash
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
```

Cambiar:
```
bind-address = 127.0.0.1
```
Por:
```
bind-address = 0.0.0.0
```

Reiniciar MySQL:
```bash
sudo systemctl restart mysql
```

Permitir usuario remoto:
```sql
CREATE USER 'shopify_user'@'%' IDENTIFIED BY 'tu_password_seguro';
GRANT ALL PRIVILEGES ON clientify_shopify.* TO 'shopify_user'@'%';
FLUSH PRIVILEGES;
```

### Configurar Firewall
```bash
sudo ufw allow 3306/tcp
sudo ufw reload
```

---

## 2. Aplicar Migraciones de Base de Datos

### Desde tu máquina local, conectar a la BD remota

Crear archivo `.env.production` en tu proyecto:
```env
DATABASE_URL="mysql://shopify_user:tu_password_seguro@tu-servidor.com:3306/clientify_shopify"
SHOPIFY_API_SECRET="706c4e43ddcf166d71ce9b8f13e80c9576e22199a698b22ce12515a0244a6508"
```

### Ejecutar migraciones
```bash
# Cargar variables de producción y aplicar migraciones
npx dotenv -e .env.production -- npx prisma migrate deploy
npx dotenv -e .env.production -- npx prisma generate
```

### Verificar que las tablas se crearon
```bash
mysql -h tu-servidor.com -u shopify_user -p clientify_shopify -e "SHOW TABLES;"
```

Deberías ver:
- Shop
- Session
- Order
- SyncLog
- WebhookLog
- Integration
- IntegrationCredential
- _prisma_migrations

---

## 3. Deploy de la Aplicación con Shopify CLI

### Desde tu máquina local (Windows)

```powershell
# Asegurarte de estar en el directorio del proyecto
cd C:\laragon\www\shopi-clientify-app

# Hacer build de producción
npm run build

# Deploy a Shopify
shopify app deploy
```

El CLI te preguntará:
- **¿Incluir archivos de configuración?** → Sí
- **¿Actualizar webhooks?** → Sí

### Resultado del deploy

Shopify CLI te dará:
- ✅ URL de producción de la app (ej: `https://your-app.shopifyapps.com`)
- ✅ Webhooks registrados automáticamente
- ✅ App lista para instalar en tiendas

---

## 4. Configurar Variables de Entorno en Shopify

La `DATABASE_URL` debe configurarse en Shopify:

```bash
shopify app env show
shopify app env set DATABASE_URL="mysql://shopify_user:tu_password_seguro@tu-servidor.com:3306/clientify_shopify"
```

---

## 5. Actualizar URL de la App (si es necesario)

Si tu app tiene una URL diferente en producción:

1. Ve a [Shopify Partners](https://partners.shopify.com)
2. Apps → Tu app → Configuration
3. Actualiza:
   - **App URL**: URL que te dio Shopify CLI
   - **Allowed redirection URL(s)**: Añade la URL de callback OAuth

---

## 6. Instalar en Tienda de Producción

1. Desde Shopify Partners → Test your app → Select store
2. O comparte el link de instalación con el cliente:
   ```
   https://your-app.shopifyapps.com/auth?shop=nombre-tienda.myshopify.com
   ```

3. Autorizar permisos
4. Configurar credenciales de Clientify en `/app/integrations`

---

## 7. Verificación Post-Deploy

### Verificar webhooks activos
```bash
shopify app webhook list
```

Deberías ver:
- ✅ orders/create
- ✅ orders/updated
- ✅ orders/cancelled
- ✅ app/uninstalled

### Crear pedido de prueba
1. En la tienda de producción, crear un pedido
2. Verificar logs en `/app/webhook-logs`
3. Verificar sincronización en `/app/sync-logs`
4. Verificar en Clientify que se creó el Deal

### Monitorear base de datos
```bash
mysql -h tu-servidor.com -u shopify_user -p clientify_shopify

# Ver últimos webhooks
SELECT id, topic, processed, createdAt FROM WebhookLog ORDER BY createdAt DESC LIMIT 5;

# Ver últimas sincronizaciones
SELECT id, syncType, status, shopifyId, clientifyId, createdAt FROM SyncLog ORDER BY createdAt DESC LIMIT 10;
```

---

## 8. Mantenimiento

### Actualizar la aplicación

Cuando hagas cambios:

```bash
# 1. Hacer cambios en el código
# 2. Si hay cambios en DB, crear migración
npx prisma migrate dev --name descripcion_del_cambio

# 3. Aplicar a producción
npx dotenv -e .env.production -- npx prisma migrate deploy

# 4. Deploy
npm run build
shopify app deploy
```

### Backup de Base de Datos

```bash
# Crear backup
mysqldump -h tu-servidor.com -u shopify_user -p clientify_shopify > backup_$(date +%Y%m%d).sql

# Restaurar backup
mysql -h tu-servidor.com -u shopify_user -p clientify_shopify < backup_20251224.sql
```

### Logs y Debugging

Los logs se almacenan en:
- WebhookLog (base de datos)
- SyncLog (base de datos)
- Consola de Shopify CLI durante `shopify app dev`

Para ver logs en producción, accede a `/app/webhook-logs` y `/app/sync-logs` desde la app.

---

## 9. Seguridad en Producción

### Cambiar credenciales de MySQL
```bash
# En el servidor
mysql -u root -p
ALTER USER 'shopify_user'@'%' IDENTIFIED BY 'nueva_password_muy_segura';
FLUSH PRIVILEGES;
```

Actualizar en Shopify:
```bash
shopify app env set DATABASE_URL="mysql://shopify_user:nueva_password_muy_segura@tu-servidor.com:3306/clientify_shopify"
```

### Validar HMAC de webhooks
Los webhooks ya están configurados para validar HMAC usando `SHOPIFY_API_SECRET`.

---

## Resumen de URLs Importantes

- **Shopify Partners**: https://partners.shopify.com
- **App URL (producción)**: La que te da `shopify app deploy`
- **Servidor MySQL**: `tu-servidor.com:3306`
- **Panel de control**: `https://app-url/app`
- **Logs de Webhooks**: `https://app-url/app/webhook-logs`
- **Logs de Sync**: `https://app-url/app/sync-logs`
- **Integraciones**: `https://app-url/app/integrations`

---

## Troubleshooting

### Error: "Cannot connect to database"
- Verificar que MySQL permite conexiones remotas
- Verificar firewall del servidor (puerto 3306)
- Verificar credenciales en `DATABASE_URL`

### Error: "Webhooks not working"
```bash
shopify app webhook update
```

### Error: "App not loading"
- Verificar que el build se completó: `npm run build`
- Verificar URL de la app en Shopify Partners
- Verificar que la tienda está marcada como `active = true` en la BD

### Tienda inactiva después de reinstalar
La app se reactiva automáticamente al recibir el primer webhook.
O manualmente:
```sql
UPDATE Shop SET active = 1 WHERE domain = 'tienda.myshopify.com';
```

---

## Contacto y Soporte

Para problemas de producción:
1. Revisar `/app/webhook-logs` y `/app/sync-logs`
2. Verificar la base de datos directamente
3. Revisar logs de Shopify CLI con `shopify app logs`
