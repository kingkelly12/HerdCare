import { useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { and, eq, or, like } from 'drizzle-orm';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextField } from '@/components/ui/TextField';
import { EmptyState } from '@/components/ui/EmptyState';
import { db } from '@/db/client';
import { animals, type Animal, type Gender } from '@/db/schema';
import { SPECIES_EMOJI } from './speciesMeta';

interface AnimalSearchModalProps {
  visible: boolean;
  title?: string;
  genderFilter?: Gender;
  excludeId?: string;
  onSelect: (animal: Animal) => void;
  onClose: () => void;
}

export function AnimalSearchModal({ visible, title = 'Select animal', genderFilter, excludeId, onSelect, onClose }: AnimalSearchModalProps) {
  const [search, setSearch] = useState('');

  const conditions = [];
  if (search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(or(like(animals.tagNumber, term), like(animals.name, term)));
  }
  if (genderFilter) conditions.push(eq(animals.gender, genderFilter));

  const { data } = useLiveQuery(
    db
      .select()
      .from(animals)
      .where(conditions.length > 0 ? and(...conditions) : undefined),
    [search, genderFilter],
  );

  const results = (data ?? []).filter((animal) => animal.id !== excludeId);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-ink-50">
        <View className="flex-row items-center justify-between p-4">
          <Text className="text-xl font-bold text-ink-900">{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} className="h-10 w-10 items-center justify-center">
            <Ionicons name="close" size={26} color="#131A14" />
          </Pressable>
        </View>
        <View className="px-4 pb-2">
          <TextField
            label="Search"
            placeholder="Search by tag or name"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoFocus
          />
        </View>
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-2 p-4 pt-2"
          ListEmptyComponent={<EmptyState icon="search-outline" title="No matching animals" />}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onSelect(item);
                onClose();
              }}
              className="min-h-touch flex-row items-center gap-3 rounded-2xl border border-ink-100 bg-white p-4"
            >
              <Text className="text-2xl">{SPECIES_EMOJI[item.species]}</Text>
              <View>
                <Text className="text-lg font-semibold text-ink-900">{item.tagNumber}</Text>
                <Text className="text-sm capitalize text-ink-500">
                  {item.name ? `${item.name} · ` : ''}
                  {item.species}
                </Text>
              </View>
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}
