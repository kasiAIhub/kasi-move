const DAY = 86400000;
export function hoursRange(hours: string): [number, number] | null {
  const match = hours.match(/^(\d{2}):(\d{2})\s*[–-]\s*(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, a, b, c, d] = match.map(Number);
  if (a > 23 || c > 23 || b > 59 || d > 59 || a === c && b === d) return null;
  return [a * 60 + b, c * 60 + d];
}
export function scheduleOpen(hours: string, now: number): boolean {
  const range = hoursRange(hours); if (!range) return false;
  const minutes = Math.floor(((now + 7200000) % DAY) / 60000);
  return range[0] < range[1] ? minutes >= range[0] && minutes < range[1] : minutes >= range[0] || minutes < range[1];
}
export function nextOpen(hours: string, now: number): number {
  const range = hoursRange(hours); if (!range) return now;
  const midnight = Math.floor((now + 7200000) / DAY) * DAY - 7200000;
  const today = midnight + range[0] * 60000;
  return today > now ? today : today + DAY;
}
