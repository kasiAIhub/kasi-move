import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { GateItem, GateOrder } from '../server/contracts';
import type { StallRow } from '../server/database';
import type { StallSettings } from '../server/settings';
export class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api${path}`, { method, credentials: 'same-origin', signal: AbortSignal.timeout(20000),
    headers: body instanceof Blob ? { 'Content-Type': body.type } : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
  });
  } catch { throw new RequestError(method==='GET'?'The connection is taking too long. Please try loading again.':'The connection is taking too long. Your save could not be confirmed. Please try again.', 0); }
  let result; try { result = await response.json(); } catch { throw new RequestError('The order service is unavailable. Please try again.', response.status); }
  if (!response.ok) throw new RequestError(result.error || 'Please try again.', response.status);
  return result;
}
export const rand = (cents: number) => `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).replace('.', ',')}`;
export const day = (time: number) => new Date(time + 7200000).toISOString().slice(0, 10);
export const wa = (phone: string, message = '') => `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
export const settingsOf = (stall: StallRow): StallSettings => JSON.parse(stall.settings || '{}');
export interface OwnerData { team?: import('./team').TeamMember[]; stall: StallRow; menu: GateItem[]; riderOffer?: {name?:string;phone:string;fee_cents:number;decision:string|null;expires_at:number}|null }
export interface PublicStall { special?: { text: string; from: number; to: number } | null; id: string; name: string; phone: string; hours: string; open: boolean; takesCard: boolean; delivery: boolean; alcoholTesting?: boolean; kotaDisplay?: GateItem[]; nextDoorDisplay?: GateItem[]; menu: GateItem[] }
interface Session { role: 'vendor' | 'customer' | 'rider' | 'assistant'; stallId: string | null; ownerAvailable?: boolean; ownerStallId?: string; ownerSetupComplete?: boolean; demo?: boolean }
const resourceSeeds = new Map<string, unknown>();
interface Identity { acceptVendor: (owner: OwnerData) => void; session: Session | null; loading: boolean; refresh: () => Promise<void> }
const IdentityContext = createContext<Identity>(null!);
export function IdentityProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null), [loading, setLoading] = useState(true);
  const revision = useRef(0);
  const refresh = useCallback(async () => { const version=++revision.current; try { const result=await api('/session'); if(version===revision.current)setSession(result); } catch { if(version===revision.current)setSession(null); } finally { if(version===revision.current)setLoading(false); } }, []);
  const acceptVendor = useCallback((owner: OwnerData) => {
    ++revision.current; resourceSeeds.clear(); resourceSeeds.set('/vendor/stall', owner);
    setSession({role:'vendor',stallId:owner.stall.id,ownerAvailable:true,ownerStallId:owner.stall.id,ownerSetupComplete:(settingsOf(owner.stall).setupStep??0)>=9,demo:owner.stall.phone==='+27820000000'}); setLoading(false);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!session) return;
    let events: EventSource | undefined;
    const connect = () => { events?.close(); if (document.visibilityState === 'visible') { events = new EventSource('/api/events'); events.addEventListener('change', () => window.dispatchEvent(new Event('kasi-change'))); } };
    connect(); document.addEventListener('visibilitychange', connect);
    return () => { events?.close(); document.removeEventListener('visibilitychange', connect); };
  }, [session?.role, session?.stallId]);
  return <IdentityContext.Provider value={{ session, loading, refresh, acceptVendor }}>{children}</IdentityContext.Provider>;
}
export const useIdentity = () => useContext(IdentityContext);
export function useResource<T>(path: string, poll = false) {
  const seed = useRef({path, data:resourceSeeds.get(path) as T|undefined});
  const [data, setData] = useState<T | null>(seed.current.data??null), [error, setError] = useState('');
  const reload = useCallback(async () => { try { const result = await api<T>(path); setData(result); setError(''); return result; } catch (error) { setError((error as Error).message); return null; } }, [path]);
  useEffect(() => { let active = true, inFlight = false; const seeded=seed.current.path===path?seed.current.data:undefined; resourceSeeds.delete(path); setData(seeded??null); setError('');
    const load = async () => { if(inFlight)return; inFlight=true; try { const result = await api<T>(path); if (active) { setData(result); setError(''); } } catch (error) { if (active) setError((error as Error).message); } finally { inFlight=false; } };
    if(!seeded) void load(); const timer = poll ? setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 4000) : undefined;
    const focus = () => { if (poll && document.visibilityState === 'visible') void load(); }; window.addEventListener('focus', focus); document.addEventListener('visibilitychange', focus);
    window.addEventListener('kasi-change', focus);
    return () => { active = false; clearInterval(timer); window.removeEventListener('kasi-change', focus); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); };
  }, [path, poll]);
  return { data, error, reload, setData };
}
export function useTask() {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function run(task: () => Promise<unknown>) { if (busy) return; setBusy(true); setError(''); try { await task(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }
  return { error, busy, run, clearError: () => setError('') };
}
export interface DraftLine { item: GateItem; quantity: number; extras: string[]; ifMissing: 'alternative' | 'omit' }
export const draftKey = (line: DraftLine) => `${line.item.id}|${[...line.extras].sort().join(',')}`;
interface Draft { stallId: string; lines: DraftLine[]; requestKey: string }
function initialDraft(): Draft { try { return JSON.parse(sessionStorage.getItem('kasi-order-draft') || 'null') || { stallId: '', lines: [], requestKey: crypto.randomUUID() }; } catch { return { stallId: '', lines: [], requestKey: crypto.randomUUID() }; } }
const DraftContext = createContext<{ draft: Draft; update: (value: Draft) => void; clear: () => void }>(null!);
export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState(initialDraft);
  const update = (value: Draft) => { setDraft(value); sessionStorage.setItem('kasi-order-draft', JSON.stringify(value)); };
  return <DraftContext.Provider value={{ draft, update, clear: () => update({ stallId: draft.stallId, lines: [], requestKey: crypto.randomUUID() }) }}>{children}</DraftContext.Provider>;
}
export const useDraft = () => useContext(DraftContext);
export const draftTotal = (lines: DraftLine[]) => lines.reduce((sum, line) => sum + ((line.item.priceCents ?? 0) + (line.item.extras ?? []).filter(extra => line.extras.includes(extra.id)).reduce((sum, extra) => sum + extra.priceCents, 0)) * line.quantity, 0);
export function elapsed(order: GateOrder) { return Math.max(0, Math.floor((Date.now() - order.createdAt) / 60000)); }

export async function openWhatsAppAction<T extends {link?: string}>(work: () => Promise<T>) {
  const popup = window.open('', '_blank'); if (popup) popup.opener = null;
  try { const result = await work(); if (popup) { if (result.link) popup.location.href = result.link; else popup.close(); } return { ...result, popupBlocked: !popup }; }
  catch (error) { popup?.close(); throw error; }
}
