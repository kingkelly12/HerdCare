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
export const REMINDER_TYPES = [
  'heat_return',
  'birth_due',
  'withdrawal_end',
  'weaning_due',
  'vaccination',
  'feed_change',
  'deworming',
  'hatching',
  'routine',
] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

/**
 * Types recomputed from records rather than created by hand. Poultry vaccinations, feed changes
 * and deworming join the list because they fall out of the flock's age exactly the way a due date
 * falls out of a service date.
 */
export const DERIVED_REMINDER_TYPES = [
  'heat_return',
  'birth_due',
  'withdrawal_end',
  'weaning_due',
  'vaccination',
  'feed_change',
  'deworming',
  'hatching',
] as const;

export const REMINDER_STATUSES = ['pending', 'done', 'dismissed'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const REMINDER_SOURCE_TABLES = [
  'breeding_events',
  'health_logs',
  'birth_records',
  'flocks',
  'hatch_batches',
] as const;

export type ReminderSourceTable = (typeof REMINDER_SOURCE_TABLES)[number];

/** Chicken eggs take 21 days. Ducks and turkeys run to 28, so the figure is per batch. */
export const DEFAULT_INCUBATION_DAYS = 21;

/**
 * What a regular customer takes on credit.
 *
 * Milk is the odd one out for revenue: it is already counted as earned when the milking is
 * recorded, so a milk delivery adds to what the customer *owes* without adding to income again.
 * Eggs, meat and live animals have no such record behind them, so those deliveries are the sale.
 */
export const DELIVERY_PRODUCTS = ['milk', 'eggs', 'meat', 'live_animal'] as const;
export type DeliveryProduct = (typeof DELIVERY_PRODUCTS)[number];

/** Deliveries of these count toward revenue; milk does not, because milking already did. */
export const REVENUE_BEARING_PRODUCTS = ['eggs', 'meat', 'live_animal'] as const;

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
  'breeding_ai',
  'labour',
  'transport',
  'water',
  'electricity',
  'housing',
  'equipment',
  'other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/**
 * Money in that the farmer records by hand.
 *
 * Milk is deliberately absent: its revenue is derived from `milk_records`, and offering it here
 * too would let a farmer record the daily milkings *and* the cooperative's monthly payment,
 * silently doubling their income. The Money screen shows the two sources separately for the
 * same reason.
 */
export const INCOME_CATEGORIES = ['animal_sale', 'eggs', 'manure', 'breeding_fee', 'other'] as const;
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

/**
 * Poultry is managed by the flock, not the bird — nobody tags hen number 347. Flocks therefore
 * live in their own tables rather than in `animals`, which is built around one identified animal
 * with parents, a breeding history and individual treatments.
 */
export const POULTRY_TYPES = ['layers', 'broilers', 'kienyeji', 'other'] as const;
export type PoultryType = (typeof POULTRY_TYPES)[number];

/** How the birds joined the farm, which is also what says how old they already were. */
export const FLOCK_SOURCES = ['day_old', 'point_of_lay', 'hatched', 'other'] as const;
export type FlockSource = (typeof FLOCK_SOURCES)[number];

export const FLOCK_STATUSES = ['active', 'closed'] as const;
export type FlockStatus = (typeof FLOCK_STATUSES)[number];

/** Broilers are raised for meat and never lay, so they are left out of egg recording entirely. */
export const LAYING_POULTRY_TYPES = ['layers', 'kienyeji', 'other'] as const;

/** Eggs are collected, priced and sold by the tray in Kenya, and a tray holds 30. */
export const EGGS_PER_TRAY = 30;

/**
 * Everything that happens to a flock, as one typed timeline.
 *
 * `mortality`, `cull` and `sale` reduce the bird count; `purchase` raises it. The rest are record
 * keeping. Keeping them in one table means the count is a single fold over the timeline rather
 * than a number that has to be kept in step by hand.
 */
export const FLOCK_EVENT_TYPES = [
  'mortality',
  'cull',
  'sale',
  'purchase',
  'vaccination',
  'feed_change',
  'deworming',
  'other',
] as const;
export type FlockEventType = (typeof FLOCK_EVENT_TYPES)[number];

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
    /** Set when it was taken on credit, which is what puts it on that supplier's balance. */
    supplierId: text('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index('expenses_expense_date_idx').on(table.expenseDate),
    index('expenses_category_idx').on(table.category),
    index('expenses_animal_id_idx').on(table.animalId),
    index('expenses_supplier_id_idx').on(table.supplierId),
  ],
);

