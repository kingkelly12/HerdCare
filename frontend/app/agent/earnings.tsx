import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Surface } from '@/components/ui/Surface';
import { useColors } from '@/theme/colors';
import { PRICE_CURRENCY } from '@/lib/license/pricing';
import { formatMoney } from '@/utils/money';
import {
  DEFAULT_TERMS,
  bookValue,
  commissionPerPayment,
  earnedAtSigning,
  earnedEveryYearAfter,
  earnedFirstYear,
  farmRevenuePerYear,
  paymentsPerYear,
} from '@/lib/agent/earnings';

/**
 * What an agent earns, and why it is worth their time.
 *
 * Every number on this screen is computed in lib/agent/earnings.ts from the prices the app
 * actually charges, never typed into the copy. An agent who catches the app quoting a figure their
 * M-Pesa disagrees with will stop believing all of them.
 *
 * The framing is deliberate. Selling feels demeaning to a lot of people, and an agrovet owner who
 * feels like a salesman will not do this twice. So the page never asks them to sell: it points out
 * that they already advise farmers, and that this is advice which pays. What they are building is
 * an asset with their name on it, not a job with a target.
 */

const money = (value: number) => formatMoney(value, PRICE_CURRENCY);

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <View className="flex-1 gap-1">
      <Text className="text-label font-sans-semibold uppercase text-tertiary">{label}</Text>
      <Text className="text-metric font-sans-bold text-brand">{value}</Text>
      <Text className="text-label text-secondary">{note}</Text>
    </View>
  );
}

function Point({
  icon,
  title,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  // ReactNode, not string: several of these interpolate a computed figure mid-sentence.
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <View className="flex-row gap-3">
      <View className="h-9 w-9 items-center justify-center rounded-pill bg-brand-soft">
        <Ionicons name={icon} size={18} color={colors.brand} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-callout font-sans-semibold text-primary">{title}</Text>
        <Text className="text-label text-secondary">{children}</Text>
      </View>
    </View>
  );
}

