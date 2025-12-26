# Integrations

Este directorio contiene todas las integraciones con sistemas externos. Cada integración es un módulo autocontenido que sigue el patrón Adapter.

## 📁 Estructura

```
integrations/
├── base/                          # Interfaces y tipos compartidos
│   ├── integration-adapter.server.ts   # Interface base
│   ├── types.ts                        # Tipos compartidos
│   ├── errors.ts                       # Errores tipados
│   └── index.ts
├── clientify/                     # Integración con Clientify CRM
│   ├── clientify-adapter.server.ts     # Implementación del adapter
│   ├── clientify-api.server.ts         # Cliente API HTTP
│   ├── clientify-mapper.server.ts      # Transformaciones de datos
│   ├── sync-order.server.ts            # Sincronización de pedidos
│   ├── sync-customer.server.ts         # Sincronización de clientes
│   ├── sync-product.server.ts          # Sincronización de productos
│   ├── sync-deal.server.ts             # Sincronización de deals
│   ├── pipeline.server.ts              # Gestión de pipelines
│   ├── README.md                       # Documentación específica
│   └── index.ts                        # Exports centralizados
├── agora/                         # Integración con Agora ERP
│   ├── agora-adapter.server.ts         # Implementación del adapter (stub)
│   └── README.md
└── registry.server.ts             # Registro centralizado de adaptadores
```

## 🎯 Patrón Adapter

Todas las integraciones implementan la interface `IntegrationAdapter`:

```typescript
interface IntegrationAdapter {
	// Configuración
	getConfig(): IntegrationConfig;
	getRequiredCredentials(): CredentialField[];
	getSupportedFeatures(): IntegrationFeature[];
	
	// Validación
	validateCredentials(credentials: Record<string, string>): Promise<boolean>;
	
	// Sincronización
	syncCustomer?(customer: any, credentials: Record<string, string>): Promise<SyncResult>;
	syncProduct?(product: any, credentials: Record<string, string>): Promise<SyncResult>;
	syncOrder?(order: any, credentials: Record<string, string>): Promise<SyncResult>;
	
	// Extras (opcionales)
	getPipelines?(credentials: Record<string, string>): Promise<Pipeline[]>;
	getCustomFields?(credentials: Record<string, string>): Promise<CustomField[]>;
}
```

## 🔧 Crear una Nueva Integración

### 1. Crear estructura de archivos

```bash
mkdir app/integrations/nombre-integracion
cd app/integrations/nombre-integracion
```

### 2. Crear adapter

```typescript
// nombre-integracion-adapter.server.ts
import { IntegrationAdapter, SyncResult } from '../base';

export class NombreIntegracionAdapter implements IntegrationAdapter {
	getConfig() {
		return {
			name: 'nombre-integracion',
			displayName: 'Nombre Integración',
			description: 'Descripción de la integración',
			enabled: true,
		};
	}

	getRequiredCredentials() {
		return [
			{
				key: 'apiKey',
				label: 'API Key',
				type: 'password' as const,
				required: true,
				helpText: 'Tu API key de Nombre Integración',
			},
		];
	}

	getSupportedFeatures() {
		return ['SYNC_ORDERS', 'SYNC_CUSTOMERS'];
	}

	async validateCredentials(credentials: Record<string, string>) {
		// Validar credenciales con una llamada a la API
		return true;
	}

	async syncOrder(order: any, credentials: Record<string, string>): Promise<SyncResult> {
		// Implementar sincronización de pedido
		return {
			success: true,
			externalId: '12345',
		};
	}
}
```

### 3. Crear API client

```typescript
// nombre-integracion-api.server.ts
export class NombreIntegracionService {
	private apiKey: string;
	private baseUrl: string;

	constructor(config: { apiKey: string; baseUrl?: string }) {
		this.apiKey = config.apiKey;
		this.baseUrl = config.baseUrl || 'https://api.ejemplo.com';
	}

	async createOrder(orderData: any) {
		// Implementar llamada a API
	}
}
```

### 4. Registrar en registry

```typescript
// integrations/registry.server.ts
import { NombreIntegracionAdapter } from './nombre-integracion/nombre-integracion-adapter.server';

// Agregar al array de adapters
adapters.set('nombre-integracion', new NombreIntegracionAdapter());
```

### 5. Crear seed en base de datos

```javascript
// prisma/seed.js
const nombreIntegracion = await prisma.integration.upsert({
	where: { name: "nombre-integracion" },
	update: {},
	create: {
		id: 3, // Siguiente ID disponible
		name: "nombre-integracion",
		displayName: "Nombre Integración",
		enabled: false, // Empezar deshabilitada
	},
});
```

## 🎨 Buenas Prácticas

### ✅ DO
- ✅ Mantener cada integración en su propia carpeta
- ✅ Implementar todos los métodos requeridos del adapter
- ✅ Usar tipos TypeScript para todo
- ✅ Manejar errores con las clases de error tipadas (`SyncError`, `APIError`, etc.)
- ✅ Documentar campos de credenciales con `helpText`
- ✅ Usar logging para troubleshooting
- ✅ Crear exports centralizados en `index.ts`

### ❌ DON'T
- ❌ No hardcodear credenciales
- ❌ No mezclar código de diferentes integraciones
- ❌ No exponer datos sensibles en logs
- ❌ No omitir validación de credenciales
- ❌ No usar `any` sin tipos

## 🧪 Testing

Cada integración debe tener tests en `tests/integrations/nombre-integracion/`:

```typescript
// tests/integrations/nombre-integracion/sync.test.ts
import { describe, it, expect } from 'vitest';
import { NombreIntegracionAdapter } from '../../../app/integrations/nombre-integracion';

describe('NombreIntegracionAdapter', () => {
	it('should sync order successfully', async () => {
		const adapter = new NombreIntegracionAdapter();
		const result = await adapter.syncOrder(mockOrder, mockCredentials);
		
		expect(result.success).toBe(true);
		expect(result.externalId).toBeDefined();
	});
});
```

## 📚 Recursos

- [Documentación del patrón Adapter](../docs/ADAPTER-PATTERN.md)
- [Guía de sincronización](../docs/SYNC-GUIDE.md)
- [Tipos TypeScript](./base/types.ts)
