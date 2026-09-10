import type { Ionicons } from '@expo/vector-icons';
import type { Flock, FlockEventType, FlockSource, PoultryType } from '@/db/schema';
import { daysFromToday } from './livestockRules';

export const POULTRY_TYPE_META: Record<PoultryType, { label: string; description: string }> = {
  layers: { label: 'Layers', description: 'Kept for eggs' },
  broilers: { label: 'Broilers', description: 'Kept for meat, ready in 5–6 weeks' },
  kienyeji: { label: 'Kienyeji', description: 'Improved or indigenous, meat and eggs' },
  other: { label: 'Other', description: 'Ducks, turkeys, anything else' },
};

export const POULTRY_TYPE_OPTIONS = (Object.keys(POULTRY_TYPE_META) as PoultryType[]).map((value) => ({
  value,
  label: POULTRY_TYPE_META[value].label,
}));

/**
 * Typical age on arrival for each way of starting a flock.
 *
 * Point-of-lay pullets are sold at roughly 18 weeks, already most of the way through their
 * rearing. Recording that is what lets feed changes and vaccinations be scheduled against the
 * birds' real age rather than the day they happened to reach this farm.
 */
export const FLOCK_SOURCE_META: Record<FlockSource, { label: string; defaultAgeDays: number }> = {
  day_old: { label: 'Day-old chicks', defaultAgeDays: 0 },
  point_of_lay: { label: 'Point of lay', defaultAgeDays: 126 },
  hatched: { label: 'Hatched here', defaultAgeDays: 0 },
  other: { label: 'Other', defaultAgeDays: 0 },
};

export const FLOCK_SOURCE_OPTIONS = (Object.keys(FLOCK_SOURCE_META) as FlockSource[]).map((value) => ({
  value,
  label: FLOCK_SOURCE_META[value].label,
}));

export const FLOCK_EVENT_META: Record<
  FlockEventType,
  { label: string; icon: keyof typeof Ionicons.glyphMap; needsQuantity: boolean; reducesCount: boolean }
> = {
  mortality: { label: 'Deaths', icon: 'alert-circle-outline', needsQuantity: true, reducesCount: true },
  cull: { label: 'Culled', icon: 'remove-circle-outline', needsQuantity: true, reducesCount: true },
  sale: { label: 'Sold', icon: 'pricetag-outline', needsQuantity: true, reducesCount: true },
  purchase: { label: 'Added birds', icon: 'add-circle-outline', needsQuantity: true, reducesCount: false },
  vaccination: { label: 'Vaccination', icon: 'shield-checkmark-outline', needsQuantity: false, reducesCount: false },
  feed_change: { label: 'Feed change', icon: 'nutrition-outline', needsQuantity: false, reducesCount: false },
  deworming: { label: 'Deworming', icon: 'flask-outline', needsQuantity: false, reducesCount: false },
  other: { label: 'Other', icon: 'ellipsis-horizontal-outline', needsQuantity: false, reducesCount: false },
};

export const FLOCK_EVENT_OPTIONS = (Object.keys(FLOCK_EVENT_META) as FlockEventType[]).map((value) => ({
  value,
  label: FLOCK_EVENT_META[value].label,
}));

export interface PoultryScheduleItem {
  /** Stable identifier. Forms half the natural key that keeps one reminder per flock per item. */
  key: string;
  type: 'vaccination' | 'feed_change' | 'deworming';
  label: string;
  /** Age of the birds, in days, when this falls due. */
  ageDays: number;
  /** Repeats this often once it has first come due. */
  repeatDays?: number;
  /** How far ahead it starts showing as coming up. */
  leadDays: number;
  detail: string;
  appliesTo: readonly PoultryType[];
}

const ALL_POULTRY: readonly PoultryType[] = ['layers', 'broilers', 'kienyeji', 'other'];
const LAYING: readonly PoultryType[] = ['layers', 'kienyeji', 'other'];

/**
 * The default poultry programme, in days from hatch.
 *
 * Reviewed against Kenyan practice and adjusted on two points that matter: fowl pox moves to
 * weeks 6–8 by wing stab, and fowl typhoid — an injectable — sits at weeks 9–12 so the two
 * injections are not stacked on a bird that needs time to recover between them. Commercial
 * layers additionally get a killed ND+IB+EDS at 16–18 weeks, which is what stops laying
 * collapsing shortly after it starts.
 *
 * These are defaults, not instructions. Hatcheries and vets vary, so every reminder can be
 * skipped or marked done, and the detail line says what the window actually is.
 */
