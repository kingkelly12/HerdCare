import { and, eq } from 'drizzle-orm';
import { db } from './client';
import { milkRecords, type MilkRecord, type MilkSession } from './schema';
import { startOfDayIso } from '@/utils/livestockRules';

export interface MilkEntry {
  animalId: string;
  /** Empty or unparseable means "not milked / not recorded", and removes any existing row. */
  litres: string;
}

/**
 * Records one milking round for however many animals were milked.
 *
 * Saving is idempotent per (animal, day, session): re-recording the evening milking corrects the
 * existing figure instead of adding a second one, because a farmer who realises they typed 8
 * instead of 3 will simply enter it again rather than hunt for a delete button.
 */
export async function saveMilkSession(options: {
  recordDate: string;
  session: MilkSession;
  pricePerLitre: number;
  entries: MilkEntry[];
}): Promise<{ saved: number; cleared: number }> {
  const day = startOfDayIso(options.recordDate);
  const now = new Date().toISOString();
  let saved = 0;
  let cleared = 0;

  for (const entry of options.entries) {
    const litres = Number.parseFloat(entry.litres);
    const valid = Number.isFinite(litres) && litres > 0;

    const [existing] = await db
      .select()
      .from(milkRecords)
      .where(
        and(
          eq(milkRecords.animalId, entry.animalId),
          eq(milkRecords.recordDate, day),
          eq(milkRecords.session, options.session),
        ),
      );

    if (!valid) {
      // Blanking a figure that was previously recorded is how a farmer says "she wasn't milked".
      if (existing) {
        await db.delete(milkRecords).where(eq(milkRecords.id, existing.id));
        cleared++;
      }
      continue;
    }

    if (existing) {
      await db
        .update(milkRecords)
        .set({ litres, pricePerLitre: options.pricePerLitre, updatedAt: now })
        .where(eq(milkRecords.id, existing.id));
    } else {
      await db.insert(milkRecords).values({
        animalId: entry.animalId,
        recordDate: day,
        session: options.session,
        litres,
        pricePerLitre: options.pricePerLitre,
      });
    }
    saved++;
  }

  return { saved, cleared };
}

/** What a milking was worth, using the price captured at the time it was recorded. */
export function revenueOf(record: Pick<MilkRecord, 'litres' | 'pricePerLitre'>): number {
  return record.litres * (record.pricePerLitre ?? 0);
}

export function totalLitres(records: Pick<MilkRecord, 'litres'>[]): number {
  return records.reduce((sum, record) => sum + record.litres, 0);
}

export function totalRevenue(records: Pick<MilkRecord, 'litres' | 'pricePerLitre'>[]): number {
  return records.reduce((sum, record) => sum + revenueOf(record), 0);
}

/** Reads back an existing round so the entry screen opens pre-filled rather than blank. */
export async function loadMilkSession(recordDate: string, session: MilkSession): Promise<MilkRecord[]> {
  return db
    .select()
    .from(milkRecords)
    .where(and(eq(milkRecords.recordDate, startOfDayIso(recordDate)), eq(milkRecords.session, session)));
}
