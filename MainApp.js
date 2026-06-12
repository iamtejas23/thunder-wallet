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
const chartColors = ['#00C853', '#FF4757', '#64B5F6', '#FFB300', '#B388FF', '#4ECDC4'];

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
  amberBg: 'rgba(255, 179, 0, 0.12)',
  blue: '#64B5F6',
  blueBg: 'rgba(100, 181, 246, 0.12)',
  purple: '#B388FF',
  purpleBg: 'rgba(179, 136, 255, 0.12)',
  tab: '#0D1526',
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
        <View style={styles.logoWrap}>
          <Image source={require('./assets/logo.png')} style={styles.logoImage} />
        </View>
        <View>
          <Text style={styles.greeting}>Thunder Wallet</Text>
          <Text style={styles.subGreeting}>Track money with clarity</Text>
        </View>
      </View>
      <View style={styles.headerChip}>
        <Ionicons name="flash" size={16} color={C.green} />
      </View>
    </View>
  );
}

function DashboardScreen({ wallet }) {
  const { insight, monthlyBudget, stats, adjustMonthlyBudget, openTransactionModal } = wallet;
  const healthScore = calculateHealthScore(stats, monthlyBudget);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <AppHeader />

        <View style={styles.balanceCard}>
          <View style={styles.balanceAccentBar} />
          <View style={styles.cardTopRow}>
            <Text style={styles.cardLabel}>Current balance</Text>
            <View style={[styles.healthBadge, stats.balance >= 0 ? styles.healthBadgeGood : styles.healthBadgeBad]}>
              <Ionicons
                name={stats.balance >= 0 ? 'trending-up' : 'warning'}
                size={13}
                color={stats.balance >= 0 ? C.green : C.red}
              />
              <Text style={[styles.healthText, stats.balance >= 0 ? styles.healthTextGood : styles.healthTextBad]}>
                {stats.balance >= 0 ? 'Healthy' : 'Overspent'}
              </Text>
            </View>
          </View>
          <Text style={styles.balanceAmount}>{currency.format(stats.balance)}</Text>
          <View style={styles.metricRow}>
            <View style={styles.metric}>
              <View style={styles.metricIconRow}>
                <View style={[styles.metricDot, { backgroundColor: C.green }]} />
                <Text style={styles.metricLabel}>Income</Text>
              </View>
              <Text style={styles.incomeText}>{currency.format(stats.income)}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metric}>
              <View style={styles.metricIconRow}>
                <View style={[styles.metricDot, { backgroundColor: C.red }]} />
                <Text style={styles.metricLabel}>Expenses</Text>
              </View>
              <Text style={styles.expenseText}>{currency.format(stats.expense)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.healthScoreRow}>
          <View style={styles.healthScoreCard}>
            <Ionicons name="shield-checkmark" size={20} color={C.green} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.healthScoreLabel}>Financial Health Score</Text>
              <View style={styles.healthScoreTrack}>
                <View style={[styles.healthScoreFill, {
                  width: `${healthScore}%`,
                  backgroundColor: healthScore >= 70 ? C.green : healthScore >= 40 ? C.amber : C.red,
                }]} />
              </View>
            </View>
            <Text style={[styles.healthScoreValue, {
              color: healthScore >= 70 ? C.green : healthScore >= 40 ? C.amber : C.red,
            }]}>{healthScore}</Text>
          </View>
        </View>

        <View style={styles.quickDock}>
          <TouchableOpacity style={[styles.quickButton, styles.incomeQuickButton]} onPress={() => openTransactionModal('income')}>
            <Ionicons name="add-circle" size={20} color={C.green} />
            <Text style={styles.quickText}>Income</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.quickButton, styles.expenseQuickButton]} onPress={() => openTransactionModal('expense')}>
            <Ionicons name="remove-circle" size={20} color={C.red} />
            <Text style={styles.expenseQuickText}>Expense</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsCard}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>This Month</Text>
              <Text style={styles.sectionTitle}>Money Pulse</Text>
            </View>
            <View style={styles.statIconBubble}>
              <Ionicons name="analytics" size={20} color={C.blue} />
            </View>
          </View>

          <View style={styles.statsGrid}>
            <StatTile icon="arrow-down-circle" iconColor={C.green} label="Month In" value={compactCurrency.format(stats.monthIncome)} />
            <StatTile icon="arrow-up-circle" iconColor={C.red} label="Month Out" value={compactCurrency.format(stats.monthExpense)} tone="expense" />
            <StatTile icon="time" iconColor={C.blue} label="Daily Avg" value={compactCurrency.format(stats.dailyAverageExpense)} />
            <StatTile
              icon="trending-up"
              iconColor={stats.savingsRate >= 0 ? C.green : C.red}
              label="Savings Rate"
              value={`${Math.round(stats.savingsRate)}%`}
              tone={stats.savingsRate < 0 ? 'expense' : 'normal'}
            />
          </View>

          <View style={styles.budgetPanel}>
            <View style={styles.budgetHeader}>
              <View>
                <Text style={styles.budgetLabel}>Monthly Budget</Text>
                <Text style={styles.budgetAmount}>{currency.format(monthlyBudget)}</Text>
              </View>
              <View style={styles.budgetControls}>
                <TouchableOpacity style={styles.budgetControlButton} onPress={() => adjustMonthlyBudget(-1000)}>
                  <Ionicons name="remove" size={18} color={C.text2} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.budgetControlButton, styles.budgetAddButton]} onPress={() => adjustMonthlyBudget(1000)}>
                  <Ionicons name="add" size={18} color={C.green} />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={[styles.budgetStatus, stats.remainingBudget < 0 && styles.overBudgetStatus]}>
              {stats.remainingBudget >= 0
                ? `${currency.format(stats.remainingBudget)} remaining`
                : `${currency.format(Math.abs(stats.remainingBudget))} over budget`}
            </Text>
            <View style={styles.budgetTrack}>
              <View
                style={[
                  styles.budgetFill,
                  stats.remainingBudget < 0 && styles.overBudgetFill,
                  { width: `${stats.budgetUsedPercent}%` },
                ]}
              />
            </View>
            <Text style={styles.budgetPercent}>{Math.round(stats.budgetUsedPercent)}% used</Text>
            <View style={styles.insightRow}>
              <View style={styles.insightIcon}>
                <Ionicons name={insight.icon} size={18} color={C.green} />
              </View>
              <View style={styles.insightCopy}>
                <Text style={styles.insightTitle}>{insight.title}</Text>
                <Text style={styles.insightBody}>{insight.body}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.forecastGrid}>
          <ForecastTile icon="calendar" label="Days Left" value={stats.daysLeft} iconColor={C.blue} />
          <ForecastTile
            icon="speedometer"
            label="Projected"
            value={compactCurrency.format(stats.projectedExpense)}
            danger={stats.projectedExpense > monthlyBudget}
            iconColor={stats.projectedExpense > monthlyBudget ? C.red : C.amber}
          />
          <ForecastTile icon="wallet" label="This Week" value={compactCurrency.format(stats.weekSpend)} iconColor={C.purple} />
        </View>

        <TrendPanel stats={stats} />
      </ScrollView>
    </SafeAreaView>
  );
}

