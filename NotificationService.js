import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const NOTIF_ENABLED_KEY = 'notificationsEnabled';

// expo-notifications dropped remote push from Expo Go in SDK 53.
// Detect Expo Go and disable all notification calls to prevent console errors.
const IS_EXPO_GO = Constants.appOwnership === 'expo';

let Notifications = null;
if (!IS_EXPO_GO) {
  try {
    Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {}
}

export async function requestNotificationPermission() {
  if (!Notifications) return false;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch { return false; }
}

export async function isNotificationsEnabled() {
  try {
    const val = await AsyncStorage.getItem(NOTIF_ENABLED_KEY);
    return val === 'true';
  } catch { return false; }
}

export async function setNotificationsEnabled(enabled) {
  try {
    await AsyncStorage.setItem(NOTIF_ENABLED_KEY, enabled ? 'true' : 'false');
    if (enabled) await scheduleDailyReview();
    else await cancelDailyReview();
  } catch {}
}

export async function scheduleDailyReview(stats) {
  if (!Notifications) return;
  try {
    await cancelDailyReview();
    const enabled = await isNotificationsEnabled();
    if (!enabled) return;

    let body = 'Open Thunder Wallet to review your day.';
    if (stats) {
      if (stats.todaySpend === 0) {
        body = 'No expenses logged today. Quick — add them before you forget!';
      } else {
        const under = stats.dailyBudgetLeft > 0;
        body = under
          ? `₹${Math.round(stats.todaySpend)} spent today. ₹${Math.round(stats.dailyBudgetLeft)} under budget 🔥`
          : `₹${Math.round(stats.todaySpend)} spent today. Over daily budget — plan better tomorrow.`;
      }
    }

    await Notifications.scheduleNotificationAsync({
      content: { title: 'Day in Review ⚡', body },
      trigger: { hour: 21, minute: 0, repeats: true },
    });
  } catch {}
}

export async function cancelDailyReview() {
  if (!Notifications) return;
  try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch {}
}

export async function sendGoalReachedNotification(goalName) {
  if (!Notifications) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Goal Reached! 🎉',
        body: `You hit your "${goalName}" savings goal. Celebrate — you earned it.`,
      },
      trigger: null,
    });
  } catch {}
}
