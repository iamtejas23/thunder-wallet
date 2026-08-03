#!/usr/bin/env node
/**
 * Automated release bump for Thunder Wallet.
 *
 * Usage:
 *   npm run release              # patch bump (1.0.71 → 1.0.72), commit, tag, push
 *   npm run release -- minor     # 1.0.71 → 1.1.0
 *   npm run release -- major     # 1.0.71 → 2.0.0
 *   npm run release -- 1.2.0     # explicit version
 *   npm run release -- patch --dry-run
 *   npm run release -- patch --no-push
 *   npm run release -- patch --no-git   # files only
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APP_JSON = path.join(ROOT, 'app.json');
const PACKAGE_JSON = path.join(ROOT, 'package.json');
const PACKAGE_LOCK = path.join(ROOT, 'package-lock.json');
const BUILD_GRADLE = path.join(ROOT, 'android/app/build.gradle');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function parseVersion(v) {
  const clean = String(v).replace(/^v/, '').trim();
  const m = clean.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`Invalid version "${v}". Use x.y.z (e.g. 1.0.72).`);
  return { major: +m[1], minor: +m[2], patch: +m[3], text: clean };
}

function bumpVersion(current, kind) {
  const v = parseVersion(current);
  if (kind === 'major') return `${v.major + 1}.0.0`;
  if (kind === 'minor') return `${v.major}.${v.minor + 1}.0`;
  if (kind === 'patch') return `${v.major}.${v.minor}.${v.patch + 1}`;
  return parseVersion(kind).text;
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, stdio: opts.silent ? 'pipe' : 'inherit', encoding: 'utf8' });
}

function main() {
  const args = process.argv.slice(2).filter(Boolean);
  const dryRun = args.includes('--dry-run');
  const noPush = args.includes('--no-push');
  const noGit = args.includes('--no-git');
  const kind = args.find((a) => !a.startsWith('--')) || 'patch';

  const app = readJson(APP_JSON);
  const pkg = readJson(PACKAGE_JSON);
  const lock = fs.existsSync(PACKAGE_LOCK) ? readJson(PACKAGE_LOCK) : null;

  const current = app.expo?.version || pkg.version;
  const next = bumpVersion(current, kind);
  const currentCode = Number(app.expo?.android?.versionCode || 0);
  const nextCode = currentCode + 1;
  const tag = `v${next}`;

  console.log(`\nThunder Wallet release`);
  console.log(`  version:     ${current} → ${next}`);
  console.log(`  versionCode: ${currentCode} → ${nextCode}`);
  console.log(`  tag:         ${tag}`);
  if (dryRun) console.log('  mode:        dry-run (no writes)\n');
  else if (noGit) console.log('  mode:        files only\n');
  else if (noPush) console.log('  mode:        commit + tag (no push)\n');
  else console.log('  mode:        commit + tag + push\n');

  if (dryRun) return;

  // Working tree must be clean before a release commit (unless files-only)
  if (!noGit) {
    const status = sh('git status --porcelain', { silent: true }).trim();
    if (status) {
      console.error('Working tree is not clean. Commit or stash changes first.');
      process.exit(1);
    }
  }

  // app.json
  app.expo.version = next;
  if (!app.expo.android) app.expo.android = {};
  app.expo.android.versionCode = nextCode;
  writeJson(APP_JSON, app);

  // package.json
  pkg.version = next;
  writeJson(PACKAGE_JSON, pkg);

  // package-lock.json (root package entries only)
  if (lock) {
    lock.version = next;
    if (lock.packages?.['']) lock.packages[''].version = next;
    writeJson(PACKAGE_LOCK, lock);
  }

  // android/app/build.gradle — used by the GitHub Actions APK build
  if (fs.existsSync(BUILD_GRADLE)) {
    let gradle = fs.readFileSync(BUILD_GRADLE, 'utf8');
    const before = gradle;
    gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${nextCode}`);
    gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${next}"`);
    if (gradle === before) {
      console.error('Failed to update versionCode/versionName in android/app/build.gradle');
      process.exit(1);
    }
    fs.writeFileSync(BUILD_GRADLE, gradle);
  }

  console.log('Updated:');
  console.log('  - app.json');
  console.log('  - package.json');
  if (lock) console.log('  - package-lock.json');
  if (fs.existsSync(BUILD_GRADLE)) console.log('  - android/app/build.gradle');

  if (noGit) {
    console.log('\nDone (files only). Commit/tag/push when ready.');
    return;
  }

  // Avoid Cursor auto Co-authored-by on release commits when possible
  sh('git add app.json package.json package-lock.json android/app/build.gradle');
  sh(`git commit -m "chore: bump version ${current} → ${next}, versionCode ${currentCode} → ${nextCode}"`);

  // Recreate tag if it somehow exists locally
  try { sh(`git tag -d ${tag}`, { silent: true }); } catch (_) {}
  sh(`git tag ${tag}`);

  if (noPush) {
    console.log(`\nCreated commit + tag ${tag}. Push when ready:`);
    console.log(`  git push origin HEAD && git push origin ${tag}`);
    return;
  }

  sh('git push origin HEAD');
  sh(`git push origin ${tag}`);
  console.log(`\nReleased ${tag}. GitHub Actions will build and publish the APK.`);
}

try {
  main();
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
