import type { HatchBatch } from './schema';
import { addDaysIso, daysFromToday, startOfDayIso } from '@/utils/livestockRules';

export type HatchStage = 'incubating' | 'due' | 'complete';

/** Where a batch is in its 21 days. Derived, so it can never disagree with the dates recorded. */
export function hatchStage(batch: Pick<HatchBatch, 'setDate' | 'incubationDays' | 'hatchedDate'>): HatchStage {
  if (batch.hatchedDate) return 'complete';
  const daysLeft = daysFromToday(expectedHatchDate(batch));
  return daysLeft !== null && daysLeft <= 0 ? 'due' : 'incubating';
}

export function expectedHatchDate(batch: Pick<HatchBatch, 'setDate' | 'incubationDays'>): string {
  return startOfDayIso(addDaysIso(batch.setDate, batch.incubationDays));
}

/** Which day of incubation the batch is on, counting the day eggs were set as day 0. */
export function incubationDay(batch: Pick<HatchBatch, 'setDate'>): number {
  return Math.abs(daysFromToday(batch.setDate) ?? 0);
}

/**
 * Share of eggs that were actually fertile, from candling.
 *
 * Read together with hatchability this is the diagnosis: poor fertility points at the breeding
 * birds — too few cockerels, or ones past it — while good fertility alongside a poor hatch points
 * at the incubator instead.
 */
export function fertilityRate(batch: Pick<HatchBatch, 'eggsSet' | 'fertileEggs'>): number | null {
  if (batch.fertileEggs === null || batch.eggsSet <= 0) return null;
  return (batch.fertileEggs / batch.eggsSet) * 100;
}

/** Chicks as a share of every egg set — the number that says what the batch really returned. */
export function hatchOfSet(batch: Pick<HatchBatch, 'eggsSet' | 'chicksHatched'>): number | null {
  if (batch.chicksHatched === null || batch.eggsSet <= 0) return null;
  return (batch.chicksHatched / batch.eggsSet) * 100;
}

/** Chicks as a share of the fertile eggs — how well the incubator did with what it was given. */
export function hatchOfFertile(batch: Pick<HatchBatch, 'fertileEggs' | 'chicksHatched'>): number | null {
  if (batch.chicksHatched === null || !batch.fertileEggs || batch.fertileEggs <= 0) return null;
  return (batch.chicksHatched / batch.fertileEggs) * 100;
}

/** A plain-language read on a finished batch, so the numbers point somewhere useful. */
export function hatchVerdict(batch: HatchBatch): string | null {
  const fertility = fertilityRate(batch);
  const ofFertile = hatchOfFertile(batch);
  if (fertility === null && ofFertile === null) return null;

  if (fertility !== null && fertility < 70) {
    return 'Fertility was low. That usually points at the breeding birds — too few cockerels for the hens, or birds past their best — rather than the incubator.';
  }
  if (ofFertile !== null && ofFertile < 70) {
    return 'Most eggs were fertile but many did not hatch. That points at the incubator: temperature, humidity, turning, or opening it during the last three days.';
  }
  return 'A good batch — fertility and hatch both held up.';
}
