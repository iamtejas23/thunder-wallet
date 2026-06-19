import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './ThemeContext';

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const compactCurrency = {
  format: (n) => {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(1)}Cr`;
    if (abs >= 100000)   return `${sign}₹${(abs / 100000).toFixed(1)}L`;
    if (abs >= 1000)     return `${sign}₹${(abs / 1000).toFixed(1)}K`;
    return `${sign}₹${Math.round(abs)}`;
  },
};

const filters = [
  { key: 'all', label: 'All', icon: 'apps-outline' },
  { key: 'income', label: 'Income', icon: 'trending-up-outline' },
  { key: 'expense', label: 'Expense', icon: 'trending-down-outline' },
];

const categoryConfig = {
  Food: { icon: 'restaurant', color: '#F87171' },
  Travel: { icon: 'airplane', color: '#4ECDC4' },
  Shopping: { icon: 'bag-handle', color: '#A78BFA' },
  Bills: { icon: 'document-text', color: '#FCD34D' },
  Salary: { icon: 'briefcase', color: '#34D399' },
  Health: { icon: 'medkit', color: '#F87171' },
  Entertainment: { icon: 'game-controller', color: '#FCD34D' },
  Rent: { icon: 'home', color: '#60A5FA' },
  Education: { icon: 'school', color: '#A78BFA' },
  Freelance: { icon: 'laptop', color: '#34D399' },
  Groceries: { icon: 'cart', color: '#FB923C' },
  Transport: { icon: 'car', color: '#4ECDC4' },
  Investment: { icon: 'trending-up', color: '#60A5FA' },
  Bonus: { icon: 'gift', color: '#FCD34D' },
  Other: { icon: 'ellipsis-horizontal-circle', color: '#94A3B8' },
};

const getCfg = (cat) => categoryConfig[cat] || categoryConfig.Other;

function SwipeableRow({ children, onEdit, onDelete, C }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [revealed, setRevealed] = useState(false);

  const reveal = () => {
    setRevealed(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(translateX, { toValue: -128, useNativeDriver: true, bounciness: 0 }).start();
  };

  const hide = () => {
    setRevealed(false);
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
  };

  return (
    <View style={{ overflow: 'hidden' }}>
      <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'stretch' }]}>
        <TouchableOpacity
          style={[styles.swipeAction, { backgroundColor: '#3B82F6' }]}
          onPress={() => { hide(); onEdit(); }}
        >
          <Ionicons name="create-outline" size={20} color="#fff" />
          <Text style={styles.swipeActionText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.swipeAction, { backgroundColor: '#EF4444' }]}
          onPress={() => { hide(); onDelete(); }}
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={styles.swipeActionText}>Delete</Text>
        </TouchableOpacity>
      </View>
      <Animated.View style={{ transform: [{ translateX }] }}>
        <TouchableOpacity activeOpacity={1} onPress={revealed ? hide : undefined} onLongPress={!revealed ? reveal : undefined} delayLongPress={300}>
          {children}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const TransactionList = ({
  transactions,
  deleteTransaction,
  editTransaction,
  activeFilter,
  setActiveFilter,
  searchQuery,
  setSearchQuery,
}) => {
  const { C } = useTheme();
  const [expandedMonths, setExpandedMonths] = useState(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return new Set([key]);
  });

  const formatTs = (date) =>
    new Date(date).toLocaleString('en-IN', { day: 'numeric', hour: 'numeric', minute: 'numeric', month: 'short', year: 'numeric' });

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transactions.filter((t) => {
      const mf = activeFilter === 'all' || (activeFilter === 'income' && t.amount >= 0) || (activeFilter === 'expense' && t.amount < 0);
      const ms = !q || t.category.toLowerCase().includes(q) || (t.note || '').toLowerCase().includes(q);
      return mf && ms;
    });
  }, [activeFilter, searchQuery, transactions]);

  const summary = useMemo(() =>
    visible.reduce((s, t) => { if (t.amount >= 0) s.income += t.amount; else s.expense += Math.abs(t.amount); return s; }, { income: 0, expense: 0 }),
  [visible]);
  const net = summary.income - summary.expense;

  const monthGroups = useMemo(() => {
    const groups = {};
    visible.forEach((t) => {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      if (!groups[key]) groups[key] = { key, label, items: [], income: 0, expense: 0 };
      groups[key].items.push(t);
      if (t.amount >= 0) groups[key].income += t.amount;
      else groups[key].expense += Math.abs(t.amount);
    });
    return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
  }, [visible]);

  const toggleMonth = (key) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const escapeCSV = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const generateCSV = async () => {
    if (!transactions.length) { Alert.alert('Nothing to export', 'Add a transaction first.'); return; }
    try {
      const rows = [
        ['ID', 'Type', 'Category', 'Amount', 'Note', 'Date'].map(escapeCSV).join(','),
        ...transactions.map((t) => [t.id, t.amount >= 0 ? 'Income' : 'Expense', t.category, t.amount, t.note, formatTs(t.date)].map(escapeCSV).join(',')),
      ];
      const uri = `${FileSystem.documentDirectory}thunder-wallet-transactions.csv`;
      await FileSystem.writeAsStringAsync(uri, rows.join('\n'));
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
      else Alert.alert('Exported', 'CSV saved to app documents.');
    } catch {
      Alert.alert('Export failed', 'Could not export transactions.');
    }
  };

  const shareSummary = async () => {
    if (!transactions.length) { Alert.alert('Nothing to share', 'Add a transaction first.'); return; }
    const now = new Date();
    const monthLabel = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const thisMonth = transactions.filter((t) => {
      const d = new Date(t.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const mIncome = thisMonth.filter((t) => t.amount >= 0).reduce((s, t) => s + t.amount, 0);
    const mExpense = thisMonth.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const savingsRate = mIncome > 0 ? Math.round(((mIncome - mExpense) / mIncome) * 100) : 0;
    const msg = [
      `⚡ Thunder Wallet — ${monthLabel}`,
      ``,
      `💰 Income:  ${currency.format(mIncome)}`,
      `💸 Spent:   ${currency.format(mExpense)}`,
      `📊 Saved:   ${savingsRate}% of income`,
      ``,
      `Tracked with Thunder Wallet`,
    ].join('\n');
    try { await Share.share({ message: msg }); }
    catch (err) { Alert.alert('Share failed', err.message); }
  };

  const confirmDelete = (id) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Delete transaction?', 'This entry will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteTransaction(id) },
    ]);
  };

  const renderTxRow = (item) => {
    const isIncome = item.amount >= 0;
    const cfg = getCfg(item.category);
    return (
      <SwipeableRow
        key={item.id}
        onEdit={() => editTransaction(item)}
        onDelete={() => confirmDelete(item.id)}
        C={C}
      >
        <View style={[styles.txRow, { borderTopColor: C.border, backgroundColor: C.card }]}>
          <View style={[styles.txIcon, { backgroundColor: `${cfg.color}18` }]}>
            <Ionicons name={cfg.icon} size={19} color={cfg.color} />
          </View>
          <View style={styles.txDetails}>
            <View style={styles.txTopRow}>
              <Text style={[styles.txCategory, { color: C.text1 }]} numberOfLines={1}>{item.category}</Text>
              <Text style={[styles.txAmount, { color: isIncome ? C.income : C.expense }]}>
                {isIncome ? '+' : '-'}{currency.format(Math.abs(item.amount))}
              </Text>
            </View>
            {!!item.note && <Text style={[styles.txNote, { color: C.text2 }]} numberOfLines={1}>{item.note}</Text>}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <Text style={[styles.txDate, { color: C.text3 }]}>{formatTs(item.date)}</Text>
              {item.recurring && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.accentBg, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Ionicons name="repeat" size={10} color={C.accent} />
                  <Text style={{ color: C.accent, fontSize: 9, fontWeight: '800' }}>{item.recurring}</Text>
                </View>
              )}
            </View>
          </View>
          <Text style={[styles.swipeHint, { color: C.text3 }]}>‹</Text>
        </View>
      </SwipeableRow>
    );
  };

  const listData = [];
  monthGroups.forEach((group) => {
    listData.push({ type: 'monthHeader', group });
    if (expandedMonths.has(group.key)) {
      listData.push({ type: 'monthStats', group });
      group.items.forEach((item) => listData.push({ type: 'tx', item }));
    }
  });

  const renderItem = ({ item: row }) => {
    if (row.type === 'tx') return renderTxRow(row.item);

    if (row.type === 'monthHeader') {
      const { group } = row;
      const isExp = expandedMonths.has(group.key);
      const groupNet = group.income - group.expense;
      return (
        <TouchableOpacity
          style={[styles.monthHeader, { backgroundColor: C.cardInner, borderColor: C.border }]}
          onPress={() => toggleMonth(group.key)}
          activeOpacity={0.7}
        >
          <View style={styles.monthLeft}>
            <View style={[styles.monthIcon, { backgroundColor: C.blueBg }]}>
              <Ionicons name="calendar" size={14} color={C.blue} />
            </View>
            <View>
              <Text style={[styles.monthLabel, { color: C.text1 }]}>{group.label}</Text>
              <Text style={[styles.monthCount, { color: C.text3 }]}>{group.items.length} entries</Text>
            </View>
          </View>
          <View style={styles.monthRight}>
            <View style={[styles.monthNetPill, { backgroundColor: C.bg, borderColor: C.border }]}>
              <Text style={[styles.monthNet, { color: groupNet >= 0 ? C.income : C.expense }]}>
                {groupNet >= 0 ? '+' : ''}{compactCurrency.format(groupNet)}
              </Text>
            </View>
            <Ionicons name={isExp ? 'chevron-up' : 'chevron-down'} size={15} color={C.text2} />
          </View>
        </TouchableOpacity>
      );
    }

    if (row.type === 'monthStats') {
      const { group } = row;
      return (
        <View style={[styles.monthSummaryBar, { borderColor: C.border }]}>
          <View style={[styles.monthStatPill, { backgroundColor: C.cardInner, borderColor: C.border }]}>
            <Ionicons name="arrow-down-circle" size={11} color={C.income} />
            <Text style={[styles.monthStatText, { color: C.income }]}>{compactCurrency.format(group.income)}</Text>
          </View>
          <View style={[styles.monthStatPill, { backgroundColor: C.cardInner, borderColor: C.border }]}>
            <Ionicons name="arrow-up-circle" size={11} color={C.expense} />
            <Text style={[styles.monthStatText, { color: C.expense }]}>{compactCurrency.format(group.expense)}</Text>
          </View>
        </View>
      );
    }

    return null;
  };

  const ListHeader = () => (
    <View style={[styles.container, { backgroundColor: C.card, borderColor: C.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: C.text3 }]}>Activity</Text>
          <Text style={[styles.title, { color: C.text1 }]}>Transactions</Text>
        </View>
        <View style={styles.headerIcons}>
          <TouchableOpacity onPress={generateCSV} style={[styles.iconBtn, { backgroundColor: C.cardInner, borderColor: C.border }]}>
            <Ionicons name="download-outline" size={18} color={C.income} />
          </TouchableOpacity>
          <TouchableOpacity onPress={shareSummary} style={[styles.iconBtn, { backgroundColor: C.cardInner, borderColor: C.border }]}>
            <Ionicons name="share-social-outline" size={18} color={C.blue} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={[styles.searchBox, { backgroundColor: C.cardInner, borderColor: C.border }]}>
        <Ionicons name="search-outline" size={16} color={C.text3} />
        <TextInput
          placeholder="Search category or note"
          placeholderTextColor={C.text3}
          style={[styles.searchInput, { color: C.text1 }]}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {!!searchQuery && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={16} color={C.text3} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, { backgroundColor: C.cardInner, borderColor: C.border }, activeFilter === f.key && { backgroundColor: C.accent, borderColor: C.accent }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveFilter(f.key); }}
          >
            <Ionicons name={f.icon} size={12} color={activeFilter === f.key ? (C.isDark ? '#000' : '#fff') : C.text2} />
            <Text style={[styles.filterText, { color: activeFilter === f.key ? (C.isDark ? '#000' : '#fff') : C.text2 }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary Pills */}
      <View style={styles.pillRow}>
        {[
          { icon: 'layers-outline', text: `${visible.length}`, color: C.text2 },
          { icon: 'arrow-down-circle-outline', text: compactCurrency.format(summary.income), color: C.income },
          { icon: 'arrow-up-circle-outline', text: compactCurrency.format(summary.expense), color: C.expense },
          { icon: net >= 0 ? 'trending-up-outline' : 'trending-down-outline', text: compactCurrency.format(Math.abs(net)), color: net >= 0 ? C.income : C.expense },
        ].map((p, i) => (
          <View key={i} style={[styles.pill, { backgroundColor: C.cardInner, borderColor: C.border }]}>
            <Ionicons name={p.icon} size={12} color={p.color} />
            <Text style={[styles.pillText, { color: p.color }]}>{p.text}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.swipeHintLabel, { color: C.text3 }]}>Long-press a row to edit or delete</Text>
    </View>
  );

  const ListEmpty = () => (
    <View style={[styles.emptyState, { borderTopColor: C.border, backgroundColor: C.card, borderColor: C.border }]}>
      <View style={[styles.emptyIconWrap, { backgroundColor: C.cardInner, borderColor: C.border }]}>
        <Ionicons name="wallet-outline" size={36} color={C.text3} />
      </View>
      <Text style={[styles.emptyTitle, { color: C.text1 }]}>No transactions yet</Text>
      <Text style={[styles.emptyText, { color: C.text2 }]}>Add income or expenses to see your wallet story here.</Text>
    </View>
  );

  if (listData.length === 0) {
    return (
      <>
        <ListHeader />
        <ListEmpty />
      </>
    );
  }

  return (
    <FlatList
      data={listData}
      keyExtractor={(row, i) => row.type + (row.item?.id || row.group?.key || i)}
      renderItem={renderItem}
      ListHeaderComponent={<ListHeader />}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 20 }}
    />
  );
};

const styles = StyleSheet.create({
  container: { borderRadius: 18, borderWidth: 1, elevation: 4, padding: 16, shadowColor: '#000', shadowOffset: { height: 6, width: 0 }, shadowOpacity: 0.15, shadowRadius: 14 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { fontSize: 22, fontWeight: '900', marginTop: 2 },
  headerIcons: { flexDirection: 'row', gap: 8 },
  iconBtn: { alignItems: 'center', borderRadius: 20, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  searchBox: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 44, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 14 },
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  filterChip: { alignItems: 'center', borderRadius: 20, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 4, justifyContent: 'center', minHeight: 34 },
  filterText: { fontSize: 12, fontWeight: '800' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10, marginTop: 12 },
  pill: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 4, minHeight: 28, paddingHorizontal: 9 },
  pillText: { fontSize: 11, fontWeight: '800' },
  swipeHintLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 4, marginBottom: 4 },
  monthHeader: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 14, paddingVertical: 12 },
  monthLeft: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  monthIcon: { alignItems: 'center', borderRadius: 8, height: 26, justifyContent: 'center', width: 26 },
  monthLabel: { fontSize: 13, fontWeight: '800' },
  monthCount: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  monthRight: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  monthNetPill: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  monthNet: { fontSize: 12, fontWeight: '900' },
  monthSummaryBar: { borderBottomWidth: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 4, paddingVertical: 8 },
  monthStatPill: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 4, paddingHorizontal: 9, paddingVertical: 5 },
  monthStatText: { fontSize: 11, fontWeight: '700' },
  txRow: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', minHeight: 70, paddingHorizontal: 16, paddingVertical: 12 },
  txIcon: { alignItems: 'center', borderRadius: 13, height: 40, justifyContent: 'center', marginRight: 12, width: 40 },
  txDetails: { flex: 1 },
  txTopRow: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  txCategory: { flex: 1, fontSize: 14, fontWeight: '800' },
  txAmount: { fontSize: 14, fontWeight: '900' },
  txNote: { fontSize: 12, marginTop: 3 },
  txDate: { fontSize: 10 },
  swipeHint: { fontSize: 18, fontWeight: '300', paddingLeft: 8 },
  swipeAction: { width: 64, alignItems: 'center', justifyContent: 'center', gap: 4 },
  swipeActionText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  emptyState: { alignItems: 'center', borderRadius: 18, borderWidth: 1, marginTop: 12, paddingHorizontal: 20, paddingVertical: 40 },
  emptyIconWrap: { alignItems: 'center', borderRadius: 28, borderWidth: 1, height: 68, justifyContent: 'center', width: 68 },
  emptyTitle: { fontSize: 16, fontWeight: '900', marginTop: 14 },
  emptyText: { fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' },
});

export default TransactionList;
