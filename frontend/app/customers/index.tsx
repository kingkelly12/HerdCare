import { FlatList, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { eq } from 'drizzle-orm';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Surface, PressableSurface } from '@/components/ui/Surface';
import { Fab } from '@/components/ui/Fab';
import { EmptyState } from '@/components/ui/EmptyState';
import { db } from '@/db/client';
import { customerBalance } from '@/db/customers';
import { customerPayments, customers, deliveries, settings } from '@/db/schema';
import { useColors } from '@/theme/colors';
import { formatMoney } from '@/utils/money';

export default function CustomersScreen() {
  const colors = useColors();

  const { data: rows } = useLiveQuery(db.select().from(customers).orderBy(customers.name));
  // A farm has a handful of regulars, so one read of each table and a fold per customer is far
  // cheaper than a query per row.
  const { data: allDeliveries } = useLiveQuery(db.select().from(deliveries));
  const { data: allPayments } = useLiveQuery(db.select().from(customerPayments));
  const { data: settingsRows } = useLiveQuery(db.select().from(settings).where(eq(settings.id, 'default')));
  const currency = settingsRows?.[0]?.currency ?? 'KES';

  const balances = (rows ?? []).map((customer) => ({
    customer,
    balance: customerBalance(
      (allDeliveries ?? []).filter((d) => d.customerId === customer.id),
      (allPayments ?? []).filter((p) => p.customerId === customer.id),
    ),
  }));

  const owedTotal = balances.reduce((sum, entry) => sum + Math.max(0, entry.balance), 0);

  return (
    <ScreenContainer scroll={false} fab={<Fab onPress={() => router.push('/customers/new')} label="Add" />}>
      {balances.length > 0 ? (
        <Animated.View entering={FadeInDown.duration(280)} className="pt-4">
          <Surface level="raised" className="gap-0.5 p-4">
            <Text className="text-label text-tertiary">Owed to you</Text>
            <Text className="text-metric font-sans-bold text-warn">{formatMoney(owedTotal, currency)}</Text>
            <Text className="text-label text-tertiary">
              Across {balances.filter((entry) => entry.balance > 0).length} of {balances.length} customers
            </Text>
          </Surface>
        </Animated.View>
      ) : null}

      <FlatList
        data={balances}
        keyExtractor={(entry) => entry.customer.id}
        className="flex-1"
        contentContainerClassName="gap-2 pb-32 pt-3"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title="No customers yet"
            description="Add the neighbours and regulars who take milk, eggs or meat and pay later."
          />
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.duration(260).delay(Math.min(index, 8) * 35)}>
            <PressableSurface
              onPress={() => router.push(`/customers/${item.customer.id}`)}
              className="flex-row items-center gap-3 p-3"
            >
              <View
                className={`h-11 w-11 items-center justify-center rounded-pill ${
                  item.balance > 0 ? 'bg-warn-soft' : 'bg-brand-soft'
                }`}
              >
                <Ionicons name="person" size={20} color={item.balance > 0 ? colors.warn : colors.brand} />
              </View>
              <View className="flex-1">
                <Text className="text-body font-sans-semibold text-primary">{item.customer.name}</Text>
                <Text className="text-label text-tertiary">
                  {item.balance > 0 ? 'Owes you' : item.balance < 0 ? 'Paid ahead' : 'Settled up'}
                </Text>
              </View>
              <Text
                className={`text-body font-sans-semibold ${
                  item.balance > 0 ? 'text-warn' : item.balance < 0 ? 'text-brand' : 'text-tertiary'
                }`}
              >
                {formatMoney(Math.abs(item.balance), currency)}
              </Text>
            </PressableSurface>
          </Animated.View>
        )}
      />
    </ScreenContainer>
  );
}
