import { Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
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
  await markBackupCompleted();
  return path;
}

export function parseRestorePayload(parsed) {
  if (!parsed?.version || !parsed.data || typeof parsed.data !== 'object') {
    throw new Error('invalid');
  }
  const d = parsed.data;
  const pairs = BACKUP_KEYS
    .filter((k) => d[k] != null)
    .map((k) => [k, String(d[k])]);
  if (!pairs.length) throw new Error('empty');

  return {
    pairs,
    restore: {
      transactions: d.transactions ? JSON.parse(d.transactions) : undefined,
      monthlyBudget: d.monthlyBudget ? Number.parseFloat(d.monthlyBudget) : undefined,
      goals: d.savingsGoals ? JSON.parse(d.savingsGoals) : undefined,
      categoryBudgets: d.categoryBudgets ? JSON.parse(d.categoryBudgets) : undefined,
      bills: d.bills_v2 ? JSON.parse(d.bills_v2) : undefined,
      savings: d.savings_v1 ? JSON.parse(d.savings_v1) : undefined,
      hideBalanceFeature: d.hideBalanceFeature === 'true',
      dailySpendLimit: d.dailySpendLimit ? Number.parseFloat(d.dailySpendLimit) : 0,
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