import React from 'react';
import {
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

const C = {
  bg: '#0B0F1A',
  card: '#131929',
  cardInner: '#192235',
  border: '#1E2D45',
  text1: '#EEF2FF',
  text2: '#8892B0',
  text3: '#4A5570',
  green: '#00C853',
  greenBg: 'rgba(0, 200, 83, 0.12)',
  red: '#FF4757',
  redBg: 'rgba(255, 71, 87, 0.12)',
};

const expenseCategories = [
  { icon: 'restaurant', label: 'Food', color: '#FF6B6B' },
  { icon: 'car', label: 'Travel', color: '#4ECDC4' },
  { icon: 'bag-handle', label: 'Shopping', color: '#A29BFE' },
  { icon: 'document-text', label: 'Bills', color: '#FFB74D' },
  { icon: 'home', label: 'Rent', color: '#74B9FF' },
  { icon: 'medkit', label: 'Health', color: '#FF4757' },
  { icon: 'game-controller', label: 'Entertainment', color: '#F9CA24' },
  { icon: 'cart', label: 'Groceries', color: '#FFA502' },
  { icon: 'school', label: 'Education', color: '#B388FF' },
  { icon: 'ellipsis-horizontal-circle', label: 'Other', color: '#8892B0' },
];

const incomeCategories = [
  { icon: 'briefcase', label: 'Salary', color: '#00C853' },
  { icon: 'laptop', label: 'Freelance', color: '#00E676' },
  { icon: 'trending-up', label: 'Investment', color: '#64B5F6' },
  { icon: 'gift', label: 'Gift', color: '#F9CA24' },
  { icon: 'cash', label: 'Bonus', color: '#4ECDC4' },
  { icon: 'ellipsis-horizontal-circle', label: 'Other', color: '#8892B0' },
];

const amountPresets = {
  expense: ['100', '250', '500', '1000'],
  income: ['1000', '5000', '15000', '30000'],
};

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
  addTransaction,
}) => {
  const categories = transactionType === 'income' ? incomeCategories : expenseCategories;

  return (
    <Modal animationType="slide" transparent visible={isModalVisible} onRequestClose={toggleModal}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalContainer}
      >
        <Pressable style={styles.backdrop} onPress={toggleModal} />
        <View style={styles.modalContent}>
          <View style={styles.modalHandle} />

          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalEyebrow}>New Entry</Text>
              <Text style={styles.modalTitle}>Add Transaction</Text>
            </View>
            <TouchableOpacity accessibilityLabel="Close modal" style={styles.closeButton} onPress={toggleModal}>
              <Ionicons name="close" size={20} color={C.text2} />
            </TouchableOpacity>
          </View>

          <View style={styles.segment}>
            {['expense', 'income'].map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.segmentButton,
                  transactionType === type && (type === 'expense' ? styles.activeExpenseSegment : styles.activeIncomeSegment),
                ]}
                onPress={() => {
                  setTransactionType(type);
                  setTransactionCategory('');
                }}
              >
                <Ionicons
                  name={type === 'expense' ? 'arrow-up-circle' : 'arrow-down-circle'}
                  size={17}
                  color={transactionType === type ? (type === 'expense' ? '#FF4757' : '#00C853') : C.text2}
                />
                <Text style={[styles.segmentText, transactionType === type && (type === 'expense' ? styles.activeExpenseSegmentText : styles.activeIncomeSegmentText)]}>
                  {type === 'expense' ? 'Expense' : 'Income'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.inputLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
              {categories.map((cat) => {
                const isSelected = transactionCategory === cat.label;
                return (
                  <TouchableOpacity
                    key={cat.label}
                    style={[styles.categoryChip, isSelected && { backgroundColor: `${cat.color}20`, borderColor: `${cat.color}60` }]}
                    onPress={() => setTransactionCategory(cat.label)}
                  >
                    <View style={[styles.categoryIconWrap, { backgroundColor: `${cat.color}18` }]}>
                      <Ionicons name={cat.icon} size={15} color={isSelected ? cat.color : C.text2} />
                    </View>
                    <Text style={[styles.categoryText, isSelected && { color: cat.color }]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TextInput
              style={styles.input}
              placeholder="Custom category"
              placeholderTextColor={C.text3}
              value={transactionCategory}
              onChangeText={setTransactionCategory}
            />

            <Text style={styles.inputLabel}>Amount</Text>
            <View style={[
              styles.amountInputWrap,
              transactionType === 'expense' ? styles.amountWrapExpense : styles.amountWrapIncome,
            ]}>
              <Text style={[styles.currencySymbol, transactionType === 'expense' ? { color: C.red } : { color: C.green }]}>₹</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                placeholderTextColor={C.text3}
                keyboardType="decimal-pad"
                value={transactionAmount}
                onChangeText={setTransactionAmount}
              />
              {!!transactionAmount && (
                <TouchableOpacity onPress={() => setTransactionAmount('')}>
                  <Ionicons name="close-circle" size={18} color={C.text3} />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.presetRow}>
              {amountPresets[transactionType].map((amount) => (
                <TouchableOpacity
                  key={amount}
                  style={[styles.presetChip, transactionAmount === amount && styles.selectedPresetChip]}
                  onPress={() => setTransactionAmount(amount)}
                >
                  <Text style={[styles.presetText, transactionAmount === amount && styles.selectedPresetText]}>
                    ₹{amount}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Note <Text style={styles.optionalLabel}>(optional)</Text></Text>
            <TextInput
              style={[styles.input, styles.noteInput]}
              placeholder="What was this for?"
              placeholderTextColor={C.text3}
              value={transactionNote}
              onChangeText={setTransactionNote}
              multiline
            />
          </ScrollView>

          <TouchableOpacity
            style={[styles.saveButton, transactionType === 'expense' ? styles.saveExpenseButton : styles.saveIncomeButton]}
            onPress={addTransaction}
          >
            <Ionicons name="checkmark-circle" size={22} color={transactionType === 'expense' ? '#ffffff' : '#000000'} />
            <Text style={[styles.saveButtonText, transactionType === 'income' && { color: '#000000' }]}>
              Save {transactionType === 'expense' ? 'Expense' : 'Income'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: C.card,
    borderTopColor: C.border,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    maxHeight: '90%',
    padding: 20,
    paddingBottom: 32,
  },
  modalHandle: {
    alignSelf: 'center',
    backgroundColor: C.border,
    borderRadius: 3,
    height: 4,
    marginBottom: 16,
    width: 40,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalEyebrow: {
    color: C.text3,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  modalTitle: {
    color: C.text1,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 2,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: C.cardInner,
    borderColor: C.border,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  segment: {
    backgroundColor: C.cardInner,
    borderColor: C.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginBottom: 20,
    padding: 5,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 44,
  },
  activeExpenseSegment: {
    backgroundColor: 'rgba(255, 71, 87, 0.15)',
    borderColor: 'rgba(255, 71, 87, 0.35)',
    borderWidth: 1,
    borderRadius: 10,
  },
  activeIncomeSegment: {
    backgroundColor: 'rgba(0, 200, 83, 0.15)',
    borderColor: 'rgba(0, 200, 83, 0.35)',
    borderWidth: 1,
    borderRadius: 10,
  },
  segmentText: {
    color: C.text2,
    fontSize: 14,
    fontWeight: '800',
  },
  activeExpenseSegmentText: {
    color: '#FF4757',
  },
  activeIncomeSegmentText: {
    color: '#00C853',
  },
  inputLabel: {
    color: C.text1,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  optionalLabel: {
    color: C.text3,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'none',
    letterSpacing: 0,
  },
  categoryRow: {
    gap: 8,
    paddingBottom: 12,
  },
  categoryChip: {
    alignItems: 'center',
    backgroundColor: C.cardInner,
    borderColor: C.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  categoryIconWrap: {
    alignItems: 'center',
    borderRadius: 8,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  categoryText: {
    color: C.text2,
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    backgroundColor: C.cardInner,
    borderColor: C.border,
    borderRadius: 12,
    borderWidth: 1,
    color: C.text1,
    fontSize: 15,
    marginBottom: 16,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  amountInputWrap: {
    alignItems: 'center',
    backgroundColor: C.cardInner,
    borderRadius: 14,
    borderWidth: 2,
    flexDirection: 'row',
    marginBottom: 14,
    minHeight: 60,
    paddingHorizontal: 16,
  },
  amountWrapExpense: {
    borderColor: 'rgba(255, 71, 87, 0.4)',
  },
  amountWrapIncome: {
    borderColor: 'rgba(0, 200, 83, 0.4)',
  },
  currencySymbol: {
    fontSize: 20,
    fontWeight: '900',
    marginRight: 8,
  },
  amountInput: {
    color: C.text1,
    flex: 1,
    fontSize: 26,
    fontWeight: '900',
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  presetChip: {
    alignItems: 'center',
    backgroundColor: C.cardInner,
    borderColor: C.border,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 14,
  },
  selectedPresetChip: {
    backgroundColor: C.green,
    borderColor: C.green,
  },
  presetText: {
    color: C.text2,
    fontSize: 13,
    fontWeight: '800',
  },
  selectedPresetText: {
    color: '#000000',
  },
  noteInput: {
    minHeight: 80,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  saveButton: {
    alignItems: 'center',
    borderRadius: 14,
    elevation: 6,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 56,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  saveExpenseButton: {
    backgroundColor: '#FF4757',
    shadowColor: '#FF4757',
  },
  saveIncomeButton: {
    backgroundColor: '#00C853',
    shadowColor: '#00C853',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
});

export default TransactionModal;
