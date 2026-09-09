import { relations, sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { generateId } from '@/lib/id';

export const SPECIES = ['cow', 'goat', 'sheep', 'pig', 'horse', 'donkey', 'dog'] as const;
export type Species = (typeof SPECIES)[number];

export const ANIMAL_STATUSES = ['active', 'sold', 'deceased', 'in_withdrawal'] as const;
export type AnimalStatus = (typeof ANIMAL_STATUSES)[number];

export const GENDERS = ['female', 'male'] as const;
export type Gender = (typeof GENDERS)[number];

export const BREEDING_EVENT_TYPES = [
  'heat_detected',
  'served_natural',
  'served_ai',
  'induced',
  'birth',
  'weaned',
] as const;
export type BreedingEventType = (typeof BREEDING_EVENT_TYPES)[number];

export const DELIVERY_TYPES = ['normal', 'assisted', 'caesarean'] as const;
export type DeliveryType = (typeof DELIVERY_TYPES)[number];

/**
 * Reminder kinds. The first four are *derived*: they are recomputed from the events the farmer
 * already logged, so nothing extra has to be entered. `routine` covers repeating husbandry
 * (deworming, vaccination, spraying) which no single event implies — those come from a schedule.
 */
export const REMINDER_TYPES = ['heat_return', 'birth_due', 'withdrawal_end', 'weaning_due', 'routine'] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

export const DERIVED_REMINDER_TYPES = ['heat_return', 'birth_due', 'withdrawal_end', 'weaning_due'] as const;

export const REMINDER_STATUSES = ['pending', 'done', 'dismissed'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const REMINDER_SOURCE_TABLES = ['breeding_events', 'health_logs', 'birth_records'] as const;
export type ReminderSourceTable = (typeof REMINDER_SOURCE_TABLES)[number];

export const ROUTINE_CATEGORIES = ['deworming', 'vaccination', 'spraying', 'hoof_trimming', 'other'] as const;
export type RoutineCategory = (typeof ROUTINE_CATEGORIES)[number];

/** Milking happens in fixed rounds, and yield is recorded per round rather than as a daily lump. */
export const MILK_SESSIONS = ['morning', 'midday', 'evening'] as const;
export type MilkSession = (typeof MILK_SESSIONS)[number];

/** Species that are milked in this app. Others simply never offer milk recording. */
export const MILKING_SPECIES = ['cow', 'goat'] as const;

export const EXPENSE_CATEGORIES = [
  'feed',
  'supplement',
  'medication',
  'veterinary',
  'labour',
  'equipment',
  'other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const animals = sqliteTable(
  'animals',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    tagNumber: text('tag_number').notNull(),
    name: text('name'),
    species: text('species', { enum: SPECIES }).notNull(),
    breed: text('breed'),
    gender: text('gender', { enum: GENDERS }).notNull(),
    birthDate: text('birth_date'),
    damId: text('dam_id'),
    sireId: text('sire_id'),
    status: text('status', { enum: ANIMAL_STATUSES }).notNull().default('active'),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index('animals_tag_number_idx').on(table.tagNumber),
    index('animals_species_idx').on(table.species),
    index('animals_status_idx').on(table.status),
    index('animals_dam_id_idx').on(table.damId),
    index('animals_sire_id_idx').on(table.sireId),
  ],
);

export const breedingEvents = sqliteTable(
  'breeding_events',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    animalId: text('animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'cascade' }),
    eventType: text('event_type', { enum: BREEDING_EVENT_TYPES }).notNull(),
    eventDate: text('event_date').notNull(),
    sireIdOrCode: text('sire_id_or_code'),
    technicianName: text('technician_name'),
    expectedDueDate: text('expected_due_date'),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index('breeding_events_animal_id_idx').on(table.animalId),
    index('breeding_events_event_date_idx').on(table.eventDate),
    index('breeding_events_expected_due_date_idx').on(table.expectedDueDate),
  ],
);

export const birthRecords = sqliteTable(
  'birth_records',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    motherId: text('mother_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'cascade' }),
    birthDate: text('birth_date').notNull(),
    totalOffspring: integer('total_offspring').notNull().default(0),
    liveBirths: integer('live_births').notNull().default(0),
    stillbirths: integer('stillbirths').notNull().default(0),
    birthWeightAvg: real('birth_weight_avg'),
    deliveryType: text('delivery_type', { enum: DELIVERY_TYPES }).notNull().default('normal'),
    weaningDueDate: text('weaning_due_date'),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index('birth_records_mother_id_idx').on(table.motherId),
    index('birth_records_birth_date_idx').on(table.birthDate),
  ],
);

export const healthLogs = sqliteTable(
  'health_logs',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    animalId: text('animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'cascade' }),
    treatmentDate: text('treatment_date').notNull(),
    conditionTreated: text('condition_treated').notNull(),
    medicationGiven: text('medication_given'),
    withdrawalDays: integer('withdrawal_days').notNull().default(0),
    withdrawalEndDate: text('withdrawal_end_date'),
    administeredBy: text('administered_by'),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index('health_logs_animal_id_idx').on(table.animalId),
    index('health_logs_treatment_date_idx').on(table.treatmentDate),
    index('health_logs_withdrawal_end_date_idx').on(table.withdrawalEndDate),
  ],
);

export const milkRecords = sqliteTable(
  'milk_records',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    animalId: text('animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'cascade' }),
    recordDate: text('record_date').notNull(),
    session: text('session', { enum: MILK_SESSIONS }).notNull(),
    litres: real('litres').notNull(),
    /**
     * The price in force when this milking was recorded, copied in rather than referenced.
     * Revenue already banked must not silently change months later because the farmer updated
     * the price they now sell at.
     */
    pricePerLitre: real('price_per_litre'),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index('milk_records_animal_id_idx').on(table.animalId),
    index('milk_records_record_date_idx').on(table.recordDate),
  ],
);

/** Money out. Revenue is derived from `milk_records` rather than duplicated here. */
export const expenses = sqliteTable(
  'expenses',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    category: text('category', { enum: EXPENSE_CATEGORIES }).notNull(),
    description: text('description').notNull(),
    amount: real('amount').notNull(),
    /** Optional "50 kg" style detail, so a farmer can see what a price actually bought. */
    quantity: real('quantity'),
    unit: text('unit'),
    expenseDate: text('expense_date').notNull(),
    /** Set when a cost belongs to one animal (a vet call-out), null for herd-wide costs (feed). */
    animalId: text('animal_id').references(() => animals.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index('expenses_expense_date_idx').on(table.expenseDate),
    index('expenses_category_idx').on(table.category),
    index('expenses_animal_id_idx').on(table.animalId),
  ],
);

/** A repeating husbandry task ("deworm the goats every 90 days"). Spawns one reminder at a time. */
export const reminderSchedules = sqliteTable(
  'reminder_schedules',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    title: text('title').notNull(),
    category: text('category', { enum: ROUTINE_CATEGORIES }).notNull(),
    intervalDays: integer('interval_days').notNull(),
    /** Limits the task to one species; null means the whole herd. */
    speciesFilter: text('species_filter', { enum: SPECIES }),
    nextDueDate: text('next_due_date').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [index('reminder_schedules_next_due_date_idx').on(table.nextDueDate)],
);

export const reminders = sqliteTable(
  'reminders',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    /** Null for herd-wide routine tasks, which are not about one animal. */
    animalId: text('animal_id').references(() => animals.id, { onDelete: 'cascade' }),
    scheduleId: text('schedule_id').references(() => reminderSchedules.id, { onDelete: 'cascade' }),
    type: text('type', { enum: REMINDER_TYPES }).notNull(),
    /** Denormalised so the daily digest can be built without re-joining every source table. */
    title: text('title').notNull(),
    dueDate: text('due_date').notNull(),
    /** How many days before `dueDate` this should start showing up as upcoming. */
    leadDays: integer('lead_days').notNull().default(0),
    status: text('status', { enum: REMINDER_STATUSES }).notNull().default('pending'),
    completedAt: text('completed_at'),
    /** Natural key of the logged event this was derived from; null for routine reminders. */
    sourceTable: text('source_table', { enum: REMINDER_SOURCE_TABLES }),
    sourceEventId: text('source_event_id'),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index('reminders_due_date_idx').on(table.dueDate),
    index('reminders_status_idx').on(table.status),
    index('reminders_animal_id_idx').on(table.animalId),
    index('reminders_schedule_id_idx').on(table.scheduleId),
    // One derived reminder per (source event, type). SQLite treats NULLs as distinct, so routine
    // reminders — which have no source event — are unaffected by this constraint.
    uniqueIndex('reminders_source_idx').on(table.sourceTable, table.sourceEventId, table.type),
  ],
);

