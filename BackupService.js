import { Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
// SDK 57 moved the legacy URI functions behind the /legacy entry point.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export const BACKUP_KEYS = [
  'transactions',
  'monthlyBudget',
  'savingsGoals',
  'categoryBudgets',
  'bills_v2',
  'savings_v1',
  'hideBalanceFeature',
  'dailySpendLimit',
];

const LAST_BACKUP_KEY = 'thunder_last_backup_at';
const REMINDER_DISMISS_KEY = 'thunder_backup_reminder_dismissed_at';
export const BACKUP_REMINDER_DAYS = 7;

export async function getLastBackupAt() {
  const raw = await AsyncStorage.getItem(LAST_BACKUP_KEY);
  const ts = Number(raw);
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}

export async function markBackupCompleted() {
  await AsyncStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
}

export async function needsBackupReminder() {
  const last = await getLastBackupAt();
  if (!last) return true;
  const ageMs = Date.now() - last;
  return ageMs > BACKUP_REMINDER_DAYS * 24 * 60 * 60 * 1000;
}

export function formatLastBackupLabel(timestamp) {
  if (!timestamp) return 'No backup yet — tap to save your data';
  const days = Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Last backup: today';
  if (days === 1) return 'Last backup: yesterday';
  return `Last backup: ${days} days ago`;
}

export async function shouldShowBackupReminder() {
  if (!(await needsBackupReminder())) return false;
  const dismissed = await AsyncStorage.getItem(REMINDER_DISMISS_KEY);
  const dismissedAt = Number(dismissed);
  if (Number.isFinite(dismissedAt) && Date.now() - dismissedAt < 24 * 60 * 60 * 1000) {
    return false;
  }
  return true;
}

export async function dismissBackupReminderForToday() {
  await AsyncStorage.setItem(REMINDER_DISMISS_KEY, String(Date.now()));
}

export async function createBackupAndShare() {
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Sharing is not available on this device.');
  }

  const pairs = await AsyncStorage.multiGet(BACKUP_KEYS);
  const data = {};
  pairs.forEach(([k, v]) => { if (v !== null) data[k] = v; });

  if (!Object.keys(data).length) {
    throw new Error('Nothing to back up yet. Add a transaction first.');
  }

  const payload = JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  }, null, 2);

  const dir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!dir) throw new Error('No writable directory available on this device.');

  const path = `${dir}thunder-wallet-backup-${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(path, payload, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(path, {
    mimeType: 'application/json',
    dialogTitle: 'Save Thunder Wallet Backup',
  });
  return path;
}

export function parseRestorePayload(parsed) {
  if (parsed?.version !== 1 || !parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
    throw new Error('invalid');
  }
  const d = parsed.data;

  // Validate every supplied field before touching storage. Backups are JSON, but
  // their values are themselves serialized JSON strings for compatibility.
  for (const key of Object.keys(d)) {
    if (!BACKUP_KEYS.includes(key) || typeof d[key] !== 'string') throw new Error('invalid');
  }
  if (!Object.keys(d).some((key) => BACKUP_KEYS.includes(key))) throw new Error('empty');
  const parseJson = (key, fallback, predicate) => {
    if (d[key] == null) return fallback;
    let value;
    try { value = JSON.parse(d[key]); } catch { throw new Error('invalid'); }
    if (!predicate(value)) throw new Error('invalid');
    return value;
  };
  const parseNumber = (key, fallback, allowZero = false) => {
    if (d[key] == null) return fallback;
    if (d[key].trim() === '') throw new Error('invalid');
    const value = Number(d[key]);
    if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) throw new Error('invalid');
    return value;
  };
  const parseBoolean = (key, fallback) => {
    if (d[key] == null) return fallback;
    if (d[key] !== 'true' && d[key] !== 'false') throw new Error('invalid');
    return d[key] === 'true';
  };

  const transactions = parseJson('transactions', [], Array.isArray);
  const goals = parseJson('savingsGoals', [], Array.isArray);
  const categoryBudgets = parseJson('categoryBudgets', {}, (v) => v && typeof v === 'object' && !Array.isArray(v));
  const bills = parseJson('bills_v2', [], Array.isArray);
  const savings = parseJson('savings_v1', [], Array.isArray);
  if (![...transactions, ...goals, ...bills, ...savings].every((item) => item && typeof item === 'object' && !Array.isArray(item))) throw new Error('invalid');
  if (!Object.values(categoryBudgets).every((v) => Number.isFinite(Number(v)) && Number(v) >= 0)) throw new Error('invalid');

  const monthlyBudget = parseNumber('monthlyBudget', 30000);
  const dailySpendLimit = parseNumber('dailySpendLimit', 0, true);
  const hideBalanceFeature = parseBoolean('hideBalanceFeature', false);
  // Missing fields represent empty/default values, so the operation truly
  // replaces local wallet data instead of silently retaining stale values.
  const values = {
    transactions: JSON.stringify(transactions),
    monthlyBudget: String(monthlyBudget),
    savingsGoals: JSON.stringify(goals),
    categoryBudgets: JSON.stringify(categoryBudgets),
    bills_v2: JSON.stringify(bills),
    savings_v1: JSON.stringify(savings),
    hideBalanceFeature: String(hideBalanceFeature),
    dailySpendLimit: String(dailySpendLimit),
  };
  const pairs = BACKUP_KEYS.map((key) => [key, values[key]]);

  return {
    pairs,
    restore: {
      transactions, monthlyBudget, goals, categoryBudgets, bills, savings,
      hideBalanceFeature, dailySpendLimit,
    },
  };
}

export const UPDATE_INSTALL_STEPS = [
  'Save the backup file to Google Drive, Downloads, or email.',
  'Download the new APK from GitHub.',
  'If install fails: uninstall the OLD app only after your backup is saved.',
  'Install the new APK, then Settings → Restore from backup.',
].join('\n');

export function confirmRiskyUpdateWithoutBackup(onConfirm) {
  Alert.alert(
    'Update without backup?',
    'If you uninstall the old app, ALL transactions, bills, and budgets are permanently deleted. Card numbers must be re-entered manually.\n\nOnly continue if you already saved a backup file.',
    [
      { text: 'Back up first', style: 'cancel' },
      { text: 'I already have a backup', style: 'destructive', onPress: onConfirm },
    ],
  );
}

export function showUpdateInstallGuide(downloadUrl) {
  Alert.alert(
    'How to install safely',
    UPDATE_INSTALL_STEPS,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Open download',
        onPress: () => { if (downloadUrl) Linking.openURL(downloadUrl); },
      },
    ],
  );
}
