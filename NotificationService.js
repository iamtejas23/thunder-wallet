import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIF_ENABLED_KEY = 'notificationsEnabled';

export async function requestNotificationPermission() {
  return false;
}

export async function isNotificationsEnabled() {
  const val = await AsyncStorage.getItem(NOTIF_ENABLED_KEY);
  return val === 'true';
}

export async function setNotificationsEnabled(enabled) {
  await AsyncStorage.setItem(NOTIF_ENABLED_KEY, enabled ? 'true' : 'false');
}

export async function scheduleDailyReview() {}

export async function cancelDailyReview() {}

export async function sendGoalReachedNotification() {}
