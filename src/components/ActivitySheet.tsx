import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { useGeo } from '../state/geo';
import { useRoute, useStatuses } from '../state/hooks';
import { BOOKING_LABEL, COORD_LABEL, INFO_LABEL, PRIORITY_LABEL, STATUS_LABEL, TYPE_LABEL, progressStats, userStatus } from '../lib/itinerary';
import { dateLabel, formatTime, humanDuration } from '../lib/time';
import { formatDistance, haversineKm, navigationUrl, navigationUrlByQuery } from '../lib/geo';
import { CATEGORY_LABEL, COST_STATUS_LABEL, costTotal, money, travellerCount } from '../lib/budget';
import type { UserStatus, VisualStatus } from '../types';
import { Icon } from './Icons';
import { Pill, Sheet } from './Sheet';

const STATUS_TONE: Record<VisualStatus, 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'accent'> = {
  locked: 'neutral', pending: 'neutral', next: 'accent', in_progress: 'info', completed: 'good', skipped: 'neutral', cancelled: 'bad', unavailable: 'warn',
};

export function ActivitySheet({ id }: { id: string }) {
  const store = useStore();
  const { trip, flat, progress, setStatus, chooseAlternative, setManualTarget, settings } = store;
  const ui = useUI();
  const geo = useGeo();
  const statuses = useStatuses();
  const f = flat.find(x => x.activity.id === id);
  const a = f?.activity;
  const coords = a?.location?.coordinates ?? null;
  const route = useRoute(geo.position, coords, settings.travelMode);
  if (!f || !a) return null;

  const vs = statuses.get(id) ?? 'pending';
  const us = userStatus(progress, id);
  const n = travellerCount(trip);
  const total = costTotal(a.cost, n);
  const alternatives = flat.filter(x => x.activity.alternativeFor === id);
  const parent = a.alternativeFor ? flat.find(x => x.activity.id === a.alternativeFor) : null;
  const replacedBy = progress.activities[id]?.replacedBy;

  const set = (s: UserStatus) => {
    setStatus(id, s);
    if (s === 'completed') {
      ui.fireCelebrate(id);
      const st = progressStats(flat, { ...progress, activities: { ...progress.activities, [id]: { status: 'completed', updatedAt: '' } } });
      ui.notify(`¡Etapa completada! ${st.done} de ${st.total}`, 'success');
      ui.select(null);
    }
  };

  const navTarget = coords ? navigationUrl(coords, settings.mapProvider, settings.travelMode, geo.position)
    : a.location?.address ? navigationUrlByQuery(a.location.address, settings.mapProvider)
    : a.location?.geocodeQuery ? navigationUrlByQuery(a.location.geocodeQuery, settings.mapProvider) : null;

  return (
    <Sheet onClose={() => ui.select(null)}
      title={<span className="act-title"><span className={`act-ico st-${vs}`}><Icon name={a.type} size={20} /></span>{a.name}</span>}
      subtitle={<>
        <Pill tone={STATUS_TONE[vs]}>{STATUS_LABEL[vs]}</Pill>
        <Pill>{TYPE_LABEL[a.type]}</Pill>
        <Pill tone={a.priority === 'required' ? 'accent' : a.priority === 'alternative' ? 'info' : 'neutral'}>{PRIORITY_LABEL[a.priority]}</Pill>
        <span className="muted small">Mundo {f.world.order} · {dateLabel(f.date, 'short')}</span>
      </>}
      footer={
        <div className="act-actions">
          {us !== 'completed' ? (
            <button className="btn btn-primary btn-lg" onClick={() => set('completed')}><Icon name="check" /> Marcar completada</button>
          ) : (
            <button className="btn btn-lg" onClick={() => set('pending')}>Deshacer completada</button>
          )}
          <div className="act-secondary">
            {us !== 'in_progress' && us !== 'completed' && <button className="btn btn-sm" onClick={() => set('in_progress')}><Icon name="play" size={16} /> Empezar</button>}
            {us !== 'skipped' && us !== 'completed' && <button className="btn btn-sm" onClick={() => set('skipped')}><Icon name="skip" size={16} /> Omitir</button>}
            {us !== 'unavailable' && <button className="btn btn-sm" onClick={() => set('unavailable')}><Icon name="cloud" size={16} /> Clima/cierre</button>}
            {us !== 'cancelled' && <button className="btn btn-sm" onClick={() => set('cancelled')}><Icon name="x" size={16} /> Cancelar</button>}
            {us !== 'pending' && us !== 'completed' && <button className="btn btn-sm" onClick={() => set('pending')}>Restablecer</button>}
          </div>
        </div>
      }>
      {(us === 'unavailable' || us === 'cancelled' || us === 'skipped') && alternatives.length > 0 && (
        <div className="callout info">
          <b>¿Plan B?</b> Elijan una alternativa para reorganizar el día:
          <div className="alt-list">
            {alternatives.map(x => (
              <button key={x.activity.id} className={`btn btn-sm ${replacedBy === x.activity.id ? 'btn-primary' : ''}`} onClick={() => { chooseAlternative(id, x.activity.id, us); ui.select(x.activity.id); }}>
                <Icon name={x.activity.type} size={16} /> {x.activity.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {parent && (
        <div className="callout">
          Alternativa para <button className="linklike" onClick={() => ui.select(parent.activity.id)}>{parent.activity.name}</button>.
          {progress.activities[parent.activity.id]?.replacedBy !== id && (
            <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => { chooseAlternative(parent.activity.id, id, 'skipped'); ui.notify('Alternativa agregada al recorrido', 'info'); }}>Usar en lugar de la original</button>
          )}
        </div>
      )}
      {a.conditions && <div className="callout warn"><Icon name="alert" size={16} /> {a.conditions}</div>}

      {/* Navigation block */}
      <div className="nav-block">
        <div className="nav-metrics">
          {geo.position && coords ? (
            <>
              <div><span className="k">En línea recta</span><span className="v">{formatDistance(haversineKm(geo.position, coords))}</span></div>
              <div><span className="k">{settings.travelMode === 'walk' ? 'Caminando' : 'En auto'}</span>
                <span className="v">{route.loading ? 'Calculando…' : route.route ? humanDuration(route.route.minutes) + ' · ' + formatDistance(route.route.km).split(' · ')[0] : 'Sin dato del proveedor'}</span></div>
            </>
          ) : (
            <div className="muted small">{!coords ? 'Coordenadas pendientes: la distancia no se calcula.' : 'Activen la ubicación (panel de próxima parada) para ver distancia y tiempo reales.'}</div>
          )}
        </div>
        {route.route && <div className="muted tiny">Fuente: {route.route.provider}. Sin tráfico en tiempo real.</div>}
        <div className="nav-buttons">
          {navTarget && <a className="btn btn-accent" href={navTarget} target="_blank" rel="noopener noreferrer"><Icon name="route" size={18} /> Cómo llegar</a>}
          {coords && <button className="btn" onClick={() => ui.showOnMap(id)}><Icon name="map" size={18} /> Ver en mapa</button>}
          {progress.manualTargetId === id
            ? <button className="btn" onClick={() => setManualTarget(null)}>Quitar como destino</button>
            : us !== 'completed' && <button className="btn" onClick={() => setManualTarget(id)}><Icon name="pin" size={18} /> Ir aquí ahora</button>}
        </div>
      </div>

      {a.photos && a.photos.length > 0 && (
        <div className="photos">{a.photos.map(p => <figure key={p.id}><img src={p.src} alt={p.caption || a.name} loading="lazy" />{p.caption && <figcaption>{p.caption}</figcaption>}</figure>)}</div>
      )}
      {a.description && <p className="desc">{a.description}</p>}

      <dl className="facts">
        <div><dt>Horario</dt><dd>
          {a.plannedStart ? formatTime(a.plannedStart, a.timezone) : 'Hora por definir'}
          {a.plannedEnd && <> → {formatTime(a.plannedEnd, a.endTimezone || a.timezone)}</>}
          {' '}<Pill tone={a.timeStatus === 'confirmed' ? 'good' : 'warn'}>{INFO_LABEL[a.timeStatus]}</Pill>
        </dd></div>
        {a.durationMinutes != null && <div><dt>Duración</dt><dd>{humanDuration(a.durationMinutes)}</dd></div>}
        <div><dt>Lugar</dt><dd>
          {a.location ? <>
            <b>{a.location.name}</b>{a.location.address && <><br />{a.location.address}</>}
            <br /><Pill tone={a.location.coordinatesStatus === 'verified' ? 'good' : a.location.coordinatesStatus === 'pending' ? 'bad' : 'warn'}>Coordenadas: {COORD_LABEL[a.location.coordinatesStatus]}</Pill>
            {a.location.coordinatesSource && <div className="muted tiny">{a.location.coordinatesSource}</div>}
            {a.location.parking && <div className="small">Estacionamiento: {a.location.parking}</div>}
          </> : 'Por definir'}
        </dd></div>
        <div><dt>Costo</dt><dd>
          {a.cost ? <>
            {total != null ? <><b>{money(total)}</b> total ({n} personas) · {money(total / n)} p/p</> : 'Importe no disponible'}
            {a.cost.pricePerPerson != null && <> · {money(a.cost.pricePerPerson)} por persona</>}
            {a.cost.actual != null && <><br />Real: <b>{money(a.cost.actual)}</b></>}
            <br /><Pill tone={a.cost.status === 'paid' ? 'good' : a.cost.status === 'unknown' ? 'bad' : 'warn'}>{COST_STATUS_LABEL[a.cost.status]}</Pill> <Pill>{CATEGORY_LABEL[a.cost.category]}</Pill>
            {a.cost.note && <div className="muted tiny">{a.cost.note}</div>}
          </> : 'Sin costo asignado'}
        </dd></div>
        <div><dt>Reserva</dt><dd><Pill tone={a.bookingStatus === 'confirmed' ? 'good' : a.bookingStatus === 'not_applicable' ? 'neutral' : 'warn'}>{BOOKING_LABEL[a.bookingStatus]}</Pill></dd></div>
        {a.transportMode && a.transportMode !== 'none' && <div><dt>Transporte</dt><dd>{({ car: 'Auto', walk: 'A pie', plane: 'Avión', rideshare: 'UberXL / rideshare', shuttle: 'Shuttle', gondola: 'Góndola', tram: 'Tram aéreo', pending: 'Por definir', none: '' } as Record<string, string>)[a.transportMode]}</dd></div>}
        {a.travelToNext?.minutes != null && <div><dt>Al siguiente</dt><dd>{humanDuration(a.travelToNext.minutes)} <span className="muted tiny">({a.travelToNext.source})</span></dd></div>}
        {a.requirements && a.requirements.length > 0 && <div><dt>Requisitos</dt><dd><ul className="req">{a.requirements.map((r, i) => <li key={i}>{r}</li>)}</ul></dd></div>}
        {a.notes && <div><dt>Notas</dt><dd>{a.notes}</dd></div>}
        {a.links && a.links.length > 0 && <div><dt>Enlaces</dt><dd className="links">{a.links.map((l, i) => <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"><Icon name="link" size={14} /> {l.label}</a>)}</dd></div>}
        {alternatives.length > 0 && <div><dt>Alternativas</dt><dd className="links">{alternatives.map(x => <button key={x.activity.id} className="linklike" onClick={() => ui.select(x.activity.id)}>{x.activity.name}</button>)}</dd></div>}
      </dl>
      <div className="row-end">
        <button className="btn btn-ghost" onClick={() => ui.edit(id)}><Icon name="edit" size={16} /> Editar actividad</button>
      </div>
    </Sheet>
  );
}
