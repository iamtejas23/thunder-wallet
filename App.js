import * as React from 'react';
import { Animated, Easing, StatusBar, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider } from './ThemeContext';
import MainApp from './MainApp';
import OnboardingScreen from './OnboardingScreen';
import PinScreen, { PIN_ENABLED_KEY } from './PinScreen';

const ONBOARDING_KEY = 'onboardingDone';

function SplashScreen() {
  const pulse = React.useRef(new Animated.Value(0)).current;
  const fadeIn = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  const logoScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.28] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.0] });

  return (
    <Animated.View style={[styles.splash, { opacity: fadeIn }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <View style={styles.logoWrap}>
        <Animated.View style={[styles.ring, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
        <Animated.Image
          source={require('./assets/logo.png')}
          style={[styles.logo, { transform: [{ scale: logoScale }] }]}
        />
      </View>
      <Text style={styles.splashTitle}>Thunder Wallet</Text>
      <Text style={styles.splashSub}>Smart money tracking</Text>
    </Animated.View>
  );
}

export default function App() {
  const [ready, setReady] = React.useState(false);
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const [showPin, setShowPin] = React.useState(false);
  const [pinUnlocked, setPinUnlocked] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const [onboarded, pinEnabled] = await Promise.all([
          AsyncStorage.getItem(ONBOARDING_KEY),
          AsyncStorage.getItem(PIN_ENABLED_KEY),
        ]);
        if (!onboarded) {
          setShowOnboarding(true);
        } else if (pinEnabled === 'true') {
          setShowPin(true);
        }
      } catch {}
      setReady(true);
    })();
  }, []);

  let inner;
  if (!ready) {
    inner = <SplashScreen />;
  } else if (showOnboarding) {
    inner = (
      <SafeAreaProvider>
        <OnboardingScreen
          onDone={async () => {
            const pinEnabled = await AsyncStorage.getItem(PIN_ENABLED_KEY);
            setShowOnboarding(false);
            if (pinEnabled === 'true') setShowPin(true);
          }}
        />
      </SafeAreaProvider>
    );
  } else if (showPin && !pinUnlocked) {
    inner = (
      <SafeAreaProvider>
        <PinScreen mode="check" onSuccess={() => setPinUnlocked(true)} />
      </SafeAreaProvider>
    );
  } else {
    inner = (
      <SafeAreaProvider>
        <ThemeProvider>
          <NavigationContainer>
            <MainApp />
          </NavigationContainer>
        </ThemeProvider>
      </SafeAreaProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {inner}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: '#0A0E1A', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  logoWrap: { alignItems: 'center', height: 140, justifyContent: 'center', width: 140 },
  ring: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.07)' },
  logo: { borderRadius: 24, height: 90, width: 90 },
  splashTitle: { color: '#F9FAFB', fontSize: 34, fontWeight: '900', letterSpacing: 0.5, marginTop: 24, textAlign: 'center' },
  splashSub: { color: 'rgba(249,250,251,0.45)', fontSize: 15, fontWeight: '600', marginTop: 8, textAlign: 'center' },
});