export const flocks = sqliteTable(
  'flocks',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    name: text('name').notNull(),
    poultryType: text('poultry_type', { enum: POULTRY_TYPES }).notNull(),
    breed: text('breed'),
    /** When the birds arrived on the farm, or hatched here. */
    acquiredDate: text('acquired_date').notNull(),
    source: text('source', { enum: FLOCK_SOURCES }).notNull(),
    /**
     * How old the birds already were on arrival, in days.
     *
     * Load-bearing for anything scheduled: point-of-lay pullets turn up at about 18 weeks, so
     * their feed changes and vaccinations are due on a clock that started long before the farmer
     * ever saw them. Counting from the acquisition date alone would put every date months out.
     */
    ageAtAcquisitionDays: integer('age_at_acquisition_days').notNull().default(0),
    initialCount: integer('initial_count').notNull(),
    status: text('status', { enum: FLOCK_STATUSES }).notNull().default('active'),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [index('flocks_status_idx').on(table.status), index('flocks_acquired_date_idx').on(table.acquiredDate)],
);

export const flockEvents = sqliteTable(
  'flock_events',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    flockId: text('flock_id')
      .notNull()
      .references(() => flocks.id, { onDelete: 'cascade' }),
    type: text('type', { enum: FLOCK_EVENT_TYPES }).notNull(),
    eventDate: text('event_date').notNull(),
    /** Birds affected. Null for events that apply to the whole flock, like a vaccination. */
    quantity: integer('quantity'),
    /** The vaccine given, the feed switched to, who bought the birds. */
    description: text('description'),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index('flock_events_flock_id_idx').on(table.flockId),
    index('flock_events_event_date_idx').on(table.eventDate),
    index('flock_events_type_idx').on(table.type),
  ],
);

/**
 * One batch of eggs in the incubator.
 *
 * Kept separate from egg collection because these eggs leave the sale stream entirely, and what
 * matters about them is a 21-day process with its own milestones. Fertility and hatchability are
 * derived from the counts rather than stored, so they can never disagree with the numbers behind
 * them.
 */
export const hatchBatches = sqliteTable(
  'hatch_batches',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    /** Which flock the eggs came from, when the farmer is breeding from their own birds. */
    sourceFlockId: text('source_flock_id').references(() => flocks.id, { onDelete: 'set null' }),
    setDate: text('set_date').notNull(),
    eggsSet: integer('eggs_set').notNull(),
    incubationDays: integer('incubation_days').notNull().default(DEFAULT_INCUBATION_DAYS),
    /** Eggs still developing at candling. Null until the farmer has candled. */
    fertileEggs: integer('fertile_eggs'),
    candledDate: text('candled_date'),
    hatchedDate: text('hatched_date'),
    chicksHatched: integer('chicks_hatched'),
    /** The flock the chicks became, if they were registered as one. */
    resultingFlockId: text('resulting_flock_id').references(() => flocks.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index('hatch_batches_set_date_idx').on(table.setDate),
    index('hatch_batches_source_flock_id_idx').on(table.sourceFlockId),
  ],
);

/**
 * Daily egg collection for one flock.
 *
 * Production only — what came out of the house. Eggs are commonly held for days before a sale,
 * so what was *sold* is recorded as income when it happens rather than inferred from this. That
 * keeps the books honest about eggs eaten at home, given away, or still sitting in the store.
 */
