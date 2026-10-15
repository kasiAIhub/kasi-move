import { appOrigin, wa } from './client';
export function ReferralShare({name}:{name:string}) {
  const referral=name.toLocaleLowerCase('en-ZA').replace(/\s+/g,'');
  if(!referral)return null;
  const link=appOrigin()+'/?ref='+encodeURIComponent(referral);
  return <section className="v-card v-stack"><h2>Share Kasi Move</h2><p>Your referral link</p><a href={link} style={{overflowWrap:'anywhere'}}>{link.replace(/^https?:\/\//,'')}</a><a className="v-button" href={wa('','Open your stall online with Kasi Move: '+link.replace(/^https?:\/\//,''))} target="_blank" rel="noreferrer">Share Kasi Move on WhatsApp</a></section>;
}
