import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import Constants from 'expo-constants';
import { useTheme } from './ThemeContext';
import MeshBackground from './MeshBackground';
import {
  confirmRiskyUpdateWithoutBackup,
  createBackupAndShare,
  showUpdateInstallGuide,
} from './BackupService';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = 480;

export default function UpdateModal({ visible, latestVersion, downloadUrl, onDismiss }) {
  const { C } = useTheme();
  const slideY = useRef(new Animated.Value(SHEET_H)).current;
  const bgAlpha = useRef(new Animated.Value(0)).current;
  const [backupReady, setBackupReady] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  useEffect(() => {
    if (visible) {
      setBackupReady(false);
      setBackingUp(false);
      Animated.parallel([
        Animated.timing(bgAlpha, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.spring(slideY, {
          toValue: 0,
          damping: 22,
          stiffness: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(bgAlpha, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(slideY, { toValue: SHEET_H, duration: 220, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleBackupFirst = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBackingUp(true);
    try {
      await createBackupAndShare();
      setBackupReady(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Backup created',
        'Save the file to Google Drive or Downloads before continuing. You will need it if the update asks you to uninstall the old app.',
      );
    } catch (e) {
      Alert.alert('Backup failed', e?.message ?? 'Could not create backup file.');
    } finally {
      setBackingUp(false);
    }
  };

  const handleUpdate = () => {
    if (!backupReady) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    showUpdateInstallGuide(downloadUrl);
    onDismiss();
  };

  const handleLater = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDismiss();
  };

  const currentVersion = Constants.expoConfig?.version ?? '';
  const remoteClean = (latestVersion ?? '').replace(/^v/, '');

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={handleLater}>
      <Animated.View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.62)',
          opacity: bgAlpha,
          justifyContent: 'flex-end',
        }}
      >
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleLater} />

        <Animated.View
          style={{
            transform: [{ translateY: slideY }],
            backgroundColor: C.isDark ? '#0D1120' : '#FFFFFF',
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            overflow: 'hidden',
            height: SHEET_H,
          }}
        >
          <MeshBackground blobs="cards" isDark={C.isDark} />

          <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28 }}>
            <View style={{
              alignSelf: 'center',
              width: 38, height: 4, borderRadius: 2,
              backgroundColor: C.isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)',
              marginBottom: 20,
            }} />

            <View style={{ alignSelf: 'center', marginBottom: 16 }}>
              <View style={{
                width: 64, height: 64, borderRadius: 20,
                backgroundColor: C.isDark ? 'rgba(96,165,250,0.14)' : 'rgba(59,130,246,0.10)',
                borderWidth: 1,
                borderColor: C.isDark ? 'rgba(96,165,250,0.30)' : 'rgba(59,130,246,0.22)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="flash" size={28} color="#60A5FA" />
              </View>
            </View>

            <Text style={{ color: C.text1, fontSize: 22, fontFamily: 'DMSans_900Black', textAlign: 'center', marginBottom: 6 }}>
              Update Available
            </Text>
            <Text style={{ color: C.text3, fontSize: 14, textAlign: 'center', marginBottom: 12 }}>
              {currentVersion ? `v${currentVersion} → ` : ''}
              <Text style={{ color: '#60A5FA', fontFamily: 'DMSans_700Bold' }}>v{remoteClean}</Text>
            </Text>

            <View style={{
              backgroundColor: C.isDark ? 'rgba(248,113,113,0.10)' : 'rgba(239,68,68,0.08)',
              borderColor: C.isDark ? 'rgba(248,113,113,0.28)' : 'rgba(239,68,68,0.22)',
              borderWidth: 1,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 10,
              marginBottom: 14,
            }}>
              <Text style={{ color: C.isDark ? '#FCA5A5' : '#B91C1C', fontSize: 12, lineHeight: 18, textAlign: 'center', fontFamily: 'DMSans_700Bold' }}>
                Required: save a backup before updating. Uninstalling the old app deletes ALL local data forever.
              </Text>
            </View>

            {backupReady && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                marginBottom: 12,
              }}>
                <Ionicons name="checkmark-circle" size={16} color="#34D399" />
                <Text style={{ color: '#34D399', fontSize: 12, fontFamily: 'DMSans_700Bold' }}>
                  Backup step completed — safe to download
                </Text>
              </View>
            )}

            <TouchableOpacity
              onPress={handleBackupFirst}
              disabled={backingUp}
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
                opacity: backingUp ? 0.7 : 1,
              }}
            >
              {backingUp ? <ActivityIndicator color="#fff" /> : <Ionicons name="cloud-upload-outline" size={18} color="#fff" />}
              <Text style={{ color: '#fff', fontSize: 16, fontFamily: 'DMSans_800ExtraBold' }}>
                {backingUp ? 'Creating backup…' : '1. Save backup first'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleUpdate}
              disabled={!backupReady}
              activeOpacity={0.82}
              style={{
                backgroundColor: backupReady ? '#60A5FA' : C.cardInner,
                borderRadius: 16,
                paddingVertical: 15,
                alignItems: 'center',
                marginBottom: 8,
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
                borderWidth: backupReady ? 0 : 1,
                borderColor: C.border,
                opacity: backupReady ? 1 : 0.55,
              }}
            >
              <Ionicons name="download-outline" size={18} color={backupReady ? '#fff' : C.text3} />
              <Text style={{ color: backupReady ? '#fff' : C.text3, fontSize: 16, fontFamily: 'DMSans_800ExtraBold' }}>
                2. Download update
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => confirmRiskyUpdateWithoutBackup(() => setBackupReady(true))}
              activeOpacity={0.65}
              style={{ alignItems: 'center', paddingVertical: 6 }}
            >
              <Text style={{ color: C.text3, fontSize: 12, fontFamily: 'DMSans_600SemiBold' }}>
                I already saved a backup file
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleLater} activeOpacity={0.65} style={{ alignItems: 'center', paddingVertical: 6 }}>
              <Text style={{ color: C.text3, fontSize: 14, fontFamily: 'DMSans_600SemiBold' }}>Not now</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
