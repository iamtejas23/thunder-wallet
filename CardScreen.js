import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  AppState,
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
import * as ScreenCapture from 'expo-screen-capture';
import { useIsFocused } from '@react-navigation/native';
import { useTheme } from './ThemeContext';
import MeshBackground from './MeshBackground';

const CARDS_META_KEY   = 'cards_meta_v2';
const CARDS_LEGACY_KEY = 'saved_cards_v1';
const SECURE_PREFIX    = 'twc_'; // short alphanumeric key prefix (matches PIN-style SecureStore usage)
const CLIPBOARD_CLEAR_MS = 30000;
const REVEAL_TTL_SEC = 30;

/** Always normalize card ids — AsyncStorage JSON can turn them into numbers. */
function normId(id) {
  return String(id ?? '');
}

/**
 * SecureStore keys: alphanumeric + . - _ only.
 * Keep keys short — same simple style as PIN storage (no iOS-only options on Android).
 */
function secureKey(id) {
  return `${SECURE_PREFIX}${normId(id).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}

function legacySecureKeys(id) {
  const n = normId(id);
  return [
    secureKey(n),
    `card_secure_${n}`,
    `card_secure_${n.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
  ];
}

// ── Card type detection ────────────────────────────────────────────────────────
function detectCardType(num) {
  const n = (num || '').replace(/\s/g, '');
  if (/^4/.test(n)) return 'VISA';
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return 'MASTERCARD';
  if (/^3[47]/.test(n)) return 'AMEX';
  if (/^6/.test(n)) return 'RUPAY';
  return 'CARD';
}

function digitsOnly(num) {
  return (num || '').replace(/\D/g, '');
}

function last4Of(num) {
  const d = digitsOnly(num);
  return d.length >= 4 ? d.slice(-4) : '';
}

