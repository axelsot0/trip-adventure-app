/**
 * Time-zone helpers built on Intl only (no dependencies).
 * Itinerary times are stored as local wall-clock strings + an IANA zone,
 * e.g. { plannedStart: "2026-12-21T21:00", timezone: "America/Santo_Domingo" }.
 */

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}

function partsInTz(epoch: number, tz: string) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(epoch))) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return o;
}

/** Offset (ms) of `tz` relative to UTC at a given instant. */
function tzOffset(epoch: number, tz: string): number {
  const p = partsInTz(epoch, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(epoch / 1000) * 1000;
}

/** Converts a local wall-clock string in `tz` to an epoch (ms). */
export function zonedToEpoch(local: string, tz: string): number {
  const [d, t = '00:00'] = local.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, day, hh, mm);
  let epoch = guess - tzOffset(guess, tz);
  epoch = guess - tzOffset(epoch, tz); // second pass handles DST edges
  return epoch;
}

/** "YYYY-MM-DD" of an instant as seen in `tz`. */
export function dateInTz(epoch: number, tz: string): string {
  const p = partsInTz(epoch, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function tzAbbrev(epoch: number, tz: string): string {
  const s = new Intl.DateTimeFormat('es-DO', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(epoch));
  return s.find(p => p.type === 'timeZoneName')?.value ?? tz;
}

export function friendlyTzName(tz: string): string {
  if (tz === 'America/Santo_Domingo') return 'hora RD';
  if (tz === 'America/New_York') return 'hora Este EE. UU.';
  if (tz === 'America/Chicago') return 'hora Centro EE. UU.';
  return tz;
}

export function formatTime(local: string | null, tz: string): string {
  if (!local) return 'Hora por definir';
  const e = zonedToEpoch(local, tz);
  const t = new Intl.DateTimeFormat('es-DO', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(e));
  return `${t} · ${friendlyTzName(tz)}`;
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function dateLabel(iso: string, style: 'long' | 'short' = 'long'): string {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (style === 'short') return `${WEEKDAYS[wd].slice(0, 3)} ${d} ${MONTHS_SHORT[m - 1]}`;
  const s = `${WEEKDAYS[wd]} ${d} de ${MONTHS[m - 1]}`;
  return s[0].toUpperCase() + s.slice(1);
}

export function humanDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function relativeMinutes(mins: number): string {
  if (Math.abs(mins) < 1) return 'ahora';
  const s = humanDuration(Math.abs(mins));
  return mins > 0 ? `en ${s}` : `hace ${s}`;
}

/** Local datetime string "YYYY-MM-DDTHH:MM" for an instant in `tz` (used by <input type=datetime-local>). */
export function epochToLocal(epoch: number, tz: string): string {
  const p = partsInTz(epoch, tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function deviceTz(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
}
