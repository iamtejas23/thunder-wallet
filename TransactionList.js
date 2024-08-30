import React from 'react';
import { View, FlatList, TouchableOpacity, Text, StyleSheet, Share } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';

const TransactionList = ({ transactions, deleteTransaction }) => {
  const formatTimestamp = (date) => {
    const options = {
      weekday: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    };
    return new Date(date).toLocaleString('en-US', options);
  };

  const generateCSV = async () => {
    const csvContent = transactions.map(item => {
      return `${item.id},${item.category},${item.amount},${formatTimestamp(item.date)}`;
    }).join('\n');

    const fileUri = FileSystem.documentDirectory + 'transactions.csv';
    await FileSystem.writeAsStringAsync(fileUri, csvContent);

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri);
    } else {
      alert("Sharing is not available on this device");
    }
  };

  const shareSummary = async () => {
    const summary = transactions.map(item => {
      return `Category: ${item.category}, Amount: ₹${item.amount}, Date: ${formatTimestamp(item.date)}`;
    }).join('\n');

    try {
      await Share.share({
        message: `Transaction Summary:\n\n${summary}`,
      });
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <View style={styles.transactionsContainer}>
      <View style={styles.header}>
        <Text style={styles.transactionsTitle}>Transactions</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity onPress={generateCSV} style={styles.iconButton}>
            <Ionicons name="download-outline" size={24} color="#007bff" />
            <Text style={styles.iconButtonText}>CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={shareSummary} style={styles.iconButton}>
            <Ionicons name="share-outline" size={24} color="#28a745" />
            <Text style={styles.iconButtonText}>Share</Text>
          </TouchableOpacity>
        </View>
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
                {formatTimestamp(item.date)}
              </Text>
            </View>

            <View style={styles.transactionIcons}>
              <TouchableOpacity onPress={() => deleteTransaction(item.id)}>
                <Ionicons name="trash-bin" size={24} color="#FF5733" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
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
  headerIcons: {
    flexDirection: 'row',
  },
  iconButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 15,
  },
  iconButtonText: {
    marginLeft: 5,
    fontSize: 16,
    color: '#007bff',
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