export default function AgentEarningsScreen() {
  const colors = useColors();
  const terms = DEFAULT_TERMS;
  const rate = Math.round(terms.commissionRate * 100);

  const book = bookValue([10, 25, 50, 100]);

  return (
    <ScreenContainer>
      <Animated.View entering={FadeInDown.duration(280)} className="gap-2 pt-4">
        <Text className="text-label font-sans-semibold uppercase text-brand">Your share of HerdCare</Text>
        <Text className="text-display font-sans-bold text-primary">You are not selling. You are buying in.</Text>
        <Text className="text-body text-secondary">
          Every farmer you bring on gives you {rate}% of everything they will ever pay HerdCare. Not
          once. Every renewal, for as long as they farm. You do the work once and the income keeps
          arriving.
        </Text>
      </Animated.View>

      {/* The two figures that decide whether this is worth a conversation. */}
      <Animated.View entering={FadeInDown.duration(280).delay(60)}>
        <Surface level="raised" className="flex-row gap-4 p-4">
          <Stat
            label="When you sign one"
            value={money(earnedAtSigning('quarterly', terms))}
            note={`In your M-Pesa that week. ${money(terms.activationBounty)} bounty plus your first ${money(commissionPerPayment('quarterly', terms))} commission.`}
          />
          <View className="w-px bg-line" />
          <Stat
            label="Then every year"
            value={money(earnedEveryYearAfter('quarterly', terms))}
            note="From that same farm, for doing nothing more. It renews whether you visit or not."
          />
        </Surface>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(280).delay(100)} className="gap-3">
        <Text className="text-headline font-sans-semibold text-primary">Why this is ownership, not commission</Text>
        <Surface level="raised" className="gap-4 p-4">
          <Point icon="pie-chart" title={`You hold ${rate}% of the revenue you create`}>
            A farmer on the quarterly plan pays HerdCare
            {` ${money(farmRevenuePerYear('quarterly'))} a year. ${money(earnedEveryYearAfter('quarterly', terms))} of that is yours, every year, automatically.`}
          </Point>
          <Point icon="trending-up" title="Your income grows while you sleep">
            The farms you signed last season still pay you this season. Sign nothing new for a year
            and your income does not fall. That is the difference between a wage and a holding.
          </Point>
          <Point icon="infinite" title="There is no cut-off">
            No twelve-month limit, no expiry on your share. A farmer you sign this year and who is
            still farming in 2035 is still paying you in 2035.
          </Point>
          <Point icon="person" title="The farm is yours, on the record">
            Your agent code is stamped on every payment that farm ever makes. Nobody can take it,
            reassign it, or forget whose it was.
          </Point>
        </Surface>
      </Animated.View>

      {/* The compounding, which is the real argument and needs no exaggeration. */}
      <Animated.View entering={FadeInDown.duration(280).delay(140)} className="gap-3">
        <Text className="text-headline font-sans-semibold text-primary">What your book becomes</Text>
        <Text className="text-callout text-secondary">
          Recurring income only, with no new signings counted at all. Farms on the quarterly plan.
        </Text>
        <Surface level="raised" className="gap-0 p-0">
          <View className="flex-row border-b border-line px-4 py-2.5">
            <Text className="flex-1 text-label font-sans-semibold uppercase text-tertiary">Farms</Text>
            <Text className="w-28 text-right text-label font-sans-semibold uppercase text-tertiary">They pay</Text>
            <Text className="w-28 text-right text-label font-sans-semibold uppercase text-tertiary">You keep</Text>
          </View>
          {book.map((row, i) => (
            <View
              key={row.farms}
              className={`flex-row items-center px-4 py-3 ${i > 0 ? 'border-t border-line' : ''}`}
            >
              <Text className="flex-1 text-body font-sans-semibold text-primary">{row.farms}</Text>
              <Text className="w-28 text-right text-callout text-secondary">{money(row.revenuePerYear)}</Text>
              <Text className="w-28 text-right text-callout font-sans-bold text-brand">
                {money(row.yoursPerYear)}
              </Text>
            </View>
          ))}
        </Surface>
        <Text className="text-label text-tertiary">
          Fifty farms is one signing a week for a year. If they came to your counter anyway, that is{' '}
          {money(book[2].yoursPerYear)} a year for conversations you were already having.
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(280).delay(180)} className="gap-3">
        <Text className="text-headline font-sans-semibold text-primary">You already do the hard part</Text>
        <Surface level="raised" className="gap-4 p-4">
          <Point icon="chatbubbles" title="This is not a sales pitch, it is a question">
            Ask a farmer how much the neighbour owes them for milk. Watch them try to remember.
            That pause is the whole sale, and you have not sold anything.
          </Point>
          <Point icon="shield-checkmark" title="You are trusted before you open your mouth">
            Farmers already take your word on dewormers and feed. That trust is the asset. HerdCare
            just gives it somewhere else to earn.
          </Point>
          <Point icon="gift" title="Nothing to ask for on the first visit">
            Every farmer gets their first month free, with no code and no payment. You are handing
            over something free that works. The money conversation happens a month later, once the
            app has already proved itself.
          </Point>
          <Point icon="walk" title="No travel, no targets, no boss">
            You choose who and when. There is no quota to miss and nobody checking on you. Stop for
            a month and your existing farms still pay you.
          </Point>
        </Surface>
      </Animated.View>

      {/* Stated plainly. An agent who discovers this later feels misled, and tells everyone. */}
      <Animated.View entering={FadeInDown.duration(280).delay(220)} className="gap-3">
        <Text className="text-headline font-sans-semibold text-primary">The honest part</Text>
        <Surface level="raised" className="gap-3 p-4">
          <Text className="text-callout text-secondary">
            Your income only continues while your farmers keep paying. If they drift away, it stops
            with them.
          </Text>
          <Text className="text-callout text-secondary">
            That is deliberate, and it is on your side. You are not paid to sign a farmer and
            vanish. You are paid to make sure that farmer is still getting value next year, which is
            the same thing as protecting your own income. Spend twenty minutes helping them enter
            their animals properly and you are protecting {money(earnedEveryYearAfter('quarterly', terms))} a
            year, not doing a favour.
          </Text>
          <View className="border-t border-line pt-3">
            <Text className="text-label text-tertiary">
              Nobody pays anything to become an agent. If you are ever asked for a joining fee, a
              training fee, or money for stock, it is not HerdCare.
            </Text>
          </View>
        </Surface>
      </Animated.View>

      {/* Kept last and kept plain. This is the reference, not the pitch. */}
      <Animated.View entering={FadeInDown.duration(280).delay(260)} className="gap-3">
        <Text className="text-headline font-sans-semibold text-primary">The exact numbers</Text>
        <Surface level="raised" className="gap-0 p-0">
          <View className="flex-row border-b border-line px-4 py-2.5">
            <Text className="flex-1 text-label font-sans-semibold uppercase text-tertiary">Plan</Text>
            <Text className="w-24 text-right text-label font-sans-semibold uppercase text-tertiary">At signing</Text>
            <Text className="w-20 text-right text-label font-sans-semibold uppercase text-tertiary">Year 1</Text>
            <Text className="w-20 text-right text-label font-sans-semibold uppercase text-tertiary">After</Text>
          </View>
          {(['monthly', 'quarterly', 'annual'] as const).map((plan, i) => (
            <View key={plan} className={`flex-row items-center px-4 py-3 ${i > 0 ? 'border-t border-line' : ''}`}>
              <View className="flex-1">
                <Text className="text-body font-sans-medium capitalize text-primary">{plan}</Text>
                <Text className="text-label text-tertiary">
                  {paymentsPerYear(plan)} payment{paymentsPerYear(plan) === 1 ? '' : 's'} a year ·{' '}
                  {money(commissionPerPayment(plan, terms))} each
                </Text>
              </View>
              <Text className="w-24 text-right text-callout font-sans-semibold text-primary">
                {money(earnedAtSigning(plan, terms))}
              </Text>
              <Text className="w-20 text-right text-callout text-secondary">
                {money(earnedFirstYear(plan, terms))}
              </Text>
              <Text className="w-20 text-right text-callout text-secondary">
                {money(earnedEveryYearAfter(plan, terms))}
              </Text>
            </View>
          ))}
        </Surface>
        <Text className="text-label text-tertiary">
          On the monthly plan the {money(terms.activationBounty)} bounty is held until that farm has
          paid twice, so it is not counted at signing. On quarterly and annual it is paid straight
          away, because those months are already banked. A free trial earns nothing, because nothing
          has been paid.
        </Text>
      </Animated.View>

      <View className="flex-row items-start gap-2 pb-6">
        <Ionicons name="information-circle-outline" size={16} color={colors.tertiary} />
        <Text className="flex-1 text-label text-tertiary">
          Every figure here is worked out from the prices HerdCare charges today. Your own rate and
          bounty are shown in your portal, and if they differ from the standard {rate}% these numbers
          move with them.
        </Text>
      </View>
    </ScreenContainer>
  );
}
