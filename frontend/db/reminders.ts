import { and, eq, inArray, isNotNull, lt, ne } from 'drizzle-orm';
import { db } from './client';
import {
  animals,
  birthRecords,
  breedingEvents,
  DERIVED_REMINDER_TYPES,
  flockEvents,
  flocks,
  hatchBatches,
  healthLogs,
  reminderSchedules,
  reminders,
  settings,
} from './schema';
import { addDaysIso, startOfTodayIso } from '@/utils/livestockRules';
import { REMINDER_TYPE_META } from '@/utils/reminderRules';
import { computeDerivedReminders } from '@/utils/reminderProjection';
import { computeHatchReminders, computePoultryReminders } from '@/utils/poultryProjection';

/**
 * Anything older than this is not worth surfacing — a farmer entering a season of back-history
 * should not be greeted by hundreds of overdue reminders for events that are long settled.
 */
const MAX_OVERDUE_DAYS = 30;

/**
 * Recomputes every derived reminder from the events the farmer has logged.
 *
 * Deliberately a full rebuild rather than incremental bookkeeping: reminders are a *projection*
 * of the event log, and a projection that can drift from its source is worse than no projection —
 * it nags about a calving that already happened, and the farmer stops trusting the app. The data
 * is small (a farm has hundreds of events, not millions), so correctness beats cleverness here.
 *
 * Reminders the farmer has already actioned keep their status; only pending ones are superseded.
 */
export async function rebuildDerivedReminders(): Promise<void> {
  const floor = addDaysIso(startOfTodayIso(), -MAX_OVERDUE_DAYS);

  const [animalRows, breedingRows, birthRows, healthRows, flockRows, hatchRows] = await Promise.all([
    db.select().from(animals),
    db.select().from(breedingEvents),
    db.select().from(birthRecords),
    db.select().from(healthLogs).where(isNotNull(healthLogs.withdrawalEndDate)),
    db.select().from(flocks),
    db.select().from(hatchBatches),
  ]);

  const fresh = computeDerivedReminders({
    animals: animalRows,
    breedingEvents: breedingRows,
    birthRecords: birthRows,
    healthLogs: healthRows,
    floorDate: floor,
  });

  // Poultry rides the same projection: the flock's age implies its vaccinations, feed changes and
  // deworming exactly as a service date implies a due date. `sourceTable: 'flocks'` with a
  // `flockId:itemKey` source id gives each scheduled item its own row per flock under the
  // existing natural key, so the upsert and the stale sweep below need no special cases.
  const poultry = computePoultryReminders({ flocks: flockRows, floorDate: floor, today: startOfTodayIso() }).map(
    (reminder) => ({
      sourceTable: 'flocks' as const,
      sourceEventId: reminder.sourceEventId,
      type: reminder.type,
      animalId: null,
      flockId: reminder.flockId,
      title: reminder.title,
      dueDate: reminder.dueDate,
      leadDays: reminder.leadDays,
      notes: reminder.notes,
    }),
  );

  const hatching = computeHatchReminders({ batches: hatchRows, floorDate: floor }).map((reminder) => ({
    sourceTable: 'hatch_batches' as const,
    sourceEventId: reminder.sourceEventId,
    type: 'hatching' as const,
    animalId: null,
    flockId: null,
    hatchBatchId: reminder.hatchBatchId,
    title: reminder.title,
    dueDate: reminder.dueDate,
    leadDays: reminder.leadDays,
    notes: reminder.notes,
  }));

  const implied = [...fresh, ...poultry, ...hatching].map((reminder) => ({
    ...reminder,
    animalId: 'animalId' in reminder ? reminder.animalId : null,
    flockId: 'flockId' in reminder ? reminder.flockId : null,
    hatchBatchId: 'hatchBatchId' in reminder ? reminder.hatchBatchId : null,
  }));

  // Every derived reminder on file, whatever its status. A reminder the farmer already ticked off
  // still owns its (source, event, type) key, so it must be updated in place, never re-inserted.
  const onFile = await db
    .select({
      id: reminders.id,
      sourceTable: reminders.sourceTable,
      sourceEventId: reminders.sourceEventId,
      type: reminders.type,
      status: reminders.status,
      animalId: reminders.animalId,
      flockId: reminders.flockId,
      hatchBatchId: reminders.hatchBatchId,
      title: reminders.title,
      dueDate: reminders.dueDate,
      leadDays: reminders.leadDays,
    })
    .from(reminders)
    .where(isNotNull(reminders.sourceEventId));

  const keyOf = (row: { sourceTable: string | null; sourceEventId: string | null; type: string }) =>
    `${row.sourceTable}|${row.sourceEventId}|${row.type}`;
  const byKey = new Map(onFile.map((row) => [keyOf(row), row]));

  // Only rows that are new or have actually changed get written. Most launches change nothing at
  // all, and writing anyway was not free: every write re-ran each live query on screen, so a farm
  // with a few hundred reminders re-queried and re-drew the dashboard a few hundred times at launch.
  const inserts: typeof implied = [];
  const updates: { id: string; reminder: (typeof implied)[number] }[] = [];

  // Last one wins if the projection ever implies the same key twice, which is what the old
  // upsert-per-row did; inserting both would break the unique index and abort the whole rebuild.
  const latestByKey = new Map(implied.map((reminder) => [keyOf(reminder), reminder]));

  for (const reminder of latestByKey.values()) {
    const existing = byKey.get(keyOf(reminder));
    if (!existing) {
      inserts.push(reminder);
      continue;
    }
    const changed =
      existing.animalId !== reminder.animalId ||
      existing.flockId !== reminder.flockId ||
      existing.hatchBatchId !== reminder.hatchBatchId ||
      existing.title !== reminder.title ||
      existing.dueDate !== reminder.dueDate ||
      existing.leadDays !== reminder.leadDays;
    if (changed) updates.push({ id: existing.id, reminder });
  }

  // Drop pending derived reminders whose source no longer implies them.
  const keep = new Set(implied.map(keyOf));
  const derivedTypes = new Set<string>(DERIVED_REMINDER_TYPES);
  const stale = onFile
    .filter((row) => row.status === 'pending' && derivedTypes.has(row.type) && !keep.has(keyOf(row)))
    .map((row) => row.id);

  if (inserts.length === 0 && updates.length === 0 && stale.length === 0) return;

  const now = new Date().toISOString();

  // One transaction: one disk flush instead of one per row, and the rest of the app never sees
  // the reminders half-rebuilt.
  db.transaction((tx) => {
    for (const reminder of inserts) {
      // Status is only ever set on the way in. A reminder the farmer already ticked off must not
      // spring back to pending just because the projection was recomputed.
      tx.insert(reminders).values({ ...reminder, status: 'pending' }).run();
    }
    for (const { id, reminder } of updates) {
      tx.update(reminders)
        .set({
          animalId: reminder.animalId,
          flockId: reminder.flockId,
          hatchBatchId: reminder.hatchBatchId,
          title: reminder.title,
          dueDate: reminder.dueDate,
          leadDays: reminder.leadDays,
          updatedAt: now,
        })
        .where(eq(reminders.id, id))
        .run();
    }
    if (stale.length > 0) {
      tx.delete(reminders).where(inArray(reminders.id, stale)).run();
    }
  });
}

