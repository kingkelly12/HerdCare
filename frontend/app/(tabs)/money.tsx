import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { desc, eq, gte } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Surface } from '@/components/ui/Surface';
import { Segmented } from '@/components/ui/Segmented';
import { Fab } from '@/components/ui/Fab';
import { db } from '@/db/client';
import { totalLitres, totalRevenue } from '@/db/milk';
import { animals, expenses, milkRecords, settings, type ExpenseCategory } from '@/db/schema';
import { useColors } from '@/theme/colors';
import { addDaysIso, formatDateForDisplay, startOfTodayIso } from '@/utils/livestockRules';
import { formatLitres, formatMoney } from '@/utils/money';

const PERIODS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '365', label: 'Year' },
] as const;

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  feed: 'Feed',
  supplement: 'Supplements',
  medication: 'Medication',
  veterinary: 'Vet',
  labour: 'Labour',
  equipment: 'Equipment',
  other: 'Other',
};

export default function MoneyScreen() {
  const colors = useColors();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['value']>('30');

  // Inclusive of today: a 30-day view means the last 30 days *including* this one.
  const since = addDaysIso(startOfTodayIso(), -(Number(period) - 1));

  const { data: milk } = useLiveQuery(
    db.select().from(milkRecords).where(gte(milkRecords.recordDate, since)).orderBy(desc(milkRecords.recordDate)),
    [since],
  );

  const { data: spend } = useLiveQuery(
    db.select().from(expenses).where(gte(expenses.expenseDate, since)).orderBy(desc(expenses.expenseDate)),
    [since],
  );

  const { data: settingsRows } = useLiveQuery(db.select().from(settings).where(eq(settings.id, 'default')));
  const currency = settingsRows?.[0]?.currency ?? 'KES';

  const { data: herd } = useLiveQuery(db.select().from(animals));
  const animalById = new Map((herd ?? []).map((animal) => [animal.id, animal]));

  const milkRows = milk ?? [];
  const spendRows = spend ?? [];

  const revenue = totalRevenue(milkRows);
  const litres = totalLitres(milkRows);
  const spent = spendRows.reduce((sum, row) => sum + row.amount, 0);
  const profit = revenue - spent;

  const byCategory = spendRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.category] = (acc[row.category] ?? 0) + row.amount;
    return acc;
  }, {});
  const categories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  // Per-animal earnings — the "how much is each one bringing in" question.
  const byAnimal = milkRows.reduce<Record<string, { litres: number; revenue: number }>>((acc, row) => {
    const current = acc[row.animalId] ?? { litres: 0, revenue: 0 };
    current.litres += row.litres;
    current.revenue += row.litres * (row.pricePerLitre ?? 0);
    acc[row.animalId] = current;
    return acc;
  }, {});
  const earners = Object.entries(byAnimal).sort((a, b) => b[1].revenue - a[1].revenue);

  return (
    <ScreenContainer fab={<Fab icon="add" label="Expense" onPress={() => router.push('/expense/new')} />}>
      <Animated.View entering={FadeInDown.duration(300)} className="gap-3 pt-4">
        <Text className="text-title font-sans-bold text-primary">Money</Text>
        <Segmented options={PERIODS} value={period} onChange={setPeriod} />
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(300).delay(60)}>
        <Surface level="raised" className="gap-4 p-4">
          <View className="flex-row">
            <View className="flex-1 gap-0.5">
              <Text className="text-label text-tertiary">Milk sales</Text>
              <Text className="text-headline font-sans-bold text-brand">{formatMoney(revenue, currency)}</Text>
              <Text className="text-label text-tertiary">{formatLitres(litres)}</Text>
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="text-label text-tertiary">Spent</Text>
              <Text className="text-headline font-sans-bold text-danger">{formatMoney(spent, currency)}</Text>
              <Text className="text-label text-tertiary">{spendRows.length} entries</Text>
            </View>
          </View>

          <View className="border-t border-line pt-3">
            <Text className="text-label text-tertiary">{profit >= 0 ? 'Profit' : 'Loss'}</Text>
            <Text className={`text-metric font-sans-bold ${profit >= 0 ? 'text-brand' : 'text-danger'}`}>
              {formatMoney(profit, currency)}
            </Text>
            {revenue === 0 && spent === 0 ? (
              <Text className="text-label text-tertiary">
                Record a milking and what you spend, and this will tell you where you stand.
              </Text>
            ) : null}
          </View>
        </Surface>
      </Animated.View>

      {earners.length > 0 ? (
        <Animated.View entering={FadeInDown.duration(300).delay(120)} className="gap-2">
          <Text className="text-headline font-sans-semibold text-primary">What each animal brought in</Text>
          <Surface level="raised">
            {earners.map(([animalId, totals], index) => {
              const animal = animalById.get(animalId);
              const perDay = totals.revenue / Number(period);
              return (
                <View
                  key={animalId}
                  className={`flex-row items-center gap-3 px-4 py-3 ${index > 0 ? 'border-t border-line' : ''}`}
                >
                  <View className="flex-1">
                    <Text className="text-body font-sans-medium text-primary">
                      {animal?.tagNumber ?? 'Removed animal'}
                      {animal?.name ? ` · ${animal.name}` : ''}
                    </Text>
                    <Text className="text-label text-tertiary">
                      {formatLitres(totals.litres)} · {formatMoney(perDay, currency)}/day
                    </Text>
                  </View>
                  <Text className="text-body font-sans-semibold text-brand">{formatMoney(totals.revenue, currency)}</Text>
                </View>
              );
            })}
          </Surface>
        </Animated.View>
      ) : null}

      {categories.length > 0 ? (
        <Animated.View entering={FadeInDown.duration(300).delay(180)} className="gap-2">
          <Text className="text-headline font-sans-semibold text-primary">Where the money went</Text>
          <Surface level="raised">
            {categories.map(([category, total], index) => (
              <View
                key={category}
                className={`flex-row items-center justify-between px-4 py-3 ${index > 0 ? 'border-t border-line' : ''}`}
              >
                <Text className="text-body text-primary">{CATEGORY_LABELS[category as ExpenseCategory] ?? category}</Text>
                <Text className="text-body font-sans-semibold text-primary">{formatMoney(total, currency)}</Text>
              </View>
            ))}
          </Surface>
        </Animated.View>
      ) : null}

      {spendRows.length > 0 ? (
        <Animated.View entering={FadeInDown.duration(300).delay(240)} className="gap-2">
          <Text className="text-headline font-sans-semibold text-primary">Recent spending</Text>
          <View className="gap-3 px-1">
            {spendRows.slice(0, 8).map((row) => (
              <View key={row.id} className="flex-row items-center gap-3">
                <Ionicons name="pricetag-outline" size={18} color={colors.tertiary} />
                <View className="flex-1">
                  <Text className="text-callout font-sans-medium text-primary">{row.description}</Text>
                  <Text className="text-label text-tertiary">
                    {CATEGORY_LABELS[row.category] ?? row.category} · {formatDateForDisplay(row.expenseDate)}
                    {row.animalId && animalById.get(row.animalId)
                      ? ` · ${animalById.get(row.animalId)?.tagNumber}`
                      : ''}
                  </Text>
                </View>
                <Text className="text-callout font-sans-semibold text-primary">{formatMoney(row.amount, currency)}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      ) : null}

      <View className="h-16" />
    </ScreenContainer>
  );
}
