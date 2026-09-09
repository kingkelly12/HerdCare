import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Surface } from '@/components/ui/Surface';
import { Segmented } from '@/components/ui/Segmented';
import { QuickDateSelector } from '@/components/ui/QuickDateSelector';
import { Callout } from '@/components/ui/Callout';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SpeciesAvatar } from '@/components/animals/SpeciesIcon';
import { db } from '@/db/client';
import { loadMilkSession, saveMilkSession } from '@/db/milk';
import { getSettings } from '@/db/reminders';
import { animals, MILK_SESSIONS, MILKING_SPECIES, type MilkSession } from '@/db/schema';
import { getRelativeDateIso } from '@/utils/livestockRules';
import { formatMoney } from '@/utils/money';
import { useColors } from '@/theme/colors';
import { notifySaved } from '@/lib/haptics';

const SESSION_OPTIONS = MILK_SESSIONS.map((session) => ({
  value: session,
  label: session.charAt(0).toUpperCase() + session.slice(1),
}));

/** The round a farmer is most likely recording, based on when they opened the screen. */
function defaultSession(): MilkSession {
  const hour = new Date().getHours();
  if (hour < 11) return 'morning';
  if (hour < 15) return 'midday';
  return 'evening';
}

export default function LogMilkScreen() {
  const colors = useColors();
  const [recordDate, setRecordDate] = useState(getRelativeDateIso(0));
  const [session, setSession] = useState<MilkSession>(defaultSession());
  const [litresByAnimal, setLitresByAnimal] = useState<Record<string, string>>({});
  const [pricePerLitre, setPricePerLitre] = useState('0');
  const [currency, setCurrency] = useState('KES');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only females of a milking species that are still on the farm. A bull or a sold cow appearing
  // in the milking list would be noise on a screen used twice a day.
  const { data: milkers } = useLiveQuery(
    db
      .select()
      .from(animals)
      .where(
        and(
          inArray(animals.species, [...MILKING_SPECIES]),
          eq(animals.gender, 'female'),
          notInArray(animals.status, ['sold', 'deceased']),
        ),
      )
      .orderBy(animals.tagNumber),
  );

  useEffect(() => {
    getSettings()
      .then((prefs) => {
        if (!prefs) return;
        setPricePerLitre(String(prefs.milkPricePerLitre ?? 0));
        setCurrency(prefs.currency ?? 'KES');
      })
      .catch(() => {});
  }, []);

  // Re-opening a round that was already recorded shows what is there, so a correction is an edit
  // rather than a guess about whether it saved.
  useEffect(() => {
    let cancelled = false;
    loadMilkSession(recordDate, session)
      .then((existing) => {
        if (cancelled) return;
        const seeded: Record<string, string> = {};
        for (const record of existing) seeded[record.animalId] = String(record.litres);
        setLitresByAnimal(seeded);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [recordDate, session]);

  const price = Number.parseFloat(pricePerLitre) || 0;
  const entered = Object.values(litresByAnimal)
    .map((value) => Number.parseFloat(value))
    .filter((litres) => Number.isFinite(litres) && litres > 0);
  const sessionLitres = entered.reduce((sum, litres) => sum + litres, 0);
  const sessionRevenue = sessionLitres * price;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveMilkSession({
        recordDate,
        session,
        pricePerLitre: price,
        entries: (milkers ?? []).map((animal) => ({ animalId: animal.id, litres: litresByAnimal[animal.id] ?? '' })),
      });
      notifySaved();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this milking.');
    } finally {
      setSaving(false);
    }
  }

  if ((milkers?.length ?? 0) === 0) {
    return (
      <ScreenContainer>
        <EmptyState
          icon="water-outline"
          title="No milking animals yet"
          description="Add a female cow or goat to your herd and it will appear here."
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      footer={
        <Button
          label={sessionLitres > 0 ? `Save ${Math.round(sessionLitres * 10) / 10} L` : 'Save milking'}
          fullWidth
          loading={saving}
          onPress={handleSave}
        />
      }
    >
      <QuickDateSelector label="Date" valueIso={recordDate} onChange={setRecordDate} />

      <View className="gap-2">
        <Text className="text-label font-sans-semibold uppercase text-tertiary">Milking</Text>
        <Segmented options={SESSION_OPTIONS} value={session} onChange={setSession} />
      </View>

      <View className="gap-2">
        <Text className="text-label font-sans-semibold uppercase text-tertiary">Litres per animal</Text>
        <Surface level="raised">
          {(milkers ?? []).map((animal, index) => (
            <View
              key={animal.id}
              className={`flex-row items-center gap-3 px-4 py-2.5 ${index > 0 ? 'border-t border-line' : ''}`}
            >
              <SpeciesAvatar species={animal.species} size={18} />
              <View className="flex-1">
                <Text className="text-body font-sans-medium text-primary">{animal.tagNumber}</Text>
                {animal.name ? <Text className="text-label text-tertiary">{animal.name}</Text> : null}
              </View>
              <TextInput
                value={litresByAnimal[animal.id] ?? ''}
                onChangeText={(value) => setLitresByAnimal((previous) => ({ ...previous, [animal.id]: value }))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.tertiary}
                className="h-12 w-20 rounded-field border border-line bg-surface px-3 text-right text-body font-sans text-primary"
              />
              <Text className="w-4 text-label text-tertiary">L</Text>
            </View>
          ))}
        </Surface>
        <Text className="text-label text-tertiary">Leave an animal blank if she was not milked.</Text>
      </View>

      <View className="gap-2">
        <Text className="text-label font-sans-semibold uppercase text-tertiary">Price per litre ({currency})</Text>
        <TextInput
          value={pricePerLitre}
          onChangeText={setPricePerLitre}
          keyboardType="decimal-pad"
          placeholderTextColor={colors.tertiary}
          className="min-h-touch rounded-field border border-line bg-surface px-4 py-3 text-body font-sans text-primary"
        />
        <Text className="text-label text-tertiary">
          Saved with this milking, so changing your price later will not rewrite what you already earned.
        </Text>
      </View>

      {sessionLitres > 0 && price <= 0 ? (
        <Callout tone="warn">
          Set a price per litre or this milking records no earnings — the Money tab will show the litres but nothing
          against them.
        </Callout>
      ) : null}

      {sessionLitres > 0 && price > 0 ? (
        <Callout>{`${Math.round(sessionLitres * 10) / 10} L · ${formatMoney(sessionRevenue, currency)}`}</Callout>
      ) : null}

      {error ? <Text className="text-callout text-danger">{error}</Text> : null}
    </ScreenContainer>
  );
}
