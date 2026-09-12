import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PressableSurface } from '@/components/ui/Surface';
import { LICENSE_BYPASSED, useLicense } from '@/components/license/LicenseProvider';
import { PLAN_LABELS } from '@/lib/license/token';
import { RENEWAL_NOTICE_DAYS, describeStatus } from '@/lib/license/status';
import { useColors } from '@/theme/colors';
import { formatDateForDisplay } from '@/utils/livestockRules';

/**
 * The farmer's way into the activation screen, and the one place that says out loud how long is
 * left. Renewal is a code an agent sends, so this has to be findable without being nagging.
 */
export function SubscriptionSection() {
  const colors = useColors();
  const { status, loading } = useLicense();

  if (loading || !status) {
    // Same rule as everywhere else in this app: say nothing until the answer is known, rather than
    // flashing a wrong one.
    return null;
  }

  const payload = 'payload' in status ? status.payload : null;
  // Only shout when there is genuinely something to do. A farmer three days into a free month
  // does not need a warning icon; one three days from the end does.
  const urgent =
    status.state === 'expired' ||
    status.state === 'trial-ended' ||
    status.state === 'unactivated' ||
    status.state === 'invalid' ||
    status.state === 'grace' ||
    (status.state === 'active' && status.daysLeft <= RENEWAL_NOTICE_DAYS) ||
    (status.state === 'trial' && status.daysLeft <= RENEWAL_NOTICE_DAYS);

  const title = payload
    ? PLAN_LABELS[payload.plan]
    : status.state === 'trial'
      ? 'Free month'
      : status.state === 'trial-ended'
        ? 'Free month ended'
        : 'Not activated';
  const subtitle = payload
    ? `${describeStatus(status)} · paid to ${formatDateForDisplay(payload.exp)}`
    : describeStatus(status);

  // Never let a development build look like a paid one. Seeing "unlocked" without knowing why is
  // how you ship a paywall that was never actually tested.
  if (LICENSE_BYPASSED) {
    return (
      <PressableSurface onPress={() => router.push('/activate')} className="flex-row items-center gap-3 p-4">
        <View className="h-11 w-11 items-center justify-center rounded-pill bg-earth-soft">
          <Ionicons name="construct" size={22} color={colors.earth} />
        </View>
        <View className="flex-1">
          <Text className="text-body font-sans-medium text-primary">Development build</Text>
          <Text className="text-label text-tertiary">
            The subscription is not enforced here. {payload ? `Licence on file: ${title}.` : 'No licence on file.'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.tertiary} />
      </PressableSurface>
    );
  }

  return (
    <PressableSurface onPress={() => router.push('/activate')} className="flex-row items-center gap-3 p-4">
      <View
        className={`h-11 w-11 items-center justify-center rounded-pill ${urgent ? 'bg-warn-soft' : 'bg-brand-soft'}`}
      >
        <Ionicons
          name={urgent ? 'alert-circle' : 'shield-checkmark'}
          size={22}
          color={urgent ? colors.warn : colors.brand}
        />
      </View>
      <View className="flex-1">
        <Text className="text-body font-sans-medium text-primary">{title}</Text>
        <Text className={`text-label ${urgent ? 'text-warn' : 'text-tertiary'}`}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.tertiary} />
    </PressableSurface>
  );
}
