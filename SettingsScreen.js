import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import Constants from 'expo-constants';
import { useTheme } from './ThemeContext';
import MeshBackground from './MeshBackground';
import UpdateModal from './UpdateModal';
import PinScreen, { PIN_ENABLED_KEY, PIN_KEY } from './PinScreen';
import { isNotificationsEnabled, setNotificationsEnabled, requestNotificationPermission } from './NotificationService';

const BACKUP_KEYS = ['transactions', 'monthlyBudget', 'savingsGoals', 'categoryBudgets', 'bills_v2', 'savings_v1', 'hideBalanceFeature', 'dailySpendLimit'];

// ── Primitives ─────────────────────────────────────────────────────────────────

function SectionLabel({ text, C }) {
  return (
    <Text style={{ color: C.text3, fontSize: 11, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 }}>
      {text}
    </Text>
  );
}

function SettingsCard({ children, C }) {
  return (
    <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 18, borderWidth: 1, marginBottom: 24, overflow: 'hidden' }}>
      {children}
    </View>
  );
}

function Row({ icon, iconColor, iconBg, label, sublabel, right, onPress, showSep = true, C, destructive = false }) {
  const labelColor = destructive ? '#F87171' : C.text1;
  const content = (
    <View style={{ alignItems: 'center', flexDirection: 'row', minHeight: 58, paddingHorizontal: 16 }}>
      {icon && (
        <View style={{ alignItems: 'center', backgroundColor: iconBg || `${iconColor}18`, borderRadius: 11, height: 36, justifyContent: 'center', marginRight: 14, width: 36 }}>
          <Ionicons name={icon} size={17} color={iconColor} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ color: labelColor, fontSize: 15, fontFamily: 'DMSans_600SemiBold' }}>{label}</Text>
        {sublabel ? <Text style={{ color: C.text3, fontSize: 12, fontFamily: 'DMSans_400Regular', marginTop: 1, lineHeight: 17 }}>{sublabel}</Text> : null}
      </View>
      {right}
    </View>
  );

  return (
    <View>
      {onPress ? (
        <TouchableOpacity onPress={onPress} activeOpacity={0.65}>
          {content}
        </TouchableOpacity>
      ) : content}
      {showSep && (
        <View style={{ backgroundColor: C.border, height: 1, marginLeft: icon ? 66 : 16 }} />
      )}
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

const SettingsScreen = ({ resetAllData, hideBalanceFeature, onHideBalanceChange, dailySpendLimit, onDailyLimitChange, onRestoreData }) => {
  const { C, toggleTheme, isDark } = useTheme();
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [hideBalanceEnabled, setHideBalanceEnabled] = useState(hideBalanceFeature ?? false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updateResult, setUpdateResult] = useState(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showDailyLimitModal, setShowDailyLimitModal] = useState(false);
  const [dailyLimitInput, setDailyLimitInput] = useState('');

  const handleCheckUpdate = useCallback(async () => {
    setChecking(true);
    try {
      const current = Constants.expoConfig?.version ?? '0.0.0';
      const res = await fetch('https://api.github.com/repos/iamtejas23/thunder-wallet/releases/latest', {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!res.ok) throw new Error('network');
      const data = await res.json();
      const tag = data.tag_name ?? '';
      const url = data.assets?.[0]?.browser_download_url ?? data.html_url ?? '';
      const parse = v => v.replace(/^v/, '').split('.').map(Number);
      const [rA, rB, rC] = parse(tag);
      const [lA, lB, lC] = parse(current);
      const isNewer = rA > lA || (rA === lA && rB > lB) || (rA === lA && rB === lB && rC > lC);
      if (isNewer) {
        setUpdateResult({ latestVersion: tag, downloadUrl: url });
      } else {
        Alert.alert('You\'re up to date', `Thunder Wallet v${current} is the latest version.`);
      }
    } catch {
      Alert.alert('Check failed', 'Could not reach GitHub. Try again later.');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const [notif, pin, hideBalance] = await Promise.all([
        isNotificationsEnabled(),
        AsyncStorage.getItem(PIN_ENABLED_KEY),
        AsyncStorage.getItem('hideBalanceFeature'),
      ]);
      setNotifEnabled(notif);
      setPinEnabled(pin === 'true');
      setHideBalanceEnabled(hideBalance === 'true');
    })();
  }, []);

  const handleNotifToggle = async (val) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (val) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert('Permission needed', 'Enable notifications in your device Settings to receive daily reminders.');
        return;
      }
    }
    await setNotificationsEnabled(val);
    setNotifEnabled(val);
  };

  const handlePinToggle = async (val) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (val) {
      setShowPinSetup(true);
    } else {
      Alert.alert('Remove PIN?', 'Your app will no longer require a PIN to open.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove PIN', style: 'destructive', onPress: async () => {
            await AsyncStorage.multiRemove([PIN_ENABLED_KEY, PIN_KEY]);
            setPinEnabled(false);
          },
        },
      ]);
    }
  };

  const handleHideBalanceToggle = async (val) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHideBalanceEnabled(val);
    onHideBalanceChange?.(val);
    await AsyncStorage.setItem('hideBalanceFeature', val ? 'true' : 'false');
  };

  const handleBackup = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsBackingUp(true);
    try {
      const pairs = await AsyncStorage.multiGet(BACKUP_KEYS);
      const data = {};
      pairs.forEach(([k, v]) => { if (v !== null) data[k] = v; });
      const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
      const path = FileSystem.cacheDirectory + `thunder-wallet-backup-${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(path, payload, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: 'Save Thunder Wallet Backup' });
    } catch (e) {
      Alert.alert('Backup failed', 'Could not create backup file.');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestore = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Restore from backup?',
      'This will replace all current data with the backup. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Choose file', onPress: async () => {
            setIsRestoring(true);
            try {
              const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
              if (result.canceled) { setIsRestoring(false); return; }
              const content = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
              const parsed = JSON.parse(content);
              if (!parsed.version || !parsed.data) throw new Error('invalid');
              const d = parsed.data;
              const pairs = Object.entries(d).map(([k, v]) => [k, String(v)]);
              await AsyncStorage.multiSet(pairs);
              onRestoreData?.({
                transactions: d.transactions ? JSON.parse(d.transactions) : undefined,
                monthlyBudget: d.monthlyBudget ? Number.parseFloat(d.monthlyBudget) : undefined,
                goals: d.savingsGoals ? JSON.parse(d.savingsGoals) : undefined,
                categoryBudgets: d.categoryBudgets ? JSON.parse(d.categoryBudgets) : undefined,
                bills: d.bills_v2 ? JSON.parse(d.bills_v2) : undefined,
                savings: d.savings_v1 ? JSON.parse(d.savings_v1) : undefined,
                hideBalanceFeature: d.hideBalanceFeature === 'true',
                dailySpendLimit: d.dailySpendLimit ? Number.parseFloat(d.dailySpendLimit) : 0,
              });
              Alert.alert('Restore complete', 'Your data has been restored successfully.');
            } catch {
              Alert.alert('Restore failed', 'Invalid or corrupted backup file. Please choose a valid Thunder Wallet backup.');
            } finally {
              setIsRestoring(false);
            }
          },
        },
      ]
    );
  };

  const handleSaveDailyLimit = () => {
    const val = Number.parseFloat(dailyLimitInput);
    if (dailyLimitInput.trim() === '' || val === 0) {
      onDailyLimitChange?.(0);
    } else if (!Number.isFinite(val) || val <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid amount or leave blank to disable.');
      return;
    } else {
      onDailyLimitChange?.(val);
    }
    setShowDailyLimitModal(false);
  };

  const handleReset = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      'Reset all data?',
      'This will permanently delete all transactions, goals, bills, and savings. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything', style: 'destructive',
          onPress: async () => {
            if (resetAllData) await resetAllData();
            Alert.alert('Done', 'All data has been cleared.');
          },
        },
      ],
    );
  };

  if (showPinSetup) {
    return (
      <PinScreen
        mode="setup"
        onSuccess={() => { setPinEnabled(true); setShowPinSetup(false); }}
        onCancel={() => setShowPinSetup(false)}
      />
    );
  }

  if (showChangePin) {
    return (
      <PinScreen
        mode="change"
        onSuccess={() => {
          setShowChangePin(false);
          Alert.alert('PIN updated', 'Your PIN has been changed successfully.');
        }}
        onCancel={() => setShowChangePin(false)}
      />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <MeshBackground blobs="analytics" isDark={C.isDark} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 110 }}
      >

        {/* ── Page title ── */}
        <Text style={{ color: C.text1, fontSize: 32, fontFamily: 'DMSans_900Black', marginBottom: 24, letterSpacing: -0.5 }}>
          Settings
        </Text>

        {/* ── Profile card ── */}
        <View style={{ alignItems: 'center', backgroundColor: C.card, borderColor: C.border, borderRadius: 22, borderWidth: 1, marginBottom: 28, paddingVertical: 28 }}>
          <View style={{ alignItems: 'center', backgroundColor: C.accentBg, borderColor: C.accentBorder, borderRadius: 36, borderWidth: 1, height: 72, justifyContent: 'center', width: 72, marginBottom: 14 }}>
            <Image source={require('./assets/logo.png')} style={{ borderRadius: 16, height: 54, width: 54 }} resizeMode="cover" />
          </View>
          <Text style={{ color: C.text1, fontSize: 20, fontFamily: 'DMSans_900Black', letterSpacing: -0.3 }}>Thunder Wallet</Text>
          <Text style={{ color: C.text3, fontSize: 13, marginTop: 3 }}>Smart local expense manager</Text>
          <View style={{ alignItems: 'center', backgroundColor: C.accentBg, borderColor: C.accentBorder, borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 5, marginTop: 12, paddingHorizontal: 12, paddingVertical: 5 }}>
            <Ionicons name="flash" size={11} color={C.accent} />
            <Text style={{ color: C.accent, fontSize: 12, fontFamily: 'DMSans_800ExtraBold' }}>v{Constants.expoConfig?.version ?? '1.0.62'} · Free</Text>
          </View>
        </View>

        {/* ── Appearance ── */}
        <SectionLabel text="Appearance" C={C} />
        <SettingsCard C={C}>
          {/* Theme toggle — inline visual picker */}
          <View style={{ padding: 14 }}>
            <Text style={{ color: C.text2, fontSize: 13, fontFamily: 'DMSans_600SemiBold', marginBottom: 10, marginLeft: 2 }}>Theme</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {/* Light */}
              <TouchableOpacity
                style={{ alignItems: 'center', backgroundColor: !isDark ? 'rgba(217,119,6,0.1)' : C.cardInner, borderColor: !isDark ? '#D97706' : C.border, borderRadius: 14, borderWidth: !isDark ? 2 : 1, flex: 1, gap: 8, paddingVertical: 14, position: 'relative' }}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); if (isDark) toggleTheme(); }}
                activeOpacity={0.75}
              >
                <View style={{ alignItems: 'center', backgroundColor: !isDark ? 'rgba(217,119,6,0.18)' : C.accentBg, borderRadius: 18, height: 40, justifyContent: 'center', width: 40 }}>
                  <Ionicons name="sunny" size={20} color={!isDark ? '#D97706' : C.text3} />
                </View>
                <Text style={{ color: !isDark ? '#D97706' : C.text2, fontSize: 13, fontFamily: 'DMSans_700Bold' }}>Light</Text>
                {!isDark && (
                  <View style={{ alignItems: 'center', backgroundColor: '#D97706', borderRadius: 7, height: 14, justifyContent: 'center', position: 'absolute', right: 8, top: 8, width: 14 }}>
                    <Ionicons name="checkmark" size={9} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
              {/* Dark */}
              <TouchableOpacity
                style={{ alignItems: 'center', backgroundColor: isDark ? C.purpleBg : C.cardInner, borderColor: isDark ? C.purple : C.border, borderRadius: 14, borderWidth: isDark ? 2 : 1, flex: 1, gap: 8, paddingVertical: 14, position: 'relative' }}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); if (!isDark) toggleTheme(); }}
                activeOpacity={0.75}
              >
                <View style={{ alignItems: 'center', backgroundColor: isDark ? C.purpleBg : C.accentBg, borderRadius: 18, height: 40, justifyContent: 'center', width: 40 }}>
                  <Ionicons name="moon" size={18} color={isDark ? C.purple : C.text3} />
                </View>
                <Text style={{ color: isDark ? C.purple : C.text2, fontSize: 13, fontFamily: 'DMSans_700Bold' }}>Dark</Text>
                {isDark && (
                  <View style={{ alignItems: 'center', backgroundColor: C.purple, borderRadius: 7, height: 14, justifyContent: 'center', position: 'absolute', right: 8, top: 8, width: 14 }}>
                    <Ionicons name="checkmark" size={9} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </SettingsCard>

        {/* ── Preferences ── */}
        <SectionLabel text="Preferences" C={C} />
        <SettingsCard C={C}>
          <Row
            C={C}
            icon="notifications"
            iconColor={C.amber}
            iconBg={C.amberBg}
            label="Day in Review"
            sublabel="Daily 9 PM spending summary"
            right={
              <Switch
                value={notifEnabled}
                onValueChange={handleNotifToggle}
                trackColor={{ false: C.border, true: C.amber }}
                thumbColor="#fff"
              />
            }
          />
          <Row
            C={C}
            icon="lock-closed"
            iconColor={C.purple}
            iconBg={C.purpleBg}
            label="PIN & Biometric Lock"
            sublabel="Require auth to open app"
            right={
              <Switch
                value={pinEnabled}
                onValueChange={handlePinToggle}
                trackColor={{ false: C.border, true: C.purple }}
                thumbColor="#fff"
              />
            }
          />
          <Row
            C={C}
            icon="eye-off"
            iconColor="#60A5FA"
            iconBg="rgba(96,165,250,0.12)"
            label="Hide Balance"
            sublabel="Mask amounts on Home with eye toggle"
            right={
              <Switch
                value={hideBalanceEnabled}
                onValueChange={handleHideBalanceToggle}
                trackColor={{ false: C.border, true: '#60A5FA' }}
                thumbColor="#fff"
              />
            }
          />
          <Row
            C={C}
            icon="warning"
            iconColor="#F97316"
            iconBg="rgba(249,115,22,0.12)"
            label="Daily Spending Limit"
            sublabel={dailySpendLimit > 0 ? `Alert at ₹${dailySpendLimit.toLocaleString('en-IN')} / day` : 'Disabled'}
            onPress={() => { setDailyLimitInput(dailySpendLimit > 0 ? String(dailySpendLimit) : ''); setShowDailyLimitModal(true); }}
            right={<Ionicons name="chevron-forward" size={16} color={C.text3} />}
          />
          {pinEnabled && (
            <Row
              C={C}
              icon="key"
              iconColor={C.purple}
              iconBg={C.purpleBg}
              label="Change PIN"
              sublabel="Update your 4-digit unlock PIN"
              showSep={false}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowChangePin(true); }}
              right={<Ionicons name="chevron-forward" size={16} color={C.text3} />}
            />
          )}
        </SettingsCard>

        {/* ── Data & Privacy ── */}
        <SectionLabel text="Data & Privacy" C={C} />
        <SettingsCard C={C}>
          <Row
            C={C}
            icon="phone-portrait"
            iconColor={C.income}
            iconBg={C.incomeBg}
            label="Storage"
            right={<Text style={{ color: C.text3, fontSize: 13, fontFamily: 'DMSans_600SemiBold' }}>On-device only</Text>}
          />
          <Row
            C={C}
            icon="cloud-offline"
            iconColor={C.blue}
            iconBg={C.blueBg}
            label="Works offline"
            right={<Text style={{ color: C.text3, fontSize: 13, fontFamily: 'DMSans_600SemiBold' }}>Always</Text>}
          />
          <Row
            C={C}
            icon="eye-off"
            iconColor={C.purple}
            iconBg={C.purpleBg}
            label="Data sharing"
            right={<Text style={{ color: C.income, fontSize: 13, fontFamily: 'DMSans_700Bold' }}>Never</Text>}
          />
          <Row
            C={C}
            icon="shield-checkmark-outline"
            iconColor="#34D399"
            iconBg="rgba(52,211,153,0.12)"
            label="Screenshot Protection"
            sublabel="Screenshots are disabled to protect your data"
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(52,211,153,0.12)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#34D399' }} />
                <Text style={{ color: '#34D399', fontSize: 12, fontFamily: 'DMSans_700Bold' }}>Active</Text>
              </View>
            }
          />
          <Row
            C={C}
            icon="cloud-upload-outline"
            iconColor="#60A5FA"
            iconBg="rgba(96,165,250,0.12)"
            label="Backup Data"
            sublabel="Export all data as an encrypted JSON file"
            onPress={isBackingUp ? undefined : handleBackup}
            right={
              isBackingUp
                ? <Ionicons name="ellipsis-horizontal" size={16} color={C.text3} />
                : <Ionicons name="chevron-forward" size={16} color={C.text3} />
            }
          />
          <Row
            C={C}
            icon="cloud-download-outline"
            iconColor="#A78BFA"
            iconBg="rgba(167,139,250,0.12)"
            label="Restore Data"
            sublabel="Import from a Thunder Wallet backup file"
            showSep={false}
            onPress={isRestoring ? undefined : handleRestore}
            right={
              isRestoring
                ? <Ionicons name="ellipsis-horizontal" size={16} color={C.text3} />
                : <Ionicons name="chevron-forward" size={16} color={C.text3} />
            }
          />
        </SettingsCard>

        {/* ── Danger zone ── */}
        <SectionLabel text="Danger Zone" C={C} />
        <SettingsCard C={C}>
          <Row
            C={C}
            icon="trash"
            iconColor="#F87171"
            iconBg="rgba(248,113,113,0.12)"
            label="Reset All Data"
            sublabel="Permanently delete everything"
            destructive
            showSep={false}
            onPress={handleReset}
            right={<Ionicons name="chevron-forward" size={16} color="#F87171" />}
          />
        </SettingsCard>

        {/* ── About ── */}
        <SectionLabel text="About" C={C} />
        <SettingsCard C={C}>
          <Row
            C={C}
            icon="refresh"
            iconColor="#34D399"
            iconBg="rgba(52,211,153,0.12)"
            label="Check for Updates"
            sublabel={checking ? 'Checking…' : `Current: v${Constants.expoConfig?.version ?? '?'}`}
            onPress={checking ? undefined : handleCheckUpdate}
            right={
              checking
                ? <Ionicons name="ellipsis-horizontal" size={16} color={C.text3} />
                : <Ionicons name="chevron-forward" size={16} color={C.text3} />
            }
          />
          <Row
            C={C}
            icon="person-circle"
            iconColor={C.blue}
            iconBg={C.blueBg}
            label="Built by Tejas Mane"
            right={
              <TouchableOpacity onPress={() => Linking.openURL('https://github.com/iamtejas23')} activeOpacity={0.7}>
                <View style={{ alignItems: 'center', backgroundColor: C.cardInner, borderColor: C.border, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 5 }}>
                  <Ionicons name="logo-github" size={13} color={C.text2} />
                  <Text style={{ color: C.text2, fontSize: 12, fontFamily: 'DMSans_700Bold' }}>GitHub</Text>
                </View>
              </TouchableOpacity>
            }
          />
          <Row
            C={C}
            icon="shield-checkmark"
            iconColor={C.income}
            iconBg={C.incomeBg}
            label="Privacy first"
            sublabel="No cloud, no tracking, no ads"
            showSep={false}
            right={null}
          />
        </SettingsCard>

        {/* ── Footer ── */}
        <Text style={{ color: C.text3, fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
          Thunder Wallet v{Constants.expoConfig?.version ?? '1.0.62'}{'\n'}Your finances. Your device. Always private.
        </Text>

      </ScrollView>

      <UpdateModal
        visible={!!updateResult}
        latestVersion={updateResult?.latestVersion}
        downloadUrl={updateResult?.downloadUrl}
        onDismiss={() => setUpdateResult(null)}
      />

      {/* ── Daily Limit Modal ── */}
      <Modal visible={showDailyLimitModal} transparent animationType="fade" onRequestClose={() => setShowDailyLimitModal(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setShowDailyLimitModal(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={{ backgroundColor: C.card, borderRadius: 22, padding: 28, width: 320, borderWidth: 1, borderColor: C.border }}>
              <Text style={{ color: C.text1, fontSize: 18, fontFamily: 'DMSans_800ExtraBold', marginBottom: 4 }}>Daily Spending Limit</Text>
              <Text style={{ color: C.text3, fontSize: 13, fontFamily: 'DMSans_400Regular', lineHeight: 19, marginBottom: 20 }}>
                Get alerted when your daily expenses exceed this amount. Leave blank to disable.
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.cardInner, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 20 }}>
                <Text style={{ color: '#F97316', fontSize: 22, fontFamily: 'DMSans_900Black', marginRight: 6 }}>₹</Text>
                <TextInput
                  style={{ flex: 1, color: C.text1, fontSize: 26, fontFamily: 'DMSans_900Black' }}
                  value={dailyLimitInput}
                  onChangeText={setDailyLimitInput}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={C.text3}
                  autoFocus
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: C.cardInner, borderWidth: 1, borderColor: C.border, alignItems: 'center' }}
                  onPress={() => setShowDailyLimitModal(false)}
                >
                  <Text style={{ color: C.text2, fontFamily: 'DMSans_700Bold', fontSize: 15 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#F97316', alignItems: 'center' }}
                  onPress={handleSaveDailyLimit}
                >
                  <Text style={{ color: '#fff', fontFamily: 'DMSans_800ExtraBold', fontSize: 15 }}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

export default SettingsScreen;
