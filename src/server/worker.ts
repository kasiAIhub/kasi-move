import { metaWhatsApp } from './meta-whatsapp';
import { createApi } from './api';
import type { Database } from './database';
import { whatsapp, type WhatsAppConfig } from './whatsapp';
import { apiConfiguration, type Configuration } from './config';
interface Environment extends WhatsAppConfig, Configuration {
  DB: Database;
  PHOTOS: {
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
    const url = new URL(request.url);
    if (request.method === 'GET' && url.hostname === 'example.com' && !url.pathname.startsWith('/api/') && !/\.[a-z0-9]+$/i.test(url.pathname)) {
      url.hostname = 'move.kasiaihub.com';
      return Response.redirect(url.toString(), 302);
    }
    if (url.pathname.startsWith('/api/')) {
      if (!env.DB) return Response.json({ error: 'The order service is not available yet.' }, { status: 503 });
      return createApi(env.DB, whatsapp(env), Date.now, {
        ...apiConfiguration(env),
        meta: metaWhatsApp(env.DB, env, job => ctx.waitUntil(job)),
        deletePhotos: async stallId => {
          const prefix = `${stallId}/`;
          for (;;) {
            const page = await env.PHOTOS.list({ prefix, limit: 1000 });
            if (!page.objects.length) break;
            if (page.objects.some(object => !object.key.startsWith(prefix))) throw new Error('Photo scope mismatch');
            await env.PHOTOS.delete(page.objects.map(object => object.key));
          }
        },
        upload: async (key, bytes, contentType) => { await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType } }); },
      })(request);
    }
    if (url.pathname.startsWith('/photos/')) {
      const object = await env.PHOTOS.get(url.pathname.slice(8));
      return object ? new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType ?? 'image/jpeg', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public,max-age=31536000,immutable' } }) : new Response('Photo not found', { status: 404 });
    }
    if (env.ASSETS && /\.[a-z0-9]+$/i.test(url.pathname)) return env.ASSETS.fetch(request);
    let html=APP_HTML;
    const stallPage=url.pathname.match(/^\/stall\/([^/]+)$/);
    if(stallPage && env.DB) {
      const stall=await env.DB.prepare('SELECT name,takes_card,rider_phone FROM stalls WHERE id=?').bind(stallPage[1]).first<{name:string;takes_card:number;rider_phone:string|null}>();
      if(stall?.name) {
        const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
        const title=escape(stall.name+' · Order from our digital menu');
        const description=escape((stall.rider_phone?'Order for collection or delivery.':'Order online and collect at our stall.')+(stall.takes_card?' Pay on handover with cash or card.':' Pay cash on handover.'));
        html=html.replace(/<title>.*?<\/title>/s,'<title>'+title+'</title>').replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,'<meta name="description" content="'+description+'">').replace('</head>','<meta property="og:title" content="'+title+'"><meta property="og:description" content="'+description+'"><meta property="og:type" content="website"><meta property="og:url" content="https://move.kasiaihub.com/stall/'+encodeURIComponent(stallPage[1])+'"></head>');
      }
    }
    return new Response(html, { headers: {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache',
      'Referrer-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    } });
  },
};
