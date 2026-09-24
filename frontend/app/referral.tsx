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
import { getSettings } from '@/db/reminders';
import { notifySaved } from '@/lib/haptics';
import { formatKenyanMobile, linkToAgent, normaliseKenyanMobile, type SyncOutcome } from '@/lib/referral';
import { REFERRAL_BONUS_LABEL } from '@/lib/license/status';

/**
 * "Who helped you set up HerdCare?"
 *
 * One short form, reachable from Settings or straight from the link an agent shares. It asks for
 * the three things the agent needs to find this farmer again, and nothing else. It works with no
 * signal: the link is saved on the phone immediately and sent when there is a connection.
 */
export default function ReferralScreen() {
  const colors = useColors();
  const { code: paramCode } = useLocalSearchParams<{ code?: string }>();
  const { refresh } = useLicense();

  const [code, setCode] = useState(paramCode ? String(paramCode).toUpperCase() : '');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<SyncOutcome | null>(null);

  // Fill in whatever this phone already knows, so correcting one field is one edit, not three.
  useEffect(() => {
    getSettings()
      .then((prefs) => {
        if (!paramCode && prefs?.agentCode) setCode(prefs.agentCode);
        if (prefs?.farmerPhone) setPhone(formatKenyanMobile(prefs.farmerPhone));
        if (prefs?.farmerName) setName(prefs.farmerName);
      })
      .catch(() => {});
  }, [paramCode]);

  async function handleSave() {
    if (!code.trim()) {
      setOutcome({ state: 'rejected', message: 'Enter the code your agent gave you.' });
      return;
    }
    if (!normaliseKenyanMobile(phone)) {
      setPhoneError('Enter your M-Pesa number, for example 0712 345 678.');
      return;
    }
    setSubmitting(true);
    setOutcome(null);
    try {
      const result = await linkToAgent({ code, phone, name });
      await refresh();
      if (result.state !== 'rejected' && result.state !== 'unknown-agent') notifySaved();
      setOutcome(result);
    } catch {
      setOutcome({ state: 'rejected', message: 'Could not save that. Try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  const done = outcome?.state === 'sent' || outcome?.state === 'waiting' || outcome?.state === 'idle';

  return (
    <ScreenContainer>
      <Animated.View entering={FadeInDown.duration(280)} className="items-center gap-2 pt-6">
        <View className="h-16 w-16 items-center justify-center rounded-pill bg-brand-soft">
          <Ionicons name={done ? 'checkmark-circle' : 'people'} size={32} color={colors.brand} />
        </View>
        <Text className="text-center text-title font-sans-bold text-primary">
          {done ? 'You are linked' : 'Who helped you set up HerdCare?'}
        </Text>
        <Text className="px-4 text-center text-body text-secondary">
          {outcome?.state === 'sent'
            ? `${outcome.agentName} can now see when your free trial ends, and will help you when it does. We added ${REFERRAL_BONUS_LABEL} to your free trial.`
            : outcome?.state === 'waiting' || outcome?.state === 'idle'
              ? `Saved on your phone, with ${REFERRAL_BONUS_LABEL} free. Your agent will see you the next time you have internet.`
              : `Enter your agent's code so they can help you when your free trial ends. You also get ${REFERRAL_BONUS_LABEL} free.`}
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(280).delay(80)} className="pt-6">
        {done ? (
          <Button label="Done" fullWidth onPress={() => (router.canGoBack() ? router.back() : router.replace('/' as any))} />
        ) : (
          <Surface level="raised" className="gap-4 p-4">
            <TextField
              label="Agent code"
              value={code}
              onChangeText={(text) => {
                setCode(text.toUpperCase());
                setOutcome(null);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="e.g. KIP-492"
            />
            <TextField
              label="Your M-Pesa number"
              value={phone}
              onChangeText={(text) => {
                setPhone(text);
                setPhoneError(null);
              }}
              keyboardType="phone-pad"
              placeholder="0712 345 678"
              error={phoneError ?? undefined}
              hint="So your agent knows who you are. It is also the number you will pay from."
            />
            <TextField
              label="Your name or farm name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              placeholder="e.g. Mary Wanjiku"
            />
            {outcome?.state === 'unknown-agent' || outcome?.state === 'rejected' ? (
              <Callout tone="warn">{outcome.message}</Callout>
            ) : null}
            <Button label="Link to my agent" fullWidth loading={submitting} onPress={handleSave} />
          </Surface>
        )}
      </Animated.View>
    </ScreenContainer>
  );
}
