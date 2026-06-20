import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
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
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { useTheme } from './ThemeContext';
import SettingsScreen from './SettingsScreen';
import TransactionList from './TransactionList';
import TransactionModal from './TransactionModal';
import BillsScreen, { BILLS_KEY } from './BillsScreen';
import { scheduleDailyReview, scheduleBillReminders } from './NotificationService';

const Tab = createBottomTabNavigator();
const STORAGE_KEY = 'transactions';
const BUDGET_KEY = 'monthlyBudget';
const GOALS_KEY = 'savingsGoals';
const CAT_BUDGETS_KEY = 'categoryBudgets';
const SAVINGS_KEY = 'savings_v1';
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
  const expenses = transactions.filter((t) => t.amount < 0);
  if (!expenses.length) return [];
  const insights = [];

  const dowSpend = {};
  expenses.forEach((t) => { const dow = new Date(t.date).getDay(); dowSpend[dow] = (dowSpend[dow] || 0) + Math.abs(t.amount); });
  const [peakDow] = Object.entries(dowSpend).sort(([, a], [, b]) => b - a);
  if (peakDow) insights.push({ icon: 'calendar', color: '#60A5FA', title: 'Peak Spending Day', body: `${DAY_NAMES[+peakDow[0]]}s are your biggest spending days. Plan ahead!` });

  const wEnd = expenses.filter((t) => [0, 6].includes(new Date(t.date).getDay())).reduce((s, t) => s + Math.abs(t.amount), 0);
  const wDay = expenses.filter((t) => ![0, 6].includes(new Date(t.date).getDay())).reduce((s, t) => s + Math.abs(t.amount), 0);
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
  heading: { color: '#F9FAFB', fontSize: 28, fontWeight: '900' },
  goalName: { color: '#FCD34D', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  sub: { color: 'rgba(249,250,251,0.5)', fontSize: 14, textAlign: 'center', marginTop: 4 },
  btn: { backgroundColor: '#FCD34D', borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14, marginTop: 16 },
  btnText: { color: '#000', fontSize: 16, fontWeight: '900' },
});

// ─── Animated Balance Number ──────────────────────────────────────────────────
function AnimatedBalance({ value, color, fontSize = 38 }) {
  const animVal = useRef(new Animated.Value(value)).current;
  const displayVal = useRef(value);
  const [displayed, setDisplayed] = useState(value);

  useEffect(() => {
    Animated.timing(animVal, { toValue: value, duration: 600, useNativeDriver: false }).start();
    animVal.addListener(({ value: v }) => {
      displayVal.current = v;
      setDisplayed(v);
    });
    return () => animVal.removeAllListeners();
  }, [value]);

  const formatted = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(displayed);
  return <Text style={{ color, fontSize, fontWeight: '900', letterSpacing: -0.5 }}>{formatted}</Text>;
}

