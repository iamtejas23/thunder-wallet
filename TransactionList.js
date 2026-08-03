import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  PanResponder,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './ThemeContext';

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const compactCurrency = new Intl.NumberFormat('en-IN', { currency: 'INR', maximumFractionDigits: 0, notation: 'compact', style: 'currency' });

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
  Fuel: { icon: 'flame', color: '#F97316' },
  Savings: { icon: 'wallet', color: '#34D399' },
  Transport: { icon: 'car', color: '#4ECDC4' },
  Investment: { icon: 'trending-up', color: '#60A5FA' },
  Bonus: { icon: 'gift', color: '#FCD34D' },
  Other: { icon: 'ellipsis-horizontal-circle', color: '#94A3B8' },
};

const getCfg = (cat) => categoryConfig[cat] || categoryConfig.Other;

const OPEN_X = -128;
const SNAP_THRESHOLD = -52; // swipe past this → snap open

function SwipeableRow({ children, onEdit, onDelete }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

  const snapOpen = () => {
    isOpen.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(translateX, { toValue: OPEN_X, useNativeDriver: true, bounciness: 4, speed: 20 }).start();
  };

  const snapClose = () => {
    isOpen.current = false;
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 20 }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      // Claim the gesture only for clear horizontal swipes
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        const base = isOpen.current ? OPEN_X : 0;
        // Only allow left swipe (negative direction), clamp to [OPEN_X, 0]
        translateX.setValue(Math.min(0, Math.max(OPEN_X, base + g.dx)));
      },
      onPanResponderRelease: (_, g) => {
        const base = isOpen.current ? OPEN_X : 0;
        const current = base + g.dx;
        // Snap based on position or fast flick velocity
        if (current < SNAP_THRESHOLD || g.vx < -0.4) snapOpen();
        else snapClose();
      },
      onPanResponderTerminate: () => snapClose(),
    })
  ).current;

  return (
    <View style={{ overflow: 'hidden' }}>
      {/* Action buttons sit behind the row */}
      <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'stretch' }]}>
        <TouchableOpacity
          style={[styles.swipeAction, { backgroundColor: '#3B82F6' }]}
          onPress={() => { snapClose(); setTimeout(onEdit, 180); }}
        >
          <Ionicons name="create-outline" size={20} color="#fff" />
          <Text style={styles.swipeActionText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.swipeAction, { backgroundColor: '#EF4444' }]}
          onPress={() => { snapClose(); setTimeout(onDelete, 180); }}
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={styles.swipeActionText}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Row content — slides with finger */}
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => { if (isOpen.current) snapClose(); }}
          delayPressIn={60}
        >
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
      const ms = !q || (t.category || '').toLowerCase().includes(q) || (t.note || '').toLowerCase().includes(q);
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

  const generatePDF = async () => {
    if (!transactions.length) { Alert.alert('Nothing to export', 'Add a transaction first.'); return; }
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const now = new Date();
      const reportDate = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      const curM = now.getMonth(), curY = now.getFullYear();

      // ── Compute summary ─────────────────────────────────────────────────────
      const allIncome  = transactions.filter((t) => t.amount >= 0).reduce((s, t) => s + t.amount, 0);
      const allExpense = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
      const mTx        = transactions.filter((t) => { const d = new Date(t.date); return d.getMonth() === curM && d.getFullYear() === curY; });
      const mIncome    = mTx.filter((t) => t.amount >= 0).reduce((s, t) => s + t.amount, 0);
      const mExpense   = mTx.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
      const savingsRate = mIncome > 0 ? Math.round(((mIncome - mExpense) / mIncome) * 100) : 0;

      // ── Category breakdown ──────────────────────────────────────────────────
      const catMap = {};
      transactions.filter((t) => t.amount < 0).forEach((t) => { catMap[t.category] = (catMap[t.category] || 0) + Math.abs(t.amount); });
      const catRows = Object.entries(catMap).sort(([, a], [, b]) => b - a).slice(0, 8);

      // ── Format helpers ──────────────────────────────────────────────────────
      const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
      const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const esc = (s) => String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

      // ── Category bar rows ───────────────────────────────────────────────────
      const maxCat = catRows[0]?.[1] || 1;
      const catHTML = catRows.map(([cat, amt]) => {
        const pct = Math.round((amt / allExpense) * 100);
        const barW = Math.round((amt / maxCat) * 100);
        return `
          <div class="cat-row">
            <div class="cat-meta">
              <span class="cat-name">${esc(cat)}</span>
              <span class="cat-amt">${fmt(amt)} <span class="cat-pct">${pct}%</span></span>
            </div>
            <div class="bar-bg"><div class="bar-fill" style="width:${barW}%"></div></div>
          </div>`;
      }).join('');

      // ── Transaction table rows ──────────────────────────────────────────────
      const txHTML = [...transactions]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .map((t, i) => {
          const isIncome = t.amount >= 0;
          const rowBg = i % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
          return `
            <tr style="background:${rowBg}">
              <td>${fmtDate(t.date)}</td>
              <td><span class="badge ${isIncome ? 'badge-in' : 'badge-ex'}">${isIncome ? 'Income' : 'Expense'}</span></td>
              <td>${esc(t.category)}</td>
              <td>${esc(t.note || '—')}</td>
              <td class="${isIncome ? 'amt-in' : 'amt-ex'}">${isIncome ? '+' : '-'}${fmt(Math.abs(t.amount))}</td>
            </tr>`;
        }).join('');

      // ── HTML template ───────────────────────────────────────────────────────
      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; background: #fff; color: #0F172A; font-size: 13px; }

  /* ── Page header ── */
  .page-header {
    background: linear-gradient(135deg, #0F172A 0%, #1E293B 60%, #1a1040 100%);
    padding: 36px 40px 28px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand-icon {
    width: 48px; height: 48px; background: rgba(167,139,250,0.2);
    border-radius: 14px; display: flex; align-items: center; justify-content: center;
    font-size: 24px;
  }
  .brand-name { color: #fff; font-size: 22px; font-weight: 900; letter-spacing: -0.5px; }
  .brand-sub  { color: rgba(255,255,255,0.5); font-size: 12px; margin-top: 2px; }
  .report-meta { text-align: right; }
  .report-title { color: rgba(255,255,255,0.9); font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
  .report-date  { color: rgba(255,255,255,0.5); font-size: 11px; margin-top: 4px; }

  /* ── Body ── */
  .body { padding: 32px 40px; }

  /* ── Section title ── */
  .section-title {
    font-size: 10px; font-weight: 800; letter-spacing: 1.4px;
    text-transform: uppercase; color: #94A3B8; margin-bottom: 14px; margin-top: 28px;
  }
  .section-title:first-child { margin-top: 0; }

  /* ── Summary grid ── */
  .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .stat-card {
    border-radius: 14px; padding: 16px; border: 1px solid #E2E8F0;
  }
  .stat-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #94A3B8; }
  .stat-value { font-size: 18px; font-weight: 900; margin-top: 5px; }
  .stat-sub   { font-size: 10px; color: #94A3B8; margin-top: 3px; }
  .card-income  { background: #F0FDF4; border-color: #BBF7D0; }
  .card-expense { background: #FFF1F2; border-color: #FECDD3; }
  .card-balance { background: #EFF6FF; border-color: #BFDBFE; }
  .card-savings { background: #FAF5FF; border-color: #E9D5FF; }
  .col-income  { color: #059669; }
  .col-expense { color: #DC2626; }
  .col-balance { color: #2563EB; }
  .col-savings { color: #7C3AED; }

  /* ── This month highlight strip ── */
  .month-strip {
    background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 14px;
    padding: 16px 20px; display: flex; gap: 0; margin-bottom: 4px;
  }
  .month-stat { flex: 1; text-align: center; }
  .month-stat + .month-stat { border-left: 1px solid #E2E8F0; }
  .month-stat-label { font-size: 10px; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.6px; }
  .month-stat-val   { font-size: 17px; font-weight: 900; margin-top: 4px; }

  /* ── Category bars ── */
  .cat-row { margin-bottom: 12px; }
  .cat-meta { display: flex; justify-content: space-between; margin-bottom: 6px; }
  .cat-name { font-size: 12px; font-weight: 700; color: #1E293B; }
  .cat-amt  { font-size: 12px; font-weight: 800; color: #1E293B; }
  .cat-pct  { font-size: 10px; font-weight: 600; color: #94A3B8; }
  .bar-bg   { background: #F1F5F9; border-radius: 6px; height: 8px; overflow: hidden; }
  .bar-fill { background: linear-gradient(90deg, #7C3AED, #A78BFA); border-radius: 6px; height: 8px; }

  /* ── Table ── */
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: #0F172A; }
  thead th { color: rgba(255,255,255,0.85); font-size: 10px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; padding: 11px 12px; text-align: left; }
  tbody td { padding: 10px 12px; font-size: 12px; color: #334155; border-bottom: 1px solid #F1F5F9; vertical-align: middle; }
  .badge { border-radius: 6px; font-size: 10px; font-weight: 800; padding: 3px 7px; }
  .badge-in  { background: #D1FAE5; color: #059669; }
  .badge-ex  { background: #FFE4E6; color: #DC2626; }
  .amt-in  { color: #059669; font-weight: 800; }
  .amt-ex  { color: #DC2626; font-weight: 800; }

  /* ── Footer ── */
  .footer {
    margin-top: 36px; padding-top: 20px; border-top: 1px solid #E2E8F0;
    display: flex; justify-content: space-between; align-items: center;
  }
  .footer-left  { font-size: 11px; color: #94A3B8; }
  .footer-right { font-size: 10px; color: #CBD5E1; }
</style>
</head>
<body>

  <!-- Page header -->
  <div class="page-header">
    <div class="brand">
      <div class="brand-icon">⚡</div>
      <div>
        <div class="brand-name">Thunder Wallet</div>
        <div class="brand-sub">Smart Expense Manager</div>
      </div>
    </div>
    <div class="report-meta">
      <div class="report-title">Financial Report</div>
      <div class="report-date">Generated ${reportDate}</div>
    </div>
  </div>

  <div class="body">

    <!-- All-time summary -->
    <div class="section-title">All-Time Overview</div>
    <div class="summary-grid">
      <div class="stat-card card-income">
        <div class="stat-label">Total Income</div>
        <div class="stat-value col-income">${fmt(allIncome)}</div>
        <div class="stat-sub">${transactions.filter((t) => t.amount >= 0).length} entries</div>
      </div>
      <div class="stat-card card-expense">
        <div class="stat-label">Total Spent</div>
        <div class="stat-value col-expense">${fmt(allExpense)}</div>
        <div class="stat-sub">${transactions.filter((t) => t.amount < 0).length} entries</div>
      </div>
      <div class="stat-card card-balance">
        <div class="stat-label">Net Balance</div>
        <div class="stat-value col-balance">${fmt(allIncome - allExpense)}</div>
        <div class="stat-sub">${transactions.length} total entries</div>
      </div>
      <div class="stat-card card-savings">
        <div class="stat-label">This Month Savings</div>
        <div class="stat-value col-savings">${savingsRate}%</div>
        <div class="stat-sub">of monthly income</div>
      </div>
    </div>

    <!-- This month -->
    <div class="section-title">This Month — ${now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</div>
    <div class="month-strip">
      <div class="month-stat">
        <div class="month-stat-label">Income</div>
        <div class="month-stat-val col-income">${fmt(mIncome)}</div>
      </div>
      <div class="month-stat">
        <div class="month-stat-label">Spent</div>
        <div class="month-stat-val col-expense">${fmt(mExpense)}</div>
      </div>
      <div class="month-stat">
        <div class="month-stat-label">Saved</div>
        <div class="month-stat-val col-savings">${fmt(mIncome - mExpense)}</div>
      </div>
      <div class="month-stat">
        <div class="month-stat-label">Transactions</div>
        <div class="month-stat-val col-balance">${mTx.length}</div>
      </div>
    </div>

    ${catRows.length ? `
    <!-- Category breakdown -->
    <div class="section-title">Spending by Category</div>
    ${catHTML}
    ` : ''}

    <!-- Transaction history -->
    <div class="section-title">All Transactions</div>
    <table>
      <thead>
        <tr>
          <th>Date</th><th>Type</th><th>Category</th><th>Note</th><th>Amount</th>
        </tr>
      </thead>
      <tbody>${txHTML}</tbody>
    </table>

    <!-- Footer -->
    <div class="footer">
      <div class="footer-left">Thunder Wallet · All data stored locally on your device · No cloud sync</div>
      <div class="footer-right">thunder-wallet-report-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.pdf</div>
    </div>

  </div>
</body>
</html>`;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const dest = `${FileSystem.documentDirectory}thunder-wallet-${curY}${String(curM + 1).padStart(2, '0')}.pdf`;
      await FileSystem.moveAsync({ from: uri, to: dest });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dest, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
      } else {
        Alert.alert('PDF saved', 'Report saved to app documents.');
      }
    } catch (err) {
      Alert.alert('Export failed', err.message || 'Could not generate PDF.');
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
                  <Text style={{ color: C.accent, fontSize: 9, fontFamily: 'DMSans_800ExtraBold' }}>{item.recurring}</Text>
                </View>
              )}
            </View>
          </View>
          <Ionicons name="chevron-back" size={12} color={C.text3} style={{ opacity: 0.4 }} />
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
          <TouchableOpacity onPress={generatePDF} style={[styles.iconBtn, { backgroundColor: C.cardInner, borderColor: C.border }]}>
            <Ionicons name="document-text-outline" size={18} color={C.income} />
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

      <Text style={[styles.swipeHintLabel, { color: C.text3 }]}>Swipe a row left to edit or delete</Text>
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
      contentContainerStyle={{ paddingBottom: 120 }}
    />
  );
};

const styles = StyleSheet.create({
  container: { borderRadius: 18, borderWidth: 1, elevation: 4, padding: 16, shadowColor: '#000', shadowOffset: { height: 6, width: 0 }, shadowOpacity: 0.15, shadowRadius: 14 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  eyebrow: { fontSize: 10, fontFamily: 'DMSans_800ExtraBold', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { fontSize: 22, fontFamily: 'DMSans_900Black', marginTop: 2 },
  headerIcons: { flexDirection: 'row', gap: 8 },
  iconBtn: { alignItems: 'center', borderRadius: 20, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  searchBox: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 44, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 14 },
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  filterChip: { alignItems: 'center', borderRadius: 20, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 4, justifyContent: 'center', minHeight: 34 },
  filterText: { fontSize: 12, fontFamily: 'DMSans_800ExtraBold' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10, marginTop: 12 },
  pill: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 4, minHeight: 28, paddingHorizontal: 9 },
  pillText: { fontSize: 11, fontFamily: 'DMSans_800ExtraBold' },
  swipeHintLabel: { fontSize: 11, fontFamily: 'DMSans_600SemiBold', textAlign: 'center', marginTop: 4, marginBottom: 4 },
  monthHeader: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 14, paddingVertical: 12 },
  monthLeft: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  monthIcon: { alignItems: 'center', borderRadius: 8, height: 26, justifyContent: 'center', width: 26 },
  monthLabel: { fontSize: 13, fontFamily: 'DMSans_800ExtraBold' },
  monthCount: { fontSize: 10, fontFamily: 'DMSans_600SemiBold', marginTop: 2 },
  monthRight: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  monthNetPill: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  monthNet: { fontSize: 12, fontFamily: 'DMSans_900Black' },
  monthSummaryBar: { borderBottomWidth: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 4, paddingVertical: 8 },
  monthStatPill: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 4, paddingHorizontal: 9, paddingVertical: 5 },
  monthStatText: { fontSize: 11, fontFamily: 'DMSans_700Bold' },
  txRow: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', minHeight: 70, paddingHorizontal: 16, paddingVertical: 12 },
  txIcon: { alignItems: 'center', borderRadius: 13, height: 40, justifyContent: 'center', marginRight: 12, width: 40 },
  txDetails: { flex: 1 },
  txTopRow: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  txCategory: { flex: 1, fontSize: 14, fontFamily: 'DMSans_800ExtraBold' },
  txAmount: { fontSize: 14, fontFamily: 'DMSans_900Black' },
  txNote: { fontSize: 12, fontFamily: 'DMSans_400Regular', marginTop: 3, lineHeight: 17 },
  txDate: { fontSize: 10, fontFamily: 'DMSans_500Medium', letterSpacing: 0.2 },
  swipeHint: { fontSize: 18, fontFamily: 'DMSans_300Light', paddingLeft: 8 },
  swipeAction: { width: 64, alignItems: 'center', justifyContent: 'center', gap: 4 },
  swipeActionText: { color: '#fff', fontSize: 10, fontFamily: 'DMSans_800ExtraBold' },
  emptyState: { alignItems: 'center', borderRadius: 18, borderWidth: 1, marginTop: 12, paddingHorizontal: 20, paddingVertical: 40 },
  emptyIconWrap: { alignItems: 'center', borderRadius: 28, borderWidth: 1, height: 68, justifyContent: 'center', width: 68 },
  emptyTitle: { fontSize: 16, fontFamily: 'DMSans_900Black', marginTop: 14 },
  emptyText: { fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' },
});

export default TransactionList;
