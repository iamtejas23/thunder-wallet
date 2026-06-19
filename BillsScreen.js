import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
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
import { useTheme } from './ThemeContext';

export const BILLS_STORAGE_KEY = 'monthly_bills';

const PRESETS = [
  { name: 'Electricity', icon: 'flash',            color: '#FCD34D', category: 'Bills',         defaultAmount: 1200 },
  { name: 'Mobile',      icon: 'phone-portrait',   color: '#60A5FA', category: 'Bills',         defaultAmount: 299  },
  { name: 'Internet',    icon: 'wifi',             color: '#34D399', category: 'Bills',         defaultAmount: 799  },
  { name: 'Gas',         icon: 'flame',            color: '#FB923C', category: 'Bills',         defaultAmount: 800  },
  { name: 'Water',       icon: 'water',            color: '#4ECDC4', category: 'Bills',         defaultAmount: 200  },
  { name: 'Netflix',     icon: 'play-circle',      color: '#EF4444', category: 'Entertainment', defaultAmount: 499  },
  { name: 'Spotify',     icon: 'musical-notes',    color: '#22C55E', category: 'Entertainment', defaultAmount: 119  },
  { name: 'DTH / TV',   icon: 'tv',               color: '#A78BFA', category: 'Entertainment', defaultAmount: 350  },
  { name: 'Insurance',   icon: 'shield-checkmark', color: '#F87171', category: 'Health',        defaultAmount: 2000 },
  { name: 'EMI / Loan',  icon: 'card',             color: '#94A3B8', category: 'Bills',         defaultAmount: 5000 },
  { name: 'Rent',        icon: 'home',             color: '#818CF8', category: 'Rent',          defaultAmount: 12000},
  { name: 'Gym',         icon: 'barbell',          color: '#F472B6', category: 'Health',        defaultAmount: 999  },
];

const STATUS = {
  PAID:     { label: 'Paid',     color: '#22C55E', icon: 'checkmark-circle',  order: 3 },
  OVERDUE:  { label: 'Overdue',  color: '#EF4444', icon: 'alert-circle',      order: 0 },
  DUE_SOON: { label: 'Due Soon', color: '#F59E0B', icon: 'time',              order: 1 },
  UPCOMING: { label: 'Upcoming', color: '#60A5FA', icon: 'calendar-outline',  order: 2 },
};

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function currentMonthKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

