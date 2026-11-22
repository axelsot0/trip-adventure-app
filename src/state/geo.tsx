import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Coordinates } from '../types';

/**
 * Location state shared by the GPS panel and the map.
 * Privacy: position lives in memory only. No location history is stored. Nothing is sent anywhere
 * except the coordinates of a route request when the user is looking at a destination.
 */
export type GeoPermission = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';

interface GeoState {
  permission: GeoPermission;
  position: Coordinates | null;
  accuracy: number | null;
  source: 'gps' | 'manual' | null;
  timestamp: number | null;
  tracking: boolean;
  busy: boolean;
  error: string | null;
  locate: () => void;
  startTracking: () => void;
  stopTracking: () => void;
  setManual: (c: Coordinates | null) => void;
  /** Map "pick location" mode. */
  picking: boolean;
  setPicking: (b: boolean) => void;
}

const Ctx = createContext<GeoState | null>(null);
export const useGeo = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('GeoProvider missing');
  return c;
};

const LOW_ACCURACY_M = 150;
export const isLowAccuracy = (acc: number | null) => acc != null && acc > LOW_ACCURACY_M;

export function GeoProvider({ children }: { children: ReactNode }) {
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const [permission, setPermission] = useState<GeoPermission>(supported ? 'unknown' : 'unsupported');
  const [position, setPosition] = useState<Coordinates | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [source, setSource] = useState<'gps' | 'manual' | null>(null);
  const [timestamp, setTimestamp] = useState<number | null>(null);
  const [tracking, setTracking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!supported || !(navigator as any).permissions?.query) return;
    (navigator as any).permissions.query({ name: 'geolocation' }).then((st: PermissionStatus) => {
      setPermission(st.state as GeoPermission);
      st.onchange = () => setPermission(st.state as GeoPermission);
    }).catch(() => {});
  }, [supported]);

  const onPos = useCallback((p: GeolocationPosition) => {
    setPosition({ lat: p.coords.latitude, lng: p.coords.longitude });
    setAccuracy(p.coords.accuracy);
    setTimestamp(p.timestamp);
    setSource('gps');
    setPermission('granted');
    setError(null);
    setBusy(false);
  }, []);
  const onErr = useCallback((e: GeolocationPositionError) => {
    setBusy(false);
    if (e.code === e.PERMISSION_DENIED) { setPermission('denied'); setError('Permiso de ubicación denegado. Pueden elegir la ubicación manualmente en el mapa.'); }
    else if (e.code === e.TIMEOUT) setError('El GPS tardó demasiado. Intenten de nuevo o elijan la ubicación manualmente.');
    else setError('No se pudo obtener la ubicación.');
    setTracking(false);
    if (watchId.current != null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null; }
  }, []);

  const locate = useCallback(() => {
    if (!supported) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(onPos, onErr, { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
  }, [supported, onPos, onErr]);

  const startTracking = useCallback(() => {
    if (!supported || watchId.current != null) return;
    setBusy(true);
    watchId.current = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, timeout: 30000, maximumAge: 10000 });
    setTracking(true);
  }, [supported, onPos, onErr]);

  const stopTracking = useCallback(() => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setTracking(false);
  }, []);

  useEffect(() => () => { if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current); }, []);

  const setManual = useCallback((c: Coordinates | null) => {
    stopTracking();
    setPosition(c); setAccuracy(null); setSource(c ? 'manual' : null); setTimestamp(c ? Date.now() : null);
  }, [stopTracking]);

  return (
    <Ctx.Provider value={{ permission, position, accuracy, source, timestamp, tracking, busy, error, locate, startTracking, stopTracking, setManual, picking, setPicking }}>
      {children}
    </Ctx.Provider>
  );
}
