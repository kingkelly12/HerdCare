import type { Flock, ReminderType } from '@/db/schema';
import { addDaysIso, startOfDayIso } from './livestockRules';
import { POULTRY_SCHEDULE, type PoultryScheduleItem } from './poultryRules';

export interface DerivedFlockReminder {
  flockId: string;
  /** `${flockId}:${item.key}` — one reminder per flock per scheduled item. */
  sourceEventId: string;
  type: ReminderType;
  title: string;
  dueDate: string;
  leadDays: number;
  notes: string;
}

/** The date a scheduled item falls due for a flock, from the birds' age rather than arrival. */
function dueDateFor(flock: Pick<Flock, 'acquiredDate' | 'ageAtAcquisitionDays'>, ageDays: number): string {
  return startOfDayIso(addDaysIso(flock.acquiredDate, ageDays - flock.ageAtAcquisitionDays));
}

/**
 * For a repeating item, the occurrence worth showing: the next one still ahead, or the most
 * recent one if it has slipped. Emitting every past repeat would bury the farmer in years of
 * quarterly boosters they can do nothing about.
 */
function relevantOccurrence(first: string, repeatDays: number, floorDate: string, today: string): string {
  let due = first;
  // Walk forward while the occurrence is already behind us, stopping on the one that is due next.
  let guard = 0;
  while (due < today && guard < 200) {
    due = startOfDayIso(addDaysIso(due, repeatDays));
    guard++;
  }
  // If even the first occurrence is in the future, that is the one; if walking forward overshot
  // a still-actionable overdue occurrence, prefer that.
  const previous = startOfDayIso(addDaysIso(due, -repeatDays));
  return previous >= floorDate && previous < today ? previous : due;
}

export function computePoultryReminders(options: {
  flocks: Flock[];
  floorDate: string;
  today: string;
}): DerivedFlockReminder[] {
  const out: DerivedFlockReminder[] = [];

  for (const flock of options.flocks) {
    // A closed batch is finished; nothing further is owed to it.
    if (flock.status !== 'active') continue;

    for (const item of POULTRY_SCHEDULE) {
      if (!item.appliesTo.includes(flock.poultryType)) continue;

      const first = dueDateFor(flock, item.ageDays);
      const dueDate = item.repeatDays
        ? relevantOccurrence(first, item.repeatDays, options.floorDate, options.today)
        : first;

      // Anything long past is dropped rather than surfaced. This is what keeps a flock bought at
      // point of lay from arriving with four months of chick vaccinations already overdue.
      if (dueDate < options.floorDate) continue;

      out.push({
        flockId: flock.id,
        sourceEventId: `${flock.id}:${item.key}`,
        type: item.type,
        title: item.label,
        dueDate,
        leadDays: item.leadDays,
        notes: item.detail,
      });
    }
  }

  return out;
}

export function scheduleItemFor(key: string): PoultryScheduleItem | undefined {
  return POULTRY_SCHEDULE.find((item) => item.key === key);
}

export interface DerivedHatchReminder {
  hatchBatchId: string;
  sourceEventId: string;
  title: string;
  dueDate: string;
  leadDays: number;
  notes: string;
}

/**
 * The incubation milestones for a batch of eggs.
 *
 * Candling days are fixed; lockdown and hatch are counted back from the end of incubation, so a
 * 28-day duck batch gets its lockdown on day 25 rather than day 18. Lockdown matters more than it
 * sounds — opening the incubator in the last three days is one of the commonest reasons a batch
 * with good fertility still hatches badly.
 */
export function computeHatchReminders(options: {
  batches: {
    id: string;
    setDate: string;
    incubationDays: number;
    hatchedDate: string | null;
  }[];
  floorDate: string;
}): DerivedHatchReminder[] {
  const out: DerivedHatchReminder[] = [];

  for (const batch of options.batches) {
    // Once the hatch is recorded the batch is finished and owes nothing further.
    if (batch.hatchedDate) continue;

    const milestones = [
      {
        key: 'candle_1',
        day: 7,
        title: 'Candle the eggs',
        notes: 'Hold a light to each egg and take out the clears — infertile eggs left in can spoil and burst.',
        leadDays: 1,
      },
      {
        key: 'candle_2',
        day: 14,
        title: 'Candle again',
        notes: 'Second check for eggs that started and then stopped.',
        leadDays: 1,
      },
      {
        key: 'lockdown',
        day: batch.incubationDays - 3,
        title: 'Lockdown',
        notes: 'Stop turning, raise the humidity, and keep the incubator shut until they hatch.',
        leadDays: 1,
      },
      {
        key: 'hatch',
        day: batch.incubationDays,
        title: 'Hatch due',
        notes: 'Leave the chicks in until they are dry and fluffed up before moving them to the brooder.',
        leadDays: 1,
      },
    ];

    for (const milestone of milestones) {
      // A short incubation would put the second candling past lockdown; skip it rather than
      // asking a farmer to open an incubator that should stay shut.
      if (milestone.day <= 0 || milestone.day > batch.incubationDays) continue;
      if (milestone.key === 'candle_2' && milestone.day >= batch.incubationDays - 3) continue;

      const dueDate = startOfDayIso(addDaysIso(batch.setDate, milestone.day));
      if (dueDate < options.floorDate) continue;

      out.push({
        hatchBatchId: batch.id,
        sourceEventId: `${batch.id}:${milestone.key}`,
        title: milestone.title,
        dueDate,
        leadDays: milestone.leadDays,
        notes: milestone.notes,
      });
    }
  }

  return out;
}
