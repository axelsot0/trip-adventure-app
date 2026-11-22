import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MlMap, Marker, MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// Bundle MapLibre's web worker with Vite so it also works offline and from any base path.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
maplibregl.setWorkerUrl(workerUrl);
import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { isLowAccuracy, useGeo } from '../state/geo';
import { useOnline, useRecommendation, useStatuses, useTripDay } from '../state/hooks';
import { STATUS_LABEL, tripDates } from '../lib/itinerary';
import { dateLabel, humanDuration } from '../lib/time';
import { fetchRoute, formatDistance, type RouteResult } from '../lib/geo';
import { Icon } from './Icons';

/**
 * Real geographic map (MapLibre GL + OpenFreeMap vector tiles, OpenStreetMap data; no API key).
 * Geographic positions come ONLY from activity coordinates — never from the decorative roadmap layout.
 */

const STYLE_URL = (import.meta.env.VITE_MAP_STYLE_URL as string | undefined) ?? 'https://tiles.openfreemap.org/styles/liberty';
const RASTER_STYLE: any = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

function circlePolygon(lng: number, lat: number, radiusM: number) {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * 2 * Math.PI;
    const dLat = (radiusM / 111320) * Math.sin(t);
    const dLng = (radiusM / (111320 * Math.cos((lat * Math.PI) / 180))) * Math.cos(t);
    pts.push([lng + dLng, lat + dLat]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] }, properties: {} } as any;
}

