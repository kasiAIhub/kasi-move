import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {api,rand,useIdentity,useTask} from './client';
import {ErrorText,Frame} from './common';
import {Rider} from './rider';
import {AssistantKitchen} from './team';
export function TeamAccess(){
 const [params]=useState(()=>new URLSearchParams(location.hash.slice(1))),[member,setMember]=useState<{role:string;name:string}|null>(null),task=useTask(),identity=useIdentity();
 useEffect(()=>{void task.run(async()=>{const result=await api('/auth/team-access','POST',{token:params.get('token')});await identity.refresh();setMember(result);});},[]);
 if(member)return member.role==='rider'?<Rider/>:<AssistantKitchen/>;
 return <Frame><h1>Your personal team screen</h1><ErrorText text={task.error}/>{!task.error&&<p>Opening your team access…</p>}</Frame>;
}
export function MemberInvite({role}:{role:'rider'|'assistant'}){
 const [token]=useState(()=>new URLSearchParams(location.search).get('token')),task=useTask(),[offer,setOffer]=useState<any>(null),[declined,setDeclined]=useState(false),[personal,setPersonal]=useState(''),[copied,setCopied]=useState(false),identity=useIdentity();
 const base=role==='rider'?'/auth/rider':'/auth/team';
 useEffect(()=>{void task.run(async()=>{const result=await api(base+'-offer','POST',{token});if(result.alreadyAccepted)setPersonal(result.personalLink);else setOffer(result);});},[]);
 async function decide(decision:string){const result=await api(base,'POST',{token,decision});if(decision==='reject'){setDeclined(true);return;}await identity.refresh();setPersonal(result.personalLink);}
 const localPersonal=personal?'/team/access'+new URL(personal).hash:'';
 return <Frame><h1>{personal?'You’re on the team!':role==='rider'?'Your delivery offer':'Your shop invitation'}</h1><ErrorText text={task.error}/>{personal?<section className="v-card v-stack"><p>{offer?.name?`Welcome, ${offer.name}. `:''}Save your personal link. You can reopen it any time while your membership is active.</p>{role==='rider'&&offer&&<p>{rand(offer.feeCents)} per delivery, paid by the vendor.</p>}<a className="v-button" href={localPersonal}>{role==='rider'?'Open my deliveries':'Open my kitchen'}</a><button type="button" className="v-button secondary" onClick={()=>void task.run(async()=>{const full=new URL(localPersonal,window.location.origin).toString();try{await navigator.clipboard.writeText(full);setCopied(true);}catch{window.prompt('Copy your link',full);}})}>{copied?'Link copied':'Copy my link'}</button>{typeof navigator.share==='function'&&<button type="button" className="v-button secondary" onClick={()=>void task.run(async()=>{try{await navigator.share({title:'My Kasi Move link',url:new URL(localPersonal,window.location.origin).toString()});}catch{/* closed */}})}>Send my link to myself</button>}</section>:declined?<p>You declined this invitation.</p>:offer?<section className="v-card v-stack"><h2>{offer.stallName}</h2><p>Hi {offer.name}.</p>{role==='rider'?<><strong className="v-money">{rand(offer.feeCents)} per run</strong><p>The vendor pays you for each completed delivery. Agree payment arrangements directly with them.</p></>:<p>Help manage kitchen orders and assign deliveries. Owner settings and money stay private.</p>}<button className="v-button" disabled={task.busy} onClick={()=>void task.run(()=>decide('accept'))}>{role==='rider'?'Accept offer':'Accept invitation'}</button><button className="v-button secondary" disabled={task.busy} onClick={()=>void task.run(()=>decide('reject'))}>{role==='rider'?'Decline offer':'Decline invitation'}</button></section>:!task.error&&<p>Loading invitation…</p>}{task.error&&identity.session?.role===role&&<Link className="v-button" to={role==='rider'?'/rider':'/assistant'}>Open my team screen</Link>}</Frame>;
}