export const POULTRY_SCHEDULE: PoultryScheduleItem[] = [
  {
    key: 'mareks',
    type: 'vaccination',
    label: "Marek's disease",
    ageDays: 1,
    leadDays: 0,
    detail: 'Normally given at the hatchery on day one. Worth confirming it was done.',
    appliesTo: ALL_POULTRY,
  },
  {
    key: 'ndib_day7',
    type: 'vaccination',
    label: 'Newcastle + IB',
    ageDays: 7,
    leadDays: 1,
    detail: 'Eye drop or drinking water.',
    appliesTo: ALL_POULTRY,
  },
  {
    key: 'gumboro_day14',
    type: 'vaccination',
    label: 'Gumboro',
    ageDays: 14,
    leadDays: 1,
    detail: 'Drinking water.',
    appliesTo: ALL_POULTRY,
  },
  {
    key: 'gumboro_day21',
    type: 'vaccination',
    label: 'Gumboro booster',
    ageDays: 21,
    leadDays: 1,
    detail: 'Drinking water.',
    appliesTo: ALL_POULTRY,
  },
  {
    key: 'nd_day28',
    type: 'vaccination',
    label: 'Newcastle booster',
    ageDays: 28,
    leadDays: 1,
    detail: 'Eye drop or drinking water.',
    appliesTo: LAYING,
  },
  {
    key: 'fowl_pox',
    type: 'vaccination',
    label: 'Fowl pox',
    ageDays: 42,
    leadDays: 4,
    detail: 'Wing stab. Any time from week 6 to week 8.',
    appliesTo: LAYING,
  },
  {
    key: 'fowl_typhoid',
    type: 'vaccination',
    label: 'Fowl typhoid',
    ageDays: 63,
    leadDays: 7,
    detail:
      'Injectable, into the thigh or breast muscle. Any time from week 9 to week 12 — keep it well clear of the fowl pox, since two injectables close together are a heavy load on the bird.',
    appliesTo: LAYING,
  },
  {
    key: 'nd_ib_eds',
    type: 'vaccination',
    label: 'Newcastle + IB + EDS',
    ageDays: 112,
    leadDays: 7,
    detail:
      'Killed combined vaccine, weeks 16 to 18, before they come into lay. This is what prevents a sudden crash in egg production once laying starts.',
    appliesTo: ['layers'],
  },
  {
    key: 'ndib_prelay',
    type: 'vaccination',
    label: 'Newcastle + IB booster',
    ageDays: 112,
    leadDays: 7,
    detail: 'Weeks 16 to 18, before lay begins.',
    appliesTo: ['kienyeji', 'other'],
  },
  {
    key: 'nd_quarterly',
    type: 'vaccination',
    label: 'Newcastle booster',
    ageDays: 126,
    repeatDays: 90,
    leadDays: 4,
    detail: 'Repeats every three months for as long as the flock is laying.',
    appliesTo: LAYING,
  },
  {
    key: 'deworm_prelay',
    type: 'deworming',
    label: 'Deworming',
    ageDays: 133,
    repeatDays: 90,
    leadDays: 4,
    detail: 'Start just before laying begins, at about week 19, then repeat every three months.',
    appliesTo: LAYING,
  },
  {
    key: 'feed_growers',
    type: 'feed_change',
    label: 'Move onto growers mash',
    ageDays: 56,
    leadDays: 3,
    detail: 'Chick mash runs to about week 8. Change over gradually across a few days.',
    appliesTo: LAYING,
  },
  {
    key: 'feed_layers',
    type: 'feed_change',
    label: 'Move onto layers mash',
    ageDays: 126,
    leadDays: 3,
    detail: 'From about week 18, as they come into lay. Layers mash carries the calcium they need for shells.',
    appliesTo: LAYING,
  },
  {
    key: 'feed_finisher',
    type: 'feed_change',
    label: 'Move onto broiler finisher',
    ageDays: 21,
    leadDays: 2,
    detail: 'Starter runs to about week 3.',
    appliesTo: ['broilers'],
  },
];

/** Age of the birds today, counting the age they already were when they arrived. */
export function flockAgeInDays(flock: Pick<Flock, 'acquiredDate' | 'ageAtAcquisitionDays'>): number {
  const daysHeld = Math.abs(daysFromToday(flock.acquiredDate) ?? 0);
  return daysHeld + flock.ageAtAcquisitionDays;
}

/** "8 weeks · 58 days" — farmers talk in weeks for poultry, but the exact day matters early on. */
export function formatFlockAge(days: number): string {
  const weeks = Math.floor(days / 7);
  if (days < 14) return `${days} ${days === 1 ? 'day' : 'days'} old`;
  return `${weeks} weeks · ${days} days`;
}
