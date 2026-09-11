import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { activateLicense, loadLicenseStatus, type ActivationResult } from '@/db/license';
import { canWrite as canWriteStatus, type LicenseStatus } from '@/lib/license/status';

/**
 * Whether this build ignores the licence entirely.
 *
 * `__DEV__` is true only under Metro, and is compiled to `false` in every release build, so this
 * can never reach a farmer's phone however the build is made. It exists so that working on the app
 * does not mean re-issuing yourself a code every time the database is reset.
 *
 * For a *release* build on your own handset, this is not the mechanism. Issue yourself a real
 * `owner` licence instead:
 *
 *   npm run license -- issue --phone 07xxxxxxxx --farm "My farm" --plan owner
 */
export const LICENSE_BYPASSED = __DEV__;

interface LicenseContextValue {
  /** Null until the first read finishes — never treat it as "locked". */
  status: LicenseStatus | null;
  loading: boolean;
  canWrite: boolean;
  /** True when a development build is ignoring the licence, so the UI can say so plainly. */
  bypassed: boolean;
  refresh: () => Promise<void>;
  activate: (token: string) => Promise<ActivationResult>;
}

const LicenseContext = createContext<LicenseContextValue | null>(null);

export function LicenseProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await loadLicenseStatus();
      if (mounted.current) setStatus(next);
    } catch {
      // A failed read must not brick the app. Leaving the previous answer in place is the safe
      // outcome: a farmer mid-season keeps working, and the next launch tries again.
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  // A licence can lapse while the app sits open on a kitchen table overnight, so re-check whenever
  // the farmer comes back to it rather than only at a cold start.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const activate = useCallback(async (token: string) => {
    const result = await activateLicense(token);
    if (result.ok && mounted.current) setStatus(result.status);
    return result;
  }, []);

  const value = useMemo<LicenseContextValue>(
    () => ({
      status,
      loading: status === null,
      bypassed: LICENSE_BYPASSED,
      // Unknown is not the same as locked. Until the read lands, nothing is blocked — the guard
      // waits rather than throwing a paying farmer at a paywall for a frame.
      canWrite: (LICENSE_BYPASSED || status === null) ? true : canWriteStatus(status),
      refresh,
      activate,
    }),
    [status, refresh, activate],
  );

  return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
}

export function useLicense(): LicenseContextValue {
  const context = useContext(LicenseContext);
  if (!context) throw new Error('useLicense must be used inside a LicenseProvider');
  return context;
}
