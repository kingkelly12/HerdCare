import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { desc, eq, or } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Surface } from '@/components/ui/Surface';
import { Segmented, FilterChips } from '@/components/ui/Segmented';
import { Fab } from '@/components/ui/Fab';
import { EmptyState } from '@/components/ui/EmptyState';
import { db } from '@/db/client';
import { ANIMAL_STATUSES, animals, birthRecords, breedingEvents, healthLogs, type Animal, type AnimalStatus } from '@/db/schema';
import { SpeciesAvatar } from '@/components/animals/SpeciesIcon';
import { StatusBadge } from '@/components/animals/StatusBadge';
import { showUndoToast } from '@/components/ui/UndoToast';
import { useColors } from '@/theme/colors';
import { daysFromToday, formatDateForDisplay } from '@/utils/livestockRules';

const SECTIONS = [
  { value: 'overview', label: 'Overview' },
  { value: 'family', label: 'Family' },
  { value: 'breeding', label: 'Breeding' },
  { value: 'health', label: 'Health' },
  { value: 'births', label: 'Births' },
] as const;
type Section = (typeof SECTIONS)[number]['value'];

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
  const { data: damRows } = useLiveQuery(db.select().from(animals).where(eq(animals.id, animal?.damId ?? '')));
  const { data: sireRows } = useLiveQuery(db.select().from(animals).where(eq(animals.id, animal?.sireId ?? '')));
  const { data: children } = useLiveQuery(
    db
      .select()
      .from(animals)
      .where(or(eq(animals.damId, id), eq(animals.sireId, id)))
      .orderBy(desc(animals.birthDate)),
  );
  const dam = damRows?.[0];
  const sire = sireRows?.[0];

  if (!animal) {
    return (
      <ScreenContainer>
        <EmptyState icon="paw-outline" title="Animal not found" />
      </ScreenContainer>
    );
  }

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

      <Segmented options={SECTIONS} value={section} onChange={setSection} />

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