/** Single-row table (id is always 'default') holding the farmer's reminder preferences. */
export const settings = sqliteTable('settings', {
  id: text('id').primaryKey().default('default'),
  digestEnabled: integer('digest_enabled', { mode: 'boolean' }).notNull().default(true),
  /** Local hour/minute the daily briefing is delivered — default is before the morning round. */
  digestHour: integer('digest_hour').notNull().default(6),
  digestMinute: integer('digest_minute').notNull().default(0),
  remindHeatReturn: integer('remind_heat_return', { mode: 'boolean' }).notNull().default(true),
  remindBirthDue: integer('remind_birth_due', { mode: 'boolean' }).notNull().default(true),
  remindWithdrawalEnd: integer('remind_withdrawal_end', { mode: 'boolean' }).notNull().default(true),
  remindWeaningDue: integer('remind_weaning_due', { mode: 'boolean' }).notNull().default(true),
  remindRoutine: integer('remind_routine', { mode: 'boolean' }).notNull().default(true),
  /** When the farmer last exported a backup — drives the "your records are not backed up" nudge. */
  lastBackupAt: text('last_backup_at'),
  /** Default price used to value a new milking; each record keeps its own copy once saved. */
  milkPricePerLitre: real('milk_price_per_litre').notNull().default(0),
  currency: text('currency').notNull().default('KES'),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const animalsRelations = relations(animals, ({ one, many }) => ({
  dam: one(animals, { fields: [animals.damId], references: [animals.id], relationName: 'dam' }),
  sire: one(animals, { fields: [animals.sireId], references: [animals.id], relationName: 'sire' }),
  breedingEvents: many(breedingEvents),
  birthRecords: many(birthRecords),
  healthLogs: many(healthLogs),
  milkRecords: many(milkRecords),
}));

export const milkRecordsRelations = relations(milkRecords, ({ one }) => ({
  animal: one(animals, { fields: [milkRecords.animalId], references: [animals.id] }),
}));

export const breedingEventsRelations = relations(breedingEvents, ({ one }) => ({
  animal: one(animals, { fields: [breedingEvents.animalId], references: [animals.id] }),
}));

export const birthRecordsRelations = relations(birthRecords, ({ one }) => ({
  mother: one(animals, { fields: [birthRecords.motherId], references: [animals.id] }),
}));

export const healthLogsRelations = relations(healthLogs, ({ one }) => ({
  animal: one(animals, { fields: [healthLogs.animalId], references: [animals.id] }),
}));

export const remindersRelations = relations(reminders, ({ one }) => ({
  animal: one(animals, { fields: [reminders.animalId], references: [animals.id] }),
  schedule: one(reminderSchedules, { fields: [reminders.scheduleId], references: [reminderSchedules.id] }),
}));

export const reminderSchedulesRelations = relations(reminderSchedules, ({ many }) => ({
  reminders: many(reminders),
}));

export type Animal = typeof animals.$inferSelect;
export type NewAnimal = typeof animals.$inferInsert;
export type BreedingEvent = typeof breedingEvents.$inferSelect;
export type NewBreedingEvent = typeof breedingEvents.$inferInsert;
export type BirthRecord = typeof birthRecords.$inferSelect;
export type NewBirthRecord = typeof birthRecords.$inferInsert;
export type HealthLog = typeof healthLogs.$inferSelect;
export type NewHealthLog = typeof healthLogs.$inferInsert;
export type MilkRecord = typeof milkRecords.$inferSelect;
export type NewMilkRecord = typeof milkRecords.$inferInsert;
export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
export type Reminder = typeof reminders.$inferSelect;
export type NewReminder = typeof reminders.$inferInsert;
export type ReminderSchedule = typeof reminderSchedules.$inferSelect;
export type NewReminderSchedule = typeof reminderSchedules.$inferInsert;
export type Settings = typeof settings.$inferSelect;
