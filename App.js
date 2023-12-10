import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Button,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const App = () => {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [isModalVisible, setModalVisible] = useState(false);
  const [transactionCategory, setTransactionCategory] = useState('');
  const [transactionAmount, setTransactionAmount] = useState('');
  const [sorted, setSorted] = useState(false); // State to track whether transactions are sorted or not

  useEffect(() => {
    const loadTransactions = async () => {
      try {
        const savedTransactions = await AsyncStorage.getItem('transactions');
        if (savedTransactions) {
          const sortedTransactions = sorted ? sortTransactionsByDate(JSON.parse(savedTransactions)) : sortTransactionsByMonth(JSON.parse(savedTransactions));
          setTransactions(sortedTransactions);
          updateBalance(sortedTransactions);
        }
      } catch (error) {
        console.error('Error loading transactions:', error);
      }
    };

    loadTransactions();
  }, [sorted]);

  const toggleModal = () => {
    setModalVisible(!isModalVisible);
  };

  const updateBalance = (transactionList) => {
    const totalAmount = transactionList.reduce((total, transaction) => total + transaction.amount, 0);
    setBalance(totalAmount);
  };

  const addTransaction = async () => {
    if (transactionCategory && transactionAmount) {
      const newTransaction = {
        id: (transactions.length + 1).toString(),
        category: transactionCategory,
        amount: parseFloat(transactionAmount),
        date: new Date(),
      };

      const updatedTransactions = [newTransaction, ...transactions];
      setTransactions(updatedTransactions);
      updateBalance(updatedTransactions);
      setTransactionCategory('');
      setTransactionAmount('');
      toggleModal();

      try {
        await AsyncStorage.setItem('transactions', JSON.stringify(updatedTransactions));
      } catch (error) {
        console.error('Error saving transactions:', error);
      }
    }
  };

  const deleteTransaction = async (transactionId) => {
    const updatedTransactions = transactions.filter((t) => t.id !== transactionId);
    setTransactions(updatedTransactions);
    updateBalance(updatedTransactions);

    try {
      await AsyncStorage.setItem('transactions', JSON.stringify(updatedTransactions));
    } catch (error) {
      console.error('Error saving transactions:', error);
    }
  };

  const sortTransactionsByMonth = (transactions) => {
    const sortedTransactions = [...transactions].sort((a, b) => b.date - a.date);
    const transactionsByMonth = {};

    sortedTransactions.forEach((transaction) => {
      const monthYearKey = transaction.date.toLocaleString('en-US', { month: 'numeric', year: 'numeric' });
      if (!transactionsByMonth[monthYearKey]) {
        transactionsByMonth[monthYearKey] = [];
      }
      transactionsByMonth[monthYearKey].push(transaction);
    });

    const sortedByMonth = Object.values(transactionsByMonth).flat();
    return sortedByMonth;
  };

  const sortTransactionsByDate = (transactions) => {
    return [...transactions].sort((a, b) => b.date - a.date);
  };

  const toggleSort = () => {
    setSorted(!sorted);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.balanceTitle}>Expenses</Text>
        <Text style={styles.balanceAmount}>₹{balance.toFixed(2)}</Text>
      </View>

      <View style={styles.transactionsContainer}>
        <TouchableOpacity style={styles.sortButton} onPress={toggleSort}>
          <Text style={styles.sortButtonText}>{sorted ? 'Sort by Date' : 'Sort by Month'}</Text>
        </TouchableOpacity>

        <Text style={styles.transactionsTitle}>Transactions</Text>
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.transactionItem}>
              <View style={styles.transactionIcon}>
                <Ionicons name="ios-cart" size={24} color="#2196F3" />
              </View>
              <View style={styles.transactionDetails}>
                <Text style={styles.transactionCategory}>{item.category}</Text>
                <Text style={styles.transactionAmount}>
                  {item.amount > 0 ? '+' : '-'} ₹{Math.abs(item.amount).toFixed(2)}
                </Text>
                <Text style={styles.transactionDate}>
                  {item.date.toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: 'numeric',
                  })}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => deleteTransaction(item.id)}
              >
                <Ionicons name="ios-trash-bin" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        />
      </View>

      <TouchableOpacity style={styles.addButton} onPress={toggleModal}>
        <Text style={styles.addButtonText}>Add Transaction</Text>
      </TouchableOpacity>

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
            <Button title="Add" onPress={addTransaction} />
            <Button title="Cancel" onPress={toggleModal} color="#FF5733" />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#00fa9a',
    padding: 16,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    marginBottom: 16,
    marginTop: 45,
    marginLeft: 7,
    marginRight: 7,
  },
  balanceTitle: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 8,
  },
  balanceAmount: {
    color: '#fff',
    fontSize: 36,
  },
  transactionsContainer: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginHorizontal: 8,
  },
  sortButton: {
    backgroundColor: '#2196F3',
    padding: 8,
    borderRadius: 4,
    alignItems: 'center',
    marginBottom: 16,
  },
  sortButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  transactionsTitle: {
    fontSize: 24,
    marginBottom: 16,
    color: '#333',
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingVertical: 8,
  },
  transactionIcon: {
    marginRight: 16,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionCategory: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#333',
  },
  transactionAmount: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: '#888',
  },
  deleteButton: {
    backgroundColor: '#FF5733',
    padding: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  addButton: {
    backgroundColor: '#2196F3',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    margin: 16,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    width: '80%',
  },
  modalTitle: {
    fontSize: 18,
    marginBottom: 16,
    color: '#333',
  },
  input: {
    marginBottom: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    color: '#333',
  },
});

export default App;
