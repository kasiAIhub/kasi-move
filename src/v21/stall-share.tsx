import { useEffect, useState } from 'react';
import { api, useTask, wa } from './client';
import { ErrorText } from './common';

export interface ShareStall { id: string; name: string; takesCard: boolean; delivery: boolean; deliveryName?:string }
export function stallShareMessage(stall: ShareStall) {
  return 'Order here: https://move.kasiaihub.com/stall/'+stall.id+'\n\n*'+stall.name+'* — official digital menu.\n'+
    (stall.delivery ? 'Collect from our stall or get delivery to your gate.\nPay on collection or at your gate' : 'Order online and collect from our stall.\nPay on collection')+
    (stall.takesCard ? ': cash or card payments.' : ': cash.')+
    (stall.delivery ? (stall.deliveryName ? '\nOur delivery guy is '+stall.deliveryName+'.'+(stall.takesCard?' He brings a speed point machine.':'') : stall.takesCard?'\nOur delivery person brings a speed point machine.':'') : '');
}
function wrap(context: CanvasRenderingContext2D, text: string, y: number, size = 36) {
  context.font="600 "+size+"px Arial";
  let line='';
  for(const word of text.split(/\s+/)) {
    if(context.measureText(line+' '+word).width>770 && line) { context.fillText(line,450,y);y+=size*1.3;line=word; }
    else line+=(line?' ':'')+word;
  }
  context.fillText(line,450,y);
}
export function StallShare({ stall, onDone }: { stall: ShareStall; onDone?:()=>void }) {
  const [open,setOpen]=useState(false),[poster,setPoster]=useState<{url:string;file:File}|null>(null),[error,setError]=useState('');
  const task=useTask(),message=stallShareMessage(stall),link='https://move.kasiaihub.com/stall/'+stall.id;
  useEffect(()=>{
    if(!open)return;
    let active=true,objectUrl='';
    setPoster(null);setError('');
    void (async()=>{
      const QR=await import('qrcode');
      const qr=document.createElement('canvas');await QR.toCanvas(qr,link,{width:650,margin:4,errorCorrectionLevel:'M'});
      const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1200;
      const ctx=canvas.getContext('2d')!;ctx.fillStyle='#ffffff';ctx.fillRect(0,0,900,1200);ctx.fillStyle='#075b36';ctx.fillRect(0,0,900,240);ctx.textAlign='center';ctx.fillStyle='#ffffff';
      wrap(ctx,stall.name,72,38);ctx.font='28px Arial';ctx.fillText('Our official digital menu',210+240,212);
      ctx.drawImage(qr,125,270);ctx.fillStyle='#07120d';wrap(ctx,'Scan to see our menu and order',975,34);
      wrap(ctx,stall.delivery?'Collection or delivery':'Order online · Collect at our stall',1040,28);
      wrap(ctx,stall.takesCard?'Pay on handover · Cash or card':'Pay on handover · Cash',1090,28);
      ctx.font='24px Arial';ctx.fillText('Powered by Kasi Move',1150-700,1160);
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('Could not prepare your QR picture.')),'image/png'));
      if(!active)return;
      objectUrl=URL.createObjectURL(blob);setPoster({url:objectUrl,file:new File([blob],'my-stall-menu-qr.png',{type:'image/png'})});
    })().catch(error=>{if(active)setError(error.message);});
    return ()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[open,link,stall.name,stall.delivery,stall.takesCard]);
  return <div className="v-stack">
    <a className="v-button" href={wa('',message)} target="_blank" rel="noreferrer" onClick={()=>{void api('/vendor/settings','PUT',{done:['share']}).then(onDone).catch(()=>{});}}>Share my stall on WhatsApp</a>
    <details onToggle={event=>setOpen(event.currentTarget.open)}><summary>My stall QR for WhatsApp Status</summary>
      <p>Customers can scan this picture to open your stall’s menu. Share the message above for a tappable link.</p>
      {open&&!poster&&!error&&<p role="status">Preparing your stall QR…</p>}
      <ErrorText text={error||task.error}/>
      {poster&&<><img src={poster.url} alt={'Menu QR for '+stall.name} style={{width:300,maxWidth:'100%'}}/>
        <a className="v-button secondary" href={poster.url} download="my-stall-menu-qr.png">Save stall QR picture</a>
        {typeof navigator.canShare==='function'&&navigator.canShare({files:[poster.file]})&&<button className="v-button" disabled={task.busy} onClick={()=>{void task.run(async()=>{try{await navigator.share({files:[poster.file],text:message,title:stall.name});}catch(error){if((error as Error).name!=='AbortError')throw error;}});}}>Share QR picture</button>}
        <p>Choose WhatsApp → My Status when sharing, or upload the saved picture to your Status. WhatsApp may ask you to add the message separately.</p>
      </>}
    </details>
  </div>;
}
