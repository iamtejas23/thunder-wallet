import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import MeshBackground from './MeshBackground';
import { useTheme } from './ThemeContext';
import SettingsScreen from './SettingsScreen';
import TransactionList from './TransactionList';
import TransactionModal from './TransactionModal';
import BillsScreen, { BILLS_KEY, getBillingPeriod } from './BillsScreen';
import CardScreen, { clearAllCardData } from './CardScreen';
import { clearStoredPin } from './PinScreen';
import { scheduleDailyReview, scheduleBillReminders, requestNotificationPermission } from './NotificationService';
import { useUpdateChecker } from './UpdateChecker';
import UpdateModal from './UpdateModal';

const Tab = createBottomTabNavigator();
const STORAGE_KEY = 'transactions';
const BUDGET_KEY = 'monthlyBudget';
const GOALS_KEY = 'savingsGoals';
const CAT_BUDGETS_KEY = 'categoryBudgets';
const SAVINGS_KEY = 'savings_v1';
const HIDE_BALANCE_KEY = 'hideBalanceFeature';
const DAILY_LIMIT_KEY = 'dailySpendLimit';
const DEFAULT_MONTHLY_BUDGET = 30000;
const CHART_COLORS = ['#F87171', '#60A5FA', '#FCD34D', '#34D399', '#A78BFA', '#FB923C'];

const GOAL_PRESETS = [
  { icon: 'phone-portrait', color: '#60A5FA', label: 'Phone' },
  { icon: 'airplane', color: '#4ECDC4', label: 'Trip' },
  { icon: 'car', color: '#F87171', label: 'Vehicle' },
  { icon: 'home', color: '#A78BFA', label: 'Home' },
  { icon: 'laptop', color: '#FCD34D', label: 'Laptop' },
  { icon: 'star', color: '#FB923C', label: 'Dream' },
  { icon: 'school', color: '#34D399', label: 'Study' },
  { icon: 'heart', color: '#F87171', label: 'Health' },
  { icon: 'diamond', color: '#60A5FA', label: 'Luxury' },
  { icon: 'gift', color: '#FCD34D', label: 'Gift' },
];

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const compactCurrency = new Intl.NumberFormat('en-IN', { currency: 'INR', maximumFractionDigits: 0, notation: 'compact', style: 'currency' });

const normalizeTransaction = (t) => {
  const hasType = t.type === 'income' || t.type === 'expense';
  const type = hasType ? t.type : 'expense';
  const raw = Number.parseFloat(t.amount) || 0;
  const amount = type === 'expense' ? -Math.abs(raw) : Math.abs(raw);
  return {
    ...t,
    id: String(t.id || Date.now()),
    amount,
    type,
    date: t.date || new Date().toISOString(),
    note: t.note || '',
    recurring: t.recurring || null,
  };
};

// Returns "YYYY-MM-DD" in LOCAL timezone — avoids UTC-offset date-shift bugs
const localDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const toLocalDate = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Top categories for charts; folds the rest into "Other" so the donut always closes. */
const buildCategoryPie = (transactions, { monthOnly = false } = {}) => {
  const now = new Date();
  const cm = now.getMonth();
  const cy = now.getFullYear();
  const cats = {};
  let total = 0;

  transactions.forEach((t) => {
    if (!(t.amount < 0)) return;
    const d = toLocalDate(t.date);
    if (!d) return;
    if (monthOnly && (d.getMonth() !== cm || d.getFullYear() !== cy)) return;
    const abs = Math.abs(t.amount);
    const cat = t.category || 'Other';
    cats[cat] = (cats[cat] || 0) + abs;
    total += abs;
  });

  const entries = Object.entries(cats).sort(([, a], [, b]) => b - a);
  let rows = entries;
  if (entries.length > 6) {
    const top = entries.slice(0, 5);
    const otherAmount = entries.slice(5).reduce((s, [, amount]) => s + amount, 0);
    rows = [...top, ['Other', otherAmount]];
  }

  const pieData = rows.map(([category, amount], i) => ({
    category,
    amount,
    percentage: total ? (amount / total) * 100 : 0,
    color: category === 'Other' ? '#94A3B8' : CHART_COLORS[i % CHART_COLORS.length],
  }));

  return { pieData, pieTotal: total };
};

const polarToCartesian = (c, r, deg) => {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: c + r * Math.cos(rad), y: c + r * Math.sin(rad) };
};

