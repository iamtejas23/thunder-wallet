import * as React from 'react';
import { Animated, Dimensions, Easing, Image, StatusBar, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider } from './ThemeContext';
import MainApp from './MainApp';
import OnboardingScreen from './OnboardingScreen';
import PinScreen, { PIN_ENABLED_KEY } from './PinScreen';

const ONBOARDING_KEY = 'onboardingDone';
const { width, height } = Dimensions.get('window');
const CX = width / 2;
const CY = height / 2;

// Web nodes — concentric rings around center
const RINGS = [
  { r: 60,  count: 6  },
  { r: 120, count: 10 },
  { r: 185, count: 14 },
  { r: 255, count: 18 },
];

function buildNodes() {
  const nodes = [{ x: CX, y: CY, ring: -1 }]; // center
  RINGS.forEach(({ r, count }, ri) => {
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2;
      nodes.push({ x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle), ring: ri });
    }
  });
  return nodes;
}

function buildEdges(nodes) {
  const edges = [];
  // spokes: center → each node
  nodes.forEach((n, i) => {
    if (i === 0) return;
    if (n.ring === 0) edges.push([0, i]);
  });
  // ring connections + cross-spokes
  let ringStart = 1;
  RINGS.forEach(({ count }, ri) => {
    for (let i = ringStart; i < ringStart + count; i++) {
      // connect around ring
      const next = ringStart + ((i - ringStart + 1) % count);
      edges.push([i, next]);
      // spoke to next ring
      if (ri < RINGS.length - 1) {
        const nextRingStart = ringStart + count;
        const nextCount = RINGS[ri + 1].count;
        const ratio = (i - ringStart) / count;
        const target = nextRingStart + Math.round(ratio * nextCount) % nextCount;
        edges.push([i, target]);
      }
    }
    ringStart += count;
  });
  return edges;
}

const NODES = buildNodes();
const EDGES = buildEdges(NODES);

// Animated SVG line wrapper
const AnimLine = Animated.createAnimatedComponent(Line);
const AnimCircle = Animated.createAnimatedComponent(Circle);

function SplashScreen() {
  const TOTAL_DURATION = 4800;
  const EDGE_STAGGER = TOTAL_DURATION / (EDGES.length + 20);

  // Per-edge opacity animations
  const edgeAnims = React.useRef(EDGES.map(() => new Animated.Value(0))).current;
  // Per-node animations
  const nodeAnims = React.useRef(NODES.map(() => new Animated.Value(0))).current;

  const logoScale   = React.useRef(new Animated.Value(0)).current;
  const logoOpacity = React.useRef(new Animated.Value(0)).current;
  const titleOpacity = React.useRef(new Animated.Value(0)).current;
  const titleY      = React.useRef(new Animated.Value(20)).current;
  const screenFade  = React.useRef(new Animated.Value(1)).current;
  const pulseAnim   = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    // 1. Draw edges progressively — useNativeDriver:false because SVG props
    const edgeSequence = EDGES.map((_, i) =>
      Animated.timing(edgeAnims[i], {
        toValue: 1,
        duration: 280,
        delay: i * EDGE_STAGGER,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      })
    );

    // 2. Pop nodes — useNativeDriver:false (SVG props)
    const nodeSequence = NODES.map((_, i) =>
      Animated.timing(nodeAnims[i], {
        toValue: 1,
        duration: 300,
        delay: 200 + i * (EDGE_STAGGER * 0.8),
        easing: Easing.out(Easing.back(2)),
        useNativeDriver: false,
      })
    );

    // 3. Logo appears at 1.5s
    const logoAnim = Animated.sequence([
      Animated.delay(1500),
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    ]);

    // 4. Title appears at 2.2s
    const titleAnim = Animated.sequence([
      Animated.delay(2200),
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(titleY, { toValue: 0, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
    ]);

    // 5. Subtle pulse on web after fully drawn
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );

    Animated.parallel([
      ...edgeSequence,
      ...nodeSequence,
      logoAnim,
      titleAnim,
    ]).start(() => pulse.start());
  }, []);

  const pulseStyle = { transform: [{ scale: pulseAnim }] };

  return (
    <View style={s.splash}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Web SVG layer */}
      <Animated.View style={[StyleSheet.absoluteFillObject, pulseStyle]}>
        <Svg width={width} height={height}>
          {/* Edges */}
          {EDGES.map(([a, b], i) => (
            <AnimLine
              key={`e${i}`}
              x1={NODES[a].x} y1={NODES[a].y}
              x2={NODES[b].x} y2={NODES[b].y}
              stroke="#4FC3F7"
              strokeWidth={0.8}
              opacity={edgeAnims[i]}
            />
          ))}
          {/* Nodes */}
          {NODES.map((n, i) => (
            <AnimCircle
              key={`n${i}`}
              cx={n.x} cy={n.y}
              r={i === 0 ? 5 : 2.5}
              fill={i === 0 ? '#00E5FF' : '#4FC3F7'}
              opacity={nodeAnims[i]}
            />
          ))}
        </Svg>
      </Animated.View>

      {/* Glow behind logo */}
      <Animated.View style={[s.glow, { opacity: logoOpacity }]} />

      {/* Logo */}
      <Animated.View style={[s.logoWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        <Image source={require('./assets/logo.png')} style={s.logo} />
      </Animated.View>

      {/* Title + subtitle */}
      <Animated.View style={{ alignItems: 'center', opacity: titleOpacity, transform: [{ translateY: titleY }], marginTop: 20 }}>
        <Text style={s.title}>Thunder Wallet</Text>
        <Text style={s.sub}>Smart money tracking ⚡</Text>
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
      // Minimum 5s splash
      await new Promise(r => setTimeout(r, 5000));
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
  glow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'transparent',
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 60,
    elevation: 0,
  },
  logoWrap: {
    width: 96,
    height: 96,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(0,229,255,0.35)',
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 12,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  title: {
    color: '#F0FDFF',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginTop: 6,
  },
  sub: {
    color: 'rgba(176,229,255,0.55)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
  },
});
