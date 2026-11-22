import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icons';

/** Bottom sheet on mobile, centered panel on desktop. Closes with Escape / backdrop. */
export function Sheet({ title, subtitle, onClose, children, wide, full, footer, labelledBy }: {
  title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; full?: boolean; footer?: ReactNode; labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('keydown', k); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`sheet ${wide ? 'wide' : ''} ${full ? 'full' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} ref={ref} tabIndex={-1}>
        <div className="sheet-grip" aria-hidden="true" />
        <header className="sheet-head">
          <div className="sheet-titles">
            <h2>{title}</h2>
            {subtitle && <div className="sheet-sub">{subtitle}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Pill({ children, tone = 'neutral', icon }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'accent'; icon?: string }) {
  return <span className={`pill pill-${tone}`}>{icon && <Icon name={icon} size={13} />}{children}</span>;
}
