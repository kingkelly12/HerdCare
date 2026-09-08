import { useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { sql } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { db } from '@/db/client';
import { animals, birthRecords, breedingEvents, healthLogs } from '@/db/schema';

function SettingsRow({ icon, title, subtitle }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string }) {
  return (
    <View className="flex-row items-center gap-3 py-3">
      <Ionicons name={icon} size={22} color="#5C6B58" />
      <View className="flex-1">
        <Text className="text-base font-medium text-ink-900">{title}</Text>
        <Text className="text-sm text-ink-500">{subtitle}</Text>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const [counts, setCounts] = useState<{ animals: number; breeding: number; health: number; births: number } | null>(null);

  async function refreshCounts() {
    const [[a], [b], [h], [r]] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(animals),
      db.select({ count: sql<number>`count(*)` }).from(breedingEvents),
      db.select({ count: sql<number>`count(*)` }).from(healthLogs),
      db.select({ count: sql<number>`count(*)` }).from(birthRecords),
    ]);
    setCounts({ animals: a.count, breeding: b.count, health: h.count, births: r.count });
  }

  return (
    <ScreenContainer>
      <Text className="text-2xl font-bold text-ink-900">Settings</Text>

      <Card>
        <SettingsRow icon="cloud-offline-outline" title="Offline-first" subtitle="All data lives on this device in a local database." />
        <SettingsRow icon="sync-outline" title="Cloud sync" subtitle="Not connected yet — coming in a future update." />
        <SettingsRow icon="camera-outline" title="Ear-tag scanning" subtitle="Coming soon." />
        <SettingsRow icon="mic-outline" title="Voice logging" subtitle="Coming soon." />
      </Card>

      <Card className="gap-2">
        <Text className="text-lg font-semibold text-ink-900">Local data</Text>
        <Button label="Show record counts" variant="secondary" onPress={refreshCounts} />
        {counts ? (
          <View className="gap-1">
            <Text className="text-base text-ink-700">{counts.animals} animals</Text>
            <Text className="text-base text-ink-700">{counts.breeding} breeding events</Text>
            <Text className="text-base text-ink-700">{counts.health} health logs</Text>
            <Text className="text-base text-ink-700">{counts.births} birth records</Text>
          </View>
        ) : null}
      </Card>

      <Text className="text-center text-sm text-ink-500">HerdCare v{Constants.expoConfig?.version ?? '1.0.0'}</Text>
    </ScreenContainer>
  );
}
