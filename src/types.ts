/**
 * Family Trip Adventure — data model.
 *
 * Two separate documents:
 *  - TripData   : the itinerary (worlds → days → activities, budget, checklist). Editable / importable.
 *  - Progress   : the family's progress (statuses, checklist ticks, preferences). Never mixed into TripData.
 */

export const SCHEMA_VERSION = '1.0';

export type ISODate = string; // "2026-12-21"
/** Local wall-clock time, no offset: "2026-12-21T21:00". Interpreted in the activity's `timezone`. */
export type LocalDateTime = string;

export type ActivityType =
  | 'home' | 'transport' | 'airport' | 'flight' | 'hotel' | 'lodging' | 'restaurant'
  | 'attraction' | 'park' | 'viewpoint' | 'rest_stop' | 'shopping' | 'activity' | 'drive' | 'destination';

export type Priority = 'required' | 'high' | 'optional' | 'alternative';

/** How reliable a piece of information is. */
export type InfoStatus = 'confirmed' | 'estimated' | 'pending' | 'suggested' | 'to_verify';

export type BookingStatus =
  | 'confirmed' | 'pending' | 'quote' | 'not_booked' | 'to_verify' | 'not_applicable';

export type CostStatus =
  | 'paid' | 'pending_payment' | 'quote' | 'estimate' | 'published_price' | 'unknown' | 'none';

export type CoordinatesStatus = 'verified' | 'geocoded' | 'approximate' | 'pending';

export type TransportMode = 'car' | 'walk' | 'plane' | 'rideshare' | 'shuttle' | 'gondola' | 'tram' | 'none' | 'pending';

export type WorldTheme = 'tropical' | 'themepark' | 'beach' | 'highway' | 'snow' | 'highway-return' | 'florida-return' | 'home';

export interface Coordinates { lat: number; lng: number }

export interface Location {
  name: string;
  address?: string | null;
  /** Free-text query used by the in-app geocoder (OpenStreetMap Nominatim). */
  geocodeQuery?: string | null;
  coordinates: Coordinates | null;
  coordinatesStatus: CoordinatesStatus;
  coordinatesSource?: string | null;
  parking?: string | null;
}

export interface Cost {
  /** Price per person, if the source gives it that way. */
  pricePerPerson?: number | null;
  /** Total for the group. If null and pricePerPerson set → pricePerPerson × travellers. */
  total?: number | null;
  /** Real amount actually spent (filled in during/after the trip). */
  actual?: number | null;
  currency: 'USD' | 'DOP';
  status: CostStatus;
  category: BudgetCategory;
  /** Refundable deposit amount, tracked separately from definitive spending. */
  refundableDeposit?: number | null;
  note?: string | null;
}

export type BudgetCategory =
  | 'flights' | 'lodging' | 'tickets' | 'transport' | 'car' | 'fuel' | 'food' | 'tolls'
  | 'shopping' | 'personal' | 'attractions' | 'other';

export interface Link { label: string; url: string }

export interface Photo { id: string; src: string; caption?: string }

export interface Activity {
  id: string;
  name: string;
  type: ActivityType;
  priority: Priority;
  /** If this is an alternative, the id of the activity it can replace (side path on the roadmap). */
  alternativeFor?: string | null;
  plannedStart: LocalDateTime | null;
  plannedEnd: LocalDateTime | null;
  timezone: string;
  /** Some activities (flights) end in another zone. */
  endTimezone?: string | null;
  timeStatus: InfoStatus;
  durationMinutes?: number | null;
  location: Location | null;
  description?: string;
  photos?: Photo[];
  cost?: Cost | null;
  bookingStatus: BookingStatus;
  transportMode?: TransportMode;
  /** Travel to the next node. Only filled from a real routing provider or a confirmed source. */
  travelToNext?: { mode: TransportMode; minutes: number | null; source: string | null } | null;
  links?: Link[];
  requirements?: string[];
  notes?: string;
  /** Marks a "fixed time" commitment (reservation, entry slot, flight) that the recommender must respect. */
  fixedTime?: boolean;
  /** Shown when the activity depends on weather / openings. */
  conditions?: string | null;
}

export interface Day {
  date: ISODate;
  title?: string;
  activities: Activity[];
}

export interface World {
  id: string;
  order: number;
  name: string;
  subtitle: string;
  theme: WorldTheme;
  days: Day[];
}

export interface BudgetExtraItem {
  id: string;
  name: string;
  worldId: string | null;
  date: ISODate | null;
  cost: Cost;
}

export interface Payment {
  id: string;
  date: ISODate;
  amount: number;
  currency: 'USD' | 'DOP';
  /** activity id or extra budget item id */
  linkedTo: string | null;
  description: string;
  method?: string | null;
  refundable?: boolean;
}

export interface BudgetReference {
  id: string;
  label: string;
  worldIds: string[];
  amount: number;
  min?: number | null;
  max?: number | null;
  note?: string;
}

export interface Budget {
  currency: 'USD';
  /** Total budget the family decides. null = not defined yet. */
  totalBudget: number | null;
  exchangeRate: { usdToDop: number; source: string; date: ISODate } | null;
  references: BudgetReference[];
  extraItems: BudgetExtraItem[];
  payments: Payment[];
}

export interface ChecklistItem { id: string; label: string; category: 'documents' | 'bookings' | 'packing' | 'logistics' }

export interface TripData {
  schemaVersion: string;
  id: string;
  trip: {
    name: string;
    startDate: ISODate;
    endDate: ISODate;
    homeTimezone: string;
    travelers: { adults: number; minors: number[] };
    notes?: string;
  };
  worlds: World[];
  budget: Budget;
  checklist: ChecklistItem[];
  meta?: { updatedAt?: string; source?: string };
}

/* ---------------------------- Progress ---------------------------- */

export type UserStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'cancelled' | 'unavailable';
/** Visual status = user status + derived ones. */
export type VisualStatus = UserStatus | 'locked' | 'next';

export interface ActivityProgress {
  status: UserStatus;
  updatedAt: string;
  completedAt?: string;
  /** Alternative chosen to replace this activity. */
  replacedBy?: string | null;
}

export interface Progress {
  schemaVersion: string;
  tripId: string;
  activities: Record<string, ActivityProgress>;
  checklist: Record<string, boolean>;
  /** Manual destination chosen by the user in the GPS panel. */
  manualTargetId: string | null;
  updatedAt: string;
}

export interface Settings {
  travelMode: 'car' | 'walk';
  /** null = use real clock. Useful to preview the trip. */
  simulatedNow: string | null;
  showDop: boolean;
  nextPanelMinimized: boolean;
  mapProvider: 'google' | 'apple';
}

/** Export bundle with progress included. */
export interface TripBundle {
  schemaVersion: string;
  kind: 'family-trip-bundle';
  exportedAt: string;
  trip: TripData;
  progress: Progress;
}
