import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { useOnline, useStatuses, useTripDay } from '../state/hooks';
import { STATUS_LABEL, progressStats, tripDates, isAlternativeActive } from '../lib/itinerary';
import { dateLabel, formatTime, humanDuration } from '../lib/time';
import { fetchRoute, formatDistance, haversineKm } from '../lib/geo';
import { costTotal, money, travellerCount } from '../lib/budget';
import { moveActivity } from '../lib/ops';
import { Icon } from './Icons';
import { Pill } from './Sheet';

interface Weather { tmax: number; tmin: number; precip: number | null; code: number; snow: number | null }
const WMO: Record<number, string> = { 0: 'Despejado', 1: 'Mayormente despejado', 2: 'Parcialmente nublado', 3: 'Nublado', 45: 'Niebla', 48: 'Niebla', 51: 'Llovizna', 53: 'Llovizna', 55: 'Llovizna', 61: 'Lluvia', 63: 'Lluvia', 65: 'Lluvia fuerte', 71: 'Nieve', 73: 'Nieve', 75: 'Nieve fuerte', 77: 'Granizo fino', 80: 'Chubascos', 81: 'Chubascos', 82: 'Chubascos fuertes', 85: 'Chubascos de nieve', 86: 'Chubascos de nieve', 95: 'Tormenta', 96: 'Tormenta', 99: 'Tormenta' };