/** Luhn check — rejects typos / invalid PANs before they hit SecureStore. */
function luhnValid(num) {
  const d = digitsOnly(num);
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = parseInt(d[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function toMeta(card) {
  return {
    id: normId(card.id),
    holderName: card.holderName || '',
    expiry: card.expiry || '',
    type: card.type || detectCardType(card.number),
    last4: card.last4 || last4Of(card.number),
  };
}

function parseSecurePayload(raw) {
  if (!raw) return { number: '', cvv: '' };
  // New compact format: "number|cvv"
  if (typeof raw === 'string' && raw.includes('|') && !raw.trim().startsWith('{')) {
    const [number, cvv = ''] = raw.split('|');
    return { number: digitsOnly(number), cvv: digitsOnly(cvv) };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      number: digitsOnly(parsed.number ?? parsed.n ?? ''),
      cvv: digitsOnly(parsed.cvv ?? parsed.c ?? ''),
    };
  } catch {
    return { number: digitsOnly(raw), cvv: '' };
  }
}

// ── SecureStore helpers (same simple API style as PIN — no platform options) ───
async function writeSecure(id, number, cvv) {
  const key = secureKey(id);
  const pan = digitsOnly(number);
  const cvc = digitsOnly(cvv);
  if (!pan) throw new Error('Card number is empty — nothing to store securely.');

  const available = await SecureStore.isAvailableAsync();
  if (!available) throw new Error('Secure storage is not available on this device.');

  // Compact string value (PIN-style). Avoid JSON + iOS-only options that broke Android reads.
  const payload = `${pan}|${cvc}`;
  await SecureStore.setItemAsync(key, payload);

  const verify = await SecureStore.getItemAsync(key);
  const parsed = parseSecurePayload(verify);
  if (parsed.number !== pan) {
    throw new Error('Secure storage write verification failed. Please try again.');
  }
}

async function readSecure(id) {
  try {
    const available = await SecureStore.isAvailableAsync();
    if (!available) return { number: '', cvv: '' };

    for (const key of legacySecureKeys(id)) {
      try {
        const raw = await SecureStore.getItemAsync(key);
        const parsed = parseSecurePayload(raw);
        if (parsed.number || parsed.cvv) return parsed;
      } catch {}
    }
  } catch {}
  return { number: '', cvv: '' };
}

async function deleteSecure(id) {
  for (const key of legacySecureKeys(id)) {
    try { await SecureStore.deleteItemAsync(key); } catch {}
  }
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
    if (!raw) return false;
    const KEY = 'tw_card_k3y_2025';
    const old = JSON.parse(raw);
    const meta = [];
    for (const c of old) {
      const id = c.id || String(Date.now() + Math.random());
      const number = c._num ? xorDecode(c._num, KEY) : (c.number !== '****' ? c.number : '');
      const cvv = c._cvv ? xorDecode(c._cvv, KEY) : (c.cvv !== '***' ? c.cvv : '');
      await writeSecure(id, number, cvv);
      meta.push(toMeta({
        id,
        holderName: c.holderName || '',
        expiry: c.expiry || '',
        type: c.type || detectCardType(number),
        number,
      }));
    }
    await AsyncStorage.setItem(CARDS_META_KEY, JSON.stringify(meta));
    await AsyncStorage.removeItem(CARDS_LEGACY_KEY);
    return true;
  } catch { return false; }
}

/**
 * Load only non-sensitive metadata into React state.
 * Full PAN/CVV stay in SecureStore until biometric reveal/edit.
 */
async function loadCardMeta() {
  try {
    await migrateFromLegacy();
    const metaRaw = await AsyncStorage.getItem(CARDS_META_KEY);
    if (!metaRaw) return [];
    const meta = JSON.parse(metaRaw);
    let dirty = false;
    const cleaned = [];
    const seen = new Set();
    for (const m of meta) {
      const id = normId(m.id);
      if (!id || seen.has(id)) {
        dirty = true;
        continue;
      }
      seen.add(id);
      let last4 = m.last4 || '';
      if (!last4) {
        const sec = await readSecure(id);
        last4 = last4Of(sec.number);
        dirty = true;
      }
      if (String(m.id) !== id) dirty = true;
      cleaned.push({
        id,
        holderName: m.holderName || '',
        expiry: m.expiry || '',
        type: m.type || 'CARD',
        last4,
      });
    }
    if (dirty) await AsyncStorage.setItem(CARDS_META_KEY, JSON.stringify(cleaned));
    return cleaned;
  } catch { return []; }
}

async function upsertCard(card) {
  const id = normId(card.id);
  await writeSecure(id, card.number, card.cvv);
  const metaRaw = await AsyncStorage.getItem(CARDS_META_KEY);
  const meta = metaRaw ? JSON.parse(metaRaw) : [];
  const entry = toMeta({ ...card, id });
  const idx = meta.findIndex((m) => normId(m.id) === id);
  if (idx >= 0) meta[idx] = entry;
  else meta.push(entry);
  // Drop any duplicate id variants (number vs string)
  const deduped = [];
  const seen = new Set();
  for (const m of meta) {
    const mid = normId(m.id);
    if (seen.has(mid)) continue;
    seen.add(mid);
    deduped.push({ ...m, id: mid });
  }
  await AsyncStorage.setItem(CARDS_META_KEY, JSON.stringify(deduped));
  return entry;
}

async function deleteOneCard(cards, idx) {
  const target = cards[idx];
  if (!target) return cards;
  await deleteSecure(target.id);
  const next = cards.filter((_, i) => i !== idx).map((c) => toMeta({ ...c, id: normId(c.id) }));
  await AsyncStorage.setItem(CARDS_META_KEY, JSON.stringify(next));
  return next;
}

async function isDuplicateNumber(number, excludeId, existingCards) {
  const incoming = digitsOnly(number);
  const exclude = excludeId != null ? normId(excludeId) : null;
  for (const c of existingCards) {
    if (exclude && normId(c.id) === exclude) continue;
    const sec = await readSecure(c.id);
    if (digitsOnly(sec.number) === incoming) return true;
  }
  return false;
}

// ── Input formatters ───────────────────────────────────────────────────────────
function formatCardNumber(val) {
  const digits = val.replace(/\D/g, '').slice(0, 19);
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
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
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

  const last4 = (card.last4 || last4Of(card.number) || '••••').slice(-4).padStart(4, '•');
  // Never show BIN/first digits until biometric reveal — last4 only on the face.
  const groups = ['••••', '••••', '••••', last4];

  const cardType = card.type || detectCardType(card.number);
  const GRADIENT = {
    VISA: ['#4F2FDB', '#8B5CF6'], MASTERCARD: ['#1A1A2E', '#7C3AED'],
    AMEX: ['#065F46', '#059669'], RUPAY:      ['#1E3A8A', '#3B82F6'],
    CARD: ['#312E81', '#6D28D9'],
  };
  const [c1, c2] = GRADIENT[cardType] || GRADIENT.CARD;
  // Real CVV never rendered on the flip face — only after biometric reveal.
  const cvvDots = '•••';

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
    if (!luhnValid(digits)) {
      Alert.alert('Invalid card number', 'That card number failed validation. Please check the digits and try again.'); return;
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
      id: String(initialCard?.id || `${Date.now()}`),
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
            maxLength={23}
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

// ── Biometric / device-credential gate ────────────────────────────────────────
async function authenticateForCards(promptMessage = 'Verify your identity to access card details') {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware && !isEnrolled) {
      Alert.alert(
        'Screen lock required',
        'Set up a device PIN, fingerprint, or Face ID to view or edit card details.',
      );
      return false;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      fallbackLabel: 'Use device passcode',
      disableDeviceFallback: false,
      biometricsSecurityLevel: 'strong',
    });
    if (!result.success) {
      if (result.error && result.error !== 'user_cancel' && result.error !== 'system_cancel') {
        Alert.alert('Authentication failed', 'Could not verify your identity. Try again.');
      }
      return false;
    }
    return true;
  } catch {
    Alert.alert('Authentication failed', 'Could not verify your identity. Try again.');
    return false;
  }
}

