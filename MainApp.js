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
import * as FileSystem from 'expo-file-system';
import SettingsScreen from './SettingsScreen';
import BillsScreen, { BILLS_STORAGE_KEY } from './BillsScreen';
import TransactionList from './TransactionList';
import TransactionModal from './TransactionModal';
import { scheduleDailyReview } from './NotificationService';
import { fetchNewUPITransactions, markSMSSeen, requestSMSPermission, isSMSAvailable, startUPIListener } from './UPIDetector';
import UPIPrompt from './UPIPrompt';

const Tab = createBottomTabNavigator();
const STORAGE_KEY = 'transactions';
const BUDGET_KEY = 'monthlyBudget';
const GOALS_KEY = 'savingsGoals';
const CAT_BUDGETS_KEY = 'categoryBudgets';
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
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dailyBudget = monthlyBudget / dim;
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const daySpend = transactions
      .filter((t) => t.date.startsWith(dateStr) && t.amount < 0)
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

// ─── Credit Card Balance ──────────────────────────────────────────────────────
function CreditCard({ stats }) {
  return (
    <View style={ccStyles.card}>
      <View style={ccStyles.glow1} />
      <View style={ccStyles.glow2} />
      <View style={ccStyles.glow3} />
      <View style={ccStyles.topShimmer} />

      {/* Top row: brand + NFC */}
      <View style={ccStyles.topRow}>
        <View style={ccStyles.brandRow}>
          <View style={ccStyles.brandIcon}><Text style={{ fontSize: 13 }}>⚡</Text></View>
          <Text style={ccStyles.brandText}>Thunder Wallet</Text>
        </View>
        <View style={{ transform: [{ rotate: '90deg' }] }}>
          <Ionicons name="wifi-outline" size={22} color="rgba(255,255,255,0.4)" />
        </View>
      </View>

      {/* EMV Chip */}
      <View style={ccStyles.chip}>
        <View style={ccStyles.chipLine} />
        <View style={ccStyles.chipCol} />
        <View style={ccStyles.chipTL} />
        <View style={ccStyles.chipTR} />
        <View style={ccStyles.chipBL} />
        <View style={ccStyles.chipBR} />
      </View>

      {/* Balance */}
      <Text style={ccStyles.balLabel}>CURRENT BALANCE</Text>
      <AnimatedBalance value={stats.balance} color="#FFFFFF" fontSize={36} />

      {/* Status */}
      <View style={ccStyles.statusRow}>
        <View style={[ccStyles.statusDot, { backgroundColor: stats.balance >= 0 ? '#34D399' : '#F87171' }]} />
        <Text style={[ccStyles.statusText, { color: stats.balance >= 0 ? '#34D399' : '#F87171' }]}>
          {stats.balance >= 0 ? 'Healthy' : 'Overspent'}
        </Text>
      </View>

      <View style={ccStyles.divider} />

      {/* Bottom stats */}
      <View style={ccStyles.bottomRow}>
        <View>
          <Text style={ccStyles.bottomLabel}>INCOME</Text>
          <Text style={[ccStyles.bottomVal, { color: '#34D399' }]}>+{compactCurrency.format(stats.income)}</Text>
        </View>
        <View style={ccStyles.sep} />
        <View>
          <Text style={ccStyles.bottomLabel}>SPENT</Text>
          <Text style={[ccStyles.bottomVal, { color: '#F87171' }]}>-{compactCurrency.format(stats.expense)}</Text>
        </View>
        <View style={ccStyles.sep} />
        <View>
          <Text style={ccStyles.bottomLabel}>SAVED</Text>
          <Text style={[ccStyles.bottomVal, { color: '#FCD34D' }]}>{Math.round(Math.max(stats.savingsRate, 0))}%</Text>
        </View>
      </View>
    </View>
  );
}

