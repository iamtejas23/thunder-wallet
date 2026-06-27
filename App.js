import * as React from 'react';
import { Animated, Dimensions, Easing, Image, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider } from './ThemeContext';
import MainApp from './MainApp';
import OnboardingScreen from './OnboardingScreen';
import PinScreen, { PIN_ENABLED_KEY } from './PinScreen';

const ONBOARDING_KEY = 'onboardingDone';
const { width, height } = Dimensions.get('window');

// Pre-computed so no Math.random() on each render
const PARTICLES = [
  { x: 0.12, y: 0.18, r: 3,   delay: 420, color: '#A78BFA' },
  { x: 0.85, y: 0.13, r: 4,   delay: 600, color: '#F59E0B' },
  { x: 0.07, y: 0.63, r: 2,   delay: 310, color: '#60A5FA' },
  { x: 0.91, y: 0.56, r: 3,   delay: 700, color: '#A78BFA' },
  { x: 0.22, y: 0.83, r: 4,   delay: 510, color: '#F59E0B' },
  { x: 0.78, y: 0.76, r: 2,   delay: 820, color: '#60A5FA' },
  { x: 0.50, y: 0.07, r: 3,   delay: 460, color: '#C4B5FD' },
  { x: 0.65, y: 0.91, r: 4,   delay: 360, color: '#FCD34D' },
  { x: 0.31, y: 0.37, r: 2,   delay: 660, color: '#60A5FA' },
  { x: 0.72, y: 0.29, r: 3.5, delay: 560, color: '#A78BFA' },
  { x: 0.43, y: 0.72, r: 2,   delay: 760, color: '#F59E0B' },
  { x: 0.14, y: 0.50, r: 4,   delay: 430, color: '#60A5FA' },
  { x: 0.58, y: 0.21, r: 3,   delay: 490, color: '#C4B5FD' },
  { x: 0.04, y: 0.86, r: 2,   delay: 640, color: '#FCD34D' },
  { x: 0.96, y: 0.32, r: 3,   delay: 390, color: '#A78BFA' },
  { x: 0.38, y: 0.10, r: 2,   delay: 720, color: '#60A5FA' },
];

function LoadingDots() {
  const dot0 = React.useRef(new Animated.Value(0)).current;
  const dot1 = React.useRef(new Animated.Value(0)).current;
  const dot2 = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const make = (dot, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -9, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(dot, { toValue:  0, duration: 280, easing: Easing.in(Easing.quad),  useNativeDriver: true }),
          Animated.delay(300),
        ])
      );
    const a0 = make(dot0,   0);
    const a1 = make(dot1, 140);
    const a2 = make(dot2, 280);
    a0.start(); a1.start(); a2.start();
    return () => { a0.stop(); a1.stop(); a2.stop(); };
  }, []);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {[dot0, dot1, dot2].map((dot, i) => (
        <Animated.View
          key={i}
          style={{
            width: 7, height: 7, borderRadius: 3.5,
            backgroundColor: i === 1 ? '#7C3AED' : 'rgba(167,139,250,0.45)',
            marginHorizontal: 5,
            transform: [{ translateY: dot }],
          }}
        />
      ))}
    </View>
  );
}

