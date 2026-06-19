import React, { useState } from 'react';
import {
  Alert,
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
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from './ThemeContext';

const expenseCategories = [
  { icon: 'restaurant', label: 'Food', color: '#F87171' },
  { icon: 'car', label: 'Travel', color: '#4ECDC4' },
  { icon: 'bag-handle', label: 'Shopping', color: '#A78BFA' },
  { icon: 'document-text', label: 'Bills', color: '#FCD34D' },
  { icon: 'home', label: 'Rent', color: '#60A5FA' },
  { icon: 'medkit', label: 'Health', color: '#F87171' },
  { icon: 'game-controller', label: 'Entertainment', color: '#FCD34D' },
  { icon: 'cart', label: 'Groceries', color: '#FB923C' },
  { icon: 'school', label: 'Education', color: '#A78BFA' },
  { icon: 'ellipsis-horizontal-circle', label: 'Other', color: '#94A3B8' },
];

const incomeCategories = [
  { icon: 'briefcase', label: 'Salary', color: '#34D399' },
  { icon: 'laptop', label: 'Freelance', color: '#34D399' },
  { icon: 'trending-up', label: 'Investment', color: '#60A5FA' },
  { icon: 'gift', label: 'Gift', color: '#FCD34D' },
  { icon: 'cash', label: 'Bonus', color: '#4ECDC4' },
  { icon: 'ellipsis-horizontal-circle', label: 'Other', color: '#94A3B8' },
];

const amountPresets = {
  expense: ['100', '250', '500', '1000'],
  income: ['1000', '5000', '15000', '30000'],
};

const RECURRING_OPTIONS = [
  { key: null, label: 'One-time' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

function DatePicker({ value, onChange, C }) {
  const [showPicker, setShowPicker] = useState(false);
  const [inputVal, setInputVal] = useState(() => {
    const d = new Date(value);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  });

  const commitDate = (text) => {
    setInputVal(text);
    const parts = text.trim().split('/');
    if (parts.length === 3) {
      const d = new Date(+parts[2], +parts[1] - 1, +parts[0]);
      if (!Number.isNaN(d.getTime())) onChange(d.toISOString());
    }
  };

  const quickDates = [
    { label: 'Today', date: new Date() },
    { label: 'Yesterday', date: (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d; })() },
    { label: '2 days ago', date: (() => { const d = new Date(); d.setDate(d.getDate() - 2); return d; })() },
  ];

  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.label, { color: C.text1 }]}>Date</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        {quickDates.map((q) => {
          const iso = q.date.toISOString();
          const isActive = value.slice(0, 10) === iso.slice(0, 10);
          return (
            <TouchableOpacity
              key={q.label}
              style={[styles.presetChip, { backgroundColor: C.cardInner, borderColor: C.border }, isActive && { backgroundColor: C.accentBg, borderColor: C.accentBorder }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onChange(iso);
                const d = q.date;
                setInputVal(`${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`);
              }}
            >
              <Text style={[styles.presetText, { color: isActive ? C.accent : C.text2 }]}>{q.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TextInput
        style={[styles.input, { backgroundColor: C.cardInner, borderColor: C.border, color: C.text1 }]}
        value={inputVal}
        onChangeText={commitDate}
        placeholder="DD/MM/YYYY"
        placeholderTextColor={C.text3}
        keyboardType="number-pad"
      />
    </View>
  );
}

const TransactionModal = ({
  isModalVisible,
  toggleModal,
  transactionType,
  setTransactionType,
  transactionCategory,
  setTransactionCategory,
  transactionAmount,
  setTransactionAmount,
  transactionNote,
  setTransactionNote,
  transactionDate,
  setTransactionDate,
  transactionRecurring,
  setTransactionRecurring,
  transactionImage,
  setTransactionImage,
  addTransaction,
  editingTransaction,
}) => {
  const { C } = useTheme();
  const categories = transactionType === 'income' ? incomeCategories : expenseCategories;
  const isExpense = transactionType === 'expense';
  const typeColor = isExpense ? C.expense : C.income;
  const typeBg = isExpense ? C.expenseBg : C.incomeBg;
  const isEditing = !!editingTransaction;

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addTransaction();
  };

  const pickImage = async (fromCamera) => {
    try {
      let result;
      if (fromCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed', 'Camera access is required to take a photo.'); return; }
        result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.75 });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed', 'Gallery access is required to pick an image.'); return; }
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.75 });
      }
      if (!result.canceled && result.assets?.length) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setTransactionImage(result.assets[0].uri);
      }
    } catch { Alert.alert('Error', 'Could not open image picker.'); }
  };

  const showImageOptions = () => {
    Alert.alert('Attach Receipt', 'Choose a source', [
      { text: 'Camera',  onPress: () => pickImage(true)  },
      { text: 'Gallery', onPress: () => pickImage(false) },
      { text: 'Cancel',  style: 'cancel'                 },
    ]);
  };

  return (
    <Modal animationType="slide" transparent visible={isModalVisible} onRequestClose={toggleModal}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <Pressable style={styles.backdrop} onPress={toggleModal} />
        <View style={[styles.sheet, { backgroundColor: C.card, borderTopColor: C.border }]}>
          <View style={[styles.handle, { backgroundColor: C.border }]} />

          <View style={styles.modalHeader}>
            <View>
              <Text style={[styles.eyebrow, { color: C.text3 }]}>{isEditing ? 'Edit Entry' : 'New Entry'}</Text>
              <Text style={[styles.modalTitle, { color: C.text1 }]}>{isEditing ? 'Edit Transaction' : 'Add Transaction'}</Text>
            </View>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: C.cardInner, borderColor: C.border }]} onPress={toggleModal}>
              <Ionicons name="close" size={19} color={C.text2} />
            </TouchableOpacity>
          </View>

          {/* Type Toggle */}
          <View style={[styles.segment, { backgroundColor: C.cardInner, borderColor: C.border }]}>
            {['expense', 'income'].map((type) => {
              const tc = type === 'expense' ? C.expense : C.income;
              const tbg = type === 'expense' ? C.expenseBg : C.incomeBg;
              const active = transactionType === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.segBtn, active && { backgroundColor: tbg, borderColor: `${tc}50`, borderWidth: 1, borderRadius: 10 }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setTransactionType(type);
                    setTransactionCategory('');
                  }}
                >
                  <Ionicons name={type === 'expense' ? 'arrow-up-circle' : 'arrow-down-circle'} size={17} color={active ? tc : C.text2} />
                  <Text style={[styles.segText, { color: active ? tc : C.text2 }]}>
                    {type === 'expense' ? 'Expense' : 'Income'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Category */}
            <Text style={[styles.label, { color: C.text1 }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
              {categories.map((cat) => {
                const sel = transactionCategory === cat.label;
                return (
                  <TouchableOpacity
                    key={cat.label}
                    style={[styles.catChip, { backgroundColor: C.cardInner, borderColor: C.border }, sel && { backgroundColor: `${cat.color}18`, borderColor: `${cat.color}55` }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTransactionCategory(cat.label); }}
                  >
                    <View style={[styles.catIconWrap, { backgroundColor: `${cat.color}18` }]}>
                      <Ionicons name={cat.icon} size={14} color={sel ? cat.color : C.text2} />
                    </View>
                    <Text style={[styles.catText, { color: sel ? cat.color : C.text2 }]}>{cat.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TextInput
              style={[styles.input, { backgroundColor: C.cardInner, borderColor: C.border, color: C.text1 }]}
              placeholder="Custom category"
              placeholderTextColor={C.text3}
              value={transactionCategory}
              onChangeText={setTransactionCategory}
            />

            {/* Amount */}
            <Text style={[styles.label, { color: C.text1 }]}>Amount</Text>
            <View style={[styles.amountWrap, { backgroundColor: C.cardInner, borderColor: `${typeColor}45` }]}>
              <Text style={[styles.rupee, { color: typeColor }]}>₹</Text>
              <TextInput
                style={[styles.amountInput, { color: C.text1 }]}
                placeholder="0.00"
                placeholderTextColor={C.text3}
                keyboardType="decimal-pad"
                value={transactionAmount}
                onChangeText={setTransactionAmount}
              />
              {!!transactionAmount && (
                <TouchableOpacity onPress={() => setTransactionAmount('')}>
                  <Ionicons name="close-circle" size={17} color={C.text3} />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.presetRow}>
              {amountPresets[transactionType].map((amt) => {
                const sel = transactionAmount === amt;
                return (
                  <TouchableOpacity
                    key={amt}
                    style={[styles.presetChip, { backgroundColor: C.cardInner, borderColor: C.border }, sel && { backgroundColor: typeBg, borderColor: `${typeColor}55` }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTransactionAmount(amt); }}
                  >
                    <Text style={[styles.presetText, { color: sel ? typeColor : C.text2 }]}>₹{amt}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Date */}
            <DatePicker value={transactionDate} onChange={setTransactionDate} C={C} />

            {/* Note */}
            <Text style={[styles.label, { color: C.text1 }]}>
              Note <Text style={{ color: C.text3, fontSize: 11, fontWeight: '500', textTransform: 'none' }}>(optional)</Text>
            </Text>
            <TextInput
              style={[styles.input, styles.noteInput, { backgroundColor: C.cardInner, borderColor: C.border, color: C.text1 }]}
              placeholder="What was this for?"
              placeholderTextColor={C.text3}
              value={transactionNote}
              onChangeText={setTransactionNote}
              multiline
            />

            {/* Recurring */}
            <Text style={[styles.label, { color: C.text1 }]}>Repeat</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              {RECURRING_OPTIONS.map((opt) => {
                const active = transactionRecurring === opt.key;
                return (
                  <TouchableOpacity
                    key={String(opt.key)}
                    style={[styles.presetChip, { backgroundColor: C.cardInner, borderColor: C.border, flex: 1, justifyContent: 'center' }, active && { backgroundColor: C.accentBg, borderColor: C.accentBorder }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTransactionRecurring(opt.key); }}
                  >
                    <Text style={[styles.presetText, { color: active ? C.accent : C.text2 }]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Receipt Image */}
            <Text style={[styles.label, { color: C.text1 }]}>
              Receipt <Text style={{ color: C.text3, fontSize: 11, fontWeight: '500', textTransform: 'none' }}>(optional)</Text>
            </Text>
            {transactionImage ? (
              <View style={{ marginBottom: 16 }}>
                <Image source={{ uri: transactionImage }} style={styles.receiptPreview} resizeMode="cover" />
                <TouchableOpacity
                  style={[styles.removeImgBtn, { backgroundColor: C.cardInner, borderColor: C.border }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTransactionImage(null); }}
                >
                  <Ionicons name="trash-outline" size={14} color="#EF4444" />
                  <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700' }}>Remove</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.attachBtn, { backgroundColor: C.cardInner, borderColor: C.border }]}
                onPress={showImageOptions}
              >
                <Ionicons name="camera-outline" size={20} color={C.text2} />
                <Text style={[styles.attachText, { color: C.text2 }]}>Attach Receipt Photo</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: typeColor, shadowColor: typeColor }]}
            onPress={handleSave}
          >
            <Ionicons name={isEditing ? 'create' : 'checkmark-circle'} size={21} color={isExpense ? '#fff' : '#000'} />
            <Text style={[styles.saveBtnText, { color: isExpense ? '#fff' : '#000' }]}>
              {isEditing ? 'Update' : `Save ${isExpense ? 'Expense' : 'Income'}`}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.72)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, maxHeight: '93%', padding: 20, paddingBottom: 34 },
  handle: { alignSelf: 'center', borderRadius: 3, height: 4, marginBottom: 16, width: 40 },
  modalHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  modalTitle: { fontSize: 24, fontWeight: '900', marginTop: 2 },
  closeBtn: { alignItems: 'center', borderRadius: 20, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  segment: { borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 6, marginBottom: 20, padding: 5 },
  segBtn: { alignItems: 'center', borderRadius: 10, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 44 },
  segText: { fontSize: 14, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8, textTransform: 'uppercase' },
  catChip: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 9 },
  catIconWrap: { alignItems: 'center', borderRadius: 8, height: 24, justifyContent: 'center', width: 24 },
  catText: { fontSize: 13, fontWeight: '700' },
  input: { borderRadius: 12, borderWidth: 1, fontSize: 15, marginBottom: 16, minHeight: 48, paddingHorizontal: 14, paddingVertical: 12 },
  amountWrap: { alignItems: 'center', borderRadius: 14, borderWidth: 2, flexDirection: 'row', marginBottom: 12, minHeight: 60, paddingHorizontal: 16 },
  rupee: { fontSize: 22, fontWeight: '900', marginRight: 8 },
  amountInput: { flex: 1, fontSize: 28, fontWeight: '900' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  presetChip: { alignItems: 'center', borderRadius: 20, borderWidth: 1, justifyContent: 'center', minHeight: 34, paddingHorizontal: 14 },
  presetText: { fontSize: 13, fontWeight: '800' },
  noteInput: { minHeight: 72, paddingTop: 12, textAlignVertical: 'top' },
  saveBtn: { alignItems: 'center', borderRadius: 14, elevation: 6, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 8, minHeight: 56, shadowOffset: { height: 8, width: 0 }, shadowOpacity: 0.35, shadowRadius: 16 },
  saveBtnText: { fontSize: 16, fontWeight: '900', letterSpacing: 0.3 },
  attachBtn: { alignItems: 'center', borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', flexDirection: 'row', gap: 10, justifyContent: 'center', marginBottom: 16, minHeight: 52 },
  attachText: { fontSize: 14, fontWeight: '700' },
  receiptPreview: { borderRadius: 12, height: 160, width: '100%', marginBottom: 8 },
  removeImgBtn: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', paddingVertical: 8 },
});

export default TransactionModal;