export const eggRecords = sqliteTable(
  'egg_records',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    flockId: text('flock_id')
      .notNull()
      .references(() => flocks.id, { onDelete: 'cascade' }),
    /** Local midnight of the day collected, so one flock has one row per day. */
    recordDate: text('record_date').notNull(),
    /** Stored as whole eggs; the screens do the tray arithmetic. */
    eggsCollected: integer('eggs_collected').notNull(),
    eggsBroken: integer('eggs_broken').notNull().default(0),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index('egg_records_flock_id_idx').on(table.flockId),
    index('egg_records_record_date_idx').on(table.recordDate),
  ],
);

/**
 * A shop or agrovet the farmer buys from on credit.
 *
 * Deliberately has no purchases table of its own: something bought on credit is still an expense,
 * so it stays in `expenses` with a supplier attached. That keeps the cost on the books the day it
 * is incurred — recognising it only when paid would overstate profit for as long as the bill sits
 * unpaid, which is the dangerous direction to be wrong in.
 */
export const suppliers = sqliteTable(
  'suppliers',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    name: text('name').notNull(),
    phone: text('phone'),
    notes: text('notes'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [index('suppliers_name_idx').on(table.name)],
);

/** Money handed to a supplier against the account, rather than against one particular bill. */
export const supplierPayments = sqliteTable(
  'supplier_payments',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
    paymentDate: text('payment_date').notNull(),
    amount: real('amount').notNull(),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index('supplier_payments_supplier_id_idx').on(table.supplierId),
    index('supplier_payments_payment_date_idx').on(table.paymentDate),
  ],
);

/** A regular buyer — the neighbour who takes milk most days and settles at the end of the month. */
export const customers = sqliteTable(
  'customers',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    name: text('name').notNull(),
    phone: text('phone'),
    notes: text('notes'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [index('customers_name_idx').on(table.name)],
);

/**
 * Something handed over on credit. What it is worth is `quantity * unitPrice` — computed rather
 * than stored, so the two can never drift apart, with the price copied in at the time so raising
 * your price next month cannot change what somebody already owes you.
 */
export const deliveries = sqliteTable(
  'deliveries',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    product: text('product', { enum: DELIVERY_PRODUCTS }).notNull(),
    deliveryDate: text('delivery_date').notNull(),
    /** Litres, trays, kilos or head, depending on the product. */
    quantity: real('quantity').notNull(),
    unitPrice: real('unit_price').notNull(),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index('deliveries_customer_id_idx').on(table.customerId),
    index('deliveries_delivery_date_idx').on(table.deliveryDate),
  ],
);

/** Money a customer has handed over against what they owe. */
export const customerPayments = sqliteTable(
  'customer_payments',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    paymentDate: text('payment_date').notNull(),
    amount: real('amount').notNull(),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index('customer_payments_customer_id_idx').on(table.customerId),
    index('customer_payments_payment_date_idx').on(table.paymentDate),
  ],
);

