import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Clipboard,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { useTheme } from './ThemeContext';
import MeshBackground from './MeshBackground';

const CARDS_META_KEY   = 'cards_meta_v2';
const CARDS_LEGACY_KEY = 'saved_cards_v1';
const SECURE_PREFIX    = 'card_secure_';

// ── Card type detection ────────────────────────────────────────────────────────
function detectCardType(num) {
  const n = (num || '').replace(/\s/g, '');
  if (/^4/.test(n)) return 'VISA';
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return 'MASTERCARD';
  if (/^3[47]/.test(n)) return 'AMEX';
  if (/^6/.test(n)) return 'RUPAY';
  return 'CARD';
}

// ── SecureStore helpers ────────────────────────────────────────────────────────
async function writeSecure(id, number, cvv) {
  await SecureStore.setItemAsync(`${SECURE_PREFIX}${id}`, JSON.stringify({ number, cvv }));
}
async function readSecure(id) {
  try {
    const raw = await SecureStore.getItemAsync(`${SECURE_PREFIX}${id}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { number: '', cvv: '' };
}
async function deleteSecure(id) {
  try { await SecureStore.deleteItemAsync(`${SECURE_PREFIX}${id}`); } catch {}
}

// ── Legacy migration (XOR decode, one-time) ───────────────────────────────────
function xorDecode(encoded, key) {
  try {
    const raw = atob(encoded);
    return Array.from(raw).map((c, i) =>
      String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))
    ).join('');
  } catch { return ''; }
}
async function migrateFromLegacy() {
  try {
    const raw = await AsyncStorage.getItem(CARDS_LEGACY_KEY);
    if (!raw) return null;
    const KEY = 'tw_card_k3y_2025';
    const old = JSON.parse(raw);
    const cards = old.map(c => ({
      id:         c.id || String(Date.now() + Math.random()),
      holderName: c.holderName || '',
      expiry:     c.expiry || '',
      type:       c.type || 'CARD',
      number:     c._num ? xorDecode(c._num, KEY) : (c.number !== '****' ? c.number : ''),
      cvv:        c._cvv ? xorDecode(c._cvv, KEY) : (c.cvv !== '***' ? c.cvv : ''),
    }));
    for (const c of cards) await writeSecure(c.id, c.number, c.cvv);
    const meta = cards.map(({ number, cvv, ...rest }) => rest);
    await AsyncStorage.setItem(CARDS_META_KEY, JSON.stringify(meta));
    await AsyncStorage.removeItem(CARDS_LEGACY_KEY);
    return cards;
  } catch { return null; }
}

// ── Storage helpers ────────────────────────────────────────────────────────────
async function loadAllCards() {
  try {
    const migrated = await migrateFromLegacy();
    if (migrated) return migrated;
    const metaRaw = await AsyncStorage.getItem(CARDS_META_KEY);
    if (!metaRaw) return [];
    const meta = JSON.parse(metaRaw);
    return Promise.all(meta.map(async m => ({ ...m, ...(await readSecure(m.id)) })));
  } catch { return []; }
}
async function saveAllCards(cards) {
  for (const c of cards) await writeSecure(c.id, c.number, c.cvv);
  const meta = cards.map(({ number, cvv, ...rest }) => rest);
  await AsyncStorage.setItem(CARDS_META_KEY, JSON.stringify(meta));
}
async function deleteOneCard(cards, idx) {
  await deleteSecure(cards[idx].id);
  const next = cards.filter((_, i) => i !== idx);
  const meta = next.map(({ number, cvv, ...rest }) => rest);
  await AsyncStorage.setItem(CARDS_META_KEY, JSON.stringify(meta));
  return next;
}

// ── Input formatters ───────────────────────────────────────────────────────────
function formatCardNumber(val) {
  const digits = val.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}
function formatExpiry(val) {
  const digits = val.replace(/\D/g, '').slice(0, 4);
  if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
}

// ── Card brand colours (for mini thumbnails in All Cards list) ─────────────────
const CARD_BG = {
  VISA: '#4F2FDB', MASTERCARD: '#1A1A2E',
  AMEX: '#065F46', RUPAY: '#1E3A8A', CARD: '#312E81',
};

// ── Card brand mark ────────────────────────────────────────────────────────────
function CardBrandMark({ type, size = 'large' }) {
  const isLarge = size === 'large';
  const wrap = isLarge
    ? { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }
    : { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 };

  if (type === 'VISA') return (
    <View style={wrap}>
      <Text style={{ color: '#fff', fontFamily: 'DMSans_900Black', fontStyle: 'italic', fontSize: isLarge ? 22 : 13, letterSpacing: 1 }}>VISA</Text>
    </View>
  );
  if (type === 'MASTERCARD') return (
    <View style={[wrap, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: isLarge ? 24 : 16, height: isLarge ? 24 : 16, borderRadius: isLarge ? 12 : 8, backgroundColor: '#EB001B' }} />
        <View style={{ width: isLarge ? 24 : 16, height: isLarge ? 24 : 16, borderRadius: isLarge ? 12 : 8, backgroundColor: '#F79E1B', marginLeft: isLarge ? -9 : -6 }} />
      </View>
      {isLarge && <Text style={{ color: '#fff', fontSize: 10, fontFamily: 'DMSans_800ExtraBold', marginLeft: 4 }}>mastercard</Text>}
    </View>
  );
  if (type === 'AMEX') return (
    <View style={wrap}>
      <Text style={{ color: '#fff', fontFamily: 'DMSans_900Black', fontSize: isLarge ? 13 : 9, letterSpacing: 2 }}>AMERICAN{'\n'}EXPRESS</Text>
    </View>
  );
  if (type === 'RUPAY') return (
    <View style={[wrap, { flexDirection: 'row', alignItems: 'center' }]}>
      <Text style={{ color: '#F7A800', fontFamily: 'DMSans_900Black', fontSize: isLarge ? 13 : 9, letterSpacing: 1 }}>Ru</Text>
      <Text style={{ color: '#fff',    fontFamily: 'DMSans_900Black', fontSize: isLarge ? 13 : 9, letterSpacing: 1 }}>Pay</Text>
    </View>
  );
  return null;
}

// ── Virtual card ───────────────────────────────────────────────────────────────
function VirtualCard({ card, flipped = false, onFlip }) {
  // FIX: responsive — recomputes on rotation instead of using stale module-level value
  const { width } = useWindowDimensions();
  const CARD_W = width - 48;
  const CARD_H = CARD_W * 0.57;

  const flipAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    Animated.spring(flipAnim, {
      toValue: flipped ? 1 : 0,
      friction: 8, tension: 60, useNativeDriver: true,
    }).start();
  }, [flipped]);

  const frontRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate  = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });

  // FIX: opacity trick — guarantees only one face visible on Android (backfaceVisibility unreliable)
  const frontOpacity = flipAnim.interpolate({ inputRange: [0.5, 0.501], outputRange: [1, 0], extrapolate: 'clamp' });
  const backOpacity  = flipAnim.interpolate({ inputRange: [0.499, 0.5], outputRange: [0, 1], extrapolate: 'clamp' });

  const rawNum = (card.number || '').replace(/\s/g, '');
  const first4 = rawNum.slice(0, 4).padEnd(4, '•');
  const last4  = rawNum.length >= 4 ? rawNum.slice(-4) : '••••';
  const groups = [first4, '••••', '••••', last4];

  const cardType = card.type || detectCardType(card.number);
  const GRADIENT = {
    VISA: ['#4F2FDB', '#8B5CF6'], MASTERCARD: ['#1A1A2E', '#7C3AED'],
    AMEX: ['#065F46', '#059669'], RUPAY:      ['#1E3A8A', '#3B82F6'],
    CARD: ['#312E81', '#6D28D9'],
  };
  const [c1, c2] = GRADIENT[cardType] || GRADIENT.CARD;
  // FIX: dots shown on back — real CVV only revealed after biometric auth in RevealedPanel
  const cvvDots = '•'.repeat((card.cvv || '').length || 3);

  return (
    <Pressable onPress={onFlip} style={{ width: CARD_W, height: CARD_H }}>
      {/* ── Front ── */}
      <Animated.View style={[cs.cardFace, {
        backgroundColor: c1,
        opacity: frontOpacity,
        transform: [{ perspective: 1000 }, { rotateY: frontRotate }],
      }]}>
        <Animated.View style={[cs.cardGlow, { backgroundColor: c2, opacity: glowOpacity }]} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <Text style={{ color: '#fff', fontFamily: 'DMSans_800ExtraBold', fontSize: 16, letterSpacing: 0.5 }}>Thunder Bank</Text>
          <CardBrandMark type={cardType} size="large" />
        </View>
        <View style={cs.chip}><View style={cs.chipInner} /></View>
        <Text style={cs.cardNum}>{groups.join('  ')}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={cs.cardLabel}>CARD HOLDER</Text>
            {/* FIX: numberOfLines prevents long names overflowing card edge */}
            <Text style={cs.cardValue} numberOfLines={1} ellipsizeMode="tail">
              {(card.holderName || '').toUpperCase() || 'YOUR NAME'}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={cs.cardLabel}>EXPIRES</Text>
            <Text style={cs.cardValue}>{card.expiry || 'MM/YY'}</Text>
          </View>
        </View>
        <Text style={{ position: 'absolute', bottom: 6, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 9, fontFamily: 'DMSans_600SemiBold' }}>
          Tap to flip · view CVV
        </Text>
      </Animated.View>

      {/* ── Back ── */}
      <Animated.View style={[cs.cardFace, cs.cardBack, {
        backgroundColor: c1,
        opacity: backOpacity,
        transform: [{ perspective: 1000 }, { rotateY: backRotate }],
      }]}>
        <Animated.View style={[cs.cardGlow, { backgroundColor: c2, opacity: glowOpacity }]} />
        <View style={cs.magStripe} />
        <View style={cs.sigStripe}>
          <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 3 }}>
            <Text style={{ color: '#000', fontSize: 13, fontFamily: 'DMSans_800ExtraBold', paddingHorizontal: 10, paddingVertical: 6, letterSpacing: 4 }}>
              {cvvDots}
            </Text>
          </View>
          {/* FIX: show dots, not real CVV — biometric gate protects the real value */}
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingLeft: 12, paddingRight: 4 }}>
            <Text style={{ color: '#fff', fontFamily: 'DMSans_900Black', fontSize: 12 }}>{cvvDots}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 8, fontFamily: 'DMSans_700Bold' }}>CVV</Text>
          </View>
        </View>
        <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, marginTop: 14, textAlign: 'center', paddingHorizontal: 16 }}>
          Use "View Card Details" to reveal your CVV securely.
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// ── Placeholder names for form preview ────────────────────────────────────────
const PLACEHOLDER_NAMES = [
  'RAHUL SHARMA', 'PRIYA PATEL', 'AMIT VERMA', 'NEHA GUPTA',
  'VIJAY KUMAR', 'SUNITA SINGH', 'RAVI MEHTA', 'POOJA NAIR',
];
const RANDOM_NAME = PLACEHOLDER_NAMES[Math.floor(Math.random() * PLACEHOLDER_NAMES.length)];

const CARD_TYPES = [
  { id: 'VISA',       label: 'VISA',       color: '#1A1F71', accent: '#fff' },
  { id: 'MASTERCARD', label: 'Mastercard', color: '#252525', accent: '#F79E1B' },
  { id: 'RUPAY',      label: 'RuPay',      color: '#004B8D', accent: '#F7A800' },
  { id: 'AMEX',       label: 'Amex',       color: '#007BC1', accent: '#fff' },
];

// ── Name validation: letters, spaces, hyphens, apostrophes, dots ──────────────
const NAME_RE = /^[a-zA-Z][a-zA-Z\s'\-\.]{0,25}$/;

// ── Form ───────────────────────────────────────────────────────────────────────
function CardForm({ initialCard, onSave, onCancel, saving = false }) {
  const { C } = useTheme();
  const [holderName, setHolderName] = useState(initialCard?.holderName || '');
  const [cardNumber, setCardNumber] = useState(initialCard?.number || '');
  const [expiry,     setExpiry]     = useState(initialCard?.expiry || '');
  const [cvv,        setCvv]        = useState(initialCard?.cvv || '');
  const [showNum,    setShowNum]    = useState(false);
  const [showCvv,    setShowCvv]    = useState(false);
  const [manualType, setManualType] = useState(initialCard?.type || null);

  const autoType = detectCardType(cardNumber);
  const cardType = manualType || autoType;
  const cvvLen   = cardType === 'AMEX' ? 4 : 3;

  const handleSave = () => {
    const trimmedName = holderName.trim();
    // FIX: name validation — letters, spaces, hyphens, apostrophes only
    if (!trimmedName) {
      Alert.alert('Missing field', 'Enter the card holder name.'); return;
    }
    if (!NAME_RE.test(trimmedName)) {
      Alert.alert('Invalid name', 'Name must contain only letters, spaces, hyphens, or apostrophes (2–26 characters).'); return;
    }
    const digits = cardNumber.replace(/\s/g, '');
    if (digits.length < 13 || digits.length > 19) {
      Alert.alert('Invalid card number', 'Enter a valid card number (13–19 digits).'); return;
    }
    const [mm, yy] = expiry.split('/');
    const month = parseInt(mm, 10);
    const year  = parseInt(`20${yy}`, 10);
    const now   = new Date();
    if (!mm || !yy || isNaN(month) || isNaN(year) || month < 1 || month > 12 ||
        year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
      Alert.alert('Invalid expiry', 'Enter a valid expiry date (MM/YY).'); return;
    }
    // FIX: validate against cvvLen, not hardcoded 3 — AMEX requires 4 digits
    if (cvv.length < cvvLen) {
      Alert.alert('Invalid CVV', `CVV must be ${cvvLen} digits.`); return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave({
      holderName: trimmedName,
      number: cardNumber,
      expiry, cvv,
      type: cardType,
      id: initialCard?.id || String(Date.now()),
    });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120, paddingTop: 8 }}
      >
        {/* Live preview — FIX: pointerEvents="none" makes it non-interactive */}
        <View style={{ alignItems: 'center', marginBottom: 24, marginTop: 8 }} pointerEvents="none">
          <VirtualCard
            card={{ holderName, number: cardNumber, expiry, cvv: cvv || '•••', type: cardType }}
            onFlip={() => {}}
          />
        </View>

        {/* Card network selector */}
        <Text style={{ color: C.text2, fontSize: 12, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 0.8, marginBottom: 10, textTransform: 'uppercase' }}>
          Card Network
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
          {CARD_TYPES.map(({ id, label, color, accent }) => {
            const selected = cardType === id;
            return (
              <TouchableOpacity
                key={id}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setManualType(id); }}
                style={{
                  flex: 1, alignItems: 'center', justifyContent: 'center',
                  paddingVertical: 10, borderRadius: 12, borderWidth: 2,
                  backgroundColor: selected ? color : C.cardInner,
                  borderColor:     selected ? color : C.border,
                }}
              >
                <CardBrandMark type={id} size="small" />
                <Text style={{ color: selected ? accent : C.text3, fontSize: 9, fontFamily: 'DMSans_800ExtraBold', marginTop: 4, letterSpacing: 0.5 }}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Card Holder Name */}
        <FormField label="Card Holder Name" C={C}>
          <TextInput
            style={[fs.input, { color: C.text1 }]}
            placeholder={RANDOM_NAME}
            placeholderTextColor={C.text3}
            value={holderName}
            onChangeText={setHolderName}
            autoCapitalize="words"
            maxLength={26}
            returnKeyType="next"
          />
        </FormField>

        {/* Card Number — FIX: secureTextEntry={!showNum} so eye toggle actually works */}
        <FormField
          label="Card Number"
          C={C}
          right={
            <TouchableOpacity onPress={() => setShowNum(v => !v)} style={fs.eyeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={showNum ? 'eye' : 'eye-off'} size={18} color={C.text2} />
            </TouchableOpacity>
          }
        >
          <TextInput
            style={[fs.input, { color: C.text1, flex: 1 }]}
            placeholder="•••• •••• •••• ••••"
            placeholderTextColor={C.text3}
            value={cardNumber}
            onChangeText={v => {
              setCardNumber(formatCardNumber(v));
              // auto-detect type and clear manual selection if user changes network
              if (manualType) setManualType(null);
            }}
            keyboardType="number-pad"
            maxLength={19}
            secureTextEntry={!showNum}
          />
        </FormField>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          {/* Expiry */}
          <View style={{ flex: 1 }}>
            <FormField label="Expiry Date" C={C}>
              <TextInput
                style={[fs.input, { color: C.text1 }]}
                placeholder="MM/YY"
                placeholderTextColor={C.text3}
                value={expiry}
                onChangeText={v => setExpiry(formatExpiry(v))}
                keyboardType="number-pad"
                maxLength={5}
              />
            </FormField>
          </View>
          {/* CVV */}
          <View style={{ flex: 1 }}>
            <FormField
              label={`CVV (${cvvLen} digits)`}
              C={C}
              right={
                <TouchableOpacity onPress={() => setShowCvv(v => !v)} style={fs.eyeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name={showCvv ? 'eye' : 'eye-off'} size={18} color={C.text2} />
                </TouchableOpacity>
              }
            >
              <TextInput
                style={[fs.input, { color: C.text1, flex: 1 }]}
                placeholder={'•'.repeat(cvvLen)}
                placeholderTextColor={C.text3}
                value={cvv}
                onChangeText={v => setCvv(v.replace(/\D/g, '').slice(0, cvvLen))}
                keyboardType="number-pad"
                maxLength={cvvLen}
                secureTextEntry={!showCvv}
              />
            </FormField>
          </View>
        </View>

        {/* Save */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={[fs.saveBtn, saving && { opacity: 0.6 }]}
          activeOpacity={0.85}
        >
          <Ionicons name="shield-checkmark" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 16, fontFamily: 'DMSans_900Black', marginLeft: 8 }}>
            {saving ? 'Saving…' : initialCard ? 'Update Card' : 'Save Card Securely'}
          </Text>
        </TouchableOpacity>

        {onCancel && (
          <TouchableOpacity onPress={onCancel} style={{ alignItems: 'center', marginTop: 14, paddingVertical: 8 }}>
            <Text style={{ color: C.text3, fontSize: 14, fontFamily: 'DMSans_700Bold' }}>Cancel</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FormField({ label, C, children, right }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: C.text2, fontSize: 12, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 0.8, marginBottom: 8, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <View style={[fs.inputWrap, { backgroundColor: C.cardInner, borderColor: C.border }]}>
        {children}
        {right}
      </View>
    </View>
  );
}

// ── Biometric auth ─────────────────────────────────────────────────────────────
async function authenticateWithBiometric() {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled  = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !isEnrolled) {
      Alert.alert('Biometrics not set up', 'Please enable fingerprint or face unlock in your device settings.');
      return false;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage:         'Verify your identity to view card details',
      cancelLabel:           'Cancel',
      fallbackLabel:         'Use PIN',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch { return false; }
}

// ── Clipboard helper ───────────────────────────────────────────────────────────
function copyToClipboard(label, value) {
  try {
    Clipboard.setString(value || '');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
}

// ── Revealed details panel ────────────────────────────────────────────────────
function RevealedPanel({ card, onHide, C }) {
  const slideAnim = useRef(new Animated.Value(30)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 320, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => { if (countdown === 0) onHide(); }, [countdown]);

  const fullNum = (card.number || '').replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
  // FIX: guard all potentially-undefined fields
  const rows = [
    { label: 'Card Number', value: fullNum || '—',            icon: 'card-outline',        copyVal: (card.number || '').replace(/\s/g, '') },
    { label: 'Card Holder', value: card.holderName || '—',   icon: 'person-outline',       copyVal: card.holderName || '' },
    { label: 'Expiry Date', value: card.expiry    || '—',    icon: 'calendar-outline',     copyVal: card.expiry    || '' },
    { label: 'CVV',         value: card.cvv       || '—',    icon: 'lock-closed-outline',  copyVal: card.cvv       || '' },
  ];

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      {/* Countdown bar */}
      <View style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="eye" size={13} color="#A78BFA" />
            <Text style={{ color: '#A78BFA', fontSize: 12, fontFamily: 'DMSans_800ExtraBold' }}>Details revealed</Text>
          </View>
          <Text style={{ color: C.text3, fontSize: 11, fontFamily: 'DMSans_700Bold' }}>Hides in {countdown}s</Text>
        </View>
        <View style={{ height: 3, backgroundColor: C.border, borderRadius: 2 }}>
          <View style={{ height: 3, borderRadius: 2, backgroundColor: '#7C3AED', width: `${(countdown / 30) * 100}%` }} />
        </View>
      </View>

      {/* Detail rows */}
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: 'rgba(124,58,237,0.3)', backgroundColor: 'rgba(124,58,237,0.06)', overflow: 'hidden', marginBottom: 10 }}>
        {rows.map(({ label, value, icon, copyVal }, i) => (
          <View
            key={label}
            style={[
              { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
              i < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: 'rgba(124,58,237,0.15)' },
            ]}
          >
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(124,58,237,0.15)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
              <Ionicons name={icon} size={15} color="#A78BFA" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_700Bold', marginBottom: 2 }}>{label}</Text>
              <Text selectable style={{ color: C.text1, fontSize: 15, fontFamily: 'DMSans_800ExtraBold', letterSpacing: label === 'Card Number' ? 1.5 : 0 }}>
                {value}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => copyToClipboard(label, copyVal)}
              style={{ backgroundColor: 'rgba(124,58,237,0.15)', borderRadius: 8, padding: 8 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="copy-outline" size={16} color="#A78BFA" />
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <TouchableOpacity
        onPress={onHide}
        style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 10 }}
      >
        <Ionicons name="eye-off-outline" size={14} color={C.text3} />
        <Text style={{ color: C.text3, fontSize: 12, fontFamily: 'DMSans_700Bold' }}>Hide Details</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Main CardScreen ────────────────────────────────────────────────────────────
export default function CardScreen() {
  const { C } = useTheme();
  const [cards,       setCards]       = useState([]);
  const [activeIdx,   setActiveIdx]   = useState(0);
  const [editing,     setEditing]     = useState(false);
  const [adding,      setAdding]      = useState(false);
  const [flipped,     setFlipped]     = useState(false);
  const [loaded,      setLoaded]      = useState(false);
  const [revealed,    setRevealed]    = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  // FIX: spin animation for the loading icon during biometric auth
  const spinAnim = useRef(new Animated.Value(0)).current;
  const spinLoop = useRef(null);

  useEffect(() => { loadCards(); }, []);
  useEffect(() => { setRevealed(false); setFlipped(false); }, [activeIdx]);

  // Start/stop spin when authLoading changes
  useEffect(() => {
    if (authLoading) {
      spinAnim.setValue(0);
      spinLoop.current = Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 700, easing: Easing.linear, useNativeDriver: true })
      );
      spinLoop.current.start();
    } else {
      spinLoop.current?.stop();
      spinAnim.setValue(0);
    }
  }, [authLoading]);

  const spinDeg = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const loadCards = async () => {
    try {
      const data = await loadAllCards();
      setCards(data);
    } catch {}
    setLoaded(true);
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  };

  const handleSave = async (card) => {
    if (saving) return;
    setSaving(true);
    try {
      // FIX: duplicate card detection (skip when editing the same card)
      if (!editing) {
        const incomingDigits = card.number.replace(/\s/g, '');
        const isDupe = cards.some(c => c.number.replace(/\s/g, '') === incomingDigits);
        if (isDupe) {
          Alert.alert('Duplicate Card', 'This card number is already saved in your vault.');
          setSaving(false);
          return;
        }
      }
      const next = editing
        ? cards.map(c => c.id === card.id ? card : c)
        : [...cards, card];
      await saveAllCards(next);
      setCards(next);
      setActiveIdx(editing ? activeIdx : next.length - 1);
      setEditing(false);
      setAdding(false);
      setFlipped(false);
      setRevealed(false);
      // FIX: success haptic at the CardScreen level after storage write completes
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Save Failed', 'Could not save your card. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    const idxToDelete = activeIdx;
    const cardName = cards[idxToDelete]?.holderName || 'this card';
    Alert.alert('Remove Card', `Remove "${cardName}" from your vault?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          try {
            const next = await deleteOneCard(cards, idxToDelete);
            setCards(next);
            setActiveIdx(Math.max(0, idxToDelete - 1));
            setFlipped(false);
            setRevealed(false);
          } catch {
            Alert.alert('Error', 'Could not remove the card. Please try again.');
          }
        },
      },
    ]);
  };

  const handleReveal = async () => {
    if (revealed) { setRevealed(false); return; }
    setAuthLoading(true);
    const ok = await authenticateWithBiometric();
    setAuthLoading(false);
    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRevealed(true);
    }
  };

  if (!loaded) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  const showForm = adding || (cards.length === 0 && !editing) || editing;
  const card     = cards[activeIdx];
  if (!showForm && !card) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <MeshBackground blobs="cards" isDark={C.isDark} />

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <View>
          <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase' }}>Thunder Wallet</Text>
          <Text style={{ color: C.text1, fontSize: 24, fontFamily: 'DMSans_900Black', marginTop: 2 }}>My Cards</Text>
        </View>
        {!showForm && (
          <TouchableOpacity
            onPress={() => { setAdding(true); setEditing(false); setFlipped(false); setRevealed(false); }}
            style={{ alignItems: 'center', backgroundColor: C.accentBg, borderColor: C.accentBorder, borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 8 }}
          >
            <Ionicons name="add" size={16} color={C.accent} />
            <Text style={{ color: C.accent, fontSize: 13, fontFamily: 'DMSans_800ExtraBold' }}>Add Card</Text>
          </TouchableOpacity>
        )}
      </View>

      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {showForm ? (
          <CardForm
            initialCard={editing ? card : null}
            onSave={handleSave}
            onCancel={cards.length > 0 ? () => { setEditing(false); setAdding(false); } : null}
            saving={saving}
          />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

            {/* Virtual card */}
            <View style={{ alignItems: 'center', paddingHorizontal: 24, marginBottom: 8, marginTop: 4 }}>
              <VirtualCard
                key={card.id}
                card={card}
                flipped={flipped}
                onFlip={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setFlipped(v => !v);
                  setRevealed(false);
                }}
              />
            </View>

            {/* Dot pagination */}
            {cards.length > 1 && (
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 16 }}>
                {cards.map((_, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => { setActiveIdx(i); setFlipped(false); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <View style={{
                      width: i === activeIdx ? 20 : 7, height: 7, borderRadius: 3.5,
                      backgroundColor: i === activeIdx ? '#7C3AED' : C.border,
                    }} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={{ marginHorizontal: 24, marginBottom: 16 }}>

              {/* View / hide details button */}
              <TouchableOpacity
                onPress={handleReveal}
                disabled={authLoading}
                activeOpacity={0.85}
                style={{
                  alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                  backgroundColor: revealed ? 'rgba(124,58,237,0.12)' : '#7C3AED',
                  borderRadius: 14, marginBottom: 14, paddingVertical: 15,
                  borderWidth: revealed ? 1 : 0, borderColor: 'rgba(124,58,237,0.35)',
                  elevation: revealed ? 0 : 6,
                  shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10,
                }}
              >
                {/* FIX: rotating spinner during auth loading */}
                {authLoading ? (
                  <Animated.View style={{ transform: [{ rotate: spinDeg }] }}>
                    <Ionicons name="sync" size={20} color="#fff" />
                  </Animated.View>
                ) : (
                  <Ionicons name={revealed ? 'eye-off' : 'finger-print'} size={20} color={revealed ? '#A78BFA' : '#fff'} />
                )}
                <Text style={{ color: revealed ? '#A78BFA' : '#fff', fontSize: 15, fontFamily: 'DMSans_900Black' }}>
                  {authLoading ? 'Authenticating…' : revealed ? 'Hide Details' : 'View Card Details'}
                </Text>
              </TouchableOpacity>

              {revealed && <RevealedPanel card={card} onHide={() => setRevealed(false)} C={C} />}

              {/* Masked info panel */}
              {!revealed && (
                <View style={[ms.panel, { backgroundColor: C.card, borderColor: C.border }]}>
                  <Row label="Card Holder" value={card.holderName || '—'} C={C} />
                  <Row label="Card Number" value={`•••• •••• •••• ${(card.number || '').replace(/\s/g, '').slice(-4) || '••••'}`} C={C} />
                  <Row label="Expiry"      value={card.expiry || '—'} C={C} />
                  {/* FIX: null guard on detectCardType */}
                  <Row label="Network"     value={card.type || detectCardType(card.number)} C={C} last />
                </View>
              )}

              {/* Security badge */}
              <View style={[ms.secBadge, { backgroundColor: 'rgba(52,211,153,0.08)', borderColor: 'rgba(52,211,153,0.2)', marginTop: 12 }]}>
                <Ionicons name="lock-closed" size={13} color="#34D399" />
                <Text style={{ color: '#34D399', fontSize: 11, fontFamily: 'DMSans_700Bold', marginLeft: 6, flex: 1 }}>
                  Fingerprint required to view details · Auto-hides in 30s
                </Text>
              </View>

              {/* Edit / Delete actions */}
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setEditing(true); setAdding(false); setFlipped(false); setRevealed(false);
                  }}
                  style={[ms.actionBtn, { backgroundColor: C.cardInner, borderColor: C.border, flex: 1 }]}
                >
                  <Ionicons name="pencil" size={16} color={C.text2} />
                  <Text style={{ color: C.text2, fontSize: 14, fontFamily: 'DMSans_800ExtraBold', marginLeft: 6 }}>Edit Card</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleDelete}
                  style={[ms.actionBtn, { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)', flex: 1 }]}
                >
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  <Text style={{ color: '#EF4444', fontSize: 14, fontFamily: 'DMSans_800ExtraBold', marginLeft: 6 }}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* All Cards list */}
            {cards.length > 1 && (
              <View style={{ marginHorizontal: 24 }}>
                <Text style={{ color: C.text3, fontSize: 11, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' }}>
                  All Cards
                </Text>
                {cards.map((c, i) => {
                  const cType  = c.type || detectCardType(c.number);
                  // FIX: mini thumbnail uses the card's own brand colour
                  const miniBg = CARD_BG[cType] || CARD_BG.CARD;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => { setActiveIdx(i); setFlipped(false); }}
                      style={[ms.cardRow, {
                        backgroundColor: i === activeIdx ? C.accentBg : C.card,
                        borderColor:     i === activeIdx ? C.accentBorder : C.border,
                      }]}
                    >
                      <View style={{ width: 36, height: 24, borderRadius: 5, backgroundColor: miniBg, alignItems: 'center', justifyContent: 'center' }}>
                        <CardBrandMark type={cType} size="small" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={{ color: C.text1, fontSize: 13, fontFamily: 'DMSans_800ExtraBold' }} numberOfLines={1}>
                          {c.holderName || '—'}
                        </Text>
                        <Text style={{ color: C.text3, fontSize: 11, fontFamily: 'DMSans_600SemiBold', marginTop: 1 }}>
                          •••• {(c.number || '').replace(/\s/g, '').slice(-4) || '••••'} · {c.expiry || '—'}
                        </Text>
                      </View>
                      {i === activeIdx && <Ionicons name="checkmark-circle" size={18} color={C.accent} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

function Row({ label, value, C, last }) {
  return (
    <View style={[ms.row, !last && { borderBottomWidth: 1, borderBottomColor: C.border }]}>
      <Text style={{ color: C.text3, fontSize: 11, fontFamily: 'DMSans_700Bold', width: 100 }}>{label}</Text>
      <Text style={{ color: C.text1, fontSize: 14, fontFamily: 'DMSans_800ExtraBold', flex: 1 }} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const cs = StyleSheet.create({
  cardFace: {
    position: 'absolute', width: '100%', height: '100%',
    borderRadius: 20, padding: 22, backfaceVisibility: 'hidden',
    overflow: 'hidden',
    shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45, shadowRadius: 24, elevation: 14,
  },
  cardBack: { justifyContent: 'center' },
  cardGlow: {
    position: 'absolute', width: 200, height: 200,
    borderRadius: 100, top: -60, right: -40,
  },
  chip: {
    width: 38, height: 28, borderRadius: 5,
    backgroundColor: '#D4AF37', marginBottom: 18,
    overflow: 'hidden', justifyContent: 'center',
  },
  chipInner: {
    width: '100%', height: '40%', backgroundColor: 'rgba(0,0,0,0.18)',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(0,0,0,0.1)',
  },
  cardNum: {
    color: '#fff', fontSize: 17, fontFamily: 'DMSans_700Bold',
    letterSpacing: 2.5, marginBottom: 20, fontVariant: ['tabular-nums'],
  },
  cardLabel: {
    color: 'rgba(255,255,255,0.55)', fontSize: 8, fontFamily: 'DMSans_800ExtraBold',
    letterSpacing: 1.5, marginBottom: 3, textTransform: 'uppercase',
  },
  cardValue: { color: '#fff', fontSize: 13, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 0.5 },
  magStripe: { height: 44, backgroundColor: '#1a1a1a', marginHorizontal: -22, marginTop: -22, marginBottom: 16 },
  sigStripe: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 5, padding: 6 },
});

const fs = StyleSheet.create({
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 13, borderWidth: 1, paddingHorizontal: 14, minHeight: 52 },
  input:     { flex: 1, fontSize: 15, fontFamily: 'DMSans_700Bold', paddingVertical: 14 },
  eyeBtn:    { padding: 8 },
  saveBtn: {
    alignItems: 'center', backgroundColor: '#7C3AED', borderRadius: 16,
    flexDirection: 'row', justifyContent: 'center', marginTop: 24, minHeight: 56,
    elevation: 8, shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45, shadowRadius: 14,
  },
});

const ms = StyleSheet.create({
  panel:     { borderRadius: 16, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  row:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  secBadge:  { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', marginBottom: 14, paddingHorizontal: 14, paddingVertical: 10 },
  actionBtn: { alignItems: 'center', borderRadius: 13, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', paddingVertical: 14 },
  cardRow:   { borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingHorizontal: 14, paddingVertical: 12 },
});
