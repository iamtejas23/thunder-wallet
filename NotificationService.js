import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBillingPeriod } from './BillsScreen';

const NOTIF_ENABLED_KEY    = 'notificationsEnabled';
const CHANNEL_DAILY        = 'thunder-daily-review';
const CHANNEL_BILLS        = 'thunder-bill-reminders';
const DAILY_REVIEW_ID      = 'thunder_daily_review';
const BILL_PREFIX          = 'thunder_bill_';

// Detect Expo Go reliably — expo-notifications crashes at import time in Expo Go
let IS_EXPO_GO = false;
try {
  const Constants = require('expo-constants').default;
  IS_EXPO_GO = Constants.appOwnership === 'expo';
} catch (_) {}

let Notifications = null;
if (!IS_EXPO_GO) {
  try {
    Notifications = require('expo-notifications');
    // Global handler — show alert + play sound when app is in foreground
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (_) {}
}

// ── Android channels (required for Android 8+, silent without them) ───────────
async function ensureChannels() {
  if (Platform.OS !== 'android' || !Notifications) return;
  const { AndroidImportance } = Notifications;
  await Promise.all([
    Notifications.setNotificationChannelAsync(CHANNEL_DAILY, {
      name: 'Day in Review',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: '#60A5FA',
      sound: 'default',
      enableVibrate: true,
    }),
    Notifications.setNotificationChannelAsync(CHANNEL_BILLS, {
      name: 'Bill Reminders',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: '#FB923C',
      sound: 'default',
      enableVibrate: true,
    }),
  ]);
}

// ── Permission ────────────────────────────────────────────────────────────────
export async function requestNotificationPermission() {
  if (!Notifications) return false;
  try {
    await ensureChannels();
    // Check existing status first — don't re-prompt if already granted/denied
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    if (existing === 'denied') return false;
    const { status } = await Notifications.requestPermissionsAsync({
      android: {},
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    return status === 'granted';
  } catch { return false; }
}

// ── Preference helpers ────────────────────────────────────────────────────────
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
    await cancelAllBillReminders();
  }
}

// ── Daily Review — fires at 9 PM every day ────────────────────────────────────
export async function scheduleDailyReview(stats) {
  if (!Notifications) return;
  const enabled = await isNotificationsEnabled();
  if (!enabled) return;

  let body = 'Open Thunder Wallet to review your day.';
  if (stats) {
    if (stats.todaySpend === 0) {
      body = 'No expenses logged today. Quick — add them before you forget!';
    } else {
      const under = stats.dailyBudgetLeft > 0;
      body = under
        ? `₹${Math.round(stats.todaySpend)} spent today. ₹${Math.round(stats.dailyBudgetLeft)} under budget — nice work.`
        : `₹${Math.round(stats.todaySpend)} spent today. Over daily budget — plan better tomorrow.`;
    }
  }

  await cancelDailyReview();
  await ensureChannels();

  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_REVIEW_ID,
    content: {
      title: 'Day in Review ⚡',
      body,
      data: { type: 'daily_review' },
    },
    // FIX: use SchedulableTriggerInputTypes.DAILY (not deprecated 'calendar' + repeats:true)
    // FIX: channelId goes in trigger (not content) for Android in expo-notifications 0.28+
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 21,
      minute: 0,
      channelId: CHANNEL_DAILY,
    },
  });
}

export async function cancelDailyReview() {
  if (!Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(DAILY_REVIEW_ID);
  } catch (_) {}
}

// ── Goal reached — fires immediately ─────────────────────────────────────────
export async function sendGoalReachedNotification(goalName) {
  if (!Notifications) return;
  await ensureChannels();
  // Use 1-second interval so channelId can be included
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Goal Reached! 🎉',
      body: `You hit your "${goalName}" savings goal. Celebrate — you earned it.`,
      data: { type: 'goal_reached' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
      channelId: CHANNEL_DAILY,
    },
  });
}

// ── Bill reminders — fires on specific days each month ────────────────────────
export async function cancelAllBillReminders() {
  if (!Notifications) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    // FIX: filter by identifier prefix (reliable) instead of content.data.type (unreliable)
    const billOnes = scheduled.filter(n => n.identifier.startsWith(BILL_PREFIX));
    await Promise.all(billOnes.map(n =>
      Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})
    ));
  } catch (_) {}
}

export async function scheduleBillReminders(bills) {
  if (!Notifications) return;
  // FIX: guard — don't schedule if user has disabled notifications
  const enabled = await isNotificationsEnabled();
  if (!enabled) return;

  await cancelAllBillReminders();
  await ensureChannels();

  if (!bills?.length) return;

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  for (const bill of bills) {
    if (bill.isActive === false) continue;
    const amtFmt = (bill.amount || 0).toLocaleString('en-IN');

    // Day-based cycles — schedule one-shot reminders for the next due date
    if (bill.cycleUnit === 'days') {
      const { status, dueDate } = getBillingPeriod(bill);
      if (status === 'paid' || !dueDate) continue;

      try {
        const dueAt = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate(), 9, 0, 0);
        const beforeAt = new Date(dueAt);
        beforeAt.setDate(beforeAt.getDate() - 1);

        if (beforeAt > now) {
          await Notifications.scheduleNotificationAsync({
            identifier: `${BILL_PREFIX}${bill.id}_before`,
            content: {
              title: `Bill Due Tomorrow: ${bill.name}`,
              body: `₹${amtFmt} due tomorrow. Tap to mark as paid.`,
              data: { type: 'bill_reminder', billId: bill.id },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: beforeAt,
              channelId: CHANNEL_BILLS,
            },
          });
        }

        if (dueAt > now) {
          await Notifications.scheduleNotificationAsync({
            identifier: `${BILL_PREFIX}${bill.id}_due`,
            content: {
              title: `Bill Due Today: ${bill.name} ⚡`,
              body: `₹${amtFmt} is due today. Don't forget to pay!`,
              data: { type: 'bill_reminder', billId: bill.id },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: dueAt,
              channelId: CHANNEL_BILLS,
            },
          });
        }
      } catch (_) {}
      continue;
    }

    const isPaidThisMonth = !!bill.paidMonths?.[currentMonth];
    if (isPaidThisMonth) continue;

    const dueDay    = Math.max(1, Math.min(bill.dueDay || 1, 28)); // clamp to 28 (safe for all months)
    const remindDay = Math.max(1, dueDay - 1);

    try {
      // Day-before reminder
      await Notifications.scheduleNotificationAsync({
        identifier: `${BILL_PREFIX}${bill.id}_before`,
        content: {
          title: `Bill Due Tomorrow: ${bill.name}`,
          body: `₹${amtFmt} due on the ${dueDay}${ordinalSuffix(dueDay)}. Tap to mark as paid.`,
          data: { type: 'bill_reminder', billId: bill.id },
        },
        // FIX: use SchedulableTriggerInputTypes.MONTHLY with channelId in trigger
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
          day: remindDay,
          hour: 9,
          minute: 0,
          channelId: CHANNEL_BILLS,
        },
      });

      // Due-day reminder
      await Notifications.scheduleNotificationAsync({
        identifier: `${BILL_PREFIX}${bill.id}_due`,
        content: {
          title: `Bill Due Today: ${bill.name} ⚡`,
          body: `₹${amtFmt} is due today. Don't forget to pay!`,
          data: { type: 'bill_reminder', billId: bill.id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
          day: dueDay,
          hour: 9,
          minute: 0,
          channelId: CHANNEL_BILLS,
        },
      });
    } catch (_) {}
  }
}

function ordinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
