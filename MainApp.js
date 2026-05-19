import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Svg, { Circle, Path } from 'react-native-svg';
import SettingsScreen from './SettingsScreen';
import TransactionList from './TransactionList';
import TransactionModal from './TransactionModal';

const Tab = createBottomTabNavigator();
const STORAGE_KEY = 'transactions';
const BUDGET_KEY = 'monthlyBudget';
const DEFAULT_MONTHLY_BUDGET = 30000;
const chartColors = ['#83c85a', '#ffb199', '#21b7a8', '#f5c542', '#7c83fd', '#e96b4c'];

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

const normalizeTransaction = (transaction) => {
  const hasType = transaction.type === 'income' || transaction.type === 'expense';
  const type = hasType ? transaction.type : 'expense';
  const rawAmount = Number.parseFloat(transaction.amount) || 0;
  const amount = type === 'expense' ? -Math.abs(rawAmount) : Math.abs(rawAmount);

  return {
    ...transaction,
    id: String(transaction.id || Date.now()),
    amount,
    type,
    date: transaction.date || new Date().toISOString(),
    note: transaction.note || '',
  };
};

const polarToCartesian = (center, radius, angleInDegrees) => {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: center + radius * Math.cos(angleInRadians),
    y: center + radius * Math.sin(angleInRadians),
  };
};

const describeArc = (center, radius, startAngle, endAngle) => {
  const start = polarToCartesian(center, radius, endAngle);
  const end = polarToCartesian(center, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
};

function AppHeader() {
  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <Image source={require('./assets/logo.png')} style={styles.logoImage} />
        <View>
          <Text style={styles.greeting}>Thunder Wallet</Text>
          <Text style={styles.subGreeting}>Track money with clarity</Text>
        </View>
      </View>
      <View style={styles.headerChip}>
        <Ionicons name="flash" size={15} color="#11342d" />
      </View>
    </View>
  );
}

function DashboardScreen({ wallet }) {
  const { insight, monthlyBudget, stats, adjustMonthlyBudget, openTransactionModal } = wallet;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <AppHeader />

        <View style={styles.balanceCard}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardLabel}>Current balance</Text>
            <View style={styles.healthBadge}>
              <Ionicons name={stats.balance >= 0 ? 'trending-up' : 'warning'} size={14} color="#0f3d31" />
              <Text style={styles.healthText}>{stats.balance >= 0 ? 'Healthy' : 'Needs review'}</Text>
            </View>
          </View>
          <Text style={styles.balanceAmount}>{currency.format(stats.balance)}</Text>
          <View style={styles.metricRow}>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Income</Text>
              <Text style={styles.incomeText}>{currency.format(stats.income)}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Expenses</Text>
              <Text style={styles.expenseText}>{currency.format(stats.expense)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.quickDock}>
          <TouchableOpacity style={[styles.quickButton, styles.primaryQuickButton]} onPress={() => openTransactionModal('expense')}>
            <Ionicons name="remove-circle-outline" size={21} color="#ffffff" />
            <Text style={styles.primaryQuickText}>Expense</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickButton} onPress={() => openTransactionModal('income')}>
            <Ionicons name="add-circle-outline" size={21} color="#11342d" />
            <Text style={styles.quickText}>Income</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsCard}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>Stats</Text>
              <Text style={styles.sectionTitle}>Money pulse</Text>
            </View>
            <View style={styles.statIconBubble}>
              <Ionicons name="analytics-outline" size={21} color="#11342d" />
            </View>
          </View>

          <View style={styles.statsGrid}>
            <StatTile label="Month in" value={compactCurrency.format(stats.monthIncome)} />
            <StatTile label="Month out" value={compactCurrency.format(stats.monthExpense)} tone="expense" />
            <StatTile label="Daily spend" value={compactCurrency.format(stats.dailyAverageExpense)} />
            <StatTile label="Savings" value={`${Math.round(stats.savingsRate)}%`} tone={stats.savingsRate < 0 ? 'expense' : 'normal'} />
          </View>

          <View style={styles.budgetPanel}>
            <View style={styles.budgetHeader}>
              <View>
                <Text style={styles.budgetLabel}>Monthly budget</Text>
                <Text style={styles.budgetAmount}>{currency.format(monthlyBudget)}</Text>
              </View>
              <View style={styles.budgetControls}>
                <TouchableOpacity style={styles.budgetControlButton} onPress={() => adjustMonthlyBudget(-1000)}>
                  <Ionicons name="remove" size={18} color="#11342d" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.budgetControlButton} onPress={() => adjustMonthlyBudget(1000)}>
                  <Ionicons name="add" size={18} color="#11342d" />
                </TouchableOpacity>
              </View>
              <Text style={[styles.budgetStatus, stats.remainingBudget < 0 && styles.overBudgetStatus]}>
                {stats.remainingBudget >= 0 ? `${currency.format(stats.remainingBudget)} left` : 'Over budget'}
              </Text>
            </View>
            <View style={styles.budgetTrack}>
              <View
                style={[
                  styles.budgetFill,
                  stats.remainingBudget < 0 && styles.overBudgetFill,
                  { width: `${stats.budgetUsedPercent}%` },
                ]}
              />
            </View>
            <View style={styles.insightRow}>
              <View style={styles.insightIcon}>
                <Ionicons name={insight.icon} size={18} color="#11342d" />
              </View>
              <View style={styles.insightCopy}>
                <Text style={styles.insightTitle}>{insight.title}</Text>
                <Text style={styles.insightBody}>{insight.body}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.forecastGrid}>
          <ForecastTile icon="calendar-outline" label="Days left" value={stats.daysLeft} />
          <ForecastTile
            icon="speedometer-outline"
            label="Projected"
            value={compactCurrency.format(stats.projectedExpense)}
            danger={stats.projectedExpense > monthlyBudget}
          />
          <ForecastTile icon="wallet-outline" label="This week" value={compactCurrency.format(stats.weekSpend)} />
        </View>

        <TrendPanel stats={stats} />
      </ScrollView>
    </SafeAreaView>
  );
}

