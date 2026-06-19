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
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useTheme } from './ThemeContext';
import PinScreen, { PIN_ENABLED_KEY, PIN_KEY } from './PinScreen';
import { isNotificationsEnabled, setNotificationsEnabled, requestNotificationPermission } from './NotificationService';

const SettingsScreen = ({ resetAllData }) => {
  const { C, toggleTheme, isDark } = useTheme();
  const navigation = useNavigation();
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
    Alert.alert(
      'Reset all data?',
      'This will permanently delete all your transactions and reset the monthly budget. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything', style: 'destructive',
          onPress: async () => {
            if (resetAllData) await resetAllData();
            Alert.alert('Data reset', 'All data has been cleared.');
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
    <SafeAreaView style={[styles.safeArea, { backgroundColor: C.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: C.card, borderColor: C.border }]} onPress={() => navigation.navigate('Dashboard')}>
            <Ionicons name="home-outline" size={19} color={C.text2} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: C.text1 }]}>Settings</Text>
          <View style={styles.iconBtnPlaceholder} />
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.logoRing, { backgroundColor: C.accentBg, borderColor: C.accentBorder }]}>
            <Image source={require('./assets/logo.png')} style={styles.logoImg} />
          </View>
          <Text style={[styles.heroTitle, { color: C.text1 }]}>Thunder Wallet</Text>
          <Text style={[styles.heroSub, { color: C.text2 }]}>Smart local expense manager</Text>
          <View style={[styles.heroBadge, { backgroundColor: C.accentBg, borderColor: C.accentBorder }]}>
            <Ionicons name="flash" size={12} color={C.accent} />
            <Text style={[styles.heroBadgeText, { color: C.accent }]}>v1.1.0 · Free</Text>
          </View>
        </View>

        {/* APPEARANCE */}
        <View style={[styles.section, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={styles.sectionHead}>
            <View style={[styles.sectionHeadIcon, { backgroundColor: C.purpleBg }]}>
              <Ionicons name="color-palette" size={16} color={C.purple} />
            </View>
            <Text style={[styles.sectionTitle, { color: C.text1 }]}>Appearance</Text>
          </View>
          <Text style={[styles.sectionDesc, { color: C.text2 }]}>Choose how Thunder Wallet looks on your device.</Text>
          <View style={styles.themeRow}>
            <TouchableOpacity style={[styles.themeBtn, { backgroundColor: C.cardInner, borderColor: C.border }, !isDark && { backgroundColor: 'rgba(217,119,6,0.12)', borderColor: '#D97706', borderWidth: 2 }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); if (isDark) toggleTheme(); }} activeOpacity={0.8}>
              <View style={[styles.themeIconCircle, { backgroundColor: !isDark ? 'rgba(217,119,6,0.2)' : C.accentBg }]}>
                <Ionicons name="sunny" size={22} color={!isDark ? '#D97706' : C.text3} />
              </View>
              <Text style={[styles.themeBtnLabel, { color: !isDark ? '#D97706' : C.text2 }]}>Light</Text>
              {!isDark && (<View style={[styles.themeActive, { backgroundColor: '#D97706' }]}><Ionicons name="checkmark" size={10} color="#fff" /></View>)}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.themeBtn, { backgroundColor: C.cardInner, borderColor: C.border }, isDark && { backgroundColor: C.purpleBg, borderColor: C.purple, borderWidth: 2 }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); if (!isDark) toggleTheme(); }} activeOpacity={0.8}>
              <View style={[styles.themeIconCircle, { backgroundColor: isDark ? C.purpleBg : C.accentBg }]}>
                <Ionicons name="moon" size={20} color={isDark ? C.purple : C.text3} />
              </View>
              <Text style={[styles.themeBtnLabel, { color: isDark ? C.purple : C.text2 }]}>Dark</Text>
              {isDark && (<View style={[styles.themeActive, { backgroundColor: C.purple }]}><Ionicons name="checkmark" size={10} color="#fff" /></View>)}
            </TouchableOpacity>
          </View>
        </View>

        {/* SECURITY */}
        <View style={[styles.section, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={styles.sectionHead}>
            <View style={[styles.sectionHeadIcon, { backgroundColor: C.purpleBg }]}>
              <Ionicons name="lock-closed" size={16} color={C.purple} />
            </View>
            <Text style={[styles.sectionTitle, { color: C.text1 }]}>Security</Text>
          </View>

          <View style={[styles.toggleRow, { borderBottomColor: C.border }]}>
            <View style={[styles.infoIcon, { backgroundColor: C.purpleBg }]}>
              <Ionicons name="keypad" size={17} color={C.purple} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoValue, { color: C.text1 }]}>PIN / Biometric Lock</Text>
              <Text style={[styles.infoLabel, { color: C.text2 }]}>Require authentication to open</Text>
            </View>
            <Switch
              value={pinEnabled}
              onValueChange={handlePinToggle}
              trackColor={{ false: C.border, true: C.purple }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* NOTIFICATIONS */}
        <View style={[styles.section, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={styles.sectionHead}>
            <View style={[styles.sectionHeadIcon, { backgroundColor: C.amberBg }]}>
              <Ionicons name="notifications" size={16} color={C.amber} />
            </View>
            <Text style={[styles.sectionTitle, { color: C.text1 }]}>Notifications</Text>
          </View>

          <View style={styles.toggleRow}>
            <View style={[styles.infoIcon, { backgroundColor: C.amberBg }]}>
              <Ionicons name="moon" size={17} color={C.amber} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoValue, { color: C.text1 }]}>Day in Review (9pm)</Text>
              <Text style={[styles.infoLabel, { color: C.text2 }]}>Daily spending summary notification</Text>
            </View>
            <Switch
              value={notifEnabled}
              onValueChange={handleNotifToggle}
              trackColor={{ false: C.border, true: C.amber }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* DATA & PRIVACY */}
        <View style={[styles.section, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={styles.sectionHead}>
            <View style={[styles.sectionHeadIcon, { backgroundColor: C.blueBg }]}>
              <Ionicons name="server" size={16} color={C.blue} />
            </View>
            <Text style={[styles.sectionTitle, { color: C.text1 }]}>Data & Privacy</Text>
          </View>
          {[
            { icon: 'shield-checkmark', color: C.income, iconBg: C.incomeBg, label: 'Storage', value: 'On-device only' },
            { icon: 'cloud-offline', color: C.blue, iconBg: C.blueBg, label: 'Works offline', value: 'Always' },
            { icon: 'lock-closed', color: C.purple, iconBg: C.purpleBg, label: 'Privacy', value: 'No data shared' },
          ].map((item, i) => (
            <View key={item.label} style={[styles.infoRow, i > 0 && { borderTopColor: C.border, borderTopWidth: 1 }]}>
              <View style={[styles.infoIcon, { backgroundColor: item.iconBg }]}>
                <Ionicons name={item.icon} size={17} color={item.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoLabel, { color: C.text2 }]}>{item.label}</Text>
                <Text style={[styles.infoValue, { color: C.text1 }]}>{item.value}</Text>
              </View>
            </View>
          ))}
          <TouchableOpacity style={[styles.resetBtn, { backgroundColor: C.expenseBg, borderColor: `${C.expense}35` }]} onPress={handleReset} activeOpacity={0.8}>
            <View style={[styles.resetIconWrap, { backgroundColor: `${C.expense}20` }]}>
              <Ionicons name="trash" size={18} color={C.expense} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.resetLabel, { color: C.expense }]}>Reset All Data</Text>
              <Text style={[styles.resetSub, { color: C.text2 }]}>Permanently delete all transactions & budget</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.expense} />
          </TouchableOpacity>
        </View>

        {/* FEATURES */}
        <View style={[styles.section, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={styles.sectionHead}>
            <View style={[styles.sectionHeadIcon, { backgroundColor: C.amberBg }]}>
              <Ionicons name="sparkles" size={16} color={C.amber} />
            </View>
            <Text style={[styles.sectionTitle, { color: C.text1 }]}>Features</Text>
          </View>
          {[
            { icon: 'pie-chart', color: '#F87171', label: 'Interactive spending chart' },
            { icon: 'create', color: C.blue, label: 'Edit & back-date transactions' },
            { icon: 'options', color: C.purple, label: 'Per-category budget limits' },
            { icon: 'repeat', color: C.income, label: 'Recurring transaction tags' },
            { icon: 'trophy', color: C.amber, label: 'Savings goals with confetti' },
            { icon: 'flame', color: '#FB923C', label: 'Under-budget streak tracking' },
            { icon: 'notifications', color: C.blue, label: '9pm Day in Review notification' },
            { icon: 'lock-closed', color: C.purple, label: 'PIN & biometric lock' },
            { icon: 'flask', color: '#34D399', label: 'What-If spending simulator' },
            { icon: 'color-palette', color: '#A78BFA', label: 'Dark & light mode' },
          ].map((item, i) => (
            <View key={item.label} style={[styles.featureRow, i > 0 && { borderTopColor: C.border, borderTopWidth: 1 }]}>
              <View style={[styles.infoIcon, { backgroundColor: `${item.color}18` }]}>
                <Ionicons name={item.icon} size={16} color={item.color} />
              </View>
              <Text style={[styles.featureLabel, { color: C.text2 }]}>{item.label}</Text>
              <Ionicons name="checkmark-circle" size={16} color={C.income} />
            </View>
          ))}
        </View>

        {/* ABOUT */}
        <View style={[styles.section, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={styles.sectionHead}>
            <View style={[styles.sectionHeadIcon, { backgroundColor: C.accentBg }]}>
              <Ionicons name="person-circle" size={16} color={C.accent} />
            </View>
            <Text style={[styles.sectionTitle, { color: C.text1 }]}>About</Text>
          </View>
          <Text style={[styles.aboutText, { color: C.text2 }]}>
            Built by Tejas Mane. All data stays on your device — nothing is ever sent to the cloud. Your finances, fully private.
          </Text>
        </View>

        <TouchableOpacity style={styles.githubBtn} onPress={() => Linking.openURL('https://github.com/iamtejas23')} activeOpacity={0.85}>
          <View style={styles.githubIconWrap}>
            <Ionicons name="logo-github" size={19} color="#fff" />
          </View>
          <Text style={styles.githubBtnText}>View on GitHub</Text>
          <Ionicons name="arrow-forward" size={17} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 110 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  headerTitle: { fontSize: 18, fontWeight: '900' },
  iconBtn: { alignItems: 'center', borderRadius: 20, borderWidth: 1, elevation: 2, height: 40, justifyContent: 'center', width: 40 },
  iconBtnPlaceholder: { height: 40, width: 40 },
  hero: { alignItems: 'center', marginBottom: 22 },
  logoRing: { alignItems: 'center', borderRadius: 52, borderWidth: 1, height: 104, justifyContent: 'center', width: 104 },
  logoImg: { borderRadius: 22, height: 78, width: 78 },
  heroTitle: { fontSize: 26, fontWeight: '900', marginTop: 16 },
  heroSub: { fontSize: 14, lineHeight: 20, marginTop: 5 },
  heroBadge: { alignItems: 'center', borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 5, marginTop: 12, paddingHorizontal: 12, paddingVertical: 5 },
  heroBadgeText: { fontSize: 12, fontWeight: '800' },
  section: { borderRadius: 18, borderWidth: 1, marginBottom: 14, overflow: 'hidden', padding: 16 },
  sectionHead: { alignItems: 'center', flexDirection: 'row', gap: 10, marginBottom: 4 },
  sectionHeadIcon: { alignItems: 'center', borderRadius: 10, height: 32, justifyContent: 'center', width: 32 },
  sectionTitle: { fontSize: 16, fontWeight: '900' },
  sectionDesc: { fontSize: 13, lineHeight: 19, marginBottom: 14, marginTop: 4 },
  themeRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  themeBtn: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flex: 1, gap: 8, paddingVertical: 16, position: 'relative' },
  themeIconCircle: { alignItems: 'center', borderRadius: 20, height: 44, justifyContent: 'center', width: 44 },
  themeBtnLabel: { fontSize: 13, fontWeight: '800' },
  themeActive: { alignItems: 'center', borderRadius: 8, height: 16, justifyContent: 'center', position: 'absolute', right: 8, top: 8, width: 16 },
  toggleRow: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingTop: 12 },
  infoRow: { alignItems: 'center', flexDirection: 'row', paddingVertical: 12 },
  infoIcon: { alignItems: 'center', borderRadius: 12, height: 38, justifyContent: 'center', marginRight: 12, width: 38 },
  infoLabel: { fontSize: 12, fontWeight: '600' },
  infoValue: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  resetBtn: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', marginTop: 14, padding: 14 },
  resetIconWrap: { alignItems: 'center', borderRadius: 12, height: 40, justifyContent: 'center', width: 40 },
  resetLabel: { fontSize: 15, fontWeight: '900' },
  resetSub: { fontSize: 12, marginTop: 2 },
  featureRow: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 10 },
  featureLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  aboutText: { fontSize: 14, lineHeight: 22, marginTop: 8 },
  githubBtn: { alignItems: 'center', backgroundColor: '#1a1a2e', borderRadius: 14, elevation: 4, flexDirection: 'row', gap: 10, justifyContent: 'center', minHeight: 54, paddingHorizontal: 20, shadowColor: '#000', shadowOffset: { height: 6, width: 0 }, shadowOpacity: 0.3, shadowRadius: 14 },
  githubIconWrap: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10, height: 30, justifyContent: 'center', width: 30 },
  githubBtnText: { color: '#FFFFFF', flex: 1, fontSize: 15, fontWeight: '900' },
});

export default SettingsScreen;
