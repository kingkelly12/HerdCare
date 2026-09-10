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
import { supplierBalance } from '@/db/suppliers';
import { expenses, settings, supplierPayments, suppliers } from '@/db/schema';
import { useColors } from '@/theme/colors';
import { formatMoney } from '@/utils/money';

export default function SuppliersScreen() {
  const colors = useColors();

  const { data: rows } = useLiveQuery(db.select().from(suppliers).orderBy(suppliers.name));
  const { data: allBills } = useLiveQuery(db.select().from(expenses));
  const { data: allPayments } = useLiveQuery(db.select().from(supplierPayments));
  const { data: settingsRows } = useLiveQuery(db.select().from(settings).where(eq(settings.id, 'default')));
  const currency = settingsRows?.[0]?.currency ?? 'KES';

  const balances = (rows ?? []).map((supplier) => ({
    supplier,
    balance: supplierBalance(
      (allBills ?? []).filter((bill) => bill.supplierId === supplier.id),
      (allPayments ?? []).filter((payment) => payment.supplierId === supplier.id),
    ),
  }));

  const owedTotal = balances.reduce((sum, entry) => sum + Math.max(0, entry.balance), 0);

  return (
    <ScreenContainer scroll={false} fab={<Fab onPress={() => router.push('/suppliers/new')} label="Add" />}>
      {balances.length > 0 ? (
        <Animated.View entering={FadeInDown.duration(280)} className="pt-4">
          <Surface level="raised" className="gap-0.5 p-4">
            <Text className="text-label text-tertiary">You owe</Text>
            <Text className="text-metric font-sans-bold text-danger">{formatMoney(owedTotal, currency)}</Text>
            <Text className="text-label text-tertiary">
              Across {balances.filter((entry) => entry.balance > 0).length} of {balances.length} suppliers
            </Text>
          </Surface>
        </Animated.View>
      ) : null}

      <FlatList
        data={balances}
        keyExtractor={(entry) => entry.supplier.id}
        className="flex-1"
        contentContainerClassName="gap-2 pb-32 pt-3"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="storefront-outline"
            title="No suppliers yet"
            description="Add the agrovet or feed shop you buy from on credit, then tag purchases to them."
          />
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.duration(260).delay(Math.min(index, 8) * 35)}>
            <PressableSurface
              onPress={() => router.push(`/suppliers/${item.supplier.id}`)}
              className="flex-row items-center gap-3 p-3"
            >
              <View
                className={`h-11 w-11 items-center justify-center rounded-pill ${
                  item.balance > 0 ? 'bg-danger-soft' : 'bg-brand-soft'
                }`}
              >
                <Ionicons name="storefront" size={20} color={item.balance > 0 ? colors.danger : colors.brand} />
              </View>
              <View className="flex-1">
                <Text className="text-body font-sans-semibold text-primary">{item.supplier.name}</Text>
                <Text className="text-label text-tertiary">
                  {item.balance > 0 ? 'You owe' : item.balance < 0 ? 'In credit' : 'Settled up'}
                </Text>
              </View>
              <Text
                className={`text-body font-sans-semibold ${
                  item.balance > 0 ? 'text-danger' : item.balance < 0 ? 'text-brand' : 'text-tertiary'
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
