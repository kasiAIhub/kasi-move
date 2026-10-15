import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/v21-server.test.ts', 'tests/v3-production.test.ts', 'tests/meta-whatsapp.test.ts', 'tests/invite-input.test.ts', 'tests/directory.test.ts', 'tests/share-text.test.ts'], environment: 'node' } });