function getBillStatus(bill) {
  const mk = currentMonthKey();
  if ((bill.paidMonths || []).includes(mk)) return 'PAID';
  const today = new Date().getDate();
  const diff = (bill.dueDay || 1) - today;
  if (diff < 0)  return 'OVERDUE';
  if (diff <= 3) return 'DUE_SOON';
  return 'UPCOMING';
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ─── Add / Edit Bill Modal ─────────────────────────────────────────────────────
function BillModal({ visible, initial, onSave, onClose }) {
  const { C } = useTheme();
  const [name,     setName]    = useState('');
  const [amount,   setAmount]  = useState('');
  const [dueDay,   setDueDay]  = useState('1');
  const [category, setCategory]= useState('Bills');
  const [icon,     setIcon]    = useState('document-text');
  const [color,    setColor]   = useState('#60A5FA');
  const [selectedPreset, setSelectedPreset] = useState(null);

  useEffect(() => {
    if (!visible) return;
    if (initial) {
      setName(initial.name);
      setAmount(String(initial.amount));
      setDueDay(String(initial.dueDay || 1));
      setCategory(initial.category || 'Bills');
      setIcon(initial.icon || 'document-text');
      setColor(initial.color || '#60A5FA');
      setSelectedPreset(null);
    } else {
      setName(''); setAmount(''); setDueDay('1');
      setCategory('Bills'); setIcon('document-text'); setColor('#60A5FA');
      setSelectedPreset(null);
    }
  }, [visible, initial]);

  const applyPreset = (p) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPreset(p.name);
    setName(p.name);
    setAmount(String(p.defaultAmount));
    setCategory(p.category);
    setIcon(p.icon);
    setColor(p.color);
  };

  const handleSave = () => {
    const parsedAmount = parseFloat(amount);
    const parsedDay    = parseInt(dueDay, 10);
    if (!name.trim())                            { Alert.alert('Name required', 'Give this bill a name.'); return; }
    if (!parsedAmount || parsedAmount <= 0)      { Alert.alert('Invalid amount', 'Enter a valid amount.'); return; }
    if (!parsedDay || parsedDay < 1 || parsedDay > 31) { Alert.alert('Invalid due day', 'Enter a day between 1 and 31.'); return; }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave({
      ...(initial || {}),
      id:          initial?.id || String(Date.now()),
      name:        name.trim(),
      amount:      parsedAmount,
      dueDay:      parsedDay,
      category,
      icon,
      color,
      paidMonths:  initial?.paidMonths || [],
    });
  };

  const adjustDay = (delta) => {
    const cur = parseInt(dueDay, 10) || 1;
    const next = Math.min(31, Math.max(1, cur + delta));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDueDay(String(next));
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={ms.backdrop} onPress={onClose}>
          <Pressable onPress={() => {}}>
            <View style={[ms.sheet, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={[ms.handle, { backgroundColor: C.border }]} />

              <View style={ms.mHeader}>
                <Text style={[ms.mTitle, { color: C.text1 }]}>{initial ? 'Edit Bill' : 'Add Bill'}</Text>
                <TouchableOpacity style={[ms.closeBtn, { backgroundColor: C.cardInner, borderColor: C.border }]} onPress={onClose}>
                  <Ionicons name="close" size={18} color={C.text2} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* Preset chips */}
                <Text style={[ms.label, { color: C.text1 }]}>Quick Select</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
                  {PRESETS.map((p) => {
                    const sel = selectedPreset === p.name;
                    return (
                      <TouchableOpacity
                        key={p.name}
                        style={[ms.presetChip, { backgroundColor: sel ? `${p.color}22` : C.cardInner, borderColor: sel ? p.color : C.border, borderWidth: sel ? 1.5 : 1 }]}
                        onPress={() => applyPreset(p)}
                      >
                        <View style={[ms.presetIcon, { backgroundColor: `${p.color}18` }]}>
                          <Ionicons name={p.icon} size={14} color={p.color} />
                        </View>
                        <Text style={[ms.presetLabel, { color: sel ? p.color : C.text2 }]}>{p.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Name */}
                <Text style={[ms.label, { color: C.text1 }]}>Bill Name</Text>
                <TextInput
                  style={[ms.input, { backgroundColor: C.cardInner, borderColor: C.border, color: C.text1 }]}
                  placeholder="e.g. Electricity, Netflix..."
                  placeholderTextColor={C.text3}
                  value={name}
                  onChangeText={setName}
                />

                {/* Amount */}
                <Text style={[ms.label, { color: C.text1 }]}>Amount</Text>
                <View style={[ms.amountRow, { backgroundColor: C.cardInner, borderColor: `${color}55` }]}>
                  <Text style={[ms.rupee, { color }]}>₹</Text>
                  <TextInput
                    style={[ms.amountInput, { color: C.text1 }]}
                    placeholder="0"
                    placeholderTextColor={C.text3}
                    keyboardType="decimal-pad"
                    value={amount}
                    onChangeText={setAmount}
                  />
                </View>

                {/* Due Day */}
                <Text style={[ms.label, { color: C.text1 }]}>Due Day of Month</Text>
                <View style={ms.dueDayRow}>
                  <TouchableOpacity style={[ms.dayBtn, { backgroundColor: C.cardInner, borderColor: C.border }]} onPress={() => adjustDay(-1)}>
                    <Ionicons name="remove" size={18} color={C.text1} />
                  </TouchableOpacity>
                  <View style={[ms.dayDisplay, { backgroundColor: C.cardInner, borderColor: color }]}>
                    <Text style={[ms.dayText, { color }]}>{ordinal(parseInt(dueDay, 10) || 1)}</Text>
                    <Text style={[ms.daySub, { color: C.text3 }]}>of each month</Text>
                  </View>
                  <TouchableOpacity style={[ms.dayBtn, { backgroundColor: C.cardInner, borderColor: C.border }]} onPress={() => adjustDay(1)}>
                    <Ionicons name="add" size={18} color={C.text1} />
                  </TouchableOpacity>
                </View>
              </ScrollView>

              <TouchableOpacity
                style={[ms.saveBtn, { backgroundColor: color, shadowColor: color }]}
                onPress={handleSave}
              >
                <Ionicons name={initial ? 'create' : 'add-circle'} size={20} color="#000" />
                <Text style={ms.saveBtnText}>{initial ? 'Update Bill' : 'Add Bill'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Bill Card ─────────────────────────────────────────────────────────────────
function BillCard({ bill, onPay, onEdit, onDelete, C }) {
  const status = getBillStatus(bill);
  const sc     = STATUS[status];
  const isPaid = status === 'PAID';

  return (
    <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
      {/* Left accent bar */}
      <View style={[s.accentBar, { backgroundColor: bill.color }]} />

      <View style={[s.cardIconWrap, { backgroundColor: `${bill.color}18` }]}>
        <Ionicons name={bill.icon} size={22} color={bill.color} />
      </View>

      <View style={s.cardBody}>
        <View style={s.cardTopRow}>
          <Text style={[s.cardName, { color: C.text1 }]} numberOfLines={1}>{bill.name}</Text>
          <View style={[s.statusBadge, { backgroundColor: `${sc.color}18`, borderColor: `${sc.color}40` }]}>
            <Ionicons name={sc.icon} size={10} color={sc.color} />
            <Text style={[s.statusText, { color: sc.color }]}>{sc.label}</Text>
          </View>
        </View>

        <View style={s.cardMidRow}>
          <Text style={[s.cardAmount, { color: C.text1 }]}>{INR.format(bill.amount)}</Text>
          <Text style={[s.cardDue, { color: C.text3 }]}>Due {ordinal(bill.dueDay || 1)}</Text>
        </View>

        <View style={s.cardActions}>
          {!isPaid && (
            <TouchableOpacity
              style={[s.payBtn, { backgroundColor: bill.color, shadowColor: bill.color }]}
              onPress={() => onPay(bill)}
            >
              <Ionicons name="checkmark" size={14} color="#000" />
              <Text style={s.payBtnText}>Pay Now</Text>
            </TouchableOpacity>
          )}
          {isPaid && (
            <View style={[s.paidTag, { backgroundColor: '#22C55E18', borderColor: '#22C55E40' }]}>
              <Ionicons name="checkmark-done" size={13} color="#22C55E" />
              <Text style={[s.paidTagText, { color: '#22C55E' }]}>Paid this month</Text>
            </View>
          )}
          <View style={s.iconActions}>
            <TouchableOpacity
              style={[s.iconBtn, { backgroundColor: C.cardInner, borderColor: C.border }]}
              onPress={() => onEdit(bill)}
            >
              <Ionicons name="create-outline" size={15} color={C.text2} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.iconBtn, { backgroundColor: C.cardInner, borderColor: C.border }]}
              onPress={() => onDelete(bill)}
            >
              <Ionicons name="trash-outline" size={15} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── BillsScreen ──────────────────────────────────────────────────────────────
export default function BillsScreen({ addTransaction }) {
  const { C } = useTheme();
  const [bills, setBills]         = useState([]);
  const [modalVisible, setModal]  = useState(false);
  const [editing, setEditing]     = useState(null);
  const payingRef = useRef(false); // prevents double-tap on Pay Now
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadBills();
    Animated.timing(fadeAnim, { toValue: 1, duration: 340, useNativeDriver: true }).start();
  }, []);

  const loadBills = async () => {
    try {
      const raw = await AsyncStorage.getItem(BILLS_STORAGE_KEY);
      if (raw) setBills(JSON.parse(raw));
    } catch {}
  };

  const saveBills = async (next) => {
    setBills(next);
    try { await AsyncStorage.setItem(BILLS_STORAGE_KEY, JSON.stringify(next)); } catch {}
  };

  const handleSave = (bill) => {
    const next = editing
      ? bills.map((b) => b.id === bill.id ? bill : b)
      : [bill, ...bills];
    saveBills(next);
    setModal(false);
    setEditing(null);
  };

  const handlePay = useCallback((bill) => {
    if (payingRef.current) return; // already processing a pay action
    const mk = currentMonthKey();
    Alert.alert(
      `Pay ${bill.name}?`,
      `This will log ${INR.format(bill.amount)} as a ${bill.category} expense.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay & Log',
          onPress: async () => {
            if (payingRef.current) return;
            payingRef.current = true;
            try {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await addTransaction({
                id:       String(Date.now()),
                type:     'expense',
                category: bill.category,
                amount:   -Math.abs(bill.amount),
                note:     bill.name,
                date:     new Date().toISOString(),
                recurring: null,
              });
              const next = bills.map((b) =>
                b.id === bill.id
                  ? { ...b, paidMonths: [...(b.paidMonths || []).filter((m) => m !== mk), mk] }
                  : b
              );
              await saveBills(next);
            } finally {
              payingRef.current = false;
            }
          },
        },
      ]
    );
  }, [bills, addTransaction]);

  const handleDelete = (bill) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Remove bill?', `"${bill.name}" will be deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => saveBills(bills.filter((b) => b.id !== bill.id)) },
    ]);
  };

  const handleEdit = (bill) => {
    setEditing(bill);
    setModal(true);
  };

  const sorted = [...bills].sort((a, b) => STATUS[getBillStatus(a)].order - STATUS[getBillStatus(b)].order);

  const totalMonthly = bills.reduce((s, b) => s + b.amount, 0);
  const mk = currentMonthKey();
  const paidCount    = bills.filter((b) => (b.paidMonths || []).includes(mk)).length;
  const overdueCount = bills.filter((b) => getBillStatus(b) === 'OVERDUE').length;
  const dueSoonCount = bills.filter((b) => getBillStatus(b) === 'DUE_SOON').length;
  const paidTotal    = bills.filter((b) => (b.paidMonths || []).includes(mk)).reduce((s, b) => s + b.amount, 0);

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {/* ─ Header ─ */}
        <View style={s.header}>
          <View>
            <Text style={[s.eyebrow, { color: C.text3 }]}>Monthly</Text>
            <Text style={[s.title, { color: C.text1 }]}>Bills</Text>
          </View>
          <TouchableOpacity
            style={[s.addBtn, { backgroundColor: C.accent }]}
            onPress={() => { setEditing(null); setModal(true); }}
          >
            <Ionicons name="add" size={22} color={C.isDark ? '#000' : '#fff'} />
          </TouchableOpacity>
        </View>

        {/* ─ Summary Card ─ */}
        {bills.length > 0 && (
          <View style={[s.summaryCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={[s.summaryGlow, { backgroundColor: C.accent }]} />
            <View style={s.summaryRow}>
              <View style={s.summaryItem}>
                <Text style={[s.summaryVal, { color: C.text1 }]}>{INR.format(totalMonthly)}</Text>
                <Text style={[s.summaryLbl, { color: C.text3 }]}>Monthly Total</Text>
              </View>
              <View style={[s.summaryDivider, { backgroundColor: C.border }]} />
              <View style={s.summaryItem}>
                <Text style={[s.summaryVal, { color: '#22C55E' }]}>{INR.format(paidTotal)}</Text>
                <Text style={[s.summaryLbl, { color: C.text3 }]}>{paidCount}/{bills.length} Paid</Text>
              </View>
              <View style={[s.summaryDivider, { backgroundColor: C.border }]} />
              <View style={s.summaryItem}>
                {overdueCount > 0
                  ? <Text style={[s.summaryVal, { color: '#EF4444' }]}>{overdueCount} Overdue</Text>
                  : dueSoonCount > 0
                    ? <Text style={[s.summaryVal, { color: '#F59E0B' }]}>{dueSoonCount} Due Soon</Text>
                    : <Text style={[s.summaryVal, { color: '#22C55E' }]}>All Clear</Text>
                }
                <Text style={[s.summaryLbl, { color: C.text3 }]}>Status</Text>
              </View>
            </View>
          </View>
        )}

        {/* ─ Bill List ─ */}
        {sorted.length === 0 ? (
          <View style={s.empty}>
            <View style={[s.emptyIcon, { backgroundColor: C.cardInner, borderColor: C.border }]}>
              <Ionicons name="receipt-outline" size={38} color={C.text3} />
            </View>
            <Text style={[s.emptyTitle, { color: C.text1 }]}>No bills yet</Text>
            <Text style={[s.emptyText, { color: C.text2 }]}>
              Track electricity, mobile, internet, subscriptions and more. Tap + to add your first bill.
            </Text>
            <TouchableOpacity
              style={[s.emptyBtn, { backgroundColor: C.accent }]}
              onPress={() => setModal(true)}
            >
              <Ionicons name="add" size={16} color={C.isDark ? '#000' : '#fff'} />
              <Text style={[s.emptyBtnText, { color: C.isDark ? '#000' : '#fff' }]}>Add First Bill</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
            showsVerticalScrollIndicator={false}
          >
            {sorted.map((bill) => (
              <BillCard
                key={bill.id}
                bill={bill}
                onPay={handlePay}
                onEdit={handleEdit}
                onDelete={handleDelete}
                C={C}
              />
            ))}
          </ScrollView>
        )}
      </Animated.View>

      <BillModal
        visible={modalVisible}
        initial={editing}
        onSave={handleSave}
        onClose={() => { setModal(false); setEditing(null); }}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:        { flex: 1 },
  header:      { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  eyebrow:     { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  title:       { fontSize: 26, fontWeight: '900', marginTop: 2 },
  addBtn:      { alignItems: 'center', borderRadius: 16, height: 42, justifyContent: 'center', width: 42 },

  summaryCard: { borderRadius: 16, borderWidth: 1, marginHorizontal: 16, marginTop: 12, marginBottom: 4, overflow: 'hidden' },
  summaryGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, opacity: 0.6 },
  summaryRow:  { flexDirection: 'row', padding: 16 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryVal:  { fontSize: 14, fontWeight: '900', marginBottom: 3 },
  summaryLbl:  { fontSize: 10, fontWeight: '600' },
  summaryDivider: { width: 1, marginHorizontal: 4 },

  card:        { borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'stretch', overflow: 'hidden' },
  accentBar:   { width: 4 },
  cardIconWrap:{ alignItems: 'center', justifyContent: 'center', marginLeft: 12, marginRight: 12, width: 44, height: 44, borderRadius: 14, alignSelf: 'center' },
  cardBody:    { flex: 1, paddingVertical: 12, paddingRight: 14 },
  cardTopRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardName:    { fontSize: 14, fontWeight: '800', flex: 1, marginRight: 8 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:  { fontSize: 10, fontWeight: '800' },
  cardMidRow:  { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 10 },
  cardAmount:  { fontSize: 18, fontWeight: '900' },
  cardDue:     { fontSize: 11, fontWeight: '600' },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  payBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, elevation: 4, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6 },
  payBtnText:  { color: '#000', fontSize: 12, fontWeight: '900' },
  paidTag:     { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  paidTagText: { fontSize: 12, fontWeight: '700' },
  iconActions: { flexDirection: 'row', gap: 6, marginLeft: 'auto' },
  iconBtn:     { alignItems: 'center', borderRadius: 10, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 },

  empty:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon:   { alignItems: 'center', borderRadius: 28, borderWidth: 1, height: 72, justifyContent: 'center', width: 72, marginBottom: 16 },
  emptyTitle:  { fontSize: 18, fontWeight: '900', marginBottom: 8 },
  emptyText:   { fontSize: 13, lineHeight: 20, textAlign: 'center', marginBottom: 24 },
  emptyBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12 },
  emptyBtnText:{ fontSize: 14, fontWeight: '900' },
});

const ms = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  sheet:       { borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderBottomWidth: 0, padding: 20, paddingBottom: 34, maxHeight: '90%' },
  handle:      { alignSelf: 'center', borderRadius: 3, height: 4, marginBottom: 16, width: 40 },
  mHeader:     { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  mTitle:      { fontSize: 22, fontWeight: '900' },
  closeBtn:    { alignItems: 'center', borderRadius: 20, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  label:       { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8, textTransform: 'uppercase' },
  presetChip:  { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  presetIcon:  { alignItems: 'center', borderRadius: 8, height: 24, justifyContent: 'center', width: 24 },
  presetLabel: { fontSize: 12, fontWeight: '700' },
  input:       { borderRadius: 12, borderWidth: 1, fontSize: 15, marginBottom: 16, minHeight: 48, paddingHorizontal: 14 },
  amountRow:   { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 2, marginBottom: 16, paddingHorizontal: 16, minHeight: 58 },
  rupee:       { fontSize: 22, fontWeight: '900', marginRight: 8 },
  amountInput: { flex: 1, fontSize: 28, fontWeight: '900' },
  dueDayRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  dayBtn:      { alignItems: 'center', borderRadius: 12, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  dayDisplay:  { flex: 1, alignItems: 'center', borderRadius: 12, borderWidth: 2, paddingVertical: 10 },
  dayText:     { fontSize: 20, fontWeight: '900' },
  daySub:      { fontSize: 10, fontWeight: '600', marginTop: 2 },
  saveBtn:     { alignItems: 'center', borderRadius: 14, elevation: 6, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 8, minHeight: 54, shadowOffset: { height: 6, width: 0 }, shadowOpacity: 0.3, shadowRadius: 14 },
  saveBtnText: { color: '#000', fontSize: 15, fontWeight: '900' },
});
