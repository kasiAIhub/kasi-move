import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { localApi } from './scripts/local-api';
export default defineConfig(({ mode }) => ({ plugins: [react(), tailwindcss(), localApi({ ...loadEnv(mode, process.cwd(), ''), ...process.env } as Record<string, string>)], build: { outDir: 'dist/client' } }));
