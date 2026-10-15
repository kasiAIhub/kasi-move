export interface ShareStall { id: string; name: string; takesCard: boolean; delivery: boolean; deliveryName?: string; hours?: string }
/** Closing time from a stall's hours such as "08:00–21:00". Empty when the hours cannot be read. */
export function closingTime(hours?: string) {
  const match = /(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/.exec(hours ?? '');
  return match ? match[3].padStart(2, '0') + ':' + match[4] : '';
}
/** The message a vendor pastes to WhatsApp when the stall opens. The wording is Tsholo's, approved as written. */
export function stallShareMessage(stall: ShareStall, origin: string) {
  const name = stall.name.trim() || 'Our stall', until = closingTime(stall.hours), driver = stall.deliveryName?.trim();
  const lines = ['🎉 *' + name + ' just opened!* 🎉', 'Fresh food, made for you. Order online, no queue.'];
  if (until) lines.push('🕚 The kitchen is now open until ' + until + '.');
  if (stall.delivery && driver) lines.push('🛵 ' + driver + ' will be delivering to your gate' + (stall.takesCard ? ' - tell us if you need them to bring a speed point.' : '.'));
  lines.push((stall.delivery && driver ? '🏪 Or order and collect from the stall.' : '🏪 Order and collect from the stall.') + (stall.takesCard ? '' : ' Cash only.'));
  lines.push('👉 ' + origin + '/stall/' + stall.id);
  return lines.join('\n');
}
