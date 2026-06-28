import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const CACHE_KEY = 'thunder_update_check';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const REPO     = 'iamtejas23/thunder-wallet';

function semverGt(remote, local) {
  const parse = v => v.replace(/^v/, '').split('.').map(Number);
  const [rA, rB, rC] = parse(remote);
  const [lA, lB, lC] = parse(local);
  if (rA !== lA) return rA > lA;
  if (rB !== lB) return rB > lB;
  return rC > lC;
}

export function useUpdateChecker() {
  const [update, setUpdate] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const current = Constants.expoConfig?.version ?? '0.0.0';

        // Return cached result if fresh
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw) {
          const { checkedAt, latestVersion, downloadUrl } = JSON.parse(raw);
          if (Date.now() - checkedAt < CACHE_TTL) {
            if (latestVersion && semverGt(latestVersion, current)) {
              setUpdate({ latestVersion, downloadUrl });
            }
            return;
          }
        }

        const res = await fetch(
          `https://api.github.com/repos/${REPO}/releases/latest`,
          { headers: { Accept: 'application/vnd.github+json' } },
        );
        if (!res.ok) return;

        const data = await res.json();
        const latestVersion = data.tag_name ?? '';
        const downloadUrl =
          data.assets?.[0]?.browser_download_url ?? data.html_url ?? '';

        await AsyncStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ checkedAt: Date.now(), latestVersion, downloadUrl }),
        );

        if (latestVersion && semverGt(latestVersion, current)) {
          setUpdate({ latestVersion, downloadUrl });
        }
      } catch {
        // non-critical — silent fail
      }
    })();
  }, []);

  return {
    hasUpdate:     !!update,
    latestVersion: update?.latestVersion,
    downloadUrl:   update?.downloadUrl,
    dismiss:       () => setUpdate(null),
  };
}
