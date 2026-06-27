import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIF_ENABLED_KEY = 'notificationsEnabled';

// Detect Expo Go reliably via expo-constants (always safe to import)
let IS_EXPO_GO = false;
try {
  const Constants = require('expo-constants').default;
  IS_EXPO_GO = Constants.appOwnership === 'expo';
} catch (_) {}

// Never import expo-notifications in Expo Go — the package itself emits
// errors and warnings at import time when it detects it's running in Expo Go,
// and those cannot be suppressed from outside the package.
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
  } catch (_) {}
}

export async function requestNotificationPermission() {
  if (!Notifications) return false;
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

const DAILY_REVIEW_ID = 'thunder_daily_review';

export async function scheduleDailyReview(stats) {
  if (!Notifications) return;
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
        ? `₹${Math.round(stats.todaySpend)} spent today. You're ₹${Math.round(stats.dailyBudgetLeft)} under budget`
        : `₹${Math.round(stats.todaySpend)} spent today. Over daily budget — plan better tomorrow.`;
    }
  }

  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_REVIEW_ID,
    content: { title: 'Day in Review ⚡', body },
    trigger: { hour: 21, minute: 0, repeats: true },
  });
}

export async function cancelDailyReview() {
  if (!Notifications) return;
  // Cancel only the daily review — not bill reminders
  try {
    await Notifications.cancelScheduledNotificationAsync(DAILY_REVIEW_ID);
  } catch (_) {}
}

export async function sendGoalReachedNotification(goalName) {
  if (!Notifications) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Goal Reached! 🎉`,
      body: `You hit your "${goalName}" savings goal. Celebrate — you earned it.`,
    },
    trigger: null,
  });
}

export async function scheduleBillReminders(bills) {
  if (!Notifications || !bills?.length) return;
  try {
    // Cancel all existing bill reminders before rescheduling
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (n.content?.data?.type === 'bill_reminder') {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    for (const bill of bills) {
      // Skip only if explicitly deactivated (bills don't have isActive field — treat absence as active)
      if (bill.isActive === false) continue;
      const isPaidThisMonth = !!bill.paidMonths?.[currentMonth];
      if (isPaidThisMonth) continue;

      // Schedule reminder 1 day before due date at 9 AM (monthly repeat)
      const reminderDay = bill.dueDay - 1 < 1 ? 28 : bill.dueDay - 1;
      const trigger = { type: 'calendar', day: reminderDay, hour: 9, minute: 0, repeats: true };

      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Bill Due Tomorrow: ${bill.name}`,
          body: `₹${bill.amount.toLocaleString('en-IN')} due on the ${bill.dueDay}th. Tap to mark as paid.`,
          data: { type: 'bill_reminder', billId: bill.id },
        },
        trigger,
      });

      // Also schedule on the due day itself at 9 AM
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Bill Due Today: ${bill.name} ⚡`,
          body: `₹${bill.amount.toLocaleString('en-IN')} is due today. Don't forget to pay!`,
          data: { type: 'bill_reminder', billId: bill.id },
        },
        trigger: { type: 'calendar', day: bill.dueDay, hour: 9, minute: 0, repeats: true },
      });
    }
  } catch (_) {}
}
