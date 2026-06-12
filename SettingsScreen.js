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
  blue: '#64B5F6',
  blueBg: 'rgba(100, 181, 246, 0.12)',
  purple: '#B388FF',
  purpleBg: 'rgba(179, 136, 255, 0.12)',
  amber: '#FFB300',
  amberBg: 'rgba(255, 179, 0, 0.12)',
};

const infoItems = [
  {
    icon: 'phone-portrait',
    iconColor: C.blue,
    iconBg: C.blueBg,
    label: 'App version',
    value: '1.0.1',
  },
  {
    icon: 'shield-checkmark',
    iconColor: C.green,
    iconBg: C.greenBg,
    label: 'Data storage',
    value: 'On-device only',
  },
  {
    icon: 'cloud-offline',
    iconColor: C.amber,
    iconBg: C.amberBg,
    label: 'Works offline',
    value: 'Yes, always',
  },
  {
    icon: 'lock-closed',
    iconColor: C.purple,
    iconBg: C.purpleBg,
    label: 'Privacy',
    value: 'No data shared',
  },
];

const featureItems = [
  { icon: 'analytics', iconColor: C.blue, iconBg: C.blueBg, label: 'Smart analytics & spending map' },
  { icon: 'calendar', iconColor: C.green, iconBg: C.greenBg, label: 'Month-wise transaction grouping' },
  { icon: 'download', iconColor: C.amber, iconBg: C.amberBg, label: 'CSV export & summary sharing' },
  { icon: 'shield-checkmark', iconColor: C.purple, iconBg: C.purpleBg, label: 'Financial health score' },
  { icon: 'bar-chart', iconColor: '#FF6B6B', iconBg: 'rgba(255,107,107,0.12)', label: '7-day spending trend chart' },
];

const SettingsScreen = () => {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityLabel="Open dashboard"
            style={styles.iconButton}
            onPress={() => navigation.navigate('Dashboard')}
          >
            <Ionicons name="home-outline" size={20} color={C.text2} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.iconButtonPlaceholder} />
        </View>

        <View style={styles.hero}>
          <View style={styles.logoRingWrap}>
            <View style={styles.logoRing} />
            <Image source={require('./assets/logo.png')} style={styles.image} />
          </View>
          <Text style={styles.title}>Thunder Wallet</Text>
          <Text style={styles.subtitle}>Smart local expense manager for everyday money tracking.</Text>
          <View style={styles.heroBadge}>
            <Ionicons name="flash" size={13} color={C.green} />
            <Text style={styles.heroBadgeText}>Pro Features Enabled</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="information-circle" size={18} color={C.blue} />
            <Text style={styles.cardTitle}>App Info</Text>
          </View>
          {infoItems.map((item, index) => (
            <View key={item.label} style={[styles.infoRow, index > 0 && styles.infoRowBorder]}>
              <View style={[styles.infoIcon, { backgroundColor: item.iconBg }]}>
                <Ionicons name={item.icon} size={18} color={item.iconColor} />
              </View>
              <View style={styles.infoCopy}>
                <Text style={styles.cardText}>{item.label}</Text>
                <Text style={styles.cardValue}>{item.value}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="sparkles" size={18} color={C.amber} />
            <Text style={styles.cardTitle}>Features</Text>
          </View>
          {featureItems.map((item, index) => (
            <View key={item.label} style={[styles.featureRow, index > 0 && styles.infoRowBorder]}>
              <View style={[styles.infoIcon, { backgroundColor: item.iconBg }]}>
                <Ionicons name={item.icon} size={16} color={item.iconColor} />
              </View>
              <Text style={styles.featureLabel}>{item.label}</Text>
              <Ionicons name="checkmark-circle" size={16} color={C.green} />
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="person-circle" size={18} color={C.purple} />
            <Text style={styles.cardTitle}>About</Text>
          </View>
          <Text style={styles.aboutText}>
            Built by Tejas Mane with care. All data stays private on your device — nothing is ever sent to the cloud. Export CSVs, share summaries, and track your money with clarity.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.githubButton}
          onPress={() => Linking.openURL('https://github.com/iamtejas23')}
        >
          <View style={styles.githubIconWrap}>
            <Ionicons name="logo-github" size={20} color={C.card} />
          </View>
          <Text style={styles.githubButtonText}>View on GitHub</Text>
          <Ionicons name="arrow-forward" size={18} color={C.card} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContainer: {
    padding: 16,
    paddingBottom: 110,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerTitle: {
    color: C.text1,
    fontSize: 18,
    fontWeight: '900',
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: C.card,
    borderColor: C.border,
    borderRadius: 20,
    borderWidth: 1,
    elevation: 2,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  iconButtonPlaceholder: {
    height: 40,
    width: 40,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 22,
  },
  logoRingWrap: {
    alignItems: 'center',
    height: 110,
    justifyContent: 'center',
    width: 110,
  },
  logoRing: {
    backgroundColor: C.greenBg,
    borderColor: `${C.green}30`,
    borderRadius: 55,
    borderWidth: 1,
    height: 110,
    position: 'absolute',
    width: 110,
  },
  image: {
    borderRadius: 22,
    height: 80,
    width: 80,
  },
  title: {
    color: C.text1,
    fontSize: 28,
    fontWeight: '900',
    marginTop: 16,
  },
  subtitle: {
    color: C.text2,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
    maxWidth: 260,
    textAlign: 'center',
  },
  heroBadge: {
    alignItems: 'center',
    backgroundColor: C.greenBg,
    borderColor: `${C.green}30`,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  heroBadgeText: {
    color: C.green,
    fontSize: 12,
    fontWeight: '800',
  },
  card: {
    backgroundColor: C.card,
    borderColor: C.border,
    borderRadius: 18,
    borderWidth: 1,
    elevation: 3,
    marginBottom: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  cardTitle: {
    color: C.text1,
    fontSize: 16,
    fontWeight: '900',
  },
  infoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingVertical: 10,
  },
  infoRowBorder: {
    borderTopColor: C.border,
    borderTopWidth: 1,
  },
  featureRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
  },
  infoIcon: {
    alignItems: 'center',
    borderRadius: 12,
    height: 38,
    justifyContent: 'center',
    marginRight: 12,
    width: 38,
  },
  infoCopy: {
    flex: 1,
  },
  cardText: {
    color: C.text2,
    fontSize: 12,
    fontWeight: '600',
  },
  cardValue: {
    color: C.text1,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  featureLabel: {
    color: C.text2,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  aboutText: {
    color: C.text2,
    fontSize: 14,
    lineHeight: 22,
  },
  githubButton: {
    alignItems: 'center',
    backgroundColor: C.green,
    borderRadius: 14,
    elevation: 6,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 56,
    shadowColor: C.green,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
  },
  githubIconWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 12,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  githubButtonText: {
    color: C.card,
    fontSize: 16,
    fontWeight: '900',
  },
});

export default SettingsScreen;
