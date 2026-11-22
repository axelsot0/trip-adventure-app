import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { usePrefersReducedMotion, useRecommendation, useStatuses, useTripDay } from '../state/hooks';
import { sortedWorlds, STATUS_LABEL, isAlternativeActive, progressStats, DONE, userStatus } from '../lib/itinerary';
import { dateLabel, formatTime } from '../lib/time';
import type { Activity, VisualStatus, World } from '../types';
import { Icon } from './Icons';
import { WorldDecor } from './WorldDecor';
import { PreTripCard } from './PreTrip';

const STEP = 112;
const GATE_H = 200;
const DAY_H = 70;
const TOP = 16;
const END_H = 220;

interface NodeLayout { id: string; x: number; y: number; activity: Activity; world: World; date: string; alt: boolean; parent?: { x: number; y: number } }
interface DayLayout { key: string; date: string; y: number; title?: string; world: World; total: number; done: number }
interface WorldLayout { world: World; top: number; bottom: number; gateY: number }

const BADGE: Partial<Record<VisualStatus, string>> = { completed: 'check', locked: 'lock', skipped: 'skip', cancelled: 'x', unavailable: 'cloud', in_progress: 'play' };

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const t = 0.18;
    const c1x = p1.x + (p2.x - p0.x) * t, c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t, c2y = p2.y - (p3.y - p1.y) * t;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

