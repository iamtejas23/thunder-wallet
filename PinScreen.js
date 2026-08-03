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
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

export const PIN_KEY = 'appPin';
export const PIN_ENABLED_KEY = 'pinEnabled';

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30000;

/** Read PIN from SecureStore; migrate plaintext AsyncStorage PIN once. */
export async function getStoredPin() {
  try {
    const secure = await SecureStore.getItemAsync(PIN_KEY);
    if (secure) return secure;
    const legacy = await AsyncStorage.getItem(PIN_KEY);
    if (legacy) {
      await SecureStore.setItemAsync(PIN_KEY, legacy);
      await AsyncStorage.removeItem(PIN_KEY);
      return legacy;
    }
  } catch (_) {}
  return null;
}

export async function setStoredPin(pin) {
  await SecureStore.setItemAsync(PIN_KEY, pin);
  try { await AsyncStorage.removeItem(PIN_KEY); } catch (_) {}
}

export async function clearStoredPin() {
  try { await SecureStore.deleteItemAsync(PIN_KEY); } catch (_) {}
  try { await AsyncStorage.removeItem(PIN_KEY); } catch (_) {}
  await AsyncStorage.removeItem(PIN_ENABLED_KEY);
}

export default function PinScreen({ mode = 'check', onSuccess, onCancel }) {
  const [digits, setDigits] = useState([]);
  const [confirmDigits, setConfirmDigits] = useState(null);
  const initialPhase = mode === 'setup' ? 'enter' : mode === 'change' ? 'verify' : 'check';
  const [phase, setPhase] = useState(initialPhase);
  const [error, setError] = useState('');
  const [bioAvailable, setBioAvailable] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);
  const [lockRemain, setLockRemain] = useState(0);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const locked = lockUntil > Date.now();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (!cancelled && compatible && enrolled) {
          setBioAvailable(true);
          if (mode === 'check') tryBiometric();
        }
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, [mode]);

  useEffect(() => {
    if (!locked) { setLockRemain(0); return; }
    const tick = () => {
      const left = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      setLockRemain(left);
      if (left <= 0) setLockUntil(0);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [lockUntil, locked]);

  const tryBiometric = async () => {
    if (locked) return;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Thunder Wallet',
        fallbackLabel: 'Use PIN',
        cancelLabel: 'Cancel',
      });
      if (result.success) onSuccess();
    } catch (_) {}
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

  const registerFailure = () => {
    const next = failedAttempts + 1;
    setFailedAttempts(next);
    shake();
    if (next >= MAX_ATTEMPTS) {
      setLockUntil(Date.now() + LOCKOUT_MS);
      setFailedAttempts(0);
      setError(`Too many attempts. Try again in ${LOCKOUT_MS / 1000}s.`);
    } else {
      setError(`Wrong PIN. Try again. (${MAX_ATTEMPTS - next} left)`);
    }
    setDigits([]);
  };

  const handleKey = async (key) => {
    if (key === '' || locked) return;
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
          await setStoredPin(pin);
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
        const saved = await getStoredPin();
        if (pin === saved) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setDigits([]);
          setError('');
          setFailedAttempts(0);
          setPhase('enter');
        } else {
          registerFailure();
        }
      } else if (phase === 'enter') {
        setConfirmDigits(pin);
        setDigits([]);
        setPhase('confirm');
      } else {
        if (pin === confirmDigits) {
          await setStoredPin(pin);
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
      const saved = await getStoredPin();
      if (saved && pin === saved) {
        setFailedAttempts(0);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSuccess();
      } else {
        registerFailure();
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

        {!!error && <Text style={styles.error}>{locked && lockRemain > 0 ? `Locked. Try again in ${lockRemain}s.` : error}</Text>}

        <View style={styles.keypad}>
          {KEYS.map((k, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.key, (k === '' || locked) && { opacity: 0.35 }]}
              onPress={() => handleKey(k)}
              disabled={k === '' || locked}
              activeOpacity={0.7}
              accessibilityLabel={k === '⌫' ? 'Delete' : k === '' ? undefined : `Digit ${k}`}
            >
              <Text style={styles.keyText}>{k}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.bottomRow}>
          {bioAvailable && mode === 'check' && !locked && (
            <TouchableOpacity onPress={tryBiometric} style={styles.bioBtn} accessibilityLabel="Unlock with biometrics">
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
  error: { color: '#F87171', fontSize: 13, fontFamily: 'DMSans_700Bold', textAlign: 'center', paddingHorizontal: 12 },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, width: '100%', maxWidth: 300 },
  key: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#111827', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  keyText: { color: '#F9FAFB', fontSize: 26, fontFamily: 'DMSans_700Bold' },
  bottomRow: { flexDirection: 'row', gap: 20, alignItems: 'center' },
  bioBtn: { alignItems: 'center', gap: 6 },
  bioBtnText: { color: '#A78BFA', fontSize: 12, fontFamily: 'DMSans_700Bold' },
  cancelBtn: { paddingHorizontal: 20, paddingVertical: 10 },
  cancelText: { color: 'rgba(249,250,251,0.4)', fontSize: 14, fontFamily: 'DMSans_700Bold' },
});
