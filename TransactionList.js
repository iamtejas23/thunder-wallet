import React, { useMemo, useState } from 'react';
import {
  Alert,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';

const C = {
  bg: '#0B0F1A',
  card: '#131929',
  cardInner: '#192235',
  border: '#1E2D45',
  text1: '#EEF2FF',
  text2: '#8892B0',
  text3: '#4A5570',
  green: '#00C853',
  greenBright: '#00E676',
  greenBg: 'rgba(0, 200, 83, 0.12)',
  red: '#FF4757',
  redBg: 'rgba(255, 71, 87, 0.12)',
  amber: '#FFB300',
  blue: '#64B5F6',
  purple: '#B388FF',
};

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const compactCurrency = new Intl.NumberFormat('en-IN', {
  currency: 'INR',
  maximumFractionDigits: 0,
  notation: 'compact',
  style: 'currency',
});

const filters = [
  { key: 'all', label: 'All', icon: 'apps-outline' },
  { key: 'income', label: 'Income', icon: 'trending-up-outline' },
  { key: 'expense', label: 'Expense', icon: 'trending-down-outline' },
];

const categoryConfig = {
  Food: { icon: 'restaurant', color: '#FF6B6B' },
  Travel: { icon: 'airplane', color: '#4ECDC4' },
  Shopping: { icon: 'bag-handle', color: '#A29BFE' },
  Bills: { icon: 'document-text', color: '#FFB74D' },
  Salary: { icon: 'briefcase', color: '#00C853' },
  Health: { icon: 'medkit', color: '#FF4757' },
  Entertainment: { icon: 'game-controller', color: '#F9CA24' },
  Rent: { icon: 'home', color: '#74B9FF' },
  Education: { icon: 'school', color: '#B388FF' },
  Freelance: { icon: 'laptop', color: '#00E676' },
  Groceries: { icon: 'cart', color: '#FFA502' },
  Transport: { icon: 'car', color: '#4ECDC4' },
  Other: { icon: 'ellipsis-horizontal-circle', color: '#8892B0' },
};

function getCategoryConfig(category) {
  return categoryConfig[category] || categoryConfig.Other;
}

const TransactionList = ({
  transactions,
  deleteTransaction,
  activeFilter,
  setActiveFilter,
  searchQuery,
  setSearchQuery,
}) => {
  const [expandedMonths, setExpandedMonths] = useState(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return new Set([key]);
  });

  const formatTimestamp = (date) =>
    new Date(date).toLocaleString('en-IN', {
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  const visibleTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transactions.filter((t) => {
      const matchesFilter =
        activeFilter === 'all' ||
        (activeFilter === 'income' && t.amount >= 0) ||
        (activeFilter === 'expense' && t.amount < 0);
      const matchesSearch =
        !q ||
        t.category.toLowerCase().includes(q) ||
        (t.note || '').toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, searchQuery, transactions]);

  const visibleSummary = useMemo(
    () =>
      visibleTransactions.reduce(
        (s, t) => {
          if (t.amount >= 0) s.income += t.amount;
          else s.expense += Math.abs(t.amount);
          return s;
        },
        { income: 0, expense: 0 },
      ),
    [visibleTransactions],
  );
  const visibleNet = visibleSummary.income - visibleSummary.expense;

  const monthGroups = useMemo(() => {
    const groups = {};
    visibleTransactions.forEach((t) => {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      if (!groups[key]) groups[key] = { key, label, items: [], income: 0, expense: 0 };
      groups[key].items.push(t);
      if (t.amount >= 0) groups[key].income += t.amount;
      else groups[key].expense += Math.abs(t.amount);
    });
    return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
  }, [visibleTransactions]);

  const toggleMonth = (key) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const escapeCSV = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const generateCSV = async () => {
    if (!transactions.length) {
      Alert.alert('Nothing to export', 'Add a transaction first.');
      return;
    }
    try {
      const rows = [
        ['ID', 'Type', 'Category', 'Amount', 'Note', 'Date'].map(escapeCSV).join(','),
        ...transactions.map((t) =>
          [t.id, t.amount >= 0 ? 'Income' : 'Expense', t.category, t.amount, t.note, formatTimestamp(t.date)]
            .map(escapeCSV)
            .join(','),
        ),
      ];
      const uri = `${FileSystem.documentDirectory}thunder-wallet-transactions.csv`;
      await FileSystem.writeAsStringAsync(uri, rows.join('\n'));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert('Export saved', 'CSV saved in the app document directory.');
      }
    } catch (err) {
      Alert.alert('Export failed', 'Could not export transactions. Please try again.');
    }
  };

  const shareSummary = async () => {
    if (!transactions.length) {
      Alert.alert('Nothing to share', 'Add a transaction first.');
      return;
    }
    const total = transactions.reduce((s, t) => s + t.amount, 0);
    const lines = transactions.slice(0, 12).map((t) => {
      const sign = t.amount >= 0 ? '+' : '-';
      return `${t.category}: ${sign}${currency.format(Math.abs(t.amount))} on ${formatTimestamp(t.date)}`;
    });
    try {
      await Share.share({
        message: `Thunder Wallet Summary\nBalance: ${currency.format(total)}\n\n${lines.join('\n')}`,
      });
    } catch (err) {
      Alert.alert('Share failed', err.message);
    }
  };

  const confirmDelete = (id) => {
    Alert.alert('Delete transaction?', 'This entry will be removed from your wallet.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteTransaction(id) },
    ]);
  };

  const renderTransactionItem = (item) => {
    const isIncome = item.amount >= 0;
    const cfg = getCategoryConfig(item.category);
    return (
      <View key={item.id} style={styles.transactionItem}>
        <View style={[styles.transactionIcon, { backgroundColor: `${cfg.color}18` }]}>
          <Ionicons name={cfg.icon} size={20} color={cfg.color} />
        </View>
        <View style={styles.transactionDetails}>
          <View style={styles.transactionTopRow}>
            <Text style={styles.transactionCategory} numberOfLines={1}>{item.category}</Text>
            <Text style={[styles.transactionAmount, isIncome ? styles.incomeAmount : styles.expenseAmount]}>
              {isIncome ? '+' : '-'}{currency.format(Math.abs(item.amount))}
            </Text>
          </View>
          {!!item.note && (
            <Text style={styles.transactionNote} numberOfLines={1}>{item.note}</Text>
          )}
          <Text style={styles.transactionDate}>{formatTimestamp(item.date)}</Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Delete transaction"
          onPress={() => confirmDelete(item.id)}
          style={styles.deleteButton}
        >
          <Ionicons name="trash-outline" size={18} color={C.text3} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.transactionsContainer}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Activity</Text>
          <Text style={styles.transactionsTitle}>Transactions</Text>
        </View>
        <View style={styles.headerIcons}>
          <TouchableOpacity accessibilityLabel="Export CSV" onPress={generateCSV} style={styles.iconButton}>
            <Ionicons name="download-outline" size={19} color={C.green} />
          </TouchableOpacity>
          <TouchableOpacity accessibilityLabel="Share summary" onPress={shareSummary} style={styles.iconButton}>
            <Ionicons name="share-social-outline" size={19} color={C.blue} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={17} color={C.text3} />
        <TextInput
          placeholder="Search category or note"
          placeholderTextColor={C.text3}
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {!!searchQuery && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={17} color={C.text3} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterRow}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, activeFilter === f.key && styles.activeFilterChip]}
            onPress={() => setActiveFilter(f.key)}
          >
            <Ionicons
              name={f.icon}
              size={13}
              color={activeFilter === f.key ? '#000' : C.text2}
            />
            <Text style={[styles.filterText, activeFilter === f.key && styles.activeFilterText]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.resultSummary}>
        <View style={styles.summaryPill}>
          <Ionicons name="layers-outline" size={13} color={C.text2} />
          <Text style={styles.summaryText}>{visibleTransactions.length}</Text>
        </View>
        <View style={styles.summaryPill}>
          <Ionicons name="arrow-down-circle-outline" size={13} color={C.green} />
          <Text style={[styles.summaryText, { color: C.green }]}>{compactCurrency.format(visibleSummary.income)}</Text>
        </View>
        <View style={styles.summaryPill}>
          <Ionicons name="arrow-up-circle-outline" size={13} color={C.red} />
          <Text style={[styles.summaryText, { color: C.red }]}>{compactCurrency.format(visibleSummary.expense)}</Text>
        </View>
        <View style={styles.summaryPill}>
          <Ionicons name={visibleNet >= 0 ? 'trending-up-outline' : 'trending-down-outline'} size={13} color={visibleNet >= 0 ? C.green : C.red} />
          <Text style={[styles.summaryText, { color: visibleNet >= 0 ? C.green : C.red }]}>
            {compactCurrency.format(Math.abs(visibleNet))}
          </Text>
        </View>
      </View>

      {monthGroups.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="wallet-outline" size={38} color={C.text3} />
          </View>
          <Text style={styles.emptyTitle}>No transactions yet</Text>
          <Text style={styles.emptyText}>Add income or expenses to see your wallet story here.</Text>
        </View>
      ) : (
        monthGroups.map((group) => {
          const isExpanded = expandedMonths.has(group.key);
          const net = group.income - group.expense;
          return (
            <View key={group.key} style={styles.monthGroup}>
              <TouchableOpacity style={styles.monthHeader} onPress={() => toggleMonth(group.key)} activeOpacity={0.7}>
                <View style={styles.monthHeaderLeft}>
                  <View style={styles.monthIconWrap}>
                    <Ionicons name="calendar" size={15} color={C.blue} />
                  </View>
                  <View>
                    <Text style={styles.monthLabel}>{group.label}</Text>
                    <Text style={styles.monthCount}>{group.items.length} transaction{group.items.length !== 1 ? 's' : ''}</Text>
                  </View>
                </View>
                <View style={styles.monthHeaderRight}>
                  <View style={styles.monthNetPill}>
                    <Text style={[styles.monthNet, { color: net >= 0 ? C.green : C.red }]}>
                      {net >= 0 ? '+' : ''}{compactCurrency.format(net)}
                    </Text>
                  </View>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={C.text2}
                  />
                </View>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.monthSummaryRow}>
                  <View style={styles.monthStatPill}>
                    <Ionicons name="arrow-down-circle" size={12} color={C.green} />
                    <Text style={styles.monthStatText}>{compactCurrency.format(group.income)}</Text>
                  </View>
                  <View style={styles.monthStatPill}>
                    <Ionicons name="arrow-up-circle" size={12} color={C.red} />
                    <Text style={styles.monthStatText}>{compactCurrency.format(group.expense)}</Text>
                  </View>
                </View>
              )}

              {isExpanded && group.items.map(renderTransactionItem)}
            </View>
          );
        })
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  transactionsContainer: {
    backgroundColor: C.card,
    borderColor: C.border,
    borderRadius: 18,
    borderWidth: 1,
    elevation: 4,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  eyebrow: {
    color: C.text3,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  transactionsTitle: {
    color: C.text1,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 2,
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: C.cardInner,
    borderColor: C.border,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: C.cardInner,
    borderColor: C.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  searchInput: {
    color: C.text1,
    flex: 1,
    fontSize: 14,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  filterChip: {
    alignItems: 'center',
    backgroundColor: C.cardInner,
    borderColor: C.border,
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    minHeight: 36,
  },
  activeFilterChip: {
    backgroundColor: C.green,
    borderColor: C.green,
  },
  filterText: {
    color: C.text2,
    fontSize: 12,
    fontWeight: '800',
  },
  activeFilterText: {
    color: '#000000',
  },
  resultSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
    marginTop: 12,
  },
  summaryPill: {
    alignItems: 'center',
    backgroundColor: C.cardInner,
    borderColor: C.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    minHeight: 30,
    paddingHorizontal: 10,
  },
  summaryText: {
    color: C.text2,
    fontSize: 12,
    fontWeight: '800',
  },
  monthGroup: {
    marginBottom: 4,
  },
  monthHeader: {
    alignItems: 'center',
    backgroundColor: C.cardInner,
    borderColor: C.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  monthHeaderLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  monthIconWrap: {
    alignItems: 'center',
    backgroundColor: `rgba(100,181,246,0.12)`,
    borderRadius: 8,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  monthLabel: {
    color: C.text1,
    fontSize: 14,
    fontWeight: '800',
  },
  monthCount: {
    color: C.text3,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  monthHeaderRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  monthNetPill: {
    backgroundColor: C.bg,
    borderColor: C.border,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  monthNet: {
    fontSize: 13,
    fontWeight: '900',
  },
  monthSummaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  monthStatPill: {
    alignItems: 'center',
    backgroundColor: C.cardInner,
    borderColor: C.border,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  monthStatText: {
    color: C.text2,
    fontSize: 12,
    fontWeight: '700',
  },
  transactionItem: {
    alignItems: 'center',
    borderTopColor: C.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    minHeight: 72,
    paddingVertical: 12,
  },
  transactionIcon: {
    alignItems: 'center',
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    marginRight: 12,
    width: 42,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  transactionCategory: {
    color: C.text1,
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: '900',
  },
  incomeAmount: {
    color: C.greenBright,
  },
  expenseAmount: {
    color: C.red,
  },
  transactionNote: {
    color: C.text2,
    fontSize: 12,
    marginTop: 4,
  },
  transactionDate: {
    color: C.text3,
    fontSize: 11,
    marginTop: 3,
  },
  deleteButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    marginLeft: 6,
    width: 34,
  },
  emptyState: {
    alignItems: 'center',
    borderTopColor: C.border,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  emptyIconWrap: {
    alignItems: 'center',
    backgroundColor: C.cardInner,
    borderColor: C.border,
    borderRadius: 30,
    borderWidth: 1,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  emptyTitle: {
    color: C.text1,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 14,
  },
  emptyText: {
    color: C.text2,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
    textAlign: 'center',
  },
});

export default TransactionList;
