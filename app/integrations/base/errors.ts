/**
 * Errores personalizados para integraciones
 */

export class IntegrationError extends Error {
	constructor(
		message: string,
		public integrationName: string,
		public originalError?: Error
	) {
		super(message);
		this.name = 'IntegrationError';
	}
}

export class CredentialsError extends IntegrationError {
	constructor(integrationName: string, message: string = 'Invalid credentials') {
		super(message, integrationName);
		this.name = 'CredentialsError';
	}
}

export class SyncError extends IntegrationError {
	constructor(
		integrationName: string,
		public syncType: string,
		message: string,
		originalError?: Error
	) {
		super(message, integrationName, originalError);
		this.name = 'SyncError';
	}
}

export class APIError extends IntegrationError {
	constructor(
		integrationName: string,
		public statusCode: number,
		message: string
	) {
		super(message, integrationName);
		this.name = 'APIError';
	}
}
