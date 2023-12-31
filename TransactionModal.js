// TransactionModal.js
import React from 'react';
import { View, Text, Modal, TextInput, Button, StyleSheet } from 'react-native';

const TransactionModal = ({
  isModalVisible,
  toggleModal,
  transactionCategory,
  setTransactionCategory,
  transactionAmount,
  setTransactionAmount,
  addTransaction,
}) => {
  return (
    <Modal animationType="slide" transparent={true} visible={isModalVisible}>
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Add Transaction</Text>
          <TextInput
            style={styles.input}
            placeholder="Category"
            value={transactionCategory}
            onChangeText={(text) => setTransactionCategory(text)}
          />
          <TextInput
            style={styles.input}
            placeholder="Amount"
            keyboardType="numeric"
            value={transactionAmount}
            onChangeText={(text) => setTransactionAmount(text)}
          />
          <View style={styles.buttonContainer}>
            <Button title="Cancel" onPress={toggleModal} color="#000000" />
            <Button title="Add" onPress={addTransaction} color="#00ff7f" />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // semi-transparent background
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 12,
    width: '80%',
    elevation: 5, // for Android shadow
  },
  modalTitle: {
    fontSize: 20,
    marginBottom: 16,
    color: '#333',
    fontWeight: 'bold',
  },
  input: {
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    color: '#333',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

export default TransactionModal;
