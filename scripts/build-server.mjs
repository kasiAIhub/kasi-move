import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
await build({ entryPoints: ['src/server/worker.ts'], outfile: 'dist/server/index.js', bundle: true,
  // Workers provide Web Crypto; honour browser fallbacks instead of bundling Node crypto.
  platform: 'browser', target: 'es2022', format: 'esm',
  define: { APP_HTML: JSON.stringify(await readFile('dist/client/index.html', 'utf8')) },
});