function AnalyticsScreen({ wallet }) {
  const { monthlyBudget, stats } = wallet;
  const pieData = stats.topCategories.map((item, index) => ({
    ...item,
    color: chartColors[index % chartColors.length],
  }));
  const hasPieData = pieData.length > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <ScreenTitle eyebrow="Analytics" title="Spending map" icon="pie-chart-outline" />

        <View style={styles.chartCard}>
          <View style={styles.chartWrap}>
            <DonutChart data={pieData} total={stats.expense} />
            <View style={styles.chartCenter}>
              <Text style={styles.chartCenterLabel}>Spent</Text>
              <Text style={styles.chartCenterValue}>{compactCurrency.format(stats.expense)}</Text>
            </View>
          </View>
          <View style={styles.legendList}>
            {hasPieData ? (
              pieData.map((item) => (
                <View key={item.category} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <Text style={styles.legendLabel} numberOfLines={1}>{item.category}</Text>
                  <Text style={styles.legendValue}>{Math.round(item.percentage)}%</Text>
                </View>
              ))
            ) : (
              <View style={styles.emptyAnalytics}>
                <Ionicons name="pie-chart-outline" size={34} color="#b9a889" />
                <Text style={styles.emptyAnalyticsText}>Add expenses to draw your pie chart.</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.analysisGrid}>
          <InsightCard icon="flame-outline" label="Top category" value={stats.topCategory?.category || 'None'} />
          <InsightCard icon="cash-outline" label="Top amount" value={stats.topCategory ? compactCurrency.format(stats.topCategory.amount) : compactCurrency.format(0)} />
          <InsightCard icon="shield-checkmark-outline" label="Budget used" value={`${Math.round(stats.budgetUsedPercent)}%`} />
          <InsightCard icon="trail-sign-outline" label="Runway" value={`${stats.daysLeft} days`} />
        </View>

        <View style={styles.compareCard}>
          <Text style={styles.compareTitle}>Income vs expense</Text>
          <CompareBar label="Income" amount={stats.monthIncome} max={Math.max(stats.monthIncome, stats.monthExpense, 1)} color="#83c85a" />
          <CompareBar label="Expense" amount={stats.monthExpense} max={Math.max(stats.monthIncome, stats.monthExpense, 1)} color="#e96b4c" />
          <View style={styles.compareFooter}>
            <Ionicons name={stats.projectedExpense > monthlyBudget ? 'alert-circle-outline' : 'sparkles-outline'} size={18} color="#11342d" />
            <Text style={styles.compareFooterText}>
              {stats.projectedExpense > monthlyBudget
                ? 'Projected spend is above budget. Slow down for the rest of the month.'
                : 'Your projected spend is inside budget right now.'}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ActivityScreen({ wallet }) {
  const {
    activeFilter,
    clearTransactions,
    deleteTransaction,
    openTransactionModal,
    searchQuery,
    setActiveFilter,
    setSearchQuery,
    transactions,
  } = wallet;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <ScreenTitle eyebrow="Activity" title="All entries" icon="receipt-outline" />
        <View style={styles.quickDock}>
          <TouchableOpacity style={[styles.quickButton, styles.primaryQuickButton]} onPress={() => openTransactionModal('expense')}>
            <Ionicons name="remove-circle-outline" size={21} color="#ffffff" />
            <Text style={styles.primaryQuickText}>Expense</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickButton} onPress={() => openTransactionModal('income')}>
            <Ionicons name="add-circle-outline" size={21} color="#11342d" />
            <Text style={styles.quickText}>Income</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconQuickButton} onPress={clearTransactions}>
            <Ionicons name="refresh-outline" size={21} color="#11342d" />
          </TouchableOpacity>
        </View>
        <TransactionList
          transactions={transactions}
          deleteTransaction={deleteTransaction}
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function MainApp() {
  const [transactions, setTransactions] = useState([]);
  const [isModalVisible, setModalVisible] = useState(false);
  const [transactionType, setTransactionType] = useState('expense');
  const [transactionCategory, setTransactionCategory] = useState('');
  const [transactionAmount, setTransactionAmount] = useState('');
  const [transactionNote, setTransactionNote] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [monthlyBudget, setMonthlyBudget] = useState(DEFAULT_MONTHLY_BUDGET);

  useEffect(() => {
    const loadWalletData = async () => {
      try {
        const [savedTransactions, savedBudget] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(BUDGET_KEY),
        ]);

        if (savedTransactions) {
          const parsedTransactions = JSON.parse(savedTransactions).map(normalizeTransaction);
          setTransactions(parsedTransactions);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(parsedTransactions));
        }

        const parsedBudget = Number.parseFloat(savedBudget);
        if (Number.isFinite(parsedBudget) && parsedBudget > 0) {
          setMonthlyBudget(parsedBudget);
        }
      } catch (error) {
        Alert.alert('Could not load wallet data', 'Please restart the app and try again.');
      }
    };

    loadWalletData();
  }, []);

  const stats = useMemo(() => buildStats(transactions, monthlyBudget), [monthlyBudget, transactions]);
  const insight = useMemo(() => buildInsight(stats, monthlyBudget, transactions.length), [monthlyBudget, stats, transactions.length]);

  const resetForm = () => {
    setTransactionType('expense');
    setTransactionCategory('');
    setTransactionAmount('');
    setTransactionNote('');
  };

  const openTransactionModal = (type) => {
    setTransactionType(type);
    setModalVisible(true);
  };

  const persistTransactions = async (nextTransactions) => {
    setTransactions(nextTransactions);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextTransactions));
  };

  const adjustMonthlyBudget = async (delta) => {
    const nextBudget = Math.max(1000, monthlyBudget + delta);
    setMonthlyBudget(nextBudget);
    await AsyncStorage.setItem(BUDGET_KEY, String(nextBudget));
  };

  const addTransaction = async () => {
    const amount = Number.parseFloat(transactionAmount);

    if (!transactionCategory.trim()) {
      Alert.alert('Add a category', 'Choose a quick category or type your own.');
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Enter a valid amount', 'Amount should be greater than zero.');
      return;
    }

    const signedAmount = transactionType === 'expense' ? -Math.abs(amount) : Math.abs(amount);
    const newTransaction = {
      id: `${Date.now()}`,
      category: transactionCategory.trim(),
      amount: signedAmount,
      note: transactionNote.trim(),
      type: transactionType,
      date: new Date().toISOString(),
    };

    try {
      await persistTransactions([newTransaction, ...transactions]);
      resetForm();
      setModalVisible(false);
    } catch (error) {
      Alert.alert('Could not save transaction', 'Please try again.');
    }
  };

  const deleteTransaction = async (transactionId) => {
    const nextTransactions = transactions.filter((transaction) => transaction.id !== transactionId);

    try {
      await persistTransactions(nextTransactions);
    } catch (error) {
      Alert.alert('Could not delete transaction', 'Please try again.');
    }
  };

  const clearTransactions = () => {
    if (!transactions.length) {
      return;
    }

    Alert.alert('Clear all transactions?', 'This will remove your local wallet history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          try {
            await persistTransactions([]);
          } catch (error) {
            Alert.alert('Could not clear transactions', 'Please try again.');
          }
        },
      },
    ]);
  };

  const wallet = {
    activeFilter,
    adjustMonthlyBudget,
    clearTransactions,
    deleteTransaction,
    insight,
    monthlyBudget,
    openTransactionModal,
    searchQuery,
    setActiveFilter,
    setSearchQuery,
    stats,
    transactions,
  };

  return (
    <View style={styles.appShell}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: '#11342d',
          tabBarInactiveTintColor: '#8a928c',
          tabBarLabelStyle: styles.tabLabel,
          tabBarStyle: styles.tabBar,
          tabBarIcon: ({ color, focused }) => {
            const icons = {
              Dashboard: focused ? 'home' : 'home-outline',
              Analytics: focused ? 'pie-chart' : 'pie-chart-outline',
              Activity: focused ? 'receipt' : 'receipt-outline',
              Settings: focused ? 'settings' : 'settings-outline',
            };
            return (
              <View style={[styles.tabIconWrap, focused && styles.activeTabIconWrap]}>
                <Ionicons name={icons[route.name]} size={21} color={color} />
              </View>
            );
          },
        })}
      >
        <Tab.Screen name="Dashboard">{() => <DashboardScreen wallet={wallet} />}</Tab.Screen>
        <Tab.Screen name="Analytics">{() => <AnalyticsScreen wallet={wallet} />}</Tab.Screen>
        <Tab.Screen name="Activity">{() => <ActivityScreen wallet={wallet} />}</Tab.Screen>
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>

      <TransactionModal
        isModalVisible={isModalVisible}
        toggleModal={() => {
          resetForm();
          setModalVisible(false);
        }}
        transactionType={transactionType}
        setTransactionType={setTransactionType}
        transactionCategory={transactionCategory}
        setTransactionCategory={setTransactionCategory}
        transactionAmount={transactionAmount}
        setTransactionAmount={setTransactionAmount}
        transactionNote={transactionNote}
        setTransactionNote={setTransactionNote}
        addTransaction={addTransaction}
      />
    </View>
  );
}

