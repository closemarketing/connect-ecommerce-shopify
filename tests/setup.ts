// Setup global test environment
import { beforeAll, afterAll } from 'vitest';

beforeAll(() => {
  // Setup código antes de todos los tests
  process.env.SHOPIFY_API_SECRET = 'test-secret-key';
});

afterAll(() => {
  // Cleanup después de todos los tests
});
