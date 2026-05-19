import React from 'react';
import {
  Image,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const settingsItems = [
  { icon: 'phone-portrait-outline', label: 'App version', value: '1.0.0' },
  { icon: 'shield-checkmark-outline', label: 'Data storage', value: 'On-device' },
  { icon: 'cloud-offline-outline', label: 'Works offline', value: 'Yes' },
];

const SettingsScreen = () => {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityLabel="Open dashboard" style={styles.iconButton} onPress={() => navigation.navigate('Dashboard')}>
            <Ionicons name="home-outline" size={22} color="#1d2528" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.iconButtonPlaceholder} />
        </View>

        <View style={styles.hero}>
          <Image source={require('./assets/logo.png')} style={styles.image} />
          <Text style={styles.title}>Thunder Wallet</Text>
          <Text style={styles.subtitle}>A clean local wallet for everyday money tracking.</Text>
        </View>

        <View style={styles.card}>
          {settingsItems.map((item) => (
            <View key={item.label} style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name={item.icon} size={20} color="#11342d" />
              </View>
              <View style={styles.infoCopy}>
                <Text style={styles.cardText}>{item.label}</Text>
                <Text style={styles.cardValue}>{item.value}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>About</Text>
          <Text style={styles.aboutText}>
            Built by Tejas Mane. Export CSV files, share summaries, and keep your wallet history private on this device.
          </Text>
        </View>

        <TouchableOpacity style={styles.githubButton} onPress={() => Linking.openURL('https://github.com/iamtejas23')}>
          <Ionicons name="logo-github" size={22} color="#ffffff" />
          <Text style={styles.githubButtonText}>Open GitHub</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f7f4ef',
  },
  scrollContainer: {
    padding: 18,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  headerTitle: {
    color: '#1d2528',
    fontSize: 18,
    fontWeight: '900',
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e5ddd1',
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  iconButtonPlaceholder: {
    height: 44,
    width: 44,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 18,
  },
  image: {
    borderRadius: 34,
    height: 118,
    width: 118,
  },
  title: {
    color: '#1d2528',
    fontSize: 30,
    fontWeight: '900',
    marginTop: 16,
  },
  subtitle: {
    color: '#6f7770',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
    maxWidth: 280,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#e5ddd1',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16,
  },
  infoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingVertical: 10,
  },
  infoIcon: {
    alignItems: 'center',
    backgroundColor: '#edf6e1',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    marginRight: 12,
    width: 40,
  },
  infoCopy: {
    flex: 1,
  },
  cardTitle: {
    color: '#1d2528',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 8,
  },
  cardText: {
    color: '#6f7770',
    fontSize: 13,
    fontWeight: '700',
  },
  cardValue: {
    color: '#1d2528',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  aboutText: {
    color: '#626b65',
    fontSize: 15,
    lineHeight: 22,
  },
  githubButton: {
    alignItems: 'center',
    backgroundColor: '#11342d',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
  },
  githubButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
});

export default SettingsScreen;
