import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { eq } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { PressableSurface } from '@/components/ui/Surface';
import { TextField } from '@/components/ui/TextField';
import { QuickDateSelector } from '@/components/ui/QuickDateSelector';
import { Callout } from '@/components/ui/Callout';
import { Button } from '@/components/ui/Button';
import { db } from '@/db/client';
import { DEFAULT_INCUBATION_DAYS, flocks, hatchBatches } from '@/db/schema';
import { addDaysIso, formatDateForDisplay, getRelativeDateIso } from '@/utils/livestockRules';
import { notifySaved } from '@/lib/haptics';

export default function NewHatchScreen() {
  const [setDate, setSetDate] = useState(getRelativeDateIso(0));
  const [eggsSet, setEggsSet] = useState('');
  const [incubationDays, setIncubationDays] = useState(String(DEFAULT_INCUBATION_DAYS));
  const [sourceFlockId, setSourceFlockId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: activeFlocks } = useLiveQuery(
    db.select().from(flocks).where(eq(flocks.status, 'active')).orderBy(flocks.name),
  );

  const eggsNumber = Number.parseInt(eggsSet, 10);
  const validEggs = Number.isFinite(eggsNumber) && eggsNumber > 0;
  const daysNumber = Number.parseInt(incubationDays, 10) || DEFAULT_INCUBATION_DAYS;
  const canSave = validEggs && daysNumber > 0;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const [created] = await db
        .insert(hatchBatches)
        .values({
          setDate,
          eggsSet: eggsNumber,
          incubationDays: daysNumber,
          sourceFlockId,
        })
        .returning();
      notifySaved();
      router.replace(`/hatch/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start this batch.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer footer={<Button label="Start incubating" fullWidth loading={saving} disabled={!canSave} onPress={handleSave} />}>
      <TextField
        label="How many eggs"
        required
        value={eggsSet}
        onChangeText={setEggsSet}
        keyboardType="number-pad"
        placeholder="e.g. 60"
      />

      <QuickDateSelector label="Date set" valueIso={setDate} onChange={setSetDate} />

      <TextField
        label="Days to hatch"
        value={incubationDays}
        onChangeText={setIncubationDays}
        keyboardType="number-pad"
        hint="Chicken eggs take 21 days. Ducks and turkeys take 28."
      />

      {(activeFlocks?.length ?? 0) > 0 ? (
        <View className="gap-2">
          <Text className="text-label font-sans-semibold uppercase text-tertiary">Eggs came from (optional)</Text>
          {(activeFlocks ?? []).map((flock) => (
            <PressableSurface
              key={flock.id}
              onPress={() => setSourceFlockId(sourceFlockId === flock.id ? null : flock.id)}
              className={`min-h-touch flex-row items-center justify-between p-3 ${
                sourceFlockId === flock.id ? 'border-brand' : ''
              }`}
            >
              <Text className="text-body font-sans-medium text-primary">{flock.name}</Text>
              {sourceFlockId === flock.id ? <Text className="text-callout font-sans-semibold text-brand">Selected</Text> : null}
            </PressableSurface>
          ))}
          <Text className="text-label text-tertiary">
            Recording the source flock lets a poor hatch be traced back to the breeding birds.
          </Text>
        </View>
      ) : null}

      {canSave ? (
        <Callout>{`${eggsNumber} eggs · due to hatch ${formatDateForDisplay(addDaysIso(setDate, daysNumber))}`}</Callout>
      ) : null}

      {error ? <Text className="text-callout text-danger">{error}</Text> : null}
    </ScreenContainer>
  );
}
