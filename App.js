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

// ── Palette ───────────────────────────────────────────────────────────────────
const GOLD    = '#F5A623';
const GOLD_LT = '#FFD700';
const AMBER   = '#E8920A';
const BG      = '#0A090D';

// ── Pre-computed data (no Math.random at render) ──────────────────────────────
const PARTICLES = [
  { x: 0.07, y: 0.11, r: 1.5, delay: 1050, color: GOLD    },
  { x: 0.92, y: 0.09, r: 2,   delay: 1200, color: AMBER   },
  { x: 0.04, y: 0.46, r: 1,   delay: 950,  color: GOLD_LT },
  { x: 0.96, y: 0.39, r: 2,   delay: 1100, color: GOLD    },
  { x: 0.15, y: 0.81, r: 1.5, delay: 1300, color: AMBER   },
  { x: 0.85, y: 0.77, r: 1,   delay: 1000, color: GOLD_LT },
  { x: 0.50, y: 0.05, r: 2,   delay: 1150, color: GOLD    },
  { x: 0.29, y: 0.92, r: 1.5, delay: 960,  color: AMBER   },
  { x: 0.71, y: 0.90, r: 1,   delay: 1060, color: GOLD_LT },
  { x: 0.21, y: 0.22, r: 2,   delay: 1250, color: GOLD    },
  { x: 0.79, y: 0.18, r: 1.5, delay: 1110, color: AMBER   },
  { x: 0.11, y: 0.61, r: 1,   delay: 1350, color: GOLD_LT },
  { x: 0.89, y: 0.57, r: 2,   delay: 1200, color: GOLD    },
  { x: 0.42, y: 0.07, r: 1.5, delay: 1010, color: AMBER   },
  { x: 0.58, y: 0.94, r: 1,   delay: 1160, color: GOLD_LT },
  { x: 0.35, y: 0.53, r: 1,   delay: 1400, color: GOLD    },
  { x: 0.65, y: 0.47, r: 1.5, delay: 1055, color: AMBER   },
  { x: 0.18, y: 0.34, r: 1,   delay: 1310, color: GOLD_LT },
  { x: 0.76, y: 0.29, r: 2,   delay: 1180, color: GOLD    },
  { x: 0.24, y: 0.67, r: 1.5, delay: 1090, color: AMBER   },
];

// Lightning streaks — thin rotated Views radiating from center
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

// Sparks — dots erupting from center
const SPARKS = [
  { sx: -24, sy: -54, ex: -44, ey: -108, r: 2.5, delay: 678, color: GOLD_LT },
  { sx:  38, sy: -46, ex:  68, ey:  -94, r: 2,   delay: 705, color: GOLD    },
  { sx: -48, sy: -16, ex: -90, ey:  -54, r: 2,   delay: 725, color: AMBER   },
  { sx:  49, sy:  18, ex:  90, ey:   58, r: 1.5, delay: 698, color: GOLD_LT },
  { sx: -18, sy:  53, ex: -38, ey:  100, r: 2.5, delay: 738, color: GOLD    },
  { sx:  22, sy: -62, ex:  42, ey: -114, r: 2,   delay: 692, color: AMBER   },
  { sx: -58, sy:  28, ex: -98, ey:   60, r: 1.5, delay: 718, color: GOLD_LT },
  { sx:  54, sy: -28, ex:  94, ey:  -64, r: 2,   delay: 758, color: GOLD    },
  { sx: -32, sy:  48, ex: -60, ey:   90, r: 1.5, delay: 702, color: AMBER   },
  { sx:  12, sy: -68, ex:  22, ey: -120, r: 2,   delay: 742, color: GOLD_LT },
];