function AnalyticsScreen({ wallet }) {
  const { monthlyBudget, stats, transactions } = wallet;
  const pieData = stats.topCategories.map((item, index) => ({
    ...item,
    color: chartColors[index % chartColors.length],
  }));
  const hasPieData = pieData.length > 0;

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <ScreenTitle eyebrow="Analytics" title="Spending Map" icon="pie-chart" iconColor={C.purple} />

        <View style={styles.chartCard}>
          <View style={styles.chartWrap}>
            <DonutChart data={pieData} total={stats.expense} />
            <View style={styles.chartCenter}>
              <Text style={styles.chartCenterLabel}>Total Spent</Text>
              <Text style={styles.chartCenterValue}>{compactCurrency.format(stats.expense)}</Text>
            </View>
          </View>
          <View style={styles.legendList}>
            {hasPieData ? (
              pieData.map((item) => (
                <View key={item.category} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <Text style={styles.legendLabel} numberOfLines={1}>{item.category}</Text>
                  <Text style={styles.legendPercent}>{Math.round(item.percentage)}%</Text>
                  <Text style={styles.legendValue}>{compactCurrency.format(item.amount)}</Text>
                </View>
              ))
            ) : (
              <View style={styles.emptyAnalytics}>
                <Ionicons name="pie-chart-outline" size={36} color={C.text3} />
                <Text style={styles.emptyAnalyticsText}>Add expenses to see your spending chart.</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.analysisGrid}>
          <InsightCard icon="flame" iconColor="#FF6B6B" label="Top Category" value={stats.topCategory?.category || 'None'} />
          <InsightCard icon="cash" iconColor={C.green} label="Top Spend" value={stats.topCategory ? compactCurrency.format(stats.topCategory.amount) : '₹0'} />
          <InsightCard icon="shield-checkmark" iconColor={C.blue} label="Budget Used" value={`${Math.round(stats.budgetUsedPercent)}%`} />
          <InsightCard icon="trail-sign" iconColor={C.amber} label="Runway" value={`${stats.daysLeft} days`} />
        </View>

        <View style={styles.compareCard}>
          <Text style={styles.compareTitle}>Income vs Expense</Text>
          <CompareBar label="Income" amount={stats.monthIncome} max={Math.max(stats.monthIncome, stats.monthExpense, 1)} color={C.green} />
          <CompareBar label="Expense" amount={stats.monthExpense} max={Math.max(stats.monthIncome, stats.monthExpense, 1)} color={C.red} />
          <View style={[styles.compareFooter, stats.projectedExpense > monthlyBudget ? styles.compareFooterWarn : styles.compareFooterOk]}>
            <Ionicons
              name={stats.projectedExpense > monthlyBudget ? 'alert-circle' : 'checkmark-circle'}
              size={18}
              color={stats.projectedExpense > monthlyBudget ? C.amber : C.green}
            />
            <Text style={styles.compareFooterText}>
              {stats.projectedExpense > monthlyBudget
                ? `Projected ${compactCurrency.format(stats.projectedExpense)} — above budget. Slow down spending.`
                : 'Projected spend is within budget. Great pace!'}
            </Text>
          </View>
        </View>

        {monthlyBreakdown.length > 1 && (
          <View style={styles.monthlyCard}>
            <Text style={styles.compareTitle}>Monthly Spending</Text>
            {monthlyBreakdown.map((m) => (
              <CompareBar key={m.key} label={m.label} amount={m.total} max={maxMonthSpend} color={C.blue} />
            ))}
          </View>
        )}
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
        <ScreenTitle eyebrow="Activity" title="All Entries" icon="receipt" iconColor={C.amber} />
        <View style={styles.quickDock}>
          <TouchableOpacity style={[styles.quickButton, styles.primaryQuickButton]} onPress={() => openTransactionModal('expense')}>
            <Ionicons name="remove-circle" size={20} color="#ffffff" />
            <Text style={styles.primaryQuickText}>Expense</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.quickButton, styles.incomeQuickButton]} onPress={() => openTransactionModal('income')}>
            <Ionicons name="add-circle" size={20} color={C.green} />
            <Text style={styles.quickText}>Income</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconQuickButton} onPress={clearTransactions}>
            <Ionicons name="trash-outline" size={20} color={C.red} />
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
          const parsed = JSON.parse(savedTransactions).map(normalizeTransaction);
          setTransactions(parsed);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        }
        const parsedBudget = Number.parseFloat(savedBudget);
        if (Number.isFinite(parsedBudget) && parsedBudget > 0) {
          setMonthlyBudget(parsedBudget);
        }
      } catch {
        Alert.alert('Load error', 'Could not load wallet data. Please restart the app.');
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

  const persistTransactions = async (next) => {
    setTransactions(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const adjustMonthlyBudget = async (delta) => {
    const next = Math.max(1000, monthlyBudget + delta);
    setMonthlyBudget(next);
    await AsyncStorage.setItem(BUDGET_KEY, String(next));
  };

  const addTransaction = async () => {
    const amount = Number.parseFloat(transactionAmount);
    if (!transactionCategory.trim()) {
      Alert.alert('Missing category', 'Choose a quick category or type your own.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Invalid amount', 'Amount must be greater than zero.');
      return;
    }
    const signedAmount = transactionType === 'expense' ? -Math.abs(amount) : Math.abs(amount);
    const newTx = {
      id: `${Date.now()}`,
      category: transactionCategory.trim(),
      amount: signedAmount,
      note: transactionNote.trim(),
      type: transactionType,
      date: new Date().toISOString(),
    };
    try {
      await persistTransactions([newTx, ...transactions]);
      resetForm();
      setModalVisible(false);
    } catch {
      Alert.alert('Save error', 'Could not save transaction. Please try again.');
    }
  };

  const deleteTransaction = async (id) => {
    try {
      await persistTransactions(transactions.filter((t) => t.id !== id));
    } catch {
      Alert.alert('Delete error', 'Could not delete transaction. Please try again.');
    }
  };

  const clearTransactions = () => {
    if (!transactions.length) return;
    Alert.alert('Clear all transactions?', 'This will permanently remove your local wallet history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All',
        style: 'destructive',
        onPress: async () => {
          try {
            await persistTransactions([]);
          } catch {
            Alert.alert('Clear error', 'Could not clear transactions. Please try again.');
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
          tabBarActiveTintColor: C.green,
          tabBarInactiveTintColor: C.text3,
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
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentYear, currentMonth, now.getDate() - (6 - i));
    return {
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('en-IN', { weekday: 'short' }),
      total: 0,
    };
  });
  const weekMap = weekDays.reduce((m, d) => { m[d.key] = d; return m; }, {});

  const totals = transactions.reduce(
    (s, t) => {
      const d = new Date(t.date);
      const isThisMonth = d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      const dateKey = d.toISOString().slice(0, 10);
      if (t.amount >= 0) {
        s.income += t.amount;
        if (isThisMonth) s.monthIncome += t.amount;
      } else {
        const abs = Math.abs(t.amount);
        s.expense += abs;
        expenseCategories[t.category] = (expenseCategories[t.category] || 0) + abs;
        if (weekMap[dateKey]) weekMap[dateKey].total += abs;
        if (isThisMonth) s.monthExpense += abs;
      }
      return s;
    },
    { income: 0, expense: 0, monthExpense: 0, monthIncome: 0 },
  );

  const topCategories = Object.entries(expenseCategories)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([category, amount]) => ({
      amount,
      category,
      percentage: totals.expense ? Math.max((amount / totals.expense) * 100, 4) : 0,
    }));

  const projectedExpense = totals.monthExpense ? (totals.monthExpense / daysElapsed) * daysInMonth : 0;
  const remainingBudget = monthlyBudget - totals.monthExpense;
  const weekMaxSpend = Math.max(...weekDays.map((d) => d.total), 1);

  return {
    ...totals,
    balance: totals.income - totals.expense,
    budgetUsedPercent: Math.min((totals.monthExpense / monthlyBudget) * 100, 100),
    count: transactions.length,
    dailyAverageExpense: totals.monthExpense / Math.max(daysElapsed, 1),
    dailyBudgetLeft: Math.max(remainingBudget, 0) / Math.max(daysInMonth - daysElapsed + 1, 1),
    daysLeft: Math.max(daysInMonth - daysElapsed + 1, 1),
    projectedExpense,
    remainingBudget,
    savingsRate: totals.monthIncome ? ((totals.monthIncome - totals.monthExpense) / totals.monthIncome) * 100 : 0,
    topCategories,
    topCategory: topCategories[0],
    weekDays,
    weekMaxSpend,
    weekSpend: weekDays.reduce((s, d) => s + d.total, 0),
  };
}

function buildInsight(stats, monthlyBudget, count) {
  if (!count) {
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
      body: `Saving ${Math.round(stats.savingsRate)}% of this month's income.`,
    };
  }
  return {
    icon: 'flash-outline',
    title: 'Daily room left',
    body: `${currency.format(stats.dailyBudgetLeft)} per day to stay on budget.`,
  };
}

function calculateHealthScore(stats, monthlyBudget) {
  let score = 40;
  score += Math.min(Math.max(stats.savingsRate, 0), 30);
  if (stats.budgetUsedPercent <= 100) score += Math.max(0, 20 - stats.budgetUsedPercent / 10);
  if (stats.count > 0) score += 5;
  if (stats.balance > 0) score += 5;
  return Math.min(100, Math.max(0, Math.round(score)));
}

function StatTile({ icon, iconColor, label, value, tone = 'normal' }) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statTileIcon, { backgroundColor: `${iconColor}18` }]}>
        <Ionicons name={icon} size={16} color={iconColor} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tone === 'expense' && styles.statExpense]}>{value}</Text>
    </View>
  );
}