function buildStats(transactions, monthlyBudget) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const daysElapsed = now.getDate();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const expenseCategories = {};
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(currentYear, currentMonth, now.getDate() - (6 - index));
    return {
      key: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString('en-IN', { weekday: 'short' }),
      total: 0,
    };
  });
  const weekMap = weekDays.reduce((map, day) => {
    map[day.key] = day;
    return map;
  }, {});

  const totals = transactions.reduce(
    (summary, transaction) => {
      const date = new Date(transaction.date);
      const isThisMonth = date.getMonth() === currentMonth && date.getFullYear() === currentYear;
      const dateKey = date.toISOString().slice(0, 10);

      if (transaction.amount >= 0) {
        summary.income += transaction.amount;
        if (isThisMonth) {
          summary.monthIncome += transaction.amount;
        }
      } else {
        const expenseAmount = Math.abs(transaction.amount);
        summary.expense += expenseAmount;
        expenseCategories[transaction.category] = (expenseCategories[transaction.category] || 0) + expenseAmount;

        if (weekMap[dateKey]) {
          weekMap[dateKey].total += expenseAmount;
        }
        if (isThisMonth) {
          summary.monthExpense += expenseAmount;
        }
      }
      return summary;
    },
    { income: 0, expense: 0, monthExpense: 0, monthIncome: 0 },
  );

  const topCategories = Object.entries(expenseCategories)
    .sort(([, firstAmount], [, secondAmount]) => secondAmount - firstAmount)
    .slice(0, 6)
    .map(([category, amount]) => ({
      amount,
      category,
      percentage: totals.expense ? Math.max((amount / totals.expense) * 100, 4) : 0,
    }));
  const projectedExpense = totals.monthExpense ? (totals.monthExpense / daysElapsed) * daysInMonth : 0;
  const remainingBudget = monthlyBudget - totals.monthExpense;
  const weekMaxSpend = Math.max(...weekDays.map((day) => day.total), 1);

  return {
    ...totals,
    balance: totals.income - totals.expense,
    budgetUsedPercent: Math.min((totals.monthExpense / monthlyBudget) * 100, 100),
    count: transactions.length,
    dailyAverageExpense: totals.monthExpense / daysElapsed,
    dailyBudgetLeft: Math.max(remainingBudget, 0) / Math.max(daysInMonth - daysElapsed + 1, 1),
    daysLeft: Math.max(daysInMonth - daysElapsed + 1, 1),
    projectedExpense,
    remainingBudget,
    savingsRate: totals.monthIncome ? ((totals.monthIncome - totals.monthExpense) / totals.monthIncome) * 100 : 0,
    topCategories,
    topCategory: topCategories[0],
    weekDays,
    weekMaxSpend,
    weekSpend: weekDays.reduce((sum, day) => sum + day.total, 0),
  };
}

