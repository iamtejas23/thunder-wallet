import * as React from 'react';
import { Animated, Dimensions, Easing, Image, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import { useFonts } from 'expo-font';
import { ThemeProvider } from './ThemeContext';
import MainApp from './MainApp';
import OnboardingScreen from './OnboardingScreen';
import PinScreen, { PIN_ENABLED_KEY } from './PinScreen';
import {
  DMSans_100Thin,
  DMSans_300Light,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  DMSans_800ExtraBold,
  DMSans_900Black,
} from './Typography';

const ONBOARDING_KEY = 'onboardingDone';
const { width, height } = Dimensions.get('window');

// ── Dark palette — no gold ────────────────────────────────────────────────────
const BLUE   = '#60A5FA';
const PURPLE = '#A78BFA';
const WHITE  = '#FFFFFF';
const BG     = '#0A0E1A';

// Lightning streaks — white/ice blue
const STREAKS = [
  { angle: -52, tx: -55, ty: -85,  w: 108, delay: 365 },
  { angle:  33, tx:  68, ty: -72,  w:  90, delay: 395 },
  { angle: -18, tx: -90, ty:  18,  w: 100, delay: 428 },
  { angle:  63, tx:  78, ty:  44,  w:  80, delay: 380 },
  { angle: -73, tx:  28, ty: -98,  w:  72, delay: 412 },
  { angle:  14, tx: -38, ty:  90,  w:  95, delay: 450 },
  { angle:  83, tx: -80, ty: -28,  w:  66, delay: 392 },
  { angle: -38, tx:  58, ty:  84,  w:  85, delay: 438 },
];


// ── Splash Screen ─────────────────────────────────────────────────────────────
function SplashScreen() {
  // Mesh breathing
  const meshAlpha = React.useRef(new Animated.Value(0)).current;

  // Ambient blobs
  // Flash burst
  const flashScale   = React.useRef(new Animated.Value(0.2)).current;
  const flashOpacity = React.useRef(new Animated.Value(0)).current;

  // Pulse rings (3 expanding rings)
  const r1Scale = React.useRef(new Animated.Value(0.12)).current;
  const r1Alpha = React.useRef(new Animated.Value(0)).current;
  const r2Scale = React.useRef(new Animated.Value(0.12)).current;
  const r2Alpha = React.useRef(new Animated.Value(0)).current;
  const r3Scale = React.useRef(new Animated.Value(0.12)).current;
  const r3Alpha = React.useRef(new Animated.Value(0)).current;

  // Lightning streaks
  const streakAnims = React.useRef(STREAKS.map(() => new Animated.Value(0))).current;

  // Blue glow
  const glowAlpha  = React.useRef(new Animated.Value(0)).current;
  const glowScale  = React.useRef(new Animated.Value(0.55)).current;
  const glow2Alpha = React.useRef(new Animated.Value(0)).current;

  // Logo
  const logoScale  = React.useRef(new Animated.Value(0)).current;
  const logoAlpha  = React.useRef(new Animated.Value(0)).current;
  const logoPulse  = React.useRef(new Animated.Value(1)).current;
  const logoFinalScale = React.useRef(Animated.multiply(logoScale, logoPulse)).current;

  // Title
  const titleAlpha = React.useRef(new Animated.Value(0)).current;
  const titleScale = React.useRef(new Animated.Value(1.07)).current;
  const titleY     = React.useRef(new Animated.Value(22)).current;

  // Tagline
  const subAlpha = React.useRef(new Animated.Value(0)).current;
  const subY     = React.useRef(new Animated.Value(14)).current;

  // Loading bar (JS driver)
  const loadAlpha = React.useRef(new Animated.Value(0)).current;
  const loadPct   = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    // ── Mesh: fade in then breathe ──
    Animated.sequence([
      Animated.delay(80),
      Animated.timing(meshAlpha, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(meshAlpha, { toValue: 0.62, duration: 2000,
            easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(meshAlpha, { toValue: 1,    duration: 2000,
            easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ).start();
    });

    // ── Flash burst (white/ice) ──
    Animated.sequence([
      Animated.delay(135),
      Animated.parallel([
        Animated.timing(flashScale,   { toValue: 8, duration: 620,
          easing: Easing.out(Easing.exp), useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(flashOpacity, { toValue: 0.55, duration: 65,  useNativeDriver: true }),
          Animated.timing(flashOpacity, { toValue: 0,    duration: 555,
            easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
      ]),
    ]).start();

    // ── Pulse rings ──
    const rings = [
      { scale: r1Scale, alpha: r1Alpha, toS: 1,   delay: 240, dur: 720 },
      { scale: r2Scale, alpha: r2Alpha, toS: 1.75, delay: 370, dur: 870 },
      { scale: r3Scale, alpha: r3Alpha, toS: 2.7,  delay: 510, dur: 1020 },
    ];
    rings.forEach(({ scale, alpha, toS, delay, dur }) => {
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale, { toValue: toS, duration: dur,
            easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(alpha, { toValue: 0.72, duration: 62,       useNativeDriver: true }),
            Animated.timing(alpha, { toValue: 0,    duration: dur - 62, useNativeDriver: true }),
          ]),
        ]),
      ]).start();
    });

    // ── Lightning streaks ──
    streakAnims.forEach((anim, i) => {
      Animated.sequence([
        Animated.delay(STREAKS[i].delay),
        Animated.timing(anim, { toValue: 1, duration: 68,  useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 230,
          easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    });

    // ── Blue glow ──
    Animated.sequence([
      Animated.delay(375),
      Animated.parallel([
        Animated.timing(glowAlpha,  { toValue: 1, duration: 720, useNativeDriver: true }),
        Animated.timing(glowScale,  { toValue: 1, duration: 720,
          easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow2Alpha, { toValue: 1, duration: 520, delay: 200, useNativeDriver: true }),
      ]),
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowScale, { toValue: 1.10, duration: 2200,
            easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(glowScale, { toValue: 1,    duration: 2200,
            easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ).start();
    });

    // ── Logo ──
    Animated.sequence([
      Animated.delay(555),
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, friction: 5, tension: 88, useNativeDriver: true }),
        Animated.timing(logoAlpha, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(logoPulse, { toValue: 1.055, duration: 1900,
            easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(logoPulse, { toValue: 1,     duration: 1900,
            easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ).start();
    });

    // ── Title ──
    Animated.sequence([
      Animated.delay(975),
      Animated.parallel([
        Animated.timing(titleAlpha, { toValue: 1, duration: 680, useNativeDriver: true }),
        Animated.timing(titleScale, { toValue: 1, duration: 680,
          easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(titleY,     { toValue: 0, duration: 680,
          easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    // ── Tagline ──
    Animated.sequence([
      Animated.delay(1270),
      Animated.parallel([
        Animated.timing(subAlpha, { toValue: 1, duration: 580, useNativeDriver: true }),
        Animated.timing(subY,     { toValue: 0, duration: 580,
          easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    // ── Loading bar ──
    Animated.sequence([
      Animated.delay(1460),
      Animated.timing(loadAlpha, { toValue: 1, duration: 360, useNativeDriver: true }),
    ]).start();
    Animated.sequence([
      Animated.delay(1560),
      Animated.timing(loadPct, { toValue: 1, duration: 1160,
        easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
    ]).start();
  }, []);

  return (
    <View style={s.splash}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* ── Animated mesh grid ── */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: meshAlpha }]}>
        <Svg width={width} height={height}>
          <Defs>
            <Pattern id="splash_grid" x="0" y="0" width="44" height="44" patternUnits="userSpaceOnUse">
              <Path
                d="M 44 0 L 0 0 0 44"
                fill="none"
                stroke="rgba(255,255,255,0.10)"
                strokeWidth="0.9"
              />
            </Pattern>
          </Defs>
          <Rect x="0" y="0" width={width} height={height} fill="url(#splash_grid)" />
        </Svg>
      </Animated.View>

      {/* Vignette */}
      <View style={s.vigTop} />
      <View style={s.vigBtm} />

      {/* ── Flash burst (white) ── */}
      <Animated.View style={{
        position: 'absolute',
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: '#E8F4FF',
        opacity: flashOpacity,
        transform: [{ scale: flashScale }],
      }} />

      {/* ── Expanding blue/purple pulse rings ── */}
      <Animated.View style={[s.ring, {
        borderColor: `${BLUE}99`, borderWidth: 2,
        opacity: r1Alpha, transform: [{ scale: r1Scale }],
      }]} />
      <Animated.View style={[s.ring, {
        borderColor: `${BLUE}66`, borderWidth: 1.5,
        opacity: r2Alpha, transform: [{ scale: r2Scale }],
      }]} />
      <Animated.View style={[s.ring, {
        borderColor: `${PURPLE}33`, borderWidth: 1,
        opacity: r3Alpha, transform: [{ scale: r3Scale }],
      }]} />

      {/* ── Lightning streaks (white/ice) ── */}
      {STREAKS.map((sk, i) => (
        <Animated.View key={`sk${i}`} style={{
          position: 'absolute',
          width: sk.w, height: 1.5,
          backgroundColor: 'rgba(200,225,255,0.90)',
          opacity: streakAnims[i],
          transform: [
            { translateX: sk.tx },
            { translateY: sk.ty },
            { rotate: `${sk.angle}deg` },
          ],
          shadowColor: WHITE,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.9,
          shadowRadius: 6,
        }} />
      ))}

      {/* ── Blue outer glow ── */}
      <Animated.View style={{
        position: 'absolute',
        width: 290, height: 290, borderRadius: 145,
        backgroundColor: 'rgba(96,165,250,0.045)',
        shadowColor: BLUE,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.60,
        shadowRadius: 90,
        elevation: 8,
        opacity: glowAlpha,
        transform: [{ scale: glowScale }],
      }} />
      {/* Inner purple core */}
      <Animated.View style={{
        position: 'absolute',
        width: 155, height: 155, borderRadius: 77.5,
        backgroundColor: 'rgba(167,139,250,0.08)',
        opacity: glow2Alpha,
      }} />


      {/* ── Content column ── */}
      <View style={{ alignItems: 'center' }}>

        {/* Logo */}
        <Animated.View style={{
          opacity: logoAlpha,
          transform: [{ scale: logoFinalScale }],
        }}>
          <Image source={require('./assets/logo.png')} style={s.logo} resizeMode="contain" />
        </Animated.View>

        {/* ── THUNDER WALLET title ── */}
        <Animated.View style={{
          alignItems: 'center', marginTop: 34,
          opacity: titleAlpha,
          transform: [{ scale: titleScale }, { translateY: titleY }],
        }}>
          <Text style={s.titleTop}>THUNDER</Text>
          <Text style={s.titleBot}>WALLET</Text>
        </Animated.View>

        {/* ── Tagline ── */}
        <Animated.View style={{
          alignItems: 'center', marginTop: 18,
          opacity: subAlpha,
          transform: [{ translateY: subY }],
        }}>
          <View style={s.divider} />
          <Text style={s.tagline}>PREMIUM FINANCIAL COMPANION</Text>
        </Animated.View>
      </View>


      {/* ── Loading bar (blue) ── */}
      <Animated.View style={{ position: 'absolute', bottom: 62, width: 190, opacity: loadAlpha }}>
        <View style={s.loadTrack}>
          <Animated.View style={[s.loadFill, {
            width: loadPct.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          }]} />
        </View>
      </Animated.View>
    </View>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [ready, setReady] = React.useState(false);
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const [showPin, setShowPin] = React.useState(false);
  const [pinUnlocked, setPinUnlocked] = React.useState(false);

  const [fontsLoaded] = useFonts({
    DMSans_100Thin,
    DMSans_300Light,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    DMSans_800ExtraBold,
    DMSans_900Black,
  });

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
      await new Promise(r => setTimeout(r, 3000));
      setReady(true);
    })();
  }, []);

  if (!ready || !fontsLoaded) return <SplashScreen />;

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

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Depth vignettes
  vigTop: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: height * 0.18,
    backgroundColor: 'rgba(0,0,0,0.14)',
  },
  vigBtm: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: height * 0.22,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },

  // Pulse ring base
  ring: {
    position: 'absolute',
    width: 158, height: 158, borderRadius: 79,
  },

  // Logo container — white/blue border
  logo: { width: 110, height: 110 },

  // Typography
  titleTop: {
    color: WHITE,
    fontFamily: 'DMSans_900Black',
    fontSize: 36,
    letterSpacing: 10,
    textShadowColor: 'rgba(96,165,250,0.45)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  titleBot: {
    color: 'rgba(255,255,255,0.82)',
    fontFamily: 'DMSans_800ExtraBold',
    fontSize: 36,
    letterSpacing: 10,
    marginTop: 2,
    textShadowColor: 'rgba(167,139,250,0.35)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },

  divider: {
    width: 42, height: 1,
    backgroundColor: 'rgba(96,165,250,0.40)',
    marginBottom: 9,
  },
  tagline: {
    color: 'rgba(255,255,255,0.32)',
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 9,
    letterSpacing: 3.8,
  },

  // Loading bar — blue
  loadTrack: {
    height: 2,
    backgroundColor: 'rgba(96,165,250,0.12)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  loadFill: {
    height: 2,
    backgroundColor: BLUE,
    borderRadius: 1,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 5,
  },
});
