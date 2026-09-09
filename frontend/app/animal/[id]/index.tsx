import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { and, desc, eq, gte, or } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Surface } from '@/components/ui/Surface';
import { Segmented, FilterChips } from '@/components/ui/Segmented';
import { Fab } from '@/components/ui/Fab';
import { EmptyState } from '@/components/ui/EmptyState';
import { db } from '@/db/client';
import { totalLitres, totalRevenue } from '@/db/milk';
import {
  ANIMAL_STATUSES,
  MILKING_SPECIES,
  animals,
  birthRecords,
  breedingEvents,
  healthLogs,
  milkRecords,
  settings,
  type Animal,
  type AnimalStatus,
} from '@/db/schema';
import { SpeciesAvatar } from '@/components/animals/SpeciesIcon';
import { StatusBadge } from '@/components/animals/StatusBadge';
import { showUndoToast } from '@/components/ui/UndoToast';
import { useColors } from '@/theme/colors';
import { addDaysIso, daysFromToday, formatDateForDisplay, startOfTodayIso } from '@/utils/livestockRules';
import { formatLitres, formatMoney } from '@/utils/money';

const ALL_SECTIONS = [
  { value: 'overview', label: 'Overview' },
  { value: 'milk', label: 'Milk' },
  { value: 'family', label: 'Family' },
  { value: 'breeding', label: 'Breeding' },
  { value: 'health', label: 'Health' },
  { value: 'births', label: 'Births' },
] as const;
type Section = (typeof ALL_SECTIONS)[number]['value'];

/** How far back the per-animal milk figures look. */
const MILK_WINDOW_DAYS = 30;

const STATUS_OPTIONS = ANIMAL_STATUSES.map((status) => ({ value: status, label: status.replace('_', ' ') }));

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 gap-0.5">
      <Text className="text-caption uppercase text-tertiary">{label}</Text>
      <Text className="text-callout font-sans-medium capitalize text-primary">{value}</Text>
    </View>
  );
}

function FamilyMemberRow({ label, member, onPress }: { label?: string; member: Animal; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-touch flex-row items-center gap-3 rounded-field px-1 py-2 active:bg-sunken"
    >
      <SpeciesAvatar species={member.species} size={20} />
      <View className="flex-1">
        {label ? <Text className="text-caption uppercase text-tertiary">{label}</Text> : null}
        <Text className="text-body font-sans-medium text-primary">
          {member.tagNumber}
          {member.name ? ` · ${member.name}` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.tertiary} />
    </Pressable>
  );
}

function TimelineEntry({ children, index = 0 }: { children: React.ReactNode; index?: number }) {
  return (
    <Animated.View entering={FadeInDown.duration(240).delay(Math.min(index, 8) * 35)}>
      <Surface level="raised" className="gap-1 p-4">
        {children}
      </Surface>
    </Animated.View>
  );
}

