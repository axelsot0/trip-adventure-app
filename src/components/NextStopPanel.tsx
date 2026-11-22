import { useState } from 'react';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { isLowAccuracy, useGeo } from '../state/geo';
import { useOnline, useRecommendation, useRoute, useStatuses, useTripDay } from '../state/hooks';
import { STATUS_LABEL } from '../lib/itinerary';
import { formatDistance, haversineKm, navigationUrl } from '../lib/geo';
import { formatTime, humanDuration, relativeMinutes } from '../lib/time';
import { Icon } from './Icons';

/** Compact, dismissible "¿Adónde vamos ahora?" panel floating over the roadmap / map. */
export function NextStopPanel() {
  const { settings, updateSettings, now, setManualTarget, progress } = useStore();
  const ui = useUI();
  const geo = useGeo();
  const rec = useRecommendation();
  const statuses = useStatuses();
  const online = useOnline();
  const { phase } = useTripDay();
  const [expanded, setExpanded] = useState(false);
  const target = rec.recommended;
  const coords = target?.activity.location?.coordinates ?? null;
  const route = useRoute(geo.position, coords, settings.travelMode);

  if (!target) return null;
  const a = target.activity;
  const driving = rec.current?.activity.type === 'drive' || rec.current?.activity.transportMode === 'car';

  if (settings.nextPanelMinimized) {
    return (
      <button className="next-mini" onClick={() => updateSettings({ nextPanelMinimized: false })} aria-label={`Próxima parada: ${a.name}. Expandir panel`}>
        <Icon name="compass" size={18} /><span>{a.name}</span>
        {route.route && <em>{humanDuration(route.route.minutes)}</em>}
        <Icon name="maximize" size={16} />
      </button>
    );
  }

  const until = target.startEpoch != null ? (target.startEpoch - now) / 60000 : null;
  const navUrl = coords ? navigationUrl(coords, settings.mapProvider, settings.travelMode, geo.position) : null;
  const nearestDiffers = rec.nearest && rec.nearest.item.activity.id !== a.id;
  const kicker = progress.manualTargetId === a.id ? 'Destino elegido por ustedes' : rec.current && rec.current.activity.id !== a.id ? `En curso: ${rec.current.activity.name}` : 'Próxima parada';

  const distV = geo.position && coords ? formatDistance(haversineKm(geo.position, coords)).split(' · ')[0] : '—';
  const distS = geo.position && coords ? 'línea recta' : !coords ? 'sin coordenadas' : 'sin ubicación';
  const timeV = route.loading ? '…' : route.route ? humanDuration(route.route.minutes) : '—';
  const timeS = route.route ? 'ruta OSRM' : !online ? 'sin conexión' : route.failed ? 'sin respuesta' : !coords ? 'sin coordenadas' : 'sin ubicación';

  return (
    <aside className={`next-panel ${expanded ? 'open' : ''}`} aria-label="Próxima parada">
      <div className="np-head">
        <span className="np-kicker">{kicker}</span>
        <div className="np-head-btns">
          {geo.permission !== 'unsupported' && !geo.position && (
            <button className="icon-btn sm" onClick={geo.locate} disabled={geo.busy} aria-label="Usar mi ubicación"><Icon name="locate" size={18} /></button>
          )}
          <button className="icon-btn sm" onClick={() => setExpanded(s => !s)} aria-label={expanded ? 'Menos información' : 'Más información y opciones'} aria-expanded={expanded}><Icon name={expanded ? 'down' : 'info'} size={18} /></button>
          <button className="icon-btn sm" onClick={() => updateSettings({ nextPanelMinimized: true })} aria-label="Minimizar panel"><Icon name="minimize" size={18} /></button>
        </div>
      </div>
      <button className="np-title" onClick={() => ui.select(a.id)}>
        <Icon name={a.type} size={18} /><span>{a.name}</span>
      </button>
      {driving && <div className="np-drive"><Icon name="car" size={15} /> Modo carretera: el conductor no debe manipular la app.</div>}

      <div className="np-metrics">
        <div title={distS}><span className="k">Distancia</span><span className="v">{distV}</span><span className="s">{distS}</span></div>
        <div title={timeS}><span className="k">{settings.travelMode === 'walk' ? 'A pie' : 'En auto'}</span><span className="v">{timeV}</span><span className="s">{timeS}</span></div>
        <div><span className="k">Hora</span><span className="v">{a.plannedStart ? formatTime(a.plannedStart, a.timezone).split(' · ')[0] : '—'}</span><span className="s">{until != null ? relativeMinutes(until) : 'por definir'}</span></div>
        <div><span className="k">Estado</span><span className="v sm">{STATUS_LABEL[statuses.get(a.id) ?? 'pending']}</span></div>
      </div>

      {nearestDiffers && (
        <button className="np-nearest" onClick={() => ui.select(rec.nearest!.item.activity.id)}>
          <Icon name="pin" size={13} /> Más cercana (no es la siguiente): <b>{rec.nearest!.item.activity.name}</b> · {formatDistance(rec.nearest!.km).split(' · ')[0]}
        </button>
      )}

      {expanded && (
        <div className="np-more">
          <div className="np-why">
            {rec.reasons.map((r, i) => <p key={i}>• {r}</p>)}
            {rec.warnings.map((w, i) => <p key={'w' + i} className="warn">⚠ {w}</p>)}
            {rec.scheduledNext && rec.scheduledNext.activity.id !== a.id && <p>Siguiente en el plan: <b>{rec.scheduledNext.activity.name}</b></p>}
            <p className="muted tiny">Sugerencia calculada a partir del plan: no confirma que el lugar esté abierto.</p>
          </div>
          <div className="np-geo">
            {geo.permission === 'unsupported' ? <span className="muted tiny">Este dispositivo no ofrece GPS.</span> : !geo.position ? (
              <button className="btn btn-xs" onClick={geo.locate} disabled={geo.busy}><Icon name="locate" size={14} /> {geo.busy ? 'Buscando…' : 'Usar mi ubicación'}</button>
            ) : (
              <>
                <span className={`geo-dot ${geo.source}`} />
                <span className="tiny">{geo.source === 'manual' ? 'Ubicación manual' : `GPS ±${Math.round(geo.accuracy ?? 0)} m`}{isLowAccuracy(geo.accuracy) && <b className="warn-t"> · baja precisión</b>}</span>
                {geo.tracking ? <button className="btn btn-xs" onClick={geo.stopTracking}>Detener seguimiento</button> : <button className="btn btn-xs" onClick={geo.startTracking}>Seguimiento</button>}
                <button className="btn btn-xs" onClick={() => geo.setManual(null)}>Olvidar ubicación</button>
              </>
            )}
            <button className="btn btn-xs" onClick={() => { geo.setPicking(true); ui.setTab('map'); }}>Elegir en el mapa</button>
            <select className="mini-select" value={settings.travelMode} onChange={e => updateSettings({ travelMode: e.target.value as 'car' | 'walk' })} aria-label="Medio de transporte">
              <option value="car">Auto</option><option value="walk">A pie</option>
            </select>
          </div>
          {phase === 'before' && <p className="muted tiny">El viaje aún no empieza: se muestra la primera etapa.</p>}
        </div>
      )}
      {geo.error && <div className="tiny warn-t">{geo.error}</div>}

      <div className="np-actions">
        {navUrl ? <a className="btn btn-accent btn-sm" href={navUrl} target="_blank" rel="noopener noreferrer"><Icon name="route" size={16} /> Cómo llegar</a>
          : <button className="btn btn-sm" disabled title="Coordenadas pendientes"><Icon name="route" size={16} /> Cómo llegar</button>}
        <button className="btn btn-sm" onClick={() => ui.select(a.id)}>Ver detalles</button>
        {progress.manualTargetId && <button className="btn btn-ghost btn-sm" onClick={() => setManualTarget(null)}>Volver al plan</button>}
      </div>
    </aside>
  );
}