export function Roadmap() {
  const { trip, progress, flat } = useStore();
  const ui = useUI();
  const statuses = useStatuses();
  const rec = useRecommendation();
  const { phase } = useTripDay();
  const reduced = usePrefersReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(400);
  const [showJump, setShowJump] = useState(false);

  useLayoutEffect(() => {
    const el = boardRef.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.min(560, e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    const amp = Math.min(W * 0.22, 118);
    const cx = W / 2;
    const nodes: NodeLayout[] = [];
    const days: DayLayout[] = [];
    const worlds: WorldLayout[] = [];
    const pathPts: { x: number; y: number; id?: string }[] = [];
    let y = TOP;
    let i = 0;
    const pending: { a: Activity; world: World; date: string }[] = [];
    for (const world of sortedWorlds(trip)) {
      const top = y;
      const gateY = y + GATE_H / 2;
      pathPts.push({ x: cx, y: gateY });
      y += GATE_H;
      for (const day of world.days) {
        const mains = day.activities.filter(a => a.priority !== 'alternative');
        const st = progressStats(flat.filter(f => f.date === day.date && f.world.id === world.id), progress);
        days.push({ key: world.id + day.date, date: day.date, y: y + DAY_H / 2, title: day.title, world, total: st.total, done: st.done });
        pathPts.push({ x: cx, y: y + DAY_H / 2 });
        y += DAY_H;
        for (const a of day.activities) {
          if (a.priority === 'alternative') { pending.push({ a, world, date: day.date }); continue; }
          const x = cx + amp * Math.sin(i * 0.9 + 0.6);
          const n: NodeLayout = { id: a.id, x, y: y + STEP / 2, activity: a, world, date: day.date, alt: false };
          nodes.push(n); pathPts.push({ x, y: n.y, id: a.id });
          y += STEP; i++;
        }
        void mains;
      }
      worlds.push({ world, top, bottom: y, gateY });
    }
    // alternatives: side branch next to the activity they replace
    for (const p of pending) {
      const parent = nodes.find(n => n.id === p.a.alternativeFor);
      if (parent) {
        const side = parent.x > cx ? -1 : 1;
        const x = Math.max(44, Math.min(W - 44, parent.x + side * Math.min(150, W * 0.36)));
        nodes.push({ id: p.a.id, x, y: parent.y + 46, activity: p.a, world: p.world, date: p.date, alt: true, parent });
      } else {
        const last = nodes.filter(n => !n.alt && n.date === p.date).pop();
        const yy = last ? last.y + 50 : TOP;
        nodes.push({ id: p.a.id, x: last && last.x > cx ? 50 : W - 50, y: yy, activity: p.a, world: p.world, date: p.date, alt: true, parent: last });
      }
    }
    const endY = y + END_H / 2;
    pathPts.push({ x: cx, y: endY });
    return { nodes, days, worlds, pathPts, height: y + END_H, endY, cx };
  }, [trip, W, flat, progress]);

  // progress along the road: up to the furthest resolved main node
  const progressPath = useMemo(() => {
    let lastIdx = 0;
    layout.pathPts.forEach((p, idx) => { if (p.id && DONE.includes(userStatus(progress, p.id))) lastIdx = idx; });
    return lastIdx > 0 ? smoothPath(layout.pathPts.slice(0, lastIdx + 1)) : '';
  }, [layout, progress]);
  const fullPath = useMemo(() => smoothPath(layout.pathPts), [layout]);

  const focusId = rec.current?.activity.id ?? rec.recommended?.activity.id ?? rec.scheduledNext?.activity.id ?? null;
  const focusNode = layout.nodes.find(n => n.id === focusId) ?? null;

  const scrollToFocus = (smooth: boolean) => {
    const sc = scrollRef.current;
    if (!sc || !focusNode) return;
    const top = (boardRef.current?.offsetTop ?? 0) + focusNode.y - sc.clientHeight * 0.4;
    sc.scrollTo({ top: Math.max(0, top), behavior: smooth && !reduced ? 'smooth' : 'auto' });
  };
  const didInitialScroll = useRef(false);
  useEffect(() => {
    if (didInitialScroll.current || !focusNode || phase === 'before') return;
    didInitialScroll.current = true;
    requestAnimationFrame(() => scrollToFocus(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNode, phase]);

  useEffect(() => {
    const sc = scrollRef.current; if (!sc) return;
    const h = () => {
      if (!focusNode) return setShowJump(false);
      const y = (boardRef.current?.offsetTop ?? 0) + focusNode.y;
      setShowJump(Math.abs(y - (sc.scrollTop + sc.clientHeight * 0.4)) > sc.clientHeight * 0.7);
    };
    h();
    sc.addEventListener('scroll', h, { passive: true });
    return () => sc.removeEventListener('scroll', h);
  }, [focusNode]);

  const homeDone = userStatus(progress, 'arrive-home') === 'completed';

  return (
    <div className="roadmap-scroll" ref={scrollRef}>
      {trip.id === 'sample-trip' ? (
        <button className="pretrip" onClick={() => ui.open('import')}>
          <div className="pt-count"><Icon name="upload" size={26} /></div>
          <div className="pt-info"><span className="pt-kicker">Viaje de ejemplo</span><span className="pt-title">Importa tu itinerario para empezar</span><span className="pt-meta">Toca aquí o Menú → Importar. Tus datos se quedan solo en este dispositivo.</span></div>
        </button>
      ) : phase === 'before' && <PreTripCard />}
      <div className="board" ref={boardRef} style={{ height: layout.height }}>
        {layout.worlds.map(w => {
          const st = progressStats(flat, progress, w.world.id);
          const dates = w.world.days.map(d => d.date);
          return (
            <section key={w.world.id} className={`world theme-${w.world.theme}`} style={{ top: w.top, height: w.bottom - w.top + (w.world === layout.worlds.at(-1)?.world ? END_H : 0) }} aria-label={`Mundo ${w.world.order}: ${w.world.name}`}>
              <WorldDecor theme={w.world.theme} snow={w.world.theme === 'snow' && !reduced} />
            </section>
          );
        })}

        <svg className="road" width={W} height={layout.height} aria-hidden="true">
          <defs>
            <linearGradient id="roadGlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffd166" /><stop offset="1" stopColor="#ff9f43" />
            </linearGradient>
          </defs>
          <path d={fullPath} className="road-base" />
          <path d={fullPath} className="road-dash" />
          {progressPath && <path d={progressPath} className="road-progress" />}
          {layout.nodes.filter(n => n.alt && n.parent).map(n => (
            <path key={'b' + n.id} d={`M${n.parent!.x},${n.parent!.y} Q${(n.parent!.x + n.x) / 2},${n.parent!.y + 60} ${n.x},${n.y}`} className="road-branch" />
          ))}
        </svg>

        {layout.worlds.map(w => {
          const st = progressStats(flat, progress, w.world.id);
          const dates = w.world.days.map(d => d.date);
          const pct = st.total ? Math.round((st.done / st.total) * 100) : 0;
          return (
            <button key={'g' + w.world.id} className={`gate theme-${w.world.theme} ${pct === 100 ? 'gate-done' : ''}`} style={{ top: w.gateY, left: layout.cx }}
              onClick={() => ui.showDay(dates[0])} aria-label={`Mundo ${w.world.order}: ${w.world.name}. ${st.done} de ${st.total} etapas. Ver calendario.`}>
              <span className="gate-num">Mundo {w.world.order}</span>
              <span className="gate-name">{w.world.name}</span>
              <span className="gate-sub">{w.world.subtitle} · {dateLabel(dates[0], 'short')}{dates.at(-1) !== dates[0] ? ` – ${dateLabel(dates.at(-1)!, 'short')}` : ''}</span>
              <span className="gate-bar"><i style={{ width: pct + '%' }} /></span>
              <span className="gate-count">{pct === 100 ? '¡Mundo completado!' : `${st.done} de ${st.total} etapas`}</span>
            </button>
          );
        })}

        {layout.days.map(d => (
          <button key={d.key} className={`day-chip theme-${d.world.theme}`} style={{ top: d.y, left: layout.cx }} onClick={() => ui.showDay(d.date)}
            aria-label={`${dateLabel(d.date)}: ${d.done} de ${d.total}. Ver día`}>
            <span className="day-date">{dateLabel(d.date, 'short')}</span>
            {d.title && <span className="day-title">{d.title}</span>}
            <span className={`day-count ${d.total && d.done === d.total ? 'full' : ''}`}>{d.done}/{d.total}</span>
          </button>
        ))}

        {layout.nodes.map(n => (
          <RoadNode key={n.id} n={n} W={W} cx={layout.cx}
            status={statuses.get(n.id) ?? 'pending'}
            altActive={isAlternativeActive(progress, n.activity)}
            isFocus={n.id === focusId}
            celebrate={ui.celebrate?.id === n.id ? ui.celebrate.at : 0}
            onOpen={() => ui.select(n.id)} />
        ))}

        {focusNode && (
          <div className={`family-token theme-${focusNode.world.theme} ${reduced ? '' : 'bob'}`} style={{ top: focusNode.y - 52, left: focusNode.x + (focusNode.x > layout.cx ? 26 : -60) }} aria-hidden="true">
            <Icon name="family" size={20} />
          </div>
        )}

        <button className={`finish theme-home ${homeDone ? 'finish-done' : ''}`} style={{ top: layout.endY, left: layout.cx }} onClick={() => homeDone ? ui.open('complete') : ui.select('arrive-home')}>
          <Icon name="flag" size={26} />
          <strong>{homeDone ? '¡Aventura completada!' : 'Meta: Llegamos a casa'}</strong>
          <small>{homeDone ? 'Ver resumen del viaje' : dateLabel(trip.trip.endDate)}</small>
        </button>
      </div>

      {showJump && focusNode && (
        <button className="jump-btn" onClick={() => scrollToFocus(true)}>
          <Icon name="family" size={18} /> Ir a nuestra etapa
        </button>
      )}
    </div>
  );
}

const RoadNode = memo(function RoadNode({ n, W, cx, status, altActive, isFocus, celebrate, onOpen }: {
  n: NodeLayout; W: number; cx: number; status: VisualStatus; altActive: boolean; isFocus: boolean; celebrate: number; onOpen: () => void;
}) {
  const a = n.activity;
  const labelRight = n.alt ? n.x < cx : n.x <= cx;
  const size = n.alt ? 52 : 68;
  const labelW = labelRight ? W - n.x - size / 2 - 22 : n.x - size / 2 - 22;
  const badge = BADGE[status];
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (celebrate && Date.now() - celebrate < 3000) { setBurst(celebrate); const t = setTimeout(() => setBurst(0), 1400); return () => clearTimeout(t); }
  }, [celebrate]);

  return (
    <div className={`node-wrap theme-${n.world.theme} ${n.alt ? "alt" : ""} ${n.alt && !altActive ? 'alt-idle' : ''}`} style={{ top: n.y, left: n.x }}>
      {status === 'next' && <span className="next-flag">Siguiente</span>}
      {status === 'in_progress' && <span className="next-flag ip">En curso</span>}
      <button className={`node st-${status} prio-${a.priority} ${isFocus ? 'focus' : ''}`} style={{ width: size, height: size }} onClick={onOpen}
        aria-label={`${a.name}. ${STATUS_LABEL[status]}${n.alt ? '. Alternativa' : ''}${a.priority === 'optional' ? '. Opcional' : ''}`}>
        <Icon name={a.type} size={n.alt ? 22 : 28} />
        {badge && <span className={`badge b-${status}`}><Icon name={badge} size={12} strokeWidth={3} /></span>}
        {status === 'in_progress' && <span className="spin-ring" />}
        {status === 'next' && <span className="pulse-ring" />}
      </button>
      {burst > 0 && <span className="burst" key={burst}>{Array.from({ length: 14 }).map((_, i) => <i key={i} style={{ ['--a' as any]: `${(i / 14) * 360}deg`, ['--c' as any]: ['#ffd166', '#ff7a59', '#5ec2b7', '#9b7bff'][i % 4] }} />)}</span>}
      <button className={`node-label ${labelRight ? 'r' : 'l'}`} style={{ width: Math.max(90, Math.min(labelW, 220)) }} onClick={onOpen} tabIndex={-1} aria-hidden="true">
        <span className="nl-name">{a.name}</span>
        <span className="nl-meta">
          {n.alt ? 'Ruta alternativa' : a.plannedStart ? formatTime(a.plannedStart, a.timezone).split(' · ')[0] : a.priority === 'optional' ? 'Opcional' : ''}
          {(status === 'unavailable' || status === 'cancelled' || status === 'skipped') && <em> · {STATUS_LABEL[status].split(' (')[0]}</em>}
        </span>
      </button>
    </div>
  );
});