// ── Clipboard helper (auto-clears sensitive data) ──────────────────────────────
let clipboardClearTimer = null;
function copyToClipboard(label, value) {
  try {
    const text = value || '';
    Clipboard.setString(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (clipboardClearTimer) clearTimeout(clipboardClearTimer);
    clipboardClearTimer = setTimeout(() => {
      try { Clipboard.setString(''); } catch {}
      clipboardClearTimer = null;
    }, CLIPBOARD_CLEAR_MS);
    Alert.alert('Copied', `${label} copied. Clipboard clears in ${CLIPBOARD_CLEAR_MS / 1000}s for security.`);
  } catch {}
}

// ── Revealed details panel ────────────────────────────────────────────────────
function RevealedPanel({ card, secrets, onHide, C }) {
  const slideAnim = useRef(new Animated.Value(30)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const [countdown, setCountdown] = useState(REVEAL_TTL_SEC);
  const onHideRef = useRef(onHide);
  onHideRef.current = onHide;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 320, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (countdown === 0) onHideRef.current();
  }, [countdown]);

  const fullNum = formatCardNumber(secrets?.number || '');
  const rows = [
    { label: 'Card Number', value: fullNum || '—',           icon: 'card-outline',        copyVal: digitsOnly(secrets?.number) },
    { label: 'Card Holder', value: card.holderName || '—',  icon: 'person-outline',       copyVal: card.holderName || '' },
    { label: 'Expiry Date', value: card.expiry || '—',      icon: 'calendar-outline',     copyVal: card.expiry || '' },
    { label: 'CVV',         value: secrets?.cvv || '—',     icon: 'lock-closed-outline',  copyVal: secrets?.cvv || '' },
  ];

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <View style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="eye" size={13} color="#A78BFA" />
            <Text style={{ color: '#A78BFA', fontSize: 12, fontFamily: 'DMSans_800ExtraBold' }}>Details revealed</Text>
          </View>
          <Text style={{ color: C.text3, fontSize: 11, fontFamily: 'DMSans_700Bold' }}>Hides in {countdown}s</Text>
        </View>
        <View style={{ height: 3, backgroundColor: C.border, borderRadius: 2 }}>
          <View style={{ height: 3, borderRadius: 2, backgroundColor: '#7C3AED', width: `${(countdown / REVEAL_TTL_SEC) * 100}%` }} />
        </View>
      </View>

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
              <Text style={{ color: C.text1, fontSize: 15, fontFamily: 'DMSans_800ExtraBold', letterSpacing: label === 'Card Number' ? 1.5 : 0 }}>
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
  const isFocused = useIsFocused();
  const [cards,       setCards]       = useState([]);
  const [activeIdx,   setActiveIdx]   = useState(0);
  const [editing,     setEditing]     = useState(false);
  const [adding,      setAdding]      = useState(false);
  const [flipped,     setFlipped]     = useState(false);
  const [loaded,      setLoaded]      = useState(false);
  const [revealed,    setRevealed]    = useState(false);
  const [secrets,     setSecrets]     = useState(null); // ephemeral PAN/CVV after auth
  const [editDraft,   setEditDraft]   = useState(null); // full card only while editing
  const [authLoading, setAuthLoading] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const spinLoop = useRef(null);

  const clearSecrets = useCallback(() => {
    setSecrets(null);
    setRevealed(false);
  }, []);
  const authLoadingRef = useRef(false);

  useEffect(() => { loadCards(); }, []);
  useEffect(() => { clearSecrets(); setFlipped(false); }, [activeIdx, clearSecrets]);

  // Block screenshots / screen recording while Cards tab is focused
  useEffect(() => {
    if (!isFocused) {
      ScreenCapture.allowScreenCaptureAsync('cards').catch(() => {});
      clearSecrets();
      setFlipped(false);
      return undefined;
    }
    ScreenCapture.preventScreenCaptureAsync('cards').catch(() => {});
    return () => { ScreenCapture.allowScreenCaptureAsync('cards').catch(() => {}); };
  }, [isFocused, clearSecrets]);

  // Auto-hide secrets when app backgrounds — but NOT during biometric prompt
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && !authLoadingRef.current) {
        clearSecrets();
        setFlipped(false);
      }
    });
    return () => sub.remove();
  }, [clearSecrets]);

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
      const data = await loadCardMeta();
      setCards(data);
    } catch {}
    setLoaded(true);
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  };

  const handleSave = async (card) => {
    if (saving) return;
    setSaving(true);
    const wasEditing = editing;
    const prevCount = cards.length;
    try {
      const excludeId = wasEditing ? card.id : null;
      if (await isDuplicateNumber(card.number, excludeId, cards)) {
        Alert.alert('Duplicate Card', 'This card number is already saved in your vault.');
        setSaving(false);
        return;
      }
      const entry = await upsertCard({
        ...card,
        number: digitsOnly(card.number),
        cvv: digitsOnly(card.cvv),
      });
      setCards((prev) => {
        const idx = prev.findIndex((c) => c.id === entry.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = entry;
          return next;
        }
        return [...prev, entry];
      });
      if (!wasEditing) setActiveIdx(prevCount);
      setEditing(false);
      setAdding(false);
      setEditDraft(null);
      setFlipped(false);
      clearSecrets();
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
          setAuthLoading(true);
          authLoadingRef.current = true;
          const ok = await authenticateForCards('Verify to remove this card');
          authLoadingRef.current = false;
          setAuthLoading(false);
          if (!ok) return;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          try {
            const next = await deleteOneCard(cards, idxToDelete);
            setCards(next);
            setActiveIdx(Math.max(0, idxToDelete - 1));
            setFlipped(false);
            clearSecrets();
          } catch {
            Alert.alert('Error', 'Could not remove the card. Please try again.');
          }
        },
      },
    ]);
  };

  const openRepairForm = (current) => {
    setEditDraft({
      ...current,
      id: normId(current.id),
      number: '',
      cvv: '',
    });
    clearSecrets();
    setFlipped(false);
    setEditing(true);
    setAdding(false);
  };

  const handleReveal = async () => {
    if (revealed) { clearSecrets(); return; }
    const current = cards[activeIdx];
    if (!current) return;
    setAuthLoading(true);
    authLoadingRef.current = true;
    const ok = await authenticateForCards('Verify your identity to view card details');
    if (!ok) {
      authLoadingRef.current = false;
      setAuthLoading(false);
      return;
    }
    try {
      const sec = await readSecure(current.id);
      if (!sec.number && !sec.cvv) {
        // Broken older save — open form immediately so user can restore secrets
        openRepairForm(current);
        Alert.alert(
          'Re-enter card details',
          'This card was saved without the number in secure storage. Enter the full card number and CVV, then tap Save.',
        );
        return;
      }
      setSecrets(sec);
      setRevealed(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Could not unlock card details.');
    } finally {
      authLoadingRef.current = false;
      setAuthLoading(false);
    }
  };

  const handleEdit = async () => {
    const current = cards[activeIdx];
    if (!current) return;
    setAuthLoading(true);
    authLoadingRef.current = true;
    const ok = await authenticateForCards('Verify your identity to edit this card');
    if (!ok) {
      authLoadingRef.current = false;
      setAuthLoading(false);
      return;
    }
    try {
      const sec = await readSecure(current.id);
      if (!sec.number) {
        openRepairForm(current);
        Alert.alert(
          'Re-enter card details',
          'Secure details were missing. Enter the full card number and CVV, then tap Save.',
        );
        return;
      }
      setEditDraft({
        ...current,
        id: normId(current.id),
        number: formatCardNumber(sec.number),
        cvv: sec.cvv || '',
      });
      clearSecrets();
      setFlipped(false);
      setEditing(true);
      setAdding(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Could not unlock card for editing.');
    } finally {
      authLoadingRef.current = false;
      setAuthLoading(false);
    }
  };

  if (!loaded) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  const showForm = adding || (cards.length === 0 && !editing) || editing;
  const card = cards[activeIdx];
  if (!showForm && !card) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <MeshBackground blobs="cards" isDark={C.isDark} />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <View>
          <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase' }}>Thunder Wallet</Text>
          <Text style={{ color: C.text1, fontSize: 24, fontFamily: 'DMSans_900Black', marginTop: 2 }}>My Cards</Text>
        </View>
        {!showForm && (
          <TouchableOpacity
            onPress={() => { setAdding(true); setEditing(false); setEditDraft(null); setFlipped(false); clearSecrets(); }}
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
            initialCard={editing ? editDraft : null}
            onSave={handleSave}
            onCancel={cards.length > 0 ? () => { setEditing(false); setAdding(false); setEditDraft(null); } : null}
            saving={saving}
          />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

            <View style={{ alignItems: 'center', paddingHorizontal: 24, marginBottom: 8, marginTop: 4 }}>
              <VirtualCard
                key={card.id}
                card={card}
                flipped={flipped}
                onFlip={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setFlipped((v) => !v);
                  clearSecrets();
                }}
              />
            </View>

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

              {revealed && secrets && (
                <RevealedPanel card={card} secrets={secrets} onHide={clearSecrets} C={C} />
              )}

              {!revealed && (
                <View style={[ms.panel, { backgroundColor: C.card, borderColor: C.border }]}>
                  <Row label="Card Holder" value={card.holderName || '—'} C={C} />
                  <Row label="Card Number" value={`•••• •••• •••• ${card.last4 || '••••'}`} C={C} />
                  <Row label="Expiry" value={card.expiry || '—'} C={C} />
                  <Row label="Network" value={card.type || 'CARD'} C={C} last />
                </View>
              )}

              <View style={[ms.secBadge, { backgroundColor: 'rgba(52,211,153,0.08)', borderColor: 'rgba(52,211,153,0.2)', marginTop: 12 }]}>
                <Ionicons name="shield-checkmark" size={13} color="#34D399" />
                <Text style={{ color: '#34D399', fontSize: 11, fontFamily: 'DMSans_700Bold', marginLeft: 6, flex: 1 }}>
                  PAN & CVV in SecureStore · biometrics to unlock · screenshots blocked · clipboard auto-clears
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                <TouchableOpacity
                  onPress={handleEdit}
                  disabled={authLoading}
                  style={[ms.actionBtn, { backgroundColor: C.cardInner, borderColor: C.border, flex: 1, opacity: authLoading ? 0.6 : 1 }]}
                >
                  <Ionicons name="pencil" size={16} color={C.text2} />
                  <Text style={{ color: C.text2, fontSize: 14, fontFamily: 'DMSans_800ExtraBold', marginLeft: 6 }}>Edit Card</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleDelete}
                  disabled={authLoading}
                  style={[ms.actionBtn, { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)', flex: 1, opacity: authLoading ? 0.6 : 1 }]}
                >
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  <Text style={{ color: '#EF4444', fontSize: 14, fontFamily: 'DMSans_800ExtraBold', marginLeft: 6 }}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>

            {cards.length > 1 && (
              <View style={{ marginHorizontal: 24 }}>
                <Text style={{ color: C.text3, fontSize: 11, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' }}>
                  All Cards
                </Text>
                {cards.map((c, i) => {
                  const cType = c.type || 'CARD';
                  const miniBg = CARD_BG[cType] || CARD_BG.CARD;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => { setActiveIdx(i); setFlipped(false); }}
                      style={[ms.cardRow, {
                        backgroundColor: i === activeIdx ? C.accentBg : C.card,
                        borderColor: i === activeIdx ? C.accentBorder : C.border,
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
                          •••• {c.last4 || '••••'} · {c.expiry || '—'}
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
