import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { budgetLines, CATEGORY_LABEL, COST_STATUS_LABEL, groupBy, money, summarize, type BudgetLine } from '../lib/budget';
import { findActivity, sortedWorlds } from '../lib/itinerary';
import { dateLabel } from '../lib/time';
import type { BudgetCategory, Cost, CostStatus } from '../types';
import { Icon } from './Icons';
import { Pill } from './Sheet';

type GroupMode = 'category' | 'world' | 'day' | 'status';

function num(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v.replace(',', '.'));
  return isFinite(n) && n >= 0 ? n : null;
}

export function BudgetView() {
  const { trip, updateTrip, settings, updateSettings } = useStore();
  const ui = useUI();
  const [mode, setMode] = useState<GroupMode>('category');
  const [editing, setEditing] = useState<string | null>(null);
  const [showPay, setShowPay] = useState(false);
  const lines = useMemo(() => budgetLines(trip), [trip]);
  const s = useMemo(() => summarize(trip, lines), [trip, lines]);
  const rate = trip.budget.exchangeRate?.usdToDop ?? null;
  const dop = settings.showDop && rate ? (v: number | null) => v == null ? '' : ` · ${money(v * rate, 'DOP')}` : () => '';
  const worldName = (id: string | null) => { const w = trip.worlds.find(x => x.id === id); return w ? `Mundo ${w.order} · ${w.subtitle}` : 'General'; };

  const groups = useMemo(() => {
    const key = (l: BudgetLine) => mode === 'category' ? CATEGORY_LABEL[l.category] : mode === 'world' ? worldName(l.worldId) : mode === 'day' ? (l.date ?? 'Sin fecha') : COST_STATUS_LABEL[l.status];
    const g = [...groupBy(lines, key).entries()];
    if (mode === 'day') g.sort((a, b) => a[0].localeCompare(b[0]));
    if (mode === 'world') { const order = sortedWorlds(trip).map(w => `Mundo ${w.order} · ${w.subtitle}`); g.sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99)); }
    return g;
  }, [lines, mode, trip]);

  const setCost = (l: BudgetLine, patch: Partial<Cost>) => updateTrip(d => {
    if (l.source === 'activity') { const f = findActivity(d, l.id); if (f?.activity.cost) Object.assign(f.activity.cost, patch); }
    else if (l.source === 'extra') { const x = d.budget.extraItems.find(e => e.id === l.id); if (x) Object.assign(x.cost, patch); }
  });

  return (
    <div className="budget">
      <section className="kpis">
        <div className="kpi">
          <span className="k">Presupuesto total</span>
          <input className="kpi-input" inputMode="decimal" placeholder="Definir" defaultValue={trip.budget.totalBudget ?? ''} key={'tb' + trip.budget.totalBudget}
            onBlur={e => updateTrip(d => { d.budget.totalBudget = num(e.target.value); })} aria-label="Presupuesto total en USD" />
          <span className="s">USD{dop(s.totalBudget)}</span>
        </div>
        <div className="kpi"><span className="k">Gasto real</span><span className="v">{money(s.actual)}</span><span className="s">{money(s.perPersonActual)} por persona{dop(s.actual)}</span></div>
        <div className="kpi"><span className="k">Saldo disponible</span><span className={`v ${s.balance != null && s.balance < 0 ? 'neg' : ''}`}>{s.balance != null ? money(s.balance) : '—'}</span><span className="s">{s.totalBudget == null ? 'Definan un presupuesto' : 'presupuesto − real'}</span></div>
        <div className="kpi"><span className="k">Planificado conocido</span><span className="v">{money(s.estimateKnown)}</span><span className="s">{money(s.perPersonEstimate)} p/p · <b className="warn-t">{s.unknownCount} importes sin definir</b></span></div>
      </section>

      {s.deposits > 0 && <div className="callout info small">Depósitos reembolsables (separados del gasto): <b>{money(s.deposits)}</b></div>}

      {trip.budget.references.map(r => {
        const inWorlds = lines.filter(l => l.worldId && r.worldIds.includes(l.worldId));
        const known = inWorlds.reduce((a, l) => a + (l.actual ?? l.estimate ?? 0), 0);
        const pct = Math.min(100, (known / (r.max ?? r.amount)) * 100);
        return (
          <section key={r.id} className="ref-card">
            <div className="ref-head"><b>{r.label}</b><span>{money(r.amount)} <span className="muted small">(rango {money(r.min)}–{money(r.max)})</span></span></div>
            <div className="ref-bar"><i style={{ width: pct + '%' }} /><em style={{ left: `${(r.amount / (r.max ?? r.amount)) * 100}%` }} /></div>
            <p className="tiny muted">Importes conocidos en estos mundos: {money(known)}. {r.note}</p>
          </section>
        );
      })}

      <section className="fx">
        <label className="chk"><input type="checkbox" checked={settings.showDop} onChange={e => updateSettings({ showDop: e.target.checked })} disabled={!rate} /> Mostrar en DOP</label>
        <input inputMode="decimal" placeholder="Tasa USD→DOP" defaultValue={rate ?? ''} key={'r' + rate} className="input-sm" aria-label="Tasa de cambio USD a DOP"
          onBlur={e => { const v = num(e.target.value); updateTrip(d => { d.budget.exchangeRate = v ? { usdToDop: v, source: d.budget.exchangeRate?.source || 'Ingresada manualmente', date: new Date().toISOString().slice(0, 10) } : null; }); }} />
        <input placeholder="Fuente de la tasa" defaultValue={trip.budget.exchangeRate?.source ?? ''} key={'rs' + trip.budget.exchangeRate?.source} className="input-sm" disabled={!rate} aria-label="Fuente de la tasa"
          onBlur={e => updateTrip(d => { if (d.budget.exchangeRate) d.budget.exchangeRate.source = e.target.value || 'Ingresada manualmente'; })} />
        {trip.budget.exchangeRate && <span className="tiny muted">Tasa {trip.budget.exchangeRate.usdToDop} · {trip.budget.exchangeRate.source} · {trip.budget.exchangeRate.date}</span>}
      </section>

      <div className="seg" role="tablist" aria-label="Agrupar gastos">
        {(['category', 'world', 'day', 'status'] as GroupMode[]).map(m => (
          <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
            {{ category: 'Categoría', world: 'Mundo', day: 'Día', status: 'Estado' }[m]}
          </button>
        ))}
      </div>

      {groups.map(([name, g]) => (
        <section key={name} className="bgroup">
          <header><b>{mode === 'day' && name !== 'Sin fecha' ? dateLabel(name, 'short') : name}</b>
            <span>{money(g.estimate)} plan · {money(g.actual)} real{g.unknown ? <em className="warn-t"> · {g.unknown} sin importe</em> : null}</span></header>
          <ul>
            {g.lines.map(l => (
              <li key={l.id + l.source} className="bline">
                <button className="bl-main" onClick={() => setEditing(editing === l.id ? null : l.id)} aria-expanded={editing === l.id}>
                  <span className="bl-name">{l.name}</span>
                  <span className="bl-sub"><Pill tone={l.status === 'paid' ? 'good' : l.status === 'unknown' ? 'bad' : l.status === 'none' ? 'neutral' : 'warn'}>{COST_STATUS_LABEL[l.status]}</Pill>{l.note && <span className="tiny muted"> {l.note}</span>}</span>
                </button>
                <span className="bl-amt"><b>{l.estimate != null ? money(l.estimate) : '—'}</b>{l.actual != null && <small>real {money(l.actual)}</small>}</span>
                {editing === l.id && l.source !== 'payment' && (
                  <div className="bl-edit">
                    <label>Estimado / cotizado (USD total)<input inputMode="decimal" defaultValue={l.estimate ?? ''} onBlur={e => setCost(l, { total: num(e.target.value) })} /></label>
                    <label>Real (USD)<input inputMode="decimal" defaultValue={l.actual ?? ''} onBlur={e => setCost(l, { actual: num(e.target.value) })} /></label>
                    <label>Depósito reembolsable<input inputMode="decimal" defaultValue={l.deposit || ''} onBlur={e => setCost(l, { refundableDeposit: num(e.target.value) })} /></label>
                    <label>Estado<select defaultValue={l.status} onChange={e => setCost(l, { status: e.target.value as CostStatus })}>
                      {Object.entries(COST_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                    <label>Categoría<select defaultValue={l.category} onChange={e => setCost(l, { category: e.target.value as BudgetCategory })}>
                      {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                    <div className="row-end">
                      {l.source === 'activity' && <button className="btn btn-sm btn-ghost" onClick={() => ui.select(l.id)}>Ver actividad</button>}
                      {l.source === 'extra' && <button className="btn btn-sm btn-ghost danger" onClick={() => { if (confirm(`¿Eliminar "${l.name}" del presupuesto?`)) updateTrip(d => { d.budget.extraItems = d.budget.extraItems.filter(x => x.id !== l.id); }); }}><Icon name="trash" size={14} /> Eliminar</button>}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="row-wrap pad">
        <button className="btn" onClick={() => setShowPay(true)}><Icon name="plus" size={16} /> Registrar pago</button>
        <button className="btn" onClick={() => {
          const name = prompt('Nombre del concepto (p. ej. "Seguro de viaje")');
          if (!name) return;
          updateTrip(d => { d.budget.extraItems.push({ id: 'x-' + Date.now().toString(36), name, worldId: null, date: null, cost: { total: null, actual: null, pricePerPerson: null, currency: 'USD', status: 'estimate', category: 'other', refundableDeposit: null, note: null } }); });
        }}><Icon name="plus" size={16} /> Agregar concepto</button>
      </div>

      {showPay && <PaymentForm lines={lines} onClose={() => setShowPay(false)} />}

      {trip.budget.payments.length > 0 && (
        <section className="bgroup">
          <header><b>Registro de pagos</b><span>{trip.budget.payments.length}</span></header>
          <ul>
            {[...trip.budget.payments].sort((a, b) => b.date.localeCompare(a.date)).map(p => (
              <li key={p.id} className="bline">
                <div className="bl-main"><span className="bl-name">{p.description}</span><span className="bl-sub tiny muted">{p.date} · {p.linkedTo ? lines.find(l => l.id === p.linkedTo)?.name ?? p.linkedTo : 'Sin vincular'}{p.refundable ? ' · Depósito reembolsable' : ''}{p.method ? ` · ${p.method}` : ''}</span></div>
                <span className="bl-amt"><b>{money(p.amount, p.currency)}</b></span>
                <button className="icon-btn xs" aria-label="Eliminar pago" onClick={() => { if (confirm('¿Eliminar este pago del registro?')) updateTrip(d => { d.budget.payments = d.budget.payments.filter(x => x.id !== p.id); }); }}><Icon name="trash" size={14} /></button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="tiny muted pad">Los importes sin dato quedan como “—”: la app no inventa precios. El presupuesto se recalcula al editar actividades, conceptos o pagos.</p>
    </div>
  );
}

function PaymentForm({ lines, onClose }: { lines: BudgetLine[]; onClose: () => void }) {
  const { updateTrip, trip } = useStore();
  const [f, setF] = useState({ description: '', amount: '', currency: 'USD' as 'USD' | 'DOP', date: new Date().toISOString().slice(0, 10), linkedTo: '', refundable: false, method: '' });
  const amount = num(f.amount);
  return (
    <form className="pay-form" onSubmit={e => {
      e.preventDefault();
      if (amount == null || !f.description) return;
      updateTrip(d => { d.budget.payments.push({ id: 'p-' + Date.now().toString(36), date: f.date, amount, currency: f.currency, linkedTo: f.linkedTo || null, description: f.description, method: f.method || null, refundable: f.refundable }); });
      onClose();
    }}>
      <h3>Registrar pago</h3>
      <label>Descripción<input required value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></label>
      <div className="two">
        <label>Importe<input required inputMode="decimal" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></label>
        <label>Moneda<select value={f.currency} onChange={e => setF({ ...f, currency: e.target.value as 'USD' | 'DOP' })}><option>USD</option><option disabled={!trip.budget.exchangeRate}>DOP</option></select></label>
      </div>
      <div className="two">
        <label>Fecha<input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></label>
        <label>Método<input value={f.method} placeholder="Tarjeta, efectivo…" onChange={e => setF({ ...f, method: e.target.value })} /></label>
      </div>
      <label>Vincular a<select value={f.linkedTo} onChange={e => setF({ ...f, linkedTo: e.target.value })}>
        <option value="">— Sin vincular —</option>
        {lines.filter(l => l.source !== 'payment').map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select></label>
      <label className="chk"><input type="checkbox" checked={f.refundable} onChange={e => setF({ ...f, refundable: e.target.checked })} /> Es un depósito reembolsable</label>
      <div className="row-end"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={amount == null || !f.description}>Guardar pago</button></div>
    </form>
  );
}
