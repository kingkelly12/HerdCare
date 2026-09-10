import { and, eq, gte, isNotNull, notExists, sql } from 'drizzle-orm';
import { db } from './client';
import {
  animals,
  birthRecords,
  breedingEvents,
  eggRecords,
  expenses,
  flockEvents,
  flocks,
  hatchBatches,
  healthLogs,
  incomeEntries,
  milkRecords,
  reminders,
  supplierPayments,
  suppliers,
  type Animal,
} from './schema';
import { startOfTodayIso } from '@/utils/livestockRules';

/**
 * Finds another animal already using this tag number, ignoring case and surrounding spaces.
 *
 * The tag is how a farmer identifies an animal in the yard, so two animals answering to "042"
 * makes every list, picker and record ambiguous. This is checked in the app rather than with a
 * unique index because adding that constraint by migration would fail outright on a phone that
 * already holds duplicates — locking the farmer out of their own records.
 */
export async function findTagClash(tagNumber: string, excludeId?: string): Promise<Animal | null> {
  const target = tagNumber.trim().toLowerCase();
  if (!target) return null;
  const rows = await db.select().from(animals);
  return rows.find((row) => row.id !== excludeId && row.tagNumber.trim().toLowerCase() === target) ?? null;
}

/**
 * Removes an animal and everything hanging off it.
 *
 * Done by hand because SQLite enforces foreign keys only when `PRAGMA foreign_keys = ON`, which
 * this database does not set — so the schema's `onDelete` clauses are decorative and the rows
 * would otherwise survive as unreachable orphans. Children keep their own records and simply
 * lose the parent link, which is why they are nulled rather than deleted.
 */
export async function deleteAnimalCascade(animalId: string): Promise<void> {
  await db.delete(reminders).where(eq(reminders.animalId, animalId));
  await db.delete(breedingEvents).where(eq(breedingEvents.animalId, animalId));
  await db.delete(healthLogs).where(eq(healthLogs.animalId, animalId));
  await db.delete(birthRecords).where(eq(birthRecords.motherId, animalId));
  await db.delete(milkRecords).where(eq(milkRecords.animalId, animalId));

  // Money is kept: it was still spent and still earned, it just stops being attributed to one
  // animal. Deleting a record of a sale because the animal left would quietly corrupt the books.
  await db.update(expenses).set({ animalId: null }).where(eq(expenses.animalId, animalId));
  await db.update(incomeEntries).set({ animalId: null }).where(eq(incomeEntries.animalId, animalId));

  const now = new Date().toISOString();
  await db.update(animals).set({ damId: null, updatedAt: now }).where(eq(animals.damId, animalId));
  await db.update(animals).set({ sireId: null, updatedAt: now }).where(eq(animals.sireId, animalId));

  await db.delete(animals).where(eq(animals.id, animalId));
}

/** Removes a supplier, keeping the purchases — the money was still spent. */
export async function deleteSupplierCascade(supplierId: string): Promise<void> {
  await db.delete(supplierPayments).where(eq(supplierPayments.supplierId, supplierId));
  await db.update(expenses).set({ supplierId: null }).where(eq(expenses.supplierId, supplierId));
  await db.delete(suppliers).where(eq(suppliers.id, supplierId));
}

/** Removes a flock, its timeline and its egg records. Same manual cascade, same reason. */
export async function deleteFlockCascade(flockId: string): Promise<void> {
  await db.delete(flockEvents).where(eq(flockEvents.flockId, flockId));
  await db.delete(eggRecords).where(eq(eggRecords.flockId, flockId));

  // Incubation records outlive the flock: the hatch still happened, it just loses the link to
  // the birds the eggs came from or became.
  await db.update(hatchBatches).set({ sourceFlockId: null }).where(eq(hatchBatches.sourceFlockId, flockId));
  await db.update(hatchBatches).set({ resultingFlockId: null }).where(eq(hatchBatches.resultingFlockId, flockId));

  await db.delete(flocks).where(eq(flocks.id, flockId));
}

/**
 * Returns animals whose withdrawal period has elapsed to `active`.
 *
 * Logging a treatment with a withdrawal period flags the animal `in_withdrawal`, but nothing
 * about the passage of time can write to the database on its own — so without this, the flag
 * would stick forever and the herd would look permanently unsafe to sell from. Cheap enough
 * (one UPDATE) to run at launch and whenever the dashboard regains focus, which also covers
 * the day rolling over while the app stays open in the field.
 */
export async function reconcileWithdrawalStatuses(): Promise<void> {
  const cutoff = startOfTodayIso();
  await db
    .update(animals)
    .set({ status: 'active', updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(animals.status, 'in_withdrawal'),
        notExists(
          db
            .select({ one: sql`1` })
            .from(healthLogs)
            .where(
              and(
                eq(healthLogs.animalId, animals.id),
                isNotNull(healthLogs.withdrawalEndDate),
                gte(healthLogs.withdrawalEndDate, cutoff),
              ),
            ),
        ),
      ),
    );
}
