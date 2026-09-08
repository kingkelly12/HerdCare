import * as Haptics from 'expo-haptics';

// A saved-record confirmation a farmer can feel without having to read the screen —
// useful when the device is dusty, gloved, or in bright sun.
export function notifySaved() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
