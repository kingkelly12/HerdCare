import { useEffect, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Surface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Callout } from '@/components/ui/Callout';
import { useLicense } from '@/components/license/LicenseProvider';
import { clearLicense } from '@/db/license';
import { isCloudConfigured } from '@/lib/api/client';
import { startPayment, waitForPayment } from '@/lib/api/payments';
import type { Plan } from '@/lib/license/token';
import { PLAN_LABELS } from '@/lib/license/token';
import {
  DEFAULT_PLAN,
  PLAN_PRICES,
  PRICE_CURRENCY,
  PURCHASABLE_PLANS,
  planDurationLabel,
  pricePerMonth,
} from '@/lib/license/pricing';
import { describeStatus } from '@/lib/license/status';
import { useColors } from '@/theme/colors';
import { formatDateForDisplay } from '@/utils/livestockRules';
import { formatMoney } from '@/utils/money';
import { notifySaved } from '@/lib/haptics';

/** Who to call when a code does not arrive. Shown to the farmer, so keep it a real number. */
const SUPPORT_PHONE = '+254700000000';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-4">
      <Text className="text-callout text-tertiary">{label}</Text>
      <Text className="flex-1 text-right text-callout font-sans-medium text-primary">{value}</Text>
    </View>
  );
}

export default function ActivateScreen() {
  const colors = useColors();
  // A code sent over WhatsApp opens `herdcare://activate?token=...`, which lands here with the
  // code already filled in. One tap beats typing two hundred characters in a cattle shed.
  const { token: linkedToken } = useLocalSearchParams<{ token?: string }>();
  const { status, loading, activate, refresh } = useLicense();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Paying is a separate kind of busy from activating a typed code: it can run for a minute
  // and the farmer needs to be told what their phone is about to do.
  const [paying, setPaying] = useState<Plan | null>(null);
  const [payNote, setPayNote] = useState<string | null>(null);
  const [payPhone, setPayPhone] = useState('');

  useEffect(() => {
    if (linkedToken) setCode(linkedToken);
  }, [linkedToken]);

  // A renewing farmer's number is already on their licence, so they should not retype it.
  useEffect(() => {
    if (status && 'payload' in status && !payPhone) setPayPhone(status.payload.acc);
  }, [status, payPhone]);

  async function handleActivate() {
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Enter the code your agent sent you.');
      return;
    }

    setBusy(true);
    setError(null);
    const result = await activate(trimmed);
    setBusy(false);

    if (!result.ok) {
      setError(result.reason);
      return;
    }

    notifySaved();
    router.replace('/');
  }


  /**
   * Pays for a plan with M-Pesa, end to end, without anybody's help.
   *
   * The farmer's own phone shows the PIN prompt; this screen waits for it. Deliberately the only
   * place in HerdCare that needs a network, because paying Safaricom cannot happen offline.
   */
  async function handlePay(plan: Plan) {
    const phone = payPhone.trim();
    if (phone.length < 9) {
      setError('Enter the M-Pesa number to pay from.');
      return;
    }

    setPaying(plan);
    setError(null);
    setPayNote('Starting the payment…');

    const started = await startPayment(phone, plan);
    if (!started.ok) {
      setPaying(null);
      setPayNote(null);
      setError(started.error);
      return;
    }

    setPayNote(started.data.message);

    const outcome = await waitForPayment(started.data.checkoutId, (seconds) => {
      setPayNote(`Waiting for your M-Pesa PIN… ${seconds}s`);
    });

    setPaying(null);
    setPayNote(null);

    if (outcome.outcome === 'paid') {
      notifySaved();
      // waitForPayment has already stored the new code, so the write lock is lifting as we leave.
      await refresh();
      Alert.alert('Paid', `Thank you. You are covered to ${formatDateForDisplay(outcome.expiresAt ?? null)}.`);
      router.replace('/');
      return;
    }

    if (outcome.outcome === 'failed') {
      setError(outcome.reason);
      return;
    }

    // A timeout is not a failure: Safaricom may still deliver the callback after we stop asking.
    setError('We did not hear back in time. If you entered your PIN, reopen this screen shortly.');
  }

  function confirmRemove() {
    Alert.alert(
      'Remove activation from this phone?',
      'Your herd records stay exactly where they are and you can still read and export them. You '
        + 'will need a code from your agent before you can log anything new again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await clearLicense();
            await refresh();
          },
        },
      ],
    );
  }

  // Falls back to the agent flow when the build has no server configured, so this screen still
  // makes sense in a version shipped before the backend went live.
  const canPayInApp = isCloudConfigured();
  const active = status?.state === 'active' || status?.state === 'grace';
  const payload = status && 'payload' in status ? status.payload : null;

  return (
    <ScreenContainer
      footer={
        <Button
          label={active ? 'Update subscription' : 'Activate HerdCare'}
          fullWidth
          loading={busy}
          disabled={loading}
          onPress={handleActivate}
        />
      }
    >
      <Animated.View entering={FadeInDown.duration(280)} className="items-center gap-2 pt-4">
        <View
          className={`h-16 w-16 items-center justify-center rounded-pill ${active ? 'bg-brand-soft' : 'bg-warn-soft'}`}
        >
          <Ionicons
            name={active ? 'shield-checkmark' : 'lock-closed'}
            size={30}
            color={active ? colors.brand : colors.warn}
          />
        </View>
        <Text className="text-title font-sans-bold text-primary">
          {active ? 'Subscription active' : status?.state === 'expired' ? 'Subscription ended' : 'Activate HerdCare'}
        </Text>
        <Text className="px-2 text-center text-callout text-secondary">
          {active
            ? 'Enter a new code here whenever you renew.'
            : status?.state === 'expired'
              ? 'Your records are all still here and you can still read and export them. Renew to start logging again.'
              : 'Enter the code from your HerdCare agent to start keeping your records.'}
        </Text>
      </Animated.View>

      {payload ? (
        <Animated.View entering={FadeInDown.duration(280).delay(60)}>
          <Surface level="raised" className="gap-3 p-4">
            <Row label="Farm" value={payload.farm || '—'} />
            <Row label="M-Pesa number" value={payload.acc} />
            <Row label="Plan" value={PLAN_LABELS[payload.plan]} />
            <Row label="Paid up to" value={formatDateForDisplay(payload.exp)} />
            {payload.agent ? <Row label="Sold by" value={payload.agent} /> : null}
            <View className="border-t border-line pt-3">
              <Text
                className={`text-callout font-sans-semibold ${
                  status?.state === 'active' ? 'text-brand' : 'text-warn'
                }`}
              >
                {status ? describeStatus(status) : ''}
              </Text>
            </View>
          </Surface>
        </Animated.View>
      ) : null}

      <TextField
        label="Activation code"
        value={code}
        onChangeText={(next) => {
          setCode(next);
          setError(null);
        }}
        error={error ?? undefined}
        hint="Paste the code your agent sent you, or open their message link."
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        numberOfLines={3}
        className="min-h-[96px] py-3 text-footnote"
        placeholder="HC1...."
      />

      <Surface level="raised" className="gap-3 p-4">
        <Text className="text-body font-sans-semibold text-primary">What it costs</Text>

        <View className="gap-2">
          {PURCHASABLE_PLANS.map((plan) => {
            const highlighted = plan === DEFAULT_PLAN;
            return (
              <View
                key={plan}
                className={`flex-row items-center gap-3 rounded-field px-3 py-3 ${
                  highlighted ? 'bg-brand-soft' : 'bg-canvas'
                }`}
              >
                <View className="flex-1">
                  <Text className={`text-body font-sans-semibold ${highlighted ? 'text-brand' : 'text-primary'}`}>
                    {PLAN_LABELS[plan]}
                  </Text>
                  <Text className="text-label text-tertiary">
                    {planDurationLabel(plan)} · {formatMoney(pricePerMonth(plan), PRICE_CURRENCY)} a month
                  </Text>
                </View>
                <Text className={`text-callout font-sans-bold ${highlighted ? 'text-brand' : 'text-primary'}`}>
                  {formatMoney(PLAN_PRICES[plan], PRICE_CURRENCY)}
                </Text>
                {canPayInApp ? (
                  <View className="w-24">
                    <Button
                      label="Pay"
                      variant={highlighted ? 'primary' : 'secondary'}
                      fullWidth
                      loading={paying === plan}
                      disabled={paying !== null && paying !== plan}
                      onPress={() => handlePay(plan)}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {canPayInApp ? (
          <>
            <TextField
              label="Pay from this M-Pesa number"
              value={payPhone}
              onChangeText={(next) => {
                setPayPhone(next);
                setError(null);
              }}
              keyboardType="phone-pad"
              placeholder="0712345678"
              editable={paying === null}
            />
            {payNote ? <Callout tone="brand">{payNote}</Callout> : null}
            <Text className="text-label text-tertiary">
              Your phone will ask for your M-Pesa PIN. The app unlocks as soon as you have paid.
            </Text>
          </>
        ) : (
          <Text className="text-callout text-secondary">
            Send your M-Pesa payment to your HerdCare agent, then send them the confirmation
            message. They will send you a code back that unlocks the app on this phone.
          </Text>
        )}

        <Button
          label="Call HerdCare"
          variant="secondary"
          fullWidth
          disabled={paying !== null}
          onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => {})}
        />
      </Surface>

      {payload ? (
        <Button label="Remove activation from this phone" variant="ghost" fullWidth onPress={confirmRemove} />
      ) : null}

      <Text className="pb-2 text-center text-label text-tertiary">
        Your herd records stay on this phone whether or not the subscription is running, and you can
        export them at any time from Settings.
      </Text>
    </ScreenContainer>
  );
}
