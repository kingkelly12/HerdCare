import { useEffect } from 'react';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';

/** The screens a notification may open. Anything else in `data.screen` is ignored. */
const ALLOWED_SCREENS = new Set(['/reminders', '/activate', '/agent']);

/**
 * Opens the screen a tapped notification is about: the reminders list for a daily briefing, the
 * subscription screen for a trial or renewal warning, the agent portal for a farmer follow-up.
 * Without this, tapping any of them only opened the app wherever it happened to be.
 */
export function NotificationRouter() {
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const screen = response.notification.request.content.data?.screen;
    if (typeof screen === 'string' && ALLOWED_SCREENS.has(screen)) {
      router.push(screen as any);
      // So the same tap does not reopen the screen after a reload.
      Notifications.clearLastNotificationResponseAsync?.().catch(() => {});
    }
  }, [response]);

  return null;
}
