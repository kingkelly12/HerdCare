import { Alert, Linking, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Surface, PressableSurface } from '@/components/ui/Surface';
import { useColors } from '@/theme/colors';
import { formatMoney } from '@/utils/money';
import { formatDateForDisplay } from '@/utils/livestockRules';
import { DEFAULT_TERMS } from '@/lib/agent/earnings';
import type { PipelineEvent, PipelineFarmer, PipelineStage } from '@/lib/api/agency';

/**
 * An agent's farmers, grouped by what the agent should do about them.
 *
 * Grouped by action rather than by status, because the question an agent opens this with is
 * "who do I need to see this week", not "what plan is everybody on".
 */

const GROUPS: { title: string; hint: string; stages: PipelineStage[] }[] = [
  {
    title: 'Follow up this month',
    hint: 'Free trials about to end, and payments due. This is where you earn.',
    stages: ['renewal-due', 'trial-ending'],
  },
  { title: 'On free trial', hint: 'Help them get their animals in. A full app is what sells itself.', stages: ['trial'] },
  { title: 'Paying', hint: 'Earning for you on every payment, with nothing to do.', stages: ['paying'] },
  { title: 'Not paying', hint: 'Trial ended or stopped paying. Worth a visit when you are nearby.', stages: ['trial-ended', 'lapsed'] },
];

function displayName(farmer: { name: string; phone: string }): string {
  return farmer.name.trim() || `0${farmer.phone.slice(3)}`;
}

function describe(farmer: PipelineFarmer): { line: string; badge: string; tone: 'brand' | 'warn' | 'muted' } {
  const days = farmer.daysLeft ?? 0;
  const inDays = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
  switch (farmer.stage) {
    case 'trial':
      return { line: `Free trial ends ${formatDateForDisplay(farmer.trialEndsOn!)}`, badge: `${days}d free`, tone: 'brand' };
    case 'trial-ending':
      return { line: `Free trial ends ${inDays}. Time to talk about a plan.`, badge: `${days}d left`, tone: 'warn' };
    case 'paying':
      return {
        line: `Paying · ${farmer.plan} · until ${formatDateForDisplay(farmer.paidUntil!)}`,
        badge: 'Paying',
        tone: 'brand',
      };
    case 'renewal-due':
      return {
        line: days >= 0 ? `Next payment due ${inDays}` : `Payment ${-days} day${days === -1 ? '' : 's'} late`,
        badge: days >= 0 ? 'Due' : 'Late',
        tone: 'warn',
      };
    case 'trial-ended':
      return { line: `Free trial ended ${formatDateForDisplay(farmer.trialEndsOn!)}, not paying yet`, badge: 'Ended', tone: 'muted' };
    case 'lapsed':
      return { line: `Stopped paying ${formatDateForDisplay(farmer.paidUntil!)}`, badge: 'Stopped', tone: 'muted' };
  }
}

function whatsAppMessage(farmer: PipelineFarmer): string {
  const hello = `Habari ${farmer.name.trim().split(/\s+/)[0] || 'Mkulima'}!`;
  switch (farmer.stage) {
    case 'trial':
    case 'trial-ending':
      return `${hello} Your free HerdCare trial ends on ${formatDateForDisplay(farmer.trialEndsOn!)}. Your records stay safe. To keep logging, subscribe by M-Pesa inside the app (Settings, then Subscription). I can help you choose a plan.`;
    case 'renewal-due':
    case 'paying':
      return `${hello} Your HerdCare subscription runs until ${formatDateForDisplay(farmer.paidUntil!)}. Renew by M-Pesa inside the app to keep your records running.`;
    default:
      return `${hello} Your HerdCare records are all still there. Subscribe by M-Pesa inside the app to start logging again. I can help.`;
  }
}

