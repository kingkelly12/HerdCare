import { Link, Stack } from 'expo-router';
import { View } from 'react-native';
import { EmptyState } from '@/components/ui/EmptyState';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View className="flex-1 items-center justify-center bg-ink-50">
        <EmptyState icon="alert-circle-outline" title="This screen doesn't exist" />
        <Link href="/" className="mt-4 text-lg font-semibold text-brand-600">
          Go to Home
        </Link>
      </View>
    </>
  );
}
