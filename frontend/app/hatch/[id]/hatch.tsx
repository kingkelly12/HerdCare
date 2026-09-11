import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { eq } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Surface } from '@/components/ui/Surface';
import { SelectGroup } from '@/components/ui/SelectGroup';
import { TextField } from '@/components/ui/TextField';
import { QuickDateSelector } from '@/components/ui/QuickDateSelector';
import { Callout } from '@/components/ui/Callout';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { db } from '@/db/client';
import { flocks, hatchBatches, type PoultryType } from '@/db/schema';
import { getRelativeDateIso } from '@/utils/livestockRules';
import { POULTRY_TYPE_OPTIONS } from '@/utils/poultryRules';
import { useColors } from '@/theme/colors';
import { notifySaved } from '@/lib/haptics';
import { refreshRemindersAndNotifications } from '@/lib/reminderSync';

export default function RecordHatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { data: rows, updatedAt } = useLiveQuery(db.select().from(hatchBatches).where(eq(hatchBatches.id, id)), [id]);
  const batch = rows?.[0];

  const [hatchedDate, setHatchedDate] = useState(getRelativeDateIso(0));
  const [chicks, setChicks] = useState('');
  // Registering the chicks as a flock is what puts them on the vaccination and feed clock from
  // day one, which is the whole reason to bother incubating in an app rather than a notebook.
  const [registerFlock, setRegisterFlock] = useState(true);
  const [flockName, setFlockName] = useState('');
  const [poultryType, setPoultryType] = useState<PoultryType | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chicksNumber = Number.parseInt(chicks, 10);
  const validChicks = Number.isFinite(chicksNumber) && chicksNumber >= 0;
  const tooMany = batch ? validChicks && chicksNumber > batch.eggsSet : false;
  const needsFlockDetails = registerFlock && chicksNumber > 0;
  const canSave =
    validChicks && !tooMany && (!needsFlockDetails || (flockName.trim().length > 0 && poultryType !== null));

  const rate = batch && validChicks && batch.eggsSet > 0 ? (chicksNumber / batch.eggsSet) * 100 : null;

  async function handleSave() {
    if (!canSave || !batch) return;
    setSaving(true);
    setError(null);
    try {
      let resultingFlockId: string | null = null;

      if (needsFlockDetails && poultryType) {
        const [flock] = await db
          .insert(flocks)
          .values({
            name: flockName.trim(),
            poultryType,
            source: 'hatched',
            acquiredDate: hatchedDate,
            // Hatched here, so they start at day zero and pick up the full programme.
            ageAtAcquisitionDays: 0,
            initialCount: chicksNumber,
          })
          .returning();
        resultingFlockId = flock.id;
      }

      await db
        .update(hatchBatches)
        .set({ hatchedDate, chicksHatched: chicksNumber, resultingFlockId, updatedAt: new Date().toISOString() })
        .where(eq(hatchBatches.id, id));

      notifySaved();
      refreshRemindersAndNotifications().catch(() => {});
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this hatch.');
    } finally {
      setSaving(false);
    }
  }

  // Still resolving — useLiveQuery starts with an empty array, not undefined, so without
  // this check the not-found screen flashes for a frame on every navigation here, including
  // the instant after a new record is saved.
  if (!updatedAt) {
    return <ScreenContainer>{null}</ScreenContainer>;
  }

  if (!batch) {
    return (
      <ScreenContainer>
        <EmptyState icon="egg-outline" title="Batch not found" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer footer={<Button label="Save hatch" fullWidth loading={saving} disabled={!canSave} onPress={handleSave} />}>
      <Text className="pt-2 text-callout text-secondary">
        {batch.eggsSet} eggs were set
        {batch.fertileEggs !== null ? `, ${batch.fertileEggs} were developing at candling` : ''}.
      </Text>

      <TextField
        label="Chicks hatched"
        required
        value={chicks}
        onChangeText={setChicks}
        keyboardType="number-pad"
        placeholder="0"
        error={tooMany ? `Only ${batch.eggsSet} eggs were set.` : undefined}
      />

      <QuickDateSelector label="Date hatched" valueIso={hatchedDate} onChange={setHatchedDate} />

      {rate !== null && !tooMany ? (
        <Callout tone={rate < 60 ? 'warn' : 'brand'}>{`${Math.round(rate)}% of the eggs set hatched`}</Callout>
      ) : null}

      {chicksNumber > 0 ? (
        <Surface level="raised" className="gap-3 p-4">
          <View className="flex-row items-center gap-3">
            <View className="flex-1">
              <Text className="text-body font-sans-medium text-primary">Start a flock with them</Text>
              <Text className="text-label text-tertiary">
                Puts the chicks on the vaccination and feed schedule from day one.
              </Text>
            </View>
            <Switch
              value={registerFlock}
              onValueChange={setRegisterFlock}
              trackColor={{ true: colors.brand, false: colors.borderStrong }}
              thumbColor={colors.raised}
            />
          </View>

          {registerFlock ? (
            <View className="gap-3 border-t border-line pt-3">
              <TextField
                label="Name this flock"
                required
                value={flockName}
                onChangeText={setFlockName}
                placeholder="e.g. September hatch"
              />
              <SelectGroup
                label="Kept for"
                required
                options={POULTRY_TYPE_OPTIONS}
                value={poultryType}
                onChange={setPoultryType}
              />
            </View>
          ) : null}
        </Surface>
      ) : null}

      {error ? <Text className="text-callout text-danger">{error}</Text> : null}
    </ScreenContainer>
  );
}
