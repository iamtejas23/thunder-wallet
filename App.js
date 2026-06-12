import * as React from 'react';
import { Animated, Easing, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './ThemeContext';
import MainApp from './MainApp';

const MIN_SPLASH_MS = 3000;

function SplashScreen() {
  const pulse = React.useRef(new Animated.Value(0)).current;
  const fadeIn = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 700, useNativeDriver: true }).start();
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse, fadeIn]);

  const logoScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.09] });
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.32] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.0] });
  const progressWidth = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.08, 1] });

  return (
    <Animated.View style={[styles.splashContainer, { opacity: fadeIn }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <View style={styles.splashMarkWrap}>
        <Animated.View style={[styles.splashRing, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
        <Animated.Image
          source={require('./assets/logo.png')}
          style={[styles.splashLogo, { transform: [{ scale: logoScale }] }]}
        />
      </View>
      <Text style={styles.splashTitle}>Thunder Wallet</Text>
      <Text style={styles.splashSubtitle}>Smart money tracking</Text>
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { transform: [{ scaleX: progressWidth }] }]} />
      </View>
    </Animated.View>
  );
}

function App() {
  const [showSplash, setShowSplash] = React.useState(true);

  React.useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  if (showSplash) return <SplashScreen />;

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

const styles = StyleSheet.create({
  splashContainer: {
    alignItems: 'center',
    backgroundColor: '#0A0E1A',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  splashMarkWrap: {
    alignItems: 'center',
    height: 160,
    justifyContent: 'center',
    width: 160,
  },
  splashRing: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 80,
    height: 160,
    position: 'absolute',
    width: 160,
  },
  splashLogo: {
    borderRadius: 28,
    height: 100,
    width: 100,
  },
  splashTitle: {
    color: '#F9FAFB',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginTop: 28,
    textAlign: 'center',
  },
  splashSubtitle: {
    color: 'rgba(249,250,251,0.5)',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  progressTrack: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    height: 3,
    marginTop: 44,
    overflow: 'hidden',
    width: 180,
  },
  progressFill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    height: 3,
    width: 180,
  },
});

export default App;
