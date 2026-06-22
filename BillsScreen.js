import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
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
import * as Haptics from 'expo-haptics';
import { useTheme } from './ThemeContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
});

export const BILLS_KEY = 'bills_v2';

const BILL_PRESETS = [
  // ── Streaming / Entertainment ─────────────────────────────────────────
  { name: 'Netflix',      icon: 'tv',               color: '#E50914', category: 'Entertainment', brandLetter: 'N',   letterColor: '#fff', letterBg: '#E50914' },
  { name: 'Spotify',      icon: 'musical-notes',    color: '#1DB954', category: 'Entertainment', fa5Brand: 'spotify' },
  { name: 'Amazon Prime', icon: 'cart',             color: '#00A8E1', category: 'Entertainment', fa5Brand: 'amazon' },
  { name: 'Hotstar',      icon: 'play-circle',      color: '#1F80E0', category: 'Entertainment', brandLetter: 'HS',  letterColor: '#fff', letterBg: '#1F3781' },
  { name: 'Jio',          icon: 'phone-portrait',   color: '#00549A', category: 'Bills',         brandLetter: 'Jio', letterColor: '#fff', letterBg: '#00549A' },
  { name: 'YouTube',      icon: 'logo-youtube',     color: '#FF0000', category: 'Entertainment', fa5Brand: 'youtube' },
  { name: 'Apple TV+',    icon: 'logo-apple',       color: '#1c1c1e', category: 'Entertainment', fa5Brand: 'apple' },
  { name: 'SonyLIV',      icon: 'tv',               color: '#FF5500', category: 'Entertainment', brandLetter: 'SL',  letterColor: '#fff', letterBg: '#FF5500' },
  { name: 'ZEE5',         icon: 'play',             color: '#6734D1', category: 'Entertainment', brandLetter: 'Z5',  letterColor: '#fff', letterBg: '#6734D1' },
  { name: 'ChatGPT',      icon: 'chatbubbles',      color: '#10A37F', category: 'Entertainment', brandLetter: 'AI',  letterColor: '#fff', letterBg: '#10A37F' },
  // ── Utilities & Bills ────────────────────────────────────────────────
  { name: 'Electricity',  icon: 'flash',            color: '#FCD34D', category: 'Bills' },
  { name: 'Water',        icon: 'water',            color: '#60A5FA', category: 'Bills' },
  { name: 'Internet',     icon: 'wifi',             color: '#A78BFA', category: 'Bills' },
  { name: 'Phone',        icon: 'phone-portrait',   color: '#94A3B8', category: 'Bills' },
  { name: 'Gas',          icon: 'flame',            color: '#F97316', category: 'Bills' },
  { name: 'Insurance',    icon: 'shield-checkmark', color: '#14B8A6', category: 'Health' },
  { name: 'Credit Card',  icon: 'card',             color: '#F87171', category: 'Bills' },
  { name: 'Gym',          icon: 'barbell',          color: '#C084FC', category: 'Health' },
  { name: 'Rent',         icon: 'home',             color: '#38BDF8', category: 'Rent' },
  { name: 'EMI',          icon: 'cash',             color: '#34D399', category: 'Bills' },
  { name: 'Custom',       icon: 'receipt',          color: '#94A3B8', category: 'Bills' },
];

function currentMonthKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

function BrandLogo({ fa5Brand, brandLetter, letterColor, letterBg, logo, icon, color, size = 22, bgSize }) {
  const wrap = bgSize ?? size + 18;
  const radius = wrap / 2;

  if (fa5Brand) {
    return (
      <View style={{ alignItems: 'center', backgroundColor: `${color}18`, borderRadius: radius, height: wrap, justifyContent: 'center', width: wrap }}>
        <FontAwesome5 name={fa5Brand} size={size} color={color} brand />
      </View>
    );
  }

  if (brandLetter) {
    const fontSize = wrap <= 40 ? 11 : 13;
    return (
      <View style={{ alignItems: 'center', backgroundColor: letterBg || color, borderRadius: radius, height: wrap, justifyContent: 'center', width: wrap }}>
        <Text style={{ color: letterColor || '#fff', fontSize, fontWeight: '900', letterSpacing: 0.5 }}>{brandLetter}</Text>
      </View>
    );
  }

  return (
    <View style={{ alignItems: 'center', backgroundColor: `${color}20`, borderRadius: radius, height: wrap, justifyContent: 'center', width: wrap }}>
      <Ionicons name={icon} size={size} color={color} />
    </View>
  );
}