/** Money in. Mirrors `expenses` so the two can share a form and be summed the same way. */
export const incomeEntries = sqliteTable(
  'income_entries',
  {
    id: text('id').primaryKey().$defaultFn(generateId),
    category: text('category', { enum: INCOME_CATEGORIES }).notNull(),
    description: text('description').notNull(),
    amount: real('amount').notNull(),
    quantity: real('quantity'),
    unit: text('unit'),
    incomeDate: text('income_date').notNull(),
    /** Set when the money came from one animal — a bull sold, a stud fee — else null. */
    animalId: text('animal_id').references(() => animals.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index('income_entries_income_date_idx').on(table.incomeDate),
    index('income_entries_category_idx').on(table.category),
    index('income_entries_animal_id_idx').on(table.animalId),
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
    /** Set for anything owed to a flock rather than an animal — vaccinations, feed changes. */
    flockId: text('flock_id').references(() => flocks.id, { onDelete: 'cascade' }),
    /** Set for the incubation milestones: candling, lockdown, hatch day. */
    hatchBatchId: text('hatch_batch_id').references(() => hatchBatches.id, { onDelete: 'cascade' }),
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
    index('reminders_flock_id_idx').on(table.flockId),
    index('reminders_hatch_batch_id_idx').on(table.hatchBatchId),
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
  /** Covers the whole poultry programme: vaccinations, feed changes and deworming. */
  remindPoultry: integer('remind_poultry', { mode: 'boolean' }).notNull().default(true),
  /** When the farmer last exported a backup — drives the "your records are not backed up" nudge. */
  lastBackupAt: text('last_backup_at'),
  /** Default price used to value a new milking; each record keeps its own copy once saved. */
  milkPricePerLitre: real('milk_price_per_litre').notNull().default(0),
  /** Standing prices for what customers take on credit. Copied onto each delivery when saved. */
  eggPricePerTray: real('egg_price_per_tray').notNull().default(0),
  meatPricePerKg: real('meat_price_per_kg').notNull().default(0),
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

export const flocksRelations = relations(flocks, ({ many }) => ({
  events: many(flockEvents),
  eggRecords: many(eggRecords),
}));

export const eggRecordsRelations = relations(eggRecords, ({ one }) => ({
  flock: one(flocks, { fields: [eggRecords.flockId], references: [flocks.id] }),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  expenses: many(expenses),
  payments: many(supplierPayments),
}));

export const supplierPaymentsRelations = relations(supplierPayments, ({ one }) => ({
  supplier: one(suppliers, { fields: [supplierPayments.supplierId], references: [suppliers.id] }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  deliveries: many(deliveries),
  payments: many(customerPayments),
}));

export const deliveriesRelations = relations(deliveries, ({ one }) => ({
  customer: one(customers, { fields: [deliveries.customerId], references: [customers.id] }),
}));

export const customerPaymentsRelations = relations(customerPayments, ({ one }) => ({
  customer: one(customers, { fields: [customerPayments.customerId], references: [customers.id] }),
}));

export const hatchBatchesRelations = relations(hatchBatches, ({ one }) => ({
  sourceFlock: one(flocks, { fields: [hatchBatches.sourceFlockId], references: [flocks.id] }),
}));

export const flockEventsRelations = relations(flockEvents, ({ one }) => ({
  flock: one(flocks, { fields: [flockEvents.flockId], references: [flocks.id] }),
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
export type IncomeEntry = typeof incomeEntries.$inferSelect;
export type NewIncomeEntry = typeof incomeEntries.$inferInsert;
export type Flock = typeof flocks.$inferSelect;
export type NewFlock = typeof flocks.$inferInsert;
export type FlockEvent = typeof flockEvents.$inferSelect;
export type NewFlockEvent = typeof flockEvents.$inferInsert;
export type EggRecord = typeof eggRecords.$inferSelect;
export type NewEggRecord = typeof eggRecords.$inferInsert;
export type HatchBatch = typeof hatchBatches.$inferSelect;
export type NewHatchBatch = typeof hatchBatches.$inferInsert;
export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;
export type SupplierPayment = typeof supplierPayments.$inferSelect;
export type NewSupplierPayment = typeof supplierPayments.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Delivery = typeof deliveries.$inferSelect;
export type NewDelivery = typeof deliveries.$inferInsert;
export type CustomerPayment = typeof customerPayments.$inferSelect;
export type NewCustomerPayment = typeof customerPayments.$inferInsert;
export type Reminder = typeof reminders.$inferSelect;
export type NewReminder = typeof reminders.$inferInsert;
export type ReminderSchedule = typeof reminderSchedules.$inferSelect;
export type NewReminderSchedule = typeof reminderSchedules.$inferInsert;
export type Settings = typeof settings.$inferSelect;
