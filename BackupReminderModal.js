import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from './ThemeContext';
import MeshBackground from './MeshBackground';
import {
  createBackupAndShare,
  dismissBackupReminderForToday,
  formatLastBackupLabel,
  getLastBackupAt,
} from './BackupService';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = 400;

export default function BackupReminderModal({ visible, onDismiss }) {
  const { C } = useTheme();
  const slideY = useRef(new Animated.Value(SHEET_H)).current;
  const bgAlpha = useRef(new Animated.Value(0)).current;
  const [busy, setBusy] = useState(false);
  const [lastLabel, setLastLabel] = useState('');

  useEffect(() => {
    if (!visible) return;
    getLastBackupAt().then((ts) => setLastLabel(formatLastBackupLabel(ts)));
  }, [visible]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(bgAlpha, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.spring(slideY, { toValue: 0, damping: 22, stiffness: 180, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(bgAlpha, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(slideY, { toValue: SHEET_H, duration: 220, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const close = async (dismissForDay = false) => {
    if (dismissForDay) await dismissBackupReminderForToday();
    onDismiss();
  };

  const handleBackup = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(true);
    try {
      await createBackupAndShare();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await close(true);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={() => close(true)}>
      <Animated.View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', opacity: bgAlpha, justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => close(true)} />
        <Animated.View style={{
          transform: [{ translateY: slideY }],
          backgroundColor: C.isDark ? '#0D1120' : '#FFFFFF',
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          overflow: 'hidden',
          height: SHEET_H,
        }}>
          <MeshBackground blobs="cards" isDark={C.isDark} />
          <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28 }}>
            <View style={{ alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: C.isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)', marginBottom: 22 }} />

            <View style={{ alignSelf: 'center', marginBottom: 16 }}>
              <View style={{
                width: 60, height: 60, borderRadius: 18,
                backgroundColor: C.isDark ? 'rgba(251,191,36,0.12)' : 'rgba(245,158,11,0.10)',
                borderWidth: 1, borderColor: C.isDark ? 'rgba(251,191,36,0.28)' : 'rgba(245,158,11,0.22)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="shield-checkmark" size={28} color="#FBBF24" />
              </View>
            </View>

            <Text style={{ color: C.text1, fontSize: 21, fontFamily: 'DMSans_900Black', textAlign: 'center', marginBottom: 8 }}>
              Back up your wallet
            </Text>
            <Text style={{ color: C.text3, fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 10 }}>
              Your data lives only on this phone. Save a backup file so updates or reinstalls never wipe your transactions.
            </Text>
            <Text style={{ color: C.text2, fontSize: 12, textAlign: 'center', marginBottom: 18, fontFamily: 'DMSans_600SemiBold' }}>
              {lastLabel}
            </Text>

            <TouchableOpacity
              onPress={handleBackup}
              disabled={busy}
              activeOpacity={0.82}
              style={{
                backgroundColor: '#34D399',
                borderRadius: 16,
                paddingVertical: 15,
                alignItems: 'center',
                marginBottom: 10,
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="cloud-upload-outline" size={18} color="#fff" />}
              <Text style={{ color: '#fff', fontSize: 16, fontFamily: 'DMSans_800ExtraBold' }}>
                {busy ? 'Creating backup…' : 'Save backup now'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => close(true)} activeOpacity={0.65} style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ color: C.text3, fontSize: 14, fontFamily: 'DMSans_600SemiBold' }}>Remind me tomorrow</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
