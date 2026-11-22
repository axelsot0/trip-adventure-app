import type { Activity, TripData } from '../types';
import { findActivity, sortedWorlds, uniqueId } from './itinerary';

/** Mutating helpers meant to be used inside store.updateTrip(draft => …). */

interface Slot { worldId: string; dayIndex: number; date: string }

function slots(t: TripData): Slot[] {
  const out: Slot[] = [];
  for (const w of sortedWorlds(t)) w.days.forEach((d, i) => out.push({ worldId: w.id, dayIndex: i, date: d.date }));
  return out;
}

function retime(a: Activity, newDate: string) {
  const fix = (v: string | null) => (v ? newDate + v.slice(10) : v);
  if (a.plannedStart && a.plannedStart.slice(0, 10) !== newDate) {
    const shift = a.plannedEnd ? daysDiff(a.plannedStart.slice(0, 10), a.plannedEnd.slice(0, 10)) : 0;
    a.plannedStart = fix(a.plannedStart);
    if (a.plannedEnd) a.plannedEnd = addDaysStr(newDate, shift) + a.plannedEnd.slice(10);
  }
}
function daysDiff(a: string, b: string) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }
function addDaysStr(d: string, n: number) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

/** Move one step up/down in the chronological order; crosses day/world boundaries when at an edge. */
export function moveActivity(t: TripData, id: string, dir: -1 | 1): boolean {
  const loc = findActivity(t, id); if (!loc) return false;
  const day = loc.world.days[loc.dayIndex];
  const j = loc.index + dir;
  if (j >= 0 && j < day.activities.length) {
    [day.activities[loc.index], day.activities[j]] = [day.activities[j], day.activities[loc.index]];
    return true;
  }
  const all = slots(t);
  const k = all.findIndex(s => s.worldId === loc.world.id && s.dayIndex === loc.dayIndex);
  const target = all[k + dir];
  if (!target) return false;
  const [a] = day.activities.splice(loc.index, 1);
  const tw = t.worlds.find(w => w.id === target.worldId)!;
  const td = tw.days[target.dayIndex];
  if (dir === -1) td.activities.push(a); else td.activities.unshift(a);
  retime(a, td.date);
  return true;
}

export function moveToDay(t: TripData, id: string, worldId: string, date: string) {
  const loc = findActivity(t, id); if (!loc) return;
  const [a] = loc.world.days[loc.dayIndex].activities.splice(loc.index, 1);
  const w = t.worlds.find(x => x.id === worldId)!;
  let d = w.days.find(x => x.date === date);
  if (!d) { d = { date, activities: [] }; w.days.push(d); w.days.sort((x, y) => x.date.localeCompare(y.date)); }
  d.activities.push(a);
  retime(a, date);
}

export function newActivity(t: TripData, name: string, tz: string, extra: Partial<Activity> = {}): Activity {
  return {
    id: uniqueId(t, name), name, type: 'activity', priority: 'optional', alternativeFor: null,
    plannedStart: null, plannedEnd: null, timezone: tz, endTimezone: null, timeStatus: 'pending', durationMinutes: null,
    location: null, description: '', photos: [], cost: null, bookingStatus: 'not_applicable', transportMode: 'none',
    travelToNext: null, links: [], requirements: [], notes: '', fixedTime: false, conditions: null, ...extra,
  };
}

export function insertActivity(t: TripData, worldId: string, date: string, a: Activity, afterId?: string | null) {
  const w = t.worlds.find(x => x.id === worldId)!;
  let d = w.days.find(x => x.date === date);
  if (!d) { d = { date, activities: [] }; w.days.push(d); w.days.sort((x, y) => x.date.localeCompare(y.date)); }
  const i = afterId ? d.activities.findIndex(x => x.id === afterId) : -1;
  if (i >= 0) d.activities.splice(i + 1, 0, a); else d.activities.push(a);
}

export function deleteActivity(t: TripData, id: string) {
  const loc = findActivity(t, id); if (!loc) return;
  loc.world.days[loc.dayIndex].activities.splice(loc.index, 1);
  // detach alternatives
  for (const w of t.worlds) for (const d of w.days) for (const a of d.activities) if (a.alternativeFor === id) a.alternativeFor = null;
  t.budget.payments.forEach(p => { if (p.linkedTo === id) p.linkedTo = null; });
}

export function updateActivity(t: TripData, id: string, patch: Partial<Activity>) {
  const loc = findActivity(t, id); if (!loc) return;
  Object.assign(loc.activity, patch);
}
