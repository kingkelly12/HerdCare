import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { and, eq, inArray } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Surface, PressableSurface } from '@/components/ui/Surface';
import { TextField } from '@/components/ui/TextField';
import { QuickDateSelector } from '@/components/ui/QuickDateSelector';
import { Callout } from '@/components/ui/Callout';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { db } from '@/db/client';
import { currentFlockCount } from '@/db/flocks';
import { formatEggs, layingPercentage, loadEggRecord, saveEggRecord, toEggs } from '@/db/eggs';
import { EGGS_PER_TRAY, LAYING_POULTRY_TYPES, flockEvents, flocks } from '@/db/schema';
import { getRelativeDateIso } from '@/utils/livestockRules';
import { notifySaved } from '@/lib/haptics';

export default function LogEggsScreen() {
  const [flockId, setFlockId] = useState<string | null>(null);
  const [recordDate, setRecordDate] = useState(getRelativeDateIso(0));
  const [trays, setTrays] = useState('');
  const [loose, setLoose] = useState('');
  const [broken, setBroken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Broilers never lay, and a closed batch is finished, so neither should be offered.
  const { data: layingFlocks } = useLiveQuery(
    db
      .select()
      .from(flocks)
      .where(and(inArray(flocks.poultryType, [...LAYING_POULTRY_TYPES]), eq(flocks.status, 'active')))
      .orderBy(flocks.name),
  );

  const { data: events } = useLiveQuery(db.select().from(flockEvents));

  // With one laying flock there is nothing to choose, so the farmer never sees a picker.
  useEffect(() => {
    if (!flockId && layingFlocks?.length === 1) setFlockId(layingFlocks[0].id);
  }, [flockId, layingFlocks]);

  // Re-opening a day already recorded shows what is there, so a second collection is an edit.
  useEffect(() => {
    if (!flockId) return;
    let cancelled = false;
    loadEggRecord(flockId, recordDate)
      .then((existing) => {
        if (cancelled) return;
        if (!existing) {
          setTrays('');
          setLoose('');
          setBroken('');
          return;
        }
        setTrays(String(Math.floor(existing.eggsCollected / EGGS_PER_TRAY)));
        setLoose(String(existing.eggsCollected % EGGS_PER_TRAY));
        setBroken(existing.eggsBroken > 0 ? String(existing.eggsBroken) : '');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [flockId, recordDate]);

  const flock = layingFlocks?.find((entry) => entry.id === flockId) ?? null;
  const birds = flock ? currentFlockCount(flock, (events ?? []).filter((event) => event.flockId === flock.id)) : 0;
  const collected = toEggs(trays, loose);
  const brokenCount = Number.parseInt(broken, 10) || 0;
  const rate = layingPercentage(collected, birds);
  const tooManyBroken = brokenCount > collected && collected > 0;

  async function handleSave() {
    if (!flockId) return;
    setSaving(true);
    setError(null);
    try {
      await saveEggRecord({ flockId, recordDate, eggsCollected: collected, eggsBroken: brokenCount });
      notifySaved();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this collection.');
    } finally {
      setSaving(false);
    }
  }

  if ((layingFlocks?.length ?? 0) === 0) {
    return (
      <ScreenContainer>
        <EmptyState
          icon="egg-outline"
          title="No laying flocks"
          description="Add a layers or kienyeji flock and you can record its eggs here."
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      footer={
        <Button
          label={collected > 0 ? `Save ${formatEggs(collected)}` : 'Save collection'}
          fullWidth
          loading={saving}
          disabled={!flockId || tooManyBroken}
          onPress={handleSave}
        />
      }
    >
      {(layingFlocks?.length ?? 0) > 1 ? (
        <View className="gap-2">
          <Text className="text-label font-sans-semibold uppercase text-tertiary">Which flock</Text>
          {(layingFlocks ?? []).map((entry) => (
            <PressableSurface
              key={entry.id}
              onPress={() => setFlockId(entry.id)}
              className={`min-h-touch flex-row items-center justify-between p-3 ${entry.id === flockId ? 'border-brand' : ''}`}
            >
              <Text className="text-body font-sans-medium text-primary">{entry.name}</Text>
              <Text className="text-label text-tertiary">
                {currentFlockCount(entry, (events ?? []).filter((event) => event.flockId === entry.id))} birds
              </Text>
            </PressableSurface>
          ))}
        </View>
      ) : null}

      <QuickDateSelector label="Date" valueIso={recordDate} onChange={setRecordDate} />

      <View className="gap-2">
        <Text className="text-label font-sans-semibold uppercase text-tertiary">Collected</Text>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label="Trays" value={trays} onChangeText={setTrays} keyboardType="number-pad" placeholder="0" />
          </View>
          <View className="flex-1">
            <TextField label="Loose eggs" value={loose} onChangeText={setLoose} keyboardType="number-pad" placeholder="0" />
          </View>
        </View>
        <Text className="text-label text-tertiary">A tray holds {EGGS_PER_TRAY} eggs.</Text>
      </View>

      <TextField
        label="Broken or cracked"
        value={broken}
        onChangeText={setBroken}
        keyboardType="number-pad"
        placeholder="0"
        error={tooManyBroken ? 'More broken than collected — check the numbers.' : undefined}
      />

      {collected > 0 && birds > 0 ? (
        <Callout tone={rate < 50 ? 'warn' : 'brand'}>
          {`${formatEggs(collected)} from ${birds} birds · ${Math.round(rate)}% lay${
            rate < 50 ? '. Below about half is worth looking into — feed, water, heat or disease.' : ''
          }`}
        </Callout>
      ) : null}

      {error ? <Text className="text-callout text-danger">{error}</Text> : null}
    </ScreenContainer>
  );
}
