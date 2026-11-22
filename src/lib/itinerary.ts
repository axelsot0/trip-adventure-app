import type { Activity, Progress, TripData, UserStatus, VisualStatus, World } from '../types';
import { zonedToEpoch } from './time';

/** An activity with its position in the whole trip. */
export interface FlatActivity {
  activity: Activity;
  world: World;
  date: string;
  /** Global sequence index (chronological order of the trip). */
  seq: number;
  /** Index among main (non-alternative) activities. */
  mainIndex: number | null;
  startEpoch: number | null;
  endEpoch: number | null;
}

export function sortedWorlds(trip: TripData): World[] {
  return [...trip.worlds].sort((a, b) => a.order - b.order);
}

export function flatten(trip: TripData): FlatActivity[] {
  const out: FlatActivity[] = [];
  let seq = 0, main = 0;
  for (const world of sortedWorlds(trip)) {
    for (const day of world.days) {
      for (const activity of day.activities) {
        const isAlt = activity.priority === 'alternative';
        out.push({
          activity, world, date: day.date, seq: seq++,
          mainIndex: isAlt ? null : main++,
          startEpoch: activity.plannedStart ? zonedToEpoch(activity.plannedStart, activity.timezone) : null,
          endEpoch: activity.plannedEnd ? zonedToEpoch(activity.plannedEnd, activity.endTimezone || activity.timezone) : null,
        });
      }
    }
  }
  return out;
}

export const DONE: UserStatus[] = ['completed', 'skipped', 'cancelled', 'unavailable'];

export function userStatus(progress: Progress, id: string): UserStatus {
  return progress.activities[id]?.status ?? 'pending';
}

export function isDone(progress: Progress, id: string) {
  return DONE.includes(userStatus(progress, id));
}

/** Alternatives become "active" only when chosen to replace their main activity, or when the user acts on them. */
export function isAlternativeActive(progress: Progress, a: Activity): boolean {
  if (a.priority !== 'alternative') return true;
  const s = userStatus(progress, a.id);
  if (s !== 'pending') return true;
  return Object.values(progress.activities).some(p => p.replacedBy === a.id);
}

/**
 * Visual status for each activity:
 *  - user statuses as-is (completed, skipped, …)
 *  - "next": first pending main activity in chronological order
 *  - "locked": pending activities of days after the current trip day
 */
export function visualStatuses(flat: FlatActivity[], progress: Progress, today: string): Map<string, VisualStatus> {
  const map = new Map<string, VisualStatus>();
  const next = nextPendingId(flat, progress);
  for (const f of flat) {
    const s = userStatus(progress, f.activity.id);
    if (s !== 'pending') { map.set(f.activity.id, s); continue; }
    if (f.activity.id === next) { map.set(f.activity.id, 'next'); continue; }
    map.set(f.activity.id, f.date > today ? 'locked' : 'pending');
  }
  return map;
}

/** First pending (counting) activity after the last one in progress; falls back to the first pending overall. */
export function nextPendingId(flat: FlatActivity[], progress: Progress): string | null {
  let lastIp = -1;
  flat.forEach(f => { if (userStatus(progress, f.activity.id) === 'in_progress') lastIp = f.seq; });
  const pend = flat.filter(f => userStatus(progress, f.activity.id) === 'pending' && isAlternativeActive(progress, f.activity));
  return (pend.find(f => f.seq > lastIp) ?? pend[0])?.activity.id ?? null;
}

export interface ProgressStats { done: number; total: number; completed: number }
/** Counts main activities (+ alternatives actually chosen). Skipped/cancelled/unavailable count as resolved. */
export function progressStats(flat: FlatActivity[], progress: Progress, worldId?: string): ProgressStats {
  let done = 0, total = 0, completed = 0;
  for (const f of flat) {
    if (worldId && f.world.id !== worldId) continue;
    if (!isAlternativeActive(progress, f.activity)) continue;
    total++;
    const s = userStatus(progress, f.activity.id);
    if (DONE.includes(s)) done++;
    if (s === 'completed') completed++;
  }
  return { done, total, completed };
}

export function findActivity(trip: TripData, id: string): { world: World; dayIndex: number; index: number; activity: Activity } | null {
  for (const world of trip.worlds) {
    for (let di = 0; di < world.days.length; di++) {
      const i = world.days[di].activities.findIndex(a => a.id === id);
      if (i >= 0) return { world, dayIndex: di, index: i, activity: world.days[di].activities[i] };
    }
  }
  return null;
}

export function uniqueId(trip: TripData, base: string): string {
  const slug = base.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'actividad';
  const used = new Set(flatten(trip).map(f => f.activity.id));
  let id = slug, n = 2;
  while (used.has(id)) id = `${slug}-${n++}`;
  return id;
}

/** All distinct trip dates in order, with the worlds that touch each date. */
export function tripDates(trip: TripData): { date: string; worlds: World[] }[] {
  const m = new Map<string, World[]>();
  for (const w of sortedWorlds(trip)) for (const d of w.days) {
    const arr = m.get(d.date) ?? []; if (!arr.includes(w)) arr.push(w); m.set(d.date, arr);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, worlds]) => ({ date, worlds }));
}

/** Which trip date is "today", based on the real or simulated clock, in the zone of the trip day itself. */
export function currentTripDate(trip: TripData, nowEpoch: number, deviceDate: string): 'before' | 'after' | string {
  if (deviceDate < trip.trip.startDate) return 'before';
  if (deviceDate > trip.trip.endDate) return 'after';
  return deviceDate;
}

export const TYPE_LABEL: Record<string, string> = {
  home: 'Casa', transport: 'Transporte', airport: 'Aeropuerto', flight: 'Vuelo', hotel: 'Hotel', lodging: 'Hospedaje',
  restaurant: 'Restaurante', attraction: 'Atracción', park: 'Parque', viewpoint: 'Mirador', rest_stop: 'Parada de descanso',
  shopping: 'Compras', activity: 'Actividad', drive: 'Carretera', destination: 'Destino final',
};
export const STATUS_LABEL: Record<VisualStatus, string> = {
  locked: 'Bloqueado', pending: 'Pendiente', next: 'Próximo', in_progress: 'En curso', completed: 'Completado',
  skipped: 'Omitido', cancelled: 'Cancelado', unavailable: 'No disponible (clima/cierre)',
};
export const PRIORITY_LABEL: Record<string, string> = { required: 'Imprescindible', high: 'Prioritaria', optional: 'Opcional', alternative: 'Alternativa' };
export const BOOKING_LABEL: Record<string, string> = {
  confirmed: 'Reserva confirmada', pending: 'Reserva pendiente', quote: 'Cotización (no reservado)', not_booked: 'Sin reservar',
  to_verify: 'Por verificar', not_applicable: 'No requiere reserva',
};
export const INFO_LABEL: Record<string, string> = { confirmed: 'Confirmado', estimated: 'Estimado', pending: 'Pendiente', suggested: 'Sugerido', to_verify: 'Por verificar' };
export const COORD_LABEL: Record<string, string> = { verified: 'Verificadas', geocoded: 'Geocodificadas (OSM)', approximate: 'Aproximadas', pending: 'Pendientes' };
