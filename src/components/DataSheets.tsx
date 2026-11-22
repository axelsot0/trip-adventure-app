import { useRef, useState } from 'react';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { useStats, useTripDay } from '../state/hooks';
import { validateImport, type ValidationResult } from '../lib/validate';
import { budgetCsv, money, summarize } from '../lib/budget';
import { BOOKING_LABEL, sortedWorlds, userStatus, tripDates } from '../lib/itinerary';
import { dateLabel, epochToLocal, formatTime, deviceTz } from '../lib/time';
import { costTotal, travellerCount } from '../lib/budget';
import { Icon } from './Icons';
import { Sheet } from './Sheet';
import { IssueList } from './Editor';

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const stamp = () => new Date().toISOString().slice(0, 10);

export function MenuSheet() {
  const ui = useUI();
  const { saving } = useStore();
  const items: [string, string, string, () => void][] = [
    ['edit', 'Editar itinerario', 'Actividades, horarios, lugares, costos', () => ui.edit(null)],
    ['checklist', 'Preparativos', 'Documentos y reservas por confirmar', () => ui.open('prep')],
    ['upload', 'Importar', 'Cargar un archivo JSON', () => ui.open('import')],
    ['download', 'Exportar', 'JSON, progreso, CSV, imprimible', () => ui.open('export')],
    ['settings', 'Configuración', 'Transporte, mapas, fecha de prueba', () => ui.open('settings')],
    ['database', 'Gestión de datos', 'Viajes guardados, restaurar, reiniciar', () => ui.open('data')],
  ];
  return (
    <Sheet title="Menú" subtitle={saving ? 'Guardando…' : 'Todo guardado en este dispositivo'} onClose={ui.close}>
      <ul className="menu-list">
        {items.map(([icon, label, sub, fn]) => (
          <li key={label}><button className="menu-item" onClick={fn}><span className="mi-ico"><Icon name={icon} /></span><span><b>{label}</b><small>{sub}</small></span></button></li>
        ))}
      </ul>
    </Sheet>
  );
}

export function ImportSheet() {
  const { importData, trip } = useStore();
  const ui = useUI();
  const [res, setRes] = useState<ValidationResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const read = async (f: File) => {
    setFileName(f.name);
    try { setRes(validateImport(JSON.parse(await f.text()))); }
    catch (e: any) { setRes({ ok: false, issues: [{ level: 'error', path: '$', message: 'No es un JSON válido: ' + e.message }] }); }
  };
  const apply = async (mode: 'replace' | 'copy') => {
    if (!res?.trip) return;
    if (mode === 'replace' && !confirm('Se reemplazará el itinerario activo. ¿Continuar? (Sugerencia: exporten un respaldo antes)')) return;
    setBusy(true);
    await importData(res.trip, res.progress, mode);
    setBusy(false);
    ui.close();
    ui.notify(mode === 'copy' ? 'Copia importada y activada' : 'Itinerario reemplazado', 'success');
  };

  return (
    <Sheet title="Importar itinerario" subtitle="JSON del viaje o paquete con progreso" onClose={ui.close}>
      <div className="dropzone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) read(f); }}>
        <Icon name="upload" size={30} />
        <p>Arrastren un archivo o</p>
        <button className="btn btn-primary" onClick={() => input.current?.click()}>Elegir archivo JSON</button>
        <input ref={input} type="file" accept=".json,application/json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ''; }} />
        {fileName && <p className="tiny muted">{fileName}</p>}
      </div>
      {res && <IssueList issues={res.issues} ok={res.ok} />}
      {res?.ok && res.trip && res.summary && (
        <div className="preview">
          <h3>Previsualización</h3>
          <p><b>{res.trip.trip.name}</b> · {dateLabel(res.trip.trip.startDate, 'short')} → {dateLabel(res.trip.trip.endDate, 'short')}</p>
          <p>{res.summary.worlds} mundos · {res.summary.dates.length} días · {res.summary.activities} actividades{res.progress ? ` · incluye progreso (${Object.keys(res.progress.activities).length} etapas marcadas)` : ''}</p>
          <ol className="preview-worlds">{sortedWorlds(res.trip).map(w => <li key={w.id}>{w.name} <span className="muted">({w.subtitle}, {w.days.reduce((n, d) => n + d.activities.length, 0)} etapas)</span></li>)}</ol>
          {res.trip.id === trip.id && <p className="tiny muted">Tiene el mismo id que el viaje activo.</p>}
          <div className="row-end">
            <button className="btn" disabled={busy} onClick={() => apply('copy')}><Icon name="copy" size={16} /> Importar como copia</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => apply('replace')}>Reemplazar actual</button>
          </div>
        </div>
      )}
      <p className="tiny muted">Si el archivo tiene errores no se modifica nada del itinerario existente.</p>
    </Sheet>
  );
}

