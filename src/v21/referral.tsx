import { slugBase } from '../server/slug';
import { appOrigin, wa } from './client';
export function ReferralShare({name,slug}:{name:string;slug?:string|null}) {
  // Same clean rules as the stall link: lowercase letters, numbers and dashes, so nothing needs URL encoding.
  const referral=slug||(name.trim()?slugBase(name):'');
  if(!referral)return null;
  const link=appOrigin()+'/?ref='+referral;
  return <section className="v-card v-stack"><h2>Share Kasi Move</h2><p>Your referral link</p><a href={link} style={{overflowWrap:'anywhere'}}>{link.replace(/^https?:\/\//,'')}</a><a className="v-button" href={wa('','Open your stall online with Kasi Move: '+link.replace(/^https?:\/\//,''))} target="_blank" rel="noreferrer">Share Kasi Move on WhatsApp</a></section>;
}
