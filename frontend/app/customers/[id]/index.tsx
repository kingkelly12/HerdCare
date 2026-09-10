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
import {
  PRODUCT_META,
  customerBalance,
  deliveryValue,
  formatQuantity,
  totalDelivered,
  totalPaid,
  unitPriceLabel,
} from '@/db/customers';
import { customerPayments, customers, deliveries, settings } from '@/db/schema';
import { useColors } from '@/theme/colors';
import { formatDateForDisplay } from '@/utils/livestockRules';
import { formatMoney } from '@/utils/money';

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();

  const { data: rows } = useLiveQuery(db.select().from(customers).where(eq(customers.id, id)), [id]);
  const customer = rows?.[0];

  const { data: given } = useLiveQuery(
    db.select().from(deliveries).where(eq(deliveries.customerId, id)).orderBy(desc(deliveries.deliveryDate)),
    [id],
  );
  const { data: paid } = useLiveQuery(
    db
      .select()
      .from(customerPayments)
      .where(eq(customerPayments.customerId, id))
      .orderBy(desc(customerPayments.paymentDate)),
    [id],
  );
  const { data: settingsRows } = useLiveQuery(db.select().from(settings).where(eq(settings.id, 'default')));
  const currency = settingsRows?.[0]?.currency ?? 'KES';

  if (!customer) {
    return (
      <ScreenContainer>
        <EmptyState icon="person-outline" title="Customer not found" />
      </ScreenContainer>
    );
  }

  const deliveryRows = given ?? [];
  const paymentRows = paid ?? [];
  const balance = customerBalance(deliveryRows, paymentRows);

  // Both kinds of entry on one timeline, so the farmer reads it the way a paper book reads.
  const ledger = [
    ...deliveryRows.map((row) => ({
      key: `d-${row.id}`,
      date: row.deliveryDate,
      title: `${PRODUCT_META[row.product].label} · ${formatQuantity(row)}`,
      subtitle: `${formatMoney(row.unitPrice, currency)} ${unitPriceLabel(row.product, row.unit === 'egg' ? 'egg' : 'tray')}`,
      amount: deliveryValue(row),
      kind: 'delivery' as const,
    })),
    ...paymentRows.map((row) => ({
      key: `p-${row.id}`,
      date: row.paymentDate,
      title: 'Payment received',
      subtitle: row.notes ?? '',
      amount: row.amount,
      kind: 'payment' as const,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  function confirmDelete() {
    Alert.alert(
      `Delete ${customer?.name}?`,
      'Their whole record of deliveries and payments goes with them. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await db.delete(deliveries).where(eq(deliveries.customerId, id));
            await db.delete(customerPayments).where(eq(customerPayments.customerId, id));
            await db.delete(customers).where(eq(customers.id, id));
            router.dismissAll();
            router.replace('/customers');
          },
        },
      ],
    );
  }

  return (
    <ScreenContainer>
      <Animated.View entering={FadeInDown.duration(280)} className="items-center gap-1 pt-2">
        <View className="h-16 w-16 items-center justify-center rounded-pill bg-brand-soft">
          <Ionicons name="person" size={28} color={colors.brand} />
        </View>
        <Text className="text-title font-sans-bold text-primary">{customer.name}</Text>
        {customer.phone ? <Text className="text-callout text-secondary">{customer.phone}</Text> : null}
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(280).delay(60)}>
        <Surface level="raised" className="gap-3 p-4">
          <View>
            <Text className="text-label text-tertiary">
              {balance > 0 ? 'Owes you' : balance < 0 ? 'Paid ahead' : 'Settled up'}
            </Text>
            <Text
              className={`text-metric font-sans-bold ${
                balance > 0 ? 'text-warn' : balance < 0 ? 'text-brand' : 'text-primary'
              }`}
            >
              {formatMoney(Math.abs(balance), currency)}
            </Text>
          </View>
          <View className="flex-row border-t border-line pt-3">
            <View className="flex-1">
              <Text className="text-callout font-sans-medium text-primary">
                {formatMoney(totalDelivered(deliveryRows), currency)}
              </Text>
              <Text className="text-label text-tertiary">Taken</Text>
            </View>
            <View className="flex-1">
              <Text className="text-callout font-sans-medium text-primary">
                {formatMoney(totalPaid(paymentRows), currency)}
              </Text>
              <Text className="text-label text-tertiary">Paid</Text>
            </View>
          </View>
        </Surface>
      </Animated.View>

      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button label="Record delivery" fullWidth onPress={() => router.push(`/customers/${id}/deliver`)} />
        </View>
        <View className="flex-1">
          <Button label="Record payment" variant="secondary" fullWidth onPress={() => router.push(`/customers/${id}/pay`)} />
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
                  name={entry.kind === 'payment' ? 'cash-outline' : 'cube-outline'}
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

      <Button label="Delete customer" variant="ghost" fullWidth onPress={confirmDelete} />
      <View className="h-8" />
    </ScreenContainer>
  );
}