const describeArc = (c, r, s, e) => {
  const start = polarToCartesian(c, r, e);
  const end = polarToCartesian(c, r, s);
  const flag = e - s <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${flag} 0 ${end.x} ${end.y}`;
};

/** Filled donut wedge — much better tap target than a stroked arc. */
const describeDonutSlice = (cx, cy, rOuter, rInner, startAngle, endAngle) => {
  const sweep = endAngle - startAngle;
  if (sweep <= 0) return null;
  const large = sweep <= 180 ? '0' : '1';
  const so = polarToCartesian(cx, rOuter, endAngle);
  const eo = polarToCartesian(cx, rOuter, startAngle);
  const si = polarToCartesian(cx, rInner, endAngle);
  const ei = polarToCartesian(cx, rInner, startAngle);
  return [
    `M ${so.x} ${so.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 0 ${eo.x} ${eo.y}`,
    `L ${ei.x} ${ei.y}`,
    `A ${rInner} ${rInner} 0 ${large} 1 ${si.x} ${si.y}`,
    'Z',
  ].join(' ');
};

/** Convert touch point to degrees where 0 = top, clockwise (matches donut). */
const touchToDonutAngle = (x, y, cx, cy) => {
  let deg = (Math.atan2(y - cy, x - cx) * 180) / Math.PI + 90;
  if (deg < 0) deg += 360;
  if (deg >= 360) deg -= 360;
  return deg;
};

// ─── Streak ───────────────────────────────────────────────────────────────────
function calculateStreak(transactions, monthlyBudget) {
  const now = new Date();
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const dailyBudget = monthlyBudget / dim;
    const dateStr = localDateStr(d);
    const daySpend = transactions
      .filter((t) => localDateStr(new Date(t.date)) === dateStr && t.amount < 0)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    if (daySpend <= dailyBudget) streak++;
    else break;
  }
  return streak;
}

// ─── Smart Insights ───────────────────────────────────────────────────────────
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function generateSmartInsights(transactions) {
  if (!transactions.length) return [];
  const expenses = transactions.filter((t) => t.amount < 0 && toLocalDate(t.date));
  if (!expenses.length) return [];
  const insights = [];

  const dowSpend = {};
  expenses.forEach((t) => { const dow = toLocalDate(t.date).getDay(); dowSpend[dow] = (dowSpend[dow] || 0) + Math.abs(t.amount); });
  const [peakDow] = Object.entries(dowSpend).sort(([, a], [, b]) => b - a);
  if (peakDow) insights.push({ icon: 'calendar', color: '#60A5FA', title: 'Peak Spending Day', body: `${DAY_NAMES[+peakDow[0]]}s are your biggest spending days. Plan ahead!` });

  const wEnd = expenses.filter((t) => [0, 6].includes(toLocalDate(t.date).getDay())).reduce((s, t) => s + Math.abs(t.amount), 0);
  const wDay = expenses.filter((t) => ![0, 6].includes(toLocalDate(t.date).getDay())).reduce((s, t) => s + Math.abs(t.amount), 0);
  if (wEnd > wDay * 0.6) insights.push({ icon: 'sunny', color: '#FB923C', title: 'Weekend Spender', body: 'You spend more on weekends. Consider setting a weekend limit.' });
  else if (expenses.length > 5) insights.push({ icon: 'briefcase', color: '#A78BFA', title: 'Disciplined Weekends', body: 'Great job — your weekend spending stays controlled.' });

  if (expenses.length >= 3) {
    const avg = expenses.reduce((s, t) => s + Math.abs(t.amount), 0) / expenses.length;
    insights.push({ icon: 'receipt', color: '#34D399', title: 'Avg Transaction', body: `Your average expense is ${currency.format(avg)} per transaction.` });
  }

  const incomeRatio = transactions.filter((t) => t.amount >= 0).length / transactions.length;
  if (incomeRatio < 0.15 && transactions.length >= 8) insights.push({ icon: 'alert-circle', color: '#FCD34D', title: 'Add Income Entries', body: 'Most entries are expenses. Log your income for accurate balance tracking.' });

  return insights.slice(0, 4);
}

// ─── Confetti Overlay ─────────────────────────────────────────────────────────
function ConfettiOverlay({ visible, goalName, onDismiss }) {
  const particles = useRef(
    Array.from({ length: 22 }, (_, i) => ({
      x: new Animated.Value(0.1 + Math.random() * 0.8),
      y: new Animated.Value(-0.1),
      opacity: new Animated.Value(1),
      rotate: new Animated.Value(0),
      color: CHART_COLORS[i % CHART_COLORS.length],
      size: 8 + Math.random() * 8,
    }))
  ).current;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (!visible) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.parallel([
      Animated.spring(fadeAnim, { toValue: 1, useNativeDriver: true, bounciness: 10 }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, bounciness: 12 }),
    ]).start();

    particles.forEach((p) => {
      p.y.setValue(-0.1);
      p.opacity.setValue(1);
      p.rotate.setValue(0);
      Animated.parallel([
        Animated.timing(p.y, { toValue: 1.1, duration: 1800 + Math.random() * 800, useNativeDriver: false }),
        Animated.timing(p.rotate, { toValue: 1, duration: 1800 + Math.random() * 800, useNativeDriver: false }),
        Animated.sequence([
          Animated.delay(1200),
          Animated.timing(p.opacity, { toValue: 0, duration: 600, useNativeDriver: false }),
        ]),
      ]).start();
    });
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onDismiss}>
      <View style={confettiStyles.overlay}>
        {particles.map((p, i) => (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: p.x.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              top: p.y.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              opacity: p.opacity,
              width: p.size,
              height: p.size,
              borderRadius: p.size / 4,
              backgroundColor: p.color,
              transform: [{ rotate: p.rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '720deg'] }) }],
            }}
          />
        ))}
        <Animated.View style={[confettiStyles.card, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          <Text style={confettiStyles.trophy}>🏆</Text>
          <Text style={confettiStyles.heading}>Goal Reached!</Text>
          <Text style={confettiStyles.goalName}>{goalName}</Text>
          <Text style={confettiStyles.sub}>Incredible discipline. You earned this.</Text>
          <TouchableOpacity style={confettiStyles.btn} onPress={onDismiss}>
            <Text style={confettiStyles.btnText}>Celebrate 🎉</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const confettiStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#111827', borderRadius: 28, borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)', padding: 32, alignItems: 'center', marginHorizontal: 32, gap: 8 },
  trophy: { fontSize: 64 },
  heading: { color: '#F9FAFB', fontSize: 28, fontFamily: 'DMSans_900Black', letterSpacing: -0.5 },
  goalName: { color: '#FCD34D', fontSize: 18, fontFamily: 'DMSans_800ExtraBold', textAlign: 'center' },
  sub: { color: 'rgba(249,250,251,0.5)', fontSize: 14, textAlign: 'center', marginTop: 4 },
  btn: { backgroundColor: '#FCD34D', borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14, marginTop: 16 },
  btnText: { color: '#000', fontSize: 16, fontFamily: 'DMSans_900Black' },
});

// ─── Animated Balance Number ──────────────────────────────────────────────────
function AnimatedBalance({ value, color, fontSize = 38 }) {
  const animVal = useRef(new Animated.Value(value)).current;
  const [displayed, setDisplayed] = useState(value);

  useEffect(() => {
    const id = animVal.addListener(({ value: v }) => setDisplayed(v));
    Animated.timing(animVal, { toValue: value, duration: 600, useNativeDriver: false }).start();
    return () => animVal.removeListener(id);
  }, [value]);

  const formatted = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(displayed);
  return <Text style={{ color, fontSize, fontFamily: 'DMSans_900Black', letterSpacing: -0.5 }}>{formatted}</Text>;
}

// ─── AppHeader ────────────────────────────────────────────────────────────────
function AppHeader({ onSettingsPress }) {
  const { C } = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ backgroundColor: C.cardInner, borderRadius: 14, padding: 2 }}>
          <Image source={require('./assets/logo.png')} style={{ borderRadius: 12, height: 42, width: 42 }} />
        </View>
        <View>
          <Text style={{ color: C.text1, fontSize: 20, fontFamily: 'DMSans_900Black' }}>Thunder Wallet</Text>
          <Text style={{ color: C.text2, fontSize: 12, marginTop: 2 }}>Know where your money goes.</Text>
        </View>
      </View>
      <TouchableOpacity
        onPress={onSettingsPress}
        style={{ backgroundColor: C.cardInner, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: C.border }}
        activeOpacity={0.7}
      >
        <Ionicons name="settings-outline" size={20} color={C.text2} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Goal Card ────────────────────────────────────────────────────────────────
function GoalCard({ goal, onDelete, C }) {
  const progress = Math.min((goal.savedAmount / goal.target) * 100, 100);
  const isComplete = progress >= 100;
  const daysLeft = goal.deadline
    ? Math.max(Math.ceil((new Date(goal.deadline) - new Date()) / 86400000), 0)
    : null;

  return (
    <View style={{ backgroundColor: C.cardInner, borderColor: isComplete ? `${goal.color}50` : C.border, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, marginBottom: 10 }}>
      <View style={{ alignItems: 'center', backgroundColor: `${goal.color}18`, borderRadius: 14, height: 46, justifyContent: 'center', width: 46 }}>
        <Ionicons name={isComplete ? 'trophy' : goal.icon} size={22} color={goal.color} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ color: C.text1, fontSize: 14, fontFamily: 'DMSans_800ExtraBold' }} numberOfLines={1}>{goal.name}</Text>
          {isComplete && (
            <View style={{ backgroundColor: `${C.income}20`, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: C.income, fontSize: 11, fontFamily: 'DMSans_800ExtraBold' }}>Goal Reached! 🎉</Text>
            </View>
          )}
        </View>
        <View style={{ backgroundColor: C.bg, borderRadius: 6, height: 7, overflow: 'hidden', marginBottom: 6 }}>
          <View style={{ backgroundColor: isComplete ? C.income : goal.color, borderRadius: 6, height: 7, width: `${progress}%` }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: C.text2, fontSize: 11, fontFamily: 'DMSans_600SemiBold' }}>
            {compactCurrency.format(Math.min(goal.savedAmount, goal.target))} / {compactCurrency.format(goal.target)} · {Math.round(progress)}%
          </Text>
          {daysLeft !== null && (
            <Text style={{ color: daysLeft < 7 ? C.expense : C.text3, fontSize: 11, fontFamily: 'DMSans_700Bold' }}>
              {daysLeft === 0 ? 'Due today' : `${daysLeft}d left`}
            </Text>
          )}
        </View>
      </View>
      <TouchableOpacity onPress={() => onDelete(goal.id)} style={{ padding: 4 }}>
        <Ionicons name="close-circle" size={18} color={C.text3} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Add Goal Modal ───────────────────────────────────────────────────────────
function AddGoalModal({ visible, onClose, onAdd }) {
  const { C } = useTheme();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [deadline, setDeadline] = useState('');
  const [savedAmount, setSavedAmount] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(0);

  const reset = () => { setName(''); setTarget(''); setDeadline(''); setSavedAmount(''); setSelectedPreset(0); };

  const handleAdd = () => {
    if (!name.trim()) { Alert.alert('Name required', 'Enter a goal name.'); return; }
    const t = Number.parseFloat(target);
    if (!Number.isFinite(t) || t <= 0) { Alert.alert('Invalid target', 'Enter a valid amount.'); return; }
    let deadlineISO = null;
    if (deadline.trim()) {
      const parts = deadline.trim().split('/');
      if (parts.length === 3) {
        const d = new Date(+parts[2], +parts[1] - 1, +parts[0]);
        if (!Number.isNaN(d.getTime())) deadlineISO = d.toISOString();
      }
    }
    const saved = Number.parseFloat(savedAmount) || 0;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onAdd({ id: `${Date.now()}`, name: name.trim(), icon: GOAL_PRESETS[selectedPreset].icon, color: GOAL_PRESETS[selectedPreset].color, target: t, savedAmount: saved, deadline: deadlineISO, createdAt: new Date().toISOString() });
    reset();
    onClose();
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={() => { reset(); onClose(); }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.72)' }} onPress={() => { reset(); onClose(); }} />
        <View style={{ backgroundColor: C.card, borderTopColor: C.border, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, padding: 20, paddingBottom: 36 }}>
          <View style={{ alignSelf: 'center', backgroundColor: C.border, borderRadius: 3, height: 4, marginBottom: 16, width: 40 }} />
          <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase' }}>New Goal</Text>
          <Text style={{ color: C.text1, fontSize: 22, fontFamily: 'DMSans_900Black', marginBottom: 20, marginTop: 2 }}>Add Savings Goal</Text>

          <Text style={{ color: C.text2, fontSize: 11, fontFamily: 'DMSans_700Bold', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>Icon & Color</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
            {GOAL_PRESETS.map((p, i) => (
              <TouchableOpacity key={i} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedPreset(i); }} style={{ alignItems: 'center', gap: 4 }}>
                <View style={{ alignItems: 'center', backgroundColor: selectedPreset === i ? `${p.color}25` : C.cardInner, borderColor: selectedPreset === i ? p.color : C.border, borderRadius: 14, borderWidth: selectedPreset === i ? 2 : 1, height: 52, justifyContent: 'center', width: 52 }}>
                  <Ionicons name={p.icon} size={24} color={selectedPreset === i ? p.color : C.text2} />
                </View>
                <Text style={{ color: selectedPreset === i ? p.color : C.text3, fontSize: 10, fontFamily: 'DMSans_700Bold' }}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={{ color: C.text2, fontSize: 11, fontFamily: 'DMSans_700Bold', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>Goal Name</Text>
          <TextInput style={{ backgroundColor: C.cardInner, borderColor: C.border, borderRadius: 12, borderWidth: 1, color: C.text1, fontSize: 15, marginBottom: 14, minHeight: 48, paddingHorizontal: 14 }} placeholder="e.g. New iPhone, Goa Trip…" placeholderTextColor={C.text3} value={name} onChangeText={setName} />

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text2, fontSize: 11, fontFamily: 'DMSans_700Bold', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>Target Amount</Text>
              <View style={{ alignItems: 'center', backgroundColor: C.cardInner, borderColor: `${GOAL_PRESETS[selectedPreset].color}40`, borderRadius: 12, borderWidth: 2, flexDirection: 'row', minHeight: 50, paddingHorizontal: 12 }}>
                <Text style={{ color: GOAL_PRESETS[selectedPreset].color, fontSize: 18, fontFamily: 'DMSans_900Black', marginRight: 6 }}>₹</Text>
                <TextInput style={{ color: C.text1, flex: 1, fontSize: 18, fontFamily: 'DMSans_800ExtraBold' }} placeholder="0" placeholderTextColor={C.text3} keyboardType="decimal-pad" value={target} onChangeText={setTarget} />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text2, fontSize: 11, fontFamily: 'DMSans_700Bold', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>Already Saved</Text>
              <View style={{ alignItems: 'center', backgroundColor: C.cardInner, borderColor: C.border, borderRadius: 12, borderWidth: 1, flexDirection: 'row', minHeight: 50, paddingHorizontal: 12 }}>
                <Text style={{ color: C.text3, fontSize: 18, fontFamily: 'DMSans_900Black', marginRight: 6 }}>₹</Text>
                <TextInput style={{ color: C.text1, flex: 1, fontSize: 18, fontFamily: 'DMSans_800ExtraBold' }} placeholder="0" placeholderTextColor={C.text3} keyboardType="decimal-pad" value={savedAmount} onChangeText={setSavedAmount} />
              </View>
            </View>
          </View>

          <Text style={{ color: C.text2, fontSize: 11, fontFamily: 'DMSans_700Bold', marginTop: 14, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>Deadline (optional)</Text>
          <TextInput style={{ backgroundColor: C.cardInner, borderColor: C.border, borderRadius: 12, borderWidth: 1, color: C.text1, fontSize: 14, minHeight: 48, paddingHorizontal: 12 }} placeholder="DD/MM/YYYY" placeholderTextColor={C.text3} value={deadline} onChangeText={setDeadline} />

          <TouchableOpacity
            style={{ alignItems: 'center', backgroundColor: GOAL_PRESETS[selectedPreset].color, borderRadius: 14, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 20, minHeight: 54, shadowColor: GOAL_PRESETS[selectedPreset].color, shadowOffset: { height: 8, width: 0 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 6 }}
            onPress={handleAdd}
          >
            <Ionicons name="trophy" size={20} color="#000" />
            <Text style={{ color: '#000', fontSize: 16, fontFamily: 'DMSans_900Black' }}>Create Goal</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Add Savings Modal ────────────────────────────────────────────────────────
function AddSavingsModal({ visible, type, onClose, onSave }) {
  const { C } = useTheme();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const isDeposit = type === 'deposit';
  const accentColor = isDeposit ? '#34D399' : '#F87171';

  const reset = () => { setAmount(''); setNote(''); };

  const handleSave = () => {
    const amt = Number.parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) { Alert.alert('Invalid amount', 'Enter a valid amount greater than zero.'); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave({ id: `${Date.now()}`, type, amount: amt, note: note.trim(), date: new Date().toISOString() });
    reset();
    onClose();
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={() => { reset(); onClose(); }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.72)' }} onPress={() => { reset(); onClose(); }} />
        <View style={{ backgroundColor: C.card, borderTopColor: C.border, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, padding: 20, paddingBottom: 36 }}>
          <View style={{ alignSelf: 'center', backgroundColor: C.border, borderRadius: 3, height: 4, marginBottom: 16, width: 40 }} />
          <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase' }}>
            {isDeposit ? 'Add Savings' : 'Withdraw Savings'}
          </Text>
          <Text style={{ color: C.text1, fontSize: 22, fontFamily: 'DMSans_900Black', marginBottom: 20, marginTop: 2 }}>
            {isDeposit ? 'Deposit to Savings' : 'Withdraw from Savings'}
          </Text>

          <Text style={{ color: C.text2, fontSize: 11, fontFamily: 'DMSans_700Bold', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>Amount</Text>
          <View style={{ alignItems: 'center', backgroundColor: C.cardInner, borderColor: `${accentColor}50`, borderRadius: 14, borderWidth: 2, flexDirection: 'row', minHeight: 56, paddingHorizontal: 14, marginBottom: 14 }}>
            <Text style={{ color: accentColor, fontSize: 22, fontFamily: 'DMSans_900Black', marginRight: 8 }}>₹</Text>
            <TextInput
              style={{ color: C.text1, flex: 1, fontSize: 22, fontFamily: 'DMSans_800ExtraBold' }}
              placeholder="0"
              placeholderTextColor={C.text3}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
              autoFocus
            />
          </View>

          <Text style={{ color: C.text2, fontSize: 11, fontFamily: 'DMSans_700Bold', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>Note (optional)</Text>
          <TextInput
            style={{ backgroundColor: C.cardInner, borderColor: C.border, borderRadius: 12, borderWidth: 1, color: C.text1, fontSize: 15, minHeight: 48, paddingHorizontal: 14, marginBottom: 20 }}
            placeholder={isDeposit ? 'e.g. Monthly savings, bonus…' : 'e.g. Emergency, purchase…'}
            placeholderTextColor={C.text3}
            value={note}
            onChangeText={setNote}
          />

          <TouchableOpacity
            style={{ alignItems: 'center', backgroundColor: accentColor, borderRadius: 14, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 54, elevation: 6, shadowColor: accentColor, shadowOffset: { height: 8, width: 0 }, shadowOpacity: 0.35, shadowRadius: 14 }}
            onPress={handleSave}
          >
            <Ionicons name={isDeposit ? 'arrow-down-circle' : 'arrow-up-circle'} size={20} color="#000" />
            <Text style={{ color: '#000', fontSize: 16, fontFamily: 'DMSans_900Black' }}>
              {isDeposit ? 'Add to Savings' : 'Withdraw'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Category Budget Modal ────────────────────────────────────────────────────
const BUDGET_CATEGORIES = ['Food', 'Travel', 'Shopping', 'Bills', 'Rent', 'Health', 'Entertainment', 'Groceries', 'Education', 'Fuel', 'Savings', 'Other'];

function CategoryBudgetModal({ visible, onClose, categoryBudgets, onSave, C }) {
  const [budgets, setBudgets] = useState({ ...categoryBudgets });

  // Re-sync local state whenever the modal opens (useState initializer only runs once)
  useEffect(() => {
    if (visible) setBudgets({ ...categoryBudgets });
  }, [visible]);

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(budgets);
    onClose();
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.72)' }} onPress={onClose} />
        <View style={{ backgroundColor: C.card, borderTopColor: C.border, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, padding: 20, paddingBottom: 36, maxHeight: '85%' }}>
          <View style={{ alignSelf: 'center', backgroundColor: C.border, borderRadius: 3, height: 4, marginBottom: 16, width: 40 }} />
          <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase' }}>Budgets</Text>
          <Text style={{ color: C.text1, fontSize: 22, fontFamily: 'DMSans_900Black', marginBottom: 4, marginTop: 2 }}>Category Limits</Text>
          <Text style={{ color: C.text2, fontSize: 13, marginBottom: 20 }}>Set monthly limits per category. Leave blank for no limit.</Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            {BUDGET_CATEGORIES.map((cat) => (
              <View key={cat} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <Text style={{ color: C.text1, fontSize: 14, fontFamily: 'DMSans_700Bold', width: 100 }}>{cat}</Text>
                <View style={{ alignItems: 'center', backgroundColor: C.cardInner, borderColor: C.border, borderRadius: 10, borderWidth: 1, flex: 1, flexDirection: 'row', minHeight: 44, paddingHorizontal: 10 }}>
                  <Text style={{ color: C.text3, fontSize: 16, fontFamily: 'DMSans_800ExtraBold', marginRight: 4 }}>₹</Text>
                  <TextInput
                    style={{ color: C.text1, flex: 1, fontSize: 16, fontFamily: 'DMSans_700Bold' }}
                    placeholder="No limit"
                    placeholderTextColor={C.text3}
                    keyboardType="decimal-pad"
                    value={budgets[cat] ? String(budgets[cat]) : ''}
                    onChangeText={(v) => setBudgets((b) => ({ ...b, [cat]: Number.parseFloat(v) || 0 }))}
                  />
                </View>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={{ alignItems: 'center', backgroundColor: C.accent, borderRadius: 14, minHeight: 52, justifyContent: 'center', marginTop: 16 }} onPress={handleSave}>
            <Text style={{ color: C.isDark ? '#000' : '#fff', fontSize: 16, fontFamily: 'DMSans_900Black' }}>Save Limits</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Interactive Donut Chart ──────────────────────────────────────────────────
function InteractiveDonutChart({ data, total, selectedSegment, onSelectSegment, C }) {
  const SIZE = 240;
  const CX = 120;
  const R_OUTER = 104;
  const R_INNER = 62;
  const EXPLODE = 10;
  const GAP = 2.5;

  const slices = useMemo(() => {
    if (!data.length || total <= 0) return [];
    const ringTotal = data.reduce((s, item) => s + item.amount, 0) || total;
    let startAngle = 0;
    return data.map((item, i) => {
      const segAngle = (item.amount / ringTotal) * 360;
      const gap = data.length > 1 && segAngle > GAP * 2 ? GAP : 0;
      const arcStart = startAngle + gap / 2;
      const arcEnd = startAngle + segAngle - gap / 2;
      const mid = startAngle + segAngle / 2;
      const midRad = ((mid - 90) * Math.PI) / 180;
      const slice = {
        ...item,
        index: i,
        arcStart,
        arcEnd: Math.min(arcEnd, 359.99),
        mid,
        midRad,
        segAngle,
      };
      startAngle += segAngle;
      return slice;
    }).filter((s) => s.segAngle > 0 && s.arcEnd > s.arcStart);
  }, [data, total]);

  const handleTap = (locationX, locationY) => {
    if (!slices.length) return;
    const dx = locationX - CX;
    const dy = locationY - CX;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Only register taps on the ring (not the hollow center / outside)
    if (dist < R_INNER - 4 || dist > R_OUTER + 8) return;

    const angle = touchToDonutAngle(locationX, locationY, CX, CX);
    const hit = slices.find((s) => angle >= s.arcStart && angle <= s.arcEnd)
      || slices.find((s) => angle >= s.arcStart - GAP / 2 && angle <= s.arcEnd + GAP / 2);
    if (!hit) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelectSegment(selectedSegment === hit.index ? null : hit.index);
  };

  if (!slices.length) {
    return (
      <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={CX} cy={CX} r={(R_OUTER + R_INNER) / 2} stroke={C.cardInner} strokeWidth={R_OUTER - R_INNER} fill="none" />
        </Svg>
      </View>
    );
  }

  return (
    <Pressable
      style={{ width: SIZE, height: SIZE }}
      onPress={(e) => {
        const { locationX, locationY } = e.nativeEvent;
        handleTap(locationX, locationY);
      }}
    >
      <Svg width={SIZE} height={SIZE} pointerEvents="none">
        <Circle cx={CX} cy={CX} r={(R_OUTER + R_INNER) / 2} stroke={C.cardInner} strokeWidth={R_OUTER - R_INNER} fill="none" />
        {slices.map((slice) => {
          const isSel = selectedSegment === slice.index;
          const dx = isSel ? Math.cos(slice.midRad) * EXPLODE : 0;
          const dy = isSel ? Math.sin(slice.midRad) * EXPLODE : 0;
          const path = describeDonutSlice(CX, CX, R_OUTER, R_INNER, slice.arcStart, slice.arcEnd);
          if (!path) return null;
          return (
            <G key={`${slice.category}-${slice.index}`} transform={`translate(${dx}, ${dy})`}>
              <Path
                d={path}
                fill={slice.color}
                fillOpacity={selectedSegment !== null && !isSel ? 0.28 : 1}
                stroke={C.card}
                strokeWidth={1.5}
              />
            </G>
          );
        })}
      </Svg>
    </Pressable>
  );
}

// ─── Month spending heatmap (calendar map) ────────────────────────────────────
function SpendingHeatmap({ transactions, C }) {
  const [picked, setPicked] = useState(null);
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const monthLabel = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const dayTotals = useMemo(() => {
    const map = {};
    transactions.forEach((t) => {
      if (!(t.amount < 0)) return;
      const d = toLocalDate(t.date);
      if (!d) return;
      if (d.getMonth() !== month || d.getFullYear() !== year) return;
      const day = d.getDate();
      map[day] = (map[day] || 0) + Math.abs(t.amount);
    });
    return map;
  }, [transactions, month, year]);

  const maxSpend = Math.max(...Object.values(dayTotals), 1);
  const monthTotal = Object.values(dayTotals).reduce((s, v) => s + v, 0);
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push({ empty: true, key: `e${i}` });
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ empty: false, day, amount: dayTotals[day] || 0, key: `d${day}` });
  }

  const heatColor = (amount) => {
    if (!amount) return C.cardInner;
    const t = Math.min(amount / maxSpend, 1);
    const r = Math.round(167 + (244 - 167) * t);
    const g = Math.round(139 + (114 - 139) * t);
    const b = Math.round(250 + (182 - 250) * t);
    const a = 0.22 + t * 0.78;
    return `rgba(${r},${g},${b},${a.toFixed(2)})`;
  };

  return (
    <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 18, borderWidth: 1, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <View style={{ alignItems: 'center', backgroundColor: C.purpleBg, borderRadius: 10, height: 32, justifyContent: 'center', width: 32 }}>
            <Ionicons name="map" size={15} color={C.purple} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase' }}>Spending Map</Text>
            <Text style={{ color: C.text1, fontSize: 16, fontFamily: 'DMSans_900Black' }}>{monthLabel}</Text>
          </View>
        </View>
        <Text style={{ color: C.purple, fontSize: 14, fontFamily: 'DMSans_900Black' }}>{compactCurrency.format(monthTotal)}</Text>
      </View>

      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <Text key={`${d}${i}`} style={{ color: C.text3, flex: 1, fontSize: 10, fontFamily: 'DMSans_700Bold', textAlign: 'center' }}>{d}</Text>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((cell) => {
          if (cell.empty) {
            return <View key={cell.key} style={{ width: '14.28%', padding: 2 }}><View style={{ aspectRatio: 1 }} /></View>;
          }
          const isToday = cell.day === today;
          const isPicked = picked === cell.day;
          return (
            <TouchableOpacity
              key={cell.key}
              style={{ width: '14.28%', padding: 2 }}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setPicked(isPicked ? null : cell.day);
              }}
              activeOpacity={0.75}
            >
              <View style={{
                aspectRatio: 1,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                backgroundColor: heatColor(cell.amount),
                borderWidth: isToday || isPicked ? 1.5 : 0,
                borderColor: isPicked ? C.purple : isToday ? C.amber : 'transparent',
              }}>
                <Text style={{
                  color: cell.amount ? C.text1 : C.text3,
                  fontSize: 11,
                  fontFamily: isToday || isPicked ? 'DMSans_900Black' : 'DMSans_600SemiBold',
                }}>{cell.day}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_700Bold' }}>Low</Text>
        {[0.15, 0.35, 0.55, 0.75, 1].map((t) => (
          <View key={t} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: heatColor(t * maxSpend) }} />
        ))}
        <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_700Bold' }}>High</Text>
      </View>

      {picked != null && (
        <View style={{ backgroundColor: C.cardInner, borderRadius: 12, marginTop: 12, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: C.text2, fontSize: 13, fontFamily: 'DMSans_700Bold' }}>
            {new Date(year, month, picked).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
          </Text>
          <Text style={{ color: dayTotals[picked] ? C.expense : C.text3, fontSize: 15, fontFamily: 'DMSans_900Black' }}>
            {dayTotals[picked] ? currency.format(dayTotals[picked]) : 'No spend'}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Vertical monthly history bars ────────────────────────────────────────────
function MonthlyHistoryChart({ data, C }) {
  const chrono = [...data].reverse();
  const max = Math.max(...chrono.map((m) => m.total), 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 140, paddingTop: 8 }}>
      {chrono.map((m) => {
        const h = Math.max((m.total / max) * 100, m.total ? 8 : 2);
        const isLatest = m.key === data[0]?.key;
        return (
          <View key={m.key} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
            <Text style={{ color: isLatest ? C.blue : C.text3, fontSize: 9, fontFamily: 'DMSans_800ExtraBold', marginBottom: 4 }} numberOfLines={1}>
              {compactCurrency.format(m.total)}
            </Text>
            <View style={{ backgroundColor: C.cardInner, borderRadius: 8, height: 100, justifyContent: 'flex-end', overflow: 'hidden', width: '100%' }}>
              <View style={{
                backgroundColor: isLatest ? C.blue : `${C.blue}88`,
                borderRadius: 8,
                height: `${h}%`,
                width: '100%',
                opacity: isLatest ? 1 : 0.55,
              }} />
            </View>
            <Text style={{ color: isLatest ? C.text1 : C.text3, fontSize: 10, fontFamily: isLatest ? 'DMSans_900Black' : 'DMSans_600SemiBold', marginTop: 6 }} numberOfLines={1}>
              {m.label.split(' ')[0]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Weekday spending bars with amounts ───────────────────────────────────────
function WeekdaySpendChart({ dowData, C }) {
  return (
    <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: 6, height: 120 }}>
      {dowData.map((day) => (
        <View key={day.label} style={{ alignItems: 'center', flex: 1, height: '100%', justifyContent: 'flex-end' }}>
          {day.total > 0 && (
            <Text style={{ color: day.isPeak ? C.purple : C.text3, fontSize: 8, fontFamily: 'DMSans_800ExtraBold', marginBottom: 4 }} numberOfLines={1}>
              {compactCurrency.format(day.total)}
            </Text>
          )}
          <View style={{ backgroundColor: C.cardInner, borderRadius: 8, flex: 1, justifyContent: 'flex-end', overflow: 'hidden', width: '100%', maxHeight: 88 }}>
            <View style={{
              backgroundColor: day.isPeak ? C.purple : C.accent,
              borderRadius: 8,
              height: `${Math.max(day.pct * 100, day.total ? 10 : 3)}%`,
              opacity: day.total ? (day.isPeak ? 1 : 0.45) : 0.12,
              width: '100%',
            }} />
          </View>
          <Text style={{ color: day.isPeak ? C.purple : C.text3, fontSize: 10, fontFamily: day.isPeak ? 'DMSans_900Black' : 'DMSans_600SemiBold', marginTop: 6 }}>{day.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Credit Balance Card ──────────────────────────────────────────────────────
function CreditBalanceCard({ stats, visible, onToggleVisible }) {
  const { isDark } = useTheme();
  const isHealthy = stats.balance >= 0;
  const statusColor = isHealthy ? '#34D399' : '#F87171';

  // Card stays dark in both themes — real credit cards are always dark
  const card = {
    bg:           isDark ? '#0F172A' : '#1E293B',
    border:       isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)',
    brandText:    'rgba(255,255,255,0.9)',
    labelText:    'rgba(255,255,255,0.38)',
    subText:      'rgba(255,255,255,0.32)',
    sep:          'rgba(255,255,255,0.1)',
    chipBg:       '#C9A535',
    chipLine:     'rgba(100,70,0,0.4)',
    nfcColor:     'rgba(255,255,255,0.28)',
    shadow:       isDark ? '#000' : '#1E293B',
  };

  return (
    <View style={{
      backgroundColor: card.bg,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: card.border,
      paddingHorizontal: 22,
      paddingVertical: 20,
      height: 196,
      justifyContent: 'space-between',
      elevation: 10,
      shadowColor: card.shadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius: 16,
    }}>

      {/* ── Row 1: brand + status ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Ionicons name="flash" size={14} color="#A78BFA" />
          <Text style={{ color: card.brandText, fontSize: 14, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 0.2 }}>
            Thunder Wallet
          </Text>
        </View>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 5,
          backgroundColor: `${statusColor}18`, borderColor: `${statusColor}40`,
          borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4,
        }}>
          <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: statusColor }} />
          <Text style={{ color: statusColor, fontSize: 10, fontFamily: 'DMSans_800ExtraBold' }}>
            {isHealthy ? 'Healthy' : 'Overspent'}
          </Text>
        </View>
      </View>

      {/* ── Row 2: balance (hero) ── */}
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <Text style={{ color: card.labelText, fontSize: 9, fontFamily: 'DMSans_700Bold', letterSpacing: 1.4, textTransform: 'uppercase' }}>
            Current Balance
          </Text>
          {onToggleVisible && (
            <TouchableOpacity onPress={onToggleVisible} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={visible ? 'eye' : 'eye-off'} size={13} color={card.labelText} />
            </TouchableOpacity>
          )}
        </View>
        {visible
          ? <AnimatedBalance value={stats.balance} color="#FFFFFF" fontSize={36} />
          : <Text style={{ color: '#FFFFFF', fontSize: 36, fontFamily: 'DMSans_900Black', letterSpacing: 1 }}>••••••</Text>
        }
      </View>

      {/* ── Row 3: chip + nfc + income / expenses ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {/* EMV chip */}
        <View style={{
          width: 30, height: 22, borderRadius: 5,
          backgroundColor: card.chipBg, borderWidth: 0.5, borderColor: '#8B6914',
        }}>
          <View style={{ position: 'absolute', top: 9, left: 0, right: 0, height: 1, backgroundColor: card.chipLine }} />
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: 8, width: 1, backgroundColor: card.chipLine }} />
          <View style={{ position: 'absolute', top: 0, bottom: 0, right: 8, width: 1, backgroundColor: card.chipLine }} />
        </View>
        {/* NFC / contactless */}
        <Ionicons name="wifi" size={15} color={card.nfcColor} style={{ marginLeft: 8, transform: [{ rotate: '90deg' }] }} />

        {/* separator */}
        <View style={{ width: 1, height: 28, backgroundColor: card.sep, marginHorizontal: 16 }} />

        {/* income */}
        <View style={{ flex: 1 }}>
          <Text style={{ color: card.subText, fontSize: 9, fontFamily: 'DMSans_700Bold', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>Income</Text>
          <Text style={{ color: '#34D399', fontSize: 13, fontFamily: 'DMSans_900Black' }}>{visible ? compactCurrency.format(stats.income) : '••••'}</Text>
        </View>

        {/* separator */}
        <View style={{ width: 1, height: 28, backgroundColor: card.sep, marginHorizontal: 16 }} />

        {/* expenses */}
        <View style={{ flex: 1 }}>
          <Text style={{ color: card.subText, fontSize: 9, fontFamily: 'DMSans_700Bold', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>Expenses</Text>
          <Text style={{ color: '#F87171', fontSize: 13, fontFamily: 'DMSans_900Black' }}>{visible ? compactCurrency.format(stats.expense) : '••••'}</Text>
        </View>
      </View>

    </View>
  );
}


// ─── Dashboard Screen ─────────────────────────────────────────────────────────
function DashboardScreen({ wallet }) {
  const { C } = useTheme();
  const navigation = useNavigation();
  const { insight, monthlyBudget, stats, adjustMonthlyBudget, openTransactionModal, goals, deleteGoal, openGoalModal, categoryBudgets, openCategoryBudgetModal, hideBalanceFeature } = wallet;
  const healthScore = calculateHealthScore(stats, monthlyBudget);
  const scoreColor = healthScore >= 70 ? C.income : healthScore >= 40 ? C.amber : C.expense;
  const scoreLabel = healthScore >= 80 ? 'Excellent' : healthScore >= 60 ? 'Good' : healthScore >= 40 ? 'Fair' : 'Needs Work';
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState(String(monthlyBudget));
  const [balanceVisible, setBalanceVisible] = useState(false);

  // When feature is disabled, always show balances; when re-enabled, start hidden again
  useEffect(() => {
    if (!hideBalanceFeature) setBalanceVisible(true);
    else setBalanceVisible(false);
  }, [hideBalanceFeature]);

  const commitBudget = async () => {
    const val = Number.parseFloat(budgetInput);
    if (Number.isFinite(val) && val > 0) adjustMonthlyBudget(val);
    setEditingBudget(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <MeshBackground blobs="default" isDark={C.isDark} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        <AppHeader onSettingsPress={() => navigation.navigate('Settings')} />

        {/* Credit Balance Card */}
        <CreditBalanceCard stats={stats} visible={balanceVisible} onToggleVisible={hideBalanceFeature ? () => setBalanceVisible(v => !v) : null} />

        {/* Health Score */}
        <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 16, borderWidth: 1, marginTop: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ alignItems: 'center', justifyContent: 'center', width: 46, height: 46 }}>
            <Svg width={46} height={46}>
              <Circle cx={23} cy={23} r={19} stroke={C.cardInner} strokeWidth={5} fill="none" />
              <Circle cx={23} cy={23} r={19} stroke={scoreColor} strokeWidth={5} fill="none"
                strokeDasharray={`${(healthScore / 100) * 119.4} 119.4`}
                strokeLinecap="round" rotation="-90" origin="23,23" />
            </Svg>
            <Text style={{ position: 'absolute', color: scoreColor, fontSize: 11, fontFamily: 'DMSans_900Black' }}>{healthScore}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text2, fontSize: 10, fontFamily: 'DMSans_700Bold', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>Financial Health</Text>
            <Text style={{ color: C.text1, fontSize: 16, fontFamily: 'DMSans_900Black', marginBottom: 5 }}>{scoreLabel}</Text>
            <View style={{ backgroundColor: C.cardInner, borderRadius: 3, height: 4, overflow: 'hidden' }}>
              <View style={{ borderRadius: 3, height: 4, width: `${healthScore}%`, backgroundColor: scoreColor }} />
            </View>
          </View>
          <Ionicons name="shield-checkmark" size={18} color={scoreColor} style={{ opacity: 0.8 }} />
        </View>


        {/* Quick Actions */}
        <View style={{ flexDirection: 'row', gap: 10, marginVertical: 12 }}>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.incomeBg, borderColor: `${C.income}30`, borderRadius: 14, borderWidth: 1, paddingVertical: 14 }}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); openTransactionModal('income'); }}
          >
            <Ionicons name="add-circle" size={18} color={C.income} />
            <Text style={{ color: C.income, fontSize: 13, fontFamily: 'DMSans_900Black' }}>Income</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.expenseBg, borderColor: `${C.expense}30`, borderRadius: 14, borderWidth: 1, paddingVertical: 14 }}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); openTransactionModal('expense'); }}
          >
            <Ionicons name="remove-circle" size={18} color={C.expense} />
            <Text style={{ color: C.expense, fontSize: 13, fontFamily: 'DMSans_900Black' }}>Expense</Text>
          </TouchableOpacity>
        </View>

        {/* Budget */}
        <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 18, borderWidth: 1, padding: 16 }}>
          {/* Budget — tap to edit */}
          <View style={{ backgroundColor: C.cardInner, borderColor: C.border, borderRadius: 14, borderWidth: 1, marginTop: 14, padding: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_700Bold', textTransform: 'uppercase', letterSpacing: 0.8 }}>Monthly Budget</Text>
                {editingBudget && balanceVisible ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <Text style={{ color: C.accent, fontSize: 22, fontFamily: 'DMSans_900Black' }}>₹</Text>
                    <TextInput
                      style={{ color: C.text1, fontSize: 22, fontFamily: 'DMSans_900Black', flex: 1 }}
                      value={budgetInput}
                      onChangeText={setBudgetInput}
                      keyboardType="number-pad"
                      autoFocus
                      onBlur={commitBudget}
                      onSubmitEditing={commitBudget}
                    />
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => {
                      if (!balanceVisible) return;
                      setBudgetInput(String(monthlyBudget));
                      setEditingBudget(true);
                    }}
                  >
                    <Text style={{ color: C.text1, fontSize: 22, fontFamily: 'DMSans_900Black', marginTop: 2 }}>{balanceVisible ? currency.format(monthlyBudget) : '••••••'}</Text>
                    {balanceVisible && <Text style={{ color: C.text3, fontSize: 10, marginTop: 2 }}>Tap to edit</Text>}
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                style={{ alignItems: 'center', backgroundColor: C.accentBg, borderColor: C.accentBorder, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingVertical: 7 }}
                onPress={openCategoryBudgetModal}
              >
                <Ionicons name="options" size={14} color={C.accent} />
                <Text style={{ color: C.accent, fontSize: 11, fontFamily: 'DMSans_800ExtraBold' }}>By Category</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ color: balanceVisible ? (stats.remainingBudget >= 0 ? C.income : C.expense) : C.text3, fontSize: 13, fontFamily: 'DMSans_800ExtraBold', marginTop: 10 }}>
              {balanceVisible
                ? (stats.remainingBudget >= 0 ? `${currency.format(stats.remainingBudget)} remaining` : `${currency.format(Math.abs(stats.remainingBudget))} over budget`)
                : '•••• remaining'}
            </Text>
            <View style={{ backgroundColor: C.card, borderRadius: 6, height: 8, marginTop: 8, overflow: 'hidden' }}>
              <View style={{ backgroundColor: stats.remainingBudget < 0 ? C.expense : C.accent, borderRadius: 6, height: 8, opacity: 0.6, width: balanceVisible ? `${stats.budgetUsedPercent}%` : '0%' }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderColor: C.border, borderRadius: 12, borderWidth: 1, marginTop: 12, padding: 12 }}>
              <View style={{ alignItems: 'center', backgroundColor: C.accentBg, borderRadius: 18, height: 34, justifyContent: 'center', width: 34 }}>
                <Ionicons name={insight.icon} size={15} color={C.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text1, fontSize: 13, fontFamily: 'DMSans_800ExtraBold' }}>{insight.title}</Text>
                <Text style={{ color: C.text2, fontSize: 12, lineHeight: 17, marginTop: 2 }}>{insight.body}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Category Budget Progress */}
        {Object.keys(categoryBudgets).length > 0 && (
          <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16 }}>
            <Text style={{ color: C.text1, fontSize: 16, fontFamily: 'DMSans_900Black', marginBottom: 14 }}>Category Limits</Text>
            {Object.entries(categoryBudgets).filter(([, limit]) => limit > 0).map(([cat, limit]) => {
              const spent = stats.categorySpend?.[cat] || 0;
              const pct = Math.min((spent / limit) * 100, 100);
              const over = spent > limit;
              return (
                <View key={cat} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: C.text1, fontSize: 13, fontFamily: 'DMSans_700Bold' }}>{cat}</Text>
                    <Text style={{ color: over ? C.expense : C.text2, fontSize: 12, fontFamily: 'DMSans_800ExtraBold' }}>
                      {compactCurrency.format(spent)} / {compactCurrency.format(limit)}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: C.cardInner, borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <View style={{ backgroundColor: over ? C.expense : C.income, borderRadius: 4, height: 6, width: `${pct}%` }} />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Savings Goals */}
        <View style={{ marginTop: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <View>
              <Text style={{ color: C.text3, fontSize: 11, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase' }}>Savings</Text>
              <Text style={{ color: C.text1, fontSize: 22, fontFamily: 'DMSans_900Black', marginTop: 2 }}>Goals</Text>
            </View>
            <TouchableOpacity style={{ alignItems: 'center', backgroundColor: C.accentBg, borderColor: C.accentBorder, borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 10 }} onPress={openGoalModal}>
              <Ionicons name="add" size={16} color={C.accent} />
              <Text style={{ color: C.accent, fontSize: 13, fontFamily: 'DMSans_800ExtraBold' }}>New Goal</Text>
            </TouchableOpacity>
          </View>
          {goals.length === 0 ? (
            <TouchableOpacity style={{ alignItems: 'center', backgroundColor: C.card, borderColor: C.border, borderRadius: 16, borderStyle: 'dashed', borderWidth: 1.5, padding: 28 }} onPress={openGoalModal}>
              <View style={{ alignItems: 'center', backgroundColor: C.cardInner, borderRadius: 24, height: 56, justifyContent: 'center', marginBottom: 12, width: 56 }}>
                <Ionicons name="trophy-outline" size={26} color={C.text3} />
              </View>
              <Text style={{ color: C.text1, fontSize: 15, fontFamily: 'DMSans_800ExtraBold' }}>Set your first goal</Text>
              <Text style={{ color: C.text2, fontSize: 13, marginTop: 4, textAlign: 'center' }}>Saving for a phone, trip, or dream? Track it here.</Text>
            </TouchableOpacity>
          ) : (
            <>
              {goals.map((g) => <GoalCard key={g.id} goal={g} onDelete={wallet.deleteGoal} C={C} />)}
              <TouchableOpacity style={{ alignItems: 'center', backgroundColor: C.card, borderColor: C.border, borderRadius: 12, borderStyle: 'dashed', borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', paddingVertical: 14 }} onPress={openGoalModal}>
                <Ionicons name="add-circle-outline" size={18} color={C.text3} />
                <Text style={{ color: C.text3, fontSize: 13, fontFamily: 'DMSans_700Bold' }}>Add another goal</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── Savings ── */}
        {(() => {
          const { savings, openSavingsModal } = wallet;
          const total = savings.reduce((s, e) => e.type === 'deposit' ? s + e.amount : s - e.amount, 0);
          const recent = savings.slice(0, 4);
          return (
            <View style={{ marginTop: 14 }}>
              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <View>
                  <Text style={{ color: C.text3, fontSize: 11, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase' }}>Piggy Bank</Text>
                  <Text style={{ color: C.text1, fontSize: 22, fontFamily: 'DMSans_900Black', marginTop: 2 }}>Savings</Text>
                </View>
                {/* action buttons */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={{ alignItems: 'center', backgroundColor: 'rgba(248,113,113,0.12)', borderColor: 'rgba(248,113,113,0.3)', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 12, paddingVertical: 8 }}
                    onPress={() => openSavingsModal('withdrawal')}
                  >
                    <Ionicons name="arrow-up" size={13} color="#F87171" />
                    <Text style={{ color: '#F87171', fontSize: 12, fontFamily: 'DMSans_800ExtraBold' }}>Withdraw</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ alignItems: 'center', backgroundColor: 'rgba(52,211,153,0.12)', borderColor: 'rgba(52,211,153,0.3)', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 12, paddingVertical: 8 }}
                    onPress={() => openSavingsModal('deposit')}
                  >
                    <Ionicons name="arrow-down" size={13} color="#34D399" />
                    <Text style={{ color: '#34D399', fontSize: 12, fontFamily: 'DMSans_800ExtraBold' }}>Deposit</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Balance card */}
              <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_700Bold', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Total Saved</Text>
                    <Text style={{ color: total >= 0 ? '#34D399' : '#F87171', fontSize: 30, fontFamily: 'DMSans_900Black', letterSpacing: -0.5 }}>
                      {currency.format(Math.abs(total))}
                    </Text>
                    {total < 0 && <Text style={{ color: '#F87171', fontSize: 11, marginTop: 2 }}>Withdrawals exceed deposits</Text>}
                  </View>
                  <View style={{ alignItems: 'center', backgroundColor: 'rgba(52,211,153,0.12)', borderRadius: 18, height: 52, justifyContent: 'center', width: 52 }}>
                    <Ionicons name="wallet" size={24} color="#34D399" />
                  </View>
                </View>

                {/* deposit / withdrawal totals */}
                {savings.length > 0 && (
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 14, paddingTop: 14, borderTopColor: C.border, borderTopWidth: 1 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_700Bold', textTransform: 'uppercase', letterSpacing: 0.5 }}>Deposited</Text>
                      <Text style={{ color: '#34D399', fontSize: 15, fontFamily: 'DMSans_900Black', marginTop: 2 }}>
                        {compactCurrency.format(savings.filter((e) => e.type === 'deposit').reduce((s, e) => s + e.amount, 0))}
                      </Text>
                    </View>
                    <View style={{ width: 1, backgroundColor: C.border }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_700Bold', textTransform: 'uppercase', letterSpacing: 0.5 }}>Withdrawn</Text>
                      <Text style={{ color: '#F87171', fontSize: 15, fontFamily: 'DMSans_900Black', marginTop: 2 }}>
                        {compactCurrency.format(savings.filter((e) => e.type === 'withdrawal').reduce((s, e) => s + e.amount, 0))}
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Recent entries */}
              {recent.length > 0 ? (
                recent.map((entry) => (
                  <View key={entry.id} style={{ backgroundColor: C.cardInner, borderColor: C.border, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12, marginBottom: 8 }}>
                    <View style={{ alignItems: 'center', backgroundColor: entry.type === 'deposit' ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)', borderRadius: 12, height: 38, justifyContent: 'center', width: 38 }}>
                      <Ionicons name={entry.type === 'deposit' ? 'arrow-down-circle' : 'arrow-up-circle'} size={20} color={entry.type === 'deposit' ? '#34D399' : '#F87171'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text1, fontSize: 13, fontFamily: 'DMSans_800ExtraBold' }}>{entry.note || (entry.type === 'deposit' ? 'Deposit' : 'Withdrawal')}</Text>
                      <Text style={{ color: C.text3, fontSize: 11, marginTop: 2 }}>{new Date(entry.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                    </View>
                    <Text style={{ color: entry.type === 'deposit' ? '#34D399' : '#F87171', fontSize: 14, fontFamily: 'DMSans_900Black' }}>
                      {entry.type === 'deposit' ? '+' : '-'}{compactCurrency.format(entry.amount)}
                    </Text>
                  </View>
                ))
              ) : (
                <TouchableOpacity
                  style={{ alignItems: 'center', backgroundColor: C.card, borderColor: C.border, borderRadius: 14, borderStyle: 'dashed', borderWidth: 1.5, padding: 24 }}
                  onPress={() => openSavingsModal('deposit')}
                >
                  <View style={{ alignItems: 'center', backgroundColor: C.cardInner, borderRadius: 20, height: 48, justifyContent: 'center', marginBottom: 10, width: 48 }}>
                    <Ionicons name="wallet-outline" size={22} color={C.text3} />
                  </View>
                  <Text style={{ color: C.text1, fontSize: 15, fontFamily: 'DMSans_800ExtraBold' }}>Start saving today</Text>
                  <Text style={{ color: C.text2, fontSize: 13, marginTop: 4 }}>Tap to make your first deposit.</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })()}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Analytics Screen ─────────────────────────────────────────────────────────
function AnalyticsScreen({ wallet }) {
  const { C } = useTheme();
  const { monthlyBudget, stats, transactions, categoryBudgets } = wallet;
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [simulateMode, setSimulateMode] = useState(false);
  const [simOverrides, setSimOverrides] = useState({});
  const [piePeriod, setPiePeriod] = useState('month'); // 'month' | 'all'

  const smartInsights = useMemo(() => generateSmartInsights(transactions), [transactions]);
  const health = useMemo(() => getHealthScoreDetails(stats, monthlyBudget), [stats, monthlyBudget]);
  const scoreColor = health.score >= 70 ? C.income : health.score >= 40 ? C.amber : C.expense;

  const { pieData, pieTotal } = useMemo(
    () => buildCategoryPie(transactions, { monthOnly: piePeriod === 'month' }),
    [transactions, piePeriod],
  );

  // What-If must always use this month — never all-time totals labeled as "/month"
  const { pieData: monthPieData } = useMemo(
    () => buildCategoryPie(transactions, { monthOnly: true }),
    [transactions],
  );
  const hasPieData = pieData.length > 0;
  const hasMonthPie = monthPieData.length > 0;

  useEffect(() => {
    setSelectedSegment(null);
    setSimOverrides({});
    setSimulateMode(false);
  }, [piePeriod]);

  useEffect(() => {
    if (selectedSegment != null && selectedSegment >= pieData.length) {
      setSelectedSegment(null);
    }
  }, [pieData, selectedSegment]);

  const monthlyBreakdown = useMemo(() => {
    const groups = {};
    transactions.forEach((t) => {
      if (!(t.amount < 0)) return;
      const d = toLocalDate(t.date);
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      if (!groups[key]) groups[key] = { key, label, total: 0 };
      groups[key].total += Math.abs(t.amount);
    });
    return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key)).slice(0, 6);
  }, [transactions]);

  const simSavings = useMemo(() => {
    if (!simulateMode) return null;
    let saved = 0;
    monthPieData.forEach((item) => {
      const override = simOverrides[item.category];
      if (override !== undefined) saved += Math.max(item.amount - override, 0);
    });
    return saved;
  }, [simulateMode, simOverrides, monthPieData]);

  const monthComparison = useMemo(() => {
    const now = new Date();
    const curM = now.getMonth(), curY = now.getFullYear();
    const prevM = curM === 0 ? 11 : curM - 1;
    const prevY = curM === 0 ? curY - 1 : curY;
    let curIncome = 0, curExpense = 0, prevIncome = 0, prevExpense = 0;
    transactions.forEach((t) => {
      const d = toLocalDate(t.date);
      if (!d) return;
      const m = d.getMonth(), y = d.getFullYear();
      if (m === curM && y === curY) { if (t.amount >= 0) curIncome += t.amount; else curExpense += Math.abs(t.amount); }
      if (m === prevM && y === prevY) { if (t.amount >= 0) prevIncome += t.amount; else prevExpense += Math.abs(t.amount); }
    });
    const pctChange = (cur, prev) => prev === 0 ? null : Math.round(((cur - prev) / prev) * 100);
    return {
      curIncome, curExpense, prevIncome, prevExpense,
      curSavings: curIncome - curExpense,
      prevSavings: prevIncome - prevExpense,
      incomeChange: pctChange(curIncome, prevIncome),
      expenseChange: pctChange(curExpense, prevExpense),
      savingsChange: pctChange(curIncome - curExpense, prevIncome - prevExpense),
      hasPrevData: prevIncome > 0 || prevExpense > 0,
      prevMonthLabel: new Date(prevY, prevM, 1).toLocaleDateString('en-IN', { month: 'short' }),
      curMonthLabel: new Date(curY, curM, 1).toLocaleDateString('en-IN', { month: 'short' }),
    };
  }, [transactions]);

  const dowData = useMemo(() => {
    const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const totals = Array(7).fill(0);
    transactions.forEach((t) => {
      if (!(t.amount < 0)) return;
      const d = toLocalDate(t.date);
      if (!d) return;
      totals[d.getDay()] += Math.abs(t.amount);
    });
    const maxVal = Math.max(...totals, 1);
    const peakIdx = totals.indexOf(Math.max(...totals));
    return DAY_SHORT.map((label, i) => ({
      label,
      full: DAY_NAMES[i],
      total: totals[i],
      pct: totals[i] / maxVal,
      isPeak: i === peakIdx && totals[i] > 0,
    }));
  }, [transactions]);

  const topExpenses = useMemo(() => {
    const now = new Date();
    const curM = now.getMonth(), curY = now.getFullYear();
    return transactions
      .filter((t) => {
        if (!(t.amount < 0)) return false;
        const d = toLocalDate(t.date);
        return d && d.getMonth() === curM && d.getFullYear() === curY;
      })
      .sort((a, b) => a.amount - b.amount)
      .slice(0, 5);
  }, [transactions]);

  const catBudgetRows = useMemo(() => {
    if (!categoryBudgets || !Object.keys(categoryBudgets).length) return [];
    return Object.entries(categoryBudgets)
      .map(([cat, budget]) => ({ cat, budget, spent: stats.categorySpend?.[cat] || 0 }))
      .filter((r) => r.budget > 0)
      .sort((a, b) => (b.spent / b.budget) - (a.spent / a.budget));
  }, [categoryBudgets, stats.categorySpend]);

  const flowMax = Math.max(stats.monthIncome, stats.monthExpense, 1);
  const netMonth = stats.monthIncome - stats.monthExpense;
  const peakDay = dowData.find((d) => d.isPeak);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <MeshBackground blobs="analytics" isDark={C.isDark} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <View>
            <Text style={{ color: C.text3, fontSize: 11, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase' }}>Analytics</Text>
            <Text style={{ color: C.text1, fontSize: 28, fontFamily: 'DMSans_900Black', letterSpacing: -0.5, marginTop: 2 }}>Spending Map</Text>
          </View>
          <View style={{ alignItems: 'center', backgroundColor: C.purpleBg, borderRadius: 20, height: 42, justifyContent: 'center', width: 42 }}>
            <Ionicons name="map" size={20} color={C.purple} />
          </View>
        </View>

        {/* Quick Stats */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {[
            { icon: 'receipt', color: C.blue, bg: C.blueBg, label: 'Transactions', value: stats.count },
            { icon: 'trending-down', color: C.expense, bg: C.expenseBg, label: 'Avg / Day', value: compactCurrency.format(stats.dailyAverageExpense) },
            { icon: 'flame', color: C.amber, bg: C.amberBg, label: 'Top Category', value: monthPieData[0]?.category || stats.topCategory?.category || '—' },
          ].map((s) => (
            <View key={s.label} style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 14, borderWidth: 1, flex: 1, padding: 12 }}>
              <View style={{ alignItems: 'center', backgroundColor: s.bg, borderRadius: 9, height: 28, justifyContent: 'center', marginBottom: 8, width: 28 }}>
                <Ionicons name={s.icon} size={14} color={s.color} />
              </View>
              <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_700Bold', textTransform: 'uppercase', letterSpacing: 0.4 }}>{s.label}</Text>
              <Text style={{ color: C.text1, fontSize: 15, fontFamily: 'DMSans_900Black', marginTop: 3 }} numberOfLines={1}>{s.value}</Text>
            </View>
          ))}
        </View>

        {/* Calendar spending heatmap */}
        <View style={{ marginBottom: 12 }}>
          <SpendingHeatmap transactions={transactions} C={C} />
        </View>

        {/* Health score breakdown */}
        <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 18, borderWidth: 1, marginBottom: 12, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: health.factors.length ? 14 : 0 }}>
            <View style={{ alignItems: 'center', justifyContent: 'center', width: 64, height: 64 }}>
              <Svg width={64} height={64}>
                <Circle cx={32} cy={32} r={26} stroke={C.cardInner} strokeWidth={6} fill="none" />
                <Circle cx={32} cy={32} r={26} stroke={scoreColor} strokeWidth={6} fill="none"
                  strokeDasharray={`${(health.score / 100) * 163.4} 163.4`}
                  strokeLinecap="round" rotation="-90" origin="32,32" />
              </Svg>
              <Text style={{ position: 'absolute', color: scoreColor, fontSize: 16, fontFamily: 'DMSans_900Black' }}>{health.score}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase' }}>Financial Health</Text>
              <Text style={{ color: C.text1, fontSize: 20, fontFamily: 'DMSans_900Black', marginTop: 2 }}>{health.label}</Text>
              <Text style={{ color: C.text2, fontSize: 12, marginTop: 4 }}>Score from savings, budget, balance & income this month.</Text>
            </View>
          </View>
          {health.factors.map((f) => (
            <View key={f.label} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ color: C.text2, fontSize: 12, fontFamily: 'DMSans_700Bold' }}>{f.label}</Text>
                <Text style={{ color: C.text1, fontSize: 12, fontFamily: 'DMSans_800ExtraBold' }}>{f.pts}/{f.max}</Text>
              </View>
              <View style={{ backgroundColor: C.cardInner, borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <View style={{ backgroundColor: scoreColor, borderRadius: 4, height: 6, width: `${(f.pts / f.max) * 100}%`, opacity: 0.85 }} />
              </View>
              <Text style={{ color: C.text3, fontSize: 10, marginTop: 3 }}>{f.hint}</Text>
            </View>
          ))}
        </View>

        {/* Category donut + period toggle */}
        <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 22, borderWidth: 1, padding: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <View>
              <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase' }}>Categories</Text>
              <Text style={{ color: C.text1, fontSize: 16, fontFamily: 'DMSans_900Black', marginTop: 2 }}>Where money goes</Text>
            </View>
            <View style={{ flexDirection: 'row', backgroundColor: C.cardInner, borderRadius: 10, padding: 3 }}>
              {[['month', 'Month'], ['all', 'All']].map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPiePeriod(key); setSelectedSegment(null); }}
                  style={{ backgroundColor: piePeriod === key ? C.purpleBg : 'transparent', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                >
                  <Text style={{ color: piePeriod === key ? C.purple : C.text3, fontSize: 12, fontFamily: 'DMSans_800ExtraBold' }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <InteractiveDonutChart data={pieData} total={pieTotal} selectedSegment={selectedSegment} onSelectSegment={setSelectedSegment} C={C} />
            {selectedSegment === null && (
              <View pointerEvents="none" style={{ position: 'absolute', alignItems: 'center' }}>
                <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_700Bold', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {piePeriod === 'month' ? 'This Month' : 'All Time'}
                </Text>
                <Text style={{ color: C.text1, fontSize: 20, fontFamily: 'DMSans_900Black', marginTop: 2 }}>{compactCurrency.format(pieTotal)}</Text>
                {hasPieData && <Text style={{ color: C.text3, fontSize: 10, marginTop: 5 }}>Tap a slice</Text>}
              </View>
            )}
          </View>

          {selectedSegment !== null && pieData[selectedSegment] && (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.cardInner, borderColor: `${pieData[selectedSegment].color}45`, borderLeftColor: pieData[selectedSegment].color, borderLeftWidth: 3, borderRadius: 14, borderWidth: 1, marginTop: 4, padding: 16 }}>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: pieData[selectedSegment].color, marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text1, fontSize: 16, fontFamily: 'DMSans_900Black' }}>{pieData[selectedSegment].category}</Text>
                <Text style={{ color: C.text2, fontSize: 12, marginTop: 3 }}>{Math.round(pieData[selectedSegment].percentage)}% of spending</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: pieData[selectedSegment].color, fontSize: 18, fontFamily: 'DMSans_900Black' }}>{currency.format(pieData[selectedSegment].amount)}</Text>
                <TouchableOpacity onPress={() => setSelectedSegment(null)} style={{ marginTop: 4 }}>
                  <Text style={{ color: C.text3, fontSize: 11 }}>✕ close</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {hasPieData ? (
            <View style={{ gap: 10, marginTop: 16 }}>
              {pieData.map((item, i) => (
                <TouchableOpacity key={item.category} style={{ gap: 6 }} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedSegment(selectedSegment === i ? null : i); }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ borderRadius: 5, height: 10, width: 10, backgroundColor: item.color, opacity: selectedSegment === i ? 1 : 0.7 }} />
                    <Text style={{ color: selectedSegment === i ? C.text1 : C.text2, flex: 1, fontSize: 14, fontFamily: selectedSegment === i ? 'DMSans_800ExtraBold' : 'DMSans_600SemiBold' }} numberOfLines={1}>{item.category}</Text>
                    <Text style={{ color: C.text2, fontSize: 12, fontFamily: 'DMSans_600SemiBold' }}>{Math.round(item.percentage)}%</Text>
                    <Text style={{ color: item.color, fontSize: 13, fontFamily: 'DMSans_800ExtraBold', minWidth: 52, textAlign: 'right' }}>{compactCurrency.format(item.amount)}</Text>
                  </View>
                  <View style={{ backgroundColor: C.cardInner, borderRadius: 4, height: 5, overflow: 'hidden', marginLeft: 20 }}>
                    <View style={{ backgroundColor: item.color, borderRadius: 4, height: 5, width: `${Math.max(item.percentage, 2)}%`, opacity: selectedSegment === i ? 1 : 0.7 }} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 28 }}>
              <Ionicons name="pie-chart-outline" size={36} color={C.text3} />
              <Text style={{ color: C.text2, fontSize: 14, marginTop: 10, textAlign: 'center' }}>Add expenses to see your category map.</Text>
            </View>
          )}
        </View>

        {/* What-If Projector — always this-month data */}
        {hasMonthPie && (
          <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: simulateMode ? 14 : 0 }}>
              <View>
                <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase' }}>Simulator</Text>
                <Text style={{ color: C.text1, fontSize: 16, fontFamily: 'DMSans_900Black', marginTop: 2 }}>What If…</Text>
              </View>
              <TouchableOpacity
                style={{ backgroundColor: simulateMode ? C.accentBg : C.cardInner, borderColor: simulateMode ? C.accentBorder : C.border, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 }}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSimulateMode((v) => !v); setSimOverrides({}); }}
              >
                <Text style={{ color: simulateMode ? C.accent : C.text2, fontSize: 12, fontFamily: 'DMSans_800ExtraBold' }}>{simulateMode ? 'Reset' : 'Simulate'}</Text>
              </TouchableOpacity>
            </View>
            {simulateMode && (
              <>
                <Text style={{ color: C.text2, fontSize: 13, marginBottom: 16 }}>Adjust this month’s categories to project savings.</Text>
                {monthPieData.map((item) => {
                  const override = simOverrides[item.category] ?? item.amount;
                  const diff = item.amount - override;
                  return (
                    <View key={item.category} style={{ marginBottom: 14 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ color: C.text1, fontSize: 13, fontFamily: 'DMSans_700Bold' }}>{item.category}</Text>
                        <Text style={{ color: diff > 0 ? C.income : C.text2, fontSize: 12, fontFamily: 'DMSans_800ExtraBold' }}>
                          {compactCurrency.format(override)} {diff > 0 ? `(save ${compactCurrency.format(diff)})` : ''}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity onPress={() => setSimOverrides((o) => ({ ...o, [item.category]: Math.max((o[item.category] ?? item.amount) - 500, 0) }))}>
                          <Ionicons name="remove-circle" size={24} color={C.expense} />
                        </TouchableOpacity>
                        <View style={{ flex: 1, backgroundColor: C.cardInner, borderRadius: 4, height: 6, overflow: 'hidden' }}>
                          <View style={{ backgroundColor: item.color, borderRadius: 4, height: 6, width: `${Math.min((override / Math.max(item.amount, 1)) * 100, 100)}%` }} />
                        </View>
                        <TouchableOpacity onPress={() => setSimOverrides((o) => ({ ...o, [item.category]: Math.min((o[item.category] ?? item.amount) + 500, item.amount) }))}>
                          <Ionicons name="add-circle" size={24} color={C.income} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
                {simSavings !== null && simSavings > 0 && (
                  <View style={{ backgroundColor: C.incomeBg, borderColor: `${C.income}30`, borderRadius: 12, borderWidth: 1, padding: 14, marginTop: 4 }}>
                    <Text style={{ color: C.income, fontSize: 16, fontFamily: 'DMSans_900Black' }}>Save {currency.format(simSavings)}/month</Text>
                    <Text style={{ color: C.text2, fontSize: 12, marginTop: 4 }}>That's {currency.format(simSavings * 12)} per year with this plan.</Text>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* Smart Insights */}
        {smartInsights.length > 0 && (
          <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <View style={{ alignItems: 'center', backgroundColor: C.purpleBg, borderRadius: 10, height: 32, justifyContent: 'center', width: 32 }}>
                <Ionicons name="bulb" size={16} color={C.purple} />
              </View>
              <View>
                <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase' }}>Patterns</Text>
                <Text style={{ color: C.text1, fontSize: 16, fontFamily: 'DMSans_900Black' }}>Smart Insights</Text>
              </View>
            </View>
            {smartInsights.map((ins, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderTopColor: C.border, borderTopWidth: i > 0 ? 1 : 0 }}>
                <View style={{ alignItems: 'center', backgroundColor: `${ins.color}18`, borderRadius: 10, height: 34, justifyContent: 'center', width: 34, marginTop: 1 }}>
                  <Ionicons name={ins.icon} size={16} color={ins.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text1, fontSize: 13, fontFamily: 'DMSans_800ExtraBold' }}>{ins.title}</Text>
                  <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18, marginTop: 3 }}>{ins.body}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Money flow this month */}
        <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <View>
              <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase' }}>This Month</Text>
              <Text style={{ color: C.text1, fontSize: 16, fontFamily: 'DMSans_900Black', marginTop: 2 }}>Money Flow</Text>
            </View>
            <View style={{ backgroundColor: netMonth >= 0 ? C.incomeBg : C.expenseBg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ color: netMonth >= 0 ? C.income : C.expense, fontSize: 12, fontFamily: 'DMSans_900Black' }}>
                Net {netMonth >= 0 ? '+' : '−'}{compactCurrency.format(Math.abs(netMonth))}
              </Text>
            </View>
          </View>
          {[
            { label: 'Income', amount: stats.monthIncome, color: C.income },
            { label: 'Expense', amount: stats.monthExpense, color: C.expense },
          ].map((bar) => (
            <View key={bar.label} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ color: C.text2, fontSize: 13, fontFamily: 'DMSans_700Bold' }}>{bar.label}</Text>
                <Text style={{ color: C.text1, fontSize: 13, fontFamily: 'DMSans_800ExtraBold' }}>{compactCurrency.format(bar.amount)}</Text>
              </View>
              <View style={{ backgroundColor: C.cardInner, borderRadius: 8, height: 14, overflow: 'hidden' }}>
                <View style={{ backgroundColor: bar.color, borderRadius: 8, height: 14, width: `${Math.max((bar.amount / flowMax) * 100, bar.amount ? 4 : 0)}%` }} />
              </View>
            </View>
          ))}
        </View>

        {/* Month vs Last Month */}
        {monthComparison.hasPrevData && (
          <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <View style={{ alignItems: 'center', backgroundColor: C.blueBg, borderRadius: 10, height: 32, justifyContent: 'center', width: 32 }}>
                <Ionicons name="swap-horizontal" size={16} color={C.blue} />
              </View>
              <View>
                <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase' }}>Comparison</Text>
                <Text style={{ color: C.text1, fontSize: 16, fontFamily: 'DMSans_900Black' }}>{monthComparison.curMonthLabel} vs {monthComparison.prevMonthLabel}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 10 }}>
              <View style={{ flex: 1 }} />
              <Text style={{ color: C.text3, fontSize: 11, fontFamily: 'DMSans_700Bold', width: 74, textAlign: 'right' }}>{monthComparison.prevMonthLabel}</Text>
              <Text style={{ color: C.text3, fontSize: 11, fontFamily: 'DMSans_700Bold', width: 74, textAlign: 'right' }}>{monthComparison.curMonthLabel}</Text>
              <Text style={{ color: C.text3, fontSize: 11, fontFamily: 'DMSans_700Bold', width: 48, textAlign: 'right' }}>Δ</Text>
            </View>
            {[
              { label: 'Income', cur: monthComparison.curIncome, prev: monthComparison.prevIncome, change: monthComparison.incomeChange, positiveIsGood: true, color: C.income },
              { label: 'Expenses', cur: monthComparison.curExpense, prev: monthComparison.prevExpense, change: monthComparison.expenseChange, positiveIsGood: false, color: C.expense },
              { label: 'Net', cur: monthComparison.curSavings, prev: monthComparison.prevSavings, change: monthComparison.savingsChange, positiveIsGood: true, color: monthComparison.curSavings >= 0 ? C.income : C.expense },
            ].map((row, i) => {
              const isGood = row.change === null ? null : row.positiveIsGood ? row.change > 0 : row.change < 0;
              const changeColor = isGood === null ? C.text3 : isGood ? C.income : C.expense;
              const changePrefix = row.change > 0 ? '+' : '';
              return (
                <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopColor: C.border, borderTopWidth: i === 0 ? 0 : 1 }}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ backgroundColor: `${row.color}18`, borderRadius: 6, height: 8, width: 8 }} />
                    <Text style={{ color: C.text2, fontSize: 13, fontFamily: 'DMSans_600SemiBold' }}>{row.label}</Text>
                  </View>
                  <Text style={{ color: C.text3, fontSize: 13, fontFamily: 'DMSans_600SemiBold', width: 74, textAlign: 'right' }}>{compactCurrency.format(Math.abs(row.prev))}</Text>
                  <Text style={{ color: row.color, fontSize: 13, fontFamily: 'DMSans_800ExtraBold', width: 74, textAlign: 'right' }}>{compactCurrency.format(Math.abs(row.cur))}</Text>
                  <Text style={{ color: changeColor, fontSize: 12, fontFamily: 'DMSans_800ExtraBold', width: 48, textAlign: 'right' }}>
                    {row.change === null ? '—' : `${changePrefix}${row.change}%`}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Weekday map */}
        {transactions.some((t) => t.amount < 0) && (
          <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <View style={{ alignItems: 'center', backgroundColor: C.purpleBg, borderRadius: 10, height: 32, justifyContent: 'center', width: 32 }}>
                <Ionicons name="calendar" size={15} color={C.purple} />
              </View>
              <View>
                <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase' }}>Week Map</Text>
                <Text style={{ color: C.text1, fontSize: 16, fontFamily: 'DMSans_900Black' }}>Spending by Weekday</Text>
              </View>
            </View>
            <WeekdaySpendChart dowData={dowData} C={C} />
            {peakDay && (
              <View style={{ alignItems: 'center', backgroundColor: C.purpleBg, borderColor: `${C.purple}30`, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 8, marginTop: 14, padding: 10 }}>
                <Ionicons name="alert-circle" size={14} color={C.purple} />
                <Text style={{ color: C.purple, fontSize: 12, fontFamily: 'DMSans_700Bold', flex: 1 }}>
                  {peakDay.full} is your highest-spend day
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Biggest expenses */}
        {topExpenses.length > 0 && (
          <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <View style={{ alignItems: 'center', backgroundColor: C.expenseBg, borderRadius: 10, height: 32, justifyContent: 'center', width: 32 }}>
                <Ionicons name="arrow-up-circle" size={16} color={C.expense} />
              </View>
              <View>
                <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase' }}>This Month</Text>
                <Text style={{ color: C.text1, fontSize: 16, fontFamily: 'DMSans_900Black' }}>Biggest Expenses</Text>
              </View>
            </View>
            {topExpenses.map((t, i) => (
              <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopColor: C.border, borderTopWidth: i === 0 ? 0 : 1 }}>
                <View style={{ alignItems: 'center', backgroundColor: C.cardInner, borderRadius: 10, height: 34, justifyContent: 'center', width: 34 }}>
                  <Text style={{ color: C.text3, fontSize: 13, fontFamily: 'DMSans_800ExtraBold' }}>#{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text1, fontSize: 13, fontFamily: 'DMSans_800ExtraBold' }} numberOfLines={1}>{t.note || t.category}</Text>
                  <Text style={{ color: C.text3, fontSize: 11, marginTop: 1 }}>{t.category} · {new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
                </View>
                <Text style={{ color: C.expense, fontSize: 14, fontFamily: 'DMSans_900Black' }}>{currency.format(Math.abs(t.amount))}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Budget vs Actual */}
        {catBudgetRows.length > 0 && (
          <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <View style={{ alignItems: 'center', backgroundColor: C.amberBg, borderRadius: 10, height: 32, justifyContent: 'center', width: 32 }}>
                <Ionicons name="options" size={15} color={C.amber} />
              </View>
              <View>
                <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase' }}>This Month</Text>
                <Text style={{ color: C.text1, fontSize: 16, fontFamily: 'DMSans_900Black' }}>Budget vs Actual</Text>
              </View>
            </View>
            {catBudgetRows.map((row, i) => {
              const pct = Math.min((row.spent / row.budget) * 100, 100);
              const over = row.spent > row.budget;
              const barColor = over ? C.expense : pct > 80 ? C.amber : C.income;
              return (
                <View key={row.cat} style={{ paddingVertical: 10, borderTopColor: C.border, borderTopWidth: i === 0 ? 0 : 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ color: C.text1, fontSize: 13, fontFamily: 'DMSans_700Bold' }}>{row.cat}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {over && (
                        <View style={{ backgroundColor: C.expenseBg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ color: C.expense, fontSize: 10, fontFamily: 'DMSans_800ExtraBold' }}>OVER</Text>
                        </View>
                      )}
                      <Text style={{ color: barColor, fontSize: 13, fontFamily: 'DMSans_800ExtraBold' }}>{compactCurrency.format(row.spent)}</Text>
                      <Text style={{ color: C.text3, fontSize: 12 }}>/ {compactCurrency.format(row.budget)}</Text>
                    </View>
                  </View>
                  <View style={{ backgroundColor: C.cardInner, borderRadius: 6, height: 8, overflow: 'hidden' }}>
                    <View style={{ backgroundColor: barColor, borderRadius: 6, height: 8, width: `${pct}%` }} />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Monthly history bars */}
        {monthlyBreakdown.length > 1 && (
          <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <View style={{ alignItems: 'center', backgroundColor: C.blueBg, borderRadius: 10, height: 32, justifyContent: 'center', width: 32 }}>
                <Ionicons name="bar-chart" size={15} color={C.blue} />
              </View>
              <View>
                <Text style={{ color: C.text3, fontSize: 10, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase' }}>History</Text>
                <Text style={{ color: C.text1, fontSize: 16, fontFamily: 'DMSans_900Black' }}>Monthly Spend</Text>
              </View>
            </View>
            <MonthlyHistoryChart data={monthlyBreakdown} C={C} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Activity Screen ──────────────────────────────────────────────────────────
function ActivityScreen({ wallet }) {
  const { C } = useTheme();
  const { activeFilter, clearTransactions, deleteTransaction, editTransaction, openTransactionModal, searchQuery, setActiveFilter, setSearchQuery, transactions } = wallet;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <MeshBackground blobs="activity" isDark={C.isDark} />
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <View>
            <Text style={{ color: C.text3, fontSize: 11, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase' }}>Activity</Text>
            <Text style={{ color: C.text1, fontSize: 28, fontFamily: 'DMSans_900Black', letterSpacing: -0.5, marginTop: 2 }}>All Entries</Text>
          </View>
          <View style={{ alignItems: 'center', backgroundColor: C.amberBg, borderRadius: 20, height: 42, justifyContent: 'center', width: 42 }}>
            <Ionicons name="receipt" size={20} color={C.amber} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: C.expenseBg, borderColor: `${C.expense}35`, borderRadius: 14, borderWidth: 1, minHeight: 52 }} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); openTransactionModal('expense'); }}>
            <Ionicons name="remove-circle" size={20} color={C.expense} />
            <Text style={{ color: C.expense, fontSize: 14, fontFamily: 'DMSans_900Black' }}>Expense</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: C.incomeBg, borderColor: `${C.income}35`, borderRadius: 14, borderWidth: 1, minHeight: 52 }} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); openTransactionModal('income'); }}>
            <Ionicons name="add-circle" size={20} color={C.income} />
            <Text style={{ color: C.income, fontSize: 14, fontFamily: 'DMSans_900Black' }}>Income</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ alignItems: 'center', backgroundColor: C.expenseBg, borderColor: `${C.expense}30`, borderRadius: 14, borderWidth: 1, justifyContent: 'center', width: 52 }} onPress={clearTransactions}>
            <Ionicons name="trash-outline" size={19} color={C.expense} />
          </TouchableOpacity>
        </View>
      </View>
      <TransactionList
        transactions={transactions}
        deleteTransaction={deleteTransaction}
        editTransaction={editTransaction}
        activeFilter={activeFilter}
        setActiveFilter={setActiveFilter}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />
    </SafeAreaView>
  );
}

// ─── Custom Tab Bar ───────────────────────────────────────────────────────────
const TAB_CFG = {
  Dashboard: { on: 'home',      off: 'home-outline',      label: 'HOME'     },
  Activity:  { on: 'receipt',   off: 'receipt-outline',   label: 'ACTIVITY' },
  Bills:     { on: 'pricetag',  off: 'pricetag-outline',  label: 'BILLS'    },
  Analytics: { on: 'bar-chart', off: 'bar-chart-outline', label: 'MORE'     },
};

function CustomTabBar({ state, navigation }) {
  const { C } = useTheme();
  const insets = useSafeAreaInsets();
  const TAB_BAR_BG    = C.isDark ? '#000000' : '#FFFFFF';
  const TAB_ACTIVE_FG = C.isDark ? '#FFFFFF'              : '#0F172A';
  const TAB_INACTIVE  = C.isDark ? 'rgba(255,255,255,0.38)' : 'rgba(15,23,42,0.38)';
  const SPOTLIGHT     = C.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.07)';
  const RING_COLOR    = C.isDark ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.18)';
  const RING_ACTIVE   = C.isDark ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.45)';
  const BTN_BG        = C.isDark ? '#111111'              : '#F1F5F9';
  const BTN_INNER     = C.isDark ? '#161616'              : '#E2E8F0';
  const CARD_ICON     = C.isDark ? '#FFFFFF'              : '#0F172A';
  const CARD_ICON_OFF = C.isDark ? 'rgba(255,255,255,0.65)' : 'rgba(15,23,42,0.50)';
  const GLOW_RING     = C.isDark ? 'rgba(255,255,255,0.30)' : 'rgba(15,23,42,0.20)';
  const GLOW_RING_OFF = C.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)';

  const pulseAnim    = useRef(new Animated.Value(1)).current;
  const swipeAnim    = useRef(new Animated.Value(0)).current;
  const cardScaleAnim = useRef(new Animated.Value(1)).current;
  const activeRouteName = state.routes[state.index].name;
  const isCardsActive   = activeRouteName === 'Cards';

  // Tab press scale animations — one per regular slot
  const tabScales = useRef(
    state.routes.filter(r => r.name !== 'Cards').map(() => new Animated.Value(1))
  ).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.30, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const handleCardPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    swipeAnim.setValue(0);
    cardScaleAnim.setValue(1);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(swipeAnim, { toValue: -26, duration: 130, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(swipeAnim, { toValue: 20,  duration: 0,   useNativeDriver: true }),
        Animated.spring(swipeAnim, { toValue: 0,   friction: 5, tension: 160, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(cardScaleAnim, { toValue: 0.80, duration: 120, useNativeDriver: true }),
        Animated.spring(cardScaleAnim, { toValue: 1, friction: 4, tension: 200, useNativeDriver: true }),
      ]),
    ]).start();
    navigation.navigate('Cards');
  };

  const regularTabs = state.routes.filter(r => r.name !== 'Cards');
  const leftTabs    = regularTabs.slice(0, 2);
  const rightTabs   = regularTabs.slice(2);

  const bounceTab = (scaleAnim) => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.84, duration: 90, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 4, tension: 260, useNativeDriver: true }),
    ]).start();
  };

  const renderTab = (route, scaleAnim) => {
    const focused = activeRouteName === route.name;
    const cfg     = TAB_CFG[route.name];
    if (!cfg) return null;
    return (
      <TouchableOpacity
        key={route.key}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          bounceTab(scaleAnim);
          navigation.navigate(route.name);
        }}
        style={{ alignItems: 'center', flex: 1, justifyContent: 'center', paddingVertical: 10 }}
        activeOpacity={1}
      >
        <Animated.View style={{ alignItems: 'center', transform: [{ scale: scaleAnim }] }}>
          {/* Circular spotlight highlight when active */}
          <View style={{
            width: 46, height: 40, borderRadius: 23,
            backgroundColor: focused ? SPOTLIGHT : 'transparent',
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 3,
          }}>
            <Ionicons
              name={focused ? cfg.on : cfg.off}
              size={22}
              color={focused ? TAB_ACTIVE_FG : TAB_INACTIVE}
            />
          </View>
          <Text style={{
            color: focused ? TAB_ACTIVE_FG : TAB_INACTIVE,
            fontSize: 9,
            fontFamily: 'DMSans_700Bold',
            letterSpacing: 0.6,
          }}>
            {cfg.label}
          </Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
      {/* Bar */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: TAB_BAR_BG,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderTopWidth: 1,
        borderTopColor: C.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)',
        height: 72 + insets.bottom,
        paddingBottom: insets.bottom,
        paddingHorizontal: 4,
        elevation: 28,
        shadowColor: C.isDark ? '#000' : '#94A3B8',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: C.isDark ? 0.55 : 0.15,
        shadowRadius: 20,
      }}>
        {leftTabs.map((r, i) => renderTab(r, tabScales[i]))}
        {/* Gap for center button */}
        <View style={{ width: 70 }} />
        {rightTabs.map((r, i) => renderTab(r, tabScales[i + leftTabs.length]))}
      </View>

      {/* ── Center CARDS button (elevated, sits above bar) ── */}
      <View style={{
        position: 'absolute',
        alignSelf: 'center',
        bottom: 22 + insets.bottom,
        alignItems: 'center',
        justifyContent: 'center',
        width: 70,
        height: 70,
      }}>
        <TouchableOpacity
          onPress={handleCardPress}
          activeOpacity={0.88}
          style={{ alignItems: 'center', justifyContent: 'center' }}
        >
          {/* Outer ring border */}
          <View style={{
            width: 62, height: 62, borderRadius: 31,
            borderWidth: 1.5,
            borderColor: isCardsActive ? RING_ACTIVE : RING_COLOR,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: BTN_BG,
            elevation: 20,
            shadowColor: C.isDark ? '#fff' : '#000',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: isCardsActive ? 0.12 : 0.04,
            shadowRadius: 14,
          }}>
            {/* Inner circle */}
            <View style={{
              width: 50, height: 50, borderRadius: 25,
              backgroundColor: BTN_INNER,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1,
              borderColor: C.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
            }}>
              <Animated.View style={{
                transform: [{ translateX: swipeAnim }, { scale: cardScaleAnim }],
              }}>
                <Ionicons name="card" size={24} color={isCardsActive ? CARD_ICON : CARD_ICON_OFF} />
              </Animated.View>
            </View>
          </View>
        </TouchableOpacity>

        {/* Label below button */}
        <Text style={{
          color: isCardsActive ? TAB_ACTIVE_FG : TAB_INACTIVE,
          fontSize: 9,
          fontFamily: 'DMSans_700Bold',
          letterSpacing: 0.6,
          marginTop: 4,
        }}>
          CARDS
        </Text>
      </View>
    </View>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
function MainApp() {
  const { C } = useTheme();
  const { hasUpdate, latestVersion, downloadUrl, dismiss } = useUpdateChecker();
  const [transactions, setTransactions] = useState([]);
  const [goals, setGoals] = useState([]);
  const [savings, setSavings] = useState([]);
  const [isSavingsModalVisible, setSavingsModalVisible] = useState(false);
  const [savingsModalType, setSavingsModalType] = useState('deposit');
  const [bills, setBills] = useState([]);
  const [categoryBudgets, setCategoryBudgets] = useState({});
  const [isModalVisible, setModalVisible] = useState(false);
  const [isGoalModalVisible, setGoalModalVisible] = useState(false);
  const [isCategoryBudgetModalVisible, setCategoryBudgetModalVisible] = useState(false);
  const [transactionType, setTransactionType] = useState('expense');
  const [transactionCategory, setTransactionCategory] = useState('');
  const [transactionAmount, setTransactionAmount] = useState('');
  const [transactionNote, setTransactionNote] = useState('');
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString());
  const [transactionRecurring, setTransactionRecurring] = useState(null);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [monthlyBudget, setMonthlyBudget] = useState(DEFAULT_MONTHLY_BUDGET);
  const [confettiGoal, setConfettiGoal] = useState(null);
  const [hideBalanceFeature, setHideBalanceFeature] = useState(false);
  const [dailySpendLimit, setDailySpendLimit] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const [savedTx, savedBudget, savedGoals, savedCatBudgets, savedBills, savedSavings, savedHideBalance, savedDailyLimit] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(BUDGET_KEY),
          AsyncStorage.getItem(GOALS_KEY),
          AsyncStorage.getItem(CAT_BUDGETS_KEY),
          AsyncStorage.getItem(BILLS_KEY),
          AsyncStorage.getItem(SAVINGS_KEY),
          AsyncStorage.getItem(HIDE_BALANCE_KEY),
          AsyncStorage.getItem(DAILY_LIMIT_KEY),
        ]);
        if (savedTx) {
          const parsed = JSON.parse(savedTx).map(normalizeTransaction);
          setTransactions(parsed);
        }
        const b = Number.parseFloat(savedBudget);
        if (Number.isFinite(b) && b > 0) setMonthlyBudget(b);
        if (savedGoals) setGoals(JSON.parse(savedGoals));
        if (savedCatBudgets) setCategoryBudgets(JSON.parse(savedCatBudgets));
        if (savedBills) setBills(JSON.parse(savedBills));
        if (savedSavings) setSavings(JSON.parse(savedSavings));
        if (savedHideBalance !== null) setHideBalanceFeature(savedHideBalance === 'true');
        if (savedDailyLimit) { const dl = Number.parseFloat(savedDailyLimit); if (dl > 0) setDailySpendLimit(dl); }
      } catch { Alert.alert('Load error', 'Could not load wallet data. Please restart the app.'); }
      // Request notification permission once so bill reminders can fire
      requestNotificationPermission().catch(() => {});
    };
    load();
  }, []);

  const stats = useMemo(() => buildStats(transactions, monthlyBudget), [monthlyBudget, transactions]);
  const insight = useMemo(() => buildInsight(stats, monthlyBudget, transactions.length), [monthlyBudget, stats, transactions.length]);
  const streak = useMemo(() => calculateStreak(transactions, monthlyBudget), [transactions, monthlyBudget]);

  useEffect(() => {
    scheduleDailyReview(stats).catch(() => {});
  }, [stats]);

  useEffect(() => {
    scheduleBillReminders(bills).catch(() => {});
  }, [bills]);

  const resetForm = () => {
    setTransactionType('expense');
    setTransactionCategory('');
    setTransactionAmount('');
    setTransactionNote('');
    setTransactionDate(new Date().toISOString());
    setTransactionRecurring(null);
    setEditingTransaction(null);
  };

  const openTransactionModal = (type) => { setTransactionType(type); setModalVisible(true); };

  const editTransaction = (tx) => {
    setEditingTransaction(tx);
    setTransactionType(tx.type);
    setTransactionCategory(tx.category);
    setTransactionAmount(String(Math.abs(tx.amount)));
    setTransactionNote(tx.note || '');
    setTransactionDate(tx.date);
    setTransactionRecurring(tx.recurring || null);
    setModalVisible(true);
  };

  const openGoalModal = () => setGoalModalVisible(true);
  const openCategoryBudgetModal = () => setCategoryBudgetModalVisible(true);

  const persistTransactions = async (next) => {
    setTransactions(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };
  const persistGoals = async (next) => {
    setGoals(next);
    await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(next));
  };

  const persistSavings = async (next) => {
    setSavings(next);
    await AsyncStorage.setItem(SAVINGS_KEY, JSON.stringify(next));
  };

  const addSavingsEntry = async (entry) => {
    await persistSavings([entry, ...savings]);
  };

  const openSavingsModal = (type) => { setSavingsModalType(type); setSavingsModalVisible(true); };

  const adjustMonthlyBudget = async (val) => {
    const next = Math.max(500, val);
    setMonthlyBudget(next);
    await AsyncStorage.setItem(BUDGET_KEY, String(next));
  };

  const saveCategoryBudgets = async (budgets) => {
    setCategoryBudgets(budgets);
    await AsyncStorage.setItem(CAT_BUDGETS_KEY, JSON.stringify(budgets));
  };

  const persistBills = async (next) => {
    setBills(next);
    await AsyncStorage.setItem(BILLS_KEY, JSON.stringify(next));
  };

  const addBill = async (bill) => {
    await persistBills([bill, ...bills]);
  };

  const updateBill = async (updated) => {
    await persistBills(bills.map((b) => (b.id === updated.id ? { ...b, ...updated, id: b.id } : b)));
  };

  const deleteBill = async (id) => {
    // Remove every auto-created payment transaction for this bill (id: bill_<id>_YYYY-MM)
    const nextTx = transactions.filter((t) => !t.id.startsWith(`bill_${id}_`));
    if (nextTx.length !== transactions.length) {
      await persistTransactions(nextTx);
    }
    await persistBills(bills.filter((b) => b.id !== id));
  };

  const markBillPaid = async (bill) => {
    const { periodKey } = getBillingPeriod(bill);
    const now = new Date();
    const txId = `bill_${bill.id}_${periodKey}`;

    // Create expense transaction
    const tx = normalizeTransaction({
      id: txId,
      type: 'expense',
      category: bill.category || 'Bills',
      amount: bill.amount,
      note: bill.name,
      date: now.toISOString(),
      recurring: null,
    });
    const nextTx = [tx, ...transactions.filter((t) => t.id !== txId)];
    await persistTransactions(nextTx);

    // Mark bill as paid for the current billing period
    const nextBills = bills.map((b) =>
      b.id === bill.id
        ? { ...b, paidMonths: { ...b.paidMonths, [periodKey]: { paidAt: now.toISOString(), txId } } }
        : b
    );
    await persistBills(nextBills);
  };

  const markBillUnpaid = async (bill) => {
    const { periodKey } = getBillingPeriod(bill);
    const txId = bill.paidMonths?.[periodKey]?.txId;

    // Remove the auto-created transaction if it exists
    if (txId) {
      await persistTransactions(transactions.filter((t) => t.id !== txId));
    }

    // Remove this period from paidMonths
    const nextBills = bills.map((b) => {
      if (b.id !== bill.id) return b;
      const { [periodKey]: _removed, ...rest } = b.paidMonths || {};
      return { ...b, paidMonths: rest };
    });
    await persistBills(nextBills);
  };

  const addTransaction = async () => {
    const amount = Number.parseFloat(transactionAmount);
    if (!transactionCategory.trim()) { Alert.alert('Missing category', 'Choose or type a category.'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { Alert.alert('Invalid amount', 'Amount must be greater than zero.'); return; }

    const txData = {
      id: editingTransaction ? editingTransaction.id : `${Date.now()}`,
      category: transactionCategory.trim(),
      amount: transactionType === 'expense' ? -Math.abs(amount) : Math.abs(amount),
      note: transactionNote.trim(),
      type: transactionType,
      date: transactionDate,
      recurring: transactionRecurring,
    };

    try {
      let next;
      if (editingTransaction) {
        next = transactions.map((t) => t.id === editingTransaction.id ? txData : t);
      } else {
        next = [txData, ...transactions];
      }
      await persistTransactions(next);
      resetForm();
      setModalVisible(false);

      // Daily spend limit check — only for new expenses, not edits
      if (transactionType === 'expense' && !editingTransaction && dailySpendLimit > 0) {
        const todayStr = localDateStr(new Date());
        const todayTotal = next
          .filter(t => localDateStr(new Date(t.date)) === todayStr && t.amount < 0)
          .reduce((s, t) => s + Math.abs(t.amount), 0);
        if (todayTotal >= dailySpendLimit) {
          setTimeout(() => {
            Alert.alert(
              'Daily Limit Reached',
              `You've spent ${currency.format(todayTotal)} today, exceeding your daily limit of ${currency.format(dailySpendLimit)}.`,
              [{ text: 'OK' }]
            );
          }, 350);
        }
      }
    } catch { Alert.alert('Save error', 'Could not save transaction.'); }
  };

  const deleteTransaction = async (id) => {
    try { await persistTransactions(transactions.filter((t) => t.id !== id)); }
    catch { Alert.alert('Delete error', 'Could not delete transaction.'); }
  };

  const clearTransactions = () => {
    if (!transactions.length) return;
    Alert.alert('Clear all transactions?', 'This will permanently remove your wallet history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear All', style: 'destructive', onPress: async () => { try { await persistTransactions([]); } catch { Alert.alert('Error', 'Could not clear.'); } } },
    ]);
  };

  const addGoal = async (goal) => {
    const next = [goal, ...goals];
    await persistGoals(next);
  };

  const deleteGoal = (id) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Remove goal?', 'This goal will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await persistGoals(goals.filter((g) => g.id !== id)); } },
    ]);
  };

  // Check if any goal just hit completion (single batch write)
  useEffect(() => {
    const newlyDone = goals.filter((g) => g.savedAmount >= g.target && !g.celebratedAt);
    if (!newlyDone.length) return;
    setConfettiGoal(newlyDone[0]);
    persistGoals(
      goals.map((goal) =>
        newlyDone.some((n) => n.id === goal.id)
          ? { ...goal, celebratedAt: new Date().toISOString() }
          : goal
      )
    );
  }, [goals]);

  const resetAllData = async () => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEY),
        AsyncStorage.removeItem(BUDGET_KEY),
        AsyncStorage.removeItem(GOALS_KEY),
        AsyncStorage.removeItem(CAT_BUDGETS_KEY),
        AsyncStorage.removeItem(BILLS_KEY),
        AsyncStorage.removeItem(SAVINGS_KEY),
        AsyncStorage.removeItem(HIDE_BALANCE_KEY),
        AsyncStorage.removeItem(DAILY_LIMIT_KEY),
        clearStoredPin(),
        clearAllCardData(),
      ]);
      setTransactions([]);
      setMonthlyBudget(DEFAULT_MONTHLY_BUDGET);
      setGoals([]);
      setCategoryBudgets({});
      setBills([]);
      setSavings([]);
      setHideBalanceFeature(false);
      setDailySpendLimit(0);
    } catch { Alert.alert('Reset error', 'Could not reset data.'); }
  };

  const wallet = {
    activeFilter, adjustMonthlyBudget, clearTransactions, deleteTransaction, editTransaction,
    deleteGoal, goals, insight, monthlyBudget, openTransactionModal, openGoalModal,
    openCategoryBudgetModal, categoryBudgets, searchQuery, setActiveFilter, setSearchQuery,
    stats, streak, transactions,
    bills, addBill, updateBill, deleteBill, markBillPaid, markBillUnpaid,
    savings, openSavingsModal,
    hideBalanceFeature, setHideBalanceFeature,
    dailySpendLimit, setDailySpendLimit,
  };

  const onRestoreData = (data) => {
    if (data.transactions) setTransactions(data.transactions.map(normalizeTransaction));
    if (data.monthlyBudget != null) setMonthlyBudget(data.monthlyBudget);
    if (data.goals) setGoals(data.goals);
    if (data.categoryBudgets) setCategoryBudgets(data.categoryBudgets);
    if (data.bills) setBills(data.bills);
    if (data.savings) setSavings(data.savings);
    if (data.hideBalanceFeature != null) setHideBalanceFeature(data.hideBalanceFeature);
    if (data.dailySpendLimit != null) setDailySpendLimit(data.dailySpendLimit);
  };

  return (
    <View style={{ backgroundColor: C.bg, flex: 1 }}>
      <Tab.Navigator
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tab.Screen name="Dashboard">{() => <DashboardScreen wallet={wallet} />}</Tab.Screen>
        <Tab.Screen name="Activity">{() => <ActivityScreen wallet={wallet} />}</Tab.Screen>
        <Tab.Screen name="Cards" component={CardScreen} />
        <Tab.Screen name="Bills">{() => (
          <BillsScreen
            bills={wallet.bills}
            onAddBill={wallet.addBill}
            onUpdateBill={wallet.updateBill}
            onDeleteBill={wallet.deleteBill}
            onMarkPaid={wallet.markBillPaid}
            onMarkUnpaid={wallet.markBillUnpaid}
          />
        )}</Tab.Screen>
        <Tab.Screen name="Analytics">{() => <AnalyticsScreen wallet={wallet} />}</Tab.Screen>
        {/* Settings hidden from tab bar — opened via gear icon in dashboard header */}
        <Tab.Screen name="Settings">{() => (
          <SettingsScreen
            resetAllData={resetAllData}
            hideBalanceFeature={hideBalanceFeature}
            onHideBalanceChange={setHideBalanceFeature}
            dailySpendLimit={dailySpendLimit}
            onDailyLimitChange={(val) => { setDailySpendLimit(val); AsyncStorage.setItem(DAILY_LIMIT_KEY, String(val)); }}
            onRestoreData={onRestoreData}
          />
        )}</Tab.Screen>
      </Tab.Navigator>

      <TransactionModal
        isModalVisible={isModalVisible}
        toggleModal={() => { resetForm(); setModalVisible(false); }}
        transactionType={transactionType}
        setTransactionType={setTransactionType}
        transactionCategory={transactionCategory}
        setTransactionCategory={setTransactionCategory}
        transactionAmount={transactionAmount}
        setTransactionAmount={setTransactionAmount}
        transactionNote={transactionNote}
        setTransactionNote={setTransactionNote}
        transactionDate={transactionDate}
        setTransactionDate={setTransactionDate}
        transactionRecurring={transactionRecurring}
        setTransactionRecurring={setTransactionRecurring}
        addTransaction={addTransaction}
        editingTransaction={editingTransaction}
      />

      <AddGoalModal visible={isGoalModalVisible} onClose={() => setGoalModalVisible(false)} onAdd={addGoal} />
      <AddSavingsModal visible={isSavingsModalVisible} type={savingsModalType} onClose={() => setSavingsModalVisible(false)} onSave={addSavingsEntry} />

      <CategoryBudgetModal
        visible={isCategoryBudgetModalVisible}
        onClose={() => setCategoryBudgetModalVisible(false)}
        categoryBudgets={categoryBudgets}
        onSave={saveCategoryBudgets}
        C={C}
      />

      <ConfettiOverlay
        visible={!!confettiGoal}
        goalName={confettiGoal?.name || ''}
        onDismiss={() => setConfettiGoal(null)}
      />

      <UpdateModal
        visible={hasUpdate}
        latestVersion={latestVersion}
        downloadUrl={downloadUrl}
        onDismiss={dismiss}
      />
    </View>
  );
}

