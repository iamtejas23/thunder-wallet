// MainApp.js
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, Image, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import TransactionList from './TransactionList';
import TransactionModal from './TransactionModal';

const MainApp = () => {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [isModalVisible, setModalVisible] = useState(false);
  const [transactionCategory, setTransactionCategory] = useState('');
  const [transactionAmount, setTransactionAmount] = useState('');

  useEffect(() => {
    const loadTransactions = async () => {
      try {
        const savedTransactions = await AsyncStorage.getItem('transactions');
        if (savedTransactions) {
          setTransactions(JSON.parse(savedTransactions));
          updateBalance(JSON.parse(savedTransactions));
        }
      } catch (error) {
        console.error('Error loading transactions:', error);
      }
    };

    loadTransactions();
  }, []);

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

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <View style={styles.logo}>
          <Image source={require('./assets/logo.png')} style={styles.logoImage} />
        </View>
        <TouchableOpacity style={styles.settingsButton}>
          <Ionicons name="ios-settings" size={28} color="#000000" />
        </TouchableOpacity>
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceTitle} >Expenses  ₹{balance.toFixed(2)}</Text>
      </View>

      <TransactionList transactions={transactions} deleteTransaction={deleteTransaction} />

      <TouchableOpacity style={styles.addButton} onPress={toggleModal}>
        <Text style={styles.addButtonText}>Add Transaction</Text>
      </TouchableOpacity>

      <TransactionModal
        isModalVisible={isModalVisible}
        toggleModal={toggleModal}
        transactionCategory={transactionCategory}
        setTransactionCategory={setTransactionCategory}
        transactionAmount={transactionAmount}
        setTransactionAmount={setTransactionAmount}
        addTransaction={addTransaction}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // alignItems: 'center',
    // justifyContent: 'flex-start',
    padding: 20,
  },
  logoContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
    marginTop:8,
    // borderBottomWidth: 1, 
    // borderBottomColor: '#0e0e0e',
    borderBottomLeftRadius:20,
    borderBottomRightRadius:20,
    padding: 5,
  },
  logo: {
    flex: 1,
    alignItems: 'flex-start',
  },
  logoImage: {
    width: 90,
    height: 80,
    // resizeMode: 'contain',
    marginTop:8,
  },
  settingsButton: {
    padding: 10,
  },
  balanceCard: {
    borderRadius: 10,
    padding: 20,
    marginBottom: 10,
    width: '100%',
    backgroundColor: '#f5f5f5',
    
  },
  
  balanceTitle: {
    fontSize: 40,
    color: '#000000',
    fontWeight: 'bold',
    
  },
  addButton: {
    backgroundColor: '#000000',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
  },
});

export default MainApp;
