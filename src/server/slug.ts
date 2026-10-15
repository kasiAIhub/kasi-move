/** Short stall links: move.kasiaihub.com/<slug>. The slug is made once from the stall name and never changes. */
export const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'about', 'assets', 'assistant', 'config', 'customer', 'demo', 'directory', 'favicon', 'fresh', 'health', 'help', 'home',
  'images', 'index', 'invite', 'join', 'kitchen', 'llms', 'login', 'logout', 'manifest', 'menu', 'more', 'my-orders', 'order', 'orders', 'owner',
  'photos', 'privacy', 'rider', 'robots', 'roles', 'setup', 'signin', 'signup', 'sitemap', 'stall', 'stalls', 'static', 'sw', 'team', 'terms', 'track', 'verify',
]);
export function slugBase(name: string) {
  const base = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return base || 'stall';
}
/** Candidate n for a base slug: base, base-2, base-3. A reserved word never stands alone. */
export function slugCandidate(base: string, n: number) {
  return n <= 1 ? (RESERVED_SLUGS.has(base) ? base + '-2' : base) : base + '-' + (RESERVED_SLUGS.has(base) && n === 2 ? 3 : n);
}
/** Path of a stall's customer page. Stalls without a slug yet keep the long link. */
export function stallPath(stall: { id: string; slug?: string | null }) { return stall.slug ? '/' + stall.slug : '/stall/' + stall.id; }
/** True for a single-segment path that is a stall short link rather than an app page. */
export function isShortStallPath(pathname: string) {
  const m = /^\/([a-z0-9][a-z0-9-]*)\/?$/.exec(pathname);
  return Boolean(m && !RESERVED_SLUGS.has(m[1]));
}
