import { metaWhatsApp } from '../src/server/meta-whatsapp';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import type { Plugin } from 'vite';
import { createApi } from '../src/server/api';
import type { Database, Statement } from '../src/server/database';
import { whatsapp } from '../src/server/whatsapp';
import { apiConfiguration } from '../src/server/config';
export function localApi(environment: Record<string, string>): Plugin {
  return { name: 'kasi-shared-api', configureServer(server) {
    const root = resolve(environment.KASI_DATA_DIR || '.local'); mkdirSync(root, { recursive: true });
    const sqlite = new DatabaseSync(join(root, 'orders.sqlite'));
    sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS _local_migrations(name TEXT PRIMARY KEY)');
    for (const filename of readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) {
      if (!sqlite.prepare('SELECT name FROM _local_migrations WHERE name=?').get(filename)) {
        sqlite.exec('BEGIN');
        try { sqlite.exec(readFileSync(join('drizzle', filename), 'utf8')); sqlite.prepare('INSERT INTO _local_migrations(name) VALUES (?)').run(filename); sqlite.exec('COMMIT'); }
        catch (error) { sqlite.exec('ROLLBACK'); throw error; }
      }
    }
    const db: Database = {
      prepare(sql) {
        const make = (args: unknown[]): Statement => ({ bind: (...values) => make(values),
          first: async <T>() => (sqlite.prepare(sql).get(...args as never[]) as T) ?? null,
          all: async <T>() => ({ results: sqlite.prepare(sql).all(...args as never[]) as T[] }),
          run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args as never[]).changes) } }),
        }); return make([]);
      },
      async batch(statements) {
        sqlite.exec('BEGIN');
        try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
        catch (error) { sqlite.exec('ROLLBACK'); throw error; }
      },
    };
    const handler = createApi(db, whatsapp(environment), Date.now, {
      ...apiConfiguration(environment),
      meta: metaWhatsApp(db, environment, job => { void job; }),
      deletePhotos: async stallId => {
        const photosRoot = resolve(root, 'photos'), target = resolve(photosRoot, stallId);
        if (!/^[a-f0-9-]{36}$/.test(stallId) || !target.startsWith(photosRoot + sep)) throw new Error('Invalid photo directory');
        rmSync(target, { recursive: true, force: true });
      },
      upload: async (key, bytes, contentType) => {
        const filename = join(root, 'photos', key); mkdirSync(resolve(filename, '..'), { recursive: true });
        writeFileSync(filename, Buffer.from(bytes)); writeFileSync(`${filename}.type`, contentType);
      },
    });
    server.httpServer?.once('close', () => sqlite.close());
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      if (url.pathname.startsWith('/photos/')) {
        const key = url.pathname.slice(8);
        if (!/^[a-f0-9-]+\/[a-f0-9-]+$/.test(key)) { res.statusCode = 404; res.end(); return; }
        const file = join(root, 'photos', key);
        if (!existsSync(file)) { res.statusCode = 404; res.end(); return; }
        res.setHeader('Content-Type', readFileSync(`${file}.type`, 'utf8')); res.end(readFileSync(file)); return;
      }
      if (!url.pathname.startsWith('/api/')) { next(); return; }
      try {
        const chunks: Buffer[] = []; let length = 0;
        for await (const chunk of req) { length += chunk.length; if (length > 6 * 1024 * 1024) throw new Error('Too large'); chunks.push(Buffer.from(chunk)); }
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
        const response = await handler(new Request(url, { method: req.method, headers,
          body: ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : Buffer.concat(chunks),
        }));
        res.statusCode = response.status; response.headers.forEach((value, key) => { if (key !== 'set-cookie') res.setHeader(key, value); });
        const cookies = response.headers.getSetCookie(); if (cookies.length) res.setHeader('Set-Cookie', cookies);
        if (response.headers.get('content-type') === 'text/event-stream' && response.body) {
          res.flushHeaders(); const reader = response.body.getReader();
          res.on('close', () => { void reader.cancel(); });
          while (!res.destroyed) { const next = await reader.read(); if (next.done) break; res.write(Buffer.from(next.value)); }
          res.end(); return;
        }
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch { res.statusCode = 503; res.end(JSON.stringify({ error: 'The order service could not complete that request.' })); }
    });
  } };
}