function buildInsight(stats, monthlyBudget, transactionCount) {
  if (!transactionCount) {
    return {
      icon: 'sparkles-outline',
      title: 'Ready for your first entry',
      body: 'Add income and expenses to unlock budget guidance.',
    };
  }

  if (stats.projectedExpense > monthlyBudget) {
    return {
      icon: 'alert-circle-outline',
      title: 'Budget watch',
      body: `Projected spend is ${currency.format(stats.projectedExpense)} this month.`,
    };
  }

  if (stats.savingsRate >= 25) {
    return {
      icon: 'shield-checkmark-outline',
      title: 'Strong savings pace',
      body: `You are saving about ${Math.round(stats.savingsRate)}% of this month's income.`,
    };
  }

  return {
    icon: 'flash-outline',
    title: 'Daily room left',
    body: `${currency.format(stats.dailyBudgetLeft)} can be spent per day to stay near budget.`,
  };
}

function StatTile({ label, value, tone = 'normal' }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tone === 'expense' && styles.statExpense]}>{value}</Text>
    </View>
  );
}

function ForecastTile({ icon, label, value, danger }) {
  return (
    <View style={styles.forecastTile}>
      <Ionicons name={icon} size={18} color="#11342d" />
      <Text style={styles.forecastLabel}>{label}</Text>
      <Text style={[styles.forecastValue, danger && styles.statExpense]}>{value}</Text>
    </View>
  );
}