export function CalendarView() {
  const { trip, flat, progress, updateTrip, setStatus } = useStore();
  const ui = useUI();
  const statuses = useStatuses();
  const online = useOnline();
  const { today, phase } = useTripDay();
  const dates = useMemo(() => tripDates(trip), [trip]);
  const initial = ui.calendarDate ?? (phase === 'during' ? today : dates[0]?.date);
  const [date, setDate] = useState(initial);
  const [legs, setLegs] = useState<'idle' | 'loading' | 'done' | 'failed'>('idle');
  const [weather, setWeather] = useState<{ state: 'idle' | 'loading' | 'ok' | 'na' | 'error'; data?: Weather; place?: string }>({ state: 'idle' });
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (ui.calendarDate) setDate(ui.calendarDate); }, [ui.calendarDate]);
  useEffect(() => {
    stripRef.current?.querySelector('[aria-current="date"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [date]);

  const dayItems = flat.filter(f => f.date === date);
  const worlds = dates.find(d => d.date === date)?.worlds ?? [];
  const mains = dayItems.filter(f => isAlternativeActive(progress, f.activity));
  const st = progressStats(dayItems, progress);
  const next = dayItems.find(f => statuses.get(f.activity.id) === 'next' || statuses.get(f.activity.id) === 'in_progress');
  const n = travellerCount(trip);
  const dayCost = dayItems.reduce((s, f) => s + (costTotal(f.activity.cost, n) ?? 0), 0);
  const firstCoord = dayItems.find(f => f.activity.location?.coordinates)?.activity.location!;

  // Weather — Open-Meteo forecast (free, no key). Only available ~16 days ahead.
  useEffect(() => {
    if (!firstCoord?.coordinates) { setWeather({ state: 'na' }); return; }
    const diff = (Date.parse(date) - Date.parse(today)) / 86400000;
    if (diff > 15 || diff < -1) { setWeather({ state: 'na', place: firstCoord.name }); return; }
    if (!online) { setWeather({ state: 'error', place: firstCoord.name }); return; }
    const ac = new AbortController();
    setWeather({ state: 'loading' });
    const { lat, lng } = firstCoord.coordinates;
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,snowfall_sum&timezone=auto&start_date=${date}&end_date=${date}`, { signal: ac.signal })
      .then(r => r.json()).then(j => {
        const d = j?.daily;
        if (!d?.time?.length) return setWeather({ state: 'error', place: firstCoord.name });
        setWeather({ state: 'ok', place: firstCoord.name, data: { tmax: d.temperature_2m_max[0], tmin: d.temperature_2m_min[0], precip: d.precipitation_probability_max?.[0] ?? null, code: d.weather_code[0], snow: d.snowfall_sum?.[0] ?? null } });
      }).catch(() => !ac.signal.aborted && setWeather({ state: 'error', place: firstCoord.name }));
    return () => ac.abort();
  }, [date, firstCoord?.coordinates?.lat, online]);

  const computeLegs = async () => {
    setLegs('loading');
    const seq = mains.filter(f => f.activity.location?.coordinates);
    const results: Record<string, { minutes: number; source: string }> = {};
    let ok = 0;
    for (let i = 0; i < seq.length - 1; i++) {
      const a = seq[i].activity.location!.coordinates!, b = seq[i + 1].activity.location!.coordinates!;
      if (a.lat === b.lat && a.lng === b.lng) continue;
      const mode = haversineKm(a, b) < 1.5 ? 'walk' : 'car';
      const r = await fetchRoute([a, b], mode);
      if (r) { ok++; results[seq[i].activity.id] = { minutes: Math.round(r.minutes), source: `${r.provider} · ${new Date().toISOString().slice(0, 10)}` }; }
    }
    if (!ok) { setLegs('failed'); return; }
    updateTrip(d => {
      for (const w of d.worlds) for (const dd of w.days) for (const a of dd.activities) {
        const r = results[a.id];
        if (r) a.travelToNext = { mode: r.source.includes('a pie') ? 'walk' : 'car', minutes: r.minutes, source: r.source };
      }
    });
    setLegs('done');
  };

  const idx = dates.findIndex(d => d.date === date);

  return (
    <div className="calendar">
      <div className="date-strip" ref={stripRef} role="tablist" aria-label="Días del viaje">
        {dates.map((d, i) => {
          const s = progressStats(flat.filter(f => f.date === d.date), progress);
          return (
            <button key={d.date} role="tab" aria-selected={d.date === date} aria-current={d.date === date ? 'date' : undefined}
              className={`date-chip ${d.date === date ? 'on' : ''} ${d.date === today ? 'today' : ''} ${s.total && s.done === s.total ? 'done' : ''}`} onClick={() => setDate(d.date)}>
              <span className="dc-n">Día {i + 1}</span>
              <span className="dc-d">{dateLabel(d.date, 'short')}</span>
              <span className={`dc-theme theme-${d.worlds[0].theme}`} />
            </button>
          );
        })}
      </div>

      <div className="day-panel">
        <div className="day-hero">
          <div>
            <h2>{dateLabel(date)}</h2>
            <p className="day-world">{worlds.map(w => `Mundo ${w.order}: ${w.name}`).join(' → ')}</p>
          </div>
          <div className="day-ring" aria-label={`${st.done} de ${st.total} completadas`}>
            <svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" className="ring-bg" /><circle cx="18" cy="18" r="15.5" className="ring-fg" style={{ strokeDasharray: `${st.total ? (st.done / st.total) * 97.4 : 0} 97.4` }} /></svg>
            <span>{st.done}/{st.total}</span>
          </div>
        </div>
        <div className="day-facts">
          {next && <div><span className="k">Próxima actividad</span><button className="linklike" onClick={() => ui.select(next.activity.id)}>{next.activity.name}</button></div>}
          <div><span className="k">Costos conocidos del día</span><b>{money(dayCost)}</b></div>
          <div><span className="k">Clima{weather.place ? ` · ${weather.place}` : ''}</span>
            {weather.state === 'ok' && weather.data ? <span>{WMO[weather.data.code] ?? '—'} · {Math.round(weather.data.tmin)}°/{Math.round(weather.data.tmax)}°C{weather.data.precip != null && ` · ${weather.data.precip}% lluvia`}{weather.data.snow ? ` · nieve ${weather.data.snow} cm` : ''} <span className="muted tiny">(Open-Meteo, pronóstico)</span></span>
              : weather.state === 'loading' ? 'Consultando…'
              : weather.state === 'na' ? <span className="muted">Pronóstico disponible ~16 días antes</span>
              : <span className="muted">No disponible</span>}
          </div>
        </div>
        <div className="day-nav">
          <button className="btn btn-sm" disabled={idx <= 0} onClick={() => setDate(dates[idx - 1].date)}><Icon name="up" size={14} style={{ transform: 'rotate(-90deg)' }} /> Anterior</button>
          <button className="btn btn-sm" disabled={st.total > 0 && st.done === st.total} onClick={() => { if (confirm('¿Marcar como completadas todas las etapas pendientes de este día?')) mains.forEach(f => { const s = statuses.get(f.activity.id); if (s === 'pending' || s === 'next' || s === 'locked' || s === 'in_progress') setStatus(f.activity.id, 'completed'); }); }}><Icon name="check" size={14} /> Completar día</button>
          <button className="btn btn-sm" onClick={computeLegs} disabled={legs === 'loading' || !online}><Icon name="route" size={14} /> {legs === 'loading' ? 'Calculando…' : 'Calcular trayectos reales'}</button>
          <button className="btn btn-sm" disabled={idx >= dates.length - 1} onClick={() => setDate(dates[idx + 1].date)}>Siguiente <Icon name="down" size={14} style={{ transform: 'rotate(-90deg)' }} /></button>
        </div>
        {legs === 'failed' && <p className="tiny warn-t">El proveedor de rutas no respondió. No se muestran tiempos.</p>}
      </div>

      {worlds.map(w => {
        const items = dayItems.filter(f => f.world.id === w.id);
        return (
          <div key={w.id} className="day-group">
            {worlds.length > 1 && <h3 className={`group-title theme-${w.theme}`}>Mundo {w.order} · {w.subtitle}</h3>}
            <ol className="day-list">
              {items.map((f, i) => {
                const a = f.activity;
                const vs = statuses.get(a.id) ?? 'pending';
                const nextWithCoords = items.slice(i + 1).find(x => x.activity.location?.coordinates);
                const c1 = a.location?.coordinates, c2 = nextWithCoords?.activity.location?.coordinates;
                const leg = c1 && c2 && (c1.lat !== c2.lat || c1.lng !== c2.lng) ? haversineKm(c1, c2) : null;
                const total = costTotal(a.cost, n);
                return (
                  <li key={a.id} className={`day-item st-${vs} ${a.priority === 'alternative' ? 'is-alt' : ''}`}>
                    <button className={`di-check st-${vs}`} onClick={() => setStatus(a.id, vs === 'completed' ? 'pending' : 'completed')}
                      aria-label={vs === 'completed' ? `Desmarcar ${a.name}` : `Marcar ${a.name} como completada`} aria-pressed={vs === 'completed'}>
                      {vs === 'completed' ? <Icon name="check" size={16} strokeWidth={3} /> : <Icon name={a.type} size={16} />}
                    </button>
                    <button className="di-main" onClick={() => ui.select(a.id)}>
                      <span className="di-time">{a.plannedStart ? formatTime(a.plannedStart, a.timezone) : 'Hora por definir'}</span>
                      <span className="di-name">{a.name}</span>
                      <span className="di-meta">
                        <Pill tone={vs === 'completed' ? 'good' : vs === 'next' ? 'accent' : vs === 'unavailable' || vs === 'cancelled' ? 'bad' : 'neutral'}>{STATUS_LABEL[vs]}</Pill>
                        {a.priority === 'optional' && <Pill>Opcional</Pill>}
                        {a.priority === 'alternative' && <Pill tone="info">Alternativa</Pill>}
                        {total != null && total > 0 && <Pill>{money(total)}</Pill>}
                      </span>
                      {(leg != null || a.travelToNext?.minutes != null) && (
                        <span className="di-leg">
                          <Icon name="down" size={12} />
                          {leg != null && <>{formatDistance(leg).split(' · ')[0]} en línea recta</>}
                          {a.travelToNext?.minutes != null && <> · {humanDuration(a.travelToNext.minutes)} ({a.travelToNext.mode === 'walk' ? 'a pie' : 'auto'}, OSRM)</>}
                        </span>
                      )}
                    </button>
                    <div className="di-order">
                      <button className="icon-btn xs" onClick={() => updateTrip(d => { moveActivity(d, a.id, -1); })} aria-label={`Subir ${a.name}`}><Icon name="up" size={16} /></button>
                      <button className="icon-btn xs" onClick={() => updateTrip(d => { moveActivity(d, a.id, 1); })} aria-label={`Bajar ${a.name}`}><Icon name="down" size={16} /></button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
      <div className="row-end pad">
        <button className="btn btn-ghost" onClick={() => ui.edit(null)}><Icon name="edit" size={16} /> Editar itinerario</button>
      </div>
    </div>
  );
}
