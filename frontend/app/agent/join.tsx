import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Surface, PressableSurface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Callout } from '@/components/ui/Callout';
import { useColors } from '@/theme/colors';
import { useLicense } from '@/components/license/LicenseProvider';
import { notifySaved } from '@/lib/haptics';
import { registerAgent } from '@/lib/api/agency';
import { PRICE_CURRENCY } from '@/lib/license/pricing';
import { formatMoney } from '@/utils/money';
import { DEFAULT_TERMS, earnedAtSigning, earnedEveryYearAfter } from '@/lib/agent/earnings';
import { getStoredAgentSession, saveAgentSession } from '@/lib/agencyStorage';

export default function JoinAgentScreen() {
  const colors = useColors();
  const { status } = useLicense();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingSession, setExistingSession] = useState<{ code: string; name?: string } | null>(null);

  // Check if user is already registered on this device
  useEffect(() => {
    getStoredAgentSession().then((sess) => {
      if (sess?.code) {
        setExistingSession({ code: sess.code, name: sess.name });
      }
    });
  }, []);

  // Autofill phone number if available from active license
  useEffect(() => {
    if (status && 'payload' in status && status.payload?.acc && !phone) {
      setPhone(status.payload.acc);
    }
  }, [status, phone]);

  async function handleRegister() {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      setError('Please enter your full name or farm name.');
      return;
    }
    if (!trimmedPhone) {
      setError('Please enter your M-Pesa phone number.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const res = await registerAgent({ name: trimmedName, phone: trimmedPhone });
    setSubmitting(false);

    if (!res.ok) {
      setError(res.error || 'Failed to register. Please check your internet connection.');
      return;
    }

    notifySaved();

    // Persist agent session locally
    await saveAgentSession({
      code: res.data.agent.code,
      apiKey: res.data.apiKey,
      name: res.data.agent.name,
    });

    Alert.alert(
      // Registration no longer signs an existing agent back in (that was an account-takeover
      // hole), so reaching here always means a brand-new agent code.
      'Agent Code Created!',
      `Your personal Agent Code is ${res.data.agent.code}.\n\nShare this code with fellow farmers when they subscribe. Let’s head to your Agent Portal.`,
      [
        {
          text: 'Open Agent Portal',
          onPress: () => {
            router.replace('/agent' as any);
          },
        },
      ],
    );
  }

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Hero Section */}
        <Animated.View entering={FadeInDown.duration(280)} className="gap-2 pt-4">
          <View className="h-14 w-14 items-center justify-center rounded-pill bg-brand-soft">
            <Ionicons name="people" size={28} color={colors.brand} />
          </View>
          <Text className="text-display font-sans-bold text-primary">Earn with HerdCare</Text>
          <Text className="text-body text-secondary">
            {formatMoney(earnedAtSigning('quarterly'), PRICE_CURRENCY)} reaches your M-Pesa the week
            you sign a farmer, then{' '}
            {formatMoney(earnedEveryYearAfter('quarterly'), PRICE_CURRENCY)} a year from that same
            farm for as long as they keep farming. Your {Math.round(DEFAULT_TERMS.commissionRate * 100)}%
            share never expires.
          </Text>
        </Animated.View>

        {/* Before the form, because somebody weighing this up needs the arithmetic, not a pitch. */}
        <PressableSurface
          onPress={() => router.push('/agent/earnings')}
          className="flex-row items-center gap-3 p-4"
        >
          <View className="h-11 w-11 items-center justify-center rounded-pill bg-brand-soft">
            <Ionicons name="pie-chart" size={22} color={colors.brand} />
          </View>
          <View className="flex-1">
            <Text className="text-body font-sans-semibold text-primary">See exactly what you earn</Text>
            <Text className="text-label text-tertiary">
              Every figure, and what a book of farms builds to
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.tertiary} />
        </PressableSurface>

        {/* Existing Agent Banner */}
        {existingSession ? (
          <Animated.View entering={FadeInDown.duration(280).delay(50)} className="pt-4">
            <Surface level="raised" className="gap-3 p-4 border border-brand">
              <View className="flex-row items-center gap-2">
                <Ionicons name="checkmark-circle" size={20} color={colors.brand} />
                <Text className="text-callout font-sans-bold text-primary">You are already a registered Agent!</Text>
              </View>
              <Text className="text-callout text-secondary">
                Your Agent Code is <Text className="font-sans-bold text-brand">{existingSession.code}</Text>.
              </Text>
              <Button
                label="Go to My Agent Portal"
                variant="primary"
                fullWidth
                onPress={() => router.replace('/agent' as any)}
              />
            </Surface>
          </Animated.View>
        ) : null}

        {/* Value Proposition Highlights */}
        <Animated.View entering={FadeInDown.duration(280).delay(100)} className="gap-3 pt-6">
          <Text className="text-headline font-sans-semibold text-primary">Why Join?</Text>

          <Surface level="raised" className="gap-4 p-4">
            <View className="flex-row items-start gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-pill bg-brand-soft">
                <Ionicons name="cash-outline" size={22} color={colors.brand} />
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-callout font-sans-semibold text-primary">
                  {Math.round(DEFAULT_TERMS.commissionRate * 100)}% of every payment, forever
                </Text>
                <Text className="text-label text-secondary">
                  {formatMoney(earnedEveryYearAfter('quarterly'), PRICE_CURRENCY)} a year from each
                  farm on the quarterly plan, paid straight to your M-Pesa every time they renew.
                  There is no cut-off date on your share.
                </Text>
              </View>
            </View>

            <View className="h-px bg-line" />

            <View className="flex-row items-start gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-pill bg-brand-soft">
                <Ionicons name="gift-outline" size={22} color={colors.brand} />
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-callout font-sans-semibold text-primary">
                  {formatMoney(DEFAULT_TERMS.activationBounty, PRICE_CURRENCY)} activation bounty
                </Text>
                <Text className="text-label text-secondary">
                  {formatMoney(DEFAULT_TERMS.activationBounty, PRICE_CURRENCY)} on each farm's first
                  paid subscription, on top of the commission. On quarterly and annual it lands
                  immediately.
                </Text>
              </View>
            </View>

            <View className="h-px bg-line" />

            <View className="flex-row items-start gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-pill bg-brand-soft">
                <Ionicons name="shield-checkmark-outline" size={22} color={colors.brand} />
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-callout font-sans-semibold text-primary">Make HerdCare Free for You</Text>
                <Text className="text-label text-secondary">
                  Just 5 to 10 referred farmers completely covers your own farm’s subscription, turning your software into
                  a profit center.
                </Text>
              </View>
            </View>
          </Surface>
        </Animated.View>

        {/* 3 Simple Steps */}
        <Animated.View entering={FadeInDown.duration(280).delay(150)} className="gap-3 pt-6">
          <Text className="text-headline font-sans-semibold text-primary">How It Works</Text>
          <Surface level="raised" className="gap-3 p-4">
            <View className="flex-row items-center gap-3">
              <View className="h-7 w-7 items-center justify-center rounded-pill bg-brand">
                <Text className="text-caption font-sans-bold text-white">1</Text>
              </View>
              <Text className="flex-1 text-callout text-secondary">
                <Text className="font-sans-semibold text-primary">Get Your Code:</Text> Fill in your name and M-Pesa
                number below.
              </Text>
            </View>
            <View className="flex-row items-center gap-3">
              <View className="h-7 w-7 items-center justify-center rounded-pill bg-brand">
                <Text className="text-caption font-sans-bold text-white">2</Text>
              </View>
              <Text className="flex-1 text-callout text-secondary">
                <Text className="font-sans-semibold text-primary">Share With Neighbors:</Text> They enter your code on
                their activation screen.
              </Text>
            </View>
            <View className="flex-row items-center gap-3">
              <View className="h-7 w-7 items-center justify-center rounded-pill bg-brand">
                <Text className="text-caption font-sans-bold text-white">3</Text>
              </View>
              <Text className="flex-1 text-callout text-secondary">
                <Text className="font-sans-semibold text-primary">Track & Earn:</Text> Monitor your active farms and
                payouts in the in-app Agent Portal.
              </Text>
            </View>
          </Surface>
        </Animated.View>

        {/* Instant Self-Serve Registration Form */}
        <Animated.View entering={FadeInDown.duration(280).delay(200)} className="gap-3 pt-6">
          <Text className="text-headline font-sans-semibold text-primary">Instant Registration</Text>

          <Surface level="raised" className="gap-4 p-4">
            <TextField
              label="Full Name or Farm Name"
              value={name}
              onChangeText={(t) => {
                setName(t);
                setError(null);
              }}
              placeholder="e.g. John Kimani"
              editable={!submitting}
            />

            <TextField
              label="M-Pesa Phone Number"
              value={phone}
              onChangeText={(t) => {
                setPhone(t);
                setError(null);
              }}
              keyboardType="phone-pad"
              placeholder="0712345678"
              hint="Your commission and bounties will be paid to this number."
              editable={!submitting}
            />

            {error ? <Callout tone="warn">{error}</Callout> : null}

            <Button
              label={submitting ? 'Creating Your Code…' : 'Register & Get My Agent Code'}
              variant="primary"
              fullWidth
              loading={submitting}
              onPress={handleRegister}
            />
          </Surface>
        </Animated.View>
      </ScrollView>
    </ScreenContainer>
  );
}