const CYCLES = [
  { label: 'Monthly', value: 1 },
  { label: '2 Months', value: 2 },
  { label: 'Quarterly', value: 3 },
  { label: '6 Months', value: 6 },
  { label: 'Yearly', value: 12 },
];

const CYCLE_LABELS = { 1: 'Monthly', 2: 'Every 2M', 3: 'Quarterly', 6: 'Every 6M', 12: 'Yearly' };

// Core billing period calculator. Walks from createdAt by `cycle` months to
// find the current active period. Returns { status, dueDate, periodKey, daysUntil }.
export function getBillingPeriod(bill) {
  const cycle = bill.cycle || 1;
  const dueDay = bill.dueDay || 1;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const created = new Date(bill.createdAt || now);
  let y = created.getFullYear();
  let m = created.getMonth();
  if (!isFinite(y) || !isFinite(m)) {
    y = now.getFullYear();
    m = now.getMonth();
  }
  let lastUnpaidDue = null;
  let lastUnpaidKey = null;

  for (let i = 0; i < 500; i++) {
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const clampedDay = Math.min(dueDay, daysInMonth);
    const due = new Date(y, m, clampedDay);
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;

    if (due >= today) {
      // Overdue unpaid period takes priority
      if (lastUnpaidDue) {
        return { status: 'overdue', dueDate: lastUnpaidDue, periodKey: lastUnpaidKey, daysUntil: 0 };
      }
      if (bill.paidMonths?.[key]) {
        return { status: 'paid', dueDate: due, periodKey: key, daysUntil: Math.round((due - today) / 86400000) };
      }
      const daysUntil = Math.round((due - today) / 86400000);
      return { status: daysUntil <= 3 ? 'due-soon' : 'upcoming', dueDate: due, periodKey: key, daysUntil };
    }

    // Past period — track if unpaid (paid periods reset the chain)
    if (!bill.paidMonths?.[key]) {
      lastUnpaidDue = due;
      lastUnpaidKey = key;
    } else {
      lastUnpaidDue = null;
      lastUnpaidKey = null;
    }

    m += cycle;
    if (m >= 12) { y += Math.floor(m / 12); m = m % 12; }
  }

  const fallbackKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return { status: 'upcoming', dueDate: today, periodKey: fallbackKey, daysUntil: 0 };
}

function getBillStatus(bill) {
  return getBillingPeriod(bill).status;
}

// ─── Add Bill Modal ────────────────────────────────────────────────────────────

