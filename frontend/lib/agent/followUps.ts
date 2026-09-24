import * as Notifications from 'expo-notifications';
import { File, Paths } from 'expo-file-system';
import { getAgentPipeline, type AgentPipeline, type PipelineFarmer } from '@/lib/api/agency';
import { getStoredAgentSession } from '@/lib/agencyStorage';
import { ANDROID_CHANNEL_ID } from '@/lib/notifications';
import { DEFAULT_TERMS } from './earnings';

/**
 * Keeping an agent on top of their farmers, for nothing.
 *
 * Every free trial's end date is known the day the farmer joins, so the agent's own phone can set
 * its reminders then, months ahead, as ordinary local notifications. They go off on the day
 * whether or not the agent has opened HerdCare since, with no server push, no SMS and no bill.
 * The list is refreshed whenever the app opens with signal, which is also when a payment by one of
 * their farmers shows up as news.
 */

const CACHE_FILE = 'agent_pipeline.json';
const NOTIFICATION_PREFIX = 'agent-';

/**
 * Local notifications have a ceiling (iOS keeps 64 in total, shared with the farmer's own daily
 * briefings), so only the soonest follow-ups are scheduled. The rest are picked up on a later
 * launch as their dates come closer.
 */
const MAX_FOLLOW_UPS = 24;

/** Days before a trial ends that the agent hears about it: early enough to visit, and a last call. */
const TRIAL_NOTICE_DAYS = [14, 2];
/** Days before a paid period ends. */
const RENEWAL_NOTICE_DAYS = 3;

interface CachedPipeline {
  pipeline: AgentPipeline;
  fetchedAt: string;
  /** When the agent last opened their portal, for "new since you last looked". */
  seenAt: string | null;
}

function cacheFile(): File {
  return new File(Paths.document, CACHE_FILE);
}

export function readCachedPipeline(): CachedPipeline | null {
  try {
    const file = cacheFile();
    if (!file.exists) return null;
    return JSON.parse(file.textSync()) as CachedPipeline;
  } catch {
    return null;
  }
}

function writeCache(cache: CachedPipeline): void {
  try {
    const file = cacheFile();
    if (file.exists) file.delete();
    file.create();
    file.write(JSON.stringify(cache));
  } catch {
    // A cache that cannot be written only costs the Today card until the next launch.
  }
}

/** Remembers that the agent has now seen everything up to this moment. */
export function markPipelineSeen(): void {
  const cache = readCachedPipeline();
  if (cache) writeCache({ ...cache, seenAt: new Date().toISOString() });
}

/** Called when the agent signs out, so their farmers stop turning up on this phone. */
export async function clearAgentFollowUps(): Promise<void> {
  try {
    const file = cacheFile();
    if (file.exists) file.delete();
  } catch {}
  await applyFollowUps([]);
}

/** Stores a freshly loaded pipeline and brings the reminders in line with it. */
export async function acceptPipeline(pipeline: AgentPipeline): Promise<void> {
  const previous = readCachedPipeline();
  writeCache({ pipeline, fetchedAt: new Date().toISOString(), seenAt: previous?.seenAt ?? null });
  await applyFollowUps(planFollowUps(pipeline.farmers));
}

/**
 * The launch-time refresh: only for a phone signed in as an agent, and silent if there is no
 * signal, in which case yesterday's reminders simply stay as they were.
 */
export async function refreshAgentFollowUps(): Promise<void> {
  const session = await getStoredAgentSession();
  if (!session) return;
  const result = await getAgentPipeline(session.apiKey);
  if (result.ok) await acceptPipeline(result.data);
}

interface PlannedFollowUp {
  identifier: string;
  title: string;
  body: string;
  fireAt: Date;
}

function firstName(farmer: PipelineFarmer): string {
  return farmer.name.trim().split(/\s+/)[0] || `The farmer on ${farmer.phone}`;
}

/** Morning of `days` days before a YYYY-MM-DD, so it arrives before the agent's working day. */
function morningBefore(ymd: string, days: number): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(year, month - 1, day - days, 8, 0, 0, 0);
}

export function planFollowUps(farmers: PipelineFarmer[], now = new Date()): PlannedFollowUp[] {
  const rate = Math.round(DEFAULT_TERMS.commissionRate * 100);
  const plans: PlannedFollowUp[] = [];

  for (const farmer of farmers) {
    const who = firstName(farmer);

    if ((farmer.stage === 'trial' || farmer.stage === 'trial-ending') && farmer.trialEndsOn) {
      for (const days of TRIAL_NOTICE_DAYS) {
        plans.push({
          identifier: `${NOTIFICATION_PREFIX}${farmer.phone}-trial-${farmer.trialEndsOn}-${days}`,
          title: days >= 7 ? `${who}'s free trial ends in 2 weeks` : `${who}'s free trial ends in ${days} days`,
          body:
            days >= 7
              ? `A good time to visit and help them choose a plan. Your ${rate}% starts the week they pay.`
              : `Call ${farmer.phone} today. Once they pay, you earn on every payment they make.`,
          fireAt: morningBefore(farmer.trialEndsOn, days),
        });
      }
    }

    if ((farmer.stage === 'paying' || farmer.stage === 'renewal-due') && farmer.paidUntil) {
      plans.push({
        identifier: `${NOTIFICATION_PREFIX}${farmer.phone}-renewal-${farmer.paidUntil}`,
        title: `${who}'s subscription ends in ${RENEWAL_NOTICE_DAYS} days`,
        body: `A quick call keeps your ${rate}% coming.`,
        fireAt: morningBefore(farmer.paidUntil, RENEWAL_NOTICE_DAYS),
      });
    }
  }

  return plans
    .filter((plan) => plan.fireAt.getTime() > now.getTime())
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())
    .slice(0, MAX_FOLLOW_UPS);
}

/** Changes only the agent reminders that differ, leaving the farmer's own notifications alone. */
async function applyFollowUps(planned: PlannedFollowUp[]): Promise<void> {
  try {
    const permission = await Notifications.getPermissionsAsync();
    // Asking is left to the farmer-side setup at launch; an agent who said no is not asked twice.
    if (!permission.granted && planned.length > 0) return;

    const wanted = new Map(planned.map((plan) => [plan.identifier, plan]));
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const keep = new Set<string>();

    for (const request of scheduled) {
      if (!request.identifier.startsWith(NOTIFICATION_PREFIX)) continue;
      const want = wanted.get(request.identifier);
      if (want && request.content.title === want.title && request.content.body === want.body) {
        keep.add(request.identifier);
      } else {
        await Notifications.cancelScheduledNotificationAsync(request.identifier);
      }
    }

    for (const [identifier, plan] of wanted) {
      if (keep.has(identifier)) continue;
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: { title: plan.title, body: plan.body, data: { screen: '/agent' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: plan.fireAt, channelId: ANDROID_CHANNEL_ID },
      });
    }
  } catch {
    // Reminders are a convenience. Failing to set one must never break the portal.
  }
}