export function ExportSheet() {
  const { trip, bundle } = useStore();
  const ui = useUI();
  const slug = trip.id;
  return (
    <Sheet title="Exportar" subtitle="Los archivos pueden volver a importarse sin pérdida" onClose={ui.close}>
      <ul className="menu-list">
        <li><button className="menu-item" onClick={() => download(`${slug}-itinerario-${stamp()}.json`, JSON.stringify(trip, null, 2), 'application/json')}>
          <span className="mi-ico"><Icon name="download" /></span><span><b>JSON del viaje</b><small>Itinerario maestro (sin progreso). Editable en VS Code / WebStorm.</small></span></button></li>
        <li><button className="menu-item" onClick={() => download(`${slug}-con-progreso-${stamp()}.json`, JSON.stringify(bundle(), null, 2), 'application/json')}>
          <span className="mi-ico"><Icon name="database" /></span><span><b>JSON con progreso</b><small>Itinerario + estados + preparativos. Ideal como respaldo.</small></span></button></li>
        <li><button className="menu-item" onClick={() => download(`${slug}-presupuesto-${stamp()}.csv`, budgetCsv(trip), 'text/csv;charset=utf-8')}>
          <span className="mi-ico"><Icon name="wallet" /></span><span><b>CSV de presupuesto</b><small>Para Excel, Numbers o Google Sheets.</small></span></button></li>
        <li><button className="menu-item" onClick={() => { ui.close(); setTimeout(() => window.print(), 300); }}>
          <span className="mi-ico"><Icon name="printer" /></span><span><b>Itinerario imprimible</b><small>Imprimir o guardar como PDF.</small></span></button></li>
      </ul>
    </Sheet>
  );
}

export function SettingsSheet() {
  const { settings, updateSettings, now } = useStore();
  const ui = useUI();
  const tz = deviceTz();
  return (
    <Sheet title="Configuración" onClose={ui.close}>
      <div className="form">
        <label>Medio de transporte para tiempos
          <select value={settings.travelMode} onChange={e => updateSettings({ travelMode: e.target.value as 'car' | 'walk' })}><option value="car">Auto</option><option value="walk">A pie</option></select></label>
        <label>Abrir navegación en
          <select value={settings.mapProvider} onChange={e => updateSettings({ mapProvider: e.target.value as 'google' | 'apple' })}><option value="google">Google Maps</option><option value="apple">Apple Maps</option></select></label>
        <label>Simular fecha y hora (para probar el viaje)
          <input type="datetime-local" value={settings.simulatedNow ? epochToLocal(Date.parse(settings.simulatedNow), tz) : ''}
            onChange={e => {
              if (!e.target.value) return updateSettings({ simulatedNow: null });
              const local = new Date(e.target.value); // device zone
              updateSettings({ simulatedNow: local.toISOString() });
            }} /></label>
        <p className="tiny muted">{settings.simulatedNow ? `Modo simulación activo: ${new Date(now).toLocaleString('es-DO')}` : 'Usando el reloj real del dispositivo'} · zona del dispositivo: {tz}</p>
        {settings.simulatedNow && <button className="btn btn-sm" onClick={() => updateSettings({ simulatedNow: null })}>Volver al reloj real</button>}
        <h3>Privacidad</h3>
        <p className="small">La ubicación solo se usa cuando la activan, se mantiene en memoria y no se guarda historial. Para calcular rutas se envían las coordenadas de origen y destino al servicio OSRM de OpenStreetMap; para el clima, solo las coordenadas del lugar del día a Open-Meteo.</p>
      </div>
    </Sheet>
  );
}