function ForecastTile({ icon, iconColor, label, value, danger }) {
  return (
    <View style={styles.forecastTile}>
      <View style={[styles.forecastIcon, { backgroundColor: `${iconColor}18` }]}>
        <Ionicons name={icon} size={16} color={iconColor} />
      </View>
      <Text style={styles.forecastLabel}>{label}</Text>
      <Text style={[styles.forecastValue, danger && styles.statExpense]}>{value}</Text>
    </View>
  );
}

function TrendPanel({ stats }) {
  return (
    <View style={styles.trendPanel}>
      <View style={styles.trendHeader}>
        <View style={styles.trendTitleRow}>
          <Ionicons name="bar-chart" size={16} color={C.blue} />
          <Text style={styles.trendTitle}>7-day Spending</Text>
        </View>
        <Text style={styles.trendAmount}>{compactCurrency.format(stats.weekSpend)}</Text>
      </View>
      <View style={styles.trendBars}>
        {stats.weekDays.map((day) => (
          <View key={day.key} style={styles.trendBarItem}>
            <View style={styles.trendBarTrack}>
              <View
                style={[
                  styles.trendBarFill,
                  { height: `${Math.max((day.total / stats.weekMaxSpend) * 100, day.total ? 12 : 3)}%` },
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
        <Circle cx={center} cy={center} r={radius} stroke={C.border} strokeWidth={30} fill="none" />
      </Svg>
    );
  }
  return (
    <Svg width={190} height={190}>
      <Circle cx={center} cy={center} r={radius} stroke={C.border} strokeWidth={30} fill="none" />
      {data.map((item) => {
        const endAngle = startAngle + (item.amount / total) * 360;
        const path = describeArc(center, radius, startAngle, Math.min(endAngle, 359.99));
        startAngle = endAngle;
        return <Path key={item.category} d={path} stroke={item.color} strokeWidth={30} strokeLinecap="butt" fill="none" />;
      })}
    </Svg>
  );
}

function ScreenTitle({ eyebrow, title, icon, iconColor }) {
  return (
    <View style={styles.screenTitleRow}>
      <View>
        <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
        <Text style={styles.screenTitle}>{title}</Text>
      </View>
      <View style={[styles.statIconBubble, { backgroundColor: `${iconColor}18` }]}>
        <Ionicons name={icon} size={21} color={iconColor} />
      </View>
    </View>
  );
}

function InsightCard({ icon, iconColor, label, value }) {
  return (
    <View style={styles.insightCard}>
      <View style={[styles.insightCardIcon, { backgroundColor: `${iconColor}18` }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
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
        <View style={[styles.compareFill, { backgroundColor: color, width: `${Math.max((amount / max) * 100, amount ? 6 : 0)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appShell: {
    backgroundColor: C.bg,
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 110,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  logoWrap: {
    backgroundColor: C.cardInner,
    borderRadius: 14,
    padding: 2,
  },
  logoImage: {
    borderRadius: 12,
    height: 42,
    width: 42,
  },
  greeting: {
    color: C.text1,
    fontSize: 20,
    fontWeight: '900',
  },
  subGreeting: {
    color: C.text2,
    fontSize: 12,
    marginTop: 2,
  },
  headerChip: {
    alignItems: 'center',
    backgroundColor: C.greenBg,
    borderColor: `${C.green}30`,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  balanceCard: {
    backgroundColor: C.card,
    borderColor: C.border,
    borderRadius: 20,
    borderWidth: 1,
    elevation: 10,
    overflow: 'hidden',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
  },
  balanceAccentBar: {
    backgroundColor: C.green,
    borderRadius: 2,
    height: 3,
    left: 20,
    position: 'absolute',
    right: 20,
    top: 0,
  },
  cardTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  cardLabel: {
    color: C.text2,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  healthBadge: {
    alignItems: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  healthBadgeGood: {
    backgroundColor: C.greenBg,
    borderColor: `${C.green}30`,
    borderWidth: 1,
  },
  healthBadgeBad: {
    backgroundColor: C.redBg,
    borderColor: `${C.red}30`,
    borderWidth: 1,
  },
  healthText: {
    fontSize: 11,
    fontWeight: '800',
  },
  healthTextGood: {
    color: C.green,
  },
  healthTextBad: {
    color: C.red,
  },
  balanceAmount: {
    color: C.text1,
    fontSize: 38,
    fontWeight: '900',
    marginTop: 16,
    letterSpacing: -0.5,
  },
  metricRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: C.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 18,
    padding: 14,
  },
  metric: {
    flex: 1,
  },
  metricIconRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  metricDot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  metricDivider: {
    backgroundColor: C.border,
    marginHorizontal: 14,
    width: 1,
  },
  metricLabel: {
    color: C.text2,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  incomeText: {
    color: C.greenBright,
    fontSize: 17,
    fontWeight: '800',
  },
  expenseText: {
    color: C.red,
    fontSize: 17,
    fontWeight: '800',
  },
  healthScoreRow: {
    marginTop: 12,
  },
  healthScoreCard: {
    alignItems: 'center',
    backgroundColor: C.card,
    borderColor: C.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 14,
    gap: 2,
  },
  healthScoreLabel: {
    color: C.text2,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  healthScoreTrack: {
    backgroundColor: C.cardInner,
    borderRadius: 4,
    height: 6,
    overflow: 'hidden',
  },
  healthScoreFill: {
    borderRadius: 4,
    height: 6,
  },
  healthScoreValue: {
    fontSize: 22,
    fontWeight: '900',
    marginLeft: 10,
    minWidth: 38,
    textAlign: 'right',
  },
  quickDock: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 14,
  },
  quickButton: {
    alignItems: 'center',
    backgroundColor: C.card,
    borderColor: C.border,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 52,
  },
  incomeQuickButton: {
    backgroundColor: C.greenBg,
    borderColor: `${C.green}30`,
  },
  expenseQuickButton: {
    backgroundColor: C.redBg,
    borderColor: `${C.red}30`,
  },
  primaryQuickButton: {
    backgroundColor: C.green,
    borderColor: C.green,
  },
  quickText: {
    color: C.green,
    fontSize: 14,
    fontWeight: '900',
  },
  expenseQuickText: {
    color: C.red,
    fontSize: 14,
    fontWeight: '900',
  },
  primaryQuickText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '900',
  },
  iconQuickButton: {
    alignItems: 'center',
    backgroundColor: C.redBg,
    borderColor: `${C.red}30`,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    width: 52,
  },
  statsCard: {
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
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionEyebrow: {
    color: C.text3,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    color: C.text1,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 2,
  },
  screenTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  screenTitle: {
    color: C.text1,
    fontSize: 28,
    fontWeight: '900',
    marginTop: 2,
  },
  statIconBubble: {
    alignItems: 'center',
    backgroundColor: C.cardInner,
    borderRadius: 20,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statTile: {
    backgroundColor: C.cardInner,
    borderColor: C.border,
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 88,
    padding: 12,
  },
  statTileIcon: {
    alignItems: 'center',
    borderRadius: 10,
    height: 30,
    justifyContent: 'center',
    marginBottom: 8,
    width: 30,
  },
  statLabel: {
    color: C.text2,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    color: C.text1,
    fontSize: 20,
    fontWeight: '900',
  },
  statExpense: {
    color: C.red,
  },
  budgetPanel: {
    backgroundColor: C.cardInner,
    borderColor: C.border,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
  },
  budgetHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  budgetLabel: {
    color: C.text2,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  budgetAmount: {
    color: C.text1,
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
    backgroundColor: C.card,
    borderColor: C.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  budgetAddButton: {
    borderColor: `${C.green}40`,
  },
  budgetStatus: {
    color: C.green,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 10,
  },
  overBudgetStatus: {
    color: C.red,
  },
  budgetTrack: {
    backgroundColor: C.card,
    borderRadius: 6,
    height: 10,
    marginTop: 8,
    overflow: 'hidden',
  },
  budgetFill: {
    backgroundColor: C.green,
    borderRadius: 6,
    height: 10,
  },
  overBudgetFill: {
    backgroundColor: C.red,
  },
  budgetPercent: {
    color: C.text2,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 5,
    textAlign: 'right',
  },
  insightRow: {
    alignItems: 'center',
    backgroundColor: C.card,
    borderColor: C.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    padding: 12,
  },
  insightIcon: {
    alignItems: 'center',
    backgroundColor: C.greenBg,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  insightCopy: {
    flex: 1,
  },
  insightTitle: {
    color: C.text1,
    fontSize: 13,
    fontWeight: '800',
  },
  insightBody: {
    color: C.text2,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  forecastGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  forecastTile: {
    backgroundColor: C.card,
    borderColor: C.border,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    minHeight: 90,
    padding: 12,
  },
  forecastIcon: {
    alignItems: 'center',
    borderRadius: 10,
    height: 28,
    justifyContent: 'center',
    marginBottom: 8,
    width: 28,
  },
  forecastLabel: {
    color: C.text2,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  forecastValue: {
    color: C.text1,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 3,
  },
  trendPanel: {
    backgroundColor: C.card,
    borderColor: C.border,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 12,
    padding: 16,
  },
  trendHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  trendTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  trendTitle: {
    color: C.text1,
    fontSize: 15,
    fontWeight: '900',
  },
  trendAmount: {
    color: C.blue,
    fontSize: 14,
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
    backgroundColor: C.cardInner,
    borderRadius: 6,
    flex: 1,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    width: '100%',
  },
  trendBarFill: {
    backgroundColor: C.green,
    borderRadius: 6,
    minHeight: 3,
    width: '100%',
  },
  trendBarLabel: {
    color: C.text2,
    fontSize: 10,
    fontWeight: '700',
  },
  chartCard: {
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
  chartWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartCenter: {
    alignItems: 'center',
    position: 'absolute',
  },
  chartCenterLabel: {
    color: C.text2,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chartCenterValue: {
    color: C.text1,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  legendList: {
    gap: 10,
    marginTop: 16,
  },
  legendRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  legendDot: {
    borderRadius: 6,
    height: 10,
    width: 10,
  },
  legendLabel: {
    color: C.text1,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  legendPercent: {
    color: C.text2,
    fontSize: 12,
    fontWeight: '700',
    minWidth: 34,
    textAlign: 'right',
  },
  legendValue: {
    color: C.text1,
    fontSize: 13,
    fontWeight: '800',
    minWidth: 54,
    textAlign: 'right',
  },
  emptyAnalytics: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyAnalyticsText: {
    color: C.text2,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
  },
  analysisGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  insightCard: {
    backgroundColor: C.card,
    borderColor: C.border,
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 108,
    padding: 14,
  },
  insightCardIcon: {
    alignItems: 'center',
    borderRadius: 10,
    height: 32,
    justifyContent: 'center',
    marginBottom: 8,
    width: 32,
  },
  insightCardLabel: {
    color: C.text2,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  insightCardValue: {
    color: C.text1,
    fontSize: 17,
    fontWeight: '900',
  },
  compareCard: {
    backgroundColor: C.card,
    borderColor: C.border,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 12,
    padding: 16,
  },
  monthlyCard: {
    backgroundColor: C.card,
    borderColor: C.border,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 12,
    padding: 16,
  },
  compareTitle: {
    color: C.text1,
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 14,
  },
  compareRow: {
    marginBottom: 14,
  },
  compareLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  compareLabel: {
    color: C.text2,
    fontSize: 13,
    fontWeight: '700',
  },
  compareAmount: {
    color: C.text1,
    fontSize: 13,
    fontWeight: '800',
  },
  compareTrack: {
    backgroundColor: C.cardInner,
    borderRadius: 6,
    height: 10,
    overflow: 'hidden',
  },
  compareFill: {
    borderRadius: 6,
    height: 10,
  },
  compareFooter: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    marginTop: 4,
  },
  compareFooterOk: {
    backgroundColor: C.greenBg,
    borderColor: `${C.green}25`,
    borderWidth: 1,
  },
  compareFooterWarn: {
    backgroundColor: C.amberBg,
    borderColor: `${C.amber}25`,
    borderWidth: 1,
  },
  compareFooterText: {
    color: C.text2,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  tabBar: {
    backgroundColor: C.tab,
    borderTopColor: C.border,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    elevation: 14,
    height: 76,
    paddingBottom: 12,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOffset: { height: -6, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  tabIconWrap: {
    alignItems: 'center',
    borderRadius: 18,
    height: 34,
    justifyContent: 'center',
    width: 44,
  },
  activeTabIconWrap: {
    backgroundColor: C.greenBg,
  },
});

export default MainApp;