function SplashScreen() {
  // Flash burst
  const flashScale   = React.useRef(new Animated.Value(0)).current;
  const flashOpacity = React.useRef(new Animated.Value(0)).current;

  // Energy rings (3)
  const r1Scale   = React.useRef(new Animated.Value(0.15)).current;
  const r1Opacity = React.useRef(new Animated.Value(0)).current;
  const r2Scale   = React.useRef(new Animated.Value(0.15)).current;
  const r2Opacity = React.useRef(new Animated.Value(0)).current;
  const r3Scale   = React.useRef(new Animated.Value(0.15)).current;
  const r3Opacity = React.useRef(new Animated.Value(0)).current;

  // Glow orb
  const glowOpacity = React.useRef(new Animated.Value(0)).current;
  const glowScale   = React.useRef(new Animated.Value(0.8)).current;

  // Logo
  const logoScale   = React.useRef(new Animated.Value(0)).current;
  const logoOpacity = React.useRef(new Animated.Value(0)).current;

  // Shimmer sweep across logo
  const shimmerX = React.useRef(new Animated.Value(-110)).current;

  // Text
  const titleOpacity = React.useRef(new Animated.Value(0)).current;
  const titleY       = React.useRef(new Animated.Value(30)).current;
  const subOpacity   = React.useRef(new Animated.Value(0)).current;
  const dotsOpacity  = React.useRef(new Animated.Value(0)).current;

  // Particles
  const partAnims = React.useRef(PARTICLES.map(() => new Animated.Value(0))).current;

  React.useEffect(() => {
    // Flash burst
    Animated.sequence([
      Animated.delay(120),
      Animated.parallel([
        Animated.timing(flashScale, { toValue: 6, duration: 650, easing: Easing.out(Easing.exp), useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(flashOpacity, { toValue: 0.9, duration: 70,  useNativeDriver: true }),
          Animated.timing(flashOpacity, { toValue: 0,   duration: 580, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
      ]),
    ]).start();

    // Ring 1
    Animated.sequence([
      Animated.delay(180),
      Animated.parallel([
        Animated.timing(r1Scale, { toValue: 1,   duration: 750, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(r1Opacity, { toValue: 0.85, duration: 70,  useNativeDriver: true }),
          Animated.timing(r1Opacity, { toValue: 0,    duration: 680, useNativeDriver: true }),
        ]),
      ]),
    ]).start();

    // Ring 2
    Animated.sequence([
      Animated.delay(320),
      Animated.parallel([
        Animated.timing(r2Scale, { toValue: 1.8, duration: 850, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(r2Opacity, { toValue: 0.55, duration: 70,  useNativeDriver: true }),
          Animated.timing(r2Opacity, { toValue: 0,    duration: 780, useNativeDriver: true }),
        ]),
      ]),
    ]).start();

    // Ring 3
    Animated.sequence([
      Animated.delay(480),
      Animated.parallel([
        Animated.timing(r3Scale, { toValue: 2.7, duration: 950, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(r3Opacity, { toValue: 0.3, duration: 70,  useNativeDriver: true }),
          Animated.timing(r3Opacity, { toValue: 0,   duration: 880, useNativeDriver: true }),
        ]),
      ]),
    ]).start();

    // Glow orb
    Animated.sequence([
      Animated.delay(380),
      Animated.parallel([
        Animated.timing(glowOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(glowScale,   { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowScale, { toValue: 1.12, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(glowScale, { toValue: 1,    duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ).start();
    });

    // Logo spring-in
    Animated.sequence([
      Animated.delay(520),
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, friction: 5, tension: 85, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
      ]),
    ]).start(() => {
      // Shimmer sweep once
      Animated.timing(shimmerX, {
        toValue: 115, duration: 650,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start();
    });

    // Title
    Animated.sequence([
      Animated.delay(920),
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 520, useNativeDriver: true }),
        Animated.timing(titleY, { toValue: 0, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    // Tagline
    Animated.sequence([
      Animated.delay(1230),
      Animated.timing(subOpacity, { toValue: 1, duration: 480, useNativeDriver: true }),
    ]).start();

    // Loading dots
    Animated.sequence([
      Animated.delay(1550),
      Animated.timing(dotsOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // Particles
    partAnims.forEach((anim, i) => {
      Animated.sequence([
        Animated.delay(PARTICLES[i].delay),
        Animated.timing(anim, { toValue: 1, duration: 550, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    });
  }, []);

  return (
    <View style={s.splash}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Floating particles */}
      {PARTICLES.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: p.x * width - p.r,
            top:  p.y * height - p.r,
            width:  p.r * 2,
            height: p.r * 2,
            borderRadius: p.r,
            backgroundColor: p.color,
            opacity: partAnims[i],
          }}
        />
      ))}

      {/* Flash burst */}
      <Animated.View
        style={{
          position: 'absolute',
          width: 90, height: 90, borderRadius: 45,
          backgroundColor: '#ffffff',
          opacity: flashOpacity,
          transform: [{ scale: flashScale }],
        }}
      />

      {/* Energy rings */}
      <Animated.View style={[s.ring, { borderColor: '#7C3AED', borderWidth: 2.5, opacity: r1Opacity, transform: [{ scale: r1Scale }] }]} />
      <Animated.View style={[s.ring, { borderColor: '#A78BFA', borderWidth: 1.5, opacity: r2Opacity, transform: [{ scale: r2Scale }] }]} />
      <Animated.View style={[s.ring, { borderColor: '#C4B5FD', borderWidth: 1,   opacity: r3Opacity, transform: [{ scale: r3Scale }] }]} />

      {/* Glow orb */}
      <Animated.View
        style={{
          position: 'absolute',
          width: 220, height: 220, borderRadius: 110,
          backgroundColor: 'rgba(109,40,217,0.16)',
          shadowColor: '#7C3AED',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 1,
          shadowRadius: 72,
          elevation: 6,
          opacity: glowOpacity,
          transform: [{ scale: glowScale }],
        }}
      />

      {/* Logo */}
      <Animated.View
        style={[s.logoWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}
      >
        <Image source={require('./assets/logo.png')} style={s.logo} resizeMode="cover" />
        {/* Shimmer sweep */}
        <Animated.View
          style={{
            position: 'absolute', top: 0, bottom: 0,
            width: 44,
            backgroundColor: 'rgba(255,255,255,0.22)',
            transform: [{ translateX: shimmerX }],
          }}
        />
      </Animated.View>

      {/* Title + tagline */}
      <Animated.View
        style={{ alignItems: 'center', marginTop: 28, opacity: titleOpacity, transform: [{ translateY: titleY }] }}
      >
        <Text style={s.title}>Thunder Wallet</Text>
        <Animated.Text style={[s.sub, { opacity: subOpacity }]}>
          Smart money. Instant clarity. ⚡
        </Animated.Text>
      </Animated.View>

      {/* Loading dots */}
      <Animated.View style={{ position: 'absolute', bottom: 68, opacity: dotsOpacity }}>
        <LoadingDots />
      </Animated.View>
    </View>
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
        if (!onboarded) setShowOnboarding(true);
        else if (pinEnabled === 'true') setShowPin(true);
      } catch {}
      // 3-second splash
      await new Promise(r => setTimeout(r, 3000));
      setReady(true);
    })();
  }, []);

  if (!ready) return <SplashScreen />;

  if (showOnboarding) {
    return (
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
  }

  if (showPin && !pinUnlocked) {
    return (
      <SafeAreaProvider>
        <PinScreen mode="check" onSuccess={() => setPinUnlocked(true)} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <NavigationContainer>
          <MainApp />
        </NavigationContainer>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#060B18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 148,
    height: 148,
    borderRadius: 74,
  },
  logoWrap: {
    width: 100,
    height: 100,
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(124,58,237,0.4)',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 24,
    elevation: 14,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  title: {
    color: '#F5F3FF',
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  sub: {
    color: 'rgba(196,181,253,0.65)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 7,
    letterSpacing: 0.3,
  },
});
