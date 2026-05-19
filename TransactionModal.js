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

const quickCategories = [
  { icon: 'fast-food-outline', label: 'Food' },
  { icon: 'car-outline', label: 'Travel' },
  { icon: 'bag-outline', label: 'Shopping' },
  { icon: 'receipt-outline', label: 'Bills' },
  { icon: 'cash-outline', label: 'Salary' },
  { icon: 'fitness-outline', label: 'Health' },
  { icon: 'sparkles-outline', label: 'Other' },
];

const amountPresets = {
  expense: ['99', '199', '499', '999'],
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
  return (
    <Modal animationType="fade" transparent visible={isModalVisible} onRequestClose={toggleModal}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalContainer}
      >
        <Pressable style={styles.backdrop} onPress={toggleModal} />
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalEyebrow}>New entry</Text>
              <Text style={styles.modalTitle}>Add transaction</Text>
            </View>
            <TouchableOpacity accessibilityLabel="Close modal" style={styles.closeButton} onPress={toggleModal}>
              <Ionicons name="close" size={22} color="#1d2528" />
            </TouchableOpacity>
          </View>

          <View style={styles.segment}>
            {['expense', 'income'].map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.segmentButton, transactionType === type && styles.activeSegment]}
                onPress={() => setTransactionType(type)}
              >
                <Ionicons
                  name={type === 'expense' ? 'remove-circle-outline' : 'add-circle-outline'}
                  size={18}
                  color={transactionType === type ? '#ffffff' : '#5f6b64'}
                />
                <Text style={[styles.segmentText, transactionType === type && styles.activeSegmentText]}>
                  {type === 'expense' ? 'Expense' : 'Income'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.inputLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
              {quickCategories.map((category) => {
                const isSelected = transactionCategory === category.label;

                return (
                  <TouchableOpacity
                    key={category.label}
                    style={[styles.categoryChip, isSelected && styles.selectedCategory]}
                    onPress={() => setTransactionCategory(category.label)}
                  >
                    <Ionicons name={category.icon} size={16} color={isSelected ? '#11342d' : '#5f6b64'} />
                    <Text style={[styles.categoryText, isSelected && styles.selectedCategoryText]}>
                      {category.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TextInput
              style={styles.input}
              placeholder="Custom category"
              placeholderTextColor="#8a928c"
              value={transactionCategory}
              onChangeText={setTransactionCategory}
            />

            <Text style={styles.inputLabel}>Amount</Text>
            <View style={styles.amountInputWrap}>
              <Text style={styles.currencySymbol}>Rs</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                placeholderTextColor="#8a928c"
                keyboardType="decimal-pad"
                value={transactionAmount}
                onChangeText={setTransactionAmount}
              />
            </View>

            <View style={styles.presetRow}>
              {amountPresets[transactionType].map((amount) => (
                <TouchableOpacity
                  key={amount}
                  style={[styles.presetChip, transactionAmount === amount && styles.selectedPresetChip]}
                  onPress={() => setTransactionAmount(amount)}
                >
                  <Text style={[styles.presetText, transactionAmount === amount && styles.selectedPresetText]}>
                    Rs {amount}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Note</Text>
            <TextInput
              style={[styles.input, styles.noteInput]}
              placeholder="Optional note"
              placeholderTextColor="#8a928c"
              value={transactionNote}
              onChangeText={setTransactionNote}
              multiline
            />
          </ScrollView>

          <TouchableOpacity style={styles.saveButton} onPress={addTransaction}>
            <Ionicons name="checkmark-circle-outline" size={21} color="#ffffff" />
            <Text style={styles.saveButtonText}>Save transaction</Text>
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
    backgroundColor: 'rgba(18, 25, 24, 0.48)',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    padding: 20,
    paddingBottom: 28,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalEyebrow: {
    color: '#938872',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  modalTitle: {
    color: '#1d2528',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 2,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#f7f4ef',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  segment: {
    backgroundColor: '#f7f4ef',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 6,
    marginBottom: 18,
    padding: 5,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 42,
  },
  activeSegment: {
    backgroundColor: '#11342d',
  },
  segmentText: {
    color: '#5f6b64',
    fontSize: 14,
    fontWeight: '900',
  },
  activeSegmentText: {
    color: '#ffffff',
  },
  inputLabel: {
    color: '#1d2528',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 8,
  },
  categoryRow: {
    gap: 8,
    paddingBottom: 12,
  },
  categoryChip: {
    alignItems: 'center',
    backgroundColor: '#f7f4ef',
    borderColor: '#e5ddd1',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  selectedCategory: {
    backgroundColor: '#edf6e1',
    borderColor: '#b9de84',
  },
  categoryText: {
    color: '#5f6b64',
    fontSize: 13,
    fontWeight: '800',
  },
  selectedCategoryText: {
    color: '#11342d',
  },
  input: {
    backgroundColor: '#f7f4ef',
    borderColor: '#e5ddd1',
    borderRadius: 8,
    borderWidth: 1,
    color: '#1d2528',
    fontSize: 15,
    marginBottom: 16,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  amountInputWrap: {
    alignItems: 'center',
    backgroundColor: '#f7f4ef',
    borderColor: '#e5ddd1',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 16,
    minHeight: 54,
    paddingHorizontal: 14,
  },
  currencySymbol: {
    color: '#5f6b64',
    fontSize: 17,
    fontWeight: '900',
    marginRight: 8,
  },
  amountInput: {
    color: '#1d2528',
    flex: 1,
    fontSize: 22,
    fontWeight: '900',
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
    marginTop: -4,
  },
  presetChip: {
    alignItems: 'center',
    backgroundColor: '#f7f4ef',
    borderColor: '#e5ddd1',
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 36,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  selectedPresetChip: {
    backgroundColor: '#11342d',
    borderColor: '#11342d',
  },
  presetText: {
    color: '#5f6b64',
    fontSize: 13,
    fontWeight: '900',
  },
  selectedPresetText: {
    color: '#ffffff',
  },
  noteInput: {
    minHeight: 76,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: '#11342d',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
});

export default TransactionModal;
