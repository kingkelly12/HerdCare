import { Alert, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { desc, eq } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Surface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { db } from '@/db/client';
import { supplierBalance, totalBilled, totalSettled } from '@/db/suppliers';
import { expenses, settings, supplierPayments, suppliers } from '@/db/schema';
import { useColors } from '@/theme/colors';
import { formatDateForDisplay } from '@/utils/livestockRules';
import { formatMoney } from '@/utils/money';
import { EXPENSE_CATEGORY_META } from '@/utils/financeCategories';

export default function SupplierDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();

  const { data: rows, updatedAt } = useLiveQuery(db.select().from(suppliers).where(eq(suppliers.id, id)), [id]);
  const supplier = rows?.[0];

  const { data: bills } = useLiveQuery(
    db.select().from(expenses).where(eq(expenses.supplierId, id)).orderBy(desc(expenses.expenseDate)),
    [id],
  );
  const { data: paid } = useLiveQuery(
    db
      .select()
      .from(supplierPayments)
      .where(eq(supplierPayments.supplierId, id))
      .orderBy(desc(supplierPayments.paymentDate)),
    [id],
  );
  const { data: settingsRows } = useLiveQuery(db.select().from(settings).where(eq(settings.id, 'default')));
  const currency = settingsRows?.[0]?.currency ?? 'KES';

  // Still resolving — useLiveQuery starts with an empty array, not undefined, so without
  // this check the not-found screen flashes for a frame on every navigation here, including
  // the instant after a new record is saved.
  if (!updatedAt) {
    return <ScreenContainer>{null}</ScreenContainer>;
  }

  if (!supplier) {
    return (
      <ScreenContainer>
        <EmptyState icon="storefront-outline" title="Supplier not found" />
      </ScreenContainer>
    );
  }

  const billRows = bills ?? [];
  const paymentRows = paid ?? [];
  const balance = supplierBalance(billRows, paymentRows);

  const ledger = [
    ...billRows.map((row) => ({
      key: `b-${row.id}`,
      date: row.expenseDate,
      title: row.description,
      subtitle: EXPENSE_CATEGORY_META[row.category]?.label ?? row.category,
      amount: row.amount,
      kind: 'bill' as const,
    })),
    ...paymentRows.map((row) => ({
      key: `p-${row.id}`,
      date: row.paymentDate,
      title: 'Payment made',
      subtitle: row.notes ?? '',
      amount: row.amount,
      kind: 'payment' as const,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  function confirmDelete() {
    Alert.alert(
      `Delete ${supplier?.name}?`,
      'Their payment record goes with them. Purchases stay on your books — the money was still spent — they just stop being tied to this supplier.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await db.delete(supplierPayments).where(eq(supplierPayments.supplierId, id));
            await db.update(expenses).set({ supplierId: null }).where(eq(expenses.supplierId, id));
            await db.delete(suppliers).where(eq(suppliers.id, id));
            router.dismissAll();
            router.replace('/suppliers');
          },
        },
      ],
    );
  }

  return (
    <ScreenContainer>
      <Animated.View entering={FadeInDown.duration(280)} className="items-center gap-1 pt-2">
        <View className="h-16 w-16 items-center justify-center rounded-pill bg-brand-soft">
          <Ionicons name="storefront" size={28} color={colors.brand} />
        </View>
        <Text className="text-title font-sans-bold text-primary">{supplier.name}</Text>
        {supplier.phone ? <Text className="text-callout text-secondary">{supplier.phone}</Text> : null}
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(280).delay(60)}>
        <Surface level="raised" className="gap-3 p-4">
          <View>
            <Text className="text-label text-tertiary">
              {balance > 0 ? 'You owe' : balance < 0 ? 'In credit' : 'Settled up'}
            </Text>
            <Text
              className={`text-metric font-sans-bold ${
                balance > 0 ? 'text-danger' : balance < 0 ? 'text-brand' : 'text-primary'
              }`}
            >
              {formatMoney(Math.abs(balance), currency)}
            </Text>
          </View>
          <View className="flex-row border-t border-line pt-3">
            <View className="flex-1">
              <Text className="text-callout font-sans-medium text-primary">{formatMoney(totalBilled(billRows), currency)}</Text>
              <Text className="text-label text-tertiary">Taken</Text>
            </View>
            <View className="flex-1">
              <Text className="text-callout font-sans-medium text-primary">
                {formatMoney(totalSettled(paymentRows), currency)}
              </Text>
              <Text className="text-label text-tertiary">Paid</Text>
            </View>
          </View>
        </Surface>
      </Animated.View>

      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button label="Record purchase" fullWidth onPress={() => router.push(`/expense/new?supplierId=${id}`)} />
        </View>
        <View className="flex-1">
          <Button label="Record payment" variant="secondary" fullWidth onPress={() => router.push(`/suppliers/${id}/pay`)} />
        </View>
      </View>

      <View className="gap-2">
        <Text className="text-headline font-sans-semibold text-primary">History</Text>
        {ledger.length === 0 ? (
          <Text className="text-callout text-tertiary">Nothing recorded yet.</Text>
        ) : (
          ledger.map((entry, index) => (
            <Animated.View key={entry.key} entering={FadeInDown.duration(240).delay(Math.min(index, 8) * 30)}>
              <Surface level="raised" className="flex-row items-center gap-3 p-3">
                <Ionicons
                  name={entry.kind === 'payment' ? 'cash-outline' : 'cart-outline'}
                  size={20}
                  color={entry.kind === 'payment' ? colors.brand : colors.secondary}
                />
                <View className="flex-1">
                  <Text className="text-body font-sans-medium text-primary">{entry.title}</Text>
                  <Text className="text-label text-tertiary">
                    {formatDateForDisplay(entry.date)}
                    {entry.subtitle ? ` · ${entry.subtitle}` : ''}
                  </Text>
                </View>
                <Text className={`text-callout font-sans-semibold ${entry.kind === 'payment' ? 'text-brand' : 'text-primary'}`}>
                  {entry.kind === 'payment' ? '−' : '+'}
                  {formatMoney(entry.amount, currency)}
                </Text>
              </Surface>
            </Animated.View>
          ))
        )}
      </View>

      <Button label="Delete supplier" variant="ghost" fullWidth onPress={confirmDelete} />
      <View className="h-8" />
    </ScreenContainer>
  );
}
