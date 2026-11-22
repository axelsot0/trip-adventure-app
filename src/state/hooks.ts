import { useEffect, useMemo, useState } from 'react';
import { useStore } from './store';
import { useGeo } from './geo';
import { dateInTz, deviceTz } from '../lib/time';
import { progressStats, visualStatuses } from '../lib/itinerary';
import { recommend } from '../lib/recommend';
import { fetchRoute, type RouteResult } from '../lib/geo';
import type { Coordinates } from '../types';

/** The trip date shown as "today" (device clock or simulated) + trip phase. */
export function useTripDay() {
  const { trip, now } = useStore();
  return useMemo(() => {
    const today = dateInTz(now, deviceTz());
    const phase: 'before' | 'during' | 'after' = today < trip.trip.startDate ? 'before' : today > trip.trip.endDate ? 'after' : 'during';
    return { today, phase };
  }, [trip, now]);
}

export function useStatuses() {
  const { flat, progress } = useStore();
  const { today } = useTripDay();
  return useMemo(() => visualStatuses(flat, progress, today), [flat, progress, today]);
}

export function useStats(worldId?: string) {
  const { flat, progress } = useStore();
  return useMemo(() => progressStats(flat, progress, worldId), [flat, progress, worldId]);
}

export function useRecommendation() {
  const { flat, progress, now } = useStore();
  const { position } = useGeo();
  const { today, phase } = useTripDay();
  return useMemo(() => recommend({
    flat, progress, now, position, manualTargetId: progress.manualTargetId, date: phase === 'during' ? today : null,
  }), [flat, progress, now, position, today, phase]);
}

/** Real route from the routing provider; null when unavailable (never estimated). */
export function useRoute(from: Coordinates | null, to: Coordinates | null, mode: 'car' | 'walk') {
  const [state, setState] = useState<{ loading: boolean; route: RouteResult | null; failed: boolean }>({ loading: false, route: null, failed: false });
  const key = from && to ? `${from.lat.toFixed(4)},${from.lng.toFixed(4)}|${to.lat},${to.lng}|${mode}` : null;
  useEffect(() => {
    if (!key || !from || !to) { setState({ loading: false, route: null, failed: false }); return; }
    const ac = new AbortController();
    setState(s => ({ ...s, loading: true }));
    fetchRoute([from, to], mode, false, ac.signal).then(route => {
      if (!ac.signal.aborted) setState({ loading: false, route, failed: !route });
    });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

export function usePrefersReducedMotion() {
  const [r, setR] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const m = matchMedia('(prefers-reduced-motion: reduce)');
    const h = () => setR(m.matches);
    m.addEventListener?.('change', h);
    return () => m.removeEventListener?.('change', h);
  }, []);
  return r;
}
