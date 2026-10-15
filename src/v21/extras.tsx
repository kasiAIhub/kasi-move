import { useState } from 'react';
import type { GateItem } from '../server/contracts';
import { kotaExtras } from '../server/kota-extras';
type Extra=NonNullable<GateItem['extras']>[number];
export function ExtrasPicker({value,onChange}:{value:Extra[];onChange:(value:Extra[])=>void}) {
  const [custom,setCustom]=useState<Extra[]>([]);
  const choices=[...kotaExtras,...value.filter(e=>!kotaExtras.some(x=>x.id===e.id)),...custom.filter(e=>!value.some(x=>x.id===e.id))];
  return <section className="v-card v-stack"><h2>Extras for all food</h2><p>Choose what you offer and set your prices. These choices apply to every food item.</p>{choices.map(option=>{const selected=value.find(e=>e.id===option.id);return <div key={option.id} className="v-stack"><label className="v-choice"><input type="checkbox" checked={Boolean(selected)} onChange={event=>onChange(event.target.checked?[...value,option]:value.filter(e=>e.id!==option.id))}/>{option.name||'Custom extra'}</label>{selected&&<><label>Extra name<input required value={selected.name} onChange={event=>onChange(value.map(e=>e.id===option.id?{...e,name:event.target.value}:e))}/></label><label>Price for {selected.name} · R<input required type="number" min="0" step="0.01" value={selected.priceCents/100} onChange={event=>onChange(value.map(e=>e.id===option.id?{...e,priceCents:Math.round(Number(event.target.value)*100)}:e))}/></label></>}</div>})}<button type="button" className="v-link" disabled={value.length>=15} onClick={()=>{const extra={id:crypto.randomUUID(),name:'',priceCents:0};setCustom([...custom,extra]);onChange([...value,extra]);}}>+ Add a custom extra</button></section>;
}