const ccStyles = StyleSheet.create({
  card: {
    borderRadius: 24,
    backgroundColor: '#0B1628',
    padding: 22,
    overflow: 'hidden',
    elevation: 20,
    shadowColor: '#3B5BDB',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    minHeight: 210,
  },
  glow1: {
    position: 'absolute', width: 280, height: 280, borderRadius: 140,
    backgroundColor: 'rgba(96,165,250,0.10)', top: -110, right: -80,
  },
  glow2: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(167,139,250,0.09)', bottom: -100, left: -60,
  },
  glow3: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(52,211,153,0.05)', top: 40, left: '40%',
  },
  topShimmer: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandIcon: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  brandText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', letterSpacing: 0.2 },
  chip: {
    width: 44, height: 34, borderRadius: 7,
    backgroundColor: '#C9A96E',
    marginBottom: 16,
    overflow: 'hidden',
  },
  chipLine: { position: 'absolute', top: '50%', left: 0, right: 0, height: 1, backgroundColor: 'rgba(0,0,0,0.2)' },
  chipCol: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(0,0,0,0.2)' },
  chipTL: { position: 'absolute', top: 0, left: 0, width: '50%', height: '50%', borderBottomRightRadius: 5, borderWidth: 1, borderColor: 'rgba(0,0,0,0.18)' },
  chipTR: { position: 'absolute', top: 0, right: 0, width: '50%', height: '50%', borderBottomLeftRadius: 5, borderWidth: 1, borderColor: 'rgba(0,0,0,0.18)' },
  chipBL: { position: 'absolute', bottom: 0, left: 0, width: '50%', height: '50%', borderTopRightRadius: 5, borderWidth: 1, borderColor: 'rgba(0,0,0,0.18)' },
  chipBR: { position: 'absolute', bottom: 0, right: 0, width: '50%', height: '50%', borderTopLeftRadius: 5, borderWidth: 1, borderColor: 'rgba(0,0,0,0.18)' },
  balLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 9, fontWeight: '700', letterSpacing: 1.8, marginBottom: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginVertical: 14 },
  bottomRow: { flexDirection: 'row', alignItems: 'center' },
  bottomLabel: { color: 'rgba(255,255,255,0.38)', fontSize: 9, fontWeight: '700', letterSpacing: 1.4, marginBottom: 5 },
  bottomVal: { fontSize: 15, fontWeight: '900' },
  sep: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.09)', marginHorizontal: 18 },
});

