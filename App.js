import * as React from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import MainApp from './MainApp';

const MIN_SPLASH_MS = 5000;

function SplashScreen() {
  const pulse = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const logoScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });
  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.88, 1.22],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.32, 0.08],
  });

  return (
    <View style={styles.splashContainer}>
      <View style={styles.splashMarkWrap}>
        <Animated.View
          style={[
            styles.splashRing,
            {
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />
        <Animated.Image
          source={require('./assets/logo.png')}
          style={[styles.splashLogo, { transform: [{ scale: logoScale }] }]}
        />
      </View>
      <Text style={styles.splashTitle}>Thunder Wallet</Text>
      <Text style={styles.splashSubtitle}>Loading your money dashboard</Text>
      <View style={styles.progressTrack}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              transform: [
                {
                  scaleX: pulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.38, 1],
                  }),
                },
              ],
            },
          ]}
        />
      </View>
    </View>
  );
}

function App() {
  const [showSplash, setShowSplash] = React.useState(true);

  React.useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  if (showSplash) {
    return <SplashScreen />;
  }

  return (
    <NavigationContainer>
      <MainApp />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    alignItems: 'center',
    backgroundColor: '#f7f4ef',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  splashMarkWrap: {
    alignItems: 'center',
    height: 172,
    justifyContent: 'center',
    width: 172,
  },
  splashRing: {
    backgroundColor: '#d8f7a6',
    borderRadius: 86,
    height: 172,
    position: 'absolute',
    width: 172,
  },
  splashLogo: {
    borderRadius: 34,
    height: 116,
    width: 116,
  },
  splashTitle: {
    color: '#1d2528',
    fontSize: 32,
    fontWeight: '900',
    marginTop: 22,
    textAlign: 'center',
  },
  splashSubtitle: {
    color: '#626b65',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
  },
  progressTrack: {
    backgroundColor: '#e5ddd1',
    borderRadius: 6,
    height: 6,
    marginTop: 30,
    overflow: 'hidden',
    width: 168,
  },
  progressFill: {
    backgroundColor: '#11342d',
    borderRadius: 6,
    height: 6,
    width: 168,
  },
});

export default App;
