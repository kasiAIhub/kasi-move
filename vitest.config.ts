import { defineConfig } from 'vitest/config';
// V3 explicitly supersedes the original fee and unrestricted-role acceptance model.
// Historical test files remain in the repository as documentation of that model.
export default defineConfig({ test: { include: ['tests/v3*.test.ts'], environment: 'node' } });
