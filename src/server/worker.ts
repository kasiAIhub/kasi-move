import { metaWhatsApp } from './meta-whatsapp';
import { createApi } from './api';
import type { Database } from './database';
import { whatsapp, type WhatsAppConfig } from './whatsapp';
import { directoryHtml, directoryJson, listedStall, listedStalls, llmsTxt, robotsTxt, sitemapXml, stallLdTag } from './directory';
import { isShortStallPath } from './slug';
import { apiConfiguration, type Configuration } from './config';
interface Environment extends WhatsAppConfig, Configuration {
  DB: Database;
  PHOTOS?: {
    list(options: {prefix: string; limit: number}): Promise<{objects: {key: string}[]}>;
    delete(keys: string[]): Promise<void>;
    put(key: string, bytes: ArrayBuffer, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
    get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
  };
  ASSETS: { fetch(request: Request): Promise<Response> };
  STALL_PAYMENT_URL?: string;
  STALL_PAYMENT_INSTRUCTIONS?: string;
  ACTIVATION_ADMIN_KEY?: string;
}
declare const APP_HTML: string;
export default {
  async fetch(request: Request, env: Environment, ctx: { waitUntil(job: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(request.url), photos = env.PHOTOS;
    if (request.method === 'GET' && url.hostname === 'example.com' && !url.pathname.startsWith('/api/') && !/\.[a-z0-9]+$/i.test(url.pathname)) {
      url.hostname = 'move.kasiaihub.com';
      return Response.redirect(url.toString(), 302);
    }
    if (request.method === 'GET' && env.DB && ['/directory', '/api/directory', '/sitemap.xml', '/robots.txt', '/llms.txt'].includes(url.pathname)) {
      const origin = url.origin, common = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public,max-age=300' };
      if (url.pathname === '/robots.txt') return new Response(robotsTxt(origin), { headers: { ...common, 'Content-Type': 'text/plain; charset=utf-8' } });
      if (url.pathname === '/llms.txt') return new Response(llmsTxt(origin), { headers: { ...common, 'Content-Type': 'text/plain; charset=utf-8' } });
      let stalls; try { stalls = await listedStalls(env.DB, Date.now()); } catch { return new Response('Directory unavailable', { status: 503 }); }
      if (url.pathname === '/api/directory') return Response.json(directoryJson(stalls, origin, url.searchParams.get('town') ?? undefined), { headers: { ...common, 'Access-Control-Allow-Origin': '*' } });
      if (url.pathname === '/sitemap.xml') return new Response(sitemapXml(stalls, origin), { headers: { ...common, 'Content-Type': 'application/xml; charset=utf-8' } });
      return new Response(directoryHtml(stalls, origin), { headers: { ...common, 'Content-Type': 'text/html; charset=utf-8', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" } });
    }
    if (url.pathname.startsWith('/api/')) {
      if (!env.DB) return Response.json({ error: 'The order service is not available yet.' }, { status: 503 });
      return createApi(env.DB, whatsapp(env), Date.now, {
        ...apiConfiguration(env),
        meta: metaWhatsApp(env.DB, env, job => ctx.waitUntil(job)),
        deletePhotos: !photos ? undefined : async stallId => {
          const prefix = `${stallId}/`;
          for (;;) {
            const page = await photos.list({ prefix, limit: 1000 });
            if (!page.objects.length) break;
            if (page.objects.some(object => !object.key.startsWith(prefix))) throw new Error('Photo scope mismatch');
            await photos.delete(page.objects.map(object => object.key));
          }
        },
        upload: !photos ? undefined : async (key, bytes, contentType) => { await photos.put(key, bytes, { httpMetadata: { contentType } }); },
      })(request);
    }
    if (url.pathname.startsWith('/photos/')) {
      if (!photos) return new Response('Photo not found', { status: 404 });
      const object = await photos.get(url.pathname.slice(8));
      return object ? new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType ?? 'image/jpeg', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public,max-age=31536000,immutable' } }) : new Response('Photo not found', { status: 404 });
    }
    if (env.ASSETS && /\.[a-z0-9]+$/i.test(url.pathname)) return env.ASSETS.fetch(request);
    let html=APP_HTML;
    const stallPage=url.pathname.match(/^\/stall\/([^/]+)$/)??(isShortStallPath(url.pathname)?[url.pathname,url.pathname.replace(/\//g,'')]:null);
    if(stallPage && env.DB) {
      const stall=await env.DB.prepare('SELECT id,name,takes_card,rider_phone FROM stalls WHERE id=? OR slug=?').bind(stallPage[1],stallPage[1]).first<{id:string;name:string;takes_card:number;rider_phone:string|null}>();
      if(stall?.name) {
        const listed=await listedStall(env.DB,stall.id,Date.now()).catch(()=>null),ld=listed?stallLdTag(listed,url.origin):'';
        const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
        const title=escape(stall.name+' · Order from our digital menu');
        const description=escape((stall.rider_phone?'Order for collection or delivery.':'Order online and collect at our stall.')+(stall.takes_card?' Pay on handover with cash or card.':' Pay cash on handover.'));
        html=html.replace(/<title>.*?<\/title>/s,'<title>'+title+'</title>').replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,'<meta name="description" content="'+description+'">').replace('</head>','<meta property="og:title" content="'+title+'"><meta property="og:description" content="'+description+'"><meta property="og:type" content="website"><meta property="og:url" content="https://move.kasiaihub.com/stall/'+encodeURIComponent(stallPage[1])+'">'+ld+'</head>');
      }
    }
    return new Response(html, { headers: {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache',
      'Referrer-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    } });
  },
};