export function DataSheet() {
  const { library, trip, switchTrip, deleteTrip, restoreDefault, resetProgress } = useStore();
  const ui = useUI();
  return (
    <Sheet title="Gestión de datos" subtitle="Todo se guarda en este dispositivo (IndexedDB)" onClose={ui.close}>
      <h3>Viajes guardados</h3>
      <ul className="rows">
        {library.trips.map(t => (
          <li key={t.id} className="row static">
            <span className="row-main"><b>{t.name}</b><small>{t.id === trip.id ? 'Activo · ' : ''}actualizado {new Date(t.updatedAt).toLocaleString('es-DO')}</small></span>
            {t.id !== trip.id && <>
              <button className="btn btn-xs" onClick={() => switchTrip(t.id)}>Activar</button>
              <button className="icon-btn xs" aria-label={`Eliminar ${t.name}`} onClick={() => { if (confirm(`¿Eliminar "${t.name}" y su progreso de este dispositivo? No se puede deshacer.`)) deleteTrip(t.id); }}><Icon name="trash" size={14} /></button>
            </>}
          </li>
        ))}
      </ul>
      <div className="row-wrap">
        <button className="btn" onClick={() => { if (confirm('¿Restaurar el itinerario original incluido en la app? Se reemplazan las ediciones del viaje base (el progreso se conserva).')) restoreDefault().then(() => ui.notify('Itinerario original restaurado', 'success')); }}>Restaurar itinerario original</button>
        <button className="btn danger" onClick={() => { if (confirm('¿Reiniciar todo el progreso (etapas completadas y preparativos)? No se puede deshacer.')) { resetProgress(); ui.notify('Progreso reiniciado', 'info'); } }}>Reiniciar progreso</button>
      </div>
      <p className="tiny muted">Recomendación: exporten “JSON con progreso” de vez en cuando como respaldo.</p>
    </Sheet>
  );
}

export function CompleteSheet() {
  const { trip, flat, progress } = useStore();
  const ui = useUI();
  const stats = useStats();
  const s = summarize(trip);
  const visited = new Set(flat.filter(f => userStatus(progress, f.activity.id) === 'completed' && f.activity.location?.coordinates).map(f => f.activity.location!.name));
  const days = tripDates(trip).length;
  return (
    <Sheet title="¡Aventura completada!" subtitle={trip.trip.name} onClose={ui.close}>
      <div className="complete">
        <div className="trophy" aria-hidden="true"><Icon name="flag" size={44} /></div>
        <div className="kpis">
          <div className="kpi"><span className="k">Días viajados</span><span className="v">{days}</span></div>
          <div className="kpi"><span className="k">Lugares visitados</span><span className="v">{visited.size}</span></div>
          <div className="kpi"><span className="k">Actividades completadas</span><span className="v">{stats.completed}</span><span className="s">de {stats.total}</span></div>
          <div className="kpi"><span className="k">Recorrido total</span><span className="v sm">No registrado</span><span className="s">la app no guarda historial GPS</span></div>
          <div className="kpi"><span className="k">Gasto real</span><span className="v">{money(s.actual)}</span><span className="s">{money(s.perPersonActual)} por persona</span></div>
        </div>
        <h3>Resumen de la aventura</h3>
        <ol className="recap">
          {sortedWorlds(trip).map(w => {
            const done = flat.filter(f => f.world.id === w.id && userStatus(progress, f.activity.id) === 'completed');
            return <li key={w.id}><b>{w.name}</b> <span className="muted">· {w.subtitle}</span><br /><small>{done.length ? done.slice(0, 6).map(f => f.activity.name).join(' · ') + (done.length > 6 ? '…' : '') : 'Sin etapas completadas'}</small></li>;
          })}
        </ol>
      </div>
    </Sheet>
  );
}

/** Rendered only for print (see @media print in styles). */
export function PrintItinerary() {
  const { trip } = useStore();
  const n = travellerCount(trip);
  return (
    <div id="print-root" aria-hidden="true">
      <h1>{trip.trip.name}</h1>
      <p>{dateLabel(trip.trip.startDate)} → {dateLabel(trip.trip.endDate)} · {trip.trip.travelers.adults} adultos, {trip.trip.travelers.minors.length} menores</p>
      {sortedWorlds(trip).map(w => (
        <section key={w.id}>
          <h2>Mundo {w.order}: {w.name} — {w.subtitle}</h2>
          {w.days.map(d => (
            <div key={d.date} className="p-day">
              <h3>{dateLabel(d.date)}{d.title ? ` · ${d.title}` : ''}</h3>
              <table><tbody>
                {d.activities.map(a => (
                  <tr key={a.id}>
                    <td className="p-time">{a.plannedStart ? formatTime(a.plannedStart, a.timezone) : '—'}</td>
                    <td><b>{a.name}</b>{a.priority !== 'required' ? ` (${a.priority === 'alternative' ? 'alternativa' : a.priority === 'optional' ? 'opcional' : 'prioritaria'})` : ''}{a.location?.address ? <><br /><small>{a.location.address}</small></> : null}{a.notes ? <><br /><small>{a.notes}</small></> : null}</td>
                    <td className="p-cost">{costTotal(a.cost, n) != null ? money(costTotal(a.cost, n)) : ''}</td>
                    <td className="p-book">{a.bookingStatus !== 'not_applicable' ? BOOKING_LABEL[a.bookingStatus] : ''}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

export function useTripPhaseLabel() {
  const { phase } = useTripDay();
  return phase;
}
