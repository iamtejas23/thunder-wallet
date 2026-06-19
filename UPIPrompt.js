import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from './ThemeContext';

const CATEGORIES = ['Food','Travel','Shopping','Bills','Rent','Health','Entertainment','Groceries','Education','Other'];
const CAT_ICONS  = { Food:'fast-food', Travel:'car', Shopping:'bag', Bills:'receipt', Rent:'home', Health:'medical', Entertainment:'film', Groceries:'basket', Education:'school', Other:'ellipsis-horizontal' };
const CAT_COLORS = { Food:'#F87171', Travel:'#60A5FA', Shopping:'#A78BFA', Bills:'#FCD34D', Rent:'#34D399', Health:'#FB923C', Entertainment:'#F472B6', Groceries:'#4ADE80', Education:'#38BDF8', Other:'#94A3B8' };

const { height: SCREEN_H } = Dimensions.get('window');

export default function UPIPrompt({ transactions, onSave, onDismiss, onDismissAll }) {
  const { C } = useTheme();
  const [index, setIndex] = useState(0);
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const slideY = useRef(new Animated.Value(SCREEN_H)).current;

  const tx = transactions[index];

  useEffect(() => {
    if (!tx) return;
    setCategory(tx.category || 'Other');
    setNote(tx.merchant || '');
    Animated.spring(slideY, { toValue: 0, useNativeDriver: true, bounciness: 6, speed: 14 }).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [index, tx]);

  if (!tx) return null;

  const color = CAT_COLORS[category] || CAT_COLORS.Other;

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave({
      amount: tx.amount,
      category,
      note: note.trim() || tx.merchant,
      date: tx.date,
      type: 'expense',
      smsId: tx.smsId,
    });
    if (index + 1 < transactions.length) {
      Animated.timing(slideY, { toValue: -SCREEN_H, duration: 220, useNativeDriver: true }).start(() => {
        slideY.setValue(SCREEN_H);
        setIndex(i => i + 1);
      });
    } else {
      dismiss();
    }
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDismiss(tx.smsId);
    if (index + 1 < transactions.length) {
      Animated.timing(slideY, { toValue: -SCREEN_H, duration: 200, useNativeDriver: true }).start(() => {
        slideY.setValue(SCREEN_H);
        setIndex(i => i + 1);
      });
    } else {
      dismiss();
    }
  };

  const dismiss = () => {
    Animated.timing(slideY, { toValue: SCREEN_H, duration: 260, useNativeDriver: true }).start(onDismissAll);
  };

  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent onRequestClose={handleSkip}>
      <Pressable style={s.backdrop} onPress={handleSkip}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.kav}
        >
          <Pressable onPress={() => {}}>
            <Animated.View style={[s.sheet, { backgroundColor: C.card, borderColor: C.border, transform: [{ translateY: slideY }] }]}>

              {/* Handle */}
              <View style={[s.handle, { backgroundColor: C.border }]} />

              {/* Counter */}
              {transactions.length > 1 && (
                <View style={[s.counter, { backgroundColor: C.accentBg, borderColor: C.accentBorder }]}>
                  <Text style={[s.counterText, { color: C.text2 }]}>{index + 1} of {transactions.length}</Text>
                </View>
              )}

              {/* UPI header */}
              <View style={s.upiHeader}>
                <View style={[s.upiIconWrap, { backgroundColor: 'rgba(96,165,250,0.12)', borderColor: 'rgba(96,165,250,0.2)' }]}>
                  <Text style={s.upiIcon}>⚡</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.upiTitle, { color: C.text3 }]}>UPI PAYMENT DETECTED</Text>
                  <Text style={[s.upiAmount, { color: C.text1 }]}>
                    ₹{tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
              </View>

              {/* VPA pill */}
              {tx.vpa && (
                <View style={[s.vpaPill, { backgroundColor: C.cardInner, borderColor: C.border }]}>
                  <Ionicons name="swap-horizontal" size={12} color={C.text3} />
                  <Text style={[s.vpaText, { color: C.text3 }]} numberOfLines={1}>{tx.vpa}</Text>
                </View>
              )}

              {/* Note input */}
              <Text style={[s.fieldLabel, { color: C.text3 }]}>NOTE</Text>
              <View style={[s.inputWrap, { backgroundColor: C.cardInner, borderColor: C.border }]}>
                <Ionicons name="pencil" size={14} color={C.text3} style={{ marginRight: 8 }} />
                <TextInput
                  style={[s.input, { color: C.text1 }]}
                  value={note}
                  onChangeText={setNote}
                  placeholder="e.g. Lunch at Swiggy"
                  placeholderTextColor={C.text3}
                  returnKeyType="done"
                />
              </View>

              {/* Category picker */}
              <Text style={[s.fieldLabel, { color: C.text3 }]}>CATEGORY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catRow}>
                {CATEGORIES.map(cat => {
                  const sel = category === cat;
                  const cc = CAT_COLORS[cat];
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[s.catChip, { backgroundColor: sel ? `${cc}22` : C.cardInner, borderColor: sel ? cc : C.border, borderWidth: sel ? 1.5 : 1 }]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCategory(cat); }}
                    >
                      <Ionicons name={CAT_ICONS[cat]} size={13} color={sel ? cc : C.text3} />
                      <Text style={[s.catLabel, { color: sel ? cc : C.text2 }]}>{cat}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Actions */}
              <View style={s.actions}>
                <TouchableOpacity style={[s.skipBtn, { backgroundColor: C.cardInner, borderColor: C.border }]} onPress={handleSkip}>
                  <Text style={[s.skipText, { color: C.text2 }]}>Skip</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.saveBtn, { backgroundColor: color, shadowColor: color }]}
                  onPress={handleSave}
                >
                  <Ionicons name="checkmark" size={18} color="#000" />
                  <Text style={s.saveText}>Save Expense</Text>
                </TouchableOpacity>
              </View>

            </Animated.View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  kav: { width: '100%' },
  sheet: {
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    borderWidth: 1, borderBottomWidth: 0,
    padding: 20, paddingBottom: 36,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  counter: {
    alignSelf: 'flex-end', borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 3, marginBottom: 14,
  },
  counterText: { fontSize: 11, fontWeight: '700' },

  upiHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  upiIconWrap: {
    width: 52, height: 52, borderRadius: 16, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  upiIcon: { fontSize: 24 },
  upiTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  upiAmount: { fontSize: 30, fontWeight: '900', letterSpacing: -0.5 },

  vpaPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 5, marginBottom: 18,
  },
  vpaText: { fontSize: 12, fontWeight: '600', maxWidth: 240 },

  fieldLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2, marginBottom: 6 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 12, height: 46, marginBottom: 16,
  },
  input: { flex: 1, fontSize: 14, fontWeight: '600' },

  catRow: { gap: 7, paddingBottom: 18, paddingRight: 4 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7,
  },
  catLabel: { fontSize: 12, fontWeight: '700' },

  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  skipBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, borderWidth: 1, height: 52,
  },
  skipText: { fontSize: 14, fontWeight: '700' },
  saveBtn: {
    flex: 2.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, height: 52,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  saveText: { color: '#000', fontSize: 15, fontWeight: '900' },
});
