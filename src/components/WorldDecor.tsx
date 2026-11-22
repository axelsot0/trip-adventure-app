import type { ReactElement } from 'react';
import type { WorldTheme } from '../types';

/** Original, lightweight SVG scenery per world. Purely decorative (aria-hidden). */

const Palm = ({ c = '#1f7a5a' }) => (
  <svg viewBox="0 0 60 90" width="60" height="90"><path d="M30 88c2-22 1-40-3-58" stroke="#8a5a32" strokeWidth="5" fill="none" strokeLinecap="round" />
    <path d="M27 30c-10-10-22-8-26-2 10-3 18 0 26 2zM27 30c4-14 16-20 26-16-12 1-20 8-26 16zM27 30c-14 0-22 8-22 16 6-9 14-13 22-16zM27 30c12-4 24 2 28 10-10-6-18-8-28-10z" fill={c} /></svg>
);
const Pine = ({ c = '#2f6b4f', snow = false }) => (
  <svg viewBox="0 0 50 80" width="46" height="74"><rect x="22" y="62" width="6" height="16" fill="#6b4a2f" />
    <path d="M25 2 6 34h10L3 54h13L1 68h48L34 54h13L34 34h10z" fill={c} />
    {snow && <path d="M25 2 17 16c3 2 6 0 8-2 2 2 5 4 8 2zM12 34c4 3 8 1 11-1 3 2 7 4 11 1l-3-4H15zM8 54c5 3 10 1 15-1 4 2 10 4 15 1l-3-3H11z" fill="#fff" opacity=".9" />}</svg>
);
const Mountain = ({ snow = true }) => (
  <svg viewBox="0 0 160 90" width="150" height="85"><path d="M0 90 55 18l25 30 20-22 60 64z" fill="#5a7aa0" />
    <path d="M0 90 55 18l25 30 20-22 60 64z" fill="url(#mshade)" opacity=".35" />
    {snow && <path d="M55 18 42 35l8-3 6 6 7-7 10 6zM100 26l-11 12 7-1 5 5 6-5 7 2z" fill="#fff" />}
    <defs><linearGradient id="mshade" x1="0" x2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#000" /></linearGradient></defs></svg>
);
const Wave = () => (
  <svg viewBox="0 0 120 30" width="120" height="30"><path d="M0 20c10-10 20-10 30 0s20 10 30 0 20-10 30 0 20 10 30 0v10H0z" fill="#4fb3d9" opacity=".7" />
    <path d="M0 24c10-8 20-8 30 0s20 8 30 0 20-8 30 0 20 8 30 0" stroke="#fff" strokeWidth="2" fill="none" opacity=".8" /></svg>
);
const Sun = ({ c = '#ffc94a' }) => (
  <svg viewBox="0 0 60 60" width="56" height="56"><circle cx="30" cy="30" r="13" fill={c} />
    {Array.from({ length: 8 }).map((_, i) => <path key={i} d="M30 4v8" stroke={c} strokeWidth="3" strokeLinecap="round" transform={`rotate(${i * 45} 30 30)`} />)}</svg>
);
const Cloud = () => (
  <svg viewBox="0 0 80 40" width="80" height="40"><path d="M18 36a12 12 0 0 1 2-24 16 16 0 0 1 30-2 12 12 0 0 1 12 26z" fill="#fff" opacity=".85" /></svg>
);
const Plane = () => (
  <svg viewBox="0 0 70 40" width="64" height="36"><path d="M2 22h46l14-8c4-2 7 2 4 4l-14 10H10z" fill="#fff" /><path d="M24 22 34 6h6l-6 16zM28 28l6 9h5l-3-9z" fill="#e9eef5" /><circle cx="42" cy="22" r="1.5" fill="#7aa" /></svg>
);
const Ferris = () => (
  <svg viewBox="0 0 90 100" width="84" height="94"><g stroke="#ff7a59" strokeWidth="2.5" fill="none"><circle cx="45" cy="40" r="32" />
    {Array.from({ length: 8 }).map((_, i) => <line key={i} x1="45" y1="40" x2={45 + 32 * Math.cos(i * Math.PI / 4)} y2={40 + 32 * Math.sin(i * Math.PI / 4)} />)}</g>
    {Array.from({ length: 8 }).map((_, i) => <rect key={i} x={41 + 32 * Math.cos(i * Math.PI / 4)} y={37 + 32 * Math.sin(i * Math.PI / 4)} width="8" height="8" rx="2" fill={['#ffc94a', '#5ec2b7', '#9b7bff', '#ff7a59'][i % 4]} />)}
    <path d="M45 40 25 98M45 40l20 58" stroke="#6b6f8f" strokeWidth="3" /></svg>
);
const Coaster = () => (
  <svg viewBox="0 0 120 70" width="116" height="68"><path d="M2 64C20 64 22 10 42 10s20 40 38 40 18-30 38-30" stroke="#9b7bff" strokeWidth="4" fill="none" />
    {[12, 26, 42, 58, 74, 90, 106].map(x => <line key={x} x1={x} y1="68" x2={x} y2={x < 50 ? 30 : 46} stroke="#9b7bff" strokeWidth="2" opacity=".6" />)}</svg>
);
const Umbrella = () => (
  <svg viewBox="0 0 60 70" width="54" height="64"><path d="M30 20v48" stroke="#7a5a3a" strokeWidth="3" /><path d="M4 24a26 18 0 0 1 52 0z" fill="#ff7a59" /><path d="M17 24a13 18 0 0 1 26 0z" fill="#ffd166" /></svg>
);
const Sign = ({ text = 'I-75' }) => (
  <svg viewBox="0 0 60 70" width="52" height="62"><path d="M30 40v30" stroke="#777" strokeWidth="3" /><path d="M10 6h40v22c0 6-10 12-20 14-10-2-20-8-20-14z" fill="#2554a8" stroke="#fff" strokeWidth="2" />
    <text x="30" y="27" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff" fontFamily="system-ui">{text}</text></svg>
);
const Car = () => (
  <svg viewBox="0 0 80 40" width="72" height="36"><path d="M6 28h68l-4-10c-1-3-4-5-7-5H48l-8-8H22c-3 0-6 2-7 5l-4 8H8c-2 0-3 2-3 4z" fill="#ff7a59" /><path d="M22 9h16l6 6H18z" fill="#cfe9ff" />
    <circle cx="20" cy="30" r="6" fill="#33364d" /><circle cx="60" cy="30" r="6" fill="#33364d" /></svg>
);
const House = ({ lights = false }) => (
  <svg viewBox="0 0 70 60" width="64" height="56"><path d="M8 28 35 6l27 22v30H8z" fill="#f4e4c8" /><path d="M2 30 35 3l33 27" stroke="#b3543c" strokeWidth="6" fill="none" strokeLinejoin="round" />
    <rect x="29" y="38" width="12" height="20" fill="#8a5a32" /><rect x="14" y="34" width="10" height="9" fill="#9fd3ff" /><rect x="46" y="34" width="10" height="9" fill="#9fd3ff" />
    {lights && [6, 14, 22, 30, 38, 46, 54, 62].map((x, i) => <circle key={x} cx={x} cy={30 - Math.abs(35 - x) * 0.75} r="2.2" fill={['#ff5e5e', '#ffd166', '#5ec2b7'][i % 3]} />)}</svg>
);
const Gondola = () => (
  <svg viewBox="0 0 140 70" width="130" height="64"><path d="M0 8 140 30" stroke="#555" strokeWidth="1.5" /><path d="M70 19v10" stroke="#555" strokeWidth="2" /><rect x="58" y="29" width="24" height="20" rx="5" fill="#ff7a59" /><rect x="62" y="33" width="16" height="8" rx="2" fill="#cfe9ff" /></svg>
);
const Heart = () => (
  <svg viewBox="0 0 40 36" width="34" height="30"><path d="M20 34S2 22 2 11A9 9 0 0 1 20 7a9 9 0 0 1 18 4c0 11-18 23-18 23z" fill="#ff6b8a" /></svg>
);

