import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from './ThemeContext';
import PinScreen, { PIN_ENABLED_KEY, PIN_KEY } from './PinScreen';
import { isNotificationsEnabled, setNotificationsEnabled, requestNotificationPermission } from './NotificationService';

// ─── Row components ───────────────────────────────────────────────────────────
function SettingRow({ icon, iconBg, iconColor, label, sub, right, onPress, isFirst, isLast, C, danger }) {
  const Row = onPress ? TouchableOpacity : View;
  return (
    <Row
      onPress={onPress}
      activeOpacity={0.65}
      style={[
        ss.row,
        { backgroundColor: C.card, borderColor: C.border },
        isFirst && ss.rowFirst,
        isLast && ss.rowLast,
        !isLast && { borderBottomWidth: 1, borderBottomColor: C.border },
      ]}
    >
      <View style={[ss.rowIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={16} color={iconColor} />
      </View>
      <View style={ss.rowContent}>
        <Text style={[ss.rowLabel, { color: danger ? '#F87171' : C.text1 }]}>{label}</Text>
        {sub ? <Text style={[ss.rowSub, { color: C.text3 }]}>{sub}</Text> : null}
      </View>
      {right}
      {onPress && !right && (
        <Ionicons name="chevron-forward" size={14} color={C.text3} style={{ marginLeft: 4 }} />
      )}
    </Row>
  );
}

function GroupLabel({ label, C }) {
  return <Text style={[ss.groupLabel, { color: C.text3 }]}>{label}</Text>;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
const SettingsScreen = ({ resetAllData }) => {
  const { C, toggleTheme, isDark } = useTheme();
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);

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
        Alert.alert('Permission needed', 'Enable notifications in device Settings.');
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
      Alert.alert('Remove PIN?', 'App will no longer require a PIN to open.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive', onPress: async () => {
            try {
              await AsyncStorage.multiRemove([PIN_ENABLED_KEY, PIN_KEY]);
              setPinEnabled(false);
            } catch {
              Alert.alert('Error', 'Could not remove PIN. Please try again.');
            }
          },
        },
      ]);
    }
  };

  const handleReset = () => {
    Alert.alert(
      'Reset all data?',
      'This permanently deletes all transactions and resets your budget. Cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything', style: 'destructive',
          onPress: async () => {
            if (resetAllData) await resetAllData();
            Alert.alert('Done', 'All data cleared.');
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

  const sw = (val, onChange, color) => (
    <Switch
      value={val}
      onValueChange={onChange}
      trackColor={{ false: C.border, true: color }}
      thumbColor="#fff"
      style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
    />
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}
      >
        {/* ── Header ── */}
        <View style={ss.header}>
          <Text style={[ss.headerTitle, { color: C.text1 }]}>Settings</Text>
          <View style={[ss.versionPill, { backgroundColor: C.accentBg, borderColor: C.accentBorder }]}>
            <Text style={[ss.versionText, { color: C.text2 }]}>v1.1.0</Text>
          </View>
        </View>

        {/* ── App identity card ── */}
        <View style={[ss.appCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <Image source={require('./assets/logo.png')} style={ss.appLogo} />
          <View style={{ flex: 1 }}>
            <Text style={[ss.appName, { color: C.text1 }]}>Thunder Wallet</Text>
            <Text style={[ss.appMeta, { color: C.text3 }]}>Local · Private · Free</Text>
          </View>
          <View style={[ss.freeBadge, { backgroundColor: C.incomeBg }]}>
            <Text style={[ss.freeBadgeText, { color: '#34D399' }]}>FREE</Text>
          </View>
        </View>

        {/* ── PREFERENCES ── */}
        <GroupLabel label="PREFERENCES" C={C} />
        <View style={[ss.group, { borderColor: C.border }]}>
          <SettingRow
            C={C} isFirst isLast={false}
            icon="moon" iconBg="rgba(167,139,250,0.15)" iconColor="#A78BFA"
            label="Dark Mode"
            sub={isDark ? 'On' : 'Off'}
            right={sw(isDark, () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleTheme(); }, '#A78BFA')}
          />
          <SettingRow
            C={C} isFirst={false} isLast={false}
            icon="notifications" iconBg="rgba(252,211,77,0.15)" iconColor="#FCD34D"
            label="Daily Review (9pm)"
            sub="Spending summary notification"
            right={sw(notifEnabled, handleNotifToggle, '#FCD34D')}
          />
          <SettingRow
            C={C} isFirst={false} isLast
            icon="finger-print" iconBg="rgba(96,165,250,0.15)" iconColor="#60A5FA"
            label="PIN & Biometric"
            sub={pinEnabled ? 'Enabled' : 'Disabled'}
            right={sw(pinEnabled, handlePinToggle, '#60A5FA')}
          />
        </View>

        {/* ── PRIVACY ── */}
        <GroupLabel label="PRIVACY" C={C} />
        <View style={[ss.group, { borderColor: C.border }]}>
          <SettingRow
            C={C} isFirst isLast={false}
            icon="phone-portrait" iconBg="rgba(52,211,153,0.15)" iconColor="#34D399"
            label="Storage"
            right={<Text style={[ss.rowVal, { color: C.text3 }]}>On-device only</Text>}
          />
          <SettingRow
            C={C} isFirst={false} isLast={false}
            icon="cloud-offline" iconBg="rgba(96,165,250,0.12)" iconColor="#60A5FA"
            label="Cloud Sync"
            right={<Text style={[ss.rowVal, { color: C.text3 }]}>Never</Text>}
          />
          <SettingRow
            C={C} isFirst={false} isLast
            icon="eye-off" iconBg="rgba(167,139,250,0.12)" iconColor="#A78BFA"
            label="Data Sharing"
            right={<Text style={[ss.rowVal, { color: C.text3 }]}>None</Text>}
          />
        </View>

        {/* ── ABOUT ── */}
        <GroupLabel label="ABOUT" C={C} />
        <View style={[ss.group, { borderColor: C.border }]}>
          <SettingRow
            C={C} isFirst isLast={false}
            icon="code-slash" iconBg="rgba(255,255,255,0.08)" iconColor={C.text2}
            label="Developer"
            right={<Text style={[ss.rowVal, { color: C.text3 }]}>Tejas Mane</Text>}
          />
          <SettingRow
            C={C} isFirst={false} isLast={false}
            icon="logo-github" iconBg="rgba(255,255,255,0.08)" iconColor={C.text2}
            label="GitHub"
            onPress={() => Linking.openURL('https://github.com/iamtejas23')}
            right={<Text style={[ss.rowVal, { color: C.text3 }]}>@iamtejas23</Text>}
          />
          <SettingRow
            C={C} isFirst={false} isLast
            icon="document-text" iconBg="rgba(255,255,255,0.08)" iconColor={C.text2}
            label="License"
            right={<Text style={[ss.rowVal, { color: C.text3 }]}>MIT</Text>}
          />
        </View>

        {/* ── DANGER ZONE ── */}
        <GroupLabel label="DANGER ZONE" C={C} />
        <View style={[ss.group, { borderColor: 'rgba(248,113,113,0.2)' }]}>
          <SettingRow
            C={C} isFirst isLast
            icon="trash" iconBg="rgba(248,113,113,0.15)" iconColor="#F87171"
            label="Reset All Data"
            sub="Delete all transactions & budget"
            onPress={handleReset}
            danger
          />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

const ss = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8, paddingBottom: 20,
  },
  headerTitle: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  versionPill: {
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  versionText: { fontSize: 12, fontWeight: '700' },

  appCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 16, borderWidth: 1,
    padding: 14, marginBottom: 24,
  },
  appLogo: { width: 48, height: 48, borderRadius: 13 },
  appName: { fontSize: 16, fontWeight: '900' },
  appMeta: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  freeBadge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  freeBadgeText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },

  groupLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.1,
    marginBottom: 6, marginLeft: 4,
  },
  group: {
    borderRadius: 16, borderWidth: 1,
    overflow: 'hidden', marginBottom: 24,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13, gap: 12,
  },
  rowFirst: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  rowLast: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  rowIcon: {
    width: 32, height: 32, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 14, fontWeight: '600' },
  rowSub: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  rowVal: { fontSize: 13, fontWeight: '600' },
});

export default SettingsScreen;
