import { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { and, desc, eq, inArray, like, or } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { TextField } from '@/components/ui/TextField';
import { ChipGroup } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { Fab } from '@/components/ui/Fab';
import { EmptyState } from '@/components/ui/EmptyState';
import { AnimalListItem } from '@/components/animals/AnimalListItem';
import { db } from '@/db/client';
import { ANIMAL_STATUSES, animals, type AnimalStatus, type Species } from '@/db/schema';
import { SPECIES_LIST } from '@/utils/livestockRules';

const SPECIES_FILTER_OPTIONS = [{ value: 'all' as const, label: 'All' }, ...SPECIES_LIST];
const STATUS_FILTER_OPTIONS = [
  { value: 'all' as const, label: 'All' },
  ...ANIMAL_STATUSES.map((status) => ({ value: status, label: status.replace('_', ' ') })),
];

export default function AnimalsScreen() {
  const [search, setSearch] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState<Species | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AnimalStatus | 'all'>('all');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const whereClause = useMemo(() => {
    const conditions = [];
    if (search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(or(like(animals.tagNumber, term), like(animals.name, term)));
    }
    if (speciesFilter !== 'all') conditions.push(eq(animals.species, speciesFilter));
    if (statusFilter !== 'all') conditions.push(eq(animals.status, statusFilter));
    return conditions.length > 0 ? and(...conditions) : undefined;
  }, [search, speciesFilter, statusFilter]);

  const { data } = useLiveQuery(
    db.select().from(animals).where(whereClause).orderBy(desc(animals.updatedAt)),
    [search, speciesFilter, statusFilter],
  );

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  async function applyBulkStatus(status: AnimalStatus) {
    if (selectedIds.size === 0) return;
    await db.update(animals).set({ status, updatedAt: new Date().toISOString() }).where(inArray(animals.id, [...selectedIds]));
    exitSelectionMode();
  }

  return (
    <ScreenContainer
      scroll={false}
      fab={!selectionMode ? <Fab onPress={() => router.push('/animal/new')} label="Add" /> : undefined}
    >
      <TextField
        label="Search"
        placeholder="Search by tag or name"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        returnKeyType="search"
      />
      <ChipGroup options={SPECIES_FILTER_OPTIONS} value={speciesFilter} onChange={setSpeciesFilter} />
      <ChipGroup options={STATUS_FILTER_OPTIONS} value={statusFilter} onChange={setStatusFilter} />

      {selectionMode ? (
        <View className="flex-row items-center justify-between rounded-2xl bg-brand-50 px-4 py-3">
          <Text className="text-base font-semibold text-brand-700">{selectedIds.size} selected</Text>
          <Button label="Cancel" variant="ghost" onPress={exitSelectionMode} />
        </View>
      ) : null}

      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerClassName="gap-3 pb-24 pt-1"
        ListEmptyComponent={
          <EmptyState
            icon="paw-outline"
            title="No animals yet"
            description="Tap Add to register your first animal."
          />
        }
        renderItem={({ item }) => (
          <AnimalListItem
            animal={item}
            selectionMode={selectionMode}
            selected={selectedIds.has(item.id)}
            onPress={() => (selectionMode ? toggleSelected(item.id) : router.push(`/animal/${item.id}`))}
            onLongPress={() => {
              setSelectionMode(true);
              toggleSelected(item.id);
            }}
          />
        )}
      />

      {selectionMode && selectedIds.size > 0 ? (
        <View className="absolute inset-x-0 bottom-0 flex-row gap-2 border-t border-ink-100 bg-white p-4">
          <Button label="Mark sold" variant="secondary" onPress={() => applyBulkStatus('sold')} />
          <Button label="Mark deceased" variant="danger" onPress={() => applyBulkStatus('deceased')} />
        </View>
      ) : null}
    </ScreenContainer>
  );
}
