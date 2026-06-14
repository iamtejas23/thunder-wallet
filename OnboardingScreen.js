import React, { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestNotificationPermission, setNotificationsEnabled } from './NotificationService';

const { width } = Dimensions.get('window');
const ONBOARDING_KEY = 'onboardingDone';
const BUDGET_KEY = 'monthlyBudget';

const SLIDES = [
  {
    icon: 'lock-closed',
    iconColor: '#34D399',
    title: 'Your money,\njust between you and me.',
    body: 'No account. No cloud. No ads. Everything stays on your phone — always private, always offline.',
  },
  {
    icon: 'wallet',
    iconColor: '#60A5FA',
    title: "What's your monthly budget?",
    body: 'Set a limit and Thunder Wallet will guide you to stay under it every single day.',
  },
  {
    icon: 'flash',
    iconColor: '#FCD34D',
    title: "You're all set.",
    body: 'Log your first income to see your balance come alive. Takes 10 seconds.',
  },
];

const BUDGET_PRESETS = [10000, 20000, 30000, 50000, 75000, 100000];

export default function OnboardingScreen({ onDone }) {
  const [step, setStep] = useState(0);
  const [budget, setBudget] = useState('30000');
  const [notifGranted, setNotifGranted] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const goNext = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 1) {
      const b = Number.parseFloat(budget);
      const val = Number.isFinite(b) && b > 0 ? b : 30000;
      await AsyncStorage.setItem(BUDGET_KEY, String(val));
    }
    if (step === SLIDES.length - 1) {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      onDone();
      return;
    }
    Animated.timing(slideAnim, {
      toValue: -(step + 1) * width,
      duration: 320,
      useNativeDriver: true,
    }).start(() => setStep((s) => s + 1));
  };

  const handleNotifToggle = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const granted = await requestNotificationPermission();
    if (granted) {
      await setNotificationsEnabled(true);
      setNotifGranted(true);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === step && styles.dotActive]}
          />
        ))}
      </View>

      <View style={styles.slideContainer}>
        <View style={[styles.iconCircle, { backgroundColor: `${SLIDES[step].iconColor}18`, borderColor: `${SLIDES[step].iconColor}35` }]}>
          <Ionicons name={SLIDES[step].icon} size={44} color={SLIDES[step].iconColor} />
        </View>
        <Text style={styles.title}>{SLIDES[step].title}</Text>
        <Text style={styles.body}>{SLIDES[step].body}</Text>

        {step === 1 && (
          <View style={styles.budgetBlock}>
            <View style={styles.budgetInputRow}>
              <Text style={styles.rupeeSymbol}>₹</Text>
              <TextInput
                style={styles.budgetInput}
                value={budget}
                onChangeText={setBudget}
                keyboardType="number-pad"
                placeholderTextColor="#4B5563"
                selectTextOnFocus
              />
            </View>
            <View style={styles.presetsRow}>
              {BUDGET_PRESETS.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.presetChip, budget === String(p) && styles.presetChipActive]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setBudget(String(p)); }}
                >
                  <Text style={[styles.presetText, budget === String(p) && styles.presetTextActive]}>
                    {p >= 100000 ? '₹1L' : p >= 1000 ? `₹${p / 1000}k` : `₹${p}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {step === 2 && (
          <TouchableOpacity
            style={[styles.notifBtn, notifGranted && styles.notifBtnDone]}
            onPress={notifGranted ? undefined : handleNotifToggle}
            activeOpacity={notifGranted ? 1 : 0.8}
          >
            <Ionicons name={notifGranted ? 'checkmark-circle' : 'notifications'} size={18} color={notifGranted ? '#34D399' : '#60A5FA'} />
            <Text style={[styles.notifBtnText, notifGranted && { color: '#34D399' }]}>
              {notifGranted ? 'Daily reminders enabled!' : 'Enable 9pm Day in Review'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={styles.nextBtn} onPress={goNext} activeOpacity={0.85}>
        <Text style={styles.nextBtnText}>
          {step === SLIDES.length - 1 ? 'Start Tracking' : 'Continue'}
        </Text>
        <Ionicons name="arrow-forward" size={18} color="#000" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0E1A', paddingHorizontal: 28, justifyContent: 'space-between', paddingBottom: 32 },
  dotsRow: { flexDirection: 'row', gap: 6, justifyContent: 'center', paddingTop: 24 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)' },
  dotActive: { width: 22, backgroundColor: '#FFFFFF' },
  slideContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 0 },
  iconCircle: { width: 96, height: 96, borderRadius: 48, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
  title: { color: '#F9FAFB', fontSize: 30, fontWeight: '900', textAlign: 'center', lineHeight: 38, marginBottom: 14 },
  body: { color: 'rgba(249,250,251,0.55)', fontSize: 16, textAlign: 'center', lineHeight: 24, paddingHorizontal: 8 },
  budgetBlock: { marginTop: 28, width: '100%', gap: 16 },
  budgetInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', borderRadius: 16, borderWidth: 2, borderColor: '#60A5FA', paddingHorizontal: 20, minHeight: 64 },
  rupeeSymbol: { color: '#60A5FA', fontSize: 28, fontWeight: '900', marginRight: 8 },
  budgetInput: { flex: 1, color: '#F9FAFB', fontSize: 32, fontWeight: '900' },
  presetsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  presetChip: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#1A2235', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  presetChipActive: { backgroundColor: 'rgba(96,165,250,0.15)', borderColor: '#60A5FA' },
  presetText: { color: 'rgba(249,250,251,0.5)', fontSize: 13, fontWeight: '700' },
  presetTextActive: { color: '#60A5FA' },
  notifBtn: { marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(96,165,250,0.12)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(96,165,250,0.3)', paddingHorizontal: 20, paddingVertical: 14 },
  notifBtnDone: { backgroundColor: 'rgba(52,211,153,0.1)', borderColor: 'rgba(52,211,153,0.3)' },
  notifBtnText: { color: '#60A5FA', fontSize: 14, fontWeight: '800' },
  nextBtn: { backgroundColor: '#FFFFFF', borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 56 },
  nextBtnText: { color: '#000', fontSize: 16, fontWeight: '900' },
});
