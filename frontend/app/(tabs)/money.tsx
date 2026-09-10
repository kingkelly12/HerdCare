import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { desc, eq, gte } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Surface, PressableSurface } from '@/components/ui/Surface';
import { Segmented } from '@/components/ui/Segmented';
import { Fab } from '@/components/ui/Fab';
import { db } from '@/db/client';
import { totalLitres, totalRevenue } from '@/db/milk';
import { deliveryRevenue, totalDelivered, totalPaid } from '@/db/customers';
import {
  animals,
  customerPayments,
  deliveries,
  expenses,
  incomeEntries,
  supplierPayments,
  milkRecords,
  settings,
  type ExpenseCategory,
  type IncomeCategory,
} from '@/db/schema';
import { useColors } from '@/theme/colors';
import { addDaysIso, formatDateForDisplay, startOfTodayIso } from '@/utils/livestockRules';
import { formatLitres, formatMoney } from '@/utils/money';
import { EXPENSE_CATEGORY_META, INCOME_CATEGORY_META } from '@/utils/financeCategories';

const PERIODS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '365', label: 'Year' },
] as const;

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

  const { data: sold } = useLiveQuery(
    db.select().from(deliveries).where(gte(deliveries.deliveryDate, since)).orderBy(desc(deliveries.deliveryDate)),
    [since],
  );

  // Balances are all-time, not period-bound: what somebody owes does not reset each month.
  const { data: allDeliveries } = useLiveQuery(db.select().from(deliveries));
  const { data: allPayments } = useLiveQuery(db.select().from(customerPayments));
  const { data: allBills } = useLiveQuery(db.select().from(expenses));
  const { data: allSupplierPayments } = useLiveQuery(db.select().from(supplierPayments));

  const { data: earned } = useLiveQuery(
    db.select().from(incomeEntries).where(gte(incomeEntries.incomeDate, since)).orderBy(desc(incomeEntries.incomeDate)),
    [since],
  );

  const { data: settingsRows } = useLiveQuery(db.select().from(settings).where(eq(settings.id, 'default')));
  const currency = settingsRows?.[0]?.currency ?? 'KES';

  const { data: herd } = useLiveQuery(db.select().from(animals));
  const animalById = new Map((herd ?? []).map((animal) => [animal.id, animal]));

  const milkRows = milk ?? [];
  const spendRows = spend ?? [];
  const incomeRows = earned ?? [];

  // Two sources, kept separate on purpose: milk is computed from the milkings already recorded,
  // everything else is money the farmer entered. Merging them would invite double counting.
  const milkRevenue = totalRevenue(milkRows);
  const otherRevenue = incomeRows.reduce((sum, row) => sum + row.amount, 0);
  // Eggs, meat and live animals handed to a customer are the sale itself. Milk deliveries are
  // excluded here because the milking already counted them — see db/customers.ts.
  const soldOnCredit = deliveryRevenue(sold ?? []);
  const revenue = milkRevenue + otherRevenue + soldOnCredit;

  const owedBySelf = Math.max(
    0,
    (allBills ?? []).reduce((sum, bill) => sum + (bill.supplierId ? bill.amount : 0), 0) -
      (allSupplierPayments ?? []).reduce((sum, payment) => sum + payment.amount, 0),
  );

  const owed = (allDeliveries ?? []).length
    ? Math.max(0, totalDelivered(allDeliveries ?? []) - totalPaid(allPayments ?? []))
    : 0;
  const litres = totalLitres(milkRows);
  const spent = spendRows.reduce((sum, row) => sum + row.amount, 0);
  const profit = revenue - spent;

  const incomeByCategory = incomeRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.category] = (acc[row.category] ?? 0) + row.amount;
    return acc;
  }, {});
  const incomeCategories = Object.entries(incomeByCategory).sort((a, b) => b[1] - a[1]);

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
    <ScreenContainer fab={<Fab icon="add" label="Add" onPress={() => router.push('/money/new')} />}>
      <Animated.View entering={FadeInDown.duration(300)} className="gap-3 pt-4">
        <Text className="text-title font-sans-bold text-primary">Money</Text>
        <Segmented options={PERIODS} value={period} onChange={setPeriod} />
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(300).delay(60)}>
        <Surface level="raised" className="gap-4 p-4">
          <View className="flex-row">
            <View className="flex-1 gap-0.5">
              <Text className="text-label text-tertiary">Money in</Text>
              <Text className="text-headline font-sans-bold text-brand">{formatMoney(revenue, currency)}</Text>
              <Text className="text-label text-tertiary">
                {milkRevenue > 0 ? `${formatLitres(litres)} milk` : 'No milk recorded'}
              </Text>
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="text-label text-tertiary">Money out</Text>
              <Text className="text-headline font-sans-bold text-danger">{formatMoney(spent, currency)}</Text>
              <Text className="text-label text-tertiary">{spendRows.length} entries</Text>
            </View>
          </View>

          {revenue > 0 ? (
            <View className="gap-1 border-t border-line pt-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-callout text-secondary">Milk (from your milkings)</Text>
                <Text className="text-callout font-sans-medium text-primary">{formatMoney(milkRevenue, currency)}</Text>
              </View>
              {soldOnCredit > 0 ? (
                <View className="flex-row items-center justify-between">
                  <Text className="text-callout text-secondary">Sold to customers</Text>
                  <Text className="text-callout font-sans-medium text-primary">{formatMoney(soldOnCredit, currency)}</Text>
                </View>
              ) : null}
              {incomeCategories.map(([category, total]) => (
                <View key={category} className="flex-row items-center justify-between">
                  <Text className="text-callout text-secondary">
                    {INCOME_CATEGORY_META[category as IncomeCategory]?.label ?? category}
                  </Text>
                  <Text className="text-callout font-sans-medium text-primary">{formatMoney(total, currency)}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View className="border-t border-line pt-3">
            <Text className="text-label text-tertiary">{profit >= 0 ? 'Profit' : 'Loss'}</Text>
            <Text className={`text-metric font-sans-bold ${profit >= 0 ? 'text-brand' : 'text-danger'}`}>
              {formatMoney(profit, currency)}
            </Text>
            {revenue === 0 && spent === 0 ? (
              <Text className="text-label text-tertiary">
                Record what you sell and what you spend, and this will tell you where you stand.
              </Text>
            ) : null}
          </View>
        </Surface>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(300).delay(100)}>
        <PressableSurface
          onPress={() => router.push('/customers')}
          className="flex-row items-center gap-3 p-4"
        >
          <View className={`h-11 w-11 items-center justify-center rounded-pill ${owed > 0 ? 'bg-warn-soft' : 'bg-brand-soft'}`}>
            <Ionicons name="people" size={22} color={owed > 0 ? colors.warn : colors.brand} />
          </View>
          <View className="flex-1">
            <Text className="text-body font-sans-semibold text-primary">Customers</Text>
            <Text className="text-label text-tertiary">
              {owed > 0 ? `${formatMoney(owed, currency)} owed to you` : 'Nobody owes you anything'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.tertiary} />
        </PressableSurface>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(300).delay(110)}>
        <PressableSurface onPress={() => router.push('/suppliers')} className="flex-row items-center gap-3 p-4">
          <View className={`h-11 w-11 items-center justify-center rounded-pill ${owedBySelf > 0 ? 'bg-danger-soft' : 'bg-brand-soft'}`}>
            <Ionicons name="storefront" size={22} color={owedBySelf > 0 ? colors.danger : colors.brand} />
          </View>
          <View className="flex-1">
            <Text className="text-body font-sans-semibold text-primary">Who I owe</Text>
            <Text className="text-label text-tertiary">
              {owedBySelf > 0 ? `${formatMoney(owedBySelf, currency)} owing to suppliers` : 'You owe nobody'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.tertiary} />
        </PressableSurface>
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
                <Text className="text-body text-primary">{EXPENSE_CATEGORY_META[category as ExpenseCategory]?.label ?? category}</Text>
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
                    {EXPENSE_CATEGORY_META[row.category]?.label ?? row.category} · {formatDateForDisplay(row.expenseDate)}
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
