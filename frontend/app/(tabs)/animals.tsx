import { useState } from 'react';
import { Text, View } from 'react-native';
import { Segmented } from '@/components/ui/Segmented';
import { AnimalsList } from '@/components/herd/AnimalsList';
import { FlocksList } from '@/components/herd/FlocksList';
import { HatchList } from '@/components/herd/HatchList';

const VIEWS = [
  { value: 'animals', label: 'Animals' },
  { value: 'flocks', label: 'Flocks' },
  { value: 'hatching', label: 'Hatching' },
] as const;
type View_ = (typeof VIEWS)[number]['value'];

/**
 * Animals and flocks live under one tab because they are both "what I keep", but they are
 * separate lists rather than one merged one: a flock has no tag number, no parents and no
 * individual history, so it cannot meaningfully sit in a list built around those.
 */
export default function HerdScreen() {
  const [view, setView] = useState<View_>('animals');

  const header = (
    <View className="gap-3">
      <Text className="text-title font-sans-bold text-primary">Herd</Text>
      <Segmented options={VIEWS} value={view} onChange={setView} />
    </View>
  );

  if (view === 'animals') return <AnimalsList header={header} />;
  if (view === 'flocks') return <FlocksList header={header} />;
  return <HatchList header={header} />;
}