function FarmerCard({ farmer, currency }: { farmer: PipelineFarmer; currency: string }) {
  const colors = useColors();
  const { line, badge, tone } = describe(farmer);
  const badgeClass = tone === 'warn' ? 'bg-warn-soft' : tone === 'brand' ? 'bg-brand-soft' : 'bg-surface';
  const badgeText = tone === 'warn' ? 'text-warn' : tone === 'brand' ? 'text-brand' : 'text-tertiary';
  const local = `0${farmer.phone.slice(3)}`;

  function openWhatsApp() {
    const url = `whatsapp://send?phone=${farmer.phone}&text=${encodeURIComponent(whatsAppMessage(farmer))}`;
    Linking.openURL(url).catch(() => Alert.alert('Cannot open WhatsApp', `Call ${local} instead.`));
  }

  return (
    <Surface level="raised" className="gap-2 p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-body font-sans-semibold text-primary">{displayName(farmer)}</Text>
          <Text className="text-label text-secondary">{line}</Text>
          {farmer.earned > 0 ? (
            <Text className="text-label font-sans-semibold text-brand">
              You have earned {formatMoney(farmer.earned, currency)} from this farm
            </Text>
          ) : null}
        </View>
        <View className={`rounded-pill px-2.5 py-1 ${badgeClass}`}>
          <Text className={`text-label font-sans-bold ${badgeText}`}>{badge}</Text>
        </View>
      </View>
      <View className="flex-row gap-2 border-t border-line pt-2">
        <PressableSurface
          level="flat"
          onPress={() => Linking.openURL(`tel:${local}`).catch(() => {})}
          className="flex-row items-center gap-1 rounded-pill bg-brand-soft px-3 py-1.5"
        >
          <Ionicons name="call" size={15} color={colors.brand} />
          <Text className="text-label font-sans-semibold text-brand">Call</Text>
        </PressableSurface>
        <PressableSurface
          level="flat"
          onPress={openWhatsApp}
          className="flex-row items-center gap-1 rounded-pill bg-brand-soft px-3 py-1.5"
        >
          <Ionicons name="logo-whatsapp" size={15} color={colors.brand} />
          <Text className="text-label font-sans-semibold text-brand">WhatsApp</Text>
        </PressableSurface>
      </View>
    </Surface>
  );
}

export function PipelineList({ farmers, currency, agentCode }: { farmers: PipelineFarmer[]; currency: string; agentCode: string }) {
  const colors = useColors();

  if (farmers.length === 0) {
    return (
      <Surface level="raised" className="items-center gap-2 p-6">
        <Ionicons name="people-outline" size={32} color={colors.tertiary} />
        <Text className="text-body font-sans-medium text-primary">No farmers yet</Text>
        <Text className="text-center text-label text-tertiary">
          When a farmer enters your code ({agentCode}) in HerdCare, under Settings, then Helped by an agent,
          they appear here with the date their free trial ends.
        </Text>
      </Surface>
    );
  }

  return (
    <View className="gap-5">
      {GROUPS.map((group) => {
        const members = farmers.filter((farmer) => group.stages.includes(farmer.stage));
        if (members.length === 0) return null;
        return (
          <View key={group.title} className="gap-2">
            <View className="gap-0.5">
              <Text className="text-headline font-sans-semibold text-primary">
                {group.title} ({members.length})
              </Text>
              <Text className="text-label text-tertiary">{group.hint}</Text>
            </View>
            {members.map((farmer) => (
              <FarmerCard key={farmer.phone} farmer={farmer} currency={currency} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

export function describeEvent(event: PipelineEvent, currency: string): { icon: keyof typeof Ionicons.glyphMap; text: string } {
  const who = displayName(event);
  switch (event.kind) {
    case 'joined':
      return { icon: 'person-add', text: `${who} joined with your code` };
    case 'first-payment':
      return {
        icon: 'cash',
        text: `${who} started paying. You earned ${formatMoney(event.earned ?? 0, currency)}`,
      };
    case 'renewed':
      return { icon: 'repeat', text: `${who} renewed. You earned ${formatMoney(event.earned ?? 0, currency)}` };
  }
}

/**
 * What changed since the agent last looked: who joined, who started paying, what it earned them.
 * The first time, it shows the latest few so the section is never mysteriously empty.
 */
export function WhatsNew({ events, seenAt, currency }: { events: PipelineEvent[]; seenAt: string | null; currency: string }) {
  const colors = useColors();
  const fresh = seenAt ? events.filter((event) => event.at > seenAt) : events;
  const shown = fresh.slice(0, 5);
  if (shown.length === 0) return null;

  return (
    <Surface level="raised" className="gap-3 p-4">
      <Text className="text-callout font-sans-bold text-primary">
        {seenAt ? `New since you last looked (${fresh.length})` : 'Recent'}
      </Text>
      {shown.map((event, index) => {
        const { icon, text } = describeEvent(event, currency);
        return (
          <View key={`${event.kind}-${event.phone}-${event.at}-${index}`} className="flex-row items-center gap-3">
            <View className="h-8 w-8 items-center justify-center rounded-pill bg-brand-soft">
              <Ionicons name={icon} size={16} color={colors.brand} />
            </View>
            <View className="flex-1">
              <Text className="text-callout text-primary">{text}</Text>
              <Text className="text-label text-tertiary">{formatDateForDisplay(event.at)}</Text>
            </View>
          </View>
        );
      })}
      <Text className="text-label text-tertiary">
        You earn {Math.round(DEFAULT_TERMS.commissionRate * 100)}% of every payment, starting the week a farmer first pays.
      </Text>
    </Surface>
  );
}