/** Makes sure every active routine schedule has exactly one pending reminder outstanding. */
export async function syncRoutineReminders(): Promise<void> {
  const schedules = await db.select().from(reminderSchedules).where(eq(reminderSchedules.active, true));
  const open = await db
    .select({ scheduleId: reminders.scheduleId })
    .from(reminders)
    .where(and(eq(reminders.type, 'routine'), eq(reminders.status, 'pending')));
  const openScheduleIds = new Set(open.map((row) => row.scheduleId));

  for (const schedule of schedules) {
    if (openScheduleIds.has(schedule.id)) continue;
    await db.insert(reminders).values({
      scheduleId: schedule.id,
      type: 'routine',
      title: schedule.title,
      dueDate: schedule.nextDueDate,
      leadDays: REMINDER_TYPE_META.routine.defaultLeadDays,
      status: 'pending',
    });
  }
}

/** Marks a reminder done. Routine reminders roll their schedule forward to the next occurrence. */
export async function completeReminder(reminderId: string): Promise<void> {
  const now = new Date().toISOString();
  const [reminder] = await db.select().from(reminders).where(eq(reminders.id, reminderId));
  if (!reminder) return;

  await db.update(reminders).set({ status: 'done', completedAt: now, updatedAt: now }).where(eq(reminders.id, reminderId));

  // Ticking off a poultry reminder writes it onto the flock's own timeline, so the record of what
  // was actually given lives with the flock rather than only as a reminder that stopped showing.
  if (reminder.flockId && (reminder.type === 'vaccination' || reminder.type === 'feed_change' || reminder.type === 'deworming')) {
    await db.insert(flockEvents).values({
      flockId: reminder.flockId,
      type: reminder.type === 'feed_change' ? 'feed_change' : reminder.type === 'deworming' ? 'deworming' : 'vaccination',
      eventDate: startOfTodayIso(),
      description: reminder.title,
    });
  }

  if (reminder.type === 'routine' && reminder.scheduleId) {
    const [schedule] = await db.select().from(reminderSchedules).where(eq(reminderSchedules.id, reminder.scheduleId));
    if (schedule?.active) {
      // Count from today rather than the original due date, so a task done two weeks late does
      // not immediately come due again.
      const nextDueDate = addDaysIso(startOfTodayIso(), schedule.intervalDays);
      await db
        .update(reminderSchedules)
        .set({ nextDueDate, updatedAt: now })
        .where(eq(reminderSchedules.id, schedule.id));
      await db.insert(reminders).values({
        scheduleId: schedule.id,
        type: 'routine',
        title: schedule.title,
        dueDate: nextDueDate,
        leadDays: REMINDER_TYPE_META.routine.defaultLeadDays,
        status: 'pending',
      });
    }
  }
}

export async function dismissReminder(reminderId: string): Promise<void> {
  const now = new Date().toISOString();
  await db.update(reminders).set({ status: 'dismissed', updatedAt: now }).where(eq(reminders.id, reminderId));
}

/** Clears out actioned reminders that are well past, so the table does not grow without bound. */
export async function pruneOldReminders(): Promise<void> {
  await db
    .delete(reminders)
    .where(and(ne(reminders.status, 'pending'), lt(reminders.dueDate, addDaysIso(startOfTodayIso(), -180))));
}

const DEFAULT_SETTINGS_ID = 'default';

/** Reads the single settings row, creating it with defaults on first run. */
export async function getSettings() {
  const [existing] = await db.select().from(settings).where(eq(settings.id, DEFAULT_SETTINGS_ID));
  if (existing) return existing;
  const [created] = await db.insert(settings).values({ id: DEFAULT_SETTINGS_ID }).returning();
  return created;
}

export async function updateSettings(patch: Partial<typeof settings.$inferInsert>) {
  await getSettings();
  await db
    .update(settings)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(settings.id, DEFAULT_SETTINGS_ID));
}
