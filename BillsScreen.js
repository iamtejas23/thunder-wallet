import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import Svg, { Circle, G } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTheme } from './ThemeContext';
import MeshBackground from './MeshBackground';

// ─── Constants ────────────────────────────────────────────────────────────────

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
});

export const BILLS_KEY = 'bills_v2';

const BILL_PRESETS = [
  // ── Streaming / Entertainment ──────────────────────────────────────────────
  { name: 'Netflix',      icon: 'tv',              color: '#E50914', category: 'Entertainment', brandLetter: 'N',   letterColor: '#fff', letterBg: '#E50914' },
  { name: 'Spotify',      icon: 'musical-notes',   color: '#1DB954', category: 'Entertainment', fa5Brand: 'spotify' },
  { name: 'Amazon Prime', icon: 'cart',            color: '#00A8E1', category: 'Entertainment', fa5Brand: 'amazon' },
  { name: 'Hotstar',      icon: 'play-circle',     color: '#1F80E0', category: 'Entertainment', brandLetter: 'HS',  letterColor: '#fff', letterBg: '#1F3781' },
  { name: 'Jio',          icon: 'phone-portrait',  color: '#00549A', category: 'Bills',         brandLetter: 'Jio', letterColor: '#fff', letterBg: '#00549A' },
  { name: 'YouTube',      icon: 'logo-youtube',    color: '#FF0000', category: 'Entertainment', fa5Brand: 'youtube' },
  { name: 'Apple TV+',    icon: 'logo-apple',      color: '#1c1c1e', category: 'Entertainment', fa5Brand: 'apple' },
  { name: 'SonyLIV',      icon: 'tv',              color: '#FF5500', category: 'Entertainment', brandLetter: 'SL',  letterColor: '#fff', letterBg: '#FF5500' },
  { name: 'ZEE5',         icon: 'play',            color: '#6734D1', category: 'Entertainment', brandLetter: 'Z5',  letterColor: '#fff', letterBg: '#6734D1' },
  { name: 'ChatGPT',      icon: 'chatbubbles',     color: '#10A37F', category: 'Entertainment', brandLetter: 'AI',  letterColor: '#fff', letterBg: '#10A37F' },
  // ── Utilities & Bills ──────────────────────────────────────────────────────
  { name: 'Electricity',  icon: 'flash',           color: '#FCD34D', category: 'Bills' },
  { name: 'Water',        icon: 'water',           color: '#60A5FA', category: 'Bills' },
  { name: 'Internet',     icon: 'wifi',            color: '#A78BFA', category: 'Bills' },
  { name: 'Phone',        icon: 'phone-portrait',  color: '#94A3B8', category: 'Bills' },
  { name: 'Gas',          icon: 'flame',           color: '#F97316', category: 'Bills' },
  { name: 'Insurance',    icon: 'shield-checkmark',color: '#14B8A6', category: 'Health' },
  { name: 'Credit Card',  icon: 'card',            color: '#F87171', category: 'Bills' },
  { name: 'Gym',          icon: 'barbell',         color: '#C084FC', category: 'Health' },
  { name: 'Rent',         icon: 'home',            color: '#38BDF8', category: 'Rent' },
  { name: 'EMI',          icon: 'cash',            color: '#34D399', category: 'Bills' },
  { name: 'Custom',       icon: 'receipt',         color: '#94A3B8', category: 'Bills' },
];

function currentMonthKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Core billing period calculator ────────────────────────────────────────────
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDayBasedBillingPeriod(bill) {
  const cycleDays = Math.max(1, Number(bill.cycle) || 1);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const created = new Date(bill.createdAt || now);
  let due = new Date(created.getFullYear(), created.getMonth(), created.getDate());
  if (!isFinite(due.getTime())) due = new Date(today);

  let lastUnpaidDue = null;
  let lastUnpaidKey = null;

  for (let i = 0; i < 2000; i++) {
    const key = dateKey(due);

    if (due >= today) {
      if (lastUnpaidDue) return { status: 'overdue', dueDate: lastUnpaidDue, periodKey: lastUnpaidKey, daysUntil: 0 };
      if (bill.paidMonths?.[key]) return { status: 'paid', dueDate: due, periodKey: key, daysUntil: Math.round((due - today) / 86400000) };
      const daysUntil = Math.round((due - today) / 86400000);
      return { status: daysUntil <= 3 ? 'due-soon' : 'upcoming', dueDate: due, periodKey: key, daysUntil };
    }

    if (!bill.paidMonths?.[key]) { lastUnpaidDue = due; lastUnpaidKey = key; }
    else { lastUnpaidDue = null; lastUnpaidKey = null; }

    due = new Date(due.getFullYear(), due.getMonth(), due.getDate() + cycleDays);
  }

  return { status: 'upcoming', dueDate: today, periodKey: dateKey(today), daysUntil: 0 };
}

