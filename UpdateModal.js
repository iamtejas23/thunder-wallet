import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Linking,
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

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = 380;

export default function UpdateModal({ visible, latestVersion, downloadUrl, onDismiss }) {
  const { C } = useTheme();
  const slideY  = useRef(new Animated.Value(SHEET_H)).current;
  const bgAlpha = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
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

  const handleUpdate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (downloadUrl) Linking.openURL(downloadUrl);
    onDismiss();
  };

  const handleLater = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDismiss();
  };

  const currentVersion = Constants.expoConfig?.version ?? '';
  const remoteClean    = (latestVersion ?? '').replace(/^v/, '');

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={handleLater}>
      {/* Backdrop */}
      <Animated.View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.62)',
          opacity: bgAlpha,
          justifyContent: 'flex-end',
        }}
      >
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={handleLater}
        />

        {/* Sheet */}
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

          <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 32 }}>

            {/* Pill handle */}
            <View style={{
              alignSelf: 'center',
              width: 38,
              height: 4,
              borderRadius: 2,
              backgroundColor: C.isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)',
              marginBottom: 24,
            }} />

            {/* Icon badge */}
            <View style={{ alignSelf: 'center', marginBottom: 20 }}>
              <View style={{
                width: 64, height: 64, borderRadius: 20,
                backgroundColor: C.isDark ? 'rgba(96,165,250,0.14)' : 'rgba(59,130,246,0.10)',
                borderWidth: 1,
                borderColor: C.isDark ? 'rgba(96,165,250,0.30)' : 'rgba(59,130,246,0.22)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="flash" size={28} color="#60A5FA" />
              </View>
              {/* green dot */}
              <View style={{
                position: 'absolute', top: -2, right: -2,
                width: 16, height: 16, borderRadius: 8,
                backgroundColor: '#34D399',
                borderWidth: 2,
                borderColor: C.isDark ? '#0D1120' : '#FFFFFF',
              }} />
            </View>

            {/* Title */}
            <Text style={{
              color: C.text1,
              fontSize: 22,
              fontWeight: '900',
              textAlign: 'center',
              letterSpacing: -0.4,
              marginBottom: 6,
            }}>
              Update Available
            </Text>

            {/* Version line */}
            <Text style={{
              color: C.text3,
              fontSize: 14,
              textAlign: 'center',
              marginBottom: 28,
            }}>
              {currentVersion ? `v${currentVersion} → ` : ''}
              <Text style={{ color: '#60A5FA', fontWeight: '700' }}>v{remoteClean}</Text>
              {'  ·  Thunder Wallet'}
            </Text>

            {/* Update Now button */}
            <TouchableOpacity
              onPress={handleUpdate}
              activeOpacity={0.82}
              style={{
                backgroundColor: '#60A5FA',
                borderRadius: 16,
                paddingVertical: 15,
                alignItems: 'center',
                marginBottom: 12,
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Ionicons name="download-outline" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 }}>
                Update Now
              </Text>
            </TouchableOpacity>

            {/* Later button */}
            <TouchableOpacity onPress={handleLater} activeOpacity={0.65} style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ color: C.text3, fontSize: 14, fontWeight: '600' }}>Remind me later</Text>
            </TouchableOpacity>

          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
