import { stallPath } from '../server/slug';
import {useEffect,useRef,useState} from 'react';
import type {GateItem,GateOrder} from '../server/contracts';
import {api,appOrigin,useResource,useTask,wa} from './client';
import {ErrorText} from './common';
import {ProductImage} from '../components/ProductImage';

export async function preparePhoto(file:Blob,polish=false){
 const image=await createImageBitmap(file),canvas=document.createElement('canvas');canvas.width=900;canvas.height=900;const ctx=canvas.getContext('2d')!,size=Math.min(image.width,image.height);
 ctx.drawImage(image,(image.width-size)/2,(image.height-size)/2,size,size,0,0,900,900);image.close();
 if(polish){const pixels=ctx.getImageData(0,0,900,900),source=new Uint8ClampedArray(pixels.data);
  for(let y=0;y<900;y++)for(let x=0;x<900;x++)for(let c=0;c<3;c++){const i=(y*900+x)*4+c;let v=source[i];if(x>0&&x<899&&y>0&&y<899)v+=.12*(4*v-source[i-4]-source[i+4]-source[i-3600]-source[i+3600]);pixels.data[i]=((v-128)*1.04+128)*1.04;}ctx.putImageData(pixels,0,0);
 }
 return new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not prepare the photo.')),'image/jpeg',.9));
}
interface PhotoData {stallName:string;menu:GateItem[];edits:{item_id:string;original:string;image:string;created_at:number}[]}
export function AdminPhotos({stallId}:{stallId:string}){
 const [open,setOpen]=useState(false);return <><button className="v-button secondary" onClick={()=>setOpen(!open)}>{open?'Close photo review':'Review and polish photos'}</button>{open&&<PhotoReview stallId={stallId}/>}</>;
}
function PhotoReview({stallId}:{stallId:string}){
 const resource=useResource<PhotoData>('/admin/photos?stallId='+encodeURIComponent(stallId)),task=useTask(),[preview,setPreview]=useState<{item:GateItem;blob:Blob;url:string;original:string}|null>(null);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview.url);},[preview]);
 const endpoint=(item:GateItem,action:string)=>'/admin/photos/'+encodeURIComponent(item.id)+'/'+action+'?stallId='+encodeURIComponent(stallId)+'&expected='+encodeURIComponent(item.image||'');
 return <section className="v-stack"><h3>Food photos</h3><p>Polish light, contrast and sharpness with a square crop. No ingredients are added or changed. The original stays saved.</p><ErrorText text={task.error||resource.error}/>{preview?<section className="v-stack"><h3>{preview.item.name}</h3><div className="v-photo-grid"><div><p>Original</p><img src={preview.original} alt="Original food photo"/></div><div><p>Preview</p><img src={preview.url} alt="Polished photo preview"/></div></div><button className="v-button" disabled={task.busy} onClick={()=>void task.run(async()=>{await api(endpoint(preview.item,'polish'),'POST',preview.blob);setPreview(null);await resource.reload();})}>Save polished photo</button><button className="v-link" onClick={()=>setPreview(null)}>Keep current photo</button></section>:resource.data?.menu.map(item=>{const edits=resource.data!.edits.filter(e=>e.item_id===item.id),original=edits.find(e=>e.image===item.image)?.original||item.image;return <section className="v-card v-stack" key={item.id}><h3>{item.name}</h3>{item.image&&<ProductImage src={item.image} alt={item.name}/>}<button className="v-button secondary" disabled={task.busy||!item.image?.startsWith('/photos/')} onClick={()=>void task.run(async()=>{const response=await fetch(original!);if(!response.ok)throw Error('Could not load the original photo.');const blob=await preparePhoto(await response.blob(),true);setPreview({item,blob,url:URL.createObjectURL(blob),original:original!});})}>Improve photo</button>{!item.image?.startsWith('/photos/')&&<p>Default artwork — waiting for the vendor’s own photo.</p>}{edits.length>0&&<><p>{edits.length} saved {edits.length===1?'edit':'edits'} · Original preserved</p><button className="v-link" disabled={task.busy||!edits.some(e=>e.image===item.image)} onClick={()=>void task.run(async()=>{await api(endpoint(item,'restore'),'POST',{});await resource.reload();})}>Restore original</button></>}</section>;})}<p className="muted">AI editing is not enabled. Any future AI polish requires the vendor’s permission.</p></section>;
}
export function OrderPhoto({order,stallName,stallSlug,reload}:{order:GateOrder;stallName:string;stallSlug?:string|null;reload:()=>Promise<unknown>}){
 const input=useRef<HTMLInputElement>(null),task=useTask(),[file,setFile]=useState<File|null>(null),[fallback,setFallback]=useState(false);
 useEffect(()=>{let active=true;setFile(null);if(order.photo)void fetch(order.photo).then(r=>{if(!r.ok)throw Error();return r.blob();}).then(b=>{if(active)setFile(new File([b],'food-from-'+stallName.replace(/[^a-z0-9]/gi,'-')+'.jpg',{type:b.type}));}).catch(()=>{});return()=>{active=false;};},[order.photo,stallName]);
 if(order.state!=='ready')return null;
 const message='Fresh from '+stallName+'! Order from our menu: '+appOrigin()+stallPath({id:order.stallId,slug:stallSlug});
 return <section className="v-stack"><button className="v-button secondary" disabled={task.busy} onClick={()=>input.current?.click()}>{order.photo?'Retake order picture':'Take a picture of this order'}</button><input hidden ref={input} type="file" accept="image/*" capture="environment" onChange={e=>{const selected=e.target.files?.[0];if(selected)void task.run(async()=>{const photo=await preparePhoto(selected);await api('/orders/'+order.id+'/photo','POST',photo);await reload();});e.target.value='';}}/><ErrorText text={task.error}/>{order.photo&&<><img src={order.photo} alt="Ready food to share" style={{width:180,borderRadius:12}}/><button className="v-button" disabled={!file||task.busy} onClick={()=>void task.run(async()=>{if(file&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:stallName,text:message});}catch(e){if((e as Error).name!=='AbortError')setFallback(true);}}else setFallback(true);})}>Share to WhatsApp</button><p className="muted">Choose WhatsApp, then Status or a chat. Your photo and menu link are shared; customer details are not added.</p>{fallback&&<><a className="v-button secondary" href={order.photo} download="kasi-move-food.jpg">Save photo</a><a className="v-link" href={wa('',message)}>Open WhatsApp with menu link</a><p>Attach the saved photo in WhatsApp, then tap Send.</p></>}</>}</section>;
}