// ─── Dashboard Screen ─────────────────────────────────────────────────────────
function DashboardScreen({ wallet }) {
  const { C } = useTheme();
  const { insight, monthlyBudget, stats, adjustMonthlyBudget, openTransactionModal, addTransaction, goals, deleteGoal, openGoalModal, streak, categoryBudgets, openCategoryBudgetModal } = wallet;
  const healthScore = calculateHealthScore(stats, monthlyBudget);
  const scoreColor = healthScore >= 70 ? C.income : healthScore >= 40 ? C.amber : C.expense;
  const scoreLabel = healthScore >= 80 ? 'Excellent' : healthScore >= 60 ? 'Good' : healthScore >= 40 ? 'Fair' : 'Needs Work';
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState(String(monthlyBudget));

  // ── UPI detection state ──
  const [upiQueue, setUpiQueue] = useState([]);
  const [showUPIPrompt, setShowUPIPrompt] = useState(false);

  useEffect(() => {
    if (!isSMSAvailable()) return;

    let stopListener = () => {};

    const init = async () => {
      // Ask permission once
      const granted = await requestSMSPermission();
      if (!granted) return;

      // 1. On-open scan — catch any UPI payments from the last 48h
      const { transactions } = await fetchNewUPITransactions();
      if (transactions.length > 0) {
        setUpiQueue(transactions);
        setShowUPIPrompt(true);
      }

      // 2. Real-time listener — fires instantly when a new bank SMS arrives
      stopListener = startUPIListener((detected) => {
        // Queue it even if another prompt is already open
        setUpiQueue((q) => {
          const already = q.some((t) => t.smsId === detected.smsId);
          return already ? q : [...q, detected];
        });
        setShowUPIPrompt(true);
      });
    };

    const t = setTimeout(init, 800);
    return () => {
      clearTimeout(t);
      stopListener();
    };
  }, []);

  const handleUPISave = async (data) => {
    addTransaction({
      id: String(Date.now()),
      type: 'expense',
      amount: -Math.abs(data.amount),
      category: data.category,
      note: data.note,
      date: data.date,
      recurring: null,
      fromUPI: true,
    });
    await markSMSSeen([data.smsId]);
  };

  const handleUPISkip = async (smsId) => {
    await markSMSSeen([smsId]);
  };

  const handleUPIDismissAll = () => {
    setShowUPIPrompt(false);
    setUpiQueue([]);
  };

  const commitBudget = async () => {
    const val = Number.parseFloat(budgetInput);
    if (Number.isFinite(val) && val > 0) adjustMonthlyBudget(val);
    setEditingBudget(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {showUPIPrompt && upiQueue.length > 0 && (
        <UPIPrompt
          transactions={upiQueue}
          onSave={handleUPISave}
          onDismiss={handleUPISkip}
          onDismissAll={handleUPIDismissAll}
        />
      )}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        <AppHeader streak={streak} />

        {/* Credit Card Balance */}
        <CreditCard stats={stats} />

        {/* Health Score */}
        <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, padding: 14 }}>
          <View style={{ alignItems: 'center', backgroundColor: `${scoreColor}18`, borderRadius: 12, height: 38, justifyContent: 'center', width: 38 }}>
            <Ionicons name="shield-checkmark" size={18} color={scoreColor} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ color: C.text2, fontSize: 11, fontWeight: '700' }}>Financial Health</Text>
              <Text style={{ color: scoreColor, fontSize: 11, fontWeight: '800' }}>{scoreLabel}</Text>
            </View>
            <View style={{ backgroundColor: C.cardInner, borderRadius: 4, height: 6, overflow: 'hidden' }}>
              <View style={{ borderRadius: 4, height: 6, width: `${healthScore}%`, backgroundColor: scoreColor }} />
            </View>
          </View>
          <Text style={{ color: scoreColor, fontSize: 22, fontWeight: '900', minWidth: 36, textAlign: 'right' }}>{healthScore}</Text>
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
        <View style={{ flexDirection: 'row', gap: 10, marginVertical: 14 }}>
          <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: C.incomeBg, borderColor: `${C.income}35`, borderRadius: 14, borderWidth: 1, minHeight: 52 }} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); openTransactionModal('income'); }}>
            <Ionicons name="add-circle" size={20} color={C.income} />
            <Text style={{ color: C.income, fontSize: 14, fontWeight: '900' }}>Income</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: C.expenseBg, borderColor: `${C.expense}35`, borderRadius: 14, borderWidth: 1, minHeight: 52 }} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); openTransactionModal('expense'); }}>
            <Ionicons name="remove-circle" size={20} color={C.expense} />
            <Text style={{ color: C.expense, fontSize: 14, fontWeight: '900' }}>Expense</Text>
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

        {/* 7-day Trend */}
        <View style={{ backgroundColor: C.card, borderColor: C.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="bar-chart" size={15} color={C.blue} />
              <Text style={{ color: C.text1, fontSize: 15, fontWeight: '900' }}>7-day Spending</Text>
            </View>
            <Text style={{ color: C.blue, fontSize: 14, fontWeight: '900' }}>{compactCurrency.format(stats.weekSpend)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: 8, height: 100 }}>
            {stats.weekDays.map((day) => (
              <View key={day.key} style={{ alignItems: 'center', flex: 1, gap: 6 }}>
                <View style={{ backgroundColor: C.cardInner, borderRadius: 6, flex: 1, justifyContent: 'flex-end', overflow: 'hidden', width: '100%' }}>
                  <View style={{ backgroundColor: C.accent, borderRadius: 6, height: `${Math.max((day.total / stats.weekMaxSpend) * 100, day.total ? 10 : 2)}%`, opacity: 0.55, width: '100%' }} />
                </View>
                <Text style={{ color: C.text2, fontSize: 10, fontWeight: '700' }}>{day.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Analytics Screen ─────────────────────────────────────────────────────────
function AnalyticsScreen({ wallet }) {
  const { C } = useTheme();
  const { monthlyBudget, stats, transactions } = wallet;
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
  const [transactionImage, setTransactionImage] = useState(null);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [monthlyBudget, setMonthlyBudget] = useState(DEFAULT_MONTHLY_BUDGET);
  const [confettiGoal, setConfettiGoal] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [savedTx, savedBudget, savedGoals, savedCatBudgets] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(BUDGET_KEY),
          AsyncStorage.getItem(GOALS_KEY),
          AsyncStorage.getItem(CAT_BUDGETS_KEY),
        ]);
        if (savedTx) {
          const parsed = JSON.parse(savedTx).map(normalizeTransaction);
          setTransactions(parsed);
        }
        const b = Number.parseFloat(savedBudget);
        if (Number.isFinite(b) && b > 0) setMonthlyBudget(b);
        if (savedGoals) setGoals(JSON.parse(savedGoals));
        if (savedCatBudgets) setCategoryBudgets(JSON.parse(savedCatBudgets));
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

  const resetForm = () => {
    setTransactionType('expense');
    setTransactionCategory('');
    setTransactionAmount('');
    setTransactionNote('');
    setTransactionDate(new Date().toISOString());
    setTransactionRecurring(null);
    setTransactionImage(null);
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
    setTransactionImage(tx.imageUri || null);
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

  const adjustMonthlyBudget = async (val) => {
    const next = Math.max(500, val);
    setMonthlyBudget(next);
    await AsyncStorage.setItem(BUDGET_KEY, String(next));
  };

  const saveCategoryBudgets = async (budgets) => {
    setCategoryBudgets(budgets);
    await AsyncStorage.setItem(CAT_BUDGETS_KEY, JSON.stringify(budgets));
  };

  const copyReceiptImage = async (tempUri, txId) => {
    if (!tempUri) return null;
    try {
      const dir = `${FileSystem.documentDirectory}receipts/`;
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const ext = tempUri.split('.').pop().split('?')[0] || 'jpg';
      const dest = `${dir}${txId}.${ext}`;
      await FileSystem.copyAsync({ from: tempUri, to: dest });
      return dest;
    } catch { return null; }
  };

  const addTransaction = async () => {
    const amount = Number.parseFloat(transactionAmount);
    if (!transactionCategory.trim()) { Alert.alert('Missing category', 'Choose or type a category.'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { Alert.alert('Invalid amount', 'Amount must be greater than zero.'); return; }

    const txId = editingTransaction ? editingTransaction.id : `${Date.now()}`;
    // Copy image to permanent storage if it's a new/changed temp file
    let imageUri = null;
    if (transactionImage) {
      const isAlreadyPermanent = transactionImage.includes(FileSystem.documentDirectory);
      imageUri = isAlreadyPermanent ? transactionImage : await copyReceiptImage(transactionImage, txId);
    }

    const txData = {
      id: txId,
      category: transactionCategory.trim(),
      amount: transactionType === 'expense' ? -Math.abs(amount) : Math.abs(amount),
      note: transactionNote.trim(),
      type: transactionType,
      date: transactionDate,
      recurring: transactionRecurring,
      imageUri: imageUri || undefined,
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

  const addTransactionDirect = async (txData) => {
    try {
      const normalized = normalizeTransaction(txData);
      // Functional updater avoids stale-closure on `transactions` when called from a tab component
      await new Promise((resolve, reject) => {
        setTransactions((prev) => {
          const next = [normalized, ...prev];
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).then(resolve).catch(reject);
          return next;
        });
      });
    } catch { Alert.alert('Save error', 'Could not save transaction.'); }
  };

  const deleteTransaction = async (id) => {
    try {
      await new Promise((resolve, reject) => {
        setTransactions((prev) => {
          const next = prev.filter((t) => t.id !== id);
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).then(resolve).catch(reject);
          return next;
        });
      });
    } catch { Alert.alert('Delete error', 'Could not delete transaction.'); }
  };

  const clearTransactions = () => {
    if (!transactions.length) return;
    Alert.alert('Clear all transactions?', 'This will permanently remove your wallet history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear All', style: 'destructive', onPress: async () => { try { await persistTransactions([]); } catch { Alert.alert('Error', 'Could not clear.'); } } },
    ]);
  };

  const addGoal = async (goal) => {
    await new Promise((resolve, reject) => {
      setGoals((prev) => {
        const next = [goal, ...prev];
        AsyncStorage.setItem(GOALS_KEY, JSON.stringify(next)).then(resolve).catch(reject);
        return next;
      });
    });
  };

  const deleteGoal = (id) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Remove goal?', 'This goal will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await new Promise((resolve, reject) => {
          setGoals((prev) => {
            const next = prev.filter((g) => g.id !== id);
            AsyncStorage.setItem(GOALS_KEY, JSON.stringify(next)).then(resolve).catch(reject);
            return next;
          });
        });
      }},
    ]);
  };

  // Check if any goal just hit completion — batch all new completions in one write
  useEffect(() => {
    const newlyDone = goals.filter((g) => g.savedAmount >= g.target && !g.celebratedAt);
    if (!newlyDone.length) return;
    const doneIds = new Set(newlyDone.map((g) => g.id));
    setConfettiGoal(newlyDone[0]);
    persistGoals(goals.map((g) => doneIds.has(g.id) ? { ...g, celebratedAt: new Date().toISOString() } : g));
  }, [goals]);

  const resetAllData = async () => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEY),
        AsyncStorage.removeItem(BUDGET_KEY),
        AsyncStorage.removeItem(GOALS_KEY),
        AsyncStorage.removeItem(CAT_BUDGETS_KEY),
        AsyncStorage.removeItem(BILLS_STORAGE_KEY),
      ]);
      setTransactions([]);
      setMonthlyBudget(DEFAULT_MONTHLY_BUDGET);
      setGoals([]);
      setCategoryBudgets({});
    } catch { Alert.alert('Reset error', 'Could not reset data.'); }
  };

  const wallet = {
    activeFilter, adjustMonthlyBudget, clearTransactions, deleteTransaction, editTransaction,
    deleteGoal, goals, insight, monthlyBudget, openTransactionModal, openGoalModal,
    openCategoryBudgetModal, categoryBudgets, searchQuery, setActiveFilter, setSearchQuery,
    stats, streak, transactions, addTransaction: addTransactionDirect,
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
            const icons = { Dashboard: focused ? 'home' : 'home-outline', Analytics: focused ? 'pie-chart' : 'pie-chart-outline', Activity: focused ? 'receipt' : 'receipt-outline', Bills: focused ? 'document-text' : 'document-text-outline', Settings: focused ? 'settings' : 'settings-outline' };
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
        <Tab.Screen name="Bills">{() => <BillsScreen addTransaction={addTransactionDirect} />}</Tab.Screen>
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
        transactionImage={transactionImage}
        setTransactionImage={setTransactionImage}
      />

      <AddGoalModal visible={isGoalModalVisible} onClose={() => setGoalModalVisible(false)} onAdd={addGoal} />

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
    return { key: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en-IN', { weekday: 'short' }), total: 0 };
  });
  const weekMap = weekDays.reduce((m, d) => { m[d.key] = d; return m; }, {});
  const totals = transactions.reduce((s, t) => {
    const d = new Date(t.date), itm = d.getMonth() === cm && d.getFullYear() === cy, dk = d.toISOString().slice(0, 10);
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

  const todayStr = now.toISOString().slice(0, 10);
  const todaySpend = transactions.filter((t) => t.date.startsWith(todayStr) && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  const topCategories = Object.entries(expCats).sort(([, a], [, b]) => b - a).slice(0, 6).map(([category, amount]) => ({ amount, category, percentage: totals.expense ? Math.max((amount / totals.expense) * 100, 4) : 0 }));
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
