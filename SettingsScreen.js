import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { useTheme } from './ThemeContext';
import MeshBackground from './MeshBackground';
import UpdateModal from './UpdateModal';
import PinScreen, { PIN_ENABLED_KEY, PIN_KEY } from './PinScreen';
import { isNotificationsEnabled, setNotificationsEnabled, requestNotificationPermission } from './NotificationService';

// ── Primitives ─────────────────────────────────────────────────────────────────

function SectionLabel({ text, C }) {
  return (
    <Text style={{ color: C.text3, fontSize: 11, fontWeight: '800', letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 }}>
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
        <Text style={{ color: labelColor, fontSize: 15, fontWeight: '600' }}>{label}</Text>
        {sublabel ? <Text style={{ color: C.text3, fontSize: 12, marginTop: 1 }}>{sublabel}</Text> : null}
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

const SettingsScreen = ({ resetAllData }) => {
  const { C, toggleTheme, isDark } = useTheme();
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updateResult, setUpdateResult] = useState(null);

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
      const [notif, pin] = await Promise.all([
        isNotificationsEnabled(),
        AsyncStorage.getItem(PIN_ENABLED_KEY),
      ]);
      setNotifEnabled(notif);
      setPinEnabled(pin === 'true');
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <MeshBackground blobs="analytics" isDark={C.isDark} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 110 }}
      >

        {/* ── Page title ── */}
        <Text style={{ color: C.text1, fontSize: 32, fontWeight: '900', marginBottom: 24, letterSpacing: -0.5 }}>
          Settings
        </Text>

        {/* ── Profile card ── */}
        <View style={{ alignItems: 'center', backgroundColor: C.card, borderColor: C.border, borderRadius: 22, borderWidth: 1, marginBottom: 28, paddingVertical: 28 }}>
          <View style={{ alignItems: 'center', backgroundColor: C.accentBg, borderColor: C.accentBorder, borderRadius: 36, borderWidth: 1, height: 72, justifyContent: 'center', width: 72, marginBottom: 14 }}>
            <Image source={require('./assets/logo.png')} style={{ borderRadius: 16, height: 54, width: 54 }} resizeMode="cover" />
          </View>
          <Text style={{ color: C.text1, fontSize: 20, fontWeight: '900', letterSpacing: -0.3 }}>Thunder Wallet</Text>
          <Text style={{ color: C.text3, fontSize: 13, marginTop: 3 }}>Smart local expense manager</Text>
          <View style={{ alignItems: 'center', backgroundColor: C.accentBg, borderColor: C.accentBorder, borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 5, marginTop: 12, paddingHorizontal: 12, paddingVertical: 5 }}>
            <Ionicons name="flash" size={11} color={C.accent} />
            <Text style={{ color: C.accent, fontSize: 12, fontWeight: '800' }}>v{Constants.expoConfig?.version ?? '1.0.62'} · Free</Text>
          </View>
        </View>

        {/* ── Appearance ── */}
        <SectionLabel text="Appearance" C={C} />
        <SettingsCard C={C}>
          {/* Theme toggle — inline visual picker */}
          <View style={{ padding: 14 }}>
            <Text style={{ color: C.text2, fontSize: 13, fontWeight: '600', marginBottom: 10, marginLeft: 2 }}>Theme</Text>
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
                <Text style={{ color: !isDark ? '#D97706' : C.text2, fontSize: 13, fontWeight: '700' }}>Light</Text>
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
                <Text style={{ color: isDark ? C.purple : C.text2, fontSize: 13, fontWeight: '700' }}>Dark</Text>
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
            showSep={false}
            right={
              <Switch
                value={pinEnabled}
                onValueChange={handlePinToggle}
                trackColor={{ false: C.border, true: C.purple }}
                thumbColor="#fff"
              />
            }
          />
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
            right={<Text style={{ color: C.text3, fontSize: 13, fontWeight: '600' }}>On-device only</Text>}
          />
          <Row
            C={C}
            icon="cloud-offline"
            iconColor={C.blue}
            iconBg={C.blueBg}
            label="Works offline"
            right={<Text style={{ color: C.text3, fontSize: 13, fontWeight: '600' }}>Always</Text>}
          />
          <Row
            C={C}
            icon="eye-off"
            iconColor={C.purple}
            iconBg={C.purpleBg}
            label="Data sharing"
            right={<Text style={{ color: C.income, fontSize: 13, fontWeight: '700' }}>Never</Text>}
          />
          <Row
            C={C}
            icon="camera-off"
            iconColor="#34D399"
            iconBg="rgba(52,211,153,0.12)"
            label="Screenshot Protection"
            sublabel="Screenshots are disabled to protect your data"
            showSep={false}
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(52,211,153,0.12)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#34D399' }} />
                <Text style={{ color: '#34D399', fontSize: 12, fontWeight: '700' }}>Active</Text>
              </View>
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
                  <Text style={{ color: C.text2, fontSize: 12, fontWeight: '700' }}>GitHub</Text>
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
    </SafeAreaView>
  );
};

export default SettingsScreen;
