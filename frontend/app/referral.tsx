import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Surface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Callout } from '@/components/ui/Callout';
import { useColors } from '@/theme/colors';
import { useLicense } from '@/components/license/LicenseProvider';
import { updateSettings } from '@/db/reminders';
import { notifySaved } from '@/lib/haptics';

export default function ReferralScreen() {
  const colors = useColors();
  const { code: paramCode } = useLocalSearchParams<{ code?: string }>();
  const { refresh } = useLicense();

  const [code, setCode] = useState(paramCode ? String(paramCode).toUpperCase() : '');
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (paramCode && !appliedCode) {
      applyCode(String(paramCode).toUpperCase());
    }
  }, [paramCode]);

  async function applyCode(codeToApply: string) {
    const trimmed = codeToApply.trim().toUpperCase();
    if (!trimmed) {
      setError('Please enter a referral code.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await updateSettings({ agentCode: trimmed });
      await refresh();
      notifySaved();
      setAppliedCode(trimmed);
    } catch {
      setError('Could not apply referral code.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <Animated.View entering={FadeInDown.duration(280)} className="gap-2 pt-6 items-center">
        <View className="h-16 w-16 items-center justify-center rounded-pill bg-brand-soft">
          <Ionicons name="gift" size={32} color={colors.brand} />
        </View>
        <Text className="text-display font-sans-bold text-primary">
          {appliedCode ? 'Bonus Trial Unlocked!' : 'Referral Code'}
        </Text>
        <Text className="text-center text-body text-secondary px-4">
          {appliedCode
            ? `Your app is linked to agent ${appliedCode}. We’ve added +7 extra free days to your trial!`
            : 'Enter the code of the farmer or agent who introduced you to unlock +7 extra free trial days.'}
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(280).delay(100)} className="pt-6">
        {appliedCode ? (
          <Surface level="raised" className="gap-4 p-4 items-center">
            <View className="flex-row items-center gap-2">
              <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
              <Text className="text-headline font-sans-bold text-brand">Code: {appliedCode}</Text>
            </View>
            <Text className="text-callout text-center text-secondary">
              Everything in HerdCare is fully unlocked for you to manage your cattle, poultry, and milk records.
            </Text>
            <Button
              label="Go to My Farm"
              variant="primary"
              fullWidth
              onPress={() => router.replace('/' as any)}
            />
          </Surface>
        ) : (
          <Surface level="raised" className="gap-4 p-4">
            <TextField
              label="Agent or Farmer Referral Code"
              value={code}
              onChangeText={(t) => {
                setCode(t.toUpperCase());
                setError(null);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="e.g. KIP-492"
            />
            {error ? <Callout tone="warn">{error}</Callout> : null}
            <Button
              label={submitting ? 'Applying Code…' : 'Unlock +7 Free Days'}
              variant="primary"
              fullWidth
              loading={submitting}
              onPress={() => applyCode(code)}
            />
          </Surface>
        )}
      </Animated.View>
    </ScreenContainer>
  );
}