type Item = { el: ReactElement; side: 'l' | 'r'; top: string; dx?: number; scale?: number; o?: number };

const SCENES: Record<WorldTheme, Item[]> = {
  tropical: [
    { el: <Sun />, side: 'r', top: '6%', dx: 14 }, { el: <Palm />, side: 'l', top: '14%' }, { el: <Cloud />, side: 'r', top: '30%', dx: 30, o: .9 },
    { el: <Palm c="#2a8f68" />, side: 'r', top: '52%', scale: .85 }, { el: <Plane />, side: 'l', top: '72%', dx: 10 }, { el: <Palm />, side: 'l', top: '88%', scale: .8 },
  ],
  themepark: [
    { el: <Ferris />, side: 'l', top: '6%' }, { el: <Coaster />, side: 'r', top: '20%' }, { el: <Cloud />, side: 'l', top: '34%', o: .7 },
    { el: <Ferris />, side: 'r', top: '50%', scale: .7 }, { el: <Coaster />, side: 'l', top: '66%', scale: .8 }, { el: <Palm />, side: 'r', top: '84%', scale: .8 },
  ],
  beach: [
    { el: <Sun c="#ffb347" />, side: 'r', top: '4%' }, { el: <Umbrella />, side: 'l', top: '24%' }, { el: <Wave />, side: 'r', top: '48%' }, { el: <Palm />, side: 'l', top: '66%', scale: .8 },
  ],
  highway: [
    { el: <Sign text="I-95" />, side: 'l', top: '8%' }, { el: <Pine />, side: 'r', top: '16%' }, { el: <Car />, side: 'l', top: '38%' },
    { el: <Pine c="#3d7d5c" />, side: 'r', top: '54%', scale: .8 }, { el: <Sign text="I-75" />, side: 'r', top: '74%' }, { el: <Pine />, side: 'l', top: '84%', scale: .9 },
  ],
  snow: [
    { el: <Mountain />, side: 'l', top: '2%', dx: -20 }, { el: <Pine snow />, side: 'r', top: '8%' }, { el: <Gondola />, side: 'r', top: '22%', dx: -20 },
    { el: <House lights />, side: 'l', top: '30%' }, { el: <Pine snow c="#2b5f49" />, side: 'r', top: '44%' }, { el: <Mountain />, side: 'r', top: '58%', dx: -30, scale: .85 },
    { el: <Pine snow />, side: 'l', top: '64%' }, { el: <House lights />, side: 'r', top: '78%', scale: .85 }, { el: <Pine snow />, side: 'l', top: '90%', scale: .8 },
  ],
  'highway-return': [
    { el: <Pine snow />, side: 'l', top: '6%' }, { el: <Sign text="I-75" />, side: 'r', top: '18%' }, { el: <Car />, side: 'l', top: '42%' },
    { el: <Pine />, side: 'r', top: '58%', scale: .85 }, { el: <Palm />, side: 'l', top: '80%', scale: .8 }, { el: <Sun />, side: 'r', top: '86%', scale: .8 },
  ],
  'florida-return': [
    { el: <Sun c="#ff9f43" />, side: 'l', top: '6%' }, { el: <Palm />, side: 'r', top: '18%' }, { el: <Wave />, side: 'l', top: '46%' }, { el: <Umbrella />, side: 'r', top: '64%', scale: .9 },
  ],
  home: [
    { el: <Plane />, side: 'r', top: '6%' }, { el: <Palm />, side: 'l', top: '20%' }, { el: <House />, side: 'r', top: '48%' }, { el: <Heart />, side: 'l', top: '66%', dx: 20 }, { el: <Palm c="#2a8f68" />, side: 'r', top: '80%', scale: .8 },
  ],
};

export function WorldDecor({ theme, snow }: { theme: WorldTheme; snow?: boolean }) {
  return (
    <div className="decor" aria-hidden="true">
      {SCENES[theme].map((it, i) => (
        <div key={i} className={`decor-item decor-${it.side}`} style={{ top: it.top, [it.side === 'l' ? 'left' : 'right']: (it.dx ?? 0) + 'px', transform: `scale(${it.scale ?? 1})`, opacity: it.o ?? 1 }}>
          {it.el}
        </div>
      ))}
      {snow && <div className="snowfall">{Array.from({ length: 36 }).map((_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i * 0.71) % 9}s`, animationDuration: `${7 + (i % 5)}s`, width: 3 + (i % 3) * 2, height: 3 + (i % 3) * 2 }} />)}</div>}
    </div>
  );
}
