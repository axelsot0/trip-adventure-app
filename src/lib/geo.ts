import type { Coordinates } from '../types';

/**
 * Geo helpers.
 * - Straight-line distance is computed locally (haversine) and always labelled "en línea recta".
 * - Driving / walking time comes ONLY from a real routing provider (OSRM instances run by FOSSGIS
 *   on OpenStreetMap data, free, no key). If the provider fails, we return null — never a made-up value.
 * - Geocoding uses OpenStreetMap Nominatim, only when the user asks for it.
 *
 * Endpoints can be overridden with VITE_ROUTING_URL / VITE_GEOCODER_URL (see README).
 */

const ROUTING_BASE = (import.meta.env?.VITE_ROUTING_URL as string | undefined) ?? 'https://routing.openstreetmap.de';
const GEOCODER_BASE = (import.meta.env?.VITE_GEOCODER_URL as string | undefined) ?? 'https://nominatim.openstreetmap.org';

export function haversineKm(a: Coordinates, b: Coordinates): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function formatDistance(km: number): string {
  const mi = km * 0.621371;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km · ${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
}

export interface RouteResult {
  minutes: number;
  km: number;
  geometry?: [number, number][]; // [lng, lat]
  provider: string;
  fetchedAt: number;
}

const routeCache = new Map<string, RouteResult>();

export async function fetchRoute(points: Coordinates[], mode: 'car' | 'walk', withGeometry = false, signal?: AbortSignal): Promise<RouteResult | null> {
  if (points.length < 2) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  const coords = points.map(p => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const profile = mode === 'walk' ? 'routed-foot' : 'routed-car';
  const key = `${profile}|${coords}|${withGeometry}`;
  const cached = routeCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < 10 * 60_000) return cached;
  const url = `${ROUTING_BASE}/${profile}/route/v1/driving/${coords}?overview=${withGeometry ? 'full' : 'false'}&geometries=geojson&alternatives=false&steps=false`;
  try {
    const r = await fetch(url, { signal });
    if (!r.ok) return null;
    const j = await r.json();
    const route = j?.routes?.[0];
    if (j.code !== 'Ok' || !route) return null;
    const res: RouteResult = {
      minutes: route.duration / 60,
      km: route.distance / 1000,
      geometry: withGeometry ? route.geometry?.coordinates : undefined,
      provider: `OSRM (${mode === 'walk' ? 'a pie' : 'en auto'}) · datos OpenStreetMap`,
      fetchedAt: Date.now(),
    };
    routeCache.set(key, res);
    return res;
  } catch {
    return null;
  }
}

export interface GeocodeHit { lat: number; lng: number; label: string }

export async function geocode(query: string): Promise<GeocodeHit[]> {
  const url = `${GEOCODER_BASE}/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`;
  const r = await fetch(url, { headers: { 'Accept-Language': 'es' } });
  if (!r.ok) throw new Error(`Geocodificador respondió ${r.status}`);
  const j = await r.json();
  return (j as any[]).map(h => ({ lat: +(+h.lat).toFixed(6), lng: +(+h.lon).toFixed(6), label: h.display_name }));
}

export function navigationUrl(dest: Coordinates, provider: 'google' | 'apple', mode: 'car' | 'walk', origin?: Coordinates | null): string {
  if (provider === 'apple') {
    const p = new URLSearchParams({ daddr: `${dest.lat},${dest.lng}`, dirflg: mode === 'walk' ? 'w' : 'd' });
    if (origin) p.set('saddr', `${origin.lat},${origin.lng}`);
    return `https://maps.apple.com/?${p}`;
  }
  const p = new URLSearchParams({ api: '1', destination: `${dest.lat},${dest.lng}`, travelmode: mode === 'walk' ? 'walking' : 'driving' });
  if (origin) p.set('origin', `${origin.lat},${origin.lng}`);
  return `https://www.google.com/maps/dir/?${p}`;
}

/** Navigation by address/name when coordinates are still pending. */
export function navigationUrlByQuery(q: string, provider: 'google' | 'apple'): string {
  return provider === 'apple'
    ? `https://maps.apple.com/?daddr=${encodeURIComponent(q)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
}