// ─── Business Logic ───────────────────────────────────────────────────────────
function buildStats(transactions, monthlyBudget) {
  const now = new Date();
  const cm = now.getMonth(), cy = now.getFullYear(), de = now.getDate();
  const dim = new Date(cy, cm + 1, 0).getDate();
  const expCats = {};
  const categorySpend = {};
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(cy, cm, de - (6 - i));
    return { key: localDateStr(d), label: d.toLocaleDateString('en-IN', { weekday: 'short' }), total: 0 };
  });
  const weekMap = weekDays.reduce((m, d) => { m[d.key] = d; return m; }, {});
  const totals = transactions.reduce((s, t) => {
    const d = new Date(t.date), itm = d.getMonth() === cm && d.getFullYear() === cy, dk = localDateStr(d);
    if (t.amount >= 0) { s.income += t.amount; if (itm) s.monthIncome += t.amount; }
    else {
      const abs = Math.abs(t.amount);
      s.expense += abs;
      expCats[t.category || 'Other'] = (expCats[t.category || 'Other'] || 0) + abs;
      if (itm) { s.monthExpense += abs; categorySpend[t.category] = (categorySpend[t.category] || 0) + abs; }
      if (weekMap[dk]) weekMap[dk].total += abs;
    }
    return s;
  }, { income: 0, expense: 0, monthExpense: 0, monthIncome: 0 });

  const todayStr = localDateStr(now);
  const todaySpend = transactions.filter((t) => localDateStr(new Date(t.date)) === todayStr && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  const topCategories = Object.entries(expCats).sort(([, a], [, b]) => b - a).slice(0, 6).map(([category, amount]) => ({ amount, category, percentage: totals.expense ? (amount / totals.expense) * 100 : 0 }));
  const projectedExpense = totals.monthExpense ? (totals.monthExpense / de) * dim : 0;
  const remainingBudget = monthlyBudget - totals.monthExpense;
  const dailyBudgetLeft = Math.max(remainingBudget, 0) / Math.max(dim - de + 1, 1);

  return {
    ...totals,
    balance: totals.income - totals.expense,
    budgetUsedPercent: Math.min((totals.monthExpense / monthlyBudget) * 100, 100),
    categorySpend,
    count: transactions.length,
    dailyAverageExpense: totals.monthExpense / Math.max(de, 1),
    dailyBudgetLeft,
    daysLeft: Math.max(dim - de + 1, 1),
    projectedExpense,
    remainingBudget,
    savingsRate: totals.monthIncome ? ((totals.monthIncome - totals.monthExpense) / totals.monthIncome) * 100 : 0,
    todaySpend,
    topCategories,
    topCategory: topCategories[0],
    weekDays,
    weekMaxSpend: Math.max(...weekDays.map((d) => d.total), 1),
    weekSpend: weekDays.reduce((s, d) => s + d.total, 0),
  };
}