// ─── AppHeader ────────────────────────────────────────────────────────────────
function AppHeader({ streak }) {
  const { C } = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (streak >= 3) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.18, duration: 700, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
      ).start();
    }
  }, [streak]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ backgroundColor: C.cardInner, borderRadius: 14, padding: 2 }}>
          <Image source={require('./assets/logo.png')} style={{ borderRadius: 12, height: 42, width: 42 }} />
        </View>
        <View>
          <Text style={{ color: C.text1, fontSize: 20, fontWeight: '900' }}>Thunder Wallet</Text>
          <Text style={{ color: C.text2, fontSize: 12, marginTop: 2 }}>Your money, under control</Text>
        </View>
      </View>
      {streak > 0 && (
        <Animated.View style={[{ alignItems: 'center', backgroundColor: streak >= 7 ? 'rgba(251,146,60,0.15)' : C.accentBg, borderColor: streak >= 7 ? '#FB923C' : C.accentBorder, borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingVertical: 6 }, streak >= 3 && { transform: [{ scale: pulse }] }]}>
          <Text style={{ fontSize: 14 }}>{streak >= 7 ? '🔥' : streak >= 3 ? '⚡' : '✨'}</Text>
          <Text style={{ color: streak >= 7 ? '#FB923C' : C.text1, fontSize: 12, fontWeight: '900' }}>{streak}d</Text>
        </Animated.View>
      )}
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
          <Text style={{ color: C.text1, fontSize: 14, fontWeight: '800' }} numberOfLines={1}>{goal.name}</Text>
          {isComplete && (
            <View style={{ backgroundColor: `${C.income}20`, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: C.income, fontSize: 11, fontWeight: '800' }}>Goal Reached! 🎉</Text>
            </View>
          )}
        </View>
        <View style={{ backgroundColor: C.bg, borderRadius: 6, height: 7, overflow: 'hidden', marginBottom: 6 }}>
          <View style={{ backgroundColor: isComplete ? C.income : goal.color, borderRadius: 6, height: 7, width: `${progress}%` }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: C.text2, fontSize: 11, fontWeight: '600' }}>
            {compactCurrency.format(Math.min(goal.savedAmount, goal.target))} / {compactCurrency.format(goal.target)} · {Math.round(progress)}%
          </Text>
          {daysLeft !== null && (
            <Text style={{ color: daysLeft < 7 ? C.expense : C.text3, fontSize: 11, fontWeight: '700' }}>
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
          <Text style={{ color: C.text3, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }}>New Goal</Text>
          <Text style={{ color: C.text1, fontSize: 22, fontWeight: '900', marginBottom: 20, marginTop: 2 }}>Add Savings Goal</Text>

          <Text style={{ color: C.text2, fontSize: 11, fontWeight: '700', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>Icon & Color</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
            {GOAL_PRESETS.map((p, i) => (
              <TouchableOpacity key={i} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedPreset(i); }} style={{ alignItems: 'center', gap: 4 }}>
                <View style={{ alignItems: 'center', backgroundColor: selectedPreset === i ? `${p.color}25` : C.cardInner, borderColor: selectedPreset === i ? p.color : C.border, borderRadius: 14, borderWidth: selectedPreset === i ? 2 : 1, height: 52, justifyContent: 'center', width: 52 }}>
                  <Ionicons name={p.icon} size={24} color={selectedPreset === i ? p.color : C.text2} />
                </View>
                <Text style={{ color: selectedPreset === i ? p.color : C.text3, fontSize: 10, fontWeight: '700' }}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={{ color: C.text2, fontSize: 11, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>Goal Name</Text>
          <TextInput style={{ backgroundColor: C.cardInner, borderColor: C.border, borderRadius: 12, borderWidth: 1, color: C.text1, fontSize: 15, marginBottom: 14, minHeight: 48, paddingHorizontal: 14 }} placeholder="e.g. New iPhone, Goa Trip…" placeholderTextColor={C.text3} value={name} onChangeText={setName} />

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text2, fontSize: 11, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>Target Amount</Text>
              <View style={{ alignItems: 'center', backgroundColor: C.cardInner, borderColor: `${GOAL_PRESETS[selectedPreset].color}40`, borderRadius: 12, borderWidth: 2, flexDirection: 'row', minHeight: 50, paddingHorizontal: 12 }}>
                <Text style={{ color: GOAL_PRESETS[selectedPreset].color, fontSize: 18, fontWeight: '900', marginRight: 6 }}>₹</Text>
                <TextInput style={{ color: C.text1, flex: 1, fontSize: 18, fontWeight: '800' }} placeholder="0" placeholderTextColor={C.text3} keyboardType="decimal-pad" value={target} onChangeText={setTarget} />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text2, fontSize: 11, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>Already Saved</Text>
              <View style={{ alignItems: 'center', backgroundColor: C.cardInner, borderColor: C.border, borderRadius: 12, borderWidth: 1, flexDirection: 'row', minHeight: 50, paddingHorizontal: 12 }}>
                <Text style={{ color: C.text3, fontSize: 18, fontWeight: '900', marginRight: 6 }}>₹</Text>
                <TextInput style={{ color: C.text1, flex: 1, fontSize: 18, fontWeight: '800' }} placeholder="0" placeholderTextColor={C.text3} keyboardType="decimal-pad" value={savedAmount} onChangeText={setSavedAmount} />
              </View>
            </View>
          </View>

          <Text style={{ color: C.text2, fontSize: 11, fontWeight: '700', marginTop: 14, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>Deadline (optional)</Text>
          <TextInput style={{ backgroundColor: C.cardInner, borderColor: C.border, borderRadius: 12, borderWidth: 1, color: C.text1, fontSize: 14, minHeight: 48, paddingHorizontal: 12 }} placeholder="DD/MM/YYYY" placeholderTextColor={C.text3} value={deadline} onChangeText={setDeadline} />

          <TouchableOpacity
            style={{ alignItems: 'center', backgroundColor: GOAL_PRESETS[selectedPreset].color, borderRadius: 14, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 20, minHeight: 54, shadowColor: GOAL_PRESETS[selectedPreset].color, shadowOffset: { height: 8, width: 0 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 6 }}
            onPress={handleAdd}
          >
            <Ionicons name="trophy" size={20} color="#000" />
            <Text style={{ color: '#000', fontSize: 16, fontWeight: '900' }}>Create Goal</Text>
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
          <Text style={{ color: C.text3, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }}>
            {isDeposit ? 'Add Savings' : 'Withdraw Savings'}
          </Text>
          <Text style={{ color: C.text1, fontSize: 22, fontWeight: '900', marginBottom: 20, marginTop: 2 }}>
            {isDeposit ? 'Deposit to Savings' : 'Withdraw from Savings'}
          </Text>

          <Text style={{ color: C.text2, fontSize: 11, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>Amount</Text>
          <View style={{ alignItems: 'center', backgroundColor: C.cardInner, borderColor: `${accentColor}50`, borderRadius: 14, borderWidth: 2, flexDirection: 'row', minHeight: 56, paddingHorizontal: 14, marginBottom: 14 }}>
            <Text style={{ color: accentColor, fontSize: 22, fontWeight: '900', marginRight: 8 }}>₹</Text>
            <TextInput
              style={{ color: C.text1, flex: 1, fontSize: 22, fontWeight: '800' }}
              placeholder="0"
              placeholderTextColor={C.text3}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
              autoFocus
            />
          </View>

          <Text style={{ color: C.text2, fontSize: 11, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>Note (optional)</Text>
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
            <Text style={{ color: '#000', fontSize: 16, fontWeight: '900' }}>
              {isDeposit ? 'Add to Savings' : 'Withdraw'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Category Budget Modal ────────────────────────────────────────────────────
const BUDGET_CATEGORIES = ['Food', 'Travel', 'Shopping', 'Bills', 'Rent', 'Health', 'Entertainment', 'Groceries', 'Education', 'Other'];

function CategoryBudgetModal({ visible, onClose, categoryBudgets, onSave, C }) {
  const [budgets, setBudgets] = useState({ ...categoryBudgets });

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
          <Text style={{ color: C.text3, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }}>Budgets</Text>
          <Text style={{ color: C.text1, fontSize: 22, fontWeight: '900', marginBottom: 4, marginTop: 2 }}>Category Limits</Text>
          <Text style={{ color: C.text2, fontSize: 13, marginBottom: 20 }}>Set monthly limits per category. Leave blank for no limit.</Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            {BUDGET_CATEGORIES.map((cat) => (
              <View key={cat} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <Text style={{ color: C.text1, fontSize: 14, fontWeight: '700', width: 100 }}>{cat}</Text>
                <View style={{ alignItems: 'center', backgroundColor: C.cardInner, borderColor: C.border, borderRadius: 10, borderWidth: 1, flex: 1, flexDirection: 'row', minHeight: 44, paddingHorizontal: 10 }}>
                  <Text style={{ color: C.text3, fontSize: 16, fontWeight: '800', marginRight: 4 }}>₹</Text>
                  <TextInput
                    style={{ color: C.text1, flex: 1, fontSize: 16, fontWeight: '700' }}
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
            <Text style={{ color: C.isDark ? '#000' : '#fff', fontSize: 16, fontWeight: '900' }}>Save Limits</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Interactive Donut Chart ──────────────────────────────────────────────────
function InteractiveDonutChart({ data, total, selectedSegment, onSelectSegment, C }) {
  const CX = 120, R = 82, SW = 32, EXPLODE = 20;
  let startAngle = 0;
  if (!data.length || total <= 0) {
    return <Svg width={240} height={240}><Circle cx={CX} cy={CX} r={R} stroke={C.cardInner} strokeWidth={SW + 4} fill="none" /></Svg>;
  }
  return (
    <Svg width={240} height={240}>
      <Circle cx={CX} cy={CX} r={R} stroke={C.cardInner} strokeWidth={SW + 4} fill="none" />
      {data.map((item, i) => {
        const segAngle = (item.amount / total) * 360;
        const endAngle = startAngle + segAngle;
        const midRad = (((startAngle + segAngle / 2) - 90) * Math.PI) / 180;
        const isSel = selectedSegment === i;
        const dx = isSel ? (Math.cos(midRad) * EXPLODE).toFixed(2) : 0;
        const dy = isSel ? (Math.sin(midRad) * EXPLODE).toFixed(2) : 0;
        const arcPath = describeArc(CX, R, startAngle, Math.min(endAngle, 359.99));
        startAngle = endAngle;
        return (
          <G key={i} transform={`translate(${dx}, ${dy})`}>
            <Path d={arcPath} stroke={item.color} strokeWidth={isSel ? SW + 10 : SW - 2} strokeOpacity={selectedSegment !== null && !isSel ? 0.3 : 1} strokeLinecap="butt" fill="none" onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSelectSegment(isSel ? null : i); }} />
          </G>
        );
      })}
    </Svg>
  );
}

// ─── Credit Balance Card ──────────────────────────────────────────────────────
function CreditBalanceCard({ stats }) {
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
          <Text style={{ color: card.brandText, fontSize: 14, fontWeight: '800', letterSpacing: 0.2 }}>
            Thunder Wallet
          </Text>
        </View>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 5,
          backgroundColor: `${statusColor}18`, borderColor: `${statusColor}40`,
          borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4,
        }}>
          <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: statusColor }} />
          <Text style={{ color: statusColor, fontSize: 10, fontWeight: '800' }}>
            {isHealthy ? 'Healthy' : 'Overspent'}
          </Text>
        </View>
      </View>

      {/* ── Row 2: balance (hero) ── */}
      <View>
        <Text style={{ color: card.labelText, fontSize: 9, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 3 }}>
          Current Balance
        </Text>
        <AnimatedBalance value={stats.balance} color="#FFFFFF" fontSize={36} />
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
          <Text style={{ color: card.subText, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>Income</Text>
          <Text style={{ color: '#34D399', fontSize: 13, fontWeight: '900' }}>{compactCurrency.format(stats.income)}</Text>
        </View>

        {/* separator */}
        <View style={{ width: 1, height: 28, backgroundColor: card.sep, marginHorizontal: 16 }} />

        {/* expenses */}
        <View style={{ flex: 1 }}>
          <Text style={{ color: card.subText, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>Expenses</Text>
          <Text style={{ color: '#F87171', fontSize: 13, fontWeight: '900' }}>{compactCurrency.format(stats.expense)}</Text>
        </View>
      </View>

    </View>
  );
}


// ─── Dashboard Screen ─────────────────────────────────────────────────────────
function DashboardScreen({ wallet }) {
  const { C } = useTheme();
  const { insight, monthlyBudget, stats, adjustMonthlyBudget, openTransactionModal, goals, deleteGoal, openGoalModal, streak, categoryBudgets, openCategoryBudgetModal } = wallet;
  const healthScore = calculateHealthScore(stats, monthlyBudget);
  const scoreColor = healthScore >= 70 ? C.income : healthScore >= 40 ? C.amber : C.expense;
  const scoreLabel = healthScore >= 80 ? 'Excellent' : healthScore >= 60 ? 'Good' : healthScore >= 40 ? 'Fair' : 'Needs Work';
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState(String(monthlyBudget));

  const commitBudget = async () => {
    const val = Number.parseFloat(budgetInput);
    if (Number.isFinite(val) && val > 0) adjustMonthlyBudget(val);
    setEditingBudget(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        <AppHeader streak={streak} />

        {/* Credit Balance Card */}
        <CreditBalanceCard stats={stats} />

        {/* Health Score */}
        <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 16, borderWidth: 1, marginTop: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ alignItems: 'center', justifyContent: 'center', width: 46, height: 46 }}>
            <Svg width={46} height={46}>
              <Circle cx={23} cy={23} r={19} stroke={C.cardInner} strokeWidth={5} fill="none" />
              <Circle cx={23} cy={23} r={19} stroke={scoreColor} strokeWidth={5} fill="none"
                strokeDasharray={`${(healthScore / 100) * 119.4} 119.4`}
                strokeLinecap="round" rotation="-90" origin="23,23" />
            </Svg>
            <Text style={{ position: 'absolute', color: scoreColor, fontSize: 11, fontWeight: '900' }}>{healthScore}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text2, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>Financial Health</Text>
            <Text style={{ color: C.text1, fontSize: 16, fontWeight: '900', marginBottom: 5 }}>{scoreLabel}</Text>
            <View style={{ backgroundColor: C.cardInner, borderRadius: 3, height: 4, overflow: 'hidden' }}>
              <View style={{ borderRadius: 3, height: 4, width: `${healthScore}%`, backgroundColor: scoreColor }} />
            </View>
          </View>
          <Ionicons name="shield-checkmark" size={18} color={scoreColor} style={{ opacity: 0.8 }} />
        </View>

        {/* Streak Banner */}
        {streak >= 1 && (
          <View style={{ backgroundColor: streak >= 7 ? 'rgba(251,146,60,0.1)' : C.accentBg, borderColor: streak >= 7 ? '#FB923C' : C.accentBorder, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, padding: 14 }}>
            <Text style={{ fontSize: 28 }}>{streak >= 14 ? '🔥' : streak >= 7 ? '⚡' : '✨'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text1, fontSize: 14, fontWeight: '900' }}>
                {streak >= 14 ? 'On fire!' : streak >= 7 ? 'Great streak!' : 'Streak going!'} {streak} day{streak > 1 ? 's' : ''} under budget
              </Text>
              <Text style={{ color: C.text2, fontSize: 12, marginTop: 2 }}>
                {streak >= 14 ? 'Incredible discipline. Keep it up!' : streak >= 7 ? 'One week of smart spending!' : 'Each day counts — keep going!'}
              </Text>
            </View>
          </View>
        )}

        {/* Quick Actions */}
        <View style={{ flexDirection: 'row', gap: 10, marginVertical: 12 }}>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.incomeBg, borderColor: `${C.income}30`, borderRadius: 14, borderWidth: 1, paddingVertical: 14 }}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); openTransactionModal('income'); }}
          >
            <Ionicons name="add-circle" size={18} color={C.income} />
            <Text style={{ color: C.income, fontSize: 13, fontWeight: '900' }}>Income</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.expenseBg, borderColor: `${C.expense}30`, borderRadius: 14, borderWidth: 1, paddingVertical: 14 }}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); openTransactionModal('expense'); }}
          >
            <Ionicons name="remove-circle" size={18} color={C.expense} />
            <Text style={{ color: C.expense, fontSize: 13, fontWeight: '900' }}>Expense</Text>
          </TouchableOpacity>
        </View>

        {/* This Month Stats */}
        <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 18, borderWidth: 1, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <View>
              <Text style={{ color: C.text3, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }}>This Month</Text>
              <Text style={{ color: C.text1, fontSize: 22, fontWeight: '900', marginTop: 2 }}>Money Pulse</Text>
            </View>
            <View style={{ alignItems: 'center', backgroundColor: C.blueBg, borderRadius: 20, height: 42, justifyContent: 'center', width: 42 }}>
              <Ionicons name="analytics" size={20} color={C.blue} />
            </View>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {[
              { icon: 'arrow-down-circle', color: C.income, label: 'Month In', value: compactCurrency.format(stats.monthIncome) },
              { icon: 'arrow-up-circle', color: C.expense, label: 'Month Out', value: compactCurrency.format(stats.monthExpense), dim: true },
              { icon: 'time', color: C.blue, label: 'Daily Avg', value: compactCurrency.format(stats.dailyAverageExpense) },
              { icon: 'trending-up', color: stats.savingsRate >= 0 ? C.income : C.expense, label: 'Savings Rate', value: `${Math.round(stats.savingsRate)}%`, dim: stats.savingsRate < 0 },
            ].map((tile) => (
              <View key={tile.label} style={{ backgroundColor: C.cardInner, borderColor: C.border, borderRadius: 14, borderWidth: 1, flexBasis: '47%', flexGrow: 1, minHeight: 88, padding: 12 }}>
                <View style={{ alignItems: 'center', backgroundColor: `${tile.color}18`, borderRadius: 10, height: 30, justifyContent: 'center', marginBottom: 8, width: 30 }}>
                  <Ionicons name={tile.icon} size={15} color={tile.color} />
                </View>
                <Text style={{ color: C.text2, fontSize: 10, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>{tile.label}</Text>
                <Text style={{ color: tile.dim ? C.expense : C.text1, fontSize: 20, fontWeight: '900' }}>{tile.value}</Text>
              </View>
            ))}
          </View>

          {/* Budget — tap to edit */}
          <View style={{ backgroundColor: C.cardInner, borderColor: C.border, borderRadius: 14, borderWidth: 1, marginTop: 14, padding: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text3, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>Monthly Budget</Text>
                {editingBudget ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <Text style={{ color: C.accent, fontSize: 22, fontWeight: '900' }}>₹</Text>
                    <TextInput
                      style={{ color: C.text1, fontSize: 22, fontWeight: '900', flex: 1 }}
                      value={budgetInput}
                      onChangeText={setBudgetInput}
                      keyboardType="number-pad"
                      autoFocus
                      onBlur={commitBudget}
                      onSubmitEditing={commitBudget}
                    />
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => { setBudgetInput(String(monthlyBudget)); setEditingBudget(true); }}>
                    <Text style={{ color: C.text1, fontSize: 22, fontWeight: '900', marginTop: 2 }}>{currency.format(monthlyBudget)}</Text>
                    <Text style={{ color: C.text3, fontSize: 10, marginTop: 2 }}>Tap to edit</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                style={{ alignItems: 'center', backgroundColor: C.accentBg, borderColor: C.accentBorder, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingVertical: 7 }}
                onPress={openCategoryBudgetModal}
              >
                <Ionicons name="options" size={14} color={C.accent} />
                <Text style={{ color: C.accent, fontSize: 11, fontWeight: '800' }}>By Category</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ color: stats.remainingBudget >= 0 ? C.income : C.expense, fontSize: 13, fontWeight: '800', marginTop: 10 }}>
              {stats.remainingBudget >= 0 ? `${currency.format(stats.remainingBudget)} remaining` : `${currency.format(Math.abs(stats.remainingBudget))} over budget`}
            </Text>
            <View style={{ backgroundColor: C.card, borderRadius: 6, height: 8, marginTop: 8, overflow: 'hidden' }}>
              <View style={{ backgroundColor: stats.remainingBudget < 0 ? C.expense : C.accent, borderRadius: 6, height: 8, opacity: 0.6, width: `${stats.budgetUsedPercent}%` }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderColor: C.border, borderRadius: 12, borderWidth: 1, marginTop: 12, padding: 12 }}>
              <View style={{ alignItems: 'center', backgroundColor: C.accentBg, borderRadius: 18, height: 34, justifyContent: 'center', width: 34 }}>
                <Ionicons name={insight.icon} size={15} color={C.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text1, fontSize: 13, fontWeight: '800' }}>{insight.title}</Text>
                <Text style={{ color: C.text2, fontSize: 12, lineHeight: 17, marginTop: 2 }}>{insight.body}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Category Budget Progress */}
        {Object.keys(categoryBudgets).length > 0 && (
          <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16 }}>
            <Text style={{ color: C.text1, fontSize: 16, fontWeight: '900', marginBottom: 14 }}>Category Limits</Text>
            {Object.entries(categoryBudgets).filter(([, limit]) => limit > 0).map(([cat, limit]) => {
              const spent = stats.categorySpend?.[cat] || 0;
              const pct = Math.min((spent / limit) * 100, 100);
              const over = spent > limit;
              return (
                <View key={cat} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: C.text1, fontSize: 13, fontWeight: '700' }}>{cat}</Text>
                    <Text style={{ color: over ? C.expense : C.text2, fontSize: 12, fontWeight: '800' }}>
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
              <Text style={{ color: C.text3, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }}>Savings</Text>
              <Text style={{ color: C.text1, fontSize: 22, fontWeight: '900', marginTop: 2 }}>Goals</Text>
            </View>
            <TouchableOpacity style={{ alignItems: 'center', backgroundColor: C.accentBg, borderColor: C.accentBorder, borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 10 }} onPress={openGoalModal}>
              <Ionicons name="add" size={16} color={C.accent} />
              <Text style={{ color: C.accent, fontSize: 13, fontWeight: '800' }}>New Goal</Text>
            </TouchableOpacity>
          </View>
          {goals.length === 0 ? (
            <TouchableOpacity style={{ alignItems: 'center', backgroundColor: C.card, borderColor: C.border, borderRadius: 16, borderStyle: 'dashed', borderWidth: 1.5, padding: 28 }} onPress={openGoalModal}>
              <View style={{ alignItems: 'center', backgroundColor: C.cardInner, borderRadius: 24, height: 56, justifyContent: 'center', marginBottom: 12, width: 56 }}>
                <Ionicons name="trophy-outline" size={26} color={C.text3} />
              </View>
              <Text style={{ color: C.text1, fontSize: 15, fontWeight: '800' }}>Set your first goal</Text>
              <Text style={{ color: C.text2, fontSize: 13, marginTop: 4, textAlign: 'center' }}>Saving for a phone, trip, or dream? Track it here.</Text>
            </TouchableOpacity>
          ) : (
            <>
              {goals.map((g) => <GoalCard key={g.id} goal={g} onDelete={wallet.deleteGoal} C={C} />)}
              <TouchableOpacity style={{ alignItems: 'center', backgroundColor: C.card, borderColor: C.border, borderRadius: 12, borderStyle: 'dashed', borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', paddingVertical: 14 }} onPress={openGoalModal}>
                <Ionicons name="add-circle-outline" size={18} color={C.text3} />
                <Text style={{ color: C.text3, fontSize: 13, fontWeight: '700' }}>Add another goal</Text>
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
                  <Text style={{ color: C.text3, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }}>Piggy Bank</Text>
                  <Text style={{ color: C.text1, fontSize: 22, fontWeight: '900', marginTop: 2 }}>Savings</Text>
                </View>
                {/* action buttons */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={{ alignItems: 'center', backgroundColor: 'rgba(248,113,113,0.12)', borderColor: 'rgba(248,113,113,0.3)', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 12, paddingVertical: 8 }}
                    onPress={() => openSavingsModal('withdrawal')}
                  >
                    <Ionicons name="arrow-up" size={13} color="#F87171" />
                    <Text style={{ color: '#F87171', fontSize: 12, fontWeight: '800' }}>Withdraw</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ alignItems: 'center', backgroundColor: 'rgba(52,211,153,0.12)', borderColor: 'rgba(52,211,153,0.3)', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 12, paddingVertical: 8 }}
                    onPress={() => openSavingsModal('deposit')}
                  >
                    <Ionicons name="arrow-down" size={13} color="#34D399" />
                    <Text style={{ color: '#34D399', fontSize: 12, fontWeight: '800' }}>Deposit</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Balance card */}
              <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ color: C.text3, fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Total Saved</Text>
                    <Text style={{ color: total >= 0 ? '#34D399' : '#F87171', fontSize: 30, fontWeight: '900' }}>
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
                      <Text style={{ color: C.text3, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>Deposited</Text>
                      <Text style={{ color: '#34D399', fontSize: 15, fontWeight: '900', marginTop: 2 }}>
                        {compactCurrency.format(savings.filter((e) => e.type === 'deposit').reduce((s, e) => s + e.amount, 0))}
                      </Text>
                    </View>
                    <View style={{ width: 1, backgroundColor: C.border }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text3, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>Withdrawn</Text>
                      <Text style={{ color: '#F87171', fontSize: 15, fontWeight: '900', marginTop: 2 }}>
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
                      <Text style={{ color: C.text1, fontSize: 13, fontWeight: '800' }}>{entry.note || (entry.type === 'deposit' ? 'Deposit' : 'Withdrawal')}</Text>
                      <Text style={{ color: C.text3, fontSize: 11, marginTop: 2 }}>{new Date(entry.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                    </View>
                    <Text style={{ color: entry.type === 'deposit' ? '#34D399' : '#F87171', fontSize: 14, fontWeight: '900' }}>
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
                  <Text style={{ color: C.text1, fontSize: 15, fontWeight: '800' }}>Start saving today</Text>
                  <Text style={{ color: C.text2, fontSize: 13, marginTop: 4 }}>Tap to make your first deposit.</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })()}

        {/* Forecast row */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          {[
            { icon: 'calendar', color: C.blue, label: 'Days Left', value: stats.daysLeft },
            { icon: 'speedometer', color: stats.projectedExpense > monthlyBudget ? C.expense : C.amber, label: 'Projected', value: compactCurrency.format(stats.projectedExpense), danger: stats.projectedExpense > monthlyBudget },
            { icon: 'wallet', color: C.purple, label: 'This Week', value: compactCurrency.format(stats.weekSpend) },
          ].map((t) => (
            <View key={t.label} style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 14, borderWidth: 1, flex: 1, minHeight: 90, padding: 12 }}>
              <View style={{ alignItems: 'center', backgroundColor: `${t.color}18`, borderRadius: 10, height: 28, justifyContent: 'center', marginBottom: 8, width: 28 }}>
                <Ionicons name={t.icon} size={14} color={t.color} />
              </View>
              <Text style={{ color: C.text2, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 }}>{t.label}</Text>
              <Text style={{ color: t.danger ? C.expense : C.text1, fontSize: 17, fontWeight: '900', marginTop: 3 }}>{t.value}</Text>
            </View>
          ))}
        </View>
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

  const pieData = stats.topCategories.map((item, i) => ({ ...item, color: CHART_COLORS[i % CHART_COLORS.length] }));
  const hasPieData = pieData.length > 0;
  const smartInsights = useMemo(() => generateSmartInsights(transactions), [transactions]);

  const monthlyBreakdown = useMemo(() => {
    const groups = {};
    transactions.forEach((t) => {
      if (t.amount < 0) {
        const d = new Date(t.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
        if (!groups[key]) groups[key] = { key, label, total: 0 };
        groups[key].total += Math.abs(t.amount);
      }
    });
    return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key)).slice(0, 6);
  }, [transactions]);

  const maxMonthSpend = Math.max(...monthlyBreakdown.map((m) => m.total), 1);

  const simSavings = useMemo(() => {
    if (!simulateMode) return null;
    let saved = 0;
    pieData.forEach((item) => {
      const override = simOverrides[item.category];
      if (override !== undefined) saved += Math.max(item.amount - override, 0);
    });
    return saved;
  }, [simulateMode, simOverrides, pieData]);

  // ── Month vs Last Month ─────────────────────────────────────────────────────
  const monthComparison = useMemo(() => {
    const now = new Date();
    const curM = now.getMonth(), curY = now.getFullYear();
    const prevM = curM === 0 ? 11 : curM - 1;
    const prevY = curM === 0 ? curY - 1 : curY;
    let curIncome = 0, curExpense = 0, prevIncome = 0, prevExpense = 0;
    transactions.forEach((t) => {
      const d = new Date(t.date);
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

  // ── Spending by Day of Week ─────────────────────────────────────────────────
  const dowData = useMemo(() => {
    const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const totals = Array(7).fill(0);
    transactions.forEach((t) => {
      if (t.amount < 0) totals[new Date(t.date).getDay()] += Math.abs(t.amount);
    });
    const maxVal = Math.max(...totals, 1);
    const peakIdx = totals.indexOf(Math.max(...totals));
    return DAY_SHORT.map((label, i) => ({ label, total: totals[i], pct: totals[i] / maxVal, isPeak: i === peakIdx }));
  }, [transactions]);

  // ── Top 5 largest expenses this month ──────────────────────────────────────
  const topExpenses = useMemo(() => {
    const now = new Date();
    const curM = now.getMonth(), curY = now.getFullYear();
    return transactions
      .filter((t) => { const d = new Date(t.date); return t.amount < 0 && d.getMonth() === curM && d.getFullYear() === curY; })
      .sort((a, b) => a.amount - b.amount)
      .slice(0, 5);
  }, [transactions]);

  // ── Category budget adherence ───────────────────────────────────────────────
  const catBudgetRows = useMemo(() => {
    if (!categoryBudgets || !Object.keys(categoryBudgets).length) return [];
    return Object.entries(categoryBudgets)
      .map(([cat, budget]) => ({ cat, budget, spent: stats.categorySpend[cat] || 0 }))
      .filter((r) => r.budget > 0)
      .sort((a, b) => b.spent / b.budget - a.spent / a.budget);
  }, [categoryBudgets, stats.categorySpend]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <View>
            <Text style={{ color: C.text3, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }}>Analytics</Text>
            <Text style={{ color: C.text1, fontSize: 28, fontWeight: '900', marginTop: 2 }}>Spending Map</Text>
          </View>
          <View style={{ alignItems: 'center', backgroundColor: C.purpleBg, borderRadius: 20, height: 42, justifyContent: 'center', width: 42 }}>
            <Ionicons name="pie-chart" size={20} color={C.purple} />
          </View>
        </View>

        {/* ── Quick Stats Row ── */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {[
            { icon: 'receipt', color: C.blue, bg: C.blueBg, label: 'Transactions', value: stats.count },
            { icon: 'trending-down', color: C.expense, bg: C.expenseBg, label: 'Avg / Day', value: compactCurrency.format(stats.dailyAverageExpense) },
            { icon: 'flame', color: C.amber, bg: C.amberBg, label: 'Top Category', value: stats.topCategory?.category || '—' },
          ].map((s) => (
            <View key={s.label} style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 14, borderWidth: 1, flex: 1, padding: 12 }}>
              <View style={{ alignItems: 'center', backgroundColor: s.bg, borderRadius: 9, height: 28, justifyContent: 'center', marginBottom: 8, width: 28 }}>
                <Ionicons name={s.icon} size={14} color={s.color} />
              </View>
              <Text style={{ color: C.text3, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 }}>{s.label}</Text>
              <Text style={{ color: C.text1, fontSize: 15, fontWeight: '900', marginTop: 3 }} numberOfLines={1}>{s.value}</Text>
            </View>
          ))}
        </View>

        {/* Donut */}
        <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 22, borderWidth: 1, padding: 20 }}>
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <InteractiveDonutChart data={pieData} total={stats.expense} selectedSegment={selectedSegment} onSelectSegment={setSelectedSegment} C={C} />
            {selectedSegment === null && (
              <View style={{ position: 'absolute', alignItems: 'center' }}>
                <Text style={{ color: C.text3, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Spent</Text>
                <Text style={{ color: C.text1, fontSize: 20, fontWeight: '900', marginTop: 2 }}>{compactCurrency.format(stats.expense)}</Text>
                {hasPieData && <Text style={{ color: C.text3, fontSize: 10, marginTop: 5 }}>Tap a slice</Text>}
              </View>
            )}
          </View>

          {selectedSegment !== null && pieData[selectedSegment] && (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.cardInner, borderColor: `${pieData[selectedSegment].color}45`, borderLeftColor: pieData[selectedSegment].color, borderLeftWidth: 3, borderRadius: 14, borderWidth: 1, marginTop: 4, padding: 16 }}>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: pieData[selectedSegment].color, marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text1, fontSize: 16, fontWeight: '900' }}>{pieData[selectedSegment].category}</Text>
                <Text style={{ color: C.text2, fontSize: 12, marginTop: 3 }}>{Math.round(pieData[selectedSegment].percentage)}% of total spending</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: pieData[selectedSegment].color, fontSize: 18, fontWeight: '900' }}>{currency.format(pieData[selectedSegment].amount)}</Text>
                <TouchableOpacity onPress={() => setSelectedSegment(null)} style={{ marginTop: 4 }}>
                  <Text style={{ color: C.text3, fontSize: 11 }}>✕ close</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {hasPieData ? (
            <View style={{ gap: 10, marginTop: 16 }}>
              {pieData.map((item, i) => (
                <TouchableOpacity key={item.category} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 }} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedSegment(selectedSegment === i ? null : i); }}>
                  <View style={{ borderRadius: 5, height: 10, width: 10, backgroundColor: item.color, opacity: selectedSegment === i ? 1 : 0.7 }} />
                  <Text style={{ color: selectedSegment === i ? C.text1 : C.text2, flex: 1, fontSize: 14, fontWeight: selectedSegment === i ? '800' : '600' }} numberOfLines={1}>{item.category}</Text>
                  <Text style={{ color: C.text2, fontSize: 12, fontWeight: '600', minWidth: 32, textAlign: 'right' }}>{Math.round(item.percentage)}%</Text>
                  <Text style={{ color: item.color, fontSize: 13, fontWeight: '800', minWidth: 52, textAlign: 'right' }}>{compactCurrency.format(item.amount)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 28 }}>
              <Ionicons name="pie-chart-outline" size={36} color={C.text3} />
              <Text style={{ color: C.text2, fontSize: 14, marginTop: 10, textAlign: 'center' }}>Add expenses to see your spending chart.</Text>
            </View>
          )}
        </View>

        {/* What-If Projector */}
        {hasPieData && (
          <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: simulateMode ? 14 : 0 }}>
              <View>
                <Text style={{ color: C.text3, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }}>Simulator</Text>
                <Text style={{ color: C.text1, fontSize: 16, fontWeight: '900', marginTop: 2 }}>What If…</Text>
              </View>
              <TouchableOpacity
                style={{ backgroundColor: simulateMode ? C.accentBg : C.cardInner, borderColor: simulateMode ? C.accentBorder : C.border, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 }}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSimulateMode((v) => !v); setSimOverrides({}); }}
              >
                <Text style={{ color: simulateMode ? C.accent : C.text2, fontSize: 12, fontWeight: '800' }}>{simulateMode ? 'Reset' : 'Simulate'}</Text>
              </TouchableOpacity>
            </View>
            {simulateMode && (
              <>
                <Text style={{ color: C.text2, fontSize: 13, marginBottom: 16 }}>Drag each category to see how much you'd save.</Text>
                {pieData.map((item) => {
                  const override = simOverrides[item.category] ?? item.amount;
                  const diff = item.amount - override;
                  return (
                    <View key={item.category} style={{ marginBottom: 14 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ color: C.text1, fontSize: 13, fontWeight: '700' }}>{item.category}</Text>
                        <Text style={{ color: diff > 0 ? C.income : C.text2, fontSize: 12, fontWeight: '800' }}>
                          {compactCurrency.format(override)} {diff > 0 ? `(save ${compactCurrency.format(diff)})` : ''}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity onPress={() => setSimOverrides((o) => ({ ...o, [item.category]: Math.max((o[item.category] ?? item.amount) - 500, 0) }))}>
                          <Ionicons name="remove-circle" size={24} color={C.expense} />
                        </TouchableOpacity>
                        <View style={{ flex: 1, backgroundColor: C.cardInner, borderRadius: 4, height: 6, overflow: 'hidden' }}>
                          <View style={{ backgroundColor: item.color, borderRadius: 4, height: 6, width: `${Math.min((override / item.amount) * 100, 100)}%` }} />
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
                    <Text style={{ color: C.income, fontSize: 16, fontWeight: '900' }}>Save {currency.format(simSavings)}/month</Text>
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
                <Text style={{ fontSize: 16 }}>🧠</Text>
              </View>
              <View>
                <Text style={{ color: C.text3, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }}>Patterns</Text>
                <Text style={{ color: C.text1, fontSize: 16, fontWeight: '900' }}>Smart Insights</Text>
              </View>
            </View>
            {smartInsights.map((ins, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderTopColor: C.border, borderTopWidth: i > 0 ? 1 : 0 }}>
                <View style={{ alignItems: 'center', backgroundColor: `${ins.color}18`, borderRadius: 10, height: 34, justifyContent: 'center', width: 34, marginTop: 1 }}>
                  <Ionicons name={ins.icon} size={16} color={ins.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text1, fontSize: 13, fontWeight: '800' }}>{ins.title}</Text>
                  <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18, marginTop: 3 }}>{ins.body}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Income vs Expense */}
        <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16 }}>
          <Text style={{ color: C.text1, fontSize: 17, fontWeight: '900', marginBottom: 14 }}>Income vs Expense</Text>
          {[{ label: 'Income', amount: stats.monthIncome, color: C.income }, { label: 'Expense', amount: stats.monthExpense, color: C.expense }].map((bar) => {
            const max = Math.max(stats.monthIncome, stats.monthExpense, 1);
            return (
              <View key={bar.label} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ color: C.text2, fontSize: 13, fontWeight: '700' }}>{bar.label}</Text>
                  <Text style={{ color: C.text1, fontSize: 13, fontWeight: '800' }}>{compactCurrency.format(bar.amount)}</Text>
                </View>
                <View style={{ backgroundColor: C.cardInner, borderRadius: 6, height: 10, overflow: 'hidden' }}>
                  <View style={{ backgroundColor: bar.color, borderRadius: 6, height: 10, width: `${Math.max((bar.amount / max) * 100, bar.amount ? 4 : 0)}%` }} />
                </View>
              </View>
            );
          })}
        </View>

        {/* ── Month vs Last Month ── */}
        {monthComparison.hasPrevData && (
          <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <View style={{ alignItems: 'center', backgroundColor: C.blueBg, borderRadius: 10, height: 32, justifyContent: 'center', width: 32 }}>
                <Ionicons name="swap-horizontal" size={16} color={C.blue} />
              </View>
              <View>
                <Text style={{ color: C.text3, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }}>Comparison</Text>
                <Text style={{ color: C.text1, fontSize: 16, fontWeight: '900' }}>{monthComparison.curMonthLabel} vs {monthComparison.prevMonthLabel}</Text>
              </View>
            </View>
            {/* Column headers */}
            <View style={{ flexDirection: 'row', marginBottom: 10 }}>
              <View style={{ flex: 1 }} />
              <Text style={{ color: C.text3, fontSize: 11, fontWeight: '700', width: 74, textAlign: 'right' }}>{monthComparison.prevMonthLabel}</Text>
              <Text style={{ color: C.text3, fontSize: 11, fontWeight: '700', width: 74, textAlign: 'right' }}>{monthComparison.curMonthLabel}</Text>
              <Text style={{ color: C.text3, fontSize: 11, fontWeight: '700', width: 48, textAlign: 'right' }}>Δ</Text>
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
                    <Text style={{ color: C.text2, fontSize: 13, fontWeight: '600' }}>{row.label}</Text>
                  </View>
                  <Text style={{ color: C.text3, fontSize: 13, fontWeight: '600', width: 74, textAlign: 'right' }}>{compactCurrency.format(Math.abs(row.prev))}</Text>
                  <Text style={{ color: row.color, fontSize: 13, fontWeight: '800', width: 74, textAlign: 'right' }}>{compactCurrency.format(Math.abs(row.cur))}</Text>
                  <Text style={{ color: changeColor, fontSize: 12, fontWeight: '800', width: 48, textAlign: 'right' }}>
                    {row.change === null ? '—' : `${changePrefix}${row.change}%`}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Spending by Day of Week ── */}
        {transactions.some((t) => t.amount < 0) && (
          <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <View style={{ alignItems: 'center', backgroundColor: C.purpleBg, borderRadius: 10, height: 32, justifyContent: 'center', width: 32 }}>
                <Ionicons name="calendar" size={15} color={C.purple} />
              </View>
              <View>
                <Text style={{ color: C.text3, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }}>Patterns</Text>
                <Text style={{ color: C.text1, fontSize: 16, fontWeight: '900' }}>Spending by Weekday</Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: 6, height: 90 }}>
              {dowData.map((day) => (
                <View key={day.label} style={{ alignItems: 'center', flex: 1 }}>
                  <View style={{ backgroundColor: C.cardInner, borderRadius: 6, flex: 1, justifyContent: 'flex-end', overflow: 'hidden', width: '100%' }}>
                    <View style={{
                      backgroundColor: day.isPeak ? C.purple : C.accent,
                      borderRadius: 6,
                      height: `${Math.max(day.pct * 100, day.total ? 8 : 2)}%`,
                      opacity: day.total ? (day.isPeak ? 1 : 0.5) : 0.15,
                      width: '100%',
                    }} />
                  </View>
                  <Text style={{ color: day.isPeak ? C.purple : C.text3, fontSize: 10, fontWeight: day.isPeak ? '900' : '600', marginTop: 6 }}>{day.label}</Text>
                </View>
              ))}
            </View>
            <View style={{ alignItems: 'center', backgroundColor: C.purpleBg, borderColor: `${C.purple}30`, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 8, marginTop: 14, padding: 10 }}>
              <Ionicons name="alert-circle" size={14} color={C.purple} />
              <Text style={{ color: C.purple, fontSize: 12, fontWeight: '700', flex: 1 }}>
                {dowData.find((d) => d.isPeak)?.label}s are your highest-spend day
              </Text>
            </View>
          </View>
        )}

        {/* ── Top 5 Largest Expenses This Month ── */}
        {topExpenses.length > 0 && (
          <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <View style={{ alignItems: 'center', backgroundColor: C.expenseBg, borderRadius: 10, height: 32, justifyContent: 'center', width: 32 }}>
                <Ionicons name="arrow-up-circle" size={16} color={C.expense} />
              </View>
              <View>
                <Text style={{ color: C.text3, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }}>This Month</Text>
                <Text style={{ color: C.text1, fontSize: 16, fontWeight: '900' }}>Biggest Expenses</Text>
              </View>
            </View>
            {topExpenses.map((t, i) => (
              <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopColor: C.border, borderTopWidth: i === 0 ? 0 : 1 }}>
                <View style={{ alignItems: 'center', backgroundColor: C.cardInner, borderRadius: 10, height: 34, justifyContent: 'center', width: 34 }}>
                  <Text style={{ color: C.text3, fontSize: 13, fontWeight: '800' }}>#{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text1, fontSize: 13, fontWeight: '800' }} numberOfLines={1}>{t.note || t.category}</Text>
                  <Text style={{ color: C.text3, fontSize: 11, marginTop: 1 }}>{t.category} · {new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
                </View>
                <Text style={{ color: C.expense, fontSize: 14, fontWeight: '900' }}>{currency.format(Math.abs(t.amount))}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Category Budget Adherence ── */}
        {catBudgetRows.length > 0 && (
          <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <View style={{ alignItems: 'center', backgroundColor: C.amberBg, borderRadius: 10, height: 32, justifyContent: 'center', width: 32 }}>
                <Ionicons name="options" size={15} color={C.amber} />
              </View>
              <View>
                <Text style={{ color: C.text3, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }}>This Month</Text>
                <Text style={{ color: C.text1, fontSize: 16, fontWeight: '900' }}>Budget vs Actual</Text>
              </View>
            </View>
            {catBudgetRows.map((row, i) => {
              const pct = Math.min((row.spent / row.budget) * 100, 100);
              const over = row.spent > row.budget;
              const barColor = over ? C.expense : pct > 80 ? C.amber : C.income;
              return (
                <View key={row.cat} style={{ paddingVertical: 10, borderTopColor: C.border, borderTopWidth: i === 0 ? 0 : 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ color: C.text1, fontSize: 13, fontWeight: '700' }}>{row.cat}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {over && (
                        <View style={{ backgroundColor: C.expenseBg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ color: C.expense, fontSize: 10, fontWeight: '800' }}>OVER</Text>
                        </View>
                      )}
                      <Text style={{ color: barColor, fontSize: 13, fontWeight: '800' }}>{compactCurrency.format(row.spent)}</Text>
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

        {/* Monthly History */}
        {monthlyBreakdown.length > 1 && (
          <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16 }}>
            <Text style={{ color: C.text1, fontSize: 17, fontWeight: '900', marginBottom: 14 }}>Monthly History</Text>
            {monthlyBreakdown.map((m) => (
              <View key={m.key} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ color: C.text2, fontSize: 13, fontWeight: '700' }}>{m.label}</Text>
                  <Text style={{ color: C.text1, fontSize: 13, fontWeight: '800' }}>{compactCurrency.format(m.total)}</Text>
                </View>
                <View style={{ backgroundColor: C.cardInner, borderRadius: 6, height: 8, overflow: 'hidden' }}>
                  <View style={{ backgroundColor: C.blue, borderRadius: 6, height: 8, width: `${Math.max((m.total / maxMonthSpend) * 100, 3)}%` }} />
                </View>
              </View>
            ))}
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
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <View>
            <Text style={{ color: C.text3, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }}>Activity</Text>
            <Text style={{ color: C.text1, fontSize: 28, fontWeight: '900', marginTop: 2 }}>All Entries</Text>
          </View>
          <View style={{ alignItems: 'center', backgroundColor: C.amberBg, borderRadius: 20, height: 42, justifyContent: 'center', width: 42 }}>
            <Ionicons name="receipt" size={20} color={C.amber} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: C.expenseBg, borderColor: `${C.expense}35`, borderRadius: 14, borderWidth: 1, minHeight: 52 }} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); openTransactionModal('expense'); }}>
            <Ionicons name="remove-circle" size={20} color={C.expense} />
            <Text style={{ color: C.expense, fontSize: 14, fontWeight: '900' }}>Expense</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: C.incomeBg, borderColor: `${C.income}35`, borderRadius: 14, borderWidth: 1, minHeight: 52 }} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); openTransactionModal('income'); }}>
            <Ionicons name="add-circle" size={20} color={C.income} />
            <Text style={{ color: C.income, fontSize: 14, fontWeight: '900' }}>Income</Text>
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

