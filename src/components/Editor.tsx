import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { useGeo } from '../state/geo';
import { BOOKING_LABEL, COORD_LABEL, INFO_LABEL, PRIORITY_LABEL, TYPE_LABEL, findActivity, sortedWorlds, tripDates } from '../lib/itinerary';
import { CATEGORY_LABEL, COST_STATUS_LABEL } from '../lib/budget';
import { dateLabel } from '../lib/time';
import { geocode, type GeocodeHit } from '../lib/geo';
import { deleteActivity, insertActivity, moveActivity, moveToDay, newActivity, updateActivity } from '../lib/ops';
import { validateImport } from '../lib/validate';
import type { Activity, Cost } from '../types';
import { Icon } from './Icons';
import { Sheet } from './Sheet';

const TZS = ['America/Santo_Domingo', 'America/New_York', 'America/Chicago'];

/** Visual itinerary editor + raw JSON editor. Both write to the same TripData. */
export function Editor() {
  const { trip, updateTrip, replaceTrip } = useStore();
  const ui = useUI();
  const [tab, setTab] = useState<'visual' | 'json'>('visual');
  const [sel, setSel] = useState<string | null>(ui.editorTarget);
  const worlds = sortedWorlds(trip);

  return (
    <Sheet title="Editar itinerario" subtitle="Los cambios se guardan automáticamente y se reflejan en todas las vistas" onClose={ui.close} full>
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'visual'} className={tab === 'visual' ? 'on' : ''} onClick={() => setTab('visual')}>Editor visual</button>
        <button role="tab" aria-selected={tab === 'json'} className={tab === 'json' ? 'on' : ''} onClick={() => setTab('json')}>JSON</button>
      </div>
      {tab === 'json' ? <JsonEditor onApply={t => { replaceTrip(t); ui.notify('JSON aplicado', 'success'); }} /> : (
        <div className="editor">
          <nav className={`ed-tree ${sel ? 'has-sel' : ''}`} aria-label="Estructura del viaje">
            <TripMeta />
            {worlds.map(w => (
              <details key={w.id} open={w.days.some(d => d.activities.some(a => a.id === sel)) || !sel}>
                <summary className={`ed-world theme-${w.theme}`}>
                  <span>Mundo {w.order}</span>
                  <input className="inline-input" defaultValue={w.name} key={w.name} onClick={e => e.stopPropagation()} onBlur={e => updateTrip(d => { d.worlds.find(x => x.id === w.id)!.name = e.target.value || w.name; })} aria-label="Nombre del mundo" />
                </summary>
                {w.days.map(d => (
                  <div key={d.date} className="ed-day">
                    <div className="ed-day-head">
                      <b>{dateLabel(d.date, 'short')}</b>
                      <input className="inline-input" placeholder="Título del día" defaultValue={d.title ?? ''} key={d.title} onBlur={e => updateTrip(t => { const dd = t.worlds.find(x => x.id === w.id)!.days.find(x => x.date === d.date)!; dd.title = e.target.value; })} aria-label="Título del día" />
                      <button className="icon-btn xs" aria-label="Agregar actividad a este día" onClick={() => {
                        const name = prompt('Nombre de la nueva actividad'); if (!name) return;
                        let id = '';
                        updateTrip(t => { const a = newActivity(t, name, d.activities[0]?.timezone ?? 'America/New_York'); id = a.id; insertActivity(t, w.id, d.date, a); });
                        setTimeout(() => setSel(id), 0);
                      }}><Icon name="plus" size={16} /></button>
                    </div>
                    <ul>
                      {d.activities.map(a => (
                        <li key={a.id} className={`ed-act ${sel === a.id ? 'on' : ''} ${a.priority === 'alternative' ? 'alt' : ''}`}>
                          <button className="ed-act-btn" onClick={() => setSel(a.id)}><Icon name={a.type} size={15} /> {a.name}</button>
                          <button className="icon-btn xs" onClick={() => updateTrip(t => { moveActivity(t, a.id, -1); })} aria-label={`Subir ${a.name}`}><Icon name="up" size={14} /></button>
                          <button className="icon-btn xs" onClick={() => updateTrip(t => { moveActivity(t, a.id, 1); })} aria-label={`Bajar ${a.name}`}><Icon name="down" size={14} /></button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <button className="btn btn-xs btn-ghost" onClick={() => {
                  const date = prompt('Fecha del nuevo día (AAAA-MM-DD)', w.days.at(-1)?.date ?? trip.trip.startDate);
                  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
                  updateTrip(t => { const ww = t.worlds.find(x => x.id === w.id)!; if (!ww.days.some(x => x.date === date)) { ww.days.push({ date, activities: [] }); ww.days.sort((x, y) => x.date.localeCompare(y.date)); } });
                }}><Icon name="plus" size={14} /> Agregar día</button>
              </details>
            ))}
          </nav>
          <div className="ed-form-wrap">
            {sel && findActivity(trip, sel) ? <ActivityForm id={sel} onBack={() => setSel(null)} onSelect={setSel} /> : <p className="muted pad">Seleccionen una actividad para editarla.</p>}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function TripMeta() {
  const { trip, updateTrip } = useStore();
  return (
    <details className="ed-meta">
      <summary>Datos del viaje</summary>
      <label>Nombre<input defaultValue={trip.trip.name} onBlur={e => updateTrip(d => { d.trip.name = e.target.value || d.trip.name; })} /></label>
      <div className="two">
        <label>Inicio<input type="date" defaultValue={trip.trip.startDate} onBlur={e => updateTrip(d => { if (e.target.value) d.trip.startDate = e.target.value; })} /></label>
        <label>Fin<input type="date" defaultValue={trip.trip.endDate} onBlur={e => updateTrip(d => { if (e.target.value) d.trip.endDate = e.target.value; })} /></label>
      </div>
      <div className="two">
        <label>Adultos<input type="number" min={0} defaultValue={trip.trip.travelers.adults} onBlur={e => updateTrip(d => { d.trip.travelers.adults = Math.max(0, +e.target.value || 0); })} /></label>
        <label>Edades menores<input defaultValue={trip.trip.travelers.minors.join(', ')} onBlur={e => updateTrip(d => { d.trip.travelers.minors = e.target.value.split(',').map(x => +x.trim()).filter(x => x > 0); })} /></label>
      </div>
    </details>
  );
}

function ActivityForm({ id, onBack, onSelect }: { id: string; onBack: () => void; onSelect: (id: string | null) => void }) {
  const { trip, updateTrip } = useStore();
  const ui = useUI();
  const geo = useGeo();
  const loc = findActivity(trip, id)!;
  const a = loc.activity;
  const dates = useMemo(() => tripDates(trip), [trip]);
  const [geoQ, setGeoQ] = useState(a.location?.geocodeQuery || a.location?.address || a.location?.name || a.name);
  const [hits, setHits] = useState<GeocodeHit[] | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  useEffect(() => { setHits(null); setGeoErr(null); setGeoQ(a.location?.geocodeQuery || a.location?.address || a.location?.name || a.name); }, [id]);

  const up = (patch: Partial<Activity>) => updateTrip(t => updateActivity(t, id, patch));
  const upLoc = (patch: Partial<NonNullable<Activity['location']>>) => updateTrip(t => {
    const x = findActivity(t, id)!.activity;
    x.location = { name: x.name, address: null, geocodeQuery: null, coordinates: null, coordinatesStatus: 'pending', coordinatesSource: null, ...(x.location ?? {}), ...patch };
  });
  const upCost = (patch: Partial<Cost>) => updateTrip(t => {
    const x = findActivity(t, id)!.activity;
    x.cost = { pricePerPerson: null, total: null, actual: null, currency: 'USD', status: 'unknown', category: 'other', refundableDeposit: null, note: null, ...(x.cost ?? {}), ...patch };
  });
  const n = (v: string) => (v.trim() === '' ? null : isFinite(+v.replace(',', '.')) ? +v.replace(',', '.') : null);
  const k = id; // remount inputs when switching activity

  const doGeocode = async () => {
    setGeoErr(null); setHits(null);
    try { const h = await geocode(geoQ); setHits(h); if (!h.length) setGeoErr('Sin resultados en OpenStreetMap.'); }
    catch (e: any) { setGeoErr(e?.message ?? 'Error de geocodificación'); }
  };

  const addPhoto = async (file: File) => {
    const src = await resizeImage(file, 1280);
    updateTrip(t => { const x = findActivity(t, id)!.activity; x.photos = [...(x.photos ?? []), { id: 'ph-' + Date.now().toString(36), src, caption: '' }]; });
  };

  return (
    <div className="ed-form" key={k}>
      <div className="ed-form-head">
        <button className="btn btn-sm btn-ghost ed-back" onClick={onBack}><Icon name="up" size={14} style={{ transform: 'rotate(-90deg)' }} /> Lista</button>
        <span className="muted tiny">id: {a.id}</span>
      </div>
      <fieldset>
        <legend>General</legend>
        <label>Nombre<input defaultValue={a.name} onBlur={e => e.target.value && up({ name: e.target.value })} /></label>
        <div className="two">
          <label>Tipo<select defaultValue={a.type} onChange={e => up({ type: e.target.value as Activity['type'] })}>{Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>Prioridad<select defaultValue={a.priority} onChange={e => up({ priority: e.target.value as Activity['priority'] })}>{Object.entries(PRIORITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        </div>
        {a.priority === 'alternative' && (
          <label>Alternativa de<select defaultValue={a.alternativeFor ?? ''} onChange={e => up({ alternativeFor: e.target.value || null })}>
            <option value="">— Ninguna —</option>
            {dates.flatMap(d => d.worlds.flatMap(w => w.days.filter(x => x.date === d.date).flatMap(x => x.activities))).filter(x => x.id !== id && x.priority !== 'alternative').map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select></label>
        )}
        <label>Descripción<textarea rows={2} defaultValue={a.description} onBlur={e => up({ description: e.target.value })} /></label>
        <div className="two">
          <label>Día<select value={loc.world.days[loc.dayIndex].date + '|' + loc.world.id} onChange={e => { const [d, w] = e.target.value.split('|'); updateTrip(t => moveToDay(t, id, w, d)); }}>
            {dates.flatMap(d => d.worlds.map(w => <option key={d.date + w.id} value={d.date + '|' + w.id}>{dateLabel(d.date, 'short')} · M{w.order} {w.subtitle}</option>))}
          </select></label>
          <label>Reserva<select defaultValue={a.bookingStatus} onChange={e => up({ bookingStatus: e.target.value as Activity['bookingStatus'] })}>{Object.entries(BOOKING_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Horario</legend>
        <div className="two dt">
          <label>Inicio (hora local)<input type="datetime-local" defaultValue={a.plannedStart ?? ''} onBlur={e => up({ plannedStart: e.target.value ? e.target.value.slice(0, 16) : null })} /></label>
          <label>Zona horaria<select defaultValue={a.timezone} onChange={e => up({ timezone: e.target.value })}>{TZS.map(z => <option key={z}>{z}</option>)}</select></label>
        </div>
        <div className="two dt">
          <label>Fin (hora local)<input type="datetime-local" defaultValue={a.plannedEnd ?? ''} onBlur={e => up({ plannedEnd: e.target.value ? e.target.value.slice(0, 16) : null })} /></label>
          <label>Zona del fin<select defaultValue={a.endTimezone ?? ''} onChange={e => up({ endTimezone: e.target.value || null })}><option value="">Igual que inicio</option>{TZS.map(z => <option key={z}>{z}</option>)}</select></label>
        </div>
        <div className="two">
          <label>Fiabilidad<select defaultValue={a.timeStatus} onChange={e => up({ timeStatus: e.target.value as Activity['timeStatus'] })}>{Object.entries(INFO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>Duración (min)<input inputMode="numeric" defaultValue={a.durationMinutes ?? ''} onBlur={e => up({ durationMinutes: n(e.target.value) })} /></label>
        </div>
        <label className="chk"><input type="checkbox" defaultChecked={!!a.fixedTime} onChange={e => up({ fixedTime: e.target.checked })} /> Hora fija (reserva/entrada/vuelo): el GPS la prioriza</label>
      </fieldset>

      <fieldset>
        <legend>Lugar</legend>
        <label>Nombre del lugar<input defaultValue={a.location?.name ?? ''} onBlur={e => upLoc({ name: e.target.value })} /></label>
        <label>Dirección<input defaultValue={a.location?.address ?? ''} onBlur={e => upLoc({ address: e.target.value || null })} /></label>
        <label>Estacionamiento<input defaultValue={a.location?.parking ?? ''} onBlur={e => upLoc({ parking: e.target.value || null })} /></label>
        <div className="coord-row">
          <span>Coordenadas: <b>{a.location?.coordinates ? `${a.location.coordinates.lat}, ${a.location.coordinates.lng}` : 'pendientes'}</b> · {COORD_LABEL[a.location?.coordinatesStatus ?? 'pending']}</span>
          {a.location?.coordinatesSource && <span className="tiny muted">{a.location.coordinatesSource}</span>}
        </div>
        <label>Coordenadas manuales (lat, lng)<input inputMode="decimal" placeholder="35.7106, -83.5064"
          defaultValue={a.location?.coordinates ? `${a.location.coordinates.lat}, ${a.location.coordinates.lng}` : ''} key={'c' + a.location?.coordinates?.lat + a.location?.coordinates?.lng}
          onBlur={e => {
            const m = e.target.value.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)\s*$/);
            if (!m) return;
            const lat = +m[1], lng = +m[2];
            if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
            if (lat === a.location?.coordinates?.lat && lng === a.location?.coordinates?.lng) return;
            upLoc({ coordinates: { lat, lng }, coordinatesStatus: 'verified', coordinatesSource: 'Ingresadas manualmente' });
          }} /></label>
        <div className="row-wrap">
          <input className="grow" value={geoQ} onChange={e => setGeoQ(e.target.value)} aria-label="Buscar lugar en OpenStreetMap" />
          <button className="btn btn-sm" onClick={doGeocode}><Icon name="pin" size={14} /> Buscar (OSM)</button>
          {geo.position && <button className="btn btn-sm" onClick={() => upLoc({ coordinates: { ...geo.position! }, coordinatesStatus: geo.source === 'gps' ? 'verified' : 'approximate', coordinatesSource: geo.source === 'gps' ? `GPS del dispositivo (±${Math.round(geo.accuracy ?? 0)} m)` : 'Elegidas en el mapa' })}>Usar mi ubicación</button>}
          {a.location?.coordinates && <button className="btn btn-sm btn-ghost" onClick={() => upLoc({ coordinates: null, coordinatesStatus: 'pending', coordinatesSource: null })}>Borrar coords</button>}
        </div>
        {geoErr && <p className="tiny warn-t">{geoErr}</p>}
        {hits && hits.length > 0 && (
          <ul className="hits">{hits.map((h, i) => (
            <li key={i}><button className="row" onClick={() => { upLoc({ coordinates: { lat: h.lat, lng: h.lng }, coordinatesStatus: 'geocoded', coordinatesSource: `OpenStreetMap Nominatim · ${new Date().toISOString().slice(0, 10)} · ${h.label.slice(0, 80)}`, geocodeQuery: geoQ }); setHits(null); }}>
              <Icon name="pin" size={14} /><span className="small">{h.label}</span></button></li>))}
          </ul>
        )}
        <p className="tiny muted">Verifiquen el resultado: la geocodificación puede elegir un lugar homónimo.</p>
      </fieldset>

      <fieldset>
        <legend>Costo</legend>
        <div className="two">
          <label>Total grupo (USD)<input inputMode="decimal" defaultValue={a.cost?.total ?? ''} onBlur={e => upCost({ total: n(e.target.value) })} /></label>
          <label>Por persona (USD)<input inputMode="decimal" defaultValue={a.cost?.pricePerPerson ?? ''} onBlur={e => upCost({ pricePerPerson: n(e.target.value) })} /></label>
        </div>
        <div className="two">
          <label>Estado<select defaultValue={a.cost?.status ?? 'unknown'} onChange={e => upCost({ status: e.target.value as Cost['status'] })}>{Object.entries(COST_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>Categoría<select defaultValue={a.cost?.category ?? 'other'} onChange={e => upCost({ category: e.target.value as Cost['category'] })}>{Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        </div>
        <div className="two">
          <label>Gasto real (USD)<input inputMode="decimal" defaultValue={a.cost?.actual ?? ''} onBlur={e => upCost({ actual: n(e.target.value) })} /></label>
          <label>Depósito reembolsable<input inputMode="decimal" defaultValue={a.cost?.refundableDeposit ?? ''} onBlur={e => upCost({ refundableDeposit: n(e.target.value) })} /></label>
        </div>
        <label>Nota del costo<input defaultValue={a.cost?.note ?? ''} onBlur={e => upCost({ note: e.target.value || null })} /></label>
      </fieldset>

      <fieldset>
        <legend>Detalles</legend>
        <label>Condiciones (clima, apertura…)<input defaultValue={a.conditions ?? ''} onBlur={e => up({ conditions: e.target.value || null })} /></label>
        <label>Requisitos (uno por línea)<textarea rows={3} defaultValue={(a.requirements ?? []).join('\n')} onBlur={e => up({ requirements: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })} /></label>
        <label>Notas<textarea rows={3} defaultValue={a.notes} onBlur={e => up({ notes: e.target.value })} /></label>
        <label>Enlaces (Etiqueta | URL, uno por línea)<textarea rows={2} defaultValue={(a.links ?? []).map(l => `${l.label} | ${l.url}`).join('\n')}
          onBlur={e => up({ links: e.target.value.split('\n').map(s => s.split('|').map(x => x.trim())).filter(p => p[1] && /^https?:\/\//.test(p[1])).map(p => ({ label: p[0] || p[1], url: p[1] })) })} /></label>
        <label>Transporte<select defaultValue={a.transportMode ?? 'none'} onChange={e => up({ transportMode: e.target.value as Activity['transportMode'] })}>
          {[['none', '—'], ['car', 'Auto'], ['walk', 'A pie'], ['plane', 'Avión'], ['rideshare', 'Rideshare'], ['shuttle', 'Shuttle'], ['gondola', 'Góndola'], ['tram', 'Tram'], ['pending', 'Por definir']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select></label>
      </fieldset>

      <fieldset>
        <legend>Fotografías</legend>
        <div className="photo-edit">
          {(a.photos ?? []).map(p => (
            <figure key={p.id}><img src={p.src} alt="" /><button className="icon-btn xs" aria-label="Quitar foto" onClick={() => updateTrip(t => { const x = findActivity(t, id)!.activity; x.photos = (x.photos ?? []).filter(y => y.id !== p.id); })}><Icon name="trash" size={13} /></button></figure>
          ))}
        </div>
        <div className="row-wrap">
          <label className="btn btn-sm"><Icon name="photo" size={14} /> Subir foto<input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) addPhoto(f); e.target.value = ''; }} /></label>
          <button className="btn btn-sm" onClick={() => { const url = prompt('URL de la imagen (https://…)'); if (url && /^https?:\/\//.test(url)) updateTrip(t => { const x = findActivity(t, id)!.activity; x.photos = [...(x.photos ?? []), { id: 'ph-' + Date.now().toString(36), src: url }]; }); }}>Agregar por URL</button>
        </div>
        <p className="tiny muted">Las fotos subidas se guardan en el dispositivo y viajan dentro del JSON exportado.</p>
      </fieldset>

      <div className="row-wrap danger-zone">
        <button className="btn btn-sm" onClick={() => {
          let nid = '';
          updateTrip(t => { const alt = newActivity(t, `Alternativa a ${a.name}`, a.timezone, { priority: 'alternative', alternativeFor: a.id, type: a.type }); nid = alt.id; insertActivity(t, loc.world.id, loc.world.days[loc.dayIndex].date, alt, a.id); });
          setTimeout(() => onSelect(nid), 0);
        }}><Icon name="route" size={14} /> Crear alternativa</button>
        <button className="btn btn-sm" onClick={() => { ui.close(); ui.select(id); }}>Ver en la aventura</button>
        <button className="btn btn-sm danger" onClick={() => { if (confirm(`¿Eliminar "${a.name}" del itinerario? Pueden recuperarla importando un respaldo.`)) { updateTrip(t => deleteActivity(t, id)); onSelect(null); } }}><Icon name="trash" size={14} /> Eliminar</button>
      </div>
    </div>
  );
}

function JsonEditor({ onApply }: { onApply: (t: any) => void }) {
  const { trip } = useStore();
  const [text, setText] = useState(() => JSON.stringify(trip, null, 2));
  const [res, setRes] = useState<ReturnType<typeof validateImport> | null>(null);
  useEffect(() => { setText(JSON.stringify(trip, null, 2)); }, [trip]);
  const check = () => { try { setRes(validateImport(JSON.parse(text))); } catch (e: any) { setRes({ ok: false, issues: [{ level: 'error', path: '$', message: 'JSON mal formado: ' + e.message }] }); } };
  return (
    <div className="json-ed">
      <textarea value={text} onChange={e => { setText(e.target.value); setRes(null); }} spellCheck={false} aria-label="JSON del itinerario" />
      <div className="row-wrap">
        <button className="btn" onClick={check}>Validar</button>
        <button className="btn btn-primary" disabled={!res?.ok} onClick={() => res?.trip && onApply(res.trip)}>Aplicar cambios</button>
        <button className="btn btn-ghost" onClick={() => { setText(JSON.stringify(trip, null, 2)); setRes(null); }}>Descartar</button>
      </div>
      {res && <IssueList issues={res.issues} ok={res.ok} />}
    </div>
  );
}

export function IssueList({ issues, ok }: { issues: { level: string; path: string; message: string }[]; ok: boolean }) {
  return (
    <div className={`callout ${ok ? 'good' : 'bad'}`}>
      <b>{ok ? 'Estructura válida' : 'Hay errores: no se aplicará nada'}</b>
      {issues.length > 0 && <ul className="issues">{issues.slice(0, 40).map((i, k) => <li key={k} className={i.level}><code>{i.path}</code> {i.message}</li>)}</ul>}
      {issues.length > 40 && <p className="tiny">…y {issues.length - 40} más</p>}
    </div>
  );
}

function resizeImage(file: File, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = reject;
    img.src = url;
  });
}
