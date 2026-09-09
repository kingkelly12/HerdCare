import type { Species } from '@/db/schema';

export interface SpeciesRule {
  label: string;
  /** Average gestation length used to project an expected due date from a breeding event. */
  gestationDays: number;
  /** Typical heat (oestrus) cycle length, in days, used for heat-return reminders. */
  heatCycleDays: { min: number; max: number };
  /** Typical age at weaning, in days, used to project a weaning-due date from a birth. */
  weaningDays: { min: number; max: number };
  /** Whether a single birth event commonly produces multiple offspring (litters). */
  multiparous: boolean;
}

export const SPECIES_RULES: Record<Species, SpeciesRule> = {
  cow: {
    label: 'Cow',
    gestationDays: 283,
    heatCycleDays: { min: 21, max: 21 },
    weaningDays: { min: 60, max: 180 },
    multiparous: false,
  },
  goat: {
    label: 'Goat',
    gestationDays: 150,
    heatCycleDays: { min: 17, max: 21 },
    weaningDays: { min: 90, max: 120 },
    multiparous: true,
  },
  sheep: {
    label: 'Sheep',
    gestationDays: 150,
    heatCycleDays: { min: 17, max: 21 },
    weaningDays: { min: 90, max: 120 },
    multiparous: true,
  },
  pig: {
    label: 'Pig',
    // 3 months, 3 weeks, 3 days.
    gestationDays: 114,
    heatCycleDays: { min: 21, max: 21 },
    weaningDays: { min: 21, max: 28 },
    multiparous: true,
  },
  horse: {
    label: 'Horse',
    gestationDays: 336,
    heatCycleDays: { min: 21, max: 21 },
    weaningDays: { min: 120, max: 180 },
    multiparous: false,
  },
  donkey: {
    label: 'Donkey',
    gestationDays: 365,
    heatCycleDays: { min: 21, max: 24 },
    weaningDays: { min: 150, max: 180 },
    multiparous: false,
  },
  dog: {
    label: 'Dog',
    gestationDays: 63,
    heatCycleDays: { min: 180, max: 210 },
    weaningDays: { min: 42, max: 56 },
    multiparous: true,
  },
};

export const SPECIES_LIST = Object.entries(SPECIES_RULES).map(([value, rule]) => ({
  value: value as Species,
  label: rule.label,
}));

// Every calendar-day calculation below works in the device's local time, matching what
// `formatDateForDisplay` shows the farmer. Instants are still stored as UTC ISO strings;
// only the notion of "which day is this" is local. Mixing the two (UTC arithmetic against
// local display) puts due-date countdowns and withdrawal windows off by a day.
export function addDaysIso(iso: string, days: number): string {
  const date = new Date(iso);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

/** Local midnight at the start of today, as an ISO instant — the lower bound for "on or after today". */
export function startOfTodayIso(): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

/** Projects the expected due (calving/kidding/farrowing/foaling) date from a breeding event date. */
export function calculateExpectedDueDate(species: Species, breedingDateIso: string): string {
  return addDaysIso(breedingDateIso, SPECIES_RULES[species].gestationDays);
}

/** Projects the weaning-due date from a birth date, using the midpoint of the species' typical range. */
export function calculateWeaningDueDate(species: Species, birthDateIso: string): string {
  const { min, max } = SPECIES_RULES[species].weaningDays;
  const midpoint = Math.round((min + max) / 2);
  return addDaysIso(birthDateIso, midpoint);
}

/** Projects the next expected heat date, e.g. to flag a missed/failed breeding. */
export function calculateNextHeatDate(species: Species, lastHeatOrServiceDateIso: string): string {
  const { min, max } = SPECIES_RULES[species].heatCycleDays;
  const midpoint = Math.round((min + max) / 2);
  return addDaysIso(lastHeatOrServiceDateIso, midpoint);
}

export interface QuickDateOption {
  label: string;
  offsetDays: number;
}

export const QUICK_DATE_OPTIONS: QuickDateOption[] = [
  { label: 'Today', offsetDays: 0 },
  { label: 'Yesterday', offsetDays: -1 },
  { label: '-3 days', offsetDays: -3 },
  { label: '-7 days', offsetDays: -7 },
];

/** Quick offsets for choosing a date ahead, e.g. when a repeating task first falls due. */
export const QUICK_FUTURE_DATE_OPTIONS: QuickDateOption[] = [
  { label: 'Today', offsetDays: 0 },
  { label: 'Tomorrow', offsetDays: 1 },
  { label: '+1 week', offsetDays: 7 },
  { label: '+1 month', offsetDays: 30 },
];

/** Returns an ISO string for "now + offsetDays", used by the quick relative-date buttons. */
export function getRelativeDateIso(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString();
}

/** True when `iso` falls on the same local calendar day as `getRelativeDateIso(offsetDays)`. */
export function isSameDayAsOffset(iso: string, offsetDays: number): boolean {
  const a = new Date(iso);
  const b = new Date(getRelativeDateIso(offsetDays));
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Human-friendly display for an ISO date, e.g. "8 Sep 2026". */
export function formatDateForDisplay(iso: string | null | undefined): string {
  if (!iso) return '—';
  return DATE_FORMATTER.format(new Date(iso));
}

/** Whole local-calendar-day difference between an ISO date and today (positive = in the future). */
export function daysFromToday(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Rounding absorbs the ±1h that a daylight-saving shift puts into the span.
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
