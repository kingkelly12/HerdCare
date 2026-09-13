import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, Share, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Surface, PressableSurface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Callout } from '@/components/ui/Callout';
import { useColors } from '@/theme/colors';
import { formatMoney } from '@/utils/money';
import { notifySaved } from '@/lib/haptics';
import {
  getAdminAgents,
  settleAdminAgent,
  type AdminAgent,
} from '@/lib/api/agency';
import {
  getStoredAdminSession,
  saveAdminSession,
  clearAdminSession,
} from '@/lib/agencyStorage';

export default function AdminScreen() {
  const colors = useColors();

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<{ token: string } | null>(null);

  // Login form state
  const [inputToken, setInputToken] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authenticating, setAuthenticating] = useState(false);

  // Dashboard data
  const [agents, setAgents] = useState<AdminAgent[]>([]);
  const [currency, setCurrency] = useState('KES');
  const [settlingCode, setSettlingCode] = useState<string | null>(null);

  useEffect(() => {
    getStoredAdminSession().then((stored) => {
      setSession(stored);
      setLoading(false);
      if (stored) {
        loadDashboard(stored.token);
      }
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (session?.token) {
        loadDashboard(session.token);
      }
    }, [session?.token]),
  );

  async function loadDashboard(token: string) {
    const res = await getAdminAgents(token);
    if (res.ok) {
      setAgents(res.data.agents);
      setCurrency(res.data.currency || 'KES');
    }
  }

  async function handleSignIn() {
    const token = inputToken.trim();
    if (!token) {
      setAuthError('Enter the Admin Token.');
      return;
    }

    setAuthenticating(true);
    setAuthError(null);

    const check = await getAdminAgents(token);
    setAuthenticating(false);

    if (!check.ok) {
      setAuthError(check.error || 'Invalid Admin Token.');
      return;
    }

    notifySaved();
    const newSession = { token };
    await saveAdminSession(newSession);
    setSession(newSession);
    setAgents(check.data.agents);
    setCurrency(check.data.currency || 'KES');
  }

  function handleSignOut() {
    Alert.alert('Log out of Admin Desk?', '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await clearAdminSession();
          setSession(null);
          setAgents([]);
        },
      },
    ]);
  }

  async function handleSettle(agent: AdminAgent) {
    if (!session) return;
    Alert.alert(
      `Settle ${agent.name}?`,
      `This will mark ${formatMoney(agent.owed, currency)} as paid out to this agent on M-Pesa.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Settle',
          onPress: async () => {
            setSettlingCode(agent.code);
            const res = await settleAdminAgent(session.token, agent.code);
            setSettlingCode(null);

            if (!res.ok) {
              Alert.alert('Settlement failed', res.error);
              return;
            }

            notifySaved();
            Alert.alert('Settled', `Marked ${formatMoney(res.data.settled, currency)} as paid for ${agent.code}.`);
            loadDashboard(session.token);
          },
        },
      ],
    );
  }

  const totalOwed = agents.reduce((sum, a) => sum + (a.owed || 0), 0);
  const totalSettled = agents.reduce((sum, a) => sum + (a.settled || 0), 0);
  const totalFarms = agents.reduce((sum, a) => sum + (a.farms || 0), 0);

  if (loading) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center pt-20">
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </ScreenContainer>
    );
  }

  // --- SIGN IN VIEW ---
  if (!session) {
    return (
      <ScreenContainer>
        <Animated.View entering={FadeInDown.duration(300)} className="gap-2 pt-6">
          <View className="h-12 w-12 items-center justify-center rounded-pill bg-brand-soft">
            <Ionicons name="shield-checkmark" size={24} color={colors.brand} />
          </View>
          <Text className="text-display font-sans-bold text-primary">Admin Desk</Text>
          <Text className="text-body text-secondary">
            Owner and administrator control for managing agents, sales and commission payouts.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(300).delay(60)} className="gap-4 pt-4">
          <Surface level="raised" className="gap-3 p-4">
            <TextField
              label="Admin token"
              value={inputToken}
              onChangeText={(t) => {
                setInputToken(t);
                setAuthError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              placeholder="Paste your ADMIN_TOKEN"
            />

            {authError ? <Callout tone="warn">{authError}</Callout> : null}

            <Button
              label="Access Admin Desk"
              variant="primary"
              fullWidth
              loading={authenticating}
              onPress={handleSignIn}
            />
          </Surface>
        </Animated.View>
      </ScreenContainer>
    );
  }

  // --- DASHBOARD VIEW ---
  return (
    <ScreenContainer>
      <Animated.View entering={FadeInDown.duration(300)} className="gap-2 pt-6">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Ionicons name="shield-checkmark" size={20} color={colors.brand} />
            <Text className="text-headline font-sans-bold text-primary">Admin Desk</Text>
          </View>
          <PressableSurface level="flat" onPress={handleSignOut} className="px-2 py-1">
            <Text className="text-callout text-tertiary">Log out</Text>
          </PressableSurface>
        </View>
      </Animated.View>

      {/* Network Overview Card */}
      <Animated.View entering={FadeInDown.duration(300).delay(60)}>
        <Surface level="raised" className="p-4 gap-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-label text-tertiary">Total Commission Owed</Text>
              <Text className="text-metric font-sans-bold text-warn">
                {formatMoney(totalOwed, currency)}
              </Text>
            </View>
            <View className="w-px h-10 bg-line" />
            <View className="w-4" />
            <View className="flex-1">
              <Text className="text-label text-tertiary">Total Settled to Date</Text>
              <Text className="text-metric font-sans-bold text-primary">
                {formatMoney(totalSettled, currency)}
              </Text>
            </View>
          </View>

          <View className="pt-2 border-t border-line flex-row items-center justify-between">
            <Text className="text-callout text-secondary">
              <Text className="font-sans-bold text-primary">{agents.length}</Text> Agents ·{' '}
              <Text className="font-sans-bold text-primary">{totalFarms}</Text> Farms
            </Text>
            <View className="flex-row gap-2">
              <Button
                label="Master Portal"
                variant="secondary"
                onPress={() =>
                  router.push({
                    pathname: '/agent',
                    params: { asAgentCode: 'ALL', agentName: 'Master Network' },
                  } as any)
                }
              />
              <Button
                label="+ Register Agent"
                variant="primary"
                onPress={() => router.push('/admin/new-agent' as any)}
              />
            </View>
          </View>
        </Surface>
      </Animated.View>

      {/* Agent Roster */}
      <Animated.View entering={FadeInDown.duration(300).delay(120)} className="gap-3 pt-2">
        <Text className="text-headline font-sans-semibold text-primary">Field Agents</Text>

        {agents.length === 0 ? (
          <Surface level="raised" className="p-6 items-center gap-3">
            <Ionicons name="people-outline" size={36} color={colors.tertiary} />
            <Text className="text-body font-sans-medium text-primary">No agents registered yet</Text>
            <Button
              label="Register First Agent"
              variant="primary"
              onPress={() => router.push('/admin/new-agent' as any)}
            />
          </Surface>
        ) : (
          agents.map((agent) => {
            const hasOwed = agent.owed > 0;
            return (
              <Surface key={agent.code} level="raised" className="p-4 gap-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-body font-sans-bold text-primary">{agent.name}</Text>
                      <View className="rounded-pill bg-brand-soft px-2 py-0.5">
                        <Text className="text-caption font-sans-bold text-brand">{agent.code}</Text>
                      </View>
                    </View>
                    <Text className="text-label text-tertiary">
                      {agent.phone ? `${agent.phone} · ` : ''}
                      {agent.farms} {agent.farms === 1 ? 'farm' : 'farms'} onboarded
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-caption text-tertiary">Owed</Text>
                    <Text className={`text-headline font-sans-bold ${hasOwed ? 'text-warn' : 'text-primary'}`}>
                      {formatMoney(agent.owed, currency)}
                    </Text>
                  </View>
                </View>

                <View className="pt-2 border-t border-line flex-row items-center justify-between gap-2">
                  <PressableSurface
                    level="flat"
                    onPress={() =>
                      router.push({
                        pathname: '/agent',
                        params: { asAgentCode: agent.code, agentName: agent.name },
                      } as any)
                    }
                    className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-field bg-canvas"
                  >
                    <Ionicons name="eye-outline" size={16} color={colors.secondary} />
                    <Text className="text-label font-sans-medium text-primary">Inspect Portal</Text>
                  </PressableSurface>

                  {hasOwed ? (
                    <Button
                      label={`Settle ${formatMoney(agent.owed, currency)}`}
                      variant="secondary"
                      loading={settlingCode === agent.code}
                      onPress={() => handleSettle(agent)}
                    />
                  ) : (
                    <View className="flex-row items-center gap-1">
                      <Ionicons name="checkmark-circle" size={16} color={colors.brand} />
                      <Text className="text-label text-brand">All settled</Text>
                    </View>
                  )}
                </View>
              </Surface>
            );
          })
        )}
      </Animated.View>

      <View className="h-10" />
    </ScreenContainer>
  );
}