// ─── Main App ─────────────────────────────────────────────────────────────────
function MainApp() {
  const { C } = useTheme();
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

  useEffect(() => {
    const load = async () => {
      try {
        const [savedTx, savedBudget, savedGoals, savedCatBudgets, savedBills, savedSavings] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(BUDGET_KEY),
          AsyncStorage.getItem(GOALS_KEY),
          AsyncStorage.getItem(CAT_BUDGETS_KEY),
          AsyncStorage.getItem(BILLS_KEY),
          AsyncStorage.getItem(SAVINGS_KEY),
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
      } catch { Alert.alert('Load error', 'Could not load wallet data. Please restart the app.'); }
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

  const deleteBill = async (id) => {
    await persistBills(bills.filter((b) => b.id !== id));
  };

  const markBillPaid = async (bill) => {
    const now = new Date();
    const mk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const txId = `bill_${bill.id}_${mk}`;

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

    // Mark bill as paid this month
    const nextBills = bills.map((b) =>
      b.id === bill.id
        ? { ...b, paidMonths: { ...b.paidMonths, [mk]: { paidAt: now.toISOString(), txId } } }
        : b
    );
    await persistBills(nextBills);
  };

  const markBillUnpaid = async (bill) => {
    const now = new Date();
    const mk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const txId = bill.paidMonths?.[mk]?.txId;

    // Remove the auto-created transaction if it exists
    if (txId) {
      await persistTransactions(transactions.filter((t) => t.id !== txId));
    }

    // Remove this month from paidMonths
    const nextBills = bills.map((b) => {
      if (b.id !== bill.id) return b;
      const { [mk]: _removed, ...rest } = b.paidMonths || {};
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

  // Check if any goal just hit completion
  useEffect(() => {
    goals.forEach((g) => {
      if (g.savedAmount >= g.target && !g.celebratedAt) {
        setConfettiGoal(g);
        persistGoals(goals.map((goal) => goal.id === g.id ? { ...goal, celebratedAt: new Date().toISOString() } : goal));
      }
    });
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
      ]);
      setTransactions([]);
      setMonthlyBudget(DEFAULT_MONTHLY_BUDGET);
      setGoals([]);
      setCategoryBudgets({});
      setBills([]);
      setSavings([]);
    } catch { Alert.alert('Reset error', 'Could not reset data.'); }
  };

  const wallet = {
    activeFilter, adjustMonthlyBudget, clearTransactions, deleteTransaction, editTransaction,
    deleteGoal, goals, insight, monthlyBudget, openTransactionModal, openGoalModal,
    openCategoryBudgetModal, categoryBudgets, searchQuery, setActiveFilter, setSearchQuery,
    stats, streak, transactions,
    bills, addBill, deleteBill, markBillPaid, markBillUnpaid,
    savings, openSavingsModal,
  };

  return (
    <View style={{ backgroundColor: C.bg, flex: 1 }}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: C.accent,
          tabBarInactiveTintColor: C.text3,
          tabBarLabelStyle: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
          tabBarStyle: { backgroundColor: C.tab, borderTopColor: C.tabBorder, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, elevation: 14, height: 76, paddingBottom: 12, paddingTop: 8, shadowColor: '#000', shadowOffset: { height: -6, width: 0 }, shadowOpacity: 0.25, shadowRadius: 18 },
          tabBarIcon: ({ color, focused }) => {
            const icons = { Dashboard: focused ? 'home' : 'home-outline', Analytics: focused ? 'pie-chart' : 'pie-chart-outline', Activity: focused ? 'receipt' : 'receipt-outline', Bills: focused ? 'card' : 'card-outline', Settings: focused ? 'settings' : 'settings-outline' };
            return (
              <View style={{ alignItems: 'center', backgroundColor: focused ? C.accentBg : 'transparent', borderRadius: 18, height: 34, justifyContent: 'center', width: 44 }}>
                <Ionicons name={icons[route.name]} size={21} color={color} />
              </View>
            );
          },
        })}
      >
        <Tab.Screen name="Dashboard">{() => <DashboardScreen wallet={wallet} />}</Tab.Screen>
        <Tab.Screen name="Analytics">{() => <AnalyticsScreen wallet={wallet} />}</Tab.Screen>
        <Tab.Screen name="Activity">{() => <ActivityScreen wallet={wallet} />}</Tab.Screen>
        <Tab.Screen name="Bills">{() => (
          <BillsScreen
            bills={wallet.bills}
            onAddBill={wallet.addBill}
            onDeleteBill={wallet.deleteBill}
            onMarkPaid={wallet.markBillPaid}
            onMarkUnpaid={wallet.markBillUnpaid}
          />
        )}</Tab.Screen>
        <Tab.Screen name="Settings">{() => <SettingsScreen resetAllData={resetAllData} />}</Tab.Screen>
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
      expCats[t.category] = (expCats[t.category] || 0) + abs;
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
  if (!stats.count) return 0;
  let score = 0;

  // Savings rate: up to 40 pts (0% saves = 0, 40%+ saves = 40)
  score += Math.min(Math.max(stats.savingsRate, 0) * 1.0, 40);

  // Budget adherence: up to 30 pts
  if (stats.budgetUsedPercent <= 80) score += 30;
  else if (stats.budgetUsedPercent <= 100) score += Math.max(0, 30 - (stats.budgetUsedPercent - 80) * 1.5);

  // Positive balance: 20 pts
  if (stats.balance > 0) score += 20;

  // Has logged income: 10 pts
  if (stats.monthIncome > 0) score += 10;

  return Math.min(100, Math.max(0, Math.round(score)));
}

export default MainApp;
