import React, { createContext, useContext, useEffect, useState } from 'react';
import { StatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = 'appTheme';

export const darkColors = {
  bg: '#0A0E1A',
  card: '#111827',
  cardInner: '#1A2235',
  border: 'rgba(255,255,255,0.07)',
  text1: '#F9FAFB',
  text2: 'rgba(249,250,251,0.5)',
  text3: 'rgba(249,250,251,0.2)',
  accent: '#FFFFFF',
  accentBg: 'rgba(255,255,255,0.08)',
  accentBorder: 'rgba(255,255,255,0.14)',
  income: '#34D399',
  incomeBg: 'rgba(52,211,153,0.12)',
  expense: '#F87171',
  expenseBg: 'rgba(248,113,113,0.12)',
  amber: '#FCD34D',
  amberBg: 'rgba(252,211,77,0.1)',
  blue: '#60A5FA',
  blueBg: 'rgba(96,165,250,0.12)',
  purple: '#A78BFA',
  purpleBg: 'rgba(167,139,250,0.12)',
  tab: '#0D1526',
  tabBorder: 'rgba(255,255,255,0.07)',
  balanceCard: '#131D30',
  isDark: true,
};

export const lightColors = {
  bg: '#F1F5F9',
  card: '#FFFFFF',
  cardInner: '#F8FAFC',
  border: 'rgba(0,0,0,0.07)',
  text1: '#0F172A',
  text2: '#64748B',
  text3: '#94A3B8',
  accent: '#0F172A',
  accentBg: 'rgba(15,23,42,0.05)',
  accentBorder: 'rgba(15,23,42,0.12)',
  income: '#059669',
  incomeBg: 'rgba(5,150,105,0.08)',
  expense: '#DC2626',
  expenseBg: 'rgba(220,38,38,0.08)',
  amber: '#D97706',
  amberBg: 'rgba(217,119,6,0.08)',
  blue: '#2563EB',
  blueBg: 'rgba(37,99,235,0.08)',
  purple: '#7C3AED',
  purpleBg: 'rgba(124,58,237,0.08)',
  tab: '#FFFFFF',
  tabBorder: 'rgba(0,0,0,0.07)',
  balanceCard: '#1E293B',
  isDark: false,
};

const ThemeContext = createContext({ C: darkColors, toggleTheme: () => {}, isDark: true });

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((val) => { if (val === 'light') setIsDark(false); })
      .catch(() => {});
  }, []);

  const toggleTheme = async () => {
    const next = !isDark;
    setIsDark(next);
    try { await AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light'); } catch {}
  };

  return (
    <ThemeContext.Provider value={{ C: isDark ? darkColors : lightColors, toggleTheme, isDark }}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={isDark ? 'light-content' : 'dark-content'}
      />
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
