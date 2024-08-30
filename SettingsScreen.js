import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// SettingsScreen.js


const SettingsScreen = () => {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/*add image   */}
        <Text style={styles.title}></Text>
        <Image source={require('./assets/logo.png')} style={styles.image} />

        <View style={styles.card}>
          <Text style={styles.cardTitle}>App Info</Text>
          <Text style={styles.cardText}>Created By Tejas Mane</Text>
          <Text style={styles.cardText}>Version 1.2.23</Text>
          <Text style={styles.cardText}>Build Date: August 2024</Text>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={() => Linking.openURL('https://github.com/iamtejas23')}>
          <Text style={styles.logoutButtonText}>Github</Text>
          <Ionicons name="logo-github" size={24} color="white" />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContainer: {
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  cardText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
  },
  image: {
    width: 300,
    height: 300,
    alignSelf: 'center',
    marginBottom: 20,
  },
  logoutButton: {
    marginTop: 30,
    paddingVertical: 15,
    backgroundColor: '#000000',
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#ffffff',
    fontSize: 18,
  },
});

export default SettingsScreen;