function TrendPanel({ stats }) {
  return (
    <View style={styles.trendPanel}>
      <View style={styles.trendHeader}>
        <Text style={styles.trendTitle}>7-day spend</Text>
        <Text style={styles.trendAmount}>{compactCurrency.format(stats.weekSpend)}</Text>
      </View>
      <View style={styles.trendBars}>
        {stats.weekDays.map((day) => (
          <View key={day.key} style={styles.trendBarItem}>
            <View style={styles.trendBarTrack}>
              <View
                style={[
                  styles.trendBarFill,
                  { height: `${Math.max((day.total / stats.weekMaxSpend) * 100, day.total ? 14 : 4)}%` },
                ]}
              />
            </View>
            <Text style={styles.trendBarLabel}>{day.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function DonutChart({ data, total }) {
  const center = 95;
  const radius = 66;
  let startAngle = 0;

  if (!data.length || total <= 0) {
    return (
      <Svg width={190} height={190}>
        <Circle cx={center} cy={center} r={radius} stroke="#edf1ec" strokeWidth={34} fill="none" />
      </Svg>
    );
  }

  return (
    <Svg width={190} height={190}>
      <Circle cx={center} cy={center} r={radius} stroke="#edf1ec" strokeWidth={34} fill="none" />
      {data.map((item) => {
        const endAngle = startAngle + (item.amount / total) * 360;
        const path = describeArc(center, radius, startAngle, Math.min(endAngle, 359.99));
        startAngle = endAngle;
        return <Path key={item.category} d={path} stroke={item.color} strokeWidth={34} strokeLinecap="butt" fill="none" />;
      })}
    </Svg>
  );
}

function ScreenTitle({ eyebrow, title, icon }) {
  return (
    <View style={styles.screenTitleRow}>
      <View>
        <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
        <Text style={styles.screenTitle}>{title}</Text>
      </View>
      <View style={styles.statIconBubble}>
        <Ionicons name={icon} size={21} color="#11342d" />
      </View>
    </View>
  );
}

function InsightCard({ icon, label, value }) {
  return (
    <View style={styles.insightCard}>
      <Ionicons name={icon} size={20} color="#11342d" />
      <Text style={styles.insightCardLabel}>{label}</Text>
      <Text style={styles.insightCardValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function CompareBar({ label, amount, max, color }) {
  return (
    <View style={styles.compareRow}>
      <View style={styles.compareLabelRow}>
        <Text style={styles.compareLabel}>{label}</Text>
        <Text style={styles.compareAmount}>{compactCurrency.format(amount)}</Text>
      </View>
      <View style={styles.compareTrack}>
        <View style={[styles.compareFill, { backgroundColor: color, width: `${Math.max((amount / max) * 100, amount ? 8 : 0)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appShell: {
    backgroundColor: '#f7f4ef',
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#f7f4ef',
  },
  scrollContent: {
    padding: 18,
    paddingBottom: 110,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  logoImage: {
    borderRadius: 16,
    height: 48,
    width: 48,
  },
  greeting: {
    color: '#1d2528',
    fontSize: 22,
    fontWeight: '800',
  },
  subGreeting: {
    color: '#6f7770',
    fontSize: 13,
    marginTop: 2,
  },
  headerChip: {
    alignItems: 'center',
    backgroundColor: '#d8f7a6',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  balanceCard: {
    backgroundColor: '#1d2528',
    borderRadius: 8,
    padding: 20,
  },
  cardTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardLabel: {
    color: '#dfe7df',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  healthBadge: {
    alignItems: 'center',
    backgroundColor: '#d8f7a6',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  healthText: {
    color: '#0f3d31',
    fontSize: 12,
    fontWeight: '800',
  },
  balanceAmount: {
    color: '#ffffff',
    fontSize: 38,
    fontWeight: '900',
    marginTop: 18,
  },
  metricRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    flexDirection: 'row',
    marginTop: 20,
    padding: 14,
  },
  metric: {
    flex: 1,
  },
  metricDivider: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    marginHorizontal: 12,
    width: 1,
  },
  metricLabel: {
    color: '#c1cac1',
    fontSize: 12,
    marginBottom: 5,
  },
  incomeText: {
    color: '#d8f7a6',
    fontSize: 17,
    fontWeight: '800',
  },
  expenseText: {
    color: '#ffb199',
    fontSize: 17,
    fontWeight: '800',
  },
  quickDock: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 14,
  },
  quickButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e5ddd1',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 50,
  },
  primaryQuickButton: {
    backgroundColor: '#11342d',
    borderColor: '#11342d',
  },
  quickText: {
    color: '#11342d',
    fontSize: 14,
    fontWeight: '900',
  },
  primaryQuickText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  iconQuickButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e5ddd1',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    width: 52,
  },
  statsCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e5ddd1',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionEyebrow: {
    color: '#938872',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  sectionTitle: {
    color: '#1d2528',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 2,
  },
  screenTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  screenTitle: {
    color: '#1d2528',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 2,
  },
  statIconBubble: {
    alignItems: 'center',
    backgroundColor: '#edf6e1',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statTile: {
    backgroundColor: '#f7f4ef',
    borderColor: '#eee7dc',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 82,
    padding: 12,
  },
  statLabel: {
    color: '#6f7770',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
  },
  statValue: {
    color: '#11342d',
    fontSize: 21,
    fontWeight: '900',
  },
  statExpense: {
    color: '#a43e22',
  },
  budgetPanel: {
    backgroundColor: '#f4fbef',
    borderColor: '#d7e9c7',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  budgetHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  budgetLabel: {
    color: '#617064',
    fontSize: 12,
    fontWeight: '800',
  },
  budgetAmount: {
    color: '#11342d',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 2,
  },
  budgetControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  budgetControlButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d7e9c7',
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  budgetStatus: {
    color: '#0f6f4e',
    flexBasis: '100%',
    fontSize: 13,
    fontWeight: '900',
    marginTop: -2,
  },
  overBudgetStatus: {
    color: '#a43e22',
  },
  budgetTrack: {
    backgroundColor: '#dfeadb',
    borderRadius: 6,
    height: 12,
    marginTop: 12,
    overflow: 'hidden',
  },
  budgetFill: {
    backgroundColor: '#83c85a',
    borderRadius: 6,
    height: 12,
  },
  overBudgetFill: {
    backgroundColor: '#e96b4c',
  },
  insightRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  insightIcon: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  insightCopy: {
    flex: 1,
  },
  insightTitle: {
    color: '#1d2528',
    fontSize: 14,
    fontWeight: '900',
  },
  insightBody: {
    color: '#617064',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  forecastGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  forecastTile: {
    backgroundColor: '#ffffff',
    borderColor: '#e5ddd1',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 86,
    padding: 10,
  },
  forecastLabel: {
    color: '#6f7770',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 8,
  },
  forecastValue: {
    color: '#11342d',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  trendPanel: {
    backgroundColor: '#ffffff',
    borderColor: '#e5ddd1',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  trendHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  trendTitle: {
    color: '#1d2528',
    fontSize: 15,
    fontWeight: '900',
  },
  trendAmount: {
    color: '#617064',
    fontSize: 13,
    fontWeight: '900',
  },
  trendBars: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 8,
    height: 100,
  },
  trendBarItem: {
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  trendBarTrack: {
    backgroundColor: '#edf1ec',
    borderRadius: 6,
    flex: 1,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    width: '100%',
  },
  trendBarFill: {
    backgroundColor: '#83c85a',
    borderRadius: 6,
    minHeight: 4,
    width: '100%',
  },
  trendBarLabel: {
    color: '#7d867f',
    fontSize: 10,
    fontWeight: '800',
  },
  chartCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e5ddd1',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  chartWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartCenter: {
    alignItems: 'center',
    position: 'absolute',
  },
  chartCenterLabel: {
    color: '#7d867f',
    fontSize: 12,
    fontWeight: '900',
  },
  chartCenterValue: {
    color: '#1d2528',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  legendList: {
    gap: 10,
    marginTop: 14,
  },
  legendRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  legendDot: {
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  legendLabel: {
    color: '#39443e',
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
  },
  legendValue: {
    color: '#617064',
    fontSize: 13,
    fontWeight: '900',
  },
  emptyAnalytics: {
    alignItems: 'center',
    paddingVertical: 18,
  },
  emptyAnalyticsText: {
    color: '#7d867f',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 8,
  },
  analysisGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  insightCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e5ddd1',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 104,
    padding: 12,
  },
  insightCardLabel: {
    color: '#6f7770',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 10,
  },
  insightCardValue: {
    color: '#11342d',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 3,
  },
  compareCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e5ddd1',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 16,
  },
  compareTitle: {
    color: '#1d2528',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 12,
  },
  compareRow: {
    marginBottom: 12,
  },
  compareLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  compareLabel: {
    color: '#617064',
    fontSize: 13,
    fontWeight: '900',
  },
  compareAmount: {
    color: '#1d2528',
    fontSize: 13,
    fontWeight: '900',
  },
  compareTrack: {
    backgroundColor: '#edf1ec',
    borderRadius: 6,
    height: 12,
    overflow: 'hidden',
  },
  compareFill: {
    borderRadius: 6,
    height: 12,
  },
  compareFooter: {
    alignItems: 'center',
    backgroundColor: '#f4fbef',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 9,
    padding: 10,
  },
  compareFooterText: {
    color: '#617064',
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  tabBar: {
    backgroundColor: '#ffffff',
    borderTopColor: '#e5ddd1',
    height: 72,
    paddingBottom: 10,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '900',
  },
  tabIconWrap: {
    alignItems: 'center',
    borderRadius: 18,
    height: 34,
    justifyContent: 'center',
    width: 42,
  },
  activeTabIconWrap: {
    backgroundColor: '#edf6e1',
  },
});

export default MainApp;
