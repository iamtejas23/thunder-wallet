
# Thunder Wallet

Expense Tracker App 📊💸 Expense Tracker is a mobile app built with React Native that helps you manage your expenses effectively. Keep track of your transactions, categorize them, and monitor your balance on-the-go!


## Features 🚀

- Add Transactions: Easily add new transactions, specifying the category and amount.
- Transaction Details: View detailed information about each transaction, including the date.
- Sort Transactions: Toggle between sorting transactions by date or month.
- Delete Transactions: Remove unwanted transactions with a simple tap.


## Getting Started 🛠️ 
Installation

Install thunder-wallet with npm

```bash
git clone https://github.com/iamtejas23/thunder-wallet.git
cd thunder-wallet
```
Install Dependencies:
```bash
npm install
```
Run the App:
```bash
npm start
```

## Build Lightweight Release APK

Use this magic command from the project root to build a small Android release APK:

```bash
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a -Pandroid.enableProguardInReleaseBuilds=true -Pandroid.enableShrinkResourcesInReleaseBuilds=true -Pexpo.useLegacyPackaging=true
```

APK output path:

```bash
android/app/build/outputs/apk/release/app-release.apk
```

This build keeps the APK lightweight by building only `arm64-v8a`, using Hermes, enabling Proguard/resource shrinking, disabling extra GIF/WebP support, and compressing native libraries.

## GitHub Actions Release APK

Yes, GitHub Actions can build the lightweight APK and attach it to GitHub Releases automatically.

Release plan:

1. Update the app version in `package.json`, `app.json`, and `android/app/build.gradle`.
2. Commit and push your changes.
3. Create and push a version tag:

```bash
git tag v1.0.4
git push origin v1.0.4
```

4. GitHub Actions runs `.github/workflows/android-release.yml`.
5. The workflow builds the same lightweight `arm64-v8a` release APK.
6. The APK is uploaded to the matching GitHub Release as:

```bash
thunder-wallet-v1.0.4.apk
```

The workflow can also be run manually from the Actions tab. Manual runs upload the APK as a workflow artifact; tag pushes publish the APK directly to GitHub Releases.

Note: this project currently signs release APKs with the checked-in debug keystore, which is okay for direct testing/sharing. For Play Store or production signing, add a real release keystore through GitHub Secrets and update the Gradle signing config.


## Contributing 👩‍💻👨‍💻

Contributions are welcome! Feel free to open issues or submit pull requests to improve the app.

## Download the App 📲

- **iOS:** [Comming Soon...!](link-to-your-app-on-app-store).
- **Android:** Available (https://github.com/iamtejas23/thunder-wallet/releases/tag/1.0.0).

Enjoy tracking your expenses with the Expense Tracker app! 💰📊

## License 📄
This project is licensed under the MIT License - see the LICENSE file for details.


