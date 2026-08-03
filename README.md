# Thunder Wallet

**Premium offline-first expense manager for Android.**  
No cloud. No account. No ads. Your money stays on your device — always.

[![Latest Release](https://img.shields.io/github/v/release/iamtejas23/thunder-wallet?color=60A5FA&label=latest)](https://github.com/iamtejas23/thunder-wallet/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-34D399)](LICENSE)
[![React Native](https://img.shields.io/badge/React%20Native-0.81-A78BFA)](https://reactnative.dev)
[![Expo SDK](https://img.shields.io/badge/Expo%20SDK-54-60A5FA)](https://expo.dev)

---

## Download

| Platform | Status | Link |
|---|---|---|
| Android | ✅ Available | [Latest APK →](https://github.com/iamtejas23/thunder-wallet/releases/latest) |
| iOS | 🔜 Coming soon | Apple Developer account pending |

---

## Features

**Core**
- Add income & expense transactions with category, note, and date
- Monthly budget with daily breakdown and streak tracking
- Financial Health Score (0–100) based on savings rate + budget adherence
- Animated balance counter — you physically feel the money move
- Swipe-to-edit / delete on any transaction row (no libraries, pure PanResponder)

**Analytics**
- Interactive donut chart by category
- Day-of-week spending heatmap
- Month vs. last month comparison
- What-If Simulator — slide categories to see annual savings projection
- Per-category budget bars with overspend warnings

**Bills**
- Track subscriptions (Netflix, Jio, Rent, etc.) with due dates
- Local notifications fire 1 day before and on the due day — monthly, automatic
- Tap "Pay" to instantly log the expense transaction

**Cards Vault**
- Store card numbers and CVVs in Android Keystore / iOS Secure Enclave
- Biometric gate before revealing sensitive data
- Card flip animation to show details

**Savings Goals**
- Set named goals with target amounts and deadlines
- Progress bars + confetti explosion when you hit a goal

**Security & Privacy**
- 4-digit PIN + fingerprint/face unlock on app open
- Zero network permissions — data cannot leave the device
- 100% offline, works without internet forever

**App Experience**
- Dark mesh grid background across all screens
- Dark splash screen with breathing SVG mesh animation
- Pure black bottom nav with circular spotlight active state
- Full dark / light theme support
- In-app update checker — notified when a new version drops

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.81.5 + Expo SDK 54 (New Architecture) |
| Navigation | React Navigation v7 (Bottom Tabs) |
| Storage | AsyncStorage + expo-secure-store (Keystore/Enclave) |
| Notifications | expo-notifications (calendar triggers, exact alarms) |
| Biometrics | expo-local-authentication |
| Graphics | react-native-svg (mesh backgrounds, splash) |
| Build | GitHub Actions → APK, EAS Build → iOS |

---

## Getting Started (Local Dev)

```bash
git clone https://github.com/iamtejas23/thunder-wallet.git
cd thunder-wallet
npm install
npx expo start --clear
```

> **Note:** Requires Node 18 or 20. Node 24 is not supported by Expo SDK 54.

**Run on Android emulator:**
```bash
# Terminal 1 — start emulator
emulator -avd <YourAVD> -gpu swiftshader_indirect -no-snapshot-load

# Terminal 2 — start app (press 'a' once Metro is ready)
npx expo start --clear
```

---

## Building a Release APK

One command bumps every version field, commits, tags, and pushes — CI builds the APK and publishes it to GitHub Releases:

```bash
npm run release              # patch: 1.0.71 → 1.0.72
npm run release -- minor     # 1.0.71 → 1.1.0
npm run release -- major     # 1.0.71 → 2.0.0
npm run release -- 1.2.0     # explicit version
```

This updates `app.json`, `package.json`, `package-lock.json`, and `android/app/build.gradle` (`version` + `versionCode`), then creates tag `vX.Y.Z` and pushes. Settings and the APK always show the same version.

Preview without writing:
```bash
npm run release:dry
# or
npm run release -- patch --dry-run
```

The workflow (`.github/workflows/android-release.yml`) builds a lightweight `arm64-v8a` APK, verifies the tag matches the app version, and attaches it to the GitHub Release.

**Manual local build:**
```bash
cd android && ./gradlew assembleRelease \
  -PreactNativeArchitectures=arm64-v8a \
  -Pexpo.useLegacyPackaging=true \
  --no-daemon
# Output: android/app/build/outputs/apk/release/app-release.apk
```

---

## iOS Build (EAS)

```bash
# Simulator build — no Apple Developer account needed
npx eas-cli build --platform ios --profile simulator

# Real device / TestFlight — requires Apple Developer account ($99/yr)
npx eas-cli build --platform ios --profile preview
```

---

## Project Structure

```
thunder-wallet/
├── App.js                  # Splash screen + app entry
├── MainApp.js              # Tab navigator + all screens + business logic
├── MeshBackground.js       # SVG mesh grid + color blobs (shared background)
├── UpdateChecker.js        # GitHub Releases version check hook
├── UpdateModal.js          # In-app update bottom sheet
├── NotificationService.js  # Daily review + bill reminder scheduling
├── ThemeContext.js         # Dark / light theme provider
├── CardScreen.js           # Secure card vault
├── BillsScreen.js          # Bills tracker
├── SettingsScreen.js       # Settings + update checker
├── PinScreen.js            # PIN setup + verification
├── OnboardingScreen.js     # First-launch onboarding
├── docs/                   # GitHub Pages landing page
└── .github/workflows/      # CI: Android APK build + release
```

---

## Contributing

Issues and PRs are welcome. The entire codebase is plain React Native — no unusual abstractions.

## License

MIT — see [LICENSE](LICENSE).

Built by [@iamtejas23](https://github.com/iamtejas23)