export function getBillingPeriod(bill) {
  // Day-based cycles (every N days) — existing month-based bills omit cycleUnit
  if (bill.cycleUnit === 'days') return getDayBasedBillingPeriod(bill);

  const cycle  = bill.cycle || 1;
  const dueDay = bill.dueDay || 1;
  const now    = new Date();
  const today  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const created = new Date(bill.createdAt || now);
  let y = created.getFullYear();
  let m = created.getMonth();
  if (!isFinite(y) || !isFinite(m)) { y = now.getFullYear(); m = now.getMonth(); }

  let lastUnpaidDue = null;
  let lastUnpaidKey = null;

  for (let i = 0; i < 500; i++) {
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const clampedDay  = Math.min(dueDay, daysInMonth);
    const due = new Date(y, m, clampedDay);
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;

    if (due >= today) {
      if (lastUnpaidDue) return { status: 'overdue', dueDate: lastUnpaidDue, periodKey: lastUnpaidKey, daysUntil: 0 };
      if (bill.paidMonths?.[key]) return { status: 'paid', dueDate: due, periodKey: key, daysUntil: Math.round((due - today) / 86400000) };
      const daysUntil = Math.round((due - today) / 86400000);
      return { status: daysUntil <= 3 ? 'due-soon' : 'upcoming', dueDate: due, periodKey: key, daysUntil };
    }

    if (!bill.paidMonths?.[key]) { lastUnpaidDue = due; lastUnpaidKey = key; }
    else { lastUnpaidDue = null; lastUnpaidKey = null; }

    m += cycle;
    if (m >= 12) { y += Math.floor(m / 12); m = m % 12; }
  }

  const fallbackKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return { status: 'upcoming', dueDate: today, periodKey: fallbackKey, daysUntil: 0 };
}

function getBillStatus(bill) { return getBillingPeriod(bill).status; }

// ─── Brand logo ────────────────────────────────────────────────────────────────
function BrandLogo({ fa5Brand, brandLetter, letterColor, letterBg, icon, color, size = 22, bgSize }) {
  const wrap   = bgSize ?? size + 18;
  const radius = wrap / 2;
  if (fa5Brand) return (
    <View style={{ alignItems: 'center', backgroundColor: `${color}18`, borderRadius: radius, height: wrap, justifyContent: 'center', width: wrap }}>
      <FontAwesome5 name={fa5Brand} size={size} color={color} brand />
    </View>
  );
  if (brandLetter) {
    const fontSize = wrap <= 40 ? 11 : 13;
    return (
      <View style={{ alignItems: 'center', backgroundColor: letterBg || color, borderRadius: radius, height: wrap, justifyContent: 'center', width: wrap }}>
        <Text style={{ color: letterColor || '#fff', fontSize, fontFamily: 'DMSans_900Black', letterSpacing: 0.5 }}>{brandLetter}</Text>
      </View>
    );
  }
  return (
    <View style={{ alignItems: 'center', backgroundColor: `${color}20`, borderRadius: radius, height: wrap, justifyContent: 'center', width: wrap }}>
      <Ionicons name={icon} size={size} color={color} />
    </View>
  );
}

// ─── Ordinal suffix ────────────────────────────────────────────────────────────
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

const CYCLES = [
  { label: 'Monthly',   value: 1  },
  { label: '2 Months',  value: 2  },
  { label: 'Quarterly', value: 3  },
  { label: '6 Months',  value: 6  },
  { label: 'Yearly',    value: 12 },
];
const CYCLE_LABELS = { 1: 'Monthly', 2: 'Every 2M', 3: 'Quarterly', 6: 'Every 6M', 12: 'Yearly' };

// ─── SVG Progress Ring ─────────────────────────────────────────────────────────
function ProgressRing({ progress = 0, size = 110, strokeWidth = 9, color = '#7C3AED', trackColor = 'rgba(255,255,255,0.12)' }) {
  const r   = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(Math.max(progress, 0), 1);
  const cx   = size / 2;
  return (
    <Svg width={size} height={size}>
      <G rotation="-90" origin={`${cx}, ${cx}`}>
        <Circle cx={cx} cy={cx} r={r} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={cx} cy={cx} r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </G>
    </Svg>
  );
}

// ─── Hero Summary Card ─────────────────────────────────────────────────────────
function HeroCard({ summary, billCount, C }) {
  const progress   = billCount ? summary.paidCount / billCount : 0;
  const monthName  = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const allPaid    = billCount > 0 && summary.paidCount === billCount;
  const ringColor  = allPaid ? '#34D399' : summary.overdue > 0 ? '#EF4444' : summary.dueSoon > 0 ? '#F97316' : '#A78BFA';

  return (
    <View style={heroStyles.card}>
      {/* Subtle glow behind the card */}
      <View style={heroStyles.glow} />

      {/* Top row: month + title */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <View style={{ flex: 1 }}>
          <Text style={heroStyles.eyebrow}>{monthName.toUpperCase()}</Text>
          <Text style={heroStyles.title}>Monthly Bills</Text>
          <Text style={heroStyles.totalAmount}>{currency.format(summary.total)}</Text>
          <Text style={heroStyles.subtitle}>Total commitment</Text>
        </View>
        {/* Progress ring */}
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <ProgressRing progress={progress} size={100} strokeWidth={8} color={ringColor} />
          <View style={{ position: 'absolute', alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 20, fontFamily: 'DMSans_900Black' }}>{Math.round(progress * 100)}%</Text>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, fontFamily: 'DMSans_700Bold' }}>CLEARED</Text>
          </View>
        </View>
      </View>

      {/* Stat chips */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <StatChip
          icon="checkmark-circle"
          label={`${summary.paidCount} Paid`}
          value={currency.format(summary.paid)}
          color="#34D399"
        />
        <StatChip
          icon="time"
          label={`${billCount - summary.paidCount} Pending`}
          value={currency.format(summary.unpaid)}
          color="#60A5FA"
        />
        {summary.overdue > 0 && (
          <StatChip
            icon="alert-circle"
            label={`${summary.overdue} Overdue`}
            value=""
            color="#EF4444"
          />
        )}
      </View>

      {/* Progress bar */}
      {billCount > 0 && (
        <View style={{ marginTop: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'DMSans_700Bold' }}>
              {summary.paidCount}/{billCount} bills cleared
            </Text>
            {allPaid && <Text style={{ color: '#34D399', fontSize: 11, fontFamily: 'DMSans_800ExtraBold' }}>All Clear! 🎉</Text>}
          </View>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, height: 6, overflow: 'hidden' }}>
            <View style={{
              backgroundColor: ringColor, borderRadius: 8, height: 6,
              width: `${progress * 100}%`,
            }} />
          </View>
        </View>
      )}
    </View>
  );
}

