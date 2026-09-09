import { and, eq, gte, isNotNull, notExists, sql } from 'drizzle-orm';
import { db } from './client';
import { animals, healthLogs } from './schema';
import { startOfTodayIso } from '@/utils/livestockRules';

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