// ── Splash Screen ─────────────────────────────────────────────────────────────
function SplashScreen() {
  // Ambient orbs
  const orb1 = React.useRef(new Animated.Value(0)).current;
  const orb2 = React.useRef(new Animated.Value(0)).current;

  // Initial flash
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

  // Glassmorphism wallet silhouette
  const walletAlpha = React.useRef(new Animated.Value(0)).current;
  const walletScale = React.useRef(new Animated.Value(0.92)).current;

  // Gold glow
  const glowAlpha  = React.useRef(new Animated.Value(0)).current;
  const glowScale  = React.useRef(new Animated.Value(0.55)).current;
  const glow2Alpha = React.useRef(new Animated.Value(0)).current;

  // Logo
  const logoScale   = React.useRef(new Animated.Value(0)).current;
  const logoAlpha   = React.useRef(new Animated.Value(0)).current;
  const logoPulse   = React.useRef(new Animated.Value(1)).current;
  const shimmerX    = React.useRef(new Animated.Value(-118)).current;
  // Multiply scale × pulse for combined transform
  const logoFinalScale = React.useRef(Animated.multiply(logoScale, logoPulse)).current;

  // Sparks
  const sparkAnims = React.useRef(SPARKS.map(() => new Animated.Value(0))).current;

  // Particles
  const partAlpha = React.useRef(PARTICLES.map(() => new Animated.Value(0))).current;
  const partY     = React.useRef(PARTICLES.map(() => new Animated.Value(0))).current;

  // Title — "blur-to-sharp" simulated via scale 1.07 → 1 + fade + rise
  const titleAlpha = React.useRef(new Animated.Value(0)).current;
  const titleScale = React.useRef(new Animated.Value(1.07)).current;
  const titleY     = React.useRef(new Animated.Value(22)).current;

  // Tagline
  const subAlpha = React.useRef(new Animated.Value(0)).current;
  const subY     = React.useRef(new Animated.Value(14)).current;

  // Gold loading bar (uses JS driver — animates % width)
  const loadAlpha = React.useRef(new Animated.Value(0)).current;
  const loadPct   = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    // ── Ambient orbs ──
    Animated.parallel([
      Animated.timing(orb1, { toValue: 1, duration: 1000, delay: 40,  useNativeDriver: true }),
      Animated.timing(orb2, { toValue: 1, duration: 1000, delay: 160, useNativeDriver: true }),
    ]).start();

    // ── Flash burst ──
    Animated.sequence([
      Animated.delay(135),
      Animated.parallel([
        Animated.timing(flashScale, {
          toValue: 8, duration: 620,
          easing: Easing.out(Easing.exp), useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(flashOpacity, { toValue: 0.65, duration: 65,  useNativeDriver: true }),
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

    // ── Wallet silhouette ──
    Animated.sequence([
      Animated.delay(458),
      Animated.parallel([
        Animated.timing(walletAlpha, { toValue: 1, duration: 580,
          easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(walletScale, { toValue: 1, duration: 580,
          easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
      ]),
    ]).start();

    // ── Gold glow ──
    Animated.sequence([
      Animated.delay(375),
      Animated.parallel([
        Animated.timing(glowAlpha,  { toValue: 1, duration: 720, useNativeDriver: true }),
        Animated.timing(glowScale,  { toValue: 1, duration: 720,
          easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow2Alpha, { toValue: 1, duration: 520, delay: 200, useNativeDriver: true }),
      ]),
    ]).start(() => {
      // Breathe glow continuously
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
      // Shimmer sweep once
      Animated.timing(shimmerX, {
        toValue: 122, duration: 720,
        easing: Easing.inOut(Easing.quad), useNativeDriver: true,
      }).start();
      // Subtle continuous heartbeat
      Animated.loop(
        Animated.sequence([
          Animated.timing(logoPulse, { toValue: 1.055, duration: 1900,
            easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(logoPulse, { toValue: 1,     duration: 1900,
            easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ).start();
    });

    // ── Sparks ──
    sparkAnims.forEach((anim, i) => {
      Animated.sequence([
        Animated.delay(SPARKS[i].delay),
        Animated.timing(anim, { toValue: 1, duration: 880,
          easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    });

    // ── Floating particles ──
    partAlpha.forEach((anim, i) => {
      Animated.sequence([
        Animated.delay(PARTICLES[i].delay),
        Animated.timing(anim, { toValue: 1, duration: 680,
          easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start(() => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(partY[i], { toValue: -14, duration: 1850 + i * 140,
              easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(partY[i], { toValue: 0,   duration: 1850 + i * 140,
              easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ])
        ).start();
      });
    });

    // ── Title (blur-to-sharp: scale 1.07→1 + opacity + rise) ──
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

    // ── Loading bar (JS driver — animates layout width %) ──
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

  const WALLET_W = width * 0.80;
  const WALLET_H = WALLET_W * 0.575;

  return (
    <View style={s.splash}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* ── Warm ambient orbs ── */}
      <Animated.View style={[s.orbTL, { opacity: orb1 }]} />
      <Animated.View style={[s.orbBR, { opacity: orb2 }]} />

      {/* Vignette top + bottom for depth */}
      <View style={s.vigTop} />
      <View style={s.vigBtm} />

      {/* ── Flash burst ── */}
      <Animated.View style={{
        position: 'absolute',
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: '#FFF6DC',
        opacity: flashOpacity,
        transform: [{ scale: flashScale }],
      }} />

      {/* ── Expanding gold pulse rings ── */}
      <Animated.View style={[s.ring, {
        borderColor: `${GOLD}99`, borderWidth: 2,
        opacity: r1Alpha, transform: [{ scale: r1Scale }],
      }]} />
      <Animated.View style={[s.ring, {
        borderColor: `${GOLD}66`, borderWidth: 1.5,
        opacity: r2Alpha, transform: [{ scale: r2Scale }],
      }]} />
      <Animated.View style={[s.ring, {
        borderColor: `${GOLD}33`, borderWidth: 1,
        opacity: r3Alpha, transform: [{ scale: r3Scale }],
      }]} />

      {/* ── Lightning streaks ── */}
      {STREAKS.map((sk, i) => (
        <Animated.View key={`sk${i}`} style={{
          position: 'absolute',
          width: sk.w, height: 1.5,
          backgroundColor: GOLD_LT,
          opacity: streakAnims[i],
          transform: [
            { translateX: sk.tx },
            { translateY: sk.ty },
            { rotate: `${sk.angle}deg` },
          ],
          shadowColor: GOLD_LT,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.9,
          shadowRadius: 6,
        }} />
      ))}

      {/* ── Glassmorphism wallet silhouette ── */}
      <Animated.View style={[s.wallet, {
        width: WALLET_W, height: WALLET_H,
        opacity: walletAlpha,
        transform: [{ translateY: 28 }, { scale: walletScale }],
      }]}>
        {/* Top edge gold line */}
        <View style={[s.walletTopLine, { width: WALLET_W * 0.68 }]} />
        {/* Frosted sheen */}
        <View style={s.walletSheen} />
        {/* Corner accent dots */}
        <View style={[s.walletDot, { top: 13, left: 16 }]} />
        <View style={[s.walletDot, { top: 13, right: 16 }]} />
        {/* Bottom chip hint */}
        <View style={s.chipHint} />
      </Animated.View>

      {/* ── Outer gold glow cloud ── */}
      <Animated.View style={{
        position: 'absolute',
        width: 290, height: 290, borderRadius: 145,
        backgroundColor: 'rgba(245,166,35,0.055)',
        shadowColor: GOLD,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.65,
        shadowRadius: 95,
        elevation: 8,
        opacity: glowAlpha,
        transform: [{ scale: glowScale }],
      }} />
      {/* Inner warm core */}
      <Animated.View style={{
        position: 'absolute',
        width: 155, height: 155, borderRadius: 77.5,
        backgroundColor: 'rgba(245,166,35,0.10)',
        opacity: glow2Alpha,
      }} />

      {/* ── Erupting sparks ── */}
      {SPARKS.map((sp, i) => {
        const tx = sparkAnims[i].interpolate({
          inputRange: [0, 1], outputRange: [sp.sx, sp.ex],
        });
        const ty = sparkAnims[i].interpolate({
          inputRange: [0, 1], outputRange: [sp.sy, sp.ey],
        });
        const op = sparkAnims[i].interpolate({
          inputRange: [0, 0.12, 0.62, 1],
          outputRange: [0, 1, 0.55, 0],
        });
        return (
          <Animated.View key={`sp${i}`} style={{
            position: 'absolute',
            width: sp.r * 2, height: sp.r * 2, borderRadius: sp.r,
            backgroundColor: sp.color,
            shadowColor: sp.color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 1,
            shadowRadius: 4,
            opacity: op,
            transform: [{ translateX: tx }, { translateY: ty }],
          }} />
        );
      })}

      {/* ── Content column: logo + text centred by parent ── */}
      <View style={{ alignItems: 'center' }}>

        {/* Logo */}
        <Animated.View style={[s.logoWrap, {
          opacity: logoAlpha,
          transform: [{ scale: logoFinalScale }],
        }]}>
          <Image source={require('./assets/logo.png')} style={s.logo} resizeMode="cover" />
          {/* Shimmer sweep */}
          <Animated.View style={{
            position: 'absolute', top: 0, bottom: 0, width: 54,
            backgroundColor: 'rgba(255,238,170,0.20)',
            transform: [{ translateX: shimmerX }],
          }} />
        </Animated.View>

        {/* ── "THUNDER WALLET" — blur-to-sharp reveal ── */}
        <Animated.View style={{
          alignItems: 'center', marginTop: 36,
          opacity: titleAlpha,
          transform: [{ scale: titleScale }, { translateY: titleY }],
        }}>
          <Text style={s.titleGold}>THUNDER</Text>
          <Text style={s.titleLight}>WALLET</Text>
        </Animated.View>

        {/* ── Tagline ── */}
        <Animated.View style={{
          alignItems: 'center', marginTop: 16,
          opacity: subAlpha,
          transform: [{ translateY: subY }],
        }}>
          <View style={s.divider} />
          <Text style={s.tagline}>PREMIUM FINANCIAL COMPANION</Text>
        </Animated.View>
      </View>

      {/* ── Floating ambient particles ── */}
      {PARTICLES.map((p, i) => (
        <Animated.View key={`p${i}`} style={{
          position: 'absolute',
          left: p.x * width - p.r,
          top:  p.y * height - p.r,
          width: p.r * 2, height: p.r * 2,
          borderRadius: p.r,
          backgroundColor: p.color,
          shadowColor: p.color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.9,
          shadowRadius: 3,
          opacity: partAlpha[i],
          transform: [{ translateY: partY[i] }],
        }} />
      ))}

      {/* ── Gold loading bar ── */}
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

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Ambient warm orbs — background mood lighting
  orbTL: {
    position: 'absolute',
    width: 420, height: 420, borderRadius: 210,
    top: -130, left: -130,
    backgroundColor: 'rgba(180,110,14,0.065)',
    shadowColor: '#C8860A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 110,
  },
  orbBR: {
    position: 'absolute',
    width: 380, height: 380, borderRadius: 190,
    bottom: -110, right: -110,
    backgroundColor: 'rgba(150,88,10,0.05)',
    shadowColor: AMBER,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 95,
  },

  // Depth vignettes
  vigTop: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: height * 0.18,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  vigBtm: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: height * 0.22,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },

  // Pulse ring base
  ring: {
    position: 'absolute',
    width: 158, height: 158, borderRadius: 79,
  },

  // Glassmorphism wallet card silhouette
  wallet: {
    position: 'absolute',
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.018)',
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.13)',
    overflow: 'hidden',
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
  },
  walletTopLine: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    height: 1,
    backgroundColor: 'rgba(245,166,35,0.28)',
  },
  walletSheen: {
    position: 'absolute',
    top: 1, left: 0, right: 0,
    height: 52,
    backgroundColor: 'rgba(255,255,255,0.010)',
  },
  walletDot: {
    position: 'absolute',
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(245,166,35,0.22)',
  },
  chipHint: {
    position: 'absolute',
    bottom: 18, left: 20,
    width: 32, height: 24, borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.12)',
    backgroundColor: 'rgba(245,166,35,0.04)',
  },

  // Logo container
  logoWrap: {
    width: 108, height: 108,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(245,166,35,0.48)',
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 30,
    elevation: 20,
  },
  logo: { width: '100%', height: '100%' },

  // Typography
  titleGold: {
    color: GOLD,
    fontSize: 33,
    fontWeight: '900',
    letterSpacing: 9,
    textShadowColor: 'rgba(245,166,35,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  titleLight: {
    color: 'rgba(228,218,190,0.80)',
    fontSize: 17,
    fontWeight: '300',
    letterSpacing: 9,
    marginTop: -1,
  },
  divider: {
    width: 42, height: 1,
    backgroundColor: 'rgba(245,166,35,0.38)',
    marginBottom: 9,
  },
  tagline: {
    color: 'rgba(195,170,110,0.48)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 3.8,
  },

  // Gold loading bar
  loadTrack: {
    height: 2,
    backgroundColor: 'rgba(245,166,35,0.12)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  loadFill: {
    height: 2,
    backgroundColor: GOLD,
    borderRadius: 1,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 5,
  },
});