export function MapView() {
  const { trip, flat, progress } = useStore();
  const ui = useUI();
  const geo = useGeo();
  const online = useOnline();
  const statuses = useStatuses();
  const rec = useRecommendation();
  const { today, phase } = useTripDay();
  const dates = useMemo(() => tripDates(trip), [trip]);
  const focusDate = ui.mapFocus ? flat.find(f => f.activity.id === ui.mapFocus!.id)?.date : null;
  const [day, setDay] = useState<string>(() => focusDate ?? (phase === 'during' ? today : 'all'));
  const [showAlts, setShowAlts] = useState(true);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeState, setRouteState] = useState<'idle' | 'loading' | 'ok' | 'failed' | 'schematic'>('idle');
  const [mapError, setMapError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [styleRev, setStyleRev] = useState(0);
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const meRef = useRef<Marker | null>(null);

  useEffect(() => { if (focusDate) setDay(focusDate); }, [ui.mapFocus?.at]);

  const items = useMemo(() => flat.filter(f => f.activity.location?.coordinates && (day === 'all' || f.date === day) && (showAlts || f.activity.priority !== 'alternative')), [flat, day, showAlts]);
  const pendingCount = useMemo(() => flat.filter(f => (day === 'all' || f.date === day) && !f.activity.location?.coordinates).length, [flat, day]);

  // init map
  useEffect(() => {
    if (!elRef.current) return;
    let usedFallback = false;
    const map = new maplibregl.Map({ container: elRef.current, style: STYLE_URL, center: [-82.5, 30.5], zoom: 4.2, attributionControl: { compact: true } });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('error', (e: unknown) => {
      if (!map.isStyleLoaded() && !usedFallback) { usedFallback = true; map.setStyle(RASTER_STYLE); }
      else if (!navigator.onLine) setMapError('Sin conexión: el mapa base puede no cargar. El itinerario sigue disponible.');
      void e;
    });
    map.on('style.load', () => { ensureLayers(map); setStyleRev(r => r + 1); setLoaded(true); });
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // manual location picking
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const h = (e: MapMouseEvent) => {
      if (!geo.picking) return;
      geo.setManual({ lat: +e.lngLat.lat.toFixed(6), lng: +e.lngLat.lng.toFixed(6) });
      geo.setPicking(false);
      ui.notify('Ubicación manual establecida', 'info');
    };
    map.on('click', h);
    map.getCanvas().style.cursor = geo.picking ? 'crosshair' : '';
    return () => { map.off('click', h); };
  }, [geo.picking]);

  // markers
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    const seen = new Map<string, number>();
    items.forEach((f, idx) => {
      const c = f.activity.location!.coordinates!;
      const key = `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`;
      const dup = seen.get(key) ?? 0; seen.set(key, dup + 1);
      const st = statuses.get(f.activity.id) ?? 'pending';
      const el = document.createElement('button');
      el.className = `mk st-${st} ${f.activity.priority === 'alternative' ? 'mk-alt' : ''} ${rec.recommended?.activity.id === f.activity.id ? 'mk-target' : ''}`;
      el.innerHTML = `<span>${day === 'all' ? '' : idx + 1}</span>`;
      el.setAttribute('aria-label', `${f.activity.name} — ${STATUS_LABEL[st]}`);
      el.title = f.activity.name;
      el.onclick = ev => { ev.stopPropagation(); ui.select(f.activity.id); };
      const m = new maplibregl.Marker({ element: el, offset: [dup * 14, -dup * 14] }).setLngLat([c.lng, c.lat]).addTo(map);
      markersRef.current.push(m);
    });
  }, [items, statuses, rec.recommended?.activity.id, day]);

  // fit bounds when the filter changes
  useEffect(() => {
    const map = mapRef.current; if (!map || !items.length) return;
    if (ui.mapFocus && Date.now() - ui.mapFocus.at < 1500) return;
    const b = new maplibregl.LngLatBounds();
    items.forEach(f => b.extend([f.activity.location!.coordinates!.lng, f.activity.location!.coordinates!.lat]));
    map.resize();
    map.fitBounds(b, { padding: { top: 110, bottom: 230, left: 40, right: 70 }, maxZoom: 14, duration: loaded ? 600 : 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, items.length, loaded]);

  // focus a specific activity (sync from roadmap / sheet)
  useEffect(() => {
    const map = mapRef.current; if (!map || !ui.mapFocus) return;
    const f = flat.find(x => x.activity.id === ui.mapFocus!.id);
    const c = f?.activity.location?.coordinates;
    if (c) map.flyTo({ center: [c.lng, c.lat], zoom: 14, duration: 900 });
  }, [ui.mapFocus?.at]);

  // route line
  useEffect(() => {
    const map = mapRef.current; if (!map || !loaded) return;
    const ac = new AbortController();
    const mains = items.filter(f => f.activity.priority !== 'alternative');
    const pts = mains.map(f => f.activity.location!.coordinates!).filter((p, i, arr) => i === 0 || p.lat !== arr[i - 1].lat || p.lng !== arr[i - 1].lng);
    const setLine = (coords: [number, number][], schematic: boolean) => {
      ensureLayers(map);
      (map.getSource('route') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'Feature', properties: { schematic }, geometry: { type: 'LineString', coordinates: coords } } as any);
      map.setPaintProperty('route-line', 'line-dasharray', schematic ? [1.5, 2] : [1, 0]);
    };
    if (pts.length < 2) { setLine([], false); setRoute(null); setRouteState('idle'); return; }
    if (day === 'all' || pts.length > 24) {
      setLine(pts.map(p => [p.lng, p.lat]), true); setRoute(null); setRouteState('schematic'); return;
    }
    setRouteState('loading');
    fetchRoute(pts, 'car', true, ac.signal).then(r => {
      if (ac.signal.aborted) return;
      if (r?.geometry) { setLine(r.geometry, false); setRoute(r); setRouteState('ok'); }
      else { setLine(pts.map(p => [p.lng, p.lat]), true); setRoute(null); setRouteState('failed'); }
    });
    return () => ac.abort();
  }, [items, day, loaded, styleRev]);

  // my position
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (!geo.position) { meRef.current?.remove(); meRef.current = null; if (loaded && map.getSource('acc')) (map.getSource('acc') as any).setData({ type: 'FeatureCollection', features: [] }); return; }
    if (!meRef.current) {
      const el = document.createElement('div'); el.className = 'me-dot'; el.setAttribute('aria-label', 'Nuestra ubicación');
      meRef.current = new maplibregl.Marker({ element: el }).setLngLat([geo.position.lng, geo.position.lat]).addTo(map);
    } else meRef.current.setLngLat([geo.position.lng, geo.position.lat]);
    meRef.current!.getElement().classList.toggle('manual', geo.source === 'manual');
    if (loaded) {
      ensureLayers(map);
      (map.getSource('acc') as any)?.setData(geo.accuracy ? circlePolygon(geo.position.lng, geo.position.lat, geo.accuracy) : { type: 'FeatureCollection', features: [] });
    }
    if (geo.tracking) map.easeTo({ center: [geo.position.lng, geo.position.lat], duration: 500 });
  }, [geo.position, geo.accuracy, geo.tracking, loaded, styleRev]);

  const centerOnMe = () => {
    if (geo.position) mapRef.current?.flyTo({ center: [geo.position.lng, geo.position.lat], zoom: 14 });
    else geo.locate();
  };

  return (
    <div className="map-view">
      <div className="map-toolbar">
        <select value={day} onChange={e => setDay(e.target.value)} aria-label="Filtrar por día">
          <option value="all">Todo el viaje</option>
          {dates.map(d => <option key={d.date} value={d.date}>{dateLabel(d.date, 'short')} · {d.worlds.map(w => w.subtitle).join(' → ')}</option>)}
        </select>
        <label className="chk"><input type="checkbox" checked={showAlts} onChange={e => setShowAlts(e.target.checked)} /> Alternativas</label>
      </div>
      <div ref={elRef} className="map-canvas" role="region" aria-label="Mapa geográfico del itinerario" />
      <div className="map-fabs">
        <button className={`fab ${geo.position && geo.source === 'gps' ? 'on' : ''}`} onClick={centerOnMe} aria-label="Centrar en mi ubicación"><Icon name="locate" /></button>
        <button className={`fab ${geo.tracking ? 'on' : ''}`} onClick={() => geo.tracking ? geo.stopTracking() : geo.startTracking()} aria-label={geo.tracking ? 'Detener seguimiento' : 'Activar seguimiento'} aria-pressed={geo.tracking}><Icon name="compass" /></button>
        <button className={`fab ${geo.picking ? 'on' : ''}`} onClick={() => geo.setPicking(!geo.picking)} aria-label="Elegir ubicación manualmente" aria-pressed={geo.picking}><Icon name="pin" /></button>
      </div>
      <div className="map-legend">
        {geo.picking && <div className="callout info tiny">Toquen el mapa para fijar su ubicación manualmente.</div>}
        {!online && <div className="callout warn tiny"><Icon name="wifiOff" size={14} /> Sin conexión: el mapa base y las rutas pueden no estar disponibles.</div>}
        {mapError && <div className="callout warn tiny">{mapError}</div>}
        {isLowAccuracy(geo.accuracy) && <div className="callout warn tiny">GPS con poca precisión (±{Math.round(geo.accuracy!)} m).</div>}
        <div className="tiny">
          {routeState === 'loading' && 'Calculando ruta real…'}
          {routeState === 'ok' && route && <>Ruta prevista del día: <b>{formatDistance(route.km)}</b> · <b>{humanDuration(route.minutes)}</b> en auto <span className="muted">({route.provider}, sin tráfico)</span></>}
          {routeState === 'failed' && 'Proveedor de rutas sin respuesta: línea discontinua = trazado esquemático, no es una ruta.'}
          {routeState === 'schematic' && 'Línea discontinua = trazado esquemático entre paradas (no es una ruta de manejo).'}
          {pendingCount > 0 && <> · {pendingCount} paradas sin coordenadas no aparecen</>}
        </div>
      </div>
    </div>
  );
}

function ensureLayers(map: MlMap) {
  if (!map.isStyleLoaded()) return;
  if (!map.getSource('route')) {
    map.addSource('route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } } as any });
    map.addLayer({ id: 'route-casing', type: 'line', source: 'route', paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.85 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#ff7a59', 'line-width': 4.5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
  }
  if (!map.getSource('acc')) {
    map.addSource('acc', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } as any });
    map.addLayer({ id: 'acc-fill', type: 'fill', source: 'acc', paint: { 'fill-color': '#2f80ed', 'fill-opacity': 0.12 } });
  }
}
