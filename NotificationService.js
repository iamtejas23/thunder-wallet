import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIF_ENABLED_KEY = 'notificationsEnabled';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission() {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function isNotificationsEnabled() {
  const val = await AsyncStorage.getItem(NOTIF_ENABLED_KEY);
  return val === 'true';
}

export async function setNotificationsEnabled(enabled) {
  await AsyncStorage.setItem(NOTIF_ENABLED_KEY, enabled ? 'true' : 'false');
  if (enabled) {
    await scheduleDailyReview();
  } else {
    await cancelDailyReview();
  }
}

export async function scheduleDailyReview(stats) {
  await cancelDailyReview();
  const enabled = await isNotificationsEnabled();
  if (!enabled) return;

  const trigger = { hour: 21, minute: 0, repeats: true };

  let body = 'Open Thunder Wallet to review your day.';
  if (stats) {
    if (stats.todaySpend === 0) {
      body = 'No expenses logged today. Quick — add them before you forget!';
    } else {
      const under = stats.dailyBudgetLeft > 0;
      body = under
        ? `₹${Math.round(stats.todaySpend)} spent today. You're ₹${Math.round(stats.dailyBudgetLeft)} under budget 🔥`
        : `₹${Math.round(stats.todaySpend)} spent today. Over daily budget — plan better tomorrow.`;
    }
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Day in Review ⚡',
      body,
    },
    trigger,
  });
}

export async function cancelDailyReview() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function sendGoalReachedNotification(goalName) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Goal Reached! 🎉`,
      body: `You hit your "${goalName}" savings goal. Celebrate — you earned it.`,
    },
    trigger: null,
  });
}
