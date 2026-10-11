// Opening hours: the community part of the site is "open" like a bar, Prague time.
export const HOURS = { from: 17, to: 24, tz: 'Europe/Prague', label: '17:00-00:00' } as const;

/** Current Prague time as minutes since midnight. */
export function pragueMinutes(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: HOURS.tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

export const isOpen = (now = new Date()) => {
  const m = pragueMinutes(now);
  return m >= HOURS.from * 60 && m < HOURS.to * 60;
};

/** "2h 15m" until the doors open (or close, when open). */
export function untilChange(now = new Date()) {
  const m = pragueMinutes(now);
  const target = isOpen(now) ? HOURS.to * 60 : HOURS.from * 60;
  const left = (target - m + 1440) % 1440;
  const h = Math.floor(left / 60), min = left % 60;
  return h ? `${h}h ${min}m` : `${min}m`;
}
