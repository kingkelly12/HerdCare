import { relations, sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
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
  'palpation_confirmed',
  'birth',
  'weaned',
] as const;
export type BreedingEventType = (typeof BREEDING_EVENT_TYPES)[number];

export const DELIVERY_TYPES = ['normal', 'assisted', 'caesarean'] as const;
export type DeliveryType = (typeof DELIVERY_TYPES)[number];

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

export const animalsRelations = relations(animals, ({ one, many }) => ({
  dam: one(animals, { fields: [animals.damId], references: [animals.id], relationName: 'dam' }),
  sire: one(animals, { fields: [animals.sireId], references: [animals.id], relationName: 'sire' }),
  breedingEvents: many(breedingEvents),
  birthRecords: many(birthRecords),
  healthLogs: many(healthLogs),
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

export type Animal = typeof animals.$inferSelect;
export type NewAnimal = typeof animals.$inferInsert;
export type BreedingEvent = typeof breedingEvents.$inferSelect;
export type NewBreedingEvent = typeof breedingEvents.$inferInsert;
export type BirthRecord = typeof birthRecords.$inferSelect;
export type NewBirthRecord = typeof birthRecords.$inferInsert;
export type HealthLog = typeof healthLogs.$inferSelect;
export type NewHealthLog = typeof healthLogs.$inferInsert;
