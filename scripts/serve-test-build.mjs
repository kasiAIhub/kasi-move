import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
import worker from '../dist/server/index.js';

// Exercise the production Worker and built assets, with isolated local D1/R2 adapters.
const root=resolve('dist/client'), data=resolve('test-results/v21-browser-data');
mkdirSync(data,{recursive:true});
const sqlite=new DatabaseSync(join(data,'orders.sqlite'));
sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS _local_migrations(name TEXT PRIMARY KEY)');
for(const file of readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort()){
  if(!sqlite.prepare('SELECT name FROM _local_migrations WHERE name=?').get(file)){
    sqlite.exec('BEGIN');
    try{sqlite.exec(readFileSync(join('drizzle',file),'utf8'));sqlite.prepare('INSERT INTO _local_migrations(name) VALUES (?)').run(file);sqlite.exec('COMMIT');}
    catch(error){sqlite.exec('ROLLBACK');throw error;}
  }
}
const DB={
  prepare(sql){const make=args=>({bind:(...values)=>make(values),first:async()=>sqlite.prepare(sql).get(...args)??null,all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}})});return make([]);},
  async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}
};
const photos=new Map();
const PHOTOS={
  async put(key,bytes,options){photos.set(key,{bytes,httpMetadata:options.httpMetadata});},
  async get(key){const value=photos.get(key);return value?{body:value.bytes,httpMetadata:value.httpMetadata}:null;},
  async list({prefix,limit}){return {objects:[...photos.keys()].filter(key=>key.startsWith(prefix)).slice(0,limit).map(key=>({key}))};},
  async delete(keys){keys.forEach(key=>photos.delete(key));}
};
const types={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.json':'application/json','.webmanifest':'application/manifest+json','.woff2':'font/woff2'};
const env={DB,PHOTOS,ACTIVATION_ADMIN_KEY:'browser-test-admin-key-never-used-in-production',SUPPORT_WHATSAPP:'+27820000000',ALLOW_ALCOHOL_TESTING:'true',
  ASSETS:{async fetch(request){const file=resolve(root,'.'+decodeURIComponent(new URL(request.url).pathname));if(!file.startsWith(root+sep))return new Response('Not found',{status:404});try{return new Response(await readFile(file),{headers:{'Content-Type':types[extname(file)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}}}
};
const server=createServer(async(req,res)=>{
  try{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const headers=new Headers();for(const [name,value] of Object.entries(req.headers))if(value)headers.set(name,Array.isArray(value)?value.join(','):value);
    const response=await worker.fetch(new Request('http://'+req.headers.host+req.url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)}),env,{waitUntil(job){void job.catch(()=>{});}});
    res.statusCode=response.status;response.headers.forEach((value,name)=>{if(name!=='set-cookie')res.setHeader(name,value);});
    const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
    if(response.body){const stream=Readable.fromWeb(response.body);res.on('close',()=>stream.destroy());stream.on('error',()=>res.destroy());stream.pipe(res);}else res.end();
  }catch(error){console.error(error);if(!res.headersSent)res.statusCode=500;res.end('Test server error');}
});
server.listen(5181,()=>console.log('Built Kasi Move test app ready on http://localhost:5181'));
process.on('SIGTERM',()=>{server.closeAllConnections();server.close(()=>{sqlite.close();process.exit(0);});});
