import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Progress, Settings, TripBundle, TripData, UserStatus } from '../types';
import { SCHEMA_VERSION } from '../types';
import { kvDel, kvGet, kvSet } from './db';
import { validateImport } from '../lib/validate';
import { flatten, type FlatActivity } from '../lib/itinerary';

interface LibraryEntry { id: string; name: string; updatedAt: string }
interface Library { activeTripId: string | null; trips: LibraryEntry[] }

const DEFAULT_SETTINGS: Settings = { travelMode: 'car', simulatedNow: null, showDop: false, nextPanelMinimized: false, mapProvider: 'google' };

function emptyProgress(tripId: string): Progress {
  return { schemaVersion: SCHEMA_VERSION, tripId, activities: {}, checklist: {}, manualTargetId: null, updatedAt: new Date().toISOString() };
}

export async function loadDefaultTrip(): Promise<TripData> {
  const r = await fetch('./data/trip.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error('No se pudo cargar data/trip.json');
  const v = validateImport(await r.json());
  if (!v.ok || !v.trip) throw new Error('El trip.json incluido no es válido: ' + v.issues.map(i => i.message).join('; '));
  return v.trip;
}

interface Store {
  ready: boolean;
  error: string | null;
  trip: TripData;
  progress: Progress;
  settings: Settings;
  library: Library;
  flat: FlatActivity[];
  now: number;
  saving: boolean;
  updateTrip: (fn: (draft: TripData) => void) => void;
  replaceTrip: (t: TripData) => void;
  setStatus: (id: string, status: UserStatus) => void;
  chooseAlternative: (mainId: string, altId: string, mainStatus: UserStatus) => void;
  setManualTarget: (id: string | null) => void;
  toggleChecklist: (id: string) => void;
  resetProgress: () => void;
  updateSettings: (p: Partial<Settings>) => void;
  importData: (trip: TripData, progress: Progress | undefined, mode: 'replace' | 'copy') => Promise<void>;
  switchTrip: (id: string) => Promise<void>;
  deleteTrip: (id: string) => Promise<void>;
  restoreDefault: () => Promise<void>;
  bundle: () => TripBundle;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trip, setTrip] = useState<TripData | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [library, setLibrary] = useState<Library>({ activeTripId: null, trips: [] });
  const [saving, setSaving] = useState(false);
  const [tick, setTick] = useState(Date.now());
  const saveTimer = useRef<number | null>(null);

  // clock
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const now = settings.simulatedNow ? Date.parse(settings.simulatedNow) : tick;

  // boot
  useEffect(() => {
    (async () => {
      try {
        const s = await kvGet<Settings>('settings');
        if (s) setSettings({ ...DEFAULT_SETTINGS, ...s });
        let lib = (await kvGet<Library>('library')) ?? { activeTripId: null, trips: [] };
        let t = lib.activeTripId ? await kvGet<TripData>(`trip:${lib.activeTripId}`) : undefined;
        if (!t) {
          t = await loadDefaultTrip();
          lib = { activeTripId: t.id, trips: [...lib.trips.filter(x => x.id !== t!.id), { id: t.id, name: t.trip.name, updatedAt: new Date().toISOString() }] };
          await kvSet(`trip:${t.id}`, t);
          await kvSet('library', lib);
        }
        const p = (await kvGet<Progress>(`progress:${t.id}`)) ?? emptyProgress(t.id);
        setTrip(t); setProgress(p); setLibrary(lib); setReady(true);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    })();
  }, []);

  const persist = useCallback((t: TripData | null, p: Progress | null) => {
    setSaving(true);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      // Always save the latest of both documents (debounced calls may coalesce).
      const lt = tripRef.current ?? t, lp = progRef.current ?? p;
      if (lt) await kvSet(`trip:${lt.id}`, lt);
      if (lp) await kvSet(`progress:${lp.tripId}`, lp);
      setSaving(false);
    }, 250);
  }, []);

  const tripRef = useRef(trip); tripRef.current = trip;
  const progRef = useRef(progress); progRef.current = progress;

  const commitTrip = useCallback((next: TripData) => {
    next.meta = { ...(next.meta ?? {}), updatedAt: new Date().toISOString() };
    tripRef.current = next;
    setTrip(next); persist(next, progRef.current);
    setLibrary(lib => {
      const l = { ...lib, trips: lib.trips.map(e => e.id === next.id ? { ...e, name: next.trip.name, updatedAt: next.meta!.updatedAt! } : e) };
      kvSet('library', l); return l;
    });
  }, [persist]);

  const updateTrip = useCallback((fn: (d: TripData) => void) => {
    if (!tripRef.current) return;
    const draft = structuredClone(tripRef.current);
    fn(draft);
    commitTrip(draft);
  }, [commitTrip]);

  const updateProgress = useCallback((fn: (d: Progress) => void) => {
    if (!progRef.current) return;
    const d = structuredClone(progRef.current);
    fn(d); d.updatedAt = new Date().toISOString();
    progRef.current = d; // allow several updates in the same tick
    setProgress(d); persist(tripRef.current, d);
  }, [persist]);

  const setStatus = useCallback((id: string, status: UserStatus) => updateProgress(p => {
    const prev = p.activities[id];
    const ts = new Date().toISOString();
    if (status === 'pending') {
      delete p.activities[id];
      // un-choosing a replacement
      for (const k of Object.keys(p.activities)) if (p.activities[k].replacedBy === id && p.activities[k].status === 'pending') delete p.activities[k];
    } else {
      p.activities[id] = { ...prev, status, updatedAt: ts, completedAt: status === 'completed' ? ts : prev?.completedAt };
      if (status === 'in_progress') {
        // only one activity in progress at a time
        for (const [k, v] of Object.entries(p.activities)) if (k !== id && v.status === 'in_progress') v.status = 'completed', v.completedAt = ts;
      }
    }
    if (p.manualTargetId === id && status !== 'in_progress' && status !== 'pending') p.manualTargetId = null;
  }), [updateProgress]);

  const chooseAlternative = useCallback((mainId: string, altId: string, mainStatus: UserStatus) => updateProgress(p => {
    const ts = new Date().toISOString();
    p.activities[mainId] = { status: mainStatus, updatedAt: ts, replacedBy: altId };
  }), [updateProgress]);

  const value = useMemo<Store | null>(() => {
    if (!trip || !progress) return null;
    return {
      ready, error, trip, progress, settings, library, now, saving,
      flat: flatten(trip),
      updateTrip,
      replaceTrip: commitTrip,
      setStatus,
      chooseAlternative,
      setManualTarget: id => updateProgress(p => { p.manualTargetId = id; }),
      toggleChecklist: id => updateProgress(p => { p.checklist[id] = !p.checklist[id]; }),
      resetProgress: () => { const p = emptyProgress(trip.id); setProgress(p); persist(null, p); },
      updateSettings: patch => setSettings(s => { const n = { ...s, ...patch }; kvSet('settings', n); return n; }),
      importData: async (t, p, mode) => {
        const nt = structuredClone(t);
        if (mode === 'copy') {
          nt.id = `${nt.id}-copia-${Date.now().toString(36)}`;
          nt.trip.name = `${nt.trip.name} (copia)`;
        }
        // replace: the imported trip becomes the active one; the trip it replaces is removed from this device.
        const replacedId = mode === 'replace' && trip.id !== nt.id ? trip.id : null;
        const keep = mode === 'replace' && nt.id === trip.id ? progress : null;
        const np: Progress = p ? { ...structuredClone(p), tripId: nt.id } : keep ? { ...keep } : emptyProgress(nt.id);
        if (replacedId) { await kvDel(`trip:${replacedId}`); await kvDel(`progress:${replacedId}`); }
        await kvSet(`trip:${nt.id}`, nt);
        await kvSet(`progress:${nt.id}`, np);
        const lib: Library = { activeTripId: nt.id, trips: [...library.trips.filter(e => e.id !== nt.id && e.id !== replacedId), { id: nt.id, name: nt.trip.name, updatedAt: new Date().toISOString() }] };
        await kvSet('library', lib);
        setLibrary(lib); setTrip(nt); setProgress(np);
      },
      switchTrip: async id => {
        const t = await kvGet<TripData>(`trip:${id}`);
        if (!t) return;
        const p = (await kvGet<Progress>(`progress:${id}`)) ?? emptyProgress(id);
        const lib = { ...library, activeTripId: id };
        await kvSet('library', lib);
        setLibrary(lib); setTrip(t); setProgress(p);
      },
      deleteTrip: async id => {
        if (id === trip.id) return;
        await kvDel(`trip:${id}`); await kvDel(`progress:${id}`);
        const lib = { ...library, trips: library.trips.filter(e => e.id !== id) };
        await kvSet('library', lib); setLibrary(lib);
      },
      restoreDefault: async () => {
        const t = await loadDefaultTrip();
        await kvSet(`trip:${t.id}`, t);
        const p = (await kvGet<Progress>(`progress:${t.id}`)) ?? emptyProgress(t.id);
        const lib: Library = { activeTripId: t.id, trips: [...library.trips.filter(e => e.id !== t.id), { id: t.id, name: t.trip.name, updatedAt: new Date().toISOString() }] };
        await kvSet('library', lib);
        setLibrary(lib); setTrip(t); setProgress(p);
      },
      bundle: () => ({ schemaVersion: SCHEMA_VERSION, kind: 'family-trip-bundle', exportedAt: new Date().toISOString(), trip, progress }),
    };
  }, [ready, error, trip, progress, settings, library, now, saving, updateTrip, commitTrip, setStatus, chooseAlternative, updateProgress, persist]);

  if (error) return <div className="fatal"><h1>No se pudo iniciar</h1><p>{error}</p><button className="btn" onClick={() => location.reload()}>Reintentar</button></div>;
  if (!value) return <div className="boot"><div className="boot-orb" /><p>Cargando la aventura…</p></div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
