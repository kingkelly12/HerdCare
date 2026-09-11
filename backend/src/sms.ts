/**
 * Sending an SMS.
 *
 * Africa's Talking because it is what Kenyan services actually use: cheap per message, local
 * shortcodes, and no per-country onboarding. Kept behind one function so swapping it for Twilio or
 * Safaricom later touches this file and nothing else.
 */

export interface SmsConfig {
  username?: string;
  apiKey?: string;
  senderId?: string;
  /** When set, an unsendable code is logged instead. Only ever for a sandbox account. */
  allowDevFallback?: boolean;
}

export interface SmsResult {
  sent: boolean;
  /** Set only in the dev fallback, so a test can complete the flow without a real SMS account. */
  devCode?: string;
  detail: string;
}

export async function sendSms(
  config: SmsConfig,
  to: string,
  message: string,
  devCode?: string,
): Promise<SmsResult> {
  if (!config.username || !config.apiKey) {
    // Refusing by default matters: silently "succeeding" without sending would lock every farmer
    // out of recovery while looking perfectly healthy from the outside.
    if (!config.allowDevFallback) {
      return { sent: false, detail: 'SMS is not configured. Set SMS_USERNAME and SMS_API_KEY.' };
    }
    console.log(`[sms:dev] to ${to}: ${message}`);
    return { sent: false, devCode, detail: 'SMS not configured; code returned for development only.' };
  }

  const body = new URLSearchParams({
    username: config.username,
    to,
    message,
    ...(config.senderId ? { from: config.senderId } : {}),
  });

  const response = await fetch('https://api.africastalking.com/version1/messaging', {
    method: 'POST',
    headers: {
      apiKey: config.apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('SMS send failed', response.status, detail.slice(0, 200));
    return { sent: false, detail: 'Could not send the SMS.' };
  }

  return { sent: true, detail: 'Sent.' };
}
