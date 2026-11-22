import type { BudgetCategory, Cost, CostStatus, TripData } from '../types';
import { flatten } from './itinerary';

export interface BudgetLine {
  id: string;
  source: 'activity' | 'extra' | 'payment';
  name: string;
  worldId: string | null;
  date: string | null;
  category: BudgetCategory;
  status: CostStatus;
  /** Planned amount (quote / estimate / published / paid). null = unknown, never invented. */
  estimate: number | null;
  /** Real definitive spending. */
  actual: number | null;
  deposit: number;
  note?: string | null;
}

export const CATEGORY_LABEL: Record<BudgetCategory, string> = {
  flights: 'Vuelos', lodging: 'Hospedaje', tickets: 'Boletos parques', transport: 'Transporte', car: 'Vehículo', fuel: 'Combustible',
  food: 'Alimentos', tolls: 'Peajes', shopping: 'Compras', personal: 'Gastos personales', attractions: 'Atracciones', other: 'Otros',
};
export const COST_STATUS_LABEL: Record<CostStatus, string> = {
  paid: 'Pagado', pending_payment: 'Reservado · pago pendiente', quote: 'Cotización', estimate: 'Estimado', published_price: 'Precio publicado',
  unknown: 'Importe desconocido', none: 'Sin costo',
};

export function travellerCount(trip: TripData) { return trip.trip.travelers.adults + trip.trip.travelers.minors.length; }

export function costTotal(c: Cost | null | undefined, travellers: number): number | null {
  if (!c) return null;
  if (c.status === 'none') return 0;
  if (c.total != null) return c.total;
  if (c.pricePerPerson != null) return Math.round(c.pricePerPerson * travellers * 100) / 100;
  return null;
}

export function budgetLines(trip: TripData): BudgetLine[] {
  const n = travellerCount(trip);
  const payments = trip.budget.payments;
  const paidFor = (id: string) => {
    const ps = payments.filter(p => p.linkedTo === id && !p.refundable);
    return ps.length ? ps.reduce((s, p) => s + toUsd(trip, p.amount, p.currency), 0) : null;
  };
  const depositFor = (id: string) => payments.filter(p => p.linkedTo === id && p.refundable).reduce((s, p) => s + toUsd(trip, p.amount, p.currency), 0);
  const lines: BudgetLine[] = [];
  for (const f of flatten(trip)) {
    const c = f.activity.cost;
    if (!c) continue;
    lines.push({
      id: f.activity.id, source: 'activity', name: f.activity.name, worldId: f.world.id, date: f.date, category: c.category, status: c.status,
      estimate: costTotal(c, n), actual: paidFor(f.activity.id) ?? c.actual ?? null,
      deposit: (c.refundableDeposit ?? 0) + depositFor(f.activity.id), note: c.note,
    });
  }
  for (const x of trip.budget.extraItems) {
    lines.push({
      id: x.id, source: 'extra', name: x.name, worldId: x.worldId, date: x.date, category: x.cost.category, status: x.cost.status,
      estimate: costTotal(x.cost, n), actual: paidFor(x.id) ?? x.cost.actual ?? null,
      deposit: (x.cost.refundableDeposit ?? 0) + depositFor(x.id), note: x.cost.note,
    });
  }
  const known = new Set(lines.map(l => l.id));
  for (const p of payments) {
    if (p.linkedTo && known.has(p.linkedTo)) continue;
    lines.push({
      id: p.id, source: 'payment', name: p.description || 'Pago', worldId: null, date: p.date, category: 'other', status: 'paid',
      estimate: null, actual: p.refundable ? null : toUsd(trip, p.amount, p.currency), deposit: p.refundable ? toUsd(trip, p.amount, p.currency) : 0,
    });
  }
  return lines;
}

export function toUsd(trip: TripData, amount: number, currency: 'USD' | 'DOP'): number {
  if (currency === 'USD') return amount;
  const r = trip.budget.exchangeRate?.usdToDop;
  return r ? amount / r : NaN;
}

export interface BudgetSummary {
  totalBudget: number | null;
  estimateKnown: number;
  unknownCount: number;
  actual: number;
  balance: number | null;
  deposits: number;
  perPersonActual: number;
  perPersonEstimate: number;
  byStatus: Record<string, number>;
  travellers: number;
}

export function summarize(trip: TripData, lines = budgetLines(trip)): BudgetSummary {
  const travellers = travellerCount(trip);
  let estimateKnown = 0, unknownCount = 0, actual = 0, deposits = 0;
  const byStatus: Record<string, number> = {};
  for (const l of lines) {
    const planned = l.actual ?? l.estimate;
    if (l.estimate == null && l.actual == null && l.status !== 'none') unknownCount++;
    if (planned != null) { estimateKnown += planned; byStatus[l.status] = (byStatus[l.status] ?? 0) + planned; }
    if (l.actual != null && !isNaN(l.actual)) actual += l.actual;
    deposits += l.deposit;
  }
  const tb = trip.budget.totalBudget;
  return {
    totalBudget: tb, estimateKnown, unknownCount, actual, deposits, travellers,
    balance: tb != null ? tb - actual : null,
    perPersonActual: actual / travellers, perPersonEstimate: estimateKnown / travellers, byStatus,
  };
}

export function groupBy(lines: BudgetLine[], key: (l: BudgetLine) => string) {
  const m = new Map<string, { estimate: number; actual: number; unknown: number; lines: BudgetLine[] }>();
  for (const l of lines) {
    const k = key(l);
    const g = m.get(k) ?? { estimate: 0, actual: 0, unknown: 0, lines: [] };
    const planned = l.actual ?? l.estimate;
    if (planned != null) g.estimate += planned; else if (l.status !== 'none') g.unknown++;
    if (l.actual != null) g.actual += l.actual;
    g.lines.push(l);
    m.set(k, g);
  }
  return m;
}

export function money(v: number | null | undefined, currency: 'USD' | 'DOP' = 'USD'): string {
  if (v == null || isNaN(v)) return '—';
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency, maximumFractionDigits: v % 1 ? 2 : 0 }).format(v);
}

export function budgetCsv(trip: TripData): string {
  const lines = budgetLines(trip);
  const worldName = (id: string | null) => trip.worlds.find(w => w.id === id)?.subtitle ?? '';
  const rate = trip.budget.exchangeRate?.usdToDop ?? null;
  const head = ['id', 'origen', 'concepto', 'mundo', 'fecha', 'categoria', 'estado', 'estimado_usd', 'real_usd', 'deposito_reembolsable_usd', ...(rate ? ['estimado_dop', 'real_dop'] : []), 'nota'];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = lines.map(l => [
    l.id, l.source, l.name, worldName(l.worldId), l.date ?? '', CATEGORY_LABEL[l.category], COST_STATUS_LABEL[l.status],
    l.estimate ?? '', l.actual ?? '', l.deposit || '',
    ...(rate ? [l.estimate != null ? (l.estimate * rate).toFixed(2) : '', l.actual != null ? (l.actual * rate).toFixed(2) : ''] : []),
    l.note ?? '',
  ].map(esc).join(','));
  return '﻿' + [head.join(','), ...rows].join('\n');
}
