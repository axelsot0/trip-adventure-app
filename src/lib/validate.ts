import type { Progress, TripBundle, TripData } from '../types';
import { SCHEMA_VERSION } from '../types';
import { addDays } from './time';

export interface ValidationIssue { level: 'error' | 'warning'; path: string; message: string }
export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  trip?: TripData;
  progress?: Progress;
  summary?: { worlds: number; days: number; activities: number; dates: string[] };
}

const ACTIVITY_TYPES = ['home', 'transport', 'airport', 'flight', 'hotel', 'lodging', 'restaurant', 'attraction', 'park', 'viewpoint', 'rest_stop', 'shopping', 'activity', 'drive', 'destination'];
const PRIORITIES = ['required', 'high', 'optional', 'alternative'];
const BOOKING = ['confirmed', 'pending', 'quote', 'not_booked', 'to_verify', 'not_applicable'];
const COST_STATUS = ['paid', 'pending_payment', 'quote', 'estimate', 'published_price', 'unknown', 'none'];
const COORD_STATUS = ['verified', 'geocoded', 'approximate', 'pending'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function isObj(v: unknown): v is Record<string, any> { return typeof v === 'object' && v !== null && !Array.isArray(v); }
function validTz(tz: unknown): boolean {
  if (typeof tz !== 'string') return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/** Accepts either a TripData document or a TripBundle (trip + progress). Never mutates the input. */
export function validateImport(raw: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const err = (path: string, message: string) => issues.push({ level: 'error', path, message });
  const warn = (path: string, message: string) => issues.push({ level: 'warning', path, message });

  if (!isObj(raw)) { err('$', 'El archivo no contiene un objeto JSON.'); return { ok: false, issues }; }
  let tripRaw: any = raw;
  let progressRaw: any = null;
  if (raw.kind === 'family-trip-bundle') {
    tripRaw = raw.trip; progressRaw = raw.progress;
    if (!isObj(tripRaw)) { err('trip', 'El paquete no incluye el itinerario.'); return { ok: false, issues }; }
  }
  const t = structuredClone(tripRaw) as any;

  if (typeof t.schemaVersion !== 'string') err('schemaVersion', 'Falta schemaVersion.');
  else if (t.schemaVersion.split('.')[0] !== SCHEMA_VERSION.split('.')[0]) err('schemaVersion', `Versión de esquema ${t.schemaVersion} no compatible (se espera ${SCHEMA_VERSION}).`);
  if (typeof t.id !== 'string' || !t.id) { warn('id', 'Sin id de viaje; se generará uno.'); t.id = 'trip-' + Date.now().toString(36); }
  if (!isObj(t.trip)) err('trip', 'Falta el bloque "trip".');
  else {
    if (!t.trip.name) err('trip.name', 'Falta el nombre del viaje.');
    if (!DATE_RE.test(t.trip.startDate ?? '')) err('trip.startDate', 'Fecha de inicio inválida (AAAA-MM-DD).');
    if (!DATE_RE.test(t.trip.endDate ?? '')) err('trip.endDate', 'Fecha de fin inválida (AAAA-MM-DD).');
    if (!validTz(t.trip.homeTimezone)) { warn('trip.homeTimezone', 'Zona horaria de casa inválida; se usa America/Santo_Domingo.'); t.trip.homeTimezone = 'America/Santo_Domingo'; }
    if (!isObj(t.trip.travelers)) { warn('trip.travelers', 'Sin viajeros; se asumen 5.'); t.trip.travelers = { adults: 3, minors: [14, 11] }; }
  }
  if (!Array.isArray(t.worlds) || t.worlds.length === 0) err('worlds', 'Se necesita al menos un mundo.');

  const ids = new Set<string>();
  const dates = new Set<string>();
  let activities = 0, days = 0;
  (t.worlds ?? []).forEach((w: any, wi: number) => {
    const wp = `worlds[${wi}]`;
    if (!isObj(w)) { err(wp, 'Mundo inválido.'); return; }
    if (!w.id) err(`${wp}.id`, 'Mundo sin id.');
    if (!w.name) err(`${wp}.name`, 'Mundo sin nombre.');
    if (typeof w.order !== 'number') w.order = wi + 1;
    w.subtitle ??= '';
    w.theme ??= 'tropical';
    if (!Array.isArray(w.days)) { err(`${wp}.days`, 'El mundo no tiene días.'); return; }
    w.days.forEach((d: any, di: number) => {
      const dp = `${wp}.days[${di}]`;
      days++;
      if (!DATE_RE.test(d?.date ?? '')) err(`${dp}.date`, 'Fecha de día inválida.');
      else dates.add(d.date);
      if (!Array.isArray(d.activities)) { err(`${dp}.activities`, 'El día no tiene lista de actividades.'); return; }
      d.activities.forEach((a: any, ai: number) => {
        const ap = `${dp}.activities[${ai}]`;
        activities++;
        if (!isObj(a)) { err(ap, 'Actividad inválida.'); return; }
        if (!a.id) err(`${ap}.id`, 'Actividad sin id.');
        else if (ids.has(a.id)) err(`${ap}.id`, `id duplicado "${a.id}".`);
        else ids.add(a.id);
        if (!a.name) err(`${ap}.name`, 'Actividad sin nombre.');
        if (!ACTIVITY_TYPES.includes(a.type)) { warn(`${ap}.type`, `Tipo "${a.type}" desconocido; se usa "activity".`); a.type = 'activity'; }
        if (!PRIORITIES.includes(a.priority)) { a.priority = 'required'; }
        if (!BOOKING.includes(a.bookingStatus)) a.bookingStatus = 'not_applicable';
        if (!validTz(a.timezone)) { warn(`${ap}.timezone`, 'Zona horaria inválida o ausente; se usa la de casa.'); a.timezone = t.trip?.homeTimezone ?? 'America/Santo_Domingo'; }
        if (a.endTimezone && !validTz(a.endTimezone)) { warn(`${ap}.endTimezone`, 'Zona horaria final inválida.'); a.endTimezone = null; }
        for (const k of ['plannedStart', 'plannedEnd']) {
          if (a[k] == null) a[k] = null;
          else if (!LOCAL_DT_RE.test(a[k])) { err(`${ap}.${k}`, `Hora inválida "${a[k]}" (AAAA-MM-DDTHH:MM).`); }
        }
        a.timeStatus ??= 'pending';
        a.photos ??= []; a.links ??= []; a.requirements ??= [];
        a.notes ??= ''; a.description ??= '';
        if (a.location != null) {
          if (!isObj(a.location)) err(`${ap}.location`, 'Ubicación inválida.');
          else {
            const c = a.location.coordinates;
            if (c != null && (typeof c.lat !== 'number' || typeof c.lng !== 'number' || Math.abs(c.lat) > 90 || Math.abs(c.lng) > 180)) err(`${ap}.location.coordinates`, 'Coordenadas fuera de rango.');
            if (!COORD_STATUS.includes(a.location.coordinatesStatus)) a.location.coordinatesStatus = c ? 'approximate' : 'pending';
            if (c == null) a.location.coordinatesStatus = 'pending';
          }
        }
        if (a.cost != null) {
          if (!isObj(a.cost)) err(`${ap}.cost`, 'Costo inválido.');
          else {
            if (!COST_STATUS.includes(a.cost.status)) a.cost.status = 'unknown';
            for (const k of ['total', 'pricePerPerson', 'actual', 'refundableDeposit']) {
              const v = a.cost[k];
              if (v != null && (typeof v !== 'number' || !isFinite(v) || v < 0)) err(`${ap}.cost.${k}`, 'Importe inválido.');
            }
            a.cost.currency ??= 'USD'; a.cost.category ??= 'other';
          }
        }
      });
    });
  });

  // alternatives must reference something that exists
  (t.worlds ?? []).forEach((w: any) => w.days?.forEach((d: any) => d.activities?.forEach((a: any) => {
    if (a.alternativeFor && !ids.has(a.alternativeFor)) warn(`activity ${a.id}`, `Es alternativa de "${a.alternativeFor}", que no existe.`);
  })));

  // date continuity — no gaps between start and end
  if (t.trip && DATE_RE.test(t.trip.startDate) && DATE_RE.test(t.trip.endDate)) {
    for (let d = t.trip.startDate; d <= t.trip.endDate; d = addDays(d, 1)) {
      if (!dates.has(d)) warn('worlds', `No hay ningún día con fecha ${d} (salto de fechas).`);
    }
  }
  // chronological world order
  const flat: string[] = [];
  [...(t.worlds ?? [])].sort((a: any, b: any) => a.order - b.order).forEach((w: any) => w.days?.forEach((d: any) => flat.push(d.date)));
  for (let i = 1; i < flat.length; i++) if (flat[i] < flat[i - 1]) { warn('worlds', `Orden cronológico roto: ${flat[i - 1]} aparece antes que ${flat[i]}.`); break; }

  t.budget ??= { currency: 'USD', totalBudget: null, exchangeRate: null, references: [], extraItems: [], payments: [] };
  t.budget.references ??= []; t.budget.extraItems ??= []; t.budget.payments ??= [];
  t.checklist ??= [];

  let progress: Progress | undefined;
  if (progressRaw) {
    if (isObj(progressRaw) && isObj(progressRaw.activities)) {
      progress = { schemaVersion: SCHEMA_VERSION, tripId: t.id, activities: progressRaw.activities, checklist: progressRaw.checklist ?? {}, manualTargetId: progressRaw.manualTargetId ?? null, updatedAt: progressRaw.updatedAt ?? new Date().toISOString() };
      for (const k of Object.keys(progress.activities)) if (!ids.has(k)) delete progress.activities[k];
    } else warn('progress', 'Progreso inválido; se ignorará.');
  }

  const ok = !issues.some(i => i.level === 'error');
  return { ok, issues, trip: ok ? (t as TripData) : undefined, progress, summary: { worlds: t.worlds?.length ?? 0, days, activities, dates: [...dates].sort() } };
}

export function isBundle(x: unknown): x is TripBundle { return isObj(x) && (x as any).kind === 'family-trip-bundle'; }
