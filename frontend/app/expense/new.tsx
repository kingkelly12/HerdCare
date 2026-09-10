import { useLocalSearchParams } from 'expo-router';
import { FinanceEntryForm } from '@/components/money/FinanceEntryForm';

export default function NewExpenseScreen() {
  const { supplierId } = useLocalSearchParams<{ supplierId?: string }>();
  return <FinanceEntryForm direction="expense" supplierId={supplierId} />;
}