function buildInsight(stats, monthlyBudget, count) {
  if (!count) return { icon: 'sparkles-outline', title: 'Ready for your first entry', body: 'Add income and expenses to unlock budget guidance.' };
  if (stats.projectedExpense > monthlyBudget) return { icon: 'alert-circle-outline', title: 'Budget watch', body: `Projected spend is ${currency.format(stats.projectedExpense)} this month.` };
  if (stats.savingsRate >= 25) return { icon: 'shield-checkmark-outline', title: 'Strong savings pace', body: `Saving ${Math.round(stats.savingsRate)}% of this month's income.` };
  return { icon: 'flash-outline', title: 'Daily room left', body: `${currency.format(stats.dailyBudgetLeft)} per day to stay on budget.` };
}

function calculateHealthScore(stats, monthlyBudget) {
  return getHealthScoreDetails(stats, monthlyBudget).score;
}

function getHealthScoreDetails(stats, monthlyBudget) {
  if (!stats.count) {
    return { score: 0, label: 'No Data', factors: [] };
  }

  const savingsPts = Math.min(Math.max(stats.savingsRate, 0) * 1.0, 40);
  let budgetPts = 0;
  if (stats.budgetUsedPercent <= 80) budgetPts = 30;
  else if (stats.budgetUsedPercent <= 100) budgetPts = Math.max(0, 30 - (stats.budgetUsedPercent - 80) * 1.5);
  const balancePts = stats.balance > 0 ? 20 : 0;
  const incomePts = stats.monthIncome > 0 ? 10 : 0;
  const score = Math.min(100, Math.max(0, Math.round(savingsPts + budgetPts + balancePts + incomePts)));
  const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Needs Work';

  return {
    score,
    label,
    factors: [
      { label: 'Savings rate', pts: Math.round(savingsPts), max: 40, hint: `${Math.round(Math.max(stats.savingsRate, 0))}% of income` },
      { label: 'Budget adherence', pts: Math.round(budgetPts), max: 30, hint: `${Math.round(stats.budgetUsedPercent)}% of budget used` },
      { label: 'Positive balance', pts: balancePts, max: 20, hint: stats.balance > 0 ? 'In the green' : 'Balance is negative' },
      { label: 'Income logged', pts: incomePts, max: 10, hint: stats.monthIncome > 0 ? 'Income recorded this month' : 'Add income entries' },
    ],
  };
}

export default MainApp;
