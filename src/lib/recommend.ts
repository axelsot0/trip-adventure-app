import type { Coordinates, Progress } from '../types';
import { haversineKm } from './geo';
import { FlatActivity, isAlternativeActive, nextPendingId, userStatus } from './itinerary';
import { humanDuration } from './time';

/**
 * "¿Dónde estamos y adónde vamos ahora?"
 *
 * Three DIFFERENT concepts are returned:
 *  - scheduledNext : next pending stop in itinerary order (respecting in-progress activities)
 *  - nearest       : the pending stop closest to the current position (straight line). NOT necessarily next.
 *  - recommended   : where we suggest going now, considering order, fixed times / reservations,
 *                    priority, travel time (when a real route is known), completed activities and
 *                    the manual choice of the user.
 * The recommender never states that a place is open — it only reasons about the plan.
 */

export interface Recommendation {
  recommended: FlatActivity | null;
  reasons: string[];
  warnings: string[];
  scheduledNext: FlatActivity | null;
  nearest: { item: FlatActivity; km: number } | null;
  current: FlatActivity | null;
}

export interface RecommendInput {
  flat: FlatActivity[];
  progress: Progress;
  now: number;
  position: Coordinates | null;
  manualTargetId: string | null;
  /** Real travel minutes from the routing provider, keyed by activity id (optional). */
  travelMinutes?: Record<string, number | null>;
  /** Restrict "nearest" to a date (normally today). */
  date?: string | null;
}

const FIXED_WINDOW_MIN = 45;

export function recommend(input: RecommendInput): Recommendation {
  const { flat, progress, now, position, manualTargetId, travelMinutes = {}, date } = input;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const open = flat.filter(f => {
    const s = userStatus(progress, f.activity.id);
    return (s === 'pending' || s === 'in_progress') && isAlternativeActive(progress, f.activity);
  });
  const current = flat.find(f => userStatus(progress, f.activity.id) === 'in_progress') ?? null;
  const nextId = nextPendingId(flat, progress);
  const scheduledNext = flat.find(f => f.activity.id === nextId) ?? null;

  // nearest pending stop with known coordinates (same day if possible)
  let nearest: Recommendation['nearest'] = null;
  if (position) {
    const pool = open.filter(f => f.activity.location?.coordinates && (!date || f.date === date));
    const candidates = pool.length ? pool : open.filter(f => f.activity.location?.coordinates);
    for (const f of candidates) {
      const km = haversineKm(position, f.activity.location!.coordinates!);
      if (!nearest || km < nearest.km) nearest = { item: f, km };
    }
  }

  let recommended: FlatActivity | null = null;

  const manual = manualTargetId ? open.find(f => f.activity.id === manualTargetId) : null;
  if (manual) {
    recommended = manual;
    reasons.push('Destino elegido manualmente por ustedes.');
  } else if (current && !scheduledNext) {
    recommended = current;
    reasons.push('Actividad en curso.');
  } else if (scheduledNext) {
    recommended = scheduledNext;
    reasons.push(current ? `Siguiente después de “${current.activity.name}” (en curso).` : 'Siguiente parada en el orden del itinerario.');

    // A later activity with a fixed time (reservation / entry slot / flight) that is about to start wins.
    const fixedSoon = open
      .filter(f => f.seq > scheduledNext.seq && f.startEpoch != null && (f.activity.fixedTime || f.activity.bookingStatus === 'confirmed'))
      .map(f => {
        const until = (f.startEpoch! - now) / 60000;
        const travel = travelMinutes[f.activity.id] ?? null;
        return { f, until, slack: until - (travel ?? 0) };
      })
      .filter(x => x.until > -30 && x.slack <= FIXED_WINDOW_MIN)
      .sort((a, b) => a.slack - b.slack)[0];
    if (fixedSoon && !(scheduledNext.startEpoch != null && scheduledNext.activity.fixedTime)) {
      recommended = fixedSoon.f;
      reasons.length = 0;
      reasons.push(`Tiene hora fija y empieza ${fixedSoon.until >= 0 ? 'en ' + humanDuration(fixedSoon.until) : 'ahora'}: se prioriza sobre “${scheduledNext.activity.name}”.`);
      if (travelMinutes[fixedSoon.f.activity.id] != null) reasons.push(`Trayecto estimado: ${humanDuration(travelMinutes[fixedSoon.f.activity.id]!)}.`);
    }
  }

  if (recommended) {
    const a = recommended.activity;
    if (recommended.startEpoch != null) {
      const until = (recommended.startEpoch - now) / 60000;
      const travel = travelMinutes[a.id];
      if (until > 0 && travel != null && travel > until) warnings.push(`El trayecto (${humanDuration(travel)}) es mayor que el tiempo que falta para la hora prevista.`);
    }
    if (recommended.endEpoch != null && recommended.endEpoch < now && userStatus(progress, a.id) === 'pending') {
      warnings.push('La hora prevista ya pasó. Si ya la hicieron u omitieron, márquenla para avanzar.');
    }
    if (a.conditions) warnings.push(a.conditions);
    if (a.bookingStatus === 'to_verify' || a.bookingStatus === 'quote' || a.bookingStatus === 'not_booked') warnings.push('Reserva no confirmada.');
    if (!a.location?.coordinates) warnings.push('Coordenadas pendientes: no se puede calcular distancia.');
    if (['attraction', 'park', 'restaurant', 'shopping', 'viewpoint'].includes(a.type)) warnings.push('Horario de apertura no verificado por la app: consulten la fuente oficial.');
    if (a.priority === 'optional') reasons.push('Es opcional: pueden omitirla sin problema.');
  }

  if (nearest && recommended && nearest.item.activity.id !== recommended.activity.id) {
    reasons.push(`La parada más cercana es “${nearest.item.activity.name}”, pero no es la siguiente del plan.`);
  }

  return { recommended, reasons, warnings, scheduledNext, nearest, current };
}
