import { useMemo, useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { and, desc, eq, inArray, like, or } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { FilterChips } from '@/components/ui/Segmented';
import { Button } from '@/components/ui/Button';
import { Fab } from '@/components/ui/Fab';
import { EmptyState } from '@/components/ui/EmptyState';
import { showUndoToast } from '@/components/ui/UndoToast';
import { AnimalListItem } from '@/components/animals/AnimalListItem';
import { db } from '@/db/client';
import { ANIMAL_STATUSES, animals, type AnimalStatus, type Species } from '@/db/schema';
import { useColors } from '@/theme/colors';
import { SPECIES_LIST } from '@/utils/livestockRules';

const SPECIES_FILTER_OPTIONS = [{ value: 'all' as const, label: 'All species' }, ...SPECIES_LIST];
const STATUS_FILTER_OPTIONS = [
  { value: 'all' as const, label: 'Any status' },
  ...ANIMAL_STATUSES.map((status) => ({ value: status, label: status.replace('_', ' ') })),
];

export function AnimalsList({ header }: { header: React.ReactNode }) {
  const colors = useColors();
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
    const ids = [...selectedIds];
    const count = ids.length;

    // Read fresh rather than trusting the filtered `data` list: selection persists across filter
    // changes, so an animal that's selected may no longer be present in the currently filtered
    // view by the time the action is applied.
    const previous = await db.select({ id: animals.id, status: animals.status }).from(animals).where(inArray(animals.id, ids));

    await db.update(animals).set({ status, updatedAt: new Date().toISOString() }).where(inArray(animals.id, ids));
    exitSelectionMode();

    showUndoToast({
      message: `Marked ${count} animal${count === 1 ? '' : 's'} as ${status.replace('_', ' ')}`,
      onUndo: async () => {
        const now = new Date().toISOString();
        for (const row of previous) {
          await db.update(animals).set({ status: row.status, updatedAt: now }).where(eq(animals.id, row.id));
        }
      },
    });
  }

  // Rendered through the container's overlay slot so it sits outside the padded body and can
  // actually span edge to edge.
  const overlay =
    selectionMode && selectedIds.size > 0 ? (
      <Animated.View
        entering={FadeInDown.springify().damping(18)}
        exiting={FadeOutDown.duration(150)}
        className="absolute inset-x-0 bottom-0 flex-row gap-2 border-t border-line bg-surface px-4 pb-6 pt-3"
      >
        <View className="flex-1">
          <Button label="Mark sold" variant="secondary" fullWidth onPress={() => applyBulkStatus('sold')} />
        </View>
        <View className="flex-1">
          <Button label="Mark deceased" variant="danger" fullWidth onPress={() => applyBulkStatus('deceased')} />
        </View>
      </Animated.View>
    ) : !selectionMode ? (
      <Fab onPress={() => router.push('/animal/new')} label="Add" />
    ) : undefined;

  return (
    <ScreenContainer scroll={false} fab={overlay}>
      <View className="gap-3 pt-4">
        {header}

        <View className="min-h-touch flex-row items-center gap-2 rounded-field border border-line bg-surface px-3">
          <Ionicons name="search" size={20} color={colors.tertiary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search tag or name"
            placeholderTextColor={colors.tertiary}
            autoCapitalize="characters"
            returnKeyType="search"
            className="flex-1 py-3 text-body font-sans text-primary"
          />
          {search ? (
            <Ionicons name="close-circle" size={20} color={colors.tertiary} onPress={() => setSearch('')} />
          ) : null}
        </View>

        <View className="-mx-4 gap-2 px-4">
          <FilterChips options={SPECIES_FILTER_OPTIONS} value={speciesFilter} onChange={setSpeciesFilter} />
          <FilterChips options={STATUS_FILTER_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
        </View>
      </View>

      {selectionMode ? (
        <Animated.View
          entering={FadeInDown.duration(200)}
          className="flex-row items-center justify-between rounded-field bg-brand-soft px-4 py-2"
        >
          <Text className="text-callout font-sans-semibold text-brand">{selectedIds.size} selected</Text>
          <Button label="Cancel" variant="ghost" onPress={exitSelectionMode} />
        </Animated.View>
      ) : null}

      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.id}
        // flex-1 is load-bearing: inside the non-scrolling ScreenContainer the list would
        // otherwise size to its content and overflow the screen instead of scrolling.
        className="flex-1"
        contentContainerClassName="gap-2 pb-32 pt-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <EmptyState
            icon="paw-outline"
            title={search || speciesFilter !== 'all' || statusFilter !== 'all' ? 'No matches' : 'No animals yet'}
            description={
              search || speciesFilter !== 'all' || statusFilter !== 'all'
                ? 'Try a different search or clear the filters.'
                : 'Tap Add to register your first animal.'
            }
          />
        }
        renderItem={({ item, index }) => (
          <AnimalListItem
            animal={item}
            index={index}
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
    </ScreenContainer>
  );
}
