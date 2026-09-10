import { useLocalSearchParams } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { eq } from 'drizzle-orm';
import { FinanceEntryForm } from '@/components/money/FinanceEntryForm';
import { db } from '@/db/client';
import { animals } from '@/db/schema';

/**
 * Also opened pre-filled from "mark as sold", which is why it accepts params — recording what an
 * animal fetched right at the moment of sale is the only time the farmer reliably remembers it.
 */
export default function NewIncomeScreen() {
  const params = useLocalSearchParams<{ animalId?: string; category?: string; description?: string }>();

  const { data: rows } = useLiveQuery(
    db.select().from(animals).where(eq(animals.id, params.animalId ?? '')),
    [params.animalId],
  );
  const animal = params.animalId ? rows?.[0] ?? null : null;

  // Waits for the animal to load before mounting the form, so the prefill lands in its initial
  // state rather than arriving after the farmer has already started typing.
  if (params.animalId && !animal) return null;

  return (
    <FinanceEntryForm
      direction="income"
      initial={{ category: params.category, description: params.description, animal }}
    />
  );
}