function AddBillModal({ visible, onClose, onAdd }) {
  const { C } = useTheme();
  const [step, setStep] = useState('preset'); // 'preset' | 'details'
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('1');
  const [cycle, setCycle] = useState(1);
  const [notes, setNotes] = useState('');

  const reset = () => {
    setStep('preset');
    setSelectedPreset(null);
    setName('');
    setAmount('');
    setDueDay('1');
    setCycle(1);
    setNotes('');
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
    const day = parseInt(dueDay, 10);
    if (!isFinite(day) || day < 1 || day > 31) { Alert.alert('Invalid due day', 'Enter a day between 1 and 31.'); return; }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onAdd({
      id: String(Date.now()),
      name: trimmedName,
      amount: amt,
      dueDay: day,
      cycle,
      icon: selectedPreset?.icon || 'receipt',
      color: selectedPreset?.color || '#94A3B8',
      fa5Brand: selectedPreset?.fa5Brand || null,
      brandLetter: selectedPreset?.brandLetter || null,
      letterColor: selectedPreset?.letterColor || null,
      letterBg: selectedPreset?.letterBg || null,
      category: selectedPreset?.category || 'Bills',
      notes: notes.trim(),
      isActive: true,
      paidMonths: {},
      createdAt: new Date().toISOString(),
    });
    reset();
    onClose();
  };

  const preset = selectedPreset || BILL_PRESETS[0];

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={handleClose} />

        <View style={{ backgroundColor: C.card, borderTopColor: C.border, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, maxHeight: '90%' }}>
          {/* Handle */}
          <View style={{ alignSelf: 'center', backgroundColor: C.border, borderRadius: 3, height: 4, marginTop: 10, width: 40 }} />

          {step === 'preset' ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: 20, paddingBottom: 36 }}
              showsVerticalScrollIndicator={false}
            >
              <Text style={{ color: C.text3, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }}>Add Bill</Text>
              <Text style={{ color: C.text1, fontSize: 22, fontWeight: '900', marginBottom: 20, marginTop: 2 }}>Choose Bill Type</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {BILL_PRESETS.map((p) => (
                  <TouchableOpacity
                    key={p.name}
                    onPress={() => selectPreset(p)}
                    style={{ alignItems: 'center', backgroundColor: C.cardInner, borderColor: C.border, borderRadius: 14, borderWidth: 1, gap: 6, paddingHorizontal: 14, paddingVertical: 12, minWidth: '28%', flex: 1 }}
                  >
                    <BrandLogo fa5Brand={p.fa5Brand} brandLetter={p.brandLetter} letterColor={p.letterColor} letterBg={p.letterBg} icon={p.icon} color={p.color} size={20} bgSize={40} />
                    <Text style={{ color: C.text1, fontSize: 11, fontWeight: '800', textAlign: 'center' }}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 36 }}>
              {/* Back + title */}
              <TouchableOpacity onPress={() => setStep('preset')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                <Ionicons name="chevron-back" size={18} color={C.text3} />
                <Text style={{ color: C.text3, fontSize: 13, fontWeight: '700' }}>Back</Text>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <BrandLogo fa5Brand={preset.fa5Brand} brandLetter={preset.brandLetter} letterColor={preset.letterColor} letterBg={preset.letterBg} icon={preset.icon} color={preset.color} size={26} bgSize={52} />
                <View>
                  <Text style={{ color: C.text3, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }}>New Bill</Text>
                  <Text style={{ color: C.text1, fontSize: 20, fontWeight: '900' }}>Bill Details</Text>
                </View>
              </View>

              <Text style={[s.fieldLabel, { color: C.text2 }]}>Bill Name</Text>
              <TextInput
                style={[s.input, { backgroundColor: C.cardInner, borderColor: C.border, color: C.text1 }]}
                placeholder={preset.name !== 'Custom' ? preset.name : 'e.g. BESCOM Electricity'}
                placeholderTextColor={C.text3}
                value={name}
                onChangeText={setName}
              />

              <Text style={[s.fieldLabel, { color: C.text2 }]}>Monthly Amount (₹)</Text>
              <View style={[s.amountRow, { backgroundColor: C.cardInner, borderColor: `${preset.color}50` }]}>
                <Text style={{ color: preset.color, fontSize: 20, fontWeight: '900', marginRight: 6 }}>₹</Text>
                <TextInput
                  style={{ color: C.text1, flex: 1, fontSize: 20, fontWeight: '800' }}
                  placeholder="0"
                  placeholderTextColor={C.text3}
                  keyboardType="decimal-pad"
                  value={amount}
                  onChangeText={setAmount}
                />
              </View>

              <Text style={[s.fieldLabel, { color: C.text2 }]}>Due on Day of Month</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                {['1', '5', '10', '15', '20', '25', '28', '31'].map((d) => (
                  <TouchableOpacity
                    key={d}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDueDay(d); }}
                    style={{ alignItems: 'center', backgroundColor: dueDay === d ? `${preset.color}25` : C.cardInner, borderColor: dueDay === d ? preset.color : C.border, borderRadius: 10, borderWidth: 1.5, height: 40, justifyContent: 'center', width: 48 }}
                  >
                    <Text style={{ color: dueDay === d ? preset.color : C.text2, fontSize: 14, fontWeight: '800' }}>{d}</Text>
                  </TouchableOpacity>
                ))}
                <TextInput
                  style={[{ alignItems: 'center', backgroundColor: C.cardInner, borderColor: C.border, borderRadius: 10, borderWidth: 1, color: C.text1, fontSize: 14, fontWeight: '800', height: 40, paddingHorizontal: 10, textAlign: 'center', width: 60 }]}
                  placeholder="Day"
                  placeholderTextColor={C.text3}
                  keyboardType="number-pad"
                  value={dueDay}
                  onChangeText={setDueDay}
                  maxLength={2}
                />
              </View>

              <Text style={[s.fieldLabel, { color: C.text2 }]}>Billing Cycle</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                {CYCLES.map(({ label, value }) => (
                  <TouchableOpacity
                    key={value}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCycle(value); }}
                    style={{ alignItems: 'center', backgroundColor: cycle === value ? `${preset.color}25` : C.cardInner, borderColor: cycle === value ? preset.color : C.border, borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 8 }}
                  >
                    <Text style={{ color: cycle === value ? preset.color : C.text2, fontSize: 12, fontWeight: '800' }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.fieldLabel, { color: C.text2 }]}>Notes (optional)</Text>
              <TextInput
                style={[s.input, { backgroundColor: C.cardInner, borderColor: C.border, color: C.text1 }]}
                placeholder="Account number, provider info…"
                placeholderTextColor={C.text3}
                value={notes}
                onChangeText={setNotes}
              />

              <TouchableOpacity
                onPress={handleAdd}
                style={{ alignItems: 'center', backgroundColor: preset.color, borderRadius: 14, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 8, minHeight: 54, elevation: 4, shadowColor: preset.color, shadowOffset: { height: 6, width: 0 }, shadowOpacity: 0.35, shadowRadius: 12 }}
              >
                <Ionicons name="checkmark-circle" size={20} color="#000" />
                <Text style={{ color: '#000', fontSize: 16, fontWeight: '900' }}>Add Bill</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Bill Card ─────────────────────────────────────────────────────────────────

