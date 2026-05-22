import React, { useMemo } from 'react';
import {
  Alert,
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
import { Ionicons } from '@expo/vector-icons';

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const filters = [
  { key: 'all', label: 'All' },
  { key: 'income', label: 'Income' },
  { key: 'expense', label: 'Expense' },
];

const categoryIcons = {
  Food: 'fast-food-outline',
  Travel: 'car-outline',
  Shopping: 'bag-outline',
  Bills: 'receipt-outline',
  Salary: 'cash-outline',
  Health: 'fitness-outline',
  Other: 'sparkles-outline',
};

const TransactionList = ({
  transactions,
  deleteTransaction,
  activeFilter,
  setActiveFilter,
  searchQuery,
  setSearchQuery,
}) => {
  const formatTimestamp = (date) => {
    const options = {
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      month: 'short',
      year: 'numeric',
    };
    return new Date(date).toLocaleString('en-IN', options);
  };

  const visibleTransactions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return transactions.filter((transaction) => {
      const matchesFilter =
        activeFilter === 'all' ||
        (activeFilter === 'income' && transaction.amount >= 0) ||
        (activeFilter === 'expense' && transaction.amount < 0);
      const matchesSearch =
        !normalizedQuery ||
        transaction.category.toLowerCase().includes(normalizedQuery) ||
        (transaction.note || '').toLowerCase().includes(normalizedQuery);

      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, searchQuery, transactions]);

  const visibleSummary = useMemo(
    () =>
      visibleTransactions.reduce(
        (summary, transaction) => {
          if (transaction.amount >= 0) {
            summary.income += transaction.amount;
          } else {
            summary.expense += Math.abs(transaction.amount);
          }
          return summary;
        },
        { income: 0, expense: 0 },
      ),
    [visibleTransactions],
  );
  const visibleNet = visibleSummary.income - visibleSummary.expense;

  const escapeCSV = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

  const generateCSV = async () => {
    if (!transactions.length) {
      Alert.alert('Nothing to export', 'Add a transaction first.');
      return;
    }

    const csvRows = [
      ['ID', 'Type', 'Category', 'Amount', 'Note', 'Date'].map(escapeCSV).join(','),
      ...transactions.map((item) =>
        [
          item.id,
          item.amount >= 0 ? 'Income' : 'Expense',
          item.category,
          item.amount,
          item.note,
          formatTimestamp(item.date),
        ]
          .map(escapeCSV)
          .join(','),
      ),
    ];

    const fileUri = `${FileSystem.documentDirectory}thunder-wallet-transactions.csv`;
    await FileSystem.writeAsStringAsync(fileUri, csvRows.join('\n'));

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri);
    } else {
      Alert.alert('Sharing unavailable', 'CSV export is saved in the app document directory.');
    }
  };

  const shareSummary = async () => {
    if (!transactions.length) {
      Alert.alert('Nothing to share', 'Add a transaction first.');
      return;
    }

    const total = transactions.reduce((sum, item) => sum + item.amount, 0);
    const summary = transactions
      .slice(0, 12)
      .map((item) => {
        const sign = item.amount >= 0 ? '+' : '-';
        return `${item.category}: ${sign}${currency.format(Math.abs(item.amount))} on ${formatTimestamp(item.date)}`;
      })
      .join('\n');

    try {
      await Share.share({
        message: `Thunder Wallet Summary\nBalance: ${currency.format(total)}\n\n${summary}`,
      });
    } catch (error) {
      Alert.alert('Could not share summary', error.message);
    }
  };

  const confirmDelete = (transactionId) => {
    Alert.alert('Delete transaction?', 'This entry will be removed from your local wallet.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteTransaction(transactionId) },
    ]);
  };

  const renderTransaction = ({ item }) => {
    const isIncome = item.amount >= 0;
    const iconName = categoryIcons[item.category] || categoryIcons.Other;

    return (
      <View style={styles.transactionItem}>
        <View style={[styles.transactionIcon, isIncome ? styles.incomeIcon : styles.expenseIcon]}>
          <Ionicons name={iconName} size={21} color={isIncome ? '#0f6f4e' : '#a43e22'} />
        </View>

        <View style={styles.transactionDetails}>
          <View style={styles.transactionTopRow}>
            <Text style={styles.transactionCategory} numberOfLines={1}>
              {item.category}
            </Text>
            <Text style={[styles.transactionAmount, isIncome ? styles.incomeAmount : styles.expenseAmount]}>
              {isIncome ? '+' : '-'}{currency.format(Math.abs(item.amount))}
            </Text>
          </View>
          {!!item.note && (
            <Text style={styles.transactionNote} numberOfLines={1}>
              {item.note}
            </Text>
          )}
          <Text style={styles.transactionDate}>{formatTimestamp(item.date)}</Text>
        </View>

        <TouchableOpacity
          accessibilityLabel="Delete transaction"
          onPress={() => confirmDelete(item.id)}
          style={styles.deleteButton}
        >
          <Ionicons name="trash-outline" size={19} color="#8f9892" />
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
            <Ionicons name="download-outline" size={20} color="#11342d" />
          </TouchableOpacity>
          <TouchableOpacity accessibilityLabel="Share summary" onPress={shareSummary} style={styles.iconButton}>
            <Ionicons name="share-social-outline" size={20} color="#11342d" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={18} color="#7d867f" />
        <TextInput
          placeholder="Search category or note"
          placeholderTextColor="#8a928c"
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <View style={styles.filterRow}>
        {filters.map((filter) => (
          <TouchableOpacity
            key={filter.key}
            style={[styles.filterChip, activeFilter === filter.key && styles.activeFilterChip]}
            onPress={() => setActiveFilter(filter.key)}
          >
            <Text style={[styles.filterText, activeFilter === filter.key && styles.activeFilterText]}>
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.resultSummary}>
        <View style={styles.summaryPill}>
          <Ionicons name="list-outline" size={16} color="#11342d" />
          <Text style={styles.summaryText}>{visibleTransactions.length} shown</Text>
        </View>
        <View style={styles.summaryPill}>
          <Ionicons name="arrow-down-circle-outline" size={16} color="#0f6f4e" />
          <Text style={styles.summaryText}>{currency.format(visibleSummary.income)}</Text>
        </View>
        <View style={styles.summaryPill}>
          <Ionicons name="arrow-up-circle-outline" size={16} color="#a43e22" />
          <Text style={styles.summaryText}>{currency.format(visibleSummary.expense)}</Text>
        </View>
        <View style={styles.summaryPill}>
          <Ionicons name={visibleNet >= 0 ? 'trending-up-outline' : 'trending-down-outline'} size={16} color="#11342d" />
          <Text style={styles.summaryText}>Net {currency.format(visibleNet)}</Text>
        </View>
      </View>

      <FlatList
        data={visibleTransactions}
        keyExtractor={(item) => item.id}
        renderItem={renderTransaction}
        scrollEnabled={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="wallet-outline" size={40} color="#b9a889" />
            <Text style={styles.emptyTitle}>No transactions yet</Text>
            <Text style={styles.emptyText}>Add income or expenses to see your wallet story here.</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  transactionsContainer: {
    backgroundColor: '#ffffff',
    borderColor: '#e5ddd1',
    borderRadius: 14,
    borderWidth: 1,
    elevation: 3,
    padding: 16,
    shadowColor: '#1d2528',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  eyebrow: {
    color: '#938872',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  transactionsTitle: {
    color: '#1d2528',
    fontSize: 23,
    fontWeight: '900',
    marginTop: 2,
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#edf6e1',
    borderRadius: 18,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: '#f8f6f1',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  searchInput: {
    color: '#1d2528',
    flex: 1,
    fontSize: 15,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  filterChip: {
    alignItems: 'center',
    backgroundColor: '#f8f6f1',
    borderRadius: 18,
    flex: 1,
    minHeight: 36,
    justifyContent: 'center',
  },
  activeFilterChip: {
    backgroundColor: '#11342d',
  },
  filterText: {
    color: '#626b65',
    fontSize: 13,
    fontWeight: '800',
  },
  activeFilterText: {
    color: '#ffffff',
  },
  resultSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
    marginTop: 12,
  },
  summaryPill: {
    alignItems: 'center',
    backgroundColor: '#fbfaf7',
    borderColor: '#e5ddd1',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 10,
  },
  summaryText: {
    color: '#3d4842',
    fontSize: 12,
    fontWeight: '900',
  },
  transactionItem: {
    alignItems: 'center',
    borderTopColor: '#eee7dc',
    borderTopWidth: 1,
    flexDirection: 'row',
    minHeight: 74,
    paddingVertical: 12,
  },
  transactionIcon: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    marginRight: 12,
    width: 40,
  },
  incomeIcon: {
    backgroundColor: '#e5f6df',
  },
  expenseIcon: {
    backgroundColor: '#fff0e9',
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
    color: '#1d2528',
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: '900',
  },
  incomeAmount: {
    color: '#0f6f4e',
  },
  expenseAmount: {
    color: '#a43e22',
  },
  transactionNote: {
    color: '#646e67',
    fontSize: 13,
    marginTop: 4,
  },
  transactionDate: {
    color: '#959d97',
    fontSize: 12,
    marginTop: 4,
  },
  deleteButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    marginLeft: 8,
    width: 34,
  },
  emptyState: {
    alignItems: 'center',
    borderTopColor: '#eee7dc',
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 34,
  },
  emptyTitle: {
    color: '#1d2528',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 12,
  },
  emptyText: {
    color: '#7d867f',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    textAlign: 'center',
  },
});

export default TransactionList;