function StatChip({ icon, label, value, color }) {
  return (
    <View style={{ flex: 1, backgroundColor: `${color}15`, borderColor: `${color}30`, borderRadius: 12, borderWidth: 1, padding: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 }}>
        <Ionicons name={icon} size={12} color={color} />
        <Text style={{ color, fontSize: 10, fontFamily: 'DMSans_800ExtraBold' }}>{label}</Text>
      </View>
      {!!value && <Text style={{ color: '#fff', fontSize: 14, fontFamily: 'DMSans_900Black' }}>{value}</Text>}
    </View>
  );
}

const heroStyles = StyleSheet.create({
  card: {
    backgroundColor: '#1E1040',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.35)',
    padding: 20,
    marginBottom: 16,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute', top: -40, right: -40,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(124,58,237,0.25)',
  },
  eyebrow: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2 },
  title:   { color: '#fff', fontSize: 22, fontFamily: 'DMSans_900Black', marginTop: 2 },
  totalAmount: { color: '#A78BFA', fontSize: 34, fontFamily: 'DMSans_900Black', letterSpacing: -0.5, marginTop: 8 },
  subtitle: { color: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'DMSans_700Bold', marginTop: 2 },
});

// ─── Upcoming timeline ─────────────────────────────────────────────────────────
function UpcomingTimeline({ bills, C }) {
  const upcoming = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return bills
      .map(b => ({ ...b, _period: getBillingPeriod(b) }))
      .filter(b => b._period.status !== 'paid')
      .sort((a, b) => a._period.dueDate - b._period.dueDate)
      .slice(0, 6);
  }, [bills]);

  if (!upcoming.length) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>
        Upcoming Payments
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 4 }}>
        {upcoming.map((b) => {
          const { daysUntil, dueDate, status } = b._period;
          const color = status === 'overdue' ? '#EF4444' : status === 'due-soon' ? '#F97316' : C.accent;
          const dayLabel = daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil}d`;
          const dateStr = dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
          return (
            <View key={b.id} style={{
              alignItems: 'center',
              backgroundColor: C.card,
              borderColor: `${color}30`,
              borderRadius: 16,
              borderWidth: 1,
              paddingHorizontal: 14,
              paddingVertical: 12,
              minWidth: 90,
              gap: 8,
            }}>
              <BrandLogo fa5Brand={b.fa5Brand} brandLetter={b.brandLetter} letterColor={b.letterColor} letterBg={b.letterBg} icon={b.icon} color={b.color} size={16} bgSize={36} />
              <Text style={{ color: color, fontSize: 12, fontFamily: 'DMSans_900Black' }}>{dayLabel}</Text>
              <Text style={{ color: C.text1, fontSize: 11, fontFamily: 'DMSans_800ExtraBold', textAlign: 'center' }} numberOfLines={1}>{b.name}</Text>
              <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_600SemiBold' }}>{dateStr}</Text>
              <Text style={{ color: b.color, fontSize: 12, fontFamily: 'DMSans_800ExtraBold' }}>
                {currency.format(b.amount)}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Alert banner ─────────────────────────────────────────────────────────────
function AlertBanner({ icon, message, color, bg, border }) {
  const scaleAnim = useRef(new Animated.Value(0.96)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(scaleAnim, { toValue: 0.96, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={[{ backgroundColor: bg, borderColor: border, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, marginBottom: 8 }, { transform: [{ scale: scaleAnim }] }]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={{ color, fontSize: 13, fontFamily: 'DMSans_800ExtraBold', flex: 1 }}>{message}</Text>
    </Animated.View>
  );
}

// ─── Premium Bill Card ─────────────────────────────────────────────────────────
function BillCard({ bill, onPay, onUnpay, onDelete, C }) {
  const { status, daysUntil, dueDate, periodKey } = getBillingPeriod(bill);
  const isPaid  = status === 'paid';
  const cycle   = bill.cycle || 1;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const statusConfig = {
    paid:      { label: 'Paid',      color: '#22C55E', bg: 'rgba(34,197,94,0.1)',   icon: 'checkmark-circle',   border: 'rgba(34,197,94,0.2)'  },
    overdue:   { label: 'Overdue',   color: '#EF4444', bg: 'rgba(239,68,68,0.08)',  icon: 'alert-circle',       border: 'rgba(239,68,68,0.3)'  },
    'due-soon':{ label: 'Due Soon',  color: '#F97316', bg: 'rgba(249,115,22,0.08)', icon: 'time',               border: 'rgba(249,115,22,0.25)' },
    upcoming:  { label: 'Upcoming',  color: '#60A5FA', bg: 'rgba(96,165,250,0.08)', icon: 'calendar-outline',   border: 'rgba(96,165,250,0.15)' },
  };
  const sc = statusConfig[status] || statusConfig.upcoming;

  const dueDateStr = dueDate.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short',
    ...(dueDate.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });

  const paidAtStr = isPaid && bill.paidMonths?.[periodKey]?.paidAt
    ? new Date(bill.paidMonths[periodKey].paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : null;

  const dateText = isPaid
    ? (paidAtStr ? `Paid on ${paidAtStr}` : 'Marked paid')
    : status === 'overdue'
      ? `Overdue since ${dueDateStr}`
      : daysUntil === 0
        ? 'Due today'
        : daysUntil === 1
          ? 'Due tomorrow'
          : `Due ${dueDateStr} · ${daysUntil}d away`;

  const handlePressIn = () => Animated.spring(scaleAnim, { toValue: 0.98, useNativeDriver: true, friction: 8 }).start();
  const handlePressOut = () => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          billStyles.card,
          { backgroundColor: C.card, borderColor: status === 'overdue' ? 'rgba(239,68,68,0.30)' : isPaid ? 'rgba(34,197,94,0.15)' : C.border },
        ]}
      >
        {/* Left accent bar */}
        <View style={[billStyles.accentBar, { backgroundColor: bill.color }]} />

        {/* Content */}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 4 }}>
          {/* Brand logo */}
          <BrandLogo
            fa5Brand={bill.fa5Brand}
            brandLetter={bill.brandLetter}
            letterColor={bill.letterColor}
            letterBg={bill.letterBg}
            icon={bill.icon}
            color={bill.color}
            size={20}
            bgSize={44}
          />

          {/* Text */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
              <Text style={{ color: C.text1, fontSize: 15, fontFamily: 'DMSans_800ExtraBold' }} numberOfLines={1}>{bill.name}</Text>
              <View style={{ backgroundColor: sc.bg, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ color: sc.color, fontSize: 10, fontFamily: 'DMSans_800ExtraBold' }}>{sc.label}</Text>
              </View>
              {(bill.cycleUnit === 'days' || cycle > 1) && (
                <View style={{ backgroundColor: C.cardInner, borderColor: C.border, borderRadius: 7, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ color: C.text3, fontSize: 9, fontFamily: 'DMSans_800ExtraBold' }}>
                    {bill.cycleUnit === 'days'
                      ? `Every ${cycle}d`
                      : (CYCLE_LABELS[cycle] || `Every ${cycle}M`)}
                  </Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ color: bill.color, fontSize: 18, fontFamily: 'DMSans_900Black' }}>{currency.format(bill.amount)}</Text>
              <Text style={{ color: C.text3, fontSize: 11, fontFamily: 'DMSans_600SemiBold' }}>{dateText}</Text>
            </View>
            {!!bill.notes && (
              <Text style={{ color: C.text3, fontSize: 11, marginTop: 3 }} numberOfLines={1}>{bill.notes}</Text>
            )}
          </View>

          {/* Actions */}
          <View style={{ alignItems: 'flex-end', gap: 8 }}>
            <TouchableOpacity
              onPress={() => isPaid ? onUnpay(bill) : onPay(bill)}
              style={[
                billStyles.payBtn,
                {
                  backgroundColor: isPaid ? C.cardInner : bill.color,
                  borderColor:     isPaid ? C.border    : bill.color,
                },
              ]}
              activeOpacity={0.8}
            >
              <Ionicons name={isPaid ? 'close-circle-outline' : 'checkmark'} size={13} color={isPaid ? C.text3 : '#000'} />
              <Text style={{ color: isPaid ? C.text3 : '#000', fontSize: 11, fontFamily: 'DMSans_800ExtraBold' }}>
                {isPaid ? 'Unmark' : 'Pay'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onDelete(bill)} style={{ padding: 6 }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Ionicons name="trash-outline" size={14} color={C.text3} />
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const billStyles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 10,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  accentBar: { width: 4, borderRadius: 0 },
  payBtn: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
});

// ─── Add Bill Modal ────────────────────────────────────────────────────────────
function AddBillModal({ visible, onClose, onAdd }) {
  const { C } = useTheme();
  const [step,           setStep]           = useState('preset');
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [name,           setName]           = useState('');
  const [amount,         setAmount]         = useState('');
  const [dueDay,         setDueDay]         = useState('1');
  const [cycle,          setCycle]          = useState(1);
  const [cycleUnit,      setCycleUnit]      = useState('months');
  const [cycleDays,      setCycleDays]      = useState('30');
  const [notes,          setNotes]          = useState('');
  const [catFilter,      setCatFilter]      = useState('All');

  const CATS = useMemo(() => ['All', ...new Set(BILL_PRESETS.map(p => p.category))], []);

  const filteredPresets = useMemo(() =>
    catFilter === 'All' ? BILL_PRESETS : BILL_PRESETS.filter(p => p.category === catFilter),
  [catFilter]);

  const reset = () => {
    setStep('preset');
    setSelectedPreset(null);
    setName('');
    setAmount('');
    setDueDay('1');
    setCycle(1);
    setCycleUnit('months');
    setCycleDays('30');
    setNotes('');
    setCatFilter('All');
  };

  const handleClose = () => { reset(); onClose(); };

  const selectPreset = (preset) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPreset(preset);
    if (preset.name !== 'Custom') setName(preset.name);
    setStep('details');
  };

  const handleAdd = () => {
    const trimmedName = name.trim();
    if (!trimmedName) { Alert.alert('Name required', 'Enter a bill name.'); return; }
    const amt = parseFloat(amount);
    if (!isFinite(amt) || amt <= 0) { Alert.alert('Invalid amount', 'Enter a valid amount.'); return; }

    let day = 1;
    let cycleValue = cycle;
    if (cycleUnit === 'days') {
      const days = parseInt(cycleDays, 10);
      if (!isFinite(days) || days < 1 || days > 3650) {
        Alert.alert('Invalid cycle', 'Enter a number of days between 1 and 3650.');
        return;
      }
      cycleValue = days;
    } else {
      day = parseInt(dueDay, 10);
      if (!isFinite(day) || day < 1 || day > 31) { Alert.alert('Invalid due day', 'Enter a day between 1 and 31.'); return; }
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onAdd({
      id:          String(Date.now()),
      name:        trimmedName,
      amount:      amt,
      dueDay:      day,
      cycle:       cycleValue,
      cycleUnit,
      icon:        selectedPreset?.icon        || 'receipt',
      color:       selectedPreset?.color       || '#94A3B8',
      fa5Brand:    selectedPreset?.fa5Brand    || null,
      brandLetter: selectedPreset?.brandLetter || null,
      letterColor: selectedPreset?.letterColor || null,
      letterBg:    selectedPreset?.letterBg    || null,
      category:    selectedPreset?.category    || 'Bills',
      notes:       notes.trim(),
      isActive:    true,
      paidMonths:  {},
      createdAt:   new Date().toISOString(),
    });
    reset();
    onClose();
  };

  const preset = selectedPreset || BILL_PRESETS[0];

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={handleClose} />

        <View style={{ backgroundColor: C.card, borderTopColor: C.border, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, maxHeight: '92%' }}>
          <View style={{ alignSelf: 'center', backgroundColor: C.border, borderRadius: 3, height: 4, marginTop: 12, width: 40 }} />

          {step === 'preset' ? (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
              <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase' }}>Add Bill</Text>
              <Text style={{ color: C.text1, fontSize: 22, fontFamily: 'DMSans_900Black', marginBottom: 16, marginTop: 2 }}>Choose Bill Type</Text>

              {/* Category filter pills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 16, paddingBottom: 2 }}>
                {CATS.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCatFilter(cat); }}
                    style={{
                      backgroundColor: catFilter === cat ? C.accent : C.cardInner,
                      borderColor: catFilter === cat ? C.accent : C.border,
                      borderRadius: 20, borderWidth: 1,
                      paddingHorizontal: 14, paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: catFilter === cat ? (C.isDark ? '#000' : '#fff') : C.text2, fontSize: 12, fontFamily: 'DMSans_800ExtraBold' }}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Preset grid */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {filteredPresets.map((p) => (
                  <TouchableOpacity
                    key={p.name}
                    onPress={() => selectPreset(p)}
                    style={{ alignItems: 'center', backgroundColor: C.cardInner, borderColor: C.border, borderRadius: 16, borderWidth: 1, gap: 6, paddingHorizontal: 14, paddingVertical: 12, minWidth: '28%', flex: 1 }}
                  >
                    <BrandLogo fa5Brand={p.fa5Brand} brandLetter={p.brandLetter} letterColor={p.letterColor} letterBg={p.letterBg} icon={p.icon} color={p.color} size={20} bgSize={42} />
                    <Text style={{ color: C.text1, fontSize: 11, fontFamily: 'DMSans_800ExtraBold', textAlign: 'center' }}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
              {/* Back */}
              <TouchableOpacity onPress={() => setStep('preset')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                <Ionicons name="chevron-back" size={18} color={C.text3} />
                <Text style={{ color: C.text3, fontSize: 13, fontFamily: 'DMSans_700Bold' }}>Back</Text>
              </TouchableOpacity>

              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 22 }}>
                <BrandLogo fa5Brand={preset.fa5Brand} brandLetter={preset.brandLetter} letterColor={preset.letterColor} letterBg={preset.letterBg} icon={preset.icon} color={preset.color} size={26} bgSize={54} />
                <View>
                  <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase' }}>New Bill</Text>
                  <Text style={{ color: C.text1, fontSize: 20, fontFamily: 'DMSans_900Black' }}>Bill Details</Text>
                </View>
              </View>

              {/* Amount — hero input */}
              <View style={{ alignItems: 'center', marginBottom: 22 }}>
                <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>Amount</Text>
                <View style={[formStyles.amountHero, { borderColor: `${preset.color}50` }]}>
                  <Text style={{ color: preset.color, fontSize: 28, fontFamily: 'DMSans_900Black', letterSpacing: -0.5, marginRight: 4 }}>₹</Text>
                  <TextInput
                    style={{ color: C.text1, fontSize: 36, fontFamily: 'DMSans_900Black', letterSpacing: -0.5, minWidth: 80 }}
                    placeholder="0"
                    placeholderTextColor={C.text3}
                    keyboardType="decimal-pad"
                    value={amount}
                    onChangeText={setAmount}
                    autoFocus
                  />
                </View>
              </View>

              {/* Bill Name */}
              <Text style={[formStyles.label, { color: C.text2 }]}>Bill Name</Text>
              <TextInput
                style={[formStyles.input, { backgroundColor: C.cardInner, borderColor: C.border, color: C.text1 }]}
                placeholder={preset.name !== 'Custom' ? preset.name : 'e.g. BESCOM Electricity'}
                placeholderTextColor={C.text3}
                value={name}
                onChangeText={setName}
              />

              {/* Due day — only for month-based cycles */}
              {cycleUnit === 'months' && (
                <>
                  <Text style={[formStyles.label, { color: C.text2 }]}>Due Day of Month</Text>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    {['1', '5', '10', '15', '20', '25', '28'].map((d) => (
                      <TouchableOpacity
                        key={d}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDueDay(d); }}
                        style={{
                          alignItems: 'center',
                          backgroundColor: dueDay === d ? `${preset.color}25` : C.cardInner,
                          borderColor: dueDay === d ? preset.color : C.border,
                          borderRadius: 10, borderWidth: dueDay === d ? 1.5 : 1,
                          height: 42, justifyContent: 'center', width: 44,
                        }}
                      >
                        <Text style={{ color: dueDay === d ? preset.color : C.text2, fontSize: 13, fontFamily: 'DMSans_800ExtraBold' }}>{d}</Text>
                      </TouchableOpacity>
                    ))}
                    <TextInput
                      style={[{ alignItems: 'center', backgroundColor: C.cardInner, borderColor: C.border, borderRadius: 10, borderWidth: 1, color: C.text1, fontSize: 13, fontFamily: 'DMSans_800ExtraBold', height: 42, paddingHorizontal: 8, textAlign: 'center', width: 56 }]}
                      placeholder="Day"
                      placeholderTextColor={C.text3}
                      keyboardType="number-pad"
                      value={dueDay}
                      onChangeText={setDueDay}
                      maxLength={2}
                    />
                  </View>
                  <Text style={{ color: C.text3, fontSize: 11, fontFamily: 'DMSans_600SemiBold', marginBottom: 16 }}>
                    You'll be reminded the day before and on the {ordinal(parseInt(dueDay, 10) || 1)}
                  </Text>
                </>
              )}

              {/* Billing cycle */}
              <Text style={[formStyles.label, { color: C.text2 }]}>Billing Cycle</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
                {CYCLES.map(({ label, value }) => (
                  <TouchableOpacity
                    key={value}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setCycle(value);
                      setCycleUnit('months');
                    }}
                    style={{
                      alignItems: 'center',
                      backgroundColor: cycleUnit === 'months' && cycle === value ? `${preset.color}25` : C.cardInner,
                      borderColor: cycleUnit === 'months' && cycle === value ? preset.color : C.border,
                      borderRadius: 10, borderWidth: cycleUnit === 'months' && cycle === value ? 1.5 : 1,
                      paddingHorizontal: 16, paddingVertical: 9,
                    }}
                  >
                    <Text style={{ color: cycleUnit === 'months' && cycle === value ? preset.color : C.text2, fontSize: 12, fontFamily: 'DMSans_800ExtraBold' }}>{label}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setCycleUnit('days');
                  }}
                  style={{
                    alignItems: 'center',
                    backgroundColor: cycleUnit === 'days' ? `${preset.color}25` : C.cardInner,
                    borderColor: cycleUnit === 'days' ? preset.color : C.border,
                    borderRadius: 10, borderWidth: cycleUnit === 'days' ? 1.5 : 1,
                    paddingHorizontal: 16, paddingVertical: 9,
                  }}
                >
                  <Text style={{ color: cycleUnit === 'days' ? preset.color : C.text2, fontSize: 12, fontFamily: 'DMSans_800ExtraBold' }}>Custom Days</Text>
                </TouchableOpacity>
              </ScrollView>

              {cycleUnit === 'days' && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={[formStyles.label, { color: C.text2 }]}>Every how many days?</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                    {['7', '15', '30', '45', '60'].map((d) => (
                      <TouchableOpacity
                        key={d}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCycleDays(d); }}
                        style={{
                          alignItems: 'center',
                          backgroundColor: cycleDays === d ? `${preset.color}25` : C.cardInner,
                          borderColor: cycleDays === d ? preset.color : C.border,
                          borderRadius: 10, borderWidth: cycleDays === d ? 1.5 : 1,
                          height: 42, justifyContent: 'center', paddingHorizontal: 12,
                        }}
                      >
                        <Text style={{ color: cycleDays === d ? preset.color : C.text2, fontSize: 13, fontFamily: 'DMSans_800ExtraBold' }}>{d}d</Text>
                      </TouchableOpacity>
                    ))}
                    <TextInput
                      style={[{ backgroundColor: C.cardInner, borderColor: C.border, borderRadius: 10, borderWidth: 1, color: C.text1, fontSize: 13, fontFamily: 'DMSans_800ExtraBold', height: 42, paddingHorizontal: 10, textAlign: 'center', width: 64 }]}
                      placeholder="Days"
                      placeholderTextColor={C.text3}
                      keyboardType="number-pad"
                      value={cycleDays}
                      onChangeText={setCycleDays}
                      maxLength={4}
                    />
                  </View>
                  <Text style={{ color: C.text3, fontSize: 11, fontFamily: 'DMSans_600SemiBold' }}>
                    Repeats every {parseInt(cycleDays, 10) || '—'} day{(parseInt(cycleDays, 10) || 0) === 1 ? '' : 's'} starting today
                  </Text>
                </View>
              )}

              {/* Notes */}
              <Text style={[formStyles.label, { color: C.text2 }]}>Notes (optional)</Text>
              <TextInput
                style={[formStyles.input, { backgroundColor: C.cardInner, borderColor: C.border, color: C.text1 }]}
                placeholder="Account number, provider info…"
                placeholderTextColor={C.text3}
                value={notes}
                onChangeText={setNotes}
              />

              {/* Save */}
              <TouchableOpacity
                onPress={handleAdd}
                style={[formStyles.saveBtn, { backgroundColor: preset.color, shadowColor: preset.color }]}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark-circle" size={20} color="#000" />
                <Text style={{ color: '#000', fontSize: 16, fontFamily: 'DMSans_900Black' }}>Add Bill</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const formStyles = StyleSheet.create({
  label:    { fontSize: 11, fontFamily: 'DMSans_700Bold', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  input:    { borderRadius: 13, borderWidth: 1, fontSize: 15, marginBottom: 16, minHeight: 50, paddingHorizontal: 14 },
  amountHero: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 2,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 72,
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  saveBtn: {
    alignItems: 'center',
    borderRadius: 16,
    elevation: 6,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 6,
    minHeight: 56,
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
  },
});

// ─── Filter tabs ───────────────────────────────────────────────────────────────
function FilterTabs({ filter, setFilter, summary, billCount, C }) {
  const TABS = [
    { key: 'all',    label: 'All',    count: billCount },
    { key: 'unpaid', label: 'Unpaid', count: billCount - summary.paidCount },
    { key: 'paid',   label: 'Paid',   count: summary.paidCount },
  ];
  return (
    <View style={{ flexDirection: 'row', backgroundColor: C.card, borderColor: C.border, borderRadius: 14, borderWidth: 1, gap: 3, marginBottom: 14, padding: 3 }}>
      {TABS.map(({ key, label, count }) => (
        <TouchableOpacity
          key={key}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFilter(key); }}
          style={{
            flex: 1,
            alignItems: 'center',
            backgroundColor: filter === key ? C.accent : 'transparent',
            borderRadius: 11,
            flexDirection: 'row',
            gap: 5,
            justifyContent: 'center',
            paddingVertical: 9,
          }}
        >
          <Text style={{ color: filter === key ? (C.isDark ? '#000' : '#fff') : C.text2, fontSize: 13, fontFamily: 'DMSans_800ExtraBold' }}>{label}</Text>
          {count > 0 && (
            <View style={{ backgroundColor: filter === key ? 'rgba(0,0,0,0.15)' : C.border, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
              <Text style={{ color: filter === key ? (C.isDark ? '#000' : '#fff') : C.text3, fontSize: 10, fontFamily: 'DMSans_900Black' }}>{count}</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ onAdd, C }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 1000, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ])
    ).start();
  }, []);

  return (
    <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24 }}>
      <View style={{ alignItems: 'center', backgroundColor: C.cardInner, borderColor: C.border, borderRadius: 32, borderStyle: 'dashed', borderWidth: 1.5, padding: 32, width: '100%', gap: 12 }}>
        <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 28, borderWidth: 1, height: 72, width: 72, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="receipt-outline" size={32} color={C.text3} />
        </View>
        <Text style={{ color: C.text1, fontSize: 18, fontFamily: 'DMSans_900Black', textAlign: 'center' }}>No bills yet</Text>
        <Text style={{ color: C.text2, fontSize: 13, lineHeight: 20, textAlign: 'center' }}>
          Track recurring bills like electricity, Netflix, and rent to never miss a payment.
        </Text>
        <Animated.View style={{ transform: [{ scale: pulseAnim }], marginTop: 6 }}>
          <TouchableOpacity
            onPress={onAdd}
            style={{ backgroundColor: C.accent, borderRadius: 14, flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 22, paddingVertical: 13 }}
          >
            <Ionicons name="add-circle-outline" size={18} color={C.isDark ? '#000' : '#fff'} />
            <Text style={{ color: C.isDark ? '#000' : '#fff', fontSize: 14, fontFamily: 'DMSans_900Black' }}>Add your first bill</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

// ─── Bills Screen ──────────────────────────────────────────────────────────────
export default function BillsScreen({ bills, onAddBill, onDeleteBill, onMarkPaid, onMarkUnpaid }) {
  const { C }          = useTheme();
  const [showModal, setShowModal] = useState(false);
  const [filter,    setFilter]    = useState('all');

  const enriched = useMemo(() => bills.map(b => ({ ...b, _status: getBillStatus(b) })), [bills]);

  const filtered = useMemo(() => {
    if (filter === 'paid')   return enriched.filter(b => b._status === 'paid');
    if (filter === 'unpaid') return enriched.filter(b => b._status !== 'paid');
    return enriched;
  }, [enriched, filter]);

  const sorted = useMemo(() => {
    const order = { overdue: 0, 'due-soon': 1, upcoming: 2, paid: 3 };
    return [...filtered].sort((a, b) => {
      const od = order[a._status] - order[b._status];
      return od !== 0 ? od : a.dueDay - b.dueDay;
    });
  }, [filtered]);

  const summary = useMemo(() => {
    const total     = bills.reduce((s, b) => s + b.amount, 0);
    const paidBills = bills.filter(b => getBillingPeriod(b).status === 'paid');
    const paid      = paidBills.reduce((s, b) => s + b.amount, 0);
    const unpaid    = total - paid;
    const overdue   = bills.filter(b => getBillingPeriod(b).status === 'overdue').length;
    const dueSoon   = bills.filter(b => getBillingPeriod(b).status === 'due-soon').length;
    return { total, paid, unpaid, overdue, dueSoon, paidCount: paidBills.length };
  }, [bills]);

  const handleDelete = useCallback((bill) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Delete Bill', `Remove "${bill.name}"? This won't affect past transactions.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDeleteBill(bill.id) },
    ]);
  }, [onDeleteBill]);

  const handlePay = useCallback((bill) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      `Mark "${bill.name}" as paid?`,
      `₹${bill.amount.toLocaleString('en-IN')} will be logged as an expense.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Mark Paid', onPress: () => onMarkPaid(bill) },
      ]
    );
  }, [onMarkPaid]);

  const handleUnpay = useCallback((bill) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      `Unmark "${bill.name}"?`,
      'This will also remove the auto-created expense transaction.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unmark', style: 'destructive', onPress: () => onMarkUnpaid(bill) },
      ]
    );
  }, [onMarkUnpaid]);

  const ListHeader = useCallback(() => (
    <>
      {/* Page header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <View>
          <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase' }}>Tracker</Text>
          <Text style={{ color: C.text1, fontSize: 28, fontFamily: 'DMSans_900Black', letterSpacing: -0.5, marginTop: 2 }}>Bills</Text>
        </View>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowModal(true); }}
          style={{ alignItems: 'center', backgroundColor: C.accentBg, borderColor: C.accentBorder, borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 10 }}
        >
          <Ionicons name="add" size={17} color={C.accent} />
          <Text style={{ color: C.accent, fontSize: 13, fontFamily: 'DMSans_800ExtraBold' }}>Add Bill</Text>
        </TouchableOpacity>
      </View>

      {bills.length > 0 && (
        <>
          <HeroCard summary={summary} billCount={bills.length} C={C} />

          {/* Alert banners */}
          {summary.overdue > 0 && (
            <AlertBanner
              icon="alert-circle"
              message={`${summary.overdue} bill${summary.overdue > 1 ? 's' : ''} overdue — pay now to avoid late fees`}
              color="#EF4444"
              bg="rgba(239,68,68,0.08)"
              border="rgba(239,68,68,0.25)"
            />
          )}
          {summary.dueSoon > 0 && (
            <AlertBanner
              icon="time"
              message={`${summary.dueSoon} bill${summary.dueSoon > 1 ? 's' : ''} due within 3 days`}
              color="#F97316"
              bg="rgba(249,115,22,0.08)"
              border="rgba(249,115,22,0.25)"
            />
          )}

          {/* Upcoming timeline */}
          <UpcomingTimeline bills={bills} C={C} />

          {/* Filter tabs */}
          <FilterTabs filter={filter} setFilter={setFilter} summary={summary} billCount={bills.length} C={C} />
        </>
      )}
    </>
  ), [bills, summary, filter, C]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <MeshBackground blobs="bills" isDark={C.isDark} />
      <FlatList
        data={sorted}
        keyExtractor={b => b.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        ListHeaderComponent={ListHeader}
        renderItem={({ item }) => (
          <BillCard
            bill={item}
            onPay={handlePay}
            onUnpay={handleUnpay}
            onDelete={handleDelete}
            C={C}
          />
        )}
        ListEmptyComponent={
          <EmptyState onAdd={() => setShowModal(true)} C={C} />
        }
      />

      <AddBillModal visible={showModal} onClose={() => setShowModal(false)} onAdd={onAddBill} />
    </SafeAreaView>
  );
}
