import { useState } from 'react';
import { Alert, Linking, Share, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Surface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Callout } from '@/components/ui/Callout';
import { useColors } from '@/theme/colors';
import { notifySaved } from '@/lib/haptics';
import { createAdminAgent, type CreateAgentResult } from '@/lib/api/agency';
import { getStoredAdminSession } from '@/lib/agencyStorage';

export default function NewAgentScreen() {
  const colors = useColors();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [commissionRate, setCommissionRate] = useState('10');
  const [bounty, setBounty] = useState('750');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateAgentResult | null>(null);

  async function handleSubmit() {
    const trimmedName = name.trim();
    const trimmedCode = code.trim().toUpperCase();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      setError('Enter the agent or agrovet name.');
      return;
    }
    if (!trimmedCode) {
      setError('Choose an agent code (e.g. AGT-001).');
      return;
    }

    const session = await getStoredAdminSession();
    if (!session?.token) {
      setError('Admin session expired. Please sign in again from the Admin Desk.');
      return;
    }

    setBusy(true);
    setError(null);

    const rateNum = parseFloat(commissionRate) / 100 || 0.1;
    const bountyNum = parseFloat(bounty) || 750;

    const res = await createAdminAgent(session.token, {
      name: trimmedName,
      code: trimmedCode,
      phone: trimmedPhone || undefined,
      commissionRate: rateNum,
      activationBounty: bountyNum,
    });

    setBusy(false);

    if (!res.ok) {
      setError(res.error || 'Could not register agent.');
      return;
    }

    notifySaved();
    setCreated(res.data);
  }

  function shareCredentialsOnWhatsApp() {
    if (!created) return;
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const message = [
      `Karibu HerdCare, ${created.agent.name}!`,
      '',
      `You are registered as a HerdCare Field Agent.`,
      `Agent Code: ${created.agent.code}`,
      `Secret Key: ${created.apiKey}`,
      '',
      `To open your Agent Portal:`,
      `1. Open the HerdCare app on your phone.`,
      `2. Go to Settings > Agent Portal.`,
      `3. Sign in with your code and key to track your farmers and earnings!`,
    ].join('\n');

    if (cleanPhone) {
      const url = `whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;
      Linking.openURL(url).catch(() => {
        Share.share({ message }).catch(() => {});
      });
    } else {
      Share.share({ message }).catch(() => {});
    }
  }

  if (created) {
    return (
      <ScreenContainer>
        <Animated.View entering={FadeInDown.duration(300)} className="gap-4 pt-6">
          <View className="items-center gap-2">
            <View className="h-14 w-14 items-center justify-center rounded-pill bg-brand-soft">
              <Ionicons name="checkmark-circle" size={32} color={colors.brand} />
            </View>
            <Text className="text-title font-sans-bold text-primary">Agent Registered!</Text>
            <Text className="text-callout text-secondary text-center">
              {created.agent.name} is now an active field agent with code{' '}
              <Text className="font-sans-bold text-brand">{created.agent.code}</Text>.
            </Text>
          </View>

          <Surface level="raised" className="gap-3 p-4">
            <Text className="text-label text-tertiary">Agent Secret Key</Text>
            <View className="p-3 bg-canvas rounded-field border border-line">
              <Text className="text-body font-mono text-primary select-all">{created.apiKey}</Text>
            </View>
            <Text className="text-caption text-tertiary">
              This key is shown only once. Share it with the agent now so they can log into the in-app Agent Portal.
            </Text>

            <Button
              label="Share on WhatsApp"
              variant="primary"
              fullWidth
              onPress={shareCredentialsOnWhatsApp}
            />
            <Button
              label="Done"
              variant="secondary"
              fullWidth
              onPress={() => router.back()}
            />
          </Surface>
        </Animated.View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Animated.View entering={FadeInDown.duration(300)} className="gap-1 pt-6">
        <Text className="text-title font-sans-bold text-primary">Register New Agent</Text>
        <Text className="text-callout text-secondary">
          Field agents earn a 10% recurring commission on every subscription renewal plus an activation bounty.
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(300).delay(60)} className="gap-4 pt-4">
        <Surface level="raised" className="gap-3 p-4">
          <TextField
            label="Agent / Agrovet name"
            value={name}
            onChangeText={(t) => {
              setName(t);
              setError(null);
            }}
            placeholder="e.g. Eldoret Agrovet (John)"
          />

          <TextField
            label="Phone number (M-Pesa)"
            value={phone}
            onChangeText={(t) => {
              setPhone(t);
              setError(null);
            }}
            keyboardType="phone-pad"
            placeholder="0712345678"
            hint="For M-Pesa commission payouts."
          />

          <TextField
            label="Agent code"
            value={code}
            onChangeText={(t) => {
              setCode(t.toUpperCase());
              setError(null);
            }}
            autoCapitalize="characters"
            placeholder="e.g. AGT-001"
            hint="Farmers enter this code in the app to link to this agent."
          />

          <View className="flex-row gap-3">
            <View className="flex-1">
              <TextField
                label="Commission (%)"
                value={commissionRate}
                onChangeText={setCommissionRate}
                keyboardType="numeric"
                placeholder="10"
              />
            </View>
            <View className="flex-1">
              <TextField
                label="Bounty (KES)"
                value={bounty}
                onChangeText={setBounty}
                keyboardType="numeric"
                placeholder="750"
              />
            </View>
          </View>

          {error ? <Callout tone="warn">{error}</Callout> : null}

          <Button
            label="Register Agent"
            variant="primary"
            fullWidth
            loading={busy}
            onPress={handleSubmit}
          />
        </Surface>
      </Animated.View>
    </ScreenContainer>
  );
}
