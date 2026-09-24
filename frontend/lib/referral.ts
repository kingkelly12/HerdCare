import * as Crypto from 'expo-crypto';
import { getSettings, updateSettings } from '@/db/reminders';
import { apiRequest } from '@/lib/api/client';

/**
 * Linking a farmer to the agent who helped them.
 *
 * The farmer's own phone tells the server, so the agent can follow them through the free trial
 * and be there when it ends. It works offline first like everything else: the link is saved on
 * the phone at once, with its bonus days, and reaches the server whenever there is signal. A link
 * that has not been sent yet is simply sent again at the next launch.
 */

export interface AgentLink {
  code: string;
  phone: string;
  name: string;
}

export type SyncOutcome =
  | { state: 'sent'; agentName: string }
  /** Nothing to send, or it has already been sent. */
  | { state: 'idle' }
  /** Saved on the phone; will go when there is signal. */
  | { state: 'waiting' }
  /** The server does not know that code. The farmer should check it with their agent. */
  | { state: 'unknown-agent'; message: string }
  | { state: 'rejected'; message: string };

/** Accepts 07.., 01.., +254.., 254.. and spaces; returns 2547xxxxxxxx, or null if it is not a mobile. */
export function normaliseKenyanMobile(input: string): string | null {
  const digits = input.replace(/[^0-9]/g, '');
  const full = digits.startsWith('254')
    ? digits
    : digits.startsWith('0')
      ? `254${digits.slice(1)}`
      : digits.length === 9
        ? `254${digits}`
        : digits;
  return /^254[17]\d{8}$/.test(full) ? full : null;
}

/** 254712345678 -> 0712 345 678, for showing a number back to the person who typed it. */
export function formatKenyanMobile(normalised: string): string {
  const local = `0${normalised.slice(3)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

async function ensureInstallId(): Promise<string> {
  const prefs = await getSettings();
  if (prefs?.installId) return prefs.installId;
  const id = Crypto.randomUUID();
  await updateSettings({ installId: id });
  return id;
}

/** Saves the link on this phone and tries to send it straight away. */
export async function linkToAgent(link: AgentLink): Promise<SyncOutcome> {
  const phone = normaliseKenyanMobile(link.phone);
  if (!phone) return { state: 'rejected', message: 'Enter your M-Pesa number, for example 0712 345 678.' };

  await updateSettings({
    agentCode: link.code.trim().toUpperCase(),
    farmerPhone: phone,
    farmerName: link.name.trim() || null,
    referralSyncedAt: null,
    referralAgentName: null,
  });
  const outcome = await syncAgentLink();
  // A code the server has never heard of is a typo. Keeping it would hand out bonus days for it
  // and send it along with the farmer's first payment, so it goes; the number and name stay.
  if (outcome.state === 'unknown-agent') await updateSettings({ agentCode: null });
  return outcome;
}

/** In flight, so a launch and a screen asking at the same moment send it once. */
let inFlight: Promise<SyncOutcome> | null = null;

/** Sends the saved link if it has not reached the server yet. Safe to call at every launch. */
export function syncAgentLink(): Promise<SyncOutcome> {
  if (!inFlight) {
    inFlight = send().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function send(): Promise<SyncOutcome> {
  const prefs = await getSettings();
  if (!prefs?.agentCode || !prefs.farmerPhone || prefs.referralSyncedAt) return { state: 'idle' };

  const installId = await ensureInstallId();
  const result = await apiRequest<{ agent: { code: string; name: string }; trialEndsOn: string }>('/referrals', {
    method: 'POST',
    body: {
      installId,
      agentCode: prefs.agentCode,
      phone: prefs.farmerPhone,
      name: prefs.farmerName ?? '',
      trialStartedAt: prefs.trialStartedAt,
    },
    timeoutMs: 12_000,
  });

  if (result.ok) {
    await updateSettings({ referralSyncedAt: new Date().toISOString(), referralAgentName: result.data.agent.name });
    return { state: 'sent', agentName: result.data.agent.name };
  }
  if (result.status === 422) return { state: 'unknown-agent', message: result.error };
  if (result.status === 400) return { state: 'rejected', message: result.error };
  // Offline, timed out, a server too old to know this endpoint (404), or a bad day. Next time.
  return { state: 'waiting' };
}
