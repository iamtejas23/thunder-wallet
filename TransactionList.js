import React from 'react';
import { View, FlatList, TouchableOpacity, Text, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const TransactionList = ({ transactions, deleteTransaction }) => {
  return (
    <View style={styles.transactionsContainer}>
      <View style={styles.header}>
        <Text style={styles.transactionsTitle}>Transactions</Text>
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.transactionItem}>
            <View style={styles.transactionDetails}>
              <Text style={styles.transactionCategory}>{item.category}</Text>
              <Text style={styles.transactionAmount}>
                ₹{item.amount > 0 ? '+' : '-'} {Math.abs(item.amount).toFixed(2)}
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

            <View style={styles.transactionIcons}>
              <TouchableOpacity onPress={() => deleteTransaction(item.id)}>
                <Ionicons name="ios-trash-bin" size={24} color="#FF5733" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* Sort Modal */}
      <Modal animationType="slide" transparent={true} visible={false}>
        {/* Modal content (removed sort functionality) */}
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  transactionsContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  transactionsTitle: {
    fontSize: 24,
    color: '#000000',
    fontWeight: 'bold',
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingVertical: 8,
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
  transactionIcons: {
    marginLeft: 8,
  },
});

export default TransactionList;