function BillCard({ bill, onPay, onUnpay, onDelete, C }) {
  const { status, daysUntil, dueDate, periodKey } = getBillingPeriod(bill);
  const isPaid = status === 'paid';
  const cycle = bill.cycle || 1;

  const statusConfig = {
    paid:      { label: 'Paid',      color: '#22C55E', bg: 'rgba(34,197,94,0.12)',  icon: 'checkmark-circle' },
    overdue:   { label: 'Overdue',   color: '#EF4444', bg: 'rgba(239,68,68,0.12)',  icon: 'alert-circle' },
    'due-soon':{ label: 'Due Soon',  color: '#F97316', bg: 'rgba(249,115,22,0.12)', icon: 'time' },
    upcoming:  { label: 'Upcoming',  color: '#60A5FA', bg: 'rgba(96,165,250,0.12)', icon: 'calendar-outline' },
  };
  const sc = statusConfig[status] || statusConfig['upcoming'];

  const dueDateStr = dueDate.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short',
    ...(dueDate.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });

  const dateText = isPaid
    ? `Paid ${new Date(bill.paidMonths[periodKey]?.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
    : status === 'overdue'
      ? `Overdue since ${dueDateStr}`
      : daysUntil === 0
        ? 'Due today'
        : `Next: ${dueDateStr} · ${daysUntil}d`;

  return (
    <View style={[bStyles.card, { backgroundColor: C.card, borderColor: status === 'overdue' ? 'rgba(239,68,68,0.35)' : C.border }]}>
      {/* Left: icon */}
      <BrandLogo fa5Brand={bill.fa5Brand} brandLetter={bill.brandLetter} letterColor={bill.letterColor} letterBg={bill.letterBg} icon={bill.icon} color={bill.color} size={22} bgSize={44} />

      {/* Center: info */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
          <Text style={{ color: C.text1, fontSize: 15, fontWeight: '800' }} numberOfLines={1}>{bill.name}</Text>
          <View style={{ backgroundColor: sc.bg, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ color: sc.color, fontSize: 10, fontWeight: '800' }}>{sc.label}</Text>
          </View>
          {cycle > 1 && (
            <View style={{ backgroundColor: C.cardInner, borderColor: C.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: C.text3, fontSize: 9, fontWeight: '800' }}>{CYCLE_LABELS[cycle] || `Every ${cycle}M`}</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ color: bill.color, fontSize: 17, fontWeight: '900' }}>{currency.format(bill.amount)}</Text>
          <Text style={{ color: C.text3, fontSize: 11, fontWeight: '600' }}>{dateText}</Text>
        </View>
        {!!bill.notes && (
          <Text style={{ color: C.text3, fontSize: 11, marginTop: 3 }} numberOfLines={1}>{bill.notes}</Text>
        )}
      </View>

      {/* Right: actions */}
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <TouchableOpacity
          onPress={() => isPaid ? onUnpay(bill) : onPay(bill)}
          style={{ alignItems: 'center', backgroundColor: isPaid ? C.cardInner : bill.color, borderColor: isPaid ? C.border : bill.color, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingVertical: 6 }}
        >
          <Ionicons name={isPaid ? 'close-circle-outline' : 'checkmark'} size={13} color={isPaid ? C.text3 : '#000'} />
          <Text style={{ color: isPaid ? C.text3 : '#000', fontSize: 11, fontWeight: '800' }}>
            {isPaid ? 'Unmark' : 'Pay'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onDelete(bill)} style={{ padding: 4 }}>
          <Ionicons name="trash-outline" size={14} color={C.text3} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// ─── Bills Screen ──────────────────────────────────────────────────────────────

export default function BillsScreen({ bills, onAddBill, onDeleteBill, onMarkPaid, onMarkUnpaid }) {
  const { C } = useTheme();
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'unpaid' | 'paid'

  const enriched = useMemo(() => bills.map((b) => ({ ...b, _status: getBillStatus(b) })), [bills]);

  const filtered = useMemo(() => {
    if (filter === 'paid') return enriched.filter((b) => b._status === 'paid');
    if (filter === 'unpaid') return enriched.filter((b) => b._status !== 'paid');
    return enriched;
  }, [enriched, filter]);

  // Sorted: overdue first, then due-soon, then upcoming, then paid
  const sorted = useMemo(() => {
    const order = { overdue: 0, 'due-soon': 1, upcoming: 2, paid: 3 };
    return [...filtered].sort((a, b) => {
      const od = order[a._status] - order[b._status];
      if (od !== 0) return od;
      return a.dueDay - b.dueDay;
    });
  }, [filtered]);

  const summary = useMemo(() => {
    const total = bills.reduce((s, b) => s + b.amount, 0);
    const paidBills = bills.filter((b) => getBillingPeriod(b).status === 'paid');
    const paid = paidBills.reduce((s, b) => s + b.amount, 0);
    const unpaid = total - paid;
    const overdue = bills.filter((b) => getBillingPeriod(b).status === 'overdue').length;
    const dueSoon = bills.filter((b) => getBillingPeriod(b).status === 'due-soon').length;
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
      `This will add ₹${bill.amount.toLocaleString('en-IN')} as an expense in your activity.`,
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <FlatList
        data={sorted}
        keyExtractor={(b) => b.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        ListHeaderComponent={() => (
          <>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <View>
                <Text style={{ color: C.text3, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }}>Bills</Text>
                <Text style={{ color: C.text1, fontSize: 28, fontWeight: '900', marginTop: 2 }}>Monthly Bills</Text>
              </View>
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowModal(true); }}
                style={{ alignItems: 'center', backgroundColor: C.accentBg, borderColor: C.accentBorder, borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 10 }}
              >
                <Ionicons name="add" size={17} color={C.accent} />
                <Text style={{ color: C.accent, fontSize: 13, fontWeight: '800' }}>Add Bill</Text>
              </TouchableOpacity>
            </View>

            {/* Summary tiles */}
            {bills.length > 0 && (
              <>
                <View style={{ backgroundColor: C.balanceCard, borderColor: C.border, borderRadius: 20, borderWidth: 1, padding: 18, marginBottom: 12 }}>
                  <Text style={{ color: C.text3, fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>This Month</Text>
                  <Text style={{ color: C.text1, fontSize: 32, fontWeight: '900', marginBottom: 14 }}>{currency.format(summary.total)}</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1, backgroundColor: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.2)', borderRadius: 12, borderWidth: 1, padding: 12 }}>
                      <Text style={{ color: '#22C55E', fontSize: 18, fontWeight: '900' }}>{currency.format(summary.paid)}</Text>
                      <Text style={{ color: C.text3, fontSize: 11, fontWeight: '700', marginTop: 2 }}>{summary.paidCount} Paid</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: summary.unpaid > 0 ? 'rgba(239,68,68,0.08)' : C.cardInner, borderColor: summary.unpaid > 0 ? 'rgba(239,68,68,0.2)' : C.border, borderRadius: 12, borderWidth: 1, padding: 12 }}>
                      <Text style={{ color: summary.unpaid > 0 ? '#F87171' : C.text1, fontSize: 18, fontWeight: '900' }}>{currency.format(summary.unpaid)}</Text>
                      <Text style={{ color: C.text3, fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                        {bills.length - summary.paidCount} Pending
                      </Text>
                    </View>
                  </View>

                  {/* Progress bar */}
                  <View style={{ marginTop: 14 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ color: C.text3, fontSize: 11, fontWeight: '700' }}>Payment Progress</Text>
                      <Text style={{ color: C.text2, fontSize: 11, fontWeight: '800' }}>
                        {summary.paidCount}/{bills.length} bills
                      </Text>
                    </View>
                    <View style={{ backgroundColor: C.cardInner, borderRadius: 6, height: 8, overflow: 'hidden' }}>
                      <View style={{ backgroundColor: '#22C55E', borderRadius: 6, height: 8, width: `${bills.length ? (summary.paidCount / bills.length) * 100 : 0}%` }} />
                    </View>
                  </View>
                </View>

                {/* Alert badges */}
                {(summary.overdue > 0 || summary.dueSoon > 0) && (
                  <View style={{ gap: 8, marginBottom: 12 }}>
                    {summary.overdue > 0 && (
                      <View style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)', borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
                        <Ionicons name="alert-circle" size={18} color="#EF4444" />
                        <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '800', flex: 1 }}>
                          {summary.overdue} bill{summary.overdue > 1 ? 's' : ''} overdue — pay now to avoid late fees
                        </Text>
                      </View>
                    )}
                    {summary.dueSoon > 0 && (
                      <View style={{ backgroundColor: 'rgba(249,115,22,0.08)', borderColor: 'rgba(249,115,22,0.25)', borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
                        <Ionicons name="time" size={18} color="#F97316" />
                        <Text style={{ color: '#F97316', fontSize: 13, fontWeight: '800', flex: 1 }}>
                          {summary.dueSoon} bill{summary.dueSoon > 1 ? 's' : ''} due within 3 days
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Filter tabs */}
                <View style={{ flexDirection: 'row', backgroundColor: C.card, borderColor: C.border, borderRadius: 12, borderWidth: 1, gap: 2, marginBottom: 14, padding: 3 }}>
                  {[['all', 'All'], ['unpaid', 'Unpaid'], ['paid', 'Paid']].map(([key, label]) => (
                    <TouchableOpacity
                      key={key}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFilter(key); }}
                      style={{ flex: 1, alignItems: 'center', backgroundColor: filter === key ? C.accent : 'transparent', borderRadius: 10, paddingVertical: 8 }}
                    >
                      <Text style={{ color: filter === key ? (C.isDark ? '#000' : '#fff') : C.text2, fontSize: 13, fontWeight: '800' }}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </>
        )}
        renderItem={({ item }) => (
          <BillCard
            bill={item}
            onPay={handlePay}
            onUnpay={handleUnpay}
            onDelete={handleDelete}
            C={C}
          />
        )}
        ListEmptyComponent={() => (
          <TouchableOpacity
            onPress={() => setShowModal(true)}
            style={{ alignItems: 'center', backgroundColor: C.card, borderColor: C.border, borderRadius: 18, borderStyle: 'dashed', borderWidth: 1.5, padding: 40, marginTop: 20 }}
          >
            <View style={{ alignItems: 'center', backgroundColor: C.cardInner, borderRadius: 28, height: 64, justifyContent: 'center', marginBottom: 14, width: 64 }}>
              <Ionicons name="card-outline" size={30} color={C.text3} />
            </View>
            <Text style={{ color: C.text1, fontSize: 17, fontWeight: '800' }}>No bills added yet</Text>
            <Text style={{ color: C.text2, fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 20 }}>
              Add recurring bills like electricity,{'\n'}Netflix, or rent to track payments.
            </Text>
            <View style={{ backgroundColor: C.accentBg, borderColor: C.accentBorder, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 18, paddingHorizontal: 18, paddingVertical: 10 }}>
              <Ionicons name="add-circle-outline" size={16} color={C.accent} />
              <Text style={{ color: C.accent, fontSize: 13, fontWeight: '800' }}>Add your first bill</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      <AddBillModal visible={showModal} onClose={() => setShowModal(false)} onAdd={onAddBill} />
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  fieldLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  input: { borderRadius: 12, borderWidth: 1, fontSize: 15, marginBottom: 14, minHeight: 48, paddingHorizontal: 14 },
  amountRow: { alignItems: 'center', borderRadius: 12, borderWidth: 2, flexDirection: 'row', marginBottom: 14, minHeight: 54, paddingHorizontal: 14 },
});

const bStyles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10, padding: 14 },
  iconWrap: { alignItems: 'center', borderRadius: 14, height: 46, justifyContent: 'center', width: 46 },
});
