import type { Ionicons } from '@expo/vector-icons';
import type { ReminderType, RoutineCategory, Species } from '@/db/schema';
import { SPECIES_RULES } from './livestockRules';

export interface ReminderTypeMeta {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** How many days ahead of the due date this starts appearing in "coming up". */
  defaultLeadDays: number;
  /** Shown on the reminder card so the farmer knows why it matters. */
  why: string;
}

export const REMINDER_TYPE_META: Record<ReminderType, ReminderTypeMeta> = {
  heat_return: {
    label: 'Watch for heat',
    icon: 'eye',
    // Heat lasts under a day, so the watch has to start before the cycle date, not on it.
    defaultLeadDays: 3,
    why: 'If she returns to heat the service did not hold — catching it now saves a whole cycle.',
  },
  birth_due: {
    label: 'Birth due',
    icon: 'egg',
    defaultLeadDays: 7,
    why: 'Move her to a clean pen and have help ready.',
  },
  withdrawal_end: {
    label: 'Withdrawal ends',
    icon: 'shield-checkmark',
    defaultLeadDays: 0,
    why: 'Milk and meat are safe to sell again from this date.',
  },
  weaning_due: {
    label: 'Weaning due',
    icon: 'cut',
    defaultLeadDays: 3,
    why: 'Separate the young and adjust feed.',
  },
  vaccination: {
    label: 'Vaccination',
    icon: 'shield-checkmark',
    defaultLeadDays: 4,
    why: 'Missing a vaccination window costs far more than the vaccine does.',
  },
  feed_change: {
    label: 'Feed change',
    icon: 'nutrition',
    defaultLeadDays: 3,
    why: 'Change feed gradually over a few days rather than all at once.',
  },
  deworming: {
    label: 'Deworming',
    icon: 'flask',
    defaultLeadDays: 4,
    why: 'Worms quietly eat into growth and laying long before birds look unwell.',
  },
  hatching: {
    label: 'Incubator',
    icon: 'egg',
    defaultLeadDays: 1,
    why: 'Incubation runs to a tight clock, and the last three days especially.',
  },
  routine: {
    label: 'Routine task',
    icon: 'repeat',
    defaultLeadDays: 2,
    why: 'Recurring herd task.',
  },
};

export const ROUTINE_CATEGORY_META: Record<RoutineCategory, { label: string; defaultIntervalDays: number }> = {
  deworming: { label: 'Deworming', defaultIntervalDays: 90 },
  vaccination: { label: 'Vaccination', defaultIntervalDays: 365 },
  spraying: { label: 'Spraying / dipping', defaultIntervalDays: 14 },
  hoof_trimming: { label: 'Hoof trimming', defaultIntervalDays: 180 },
  other: { label: 'Other', defaultIntervalDays: 30 },
};

export const ROUTINE_CATEGORY_LIST = Object.entries(ROUTINE_CATEGORY_META).map(([value, meta]) => ({
  value: value as RoutineCategory,
  label: meta.label,
}));

/** Common repeat intervals, offered as chips so a schedule can be set without typing. */
export const INTERVAL_PRESETS = [
  { label: 'Weekly', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: 'Monthly', days: 30 },
  { label: '3 months', days: 90 },
  { label: '6 months', days: 180 },
  { label: 'Yearly', days: 365 },
];

/**
 * Whether a reminder type is switched on in Settings.
 *
 * Shared by the daily digest *and* the in-app lists: the setting is headed "What to remind me
 * about", so switching one off has to stop it appearing on the Reminders screen and the
 * dashboard too, not merely silence the notification.
 */
export function isReminderTypeEnabled(
  prefs:
    | {
        remindHeatReturn: boolean;
        remindBirthDue: boolean;
        remindWithdrawalEnd: boolean;
        remindWeaningDue: boolean;
        remindRoutine: boolean;
        remindPoultry: boolean;
      }
    | null
    | undefined,
  type: ReminderType,
): boolean {
  // Before the settings row exists, everything shows — silence should be opted into, never default.
  if (!prefs) return true;
  switch (type) {
    case 'vaccination':
    case 'feed_change':
    case 'deworming':
    case 'hatching':
      return prefs.remindPoultry;
    case 'heat_return':
      return prefs.remindHeatReturn;
    case 'birth_due':
      return prefs.remindBirthDue;
    case 'withdrawal_end':
      return prefs.remindWithdrawalEnd;
    case 'weaning_due':
      return prefs.remindWeaningDue;
    case 'routine':
      return prefs.remindRoutine;
    default:
      return true;
  }
}

/** Breeding events that start a pregnancy, and therefore imply a due date and a heat-return check. */
export const SERVICE_EVENT_TYPES = ['served_natural', 'served_ai', 'induced'] as const;

/** Days after a service when the animal should be watched for a return to heat. */
export function heatReturnDays(species: Species): number {
  const { min, max } = SPECIES_RULES[species].heatCycleDays;
  return Math.round((min + max) / 2);
}
