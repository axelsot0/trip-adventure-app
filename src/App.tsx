import { lazy, Suspense, useEffect, useRef } from 'react';
import { StoreProvider, useStore } from './state/store';
import { GeoProvider } from './state/geo';
import { UIProvider, useUI, type Tab } from './state/ui';
import { useOnline, useStats, useTripDay } from './state/hooks';
import { userStatus, sortedWorlds } from './lib/itinerary';
import { dateLabel } from './lib/time';
import { Roadmap } from './components/Roadmap';
const loadMap = () => import('./components/MapView').then(m => ({ default: m.MapView }));
const MapView = lazy(loadMap);
// Prefetch the map chunk once idle so it is cached for offline use.
if (typeof window !== 'undefined') setTimeout(() => { loadMap().catch(() => {}); }, 4000);
import { CalendarView } from './components/CalendarView';
import { BudgetView } from './components/BudgetView';
import { ActivitySheet } from './components/ActivitySheet';
import { NextStopPanel } from './components/NextStopPanel';
import { Editor } from './components/Editor';
import { PrepSheet } from './components/PreTrip';
import { CompleteSheet, DataSheet, ExportSheet, ImportSheet, MenuSheet, PrintItinerary, SettingsSheet } from './components/DataSheets';
import { Icon } from './components/Icons';

export default function App() {
  return (
    <StoreProvider>
      <GeoProvider>
        <UIProvider>
          <Shell />
        </UIProvider>
      </GeoProvider>
    </StoreProvider>
  );
}

function Shell() {
  const { trip, progress, flat, settings } = useStore();
  const ui = useUI();
  const stats = useStats();
  const online = useOnline();
  const { today, phase } = useTripDay();
  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;

  // Final screen when the last level ("Llegamos a casa") gets completed from any view.
  const lastId = flat.at(-1)?.activity.id;
  const prevLast = useRef(lastId ? userStatus(progress, lastId) : 'pending');
  useEffect(() => {
    if (!lastId) return;
    const s = userStatus(progress, lastId);
    if (s === 'completed' && prevLast.current !== 'completed') setTimeout(() => ui.open('complete'), 900);
    prevLast.current = s;
  }, [progress, lastId]);

  const currentWorld = flat.find(f => f.date === today)?.world;
  const tabs: [Tab, string, string][] = [['adventure', 'Aventura', 'flag'], ['map', 'Mapa', 'map'], ['calendar', 'Calendario', 'calendar'], ['budget', 'Presupuesto', 'wallet']];

  return (
    <div className={`app tab-${ui.tab}`}>
      <a href="#main" className="skip-link">Saltar al contenido</a>
      <header className="topbar">
        <div className="tb-left">
          <div className="tb-logo" aria-hidden="true"><Icon name="flag" size={18} /></div>
          <div className="tb-text">
            <h1>{trip.trip.name}</h1>
            <span className="tb-sub">
              {phase === 'before' ? `Empieza ${dateLabel(trip.trip.startDate, 'short')}` : phase === 'after' ? 'Viaje finalizado' : `${dateLabel(today, 'short')}${currentWorld ? ` · Mundo ${currentWorld.order}` : ''}`}
              {settings.simulatedNow && <b className="sim"> · simulado</b>}
              {!online && <b className="off"> · sin conexión</b>}
            </span>
          </div>
        </div>
        <div className="tb-right">
          <div className="tb-progress" role="progressbar" aria-valuemin={0} aria-valuemax={stats.total} aria-valuenow={stats.done} aria-label={`${stats.done} de ${stats.total} etapas completadas`}>
            <span className="tbp-text"><b>{stats.done}</b>/{stats.total}</span>
            <span className="tbp-bar"><i style={{ width: pct + '%' }} /></span>
          </div>
          <button className="icon-btn" onClick={() => ui.open('menu')} aria-label="Menú: importar, exportar, editar, configuración"><Icon name="menu" /></button>
        </div>
      </header>

      <main id="main" className="main">
        {ui.tab === 'adventure' && <Roadmap />}
        {ui.tab === 'map' && <Suspense fallback={<div className="boot"><p>Cargando mapa…</p></div>}><MapView /></Suspense>}
        {ui.tab === 'calendar' && <CalendarView />}
        {ui.tab === 'budget' && <BudgetView />}
        {(ui.tab === 'adventure' || ui.tab === 'map') && <div className="float-layer"><NextStopPanel /></div>}
      </main>

      <nav className="bottomnav" aria-label="Vistas">
        {tabs.map(([t, label, icon]) => (
          <button key={t} className={ui.tab === t ? 'on' : ''} aria-current={ui.tab === t ? 'page' : undefined} onClick={() => ui.setTab(t)}>
            <Icon name={icon} size={22} /><span>{label}</span>
          </button>
        ))}
      </nav>

      {ui.selectedId && <ActivitySheet id={ui.selectedId} />}
      {ui.overlay === 'menu' && <MenuSheet />}
      {ui.overlay === 'import' && <ImportSheet />}
      {ui.overlay === 'export' && <ExportSheet />}
      {ui.overlay === 'editor' && <Editor />}
      {ui.overlay === 'prep' && <PrepSheet />}
      {ui.overlay === 'settings' && <SettingsSheet />}
      {ui.overlay === 'data' && <DataSheet />}
      {ui.overlay === 'complete' && <CompleteSheet />}
      <Toast />
      <PrintItinerary />
      <span hidden>{sortedWorlds(trip).length}</span>
    </div>
  );
}

function Toast() {
  const { toast } = useUI();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!toast || !ref.current) return;
    const el = ref.current;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    const t = setTimeout(() => el.classList.remove('show'), 2600);
    return () => clearTimeout(t);
  }, [toast?.at]);
  return <div ref={ref} className={`toast ${toast?.kind ?? ''}`} role="status" aria-live="polite">{toast?.kind === 'success' && <Icon name="sparkle" size={18} />}{toast?.text}</div>;
}
