import { useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { and, eq, like, or } from 'drizzle-orm';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '@/components/ui/EmptyState';
import { PressableSurface } from '@/components/ui/Surface';
import { db } from '@/db/client';
import { animals, type Animal, type Gender } from '@/db/schema';
import { useColors } from '@/theme/colors';
import { SpeciesAvatar } from './SpeciesIcon';
import { StatusBadge } from './StatusBadge';

interface AnimalSearchModalProps {
  visible: boolean;
  title?: string;
  genderFilter?: Gender;
  excludeId?: string;
  onSelect: (animal: Animal) => void;
  onClose: () => void;
}

export function AnimalSearchModal({
  visible,
  title = 'Select animal',
  genderFilter,
  excludeId,
  onSelect,
  onClose,
}: AnimalSearchModalProps) {
  const colors = useColors();
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
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView className="flex-1 bg-canvas">
        <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
          <Text className="text-title font-sans-bold text-primary">{title}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            className="h-11 w-11 items-center justify-center rounded-pill bg-sunken active:opacity-70"
          >
            <Ionicons name="close" size={22} color={colors.primary} />
          </Pressable>
        </View>

        <View className="px-4 pb-3">
          <View className="min-h-touch flex-row items-center gap-2 rounded-field border border-line bg-surface px-3">
            <Ionicons name="search" size={20} color={colors.tertiary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search tag or name"
              placeholderTextColor={colors.tertiary}
              autoCapitalize="characters"
              autoFocus
              className="flex-1 py-3 text-body font-sans text-primary"
            />
          </View>
        </View>

        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-2 px-4 pb-8"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<EmptyState icon="search-outline" title="No matching animals" />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.duration(220).delay(Math.min(index, 8) * 30)}>
              <PressableSurface
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
                className="min-h-touch flex-row items-center gap-3 p-3"
              >
                <SpeciesAvatar species={item.species} size={20} />
                <View className="flex-1">
                  <Text className="text-body font-sans-semibold text-primary">{item.tagNumber}</Text>
                  <Text className="text-label capitalize text-tertiary">
                    {item.name ? `${item.name} · ` : ''}
                    {item.species}
                  </Text>
                </View>
                <StatusBadge status={item.status} />
              </PressableSurface>
            </Animated.View>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}
