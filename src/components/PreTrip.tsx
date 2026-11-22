import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { useTripDay } from '../state/hooks';
import { BOOKING_LABEL } from '../lib/itinerary';
import { daysBetween, dateLabel } from '../lib/time';
import { Icon } from './Icons';
import { Pill, Sheet } from './Sheet';

const PENDING_BOOKING = ['to_verify', 'quote', 'not_booked', 'pending'];

function usePrep() {
  const { trip, flat, progress } = useStore();
  const bookings = flat.filter(f => PENDING_BOOKING.includes(f.activity.bookingStatus));
  const done = trip.checklist.filter(c => progress.checklist[c.id]).length;
  const pendingCoords = flat.filter(f => f.activity.location && !f.activity.location.coordinates).length;
  return { bookings, done, total: trip.checklist.length, pendingCoords };
}

export function PreTripCard() {
  const { trip } = useStore();
  const { today } = useTripDay();
  const ui = useUI();
  const { bookings, done, total } = usePrep();
  const days = daysBetween(today, trip.trip.startDate);
  return (
    <button className="pretrip" onClick={() => ui.open('prep')}>
      <div className="pt-count"><strong>{days}</strong><span>{days === 1 ? 'día' : 'días'}</span></div>
      <div className="pt-info">
        <span className="pt-kicker">Cuenta regresiva</span>
        <span className="pt-title">La aventura empieza el {dateLabel(trip.trip.startDate).toLowerCase()}</span>
        <span className="pt-meta"><Icon name="checklist" size={14} /> {done}/{total} preparativos · <Icon name="alert" size={14} /> {bookings.length} reservas por confirmar</span>
      </div>
    </button>
  );
}

export function PrepSheet() {
  const { trip, progress, toggleChecklist } = useStore();
  const ui = useUI();
  const { bookings, done, total, pendingCoords } = usePrep();
  const cats: Record<string, string> = { documents: 'Documentos', bookings: 'Reservas', logistics: 'Logística', packing: 'Equipaje' };
  return (
    <Sheet title="Preparativos" subtitle={`${done} de ${total} listos`} onClose={ui.close}>
      {Object.entries(cats).map(([k, label]) => {
        const items = trip.checklist.filter(c => c.category === k);
        if (!items.length) return null;
        return (
          <div key={k} className="block">
            <h3>{label}</h3>
            <ul className="checklist">
              {items.map(c => (
                <li key={c.id}>
                  <label className={progress.checklist[c.id] ? 'done' : ''}>
                    <input type="checkbox" checked={!!progress.checklist[c.id]} onChange={() => toggleChecklist(c.id)} />
                    <span>{c.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <div className="block">
        <h3>Reservas y datos por confirmar ({bookings.length})</h3>
        <ul className="rows">
          {bookings.map(f => (
            <li key={f.activity.id}>
              <button className="row" onClick={() => { ui.close(); ui.select(f.activity.id); }}>
                <Icon name={f.activity.type} size={18} />
                <span className="row-main"><b>{f.activity.name}</b><small>{dateLabel(f.date, 'short')}</small></span>
                <Pill tone="warn">{BOOKING_LABEL[f.activity.bookingStatus]}</Pill>
              </button>
            </li>
          ))}
        </ul>
        <p className="muted small">{pendingCoords} ubicaciones tienen coordenadas pendientes. Pueden resolverlas desde el editor (buscar en OpenStreetMap o usar la ubicación actual).</p>
      </div>
    </Sheet>
  );
}