export default function AnimalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [section, setSection] = useState<Section>('overview');
  const colors = useColors();

  const { data: animalRows } = useLiveQuery(db.select().from(animals).where(eq(animals.id, id)));
  const animal = animalRows?.[0];

  const { data: breeding } = useLiveQuery(
    db.select().from(breedingEvents).where(eq(breedingEvents.animalId, id)).orderBy(desc(breedingEvents.eventDate)),
  );
  const { data: health } = useLiveQuery(
    db.select().from(healthLogs).where(eq(healthLogs.animalId, id)).orderBy(desc(healthLogs.treatmentDate)),
  );
  const { data: births } = useLiveQuery(
    db.select().from(birthRecords).where(eq(birthRecords.motherId, id)).orderBy(desc(birthRecords.birthDate)),
  );

  // Parents are looked up by id and may be empty (unset, or recorded before the parent's own
  // entry existed); children are any animal that names this one as mother or father.
  //
  // The dependency arrays are load-bearing. useLiveQuery subscribes inside a useEffect keyed on
  // them, so with the default `[]` it would capture the query built on the very first render —
  // when `animal` is still undefined and this reads `WHERE id = ''`. It would then keep re-running
  // that empty query forever and the parents would never appear.
  const { data: damRows } = useLiveQuery(
    db.select().from(animals).where(eq(animals.id, animal?.damId ?? '')),
    [animal?.damId],
  );
  const { data: sireRows } = useLiveQuery(
    db.select().from(animals).where(eq(animals.id, animal?.sireId ?? '')),
    [animal?.sireId],
  );
  const { data: children } = useLiveQuery(
    db
      .select()
      .from(animals)
      .where(or(eq(animals.damId, id), eq(animals.sireId, id)))
      .orderBy(desc(animals.birthDate)),
  );
  const dam = damRows?.[0];
  const sire = sireRows?.[0];

  const milkSince = addDaysIso(startOfTodayIso(), -(MILK_WINDOW_DAYS - 1));
  const { data: milk } = useLiveQuery(
    db
      .select()
      .from(milkRecords)
      .where(and(eq(milkRecords.animalId, id), gte(milkRecords.recordDate, milkSince)))
      .orderBy(desc(milkRecords.recordDate)),
    [id, milkSince],
  );

  const { data: settingsRows } = useLiveQuery(db.select().from(settings).where(eq(settings.id, 'default')));
  const currency = settingsRows?.[0]?.currency ?? 'KES';

  const milkRows = milk ?? [];
  const milkLitres = totalLitres(milkRows);
  const milkRevenue = totalRevenue(milkRows);
  // Averaged over the days actually milked, not the whole window — a cow recorded for three days
  // should read as her real daily yield, not a thirtieth of it.
  const milkedDays = new Set(milkRows.map((row) => row.recordDate)).size;
  const litresPerDay = milkedDays > 0 ? milkLitres / milkedDays : 0;
  const revenuePerDay = milkedDays > 0 ? milkRevenue / milkedDays : 0;

  if (!animal) {
    return (
      <ScreenContainer>
        <EmptyState icon="paw-outline" title="Animal not found" />
      </ScreenContainer>
    );
  }

  // A bull or a sheep is never milked, so the tab would only ever be an empty promise.
  const canBeMilked =
    (MILKING_SPECIES as readonly string[]).includes(animal.species) && animal.gender === 'female';
  const sections = ALL_SECTIONS.filter((entry) => entry.value !== 'milk' || canBeMilked);

  async function updateStatus(status: AnimalStatus) {
    if (status === animal.status) return;
    const previousStatus = animal.status;
    await db.update(animals).set({ status, updatedAt: new Date().toISOString() }).where(eq(animals.id, id));
    showUndoToast({
      message: `Marked ${animal.tagNumber} as ${status.replace('_', ' ')}`,
      onUndo: async () => {
        await db.update(animals).set({ status: previousStatus, updatedAt: new Date().toISOString() }).where(eq(animals.id, id));
      },
    });
  }

  return (
    <ScreenContainer fab={<Fab icon="clipboard-outline" label="Log event" onPress={() => router.push(`/log?animalId=${id}`)} />}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit animal"
              onPress={() => router.push(`/animal/${id}/edit`)}
              hitSlop={8}
              className="h-10 w-10 items-center justify-center"
            >
              <Ionicons name="pencil-outline" size={22} color={colors.brand} />
            </Pressable>
          ),
        }}
      />
      {/* Identity block sits straight on the canvas — the animal is the subject, not a card. */}
      <Animated.View entering={FadeInDown.duration(280)} className="items-center gap-2 pt-2">
        <SpeciesAvatar species={animal.species} size={40} tone={animal.status === 'in_withdrawal' ? 'warn' : 'default'} />
        <Text className="text-title font-sans-bold text-primary">{animal.tagNumber}</Text>
        {animal.name ? <Text className="text-body text-secondary">{animal.name}</Text> : null}
        <StatusBadge status={animal.status} />
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(280).delay(60)}>
        <Surface level="raised" className="flex-row gap-3 p-4">
          <DetailRow label="Species" value={animal.species} />
          <DetailRow label="Sex" value={animal.gender} />
          <DetailRow label="Breed" value={animal.breed ?? '—'} />
          <DetailRow label="Born" value={formatDateForDisplay(animal.birthDate)} />
        </Surface>
      </Animated.View>

      <View className="gap-2">
        <Text className="text-label font-sans-semibold uppercase text-tertiary">Status</Text>
        <View className="-mx-4 px-4">
          <FilterChips options={STATUS_OPTIONS} value={animal.status} onChange={updateStatus} />
        </View>
      </View>

      <Segmented options={sections} value={section} onChange={setSection} />

      <Animated.View key={section} entering={FadeIn.duration(180)} className="gap-2">
        {section === 'overview' ? (
          <Surface level="raised" className="gap-3 p-4">
            <Text className="text-headline font-sans-semibold text-primary">Record summary</Text>
            <View className="flex-row">
              <View className="flex-1 gap-0.5">
                <Text className="text-metric font-sans-bold text-primary">{breeding?.length ?? 0}</Text>
                <Text className="text-label text-tertiary">Breeding</Text>
              </View>
              <View className="flex-1 gap-0.5">
                <Text className="text-metric font-sans-bold text-primary">{health?.length ?? 0}</Text>
                <Text className="text-label text-tertiary">Treatments</Text>
              </View>
              <View className="flex-1 gap-0.5">
                <Text className="text-metric font-sans-bold text-primary">{births?.length ?? 0}</Text>
                <Text className="text-label text-tertiary">Births</Text>
              </View>
            </View>
          </Surface>
        ) : null}

        {section === 'milk' ? (
          milkRows.length === 0 ? (
            <EmptyState
              icon="water-outline"
              title="No milk recorded"
              description={`Record a milking and the last ${MILK_WINDOW_DAYS} days will be summarised here.`}
            />
          ) : (
            <>
              <Surface level="raised" className="gap-3 p-4">
                <Text className="text-headline font-sans-semibold text-primary">Last {MILK_WINDOW_DAYS} days</Text>
                <View className="flex-row">
                  <View className="flex-1 gap-0.5">
                    <Text className="text-metric font-sans-bold text-primary">
                      {Math.round(litresPerDay * 10) / 10}
                    </Text>
                    <Text className="text-label text-tertiary">Litres a day</Text>
                  </View>
                  <View className="flex-1 gap-0.5">
                    <Text className="text-metric font-sans-bold text-brand">
                      {formatMoney(revenuePerDay, currency)}
                    </Text>
                    <Text className="text-label text-tertiary">A day</Text>
                  </View>
                </View>
                <View className="border-t border-line pt-3">
                  <Text className="text-callout text-secondary">
                    {formatLitres(milkLitres)} over {milkedDays} {milkedDays === 1 ? 'day' : 'days'} ·{' '}
                    <Text className="font-sans-semibold text-brand">{formatMoney(milkRevenue, currency)}</Text> earned
                  </Text>
                </View>
              </Surface>

              {milkRows.slice(0, 20).map((record, i) => (
                <TimelineEntry key={record.id} index={i}>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-body font-sans-semibold capitalize text-primary">
                      {record.session} · {formatLitres(record.litres)}
                    </Text>
                    <Text className="text-callout font-sans-semibold text-brand">
                      {formatMoney(record.litres * (record.pricePerLitre ?? 0), currency)}
                    </Text>
                  </View>
                  <Text className="text-label text-tertiary">{formatDateForDisplay(record.recordDate)}</Text>
                </TimelineEntry>
              ))}
            </>
          )
        ) : null}

        {section === 'family' ? (
          <>
            <Surface level="raised" className="gap-1 p-4">
              <Text className="mb-1 text-headline font-sans-semibold text-primary">Parents</Text>
              {!dam && !sire ? (
                <Text className="text-callout text-tertiary">
                  Not recorded. Add them from Edit if the mother or father is already in your herd.
                </Text>
              ) : (
                <>
                  {dam ? (
                    <FamilyMemberRow label="Mother" member={dam} onPress={() => router.push(`/animal/${dam.id}`)} />
                  ) : null}
                  {sire ? (
                    <FamilyMemberRow label="Father" member={sire} onPress={() => router.push(`/animal/${sire.id}`)} />
                  ) : null}
                </>
              )}
            </Surface>

            <Surface level="raised" className="gap-1 p-4">
              <Text className="mb-1 text-headline font-sans-semibold text-primary">
                Offspring{children && children.length > 0 ? ` (${children.length})` : ''}
              </Text>
              {(children?.length ?? 0) === 0 ? (
                <Text className="text-callout text-tertiary">
                  No animals in your herd list {animal.tagNumber} as a parent yet.
                </Text>
              ) : (
                children!.map((child) => (
                  <FamilyMemberRow key={child.id} member={child} onPress={() => router.push(`/animal/${child.id}`)} />
                ))
              )}
            </Surface>
          </>
        ) : null}

        {section === 'breeding' ? (
          (breeding?.length ?? 0) === 0 ? (
            <EmptyState icon="heart-outline" title="No breeding events" description="Log a heat or service to get started." />
          ) : (
            breeding!.map((event, i) => (
              <TimelineEntry key={event.id} index={i}>
                <Text className="text-body font-sans-semibold capitalize text-primary">
                  {event.eventType.replace(/_/g, ' ')}
                </Text>
                <Text className="text-label text-tertiary">{formatDateForDisplay(event.eventDate)}</Text>
                {event.expectedDueDate ? (
                  <Text className="text-callout font-sans-medium text-brand">
                    Expected due {formatDateForDisplay(event.expectedDueDate)}
                  </Text>
                ) : null}
                {event.sireIdOrCode ? <Text className="text-callout text-secondary">Father: {event.sireIdOrCode}</Text> : null}
                {event.technicianName ? <Text className="text-callout text-secondary">By {event.technicianName}</Text> : null}
                {event.notes ? <Text className="text-callout text-secondary">{event.notes}</Text> : null}
              </TimelineEntry>
            ))
          )
        ) : null}

        {section === 'health' ? (
          (health?.length ?? 0) === 0 ? (
            <EmptyState icon="medkit-outline" title="No health records" description="Log a treatment to get started." />
          ) : (
            health!.map((log, i) => {
              const withdrawalDaysLeft = daysFromToday(log.withdrawalEndDate);
              const inWithdrawal = withdrawalDaysLeft !== null && withdrawalDaysLeft >= 0;
              return (
                <TimelineEntry key={log.id} index={i}>
                  <Text className="text-body font-sans-semibold text-primary">{log.conditionTreated}</Text>
                  <Text className="text-label text-tertiary">{formatDateForDisplay(log.treatmentDate)}</Text>
                  {log.medicationGiven ? <Text className="text-callout text-secondary">{log.medicationGiven}</Text> : null}
                  {inWithdrawal ? (
                    <View className="mt-1 self-start rounded-pill bg-warn-soft px-2.5 py-1">
                      <Text className="text-caption font-sans-semibold uppercase text-warn">
                        Withdrawal until {formatDateForDisplay(log.withdrawalEndDate)}
                      </Text>
                    </View>
                  ) : null}
                  {log.administeredBy ? <Text className="text-callout text-secondary">By {log.administeredBy}</Text> : null}
                </TimelineEntry>
              );
            })
          )
        ) : null}

        {section === 'births' ? (
          (births?.length ?? 0) === 0 ? (
            <EmptyState icon="egg-outline" title="No birth records" description="Log a birth to get started." />
          ) : (
            births!.map((record, i) => (
              <TimelineEntry key={record.id} index={i}>
                <Text className="text-body font-sans-semibold text-primary">{formatDateForDisplay(record.birthDate)}</Text>
                <Text className="text-callout text-secondary">
                  {record.liveBirths} live · {record.stillbirths} stillborn · {record.totalOffspring} total
                </Text>
                <Text className="text-callout capitalize text-secondary">{record.deliveryType} delivery</Text>
                {record.weaningDueDate ? (
                  <Text className="text-callout font-sans-medium text-brand">
                    Weaning due {formatDateForDisplay(record.weaningDueDate)}
                  </Text>
                ) : null}
              </TimelineEntry>
            ))
          )
        ) : null}
      </Animated.View>

      <View className="h-16" />
    </ScreenContainer>
  );
}
