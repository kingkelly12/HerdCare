import { useEffect } from 'react';
import { router, usePathname } from 'expo-router';
import { isWriteRoute } from '@/lib/license/writeRoutes';
import { useLicense } from './LicenseProvider';

/** Sends a farmer whose licence has lapsed to the activation screen instead of a blank form. */
export function WriteRouteGuard() {
  const pathname = usePathname();
  const { canWrite, loading } = useLicense();

  useEffect(() => {
    // `loading` matters: until the licence has actually been read, "cannot write" is not yet a
    // fact, and redirecting on it would throw a paid-up farmer at a paywall on every cold start.
    if (loading || canWrite) return;
    if (!isWriteRoute(pathname)) return;
    router.replace('/activate');
  }, [pathname, canWrite, loading]);

  return null;
}
