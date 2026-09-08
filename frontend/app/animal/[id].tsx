import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { desc, eq } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Card } from '@/components/ui/Card';
import { ChipGroup } from '@/components/ui/Chip';
import { Fab } from '@/components/ui/Fab';
import { EmptyState } from '@/components/ui/EmptyState';
import { db } from '@/db/client';
import { ANIMAL_STATUSES, animals, birthRecords, breedingEvents, healthLogs, type AnimalStatus } from '@/db/schema';
import { SPECIES_EMOJI } from '@/components/animals/speciesMeta';
import { StatusBadge } from '@/components/animals/StatusBadge';
import { daysFromToday, formatDateForDisplay } from '@/utils/livestockRules';

const SECTIONS = [
  { value: 'overview', label: 'Overview' },
  { value: 'breeding', label: 'Breeding' },
  { value: 'health', label: 'Health' },
  { value: 'births', label: 'Births' },
] as const;
type Section = (typeof SECTIONS)[number]['value'];

const STATUS_OPTIONS = ANIMAL_STATUSES.map((status) => ({ value: status, label: status.replace('_', ' ') }));

export default function AnimalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [section, setSection] = useState<Section>('overview');

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

  if (!animal) {
    return (
      <ScreenContainer>
        <EmptyState icon="paw-outline" title="Animal not found" />
      </ScreenContainer>
    );
  }

  async function updateStatus(status: AnimalStatus) {
    await db.update(animals).set({ status, updatedAt: new Date().toISOString() }).where(eq(animals.id, id));
  }

  return (
    <ScreenContainer fab={<Fab icon="clipboard" label="Log event" onPress={() => router.push(`/log?animalId=${id}`)} />}>
      <Card className="gap-3">
        <View className="flex-row items-center gap-3">
          <Text className="text-4xl">{SPECIES_EMOJI[animal.species]}</Text>
          <View className="flex-1">
            <Text className="text-2xl font-bold text-ink-900">{animal.tagNumber}</Text>
            {animal.name ? <Text className="text-lg text-ink-500">{animal.name}</Text> : null}
          </View>
          <StatusBadge status={animal.status} />
        </View>
        <View className="flex-row flex-wrap gap-x-6 gap-y-1">
          <Text className="text-base capitalize text-ink-700">{animal.species}</Text>
          {animal.breed ? <Text className="text-base text-ink-700">{animal.breed}</Text> : null}
          <Text className="text-base capitalize text-ink-700">{animal.gender}</Text>
          <Text className="text-base text-ink-700">Born {formatDateForDisplay(animal.birthDate)}</Text>
        </View>
      </Card>

      <View className="gap-2">
        <Text className="text-base font-medium text-ink-700">Status</Text>
        <ChipGroup options={STATUS_OPTIONS} value={animal.status} onChange={updateStatus} />
      </View>

      <ChipGroup options={SECTIONS} value={section} onChange={setSection} />

      {section === 'overview' ? (
        <Card className="gap-2">
          <Text className="text-lg font-semibold text-ink-900">Summary</Text>
          <Text className="text-base text-ink-700">{breeding?.length ?? 0} breeding events logged</Text>
          <Text className="text-base text-ink-700">{health?.length ?? 0} health treatments logged</Text>
          <Text className="text-base text-ink-700">{births?.length ?? 0} birth records logged</Text>
        </Card>
      ) : null}

      {section === 'breeding' ? (
        (breeding?.length ?? 0) === 0 ? (
          <EmptyState icon="heart-outline" title="No breeding events" description="Log a heat, service, or palpation to get started." />
        ) : (
          breeding!.map((event) => (
            <Card key={event.id} className="gap-1">
              <Text className="text-lg font-semibold capitalize text-ink-900">{event.eventType.replace(/_/g, ' ')}</Text>
              <Text className="text-sm text-ink-500">{formatDateForDisplay(event.eventDate)}</Text>
              {event.expectedDueDate ? (
                <Text className="text-sm font-medium text-brand-600">Expected due {formatDateForDisplay(event.expectedDueDate)}</Text>
              ) : null}
              {event.sireIdOrCode ? <Text className="text-sm text-ink-700">Sire: {event.sireIdOrCode}</Text> : null}
              {event.technicianName ? <Text className="text-sm text-ink-700">By {event.technicianName}</Text> : null}
              {event.notes ? <Text className="text-sm text-ink-700">{event.notes}</Text> : null}
            </Card>
          ))
        )
      ) : null}

      {section === 'health' ? (
        (health?.length ?? 0) === 0 ? (
          <EmptyState icon="medkit-outline" title="No health records" description="Log a treatment to get started." />
        ) : (
          health!.map((log) => {
            const withdrawalDaysLeft = daysFromToday(log.withdrawalEndDate);
            const inWithdrawal = withdrawalDaysLeft !== null && withdrawalDaysLeft >= 0;
            return (
              <Card key={log.id} className="gap-1">
                <Text className="text-lg font-semibold text-ink-900">{log.conditionTreated}</Text>
                <Text className="text-sm text-ink-500">{formatDateForDisplay(log.treatmentDate)}</Text>
                {log.medicationGiven ? <Text className="text-sm text-ink-700">{log.medicationGiven}</Text> : null}
                {inWithdrawal ? (
                  <Text className="text-sm font-medium text-warning-600">
                    Withdrawal until {formatDateForDisplay(log.withdrawalEndDate)}
                  </Text>
                ) : null}
                {log.administeredBy ? <Text className="text-sm text-ink-700">By {log.administeredBy}</Text> : null}
              </Card>
            );
          })
        )
      ) : null}

      {section === 'births' ? (
        (births?.length ?? 0) === 0 ? (
          <EmptyState icon="egg-outline" title="No birth records" description="Log a birth to get started." />
        ) : (
          births!.map((record) => (
            <Card key={record.id} className="gap-1">
              <Text className="text-lg font-semibold text-ink-900">{formatDateForDisplay(record.birthDate)}</Text>
              <Text className="text-sm text-ink-700">
                {record.liveBirths} live · {record.stillbirths} stillborn · {record.totalOffspring} total
              </Text>
              <Text className="text-sm capitalize text-ink-700">{record.deliveryType} delivery</Text>
              {record.weaningDueDate ? (
                <Text className="text-sm font-medium text-brand-600">Weaning due {formatDateForDisplay(record.weaningDueDate)}</Text>
              ) : null}
            </Card>
          ))
        )
      ) : null}
    </ScreenContainer>
  );
}
