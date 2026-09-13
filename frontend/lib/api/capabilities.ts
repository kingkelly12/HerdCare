import { useEffect, useState } from 'react';
import { apiRequest, isCloudConfigured } from './client';

/**
 * What the server can actually do right now, as opposed to what this build was compiled with.
 *
 * The distinction is the whole point. Whether payments work depends on M-Pesa credentials living
 * on the server, not on anything inside the app. Asking the server means paying switches on for
 * every phone the moment those credentials are added — no rebuild, no new APK, no waiting for
 * farmers to update — and stays off, rather than showing buttons that fail, until then.
 */

export interface Capabilities {
  /** The server answered at all. */
  reachable: boolean;
  /** In-app M-Pesa payment is configured and will work if tried. */
  payments: boolean;
}

interface HealthResponse {
  ok: boolean;
  payments: boolean;
  sms: boolean;
}

const UNKNOWN: Capabilities = { reachable: false, payments: false };

// One health check per app launch is plenty; the answer changes when you deploy, not by the minute.
let cached: Promise<Capabilities> | null = null;

export function fetchCapabilities(): Promise<Capabilities> {
  if (!isCloudConfigured()) return Promise.resolve(UNKNOWN);

  cached ??= apiRequest<HealthResponse>('/health', { timeoutMs: 8_000 }).then((result) => {
    if (!result.ok) {
      // Offline or unreachable: forget this answer so the next screen can try again, rather than
      // hiding payments for the rest of the session because of one dead zone.
      cached = null;
      return UNKNOWN;
    }
    return { reachable: true, payments: Boolean(result.data.payments) };
  });

  return cached;
}

/**
 * Hook form. Starts as "unknown" — payments hidden — and only reveals them once the server has
 * confirmed they work, so a farmer never taps a Pay button that is about to fail.
 */
export function useCapabilities(): Capabilities {
  const [capabilities, setCapabilities] = useState<Capabilities>(UNKNOWN);

  useEffect(() => {
    let cancelled = false;
    fetchCapabilities().then((next) => {
      if (!cancelled) setCapabilities(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return capabilities;
}
