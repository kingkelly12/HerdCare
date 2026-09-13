import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, Share, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Surface, PressableSurface } from '@/components/ui/Surface';
import { DEFAULT_TERMS } from '@/lib/agent/earnings';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Callout } from '@/components/ui/Callout';
import { useColors } from '@/theme/colors';
import { formatMoney } from '@/utils/money';
import { formatDateForDisplay } from '@/utils/livestockRules';
import { notifySaved } from '@/lib/haptics';
import {
  getAgentMe,
  getAgentFarms,
  getAgentEarnings,
  getAdminAgents,
  type AgentSummary,
  type AgentFarm,
  type AgentEarning,
  type AdminAgent,
} from '@/lib/api/agency';
import {
  getStoredAgentSession,
  saveAgentSession,
  clearAgentSession,
  getStoredAdminSession,
} from '@/lib/agencyStorage';

export default function AgentScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{ asAgentCode?: string; agentName?: string }>();

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<{ code: string; apiKey: string; name?: string } | null>(null);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminAgents, setAdminAgents] = useState<AdminAgent[]>([]);
  const [inspectingCode, setInspectingCode] = useState<string | null>(params.asAgentCode ?? null);
  const [inspectingName, setInspectingName] = useState<string | null>(params.agentName ?? null);
  const [showAgentPicker, setShowAgentPicker] = useState(false);

  // Login form state
  const [inputCode, setInputCode] = useState('');
  const [inputKey, setInputKey] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authenticating, setAuthenticating] = useState(false);

  // Dashboard data
  const [summary, setSummary] = useState<AgentSummary | null>(null);
  const [farms, setFarms] = useState<AgentFarm[]>([]);
  const [earnings, setEarnings] = useState<AgentEarning[]>([]);
  const [tab, setTab] = useState<'farms' | 'earnings'>('farms');
  const [refreshing, setRefreshing] = useState(false);

  // Load stored sessions on start
  useEffect(() => {
    Promise.all([getStoredAgentSession(), getStoredAdminSession()]).then(([storedAgent, storedAdmin]) => {
      setSession(storedAgent);
      if (storedAdmin) {
        setAdminToken(storedAdmin.token);
        getAdminAgents(storedAdmin.token).then((res) => {
          if (res.ok) setAdminAgents(res.data.agents);
        });
      }
      setLoading(false);

      if (params.asAgentCode && storedAdmin?.token) {
        setInspectingCode(params.asAgentCode);
        setInspectingName(params.agentName ?? (params.asAgentCode === 'ALL' ? 'Master Network' : params.asAgentCode));
        loadDashboard(storedAdmin.token, params.asAgentCode);
      } else if (storedAgent) {
        loadDashboard(storedAgent.apiKey);
      }
    });
  }, [params.asAgentCode, params.agentName]);

  useFocusEffect(
    useCallback(() => {
      if (inspectingCode && adminToken) {
        loadDashboard(adminToken, inspectingCode);
      } else if (session) {
        loadDashboard(session.apiKey);
      }
    }, [inspectingCode, adminToken, session?.apiKey]),
  );

  async function loadDashboard(token: string, code?: string) {
    setRefreshing(true);
    const [meRes, farmsRes, earningsRes] = await Promise.all([
      getAgentMe(token, code),
      getAgentFarms(token, code),
      getAgentEarnings(token, code),
    ]);
    setRefreshing(false);

    if (meRes.ok) {
      setSummary(meRes.data);
    }
    if (farmsRes.ok) {
      setFarms(farmsRes.data.farms);
    }
    if (earningsRes.ok) {
      setEarnings(earningsRes.data.earnings);
    }
  }

  async function handleSignIn() {
    const code = inputCode.trim().toUpperCase();
    const key = inputKey.trim();

    if (!code || !key) {
      setAuthError('Enter both your Agent Code and Secret Key.');
      return;
    }

    setAuthenticating(true);
    setAuthError(null);

    const check = await getAgentMe(key);
    setAuthenticating(false);

    if (!check.ok) {
      setAuthError(check.error || 'Could not verify your agent key. Please check with HerdCare.');
      return;
    }

    notifySaved();
    const newSession = { code, apiKey: key, name: check.data.agent.name };
    await saveAgentSession(newSession);
    setSession(newSession);
    setSummary(check.data);
    loadDashboard(key);
  }

  function handleSignOut() {
    Alert.alert('Sign Out of Agent Mode?', 'You can sign back in at any time with your Agent Key.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await clearAgentSession();
          setSession(null);
          setSummary(null);
          setFarms([]);
          setEarnings([]);
        },
      },
    ]);
  }

  function handleExitInspection() {
    setInspectingCode(null);
    setInspectingName(null);
    setSummary(null);
    setFarms([]);
    setEarnings([]);
    if (session) {
      loadDashboard(session.apiKey);
    }
  }

  function shareReferralCode() {
    const codeToShare = inspectingCode ?? session?.code;
    if (!codeToShare) return;
    const msg =
      codeToShare === 'ALL'
        ? 'Karibu HerdCare! Download the app for complete cattle and poultry records offline: https://herdcare.app/apk'
        : `Karibu HerdCare! Download the app for complete cattle and poultry records offline: https://herdcare.app/apk\n\nWhen setting up the app, enter my referral code: ${codeToShare} to unlock +7 EXTRA DAYS of free trial!\nOr tap here once installed: herdcare://referral?code=${codeToShare}`;
    Share.share({ message: msg }).catch(() => {});
  }

  function sendWhatsAppReminder(farm: AgentFarm) {
    const cleanPhone = farm.phone.replace(/[^0-9]/g, '');
    const message = `Habari ${farm.name || 'Mkulima'}! Your HerdCare subscription expires in ${farm.daysLeft} days (${formatDateForDisplay(farm.expiresAt)}). Renew directly via M-Pesa inside the app to keep your records running!`;
    const url = `whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Cannot open WhatsApp', `Could not open WhatsApp for ${cleanPhone}.`);
    });
  }

  if (loading) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center pt-20">
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </ScreenContainer>
    );
  }

  const isViewing = Boolean(session || inspectingCode);

  // --- SIGN IN VIEW (Shown if not logged in as agent and not inspecting) ---
  if (!isViewing) {
    return (
      <ScreenContainer>
        <Animated.View entering={FadeInDown.duration(300)} className="gap-2 pt-6">
          <View className="h-12 w-12 items-center justify-center rounded-pill bg-brand-soft">
            <Ionicons name="briefcase" size={24} color={colors.brand} />
          </View>
          <Text className="text-display font-sans-bold text-primary">Agent Portal</Text>
          <Text className="text-body text-secondary">
            Sign in to track your registered farmers, commissions, and renewal reminders.
          </Text>
        </Animated.View>

        {/* Reachable before signing in too: somebody deciding whether to bother needs the numbers
            more than somebody already earning from them. */}
        <PressableSurface
          onPress={() => router.push('/agent/earnings')}
          className="flex-row items-center gap-3 p-4"
        >
          <View className="h-11 w-11 items-center justify-center rounded-pill bg-brand-soft">
            <Ionicons name="pie-chart" size={22} color={colors.brand} />
          </View>
          <View className="flex-1">
            <Text className="text-body font-sans-semibold text-primary">What you earn</Text>
            <Text className="text-label text-tertiary">
              Your {Math.round(DEFAULT_TERMS.commissionRate * 100)}% share, what a farm is worth, and
              what a book builds to
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.tertiary} />
        </PressableSurface>

        {adminToken ? (
          <Animated.View entering={FadeInDown.duration(300).delay(40)} className="gap-3 pt-4">
            <Surface level="raised" className="gap-3 p-4 border border-brand">
              <View className="flex-row items-center gap-2">
                <View className="h-7 w-7 rounded-pill bg-brand-soft items-center justify-center">
                  <Ionicons name="shield-checkmark" size={16} color={colors.brand} />
                </View>
                <Text className="text-headline font-sans-bold text-primary">Admin Access Detected</Text>
              </View>
              <Text className="text-callout text-secondary">
                You are signed in as Admin. You can inspect any agent's live portal or view the nationwide Master Portal.
              </Text>

              <View className="gap-2 pt-1">
                <Button
                  label="Open Master Network View"
                  variant="primary"
                  fullWidth
                  onPress={() => {
                    setInspectingCode('ALL');
                    setInspectingName('Master Network');
                    loadDashboard(adminToken, 'ALL');
                  }}
                />
                <Button
                  label={showAgentPicker ? 'Hide Agents' : 'Inspect Specific Agent...'}
                  variant="secondary"
                  fullWidth
                  onPress={() => setShowAgentPicker(!showAgentPicker)}
                />
              </View>

              {showAgentPicker ? (
                <View className="gap-2 pt-2 border-t border-line">
                  <Text className="text-label font-sans-semibold text-tertiary">Select an agent to inspect:</Text>
                  {adminAgents.length === 0 ? (
                    <Text className="text-label text-tertiary italic">No agents registered yet.</Text>
                  ) : (
                    adminAgents.map((ag) => (
                      <PressableSurface
                        key={ag.code}
                        level="flat"
                        onPress={() => {
                          setInspectingCode(ag.code);
                          setInspectingName(ag.name);
                          setShowAgentPicker(false);
                          loadDashboard(adminToken, ag.code);
                        }}
                        className="p-3 rounded-field bg-canvas flex-row items-center justify-between"
                      >
                        <View>
                          <Text className="text-body font-sans-semibold text-primary">{ag.name}</Text>
                          <Text className="text-label text-tertiary">
                            {ag.code} · {ag.farms} {ag.farms === 1 ? 'farm' : 'farms'}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.tertiary} />
                      </PressableSurface>
                    ))
                  )}
                </View>
              ) : null}
            </Surface>

            <View className="items-center py-2">
              <Text className="text-caption text-tertiary font-sans-semibold">── OR SIGN IN AS A FIELD AGENT ──</Text>
            </View>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.duration(300).delay(60)} className="gap-4 pt-2">
          <Surface level="raised" className="gap-3 p-4">
            <TextField
              label="Agent code"
              value={inputCode}
              onChangeText={(t) => {
                setInputCode(t);
                setAuthError(null);
              }}
              autoCapitalize="characters"
              placeholder="e.g. AGT-001"
            />
            <TextField
              label="Secret key"
              value={inputKey}
              onChangeText={(t) => {
                setInputKey(t);
                setAuthError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              placeholder="Paste your agent key"
            />

            {authError ? <Callout tone="warn">{authError}</Callout> : null}

            <Button
              label="Sign In as Agent"
              variant="primary"
              fullWidth
              loading={authenticating}
              onPress={handleSignIn}
            />
          </Surface>

          <View className="items-center gap-2">
            <Text className="text-center text-label text-tertiary">
              Don't have an agent code yet? Farmers and agribusinesses can join our community agent program.
            </Text>
            <Button
              label="Join Agent Program"
              variant="secondary"
              fullWidth
              onPress={() => router.push('/agent/join' as any)}
            />
          </View>
        </Animated.View>
      </ScreenContainer>
    );
  }

  // --- DASHBOARD VIEW ---
  const displayCode = inspectingCode ?? session?.code ?? '';
  const displayName = inspectingName ?? summary?.agent.name ?? (displayCode === 'ALL' ? 'Master Network' : 'Agent');

  return (
    <ScreenContainer>
      {inspectingCode ? (
        <Animated.View entering={FadeInDown.duration(200)} className="pt-2">
          <View className="flex-row items-center justify-between px-3 py-2 rounded-field bg-warn-soft border border-warn">
            <View className="flex-row items-center gap-2 flex-1">
              <Ionicons name="shield-checkmark" size={18} color={colors.warn} />
              <Text className="text-label font-sans-bold text-warn" numberOfLines={1}>
                Admin Mode · {displayCode === 'ALL' ? 'Master Overview' : `${displayName} (${displayCode})`}
              </Text>
            </View>
            <PressableSurface level="flat" onPress={handleExitInspection} className="px-2 py-0.5">
              <Text className="text-label font-sans-bold text-warn underline">Exit</Text>
            </PressableSurface>
          </View>
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInDown.duration(300)} className="gap-2 pt-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <View className="rounded-pill bg-brand-soft px-3 py-1">
              <Text className="text-label font-sans-bold text-brand">{displayCode}</Text>
            </View>
            <Text className="text-headline font-sans-semibold text-primary">{displayName}</Text>
          </View>
          <PressableSurface
            level="flat"
            onPress={inspectingCode ? handleExitInspection : handleSignOut}
            className="px-2 py-1"
          >
            <Text className="text-callout text-tertiary">{inspectingCode ? 'Exit' : 'Sign Out'}</Text>
          </PressableSurface>
        </View>
      </Animated.View>

      {/* KPI Cards */}
      <Animated.View entering={FadeInDown.duration(300).delay(60)}>
        <Surface level="raised" className="p-4 gap-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-label text-tertiary">Unpaid Commission</Text>
              <Text className="text-metric font-sans-bold text-brand">
                {formatMoney(summary?.owed ?? 0, summary?.currency || 'KES')}
              </Text>
            </View>
            <View className="w-px h-10 bg-line" />
            <View className="w-4" />
            <View className="flex-1">
              <Text className="text-label text-tertiary">Total Settled</Text>
              <Text className="text-metric font-sans-bold text-primary">
                {formatMoney(summary?.settled ?? 0, summary?.currency || 'KES')}
              </Text>
            </View>
          </View>

          <View className="pt-2 border-t border-line flex-row items-center justify-between">
            <Text className="text-callout text-secondary">
              <Text className="font-sans-bold text-primary">{farms.length}</Text> Active Farmers Linked
            </Text>
            <Button
              label="Share App & Code"
              variant="secondary"
              onPress={shareReferralCode}
            />
          </View>
        </Surface>
      </Animated.View>

      {/* In-Person Sharing Tip */}
      <Animated.View entering={FadeInDown.duration(300).delay(90)}>
        <Surface level="raised" className="gap-2.5 p-4 border border-brand-soft">
          <View className="flex-row items-center gap-2">
            <Ionicons name="bluetooth" size={18} color={colors.brand} />
            <Text className="text-callout font-sans-bold text-primary">In-Person Sharing Tip (Xender / Bluetooth)</Text>
          </View>
          <Text className="text-callout text-secondary">
            Sending the app via Xender or Bluetooth? Take their phone for 10 seconds right after install:
          </Text>
          <View className="gap-1 pl-3 border-l-2 border-brand">
            <Text className="text-label text-primary">1. Open HerdCare → Settings</Text>
            <Text className="text-label text-primary">2. Tap "Referral Code (Optional)"</Text>
            <Text className="text-label text-primary">
              3. Enter your code: <Text className="font-sans-bold text-brand">{displayCode}</Text>
            </Text>
          </View>
          <Text className="text-label text-secondary">
            They instantly receive <Text className="font-sans-bold text-brand">+7 extra free trial days</Text>, and your {Math.round(DEFAULT_TERMS.commissionRate * 100)}% commission is permanently locked in.
          </Text>
        </Surface>
      </Animated.View>

      {/* Tab Switcher */}
      <Animated.View entering={FadeInDown.duration(300).delay(120)} className="flex-row gap-2 pt-2">
        <PressableSurface
          level="flat"
          onPress={() => setTab('farms')}
          className={`flex-1 items-center py-2.5 rounded-field ${tab === 'farms' ? 'bg-brand' : 'bg-surface'}`}
        >
          <Text className={`text-callout font-sans-semibold ${tab === 'farms' ? 'text-on-brand' : 'text-secondary'}`}>
            My Farmers ({farms.length})
          </Text>
        </PressableSurface>
        <PressableSurface
          level="flat"
          onPress={() => setTab('earnings')}
          className={`flex-1 items-center py-2.5 rounded-field ${tab === 'earnings' ? 'bg-brand' : 'bg-surface'}`}
        >
          <Text className={`text-callout font-sans-semibold ${tab === 'earnings' ? 'text-on-brand' : 'text-secondary'}`}>
            Earnings History
          </Text>
        </PressableSurface>
      </Animated.View>

      {/* Tab Content: Farmers List */}
      {tab === 'farms' ? (
        <Animated.View entering={FadeInDown.duration(300).delay(180)} className="gap-2">
          {farms.length === 0 ? (
            <Surface level="raised" className="p-6 items-center gap-2">
              <Ionicons name="people-outline" size={32} color={colors.tertiary} />
              <Text className="text-body font-sans-medium text-primary">No farmers linked yet</Text>
              <Text className="text-center text-label text-tertiary">
                When you onboard a farmer, have them enter your agent code ({displayCode || 'code'}) in Settings &gt; Activate.
              </Text>
            </Surface>
          ) : (
            farms.map((f, i) => {
              const late = f.daysLeft < 0;
              const urgent = f.daysLeft <= 7;
              return (
                <Surface key={f.phone + i} level="raised" className="p-4 gap-2">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="text-body font-sans-semibold text-primary">
                        {f.name || f.phone}
                      </Text>
                      <Text className="text-label text-tertiary">
                        {f.phone} · Plan: {f.plan}
                      </Text>
                    </View>
                    <View className={`px-2.5 py-1 rounded-pill ${late ? 'bg-danger-soft' : urgent ? 'bg-warn-soft' : 'bg-brand-soft'}`}>
                      <Text className={`text-label font-sans-bold ${late ? 'text-danger' : urgent ? 'text-warn' : 'text-brand'}`}>
                        {late ? 'Lapsed' : `${f.daysLeft}d left`}
                      </Text>
                    </View>
                  </View>

                  <View className="pt-2 border-t border-line flex-row items-center justify-between">
                    <Text className="text-label text-tertiary">
                      Expires: {formatDateForDisplay(f.expiresAt)}
                    </Text>
                    <PressableSurface
                      level="flat"
                      onPress={() => sendWhatsAppReminder(f)}
                      className="flex-row items-center gap-1 px-3 py-1.5 rounded-pill bg-brand-soft"
                    >
                      <Ionicons name="logo-whatsapp" size={16} color={colors.brand} />
                      <Text className="text-label font-sans-semibold text-brand">Nudge on WhatsApp</Text>
                    </PressableSurface>
                  </View>
                </Surface>
              );
            })
          )}
        </Animated.View>
      ) : (
        /* Tab Content: Earnings History */
        <Animated.View entering={FadeInDown.duration(300).delay(180)} className="gap-2">
          {earnings.length === 0 ? (
            <Surface level="raised" className="p-6 items-center gap-2">
              <Ionicons name="cash-outline" size={32} color={colors.tertiary} />
              <Text className="text-body font-sans-medium text-primary">No payments recorded yet</Text>
              <Text className="text-center text-label text-tertiary">
                Commissions will appear here in real time as your farmers renew their subscriptions.
              </Text>
            </Surface>
          ) : (
            earnings.map((e, idx) => (
              <Surface key={idx} level="raised" className="p-3.5 flex-row items-center justify-between">
                <View className="gap-0.5 flex-1">
                  <Text className="text-body font-sans-medium text-primary">{e.name || e.phone}</Text>
                  <Text className="text-label text-tertiary">
                    {formatDateForDisplay(e.paid_at)} · {e.plan} ({formatMoney(e.amount, 'KES')})
                  </Text>
                </View>
                <View className="items-end gap-0.5">
                  <Text className="text-body font-sans-bold text-brand">
                    +{formatMoney(e.commission + e.bounty, 'KES')}
                  </Text>
                  <Text className="text-label text-tertiary">
                    {e.settled_at ? 'Settled' : 'Pending payout'}
                  </Text>
                </View>
              </Surface>
            ))
          )}
        </Animated.View>
      )}

      <View className="h-10" />
    </ScreenContainer>
  );
}
