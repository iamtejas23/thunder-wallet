import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
let LocalAuthentication;
try {
  LocalAuthentication = require('expo-local-authentication');
} catch {
  LocalAuthentication = {
    hasHardwareAsync: async () => false,
    isEnrolledAsync: async () => false,
    authenticateAsync: async () => ({ success: false }),
  };
}
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const PIN_KEY = 'appPin';
export const PIN_ENABLED_KEY = 'pinEnabled';

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

export default function PinScreen({ mode = 'check', onSuccess, onCancel }) {
  const [digits, setDigits] = useState([]);
  const [confirmDigits, setConfirmDigits] = useState(null);
  const initialPhase = mode === 'setup' ? 'enter' : mode === 'change' ? 'verify' : 'check';
  const [phase, setPhase] = useState(initialPhase);
  const [error, setError] = useState('');
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const hasBiometrics = useRef(false);

  useEffect(() => {
    (async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      hasBiometrics.current = compatible && enrolled;
      if (mode === 'check' && hasBiometrics.current) {
        tryBiometric();
      }
    })();
  }, []);

  const tryBiometric = async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Thunder Wallet',
      fallbackLabel: 'Use PIN',
    });
    if (result.success) onSuccess();
  };

  const shake = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Vibration.vibrate(200);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleKey = async (key) => {
    if (key === '') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (key === '⌫') {
      setDigits((d) => d.slice(0, -1));
      setError('');
      return;
    }

    const next = [...digits, key];
    setDigits(next);
    if (next.length < 4) return;
    const pin = next.join('');

    if (mode === 'setup') {
      if (phase === 'enter') {
        setConfirmDigits(pin);
        setDigits([]);
        setPhase('confirm');
      } else {
        if (pin === confirmDigits) {
          await AsyncStorage.setItem(PIN_KEY, pin);
          await AsyncStorage.setItem(PIN_ENABLED_KEY, 'true');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onSuccess();
        } else {
          shake();
          setError("PINs don't match. Try again.");
          setDigits([]);
          setPhase('enter');
          setConfirmDigits(null);
        }
      }

    } else if (mode === 'change') {
      if (phase === 'verify') {
        const saved = await AsyncStorage.getItem(PIN_KEY);
        if (pin === saved) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setDigits([]);
          setError('');
          setPhase('enter');
        } else {
          shake();
          setError('Wrong PIN. Try again.');
          setDigits([]);
        }
      } else if (phase === 'enter') {
        setConfirmDigits(pin);
        setDigits([]);
        setPhase('confirm');
      } else {
        if (pin === confirmDigits) {
          await AsyncStorage.setItem(PIN_KEY, pin);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onSuccess();
        } else {
          shake();
          setError("PINs don't match. Try again.");
          setDigits([]);
          setPhase('enter');
          setConfirmDigits(null);
        }
      }

    } else {
      const saved = await AsyncStorage.getItem(PIN_KEY);
      if (pin === saved) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSuccess();
      } else {
        shake();
        setError('Wrong PIN. Try again.');
        setDigits([]);
      }
    }
  };

  const title =
    mode === 'setup'
      ? phase === 'enter' ? 'Create a 4-digit PIN' : 'Confirm your PIN'
      : mode === 'change'
        ? phase === 'verify' ? 'Enter current PIN' : phase === 'enter' ? 'Enter new PIN' : 'Confirm new PIN'
        : 'Enter PIN to unlock';

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.inner}>
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Ionicons name="lock-closed" size={28} color="#A78BFA" />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>Thunder Wallet</Text>
        </View>

        <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[styles.pinDot, digits.length > i && styles.pinDotFilled]}
            />
          ))}
        </Animated.View>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.keypad}>
          {KEYS.map((k, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.key, k === '' && { opacity: 0 }]}
              onPress={() => handleKey(k)}
              disabled={k === ''}
              activeOpacity={0.7}
            >
              <Text style={styles.keyText}>{k}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.bottomRow}>
          {hasBiometrics.current && mode === 'check' && (
            <TouchableOpacity onPress={tryBiometric} style={styles.bioBtn}>
              <Ionicons name="finger-print" size={26} color="#A78BFA" />
              <Text style={styles.bioBtnText}>Use Biometric</Text>
            </TouchableOpacity>
          )}
          {onCancel && (
            <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0E1A' },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 40, paddingHorizontal: 24 },
  header: { alignItems: 'center', gap: 10 },
  iconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(167,139,250,0.12)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#F9FAFB', fontSize: 22, fontFamily: 'DMSans_900Black', marginTop: 8 },
  subtitle: { color: 'rgba(249,250,251,0.3)', fontSize: 13, fontFamily: 'DMSans_600SemiBold' },
  dotsRow: { flexDirection: 'row', gap: 18 },
  pinDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'transparent' },
  pinDotFilled: { backgroundColor: '#A78BFA', borderColor: '#A78BFA' },
  error: { color: '#F87171', fontSize: 13, fontFamily: 'DMSans_700Bold' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, width: '100%', maxWidth: 300 },
  key: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#111827', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  keyText: { color: '#F9FAFB', fontSize: 26, fontFamily: 'DMSans_700Bold' },
  bottomRow: { flexDirection: 'row', gap: 20, alignItems: 'center' },
  bioBtn: { alignItems: 'center', gap: 6 },
  bioBtnText: { color: '#A78BFA', fontSize: 12, fontFamily: 'DMSans_700Bold' },
  cancelBtn: { paddingHorizontal: 20, paddingVertical: 10 },
  cancelText: { color: 'rgba(249,250,251,0.4)', fontSize: 14, fontFamily: 'DMSans_700Bold' },
});
