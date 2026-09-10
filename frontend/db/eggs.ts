import { and, eq } from 'drizzle-orm';
import { db } from './client';
import { EGGS_PER_TRAY, eggRecords, type EggRecord } from './schema';
import { startOfDayIso } from '@/utils/livestockRules';

/** "8 trays", "8 trays + 12", or "12 eggs" — how a farmer would actually say the number. */
export function formatEggs(eggs: number): string {
  const trays = Math.floor(eggs / EGGS_PER_TRAY);
  const loose = eggs % EGGS_PER_TRAY;
  if (trays === 0) return `${loose} ${loose === 1 ? 'egg' : 'eggs'}`;
  const traysLabel = `${trays} ${trays === 1 ? 'tray' : 'trays'}`;
  return loose === 0 ? traysLabel : `${traysLabel} + ${loose}`;
}

export function toEggs(trays: string, loose: string): number {
  const trayCount = Number.parseInt(trays, 10);
  const looseCount = Number.parseInt(loose, 10);
  return (Number.isFinite(trayCount) ? trayCount : 0) * EGGS_PER_TRAY + (Number.isFinite(looseCount) ? looseCount : 0);
}

/**
 * Eggs laid per hundred birds — the number that says whether a laying flock is doing its job.
 * A flock in good lay sits around 80%; a sharp drop is usually feed, water, disease or heat
 * before it is anything else.
 */
export function layingPercentage(eggsCollected: number, birds: number): number {
  if (birds <= 0) return 0;
  return (eggsCollected / birds) * 100;
}

export function totalCollected(records: Pick<EggRecord, 'eggsCollected'>[]): number {
  return records.reduce((sum, record) => sum + record.eggsCollected, 0);
}

export function totalBroken(records: Pick<EggRecord, 'eggsBroken'>[]): number {
  return records.reduce((sum, record) => sum + record.eggsBroken, 0);
}

/**
 * Records a day's collection for one flock, replacing that day's figure rather than adding to it.
 * A farmer who collects again in the afternoon re-enters the day's total, and correcting a typo
 * should not leave two rows fighting over the same day.
 */
export async function saveEggRecord(options: {
  flockId: string;
  recordDate: string;
  eggsCollected: number;
  eggsBroken: number;
}): Promise<void> {
  const day = startOfDayIso(options.recordDate);
  const [existing] = await db
    .select()
    .from(eggRecords)
    .where(and(eq(eggRecords.flockId, options.flockId), eq(eggRecords.recordDate, day)));

  if (options.eggsCollected <= 0 && options.eggsBroken <= 0) {
    if (existing) await db.delete(eggRecords).where(eq(eggRecords.id, existing.id));
    return;
  }

  if (existing) {
    await db
      .update(eggRecords)
      .set({
        eggsCollected: options.eggsCollected,
        eggsBroken: options.eggsBroken,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(eggRecords.id, existing.id));
    return;
  }

  await db.insert(eggRecords).values({
    flockId: options.flockId,
    recordDate: day,
    eggsCollected: options.eggsCollected,
    eggsBroken: options.eggsBroken,
  });
}

export async function loadEggRecord(flockId: string, recordDate: string): Promise<EggRecord | undefined> {
  const [existing] = await db
    .select()
    .from(eggRecords)
    .where(and(eq(eggRecords.flockId, flockId), eq(eggRecords.recordDate, startOfDayIso(recordDate))));
  return existing;
}
