import { PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// SMS native modules removed — they crash with New Architecture (RN 0.81).
// UPI detection is disabled; all functions degrade gracefully to empty results.
const SmsAndroid = null;
const SmsListener = null;

const SEEN_KEY = 'upi_seen_sms_ids';

// ─── Safety: only parse SMS from known bank senders ───────────────────────────
// Prevents random promotional SMS from being misread as transactions
const BANK_SENDER_RE = /^(?:(?:AD|VM|JK|MH|TS|AP|KL|TN|KA|GJ|MH|DL|UP)-)?(?:HDFCBK|SBIINB|ICICIB|AXISBK|KOTAKB|YESBK|PNBSMS|BOIIND|CANBNK|UNIONB|IDBIBK|RBLBNK|INDBNK|FEDBNK|SCBANK|CSBBNK|KVBANK|DCBBNK|BARODM|CENTBK|MAHABK|SYNDBK|UBIBOI|ALLBNK|CANBK|OBCINB|PSBSMS|IDBIBNK|BANDHAN)/i;

// ─── Amount regex — two patterns, most specific first ────────────────────────
const AMOUNT_RE = [
  /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
  /([\d,]+(?:\.\d{1,2})?)\s*(?:Rs\.?|INR|₹)/i,
];

// ─── Both must match for a message to be classified as a UPI debit ───────────
// DEBIT_RE: confirms money left the account (not credit/OTP/balance alerts)
const DEBIT_RE = /\b(?:debit(?:ed)?|debited\s+by|debited\s+for|paid|sent(?:\s+successfully)?|payment\s+(?:made|sent|successful)|transferred\s+(?:from|to)|transfer\s+of)\b/i;

// UPI_RE: confirms it's a UPI transaction (not NEFT/ATM/card swipe)
const UPI_RE = /\bUPI\b|UPI[\/\s-]|@(?:ybl|oksbi|okhdfcbank|okaxis|okicici|paytm|apl|jiomoney|fbl|axisbank|hdfcbank|icici|kotak|rbl|idfcbank|indus|npci|upi|sbi|aubank|cmsidfc|ratnkar|abfspay)/i;

// ─── Explicit credit / reversal guard — skip these even if debit word present ─
const CREDIT_RE = /\b(?:credit(?:ed)?|received|reversed|refund(?:ed)?|cashback|reward)\b/i;

// ─── VPA extraction ───────────────────────────────────────────────────────────
const VPA_RE = /([\w.\-]+@(?:ybl|oksbi|okhdfcbank|okaxis|okicici|paytm|apl|jiomoney|fbl|axisbank|hdfcbank|icici|kotak|rbl|idfcbank|indus|npci|upi|sbi|aubank|cmsidfc|ratnkar|abfspay))/i;

// ─── Auto-categorize ──────────────────────────────────────────────────────────
const CATEGORY_RULES = [
  { cat: 'Food',          re: /swiggy|zomato|foodpanda|dunzo|blinkit|zepto|dominos|pizza|kfc|mcdonalds|burger|starbucks|cafe|restaurant|eat|food|magicpin/i },
  { cat: 'Shopping',      re: /amazon|flipkart|myntra|meesho|ajio|nykaa|snapdeal|tatacliq|shop|store|retail/i },
  { cat: 'Travel',        re: /ola|uber|rapido|yulu|bounce|metro|irctc|flight|redbus|makemytrip|goibibo|cleartrip|cab|taxi|train|bus/i },
  { cat: 'Entertainment', re: /netflix|spotify|hotstar|prime|youtube|disney|zee5|sonyliv|bookmyshow|pvr|inox|gaana/i },
  { cat: 'Bills',         re: /electricity|water|gas|bsnl|airtel|jio|vodafone|vi|recharge|bill|postpaid|prepaid|broadband|dth/i },
  { cat: 'Health',        re: /apollo|practo|1mg|pharmeasy|medplus|hospital|clinic|doctor|medicine|pharmacy|netmeds|tata1mg/i },
  { cat: 'Rent',          re: /rent|maintenance|society|housing|pg\b|hostel/i },
  { cat: 'Groceries',     re: /grocer|bigbasket|jiomart|dmart|reliance.{0,6}fresh|nature.{0,6}basket|licious|milk|dairy/i },
  { cat: 'Education',     re: /byju|unacademy|coursera|udemy|school|college|tuition|exam|fee|vedantu/i },
];

function categorize(vpa, body) {
  const text = `${vpa || ''} ${body}`.toLowerCase();
  for (const { cat, re } of CATEGORY_RULES) if (re.test(text)) return cat;
  return 'Other';
}

function extractMerchant(vpa, body) {
  if (vpa) {
    const prefix = vpa.split('@')[0];
    // Skip raw phone numbers used as VPA IDs (e.g. 917012345678@ybl)
    if (!/^\d{7,}$/.test(prefix)) {
      return prefix.replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim().slice(0, 32);
    }
  }
  // Fallback: extract "to <Name>" pattern
  const m = body.match(/(?:(?:paid|sent|credited)\s+to|to\s+VPA)\s+([A-Za-z0-9 &'.]{2,32})(?:\s+(?:on|via|ref|Ref)|\.|,|$)/i);
  if (m) return m[1].trim();
  return 'UPI Payment';
}

// ─── Core parser (exported for unit-testing) ──────────────────────────────────
export function parseUPISMS(body, sender = '') {
  // 1. Only process known bank senders (safety gate)
  if (sender && !BANK_SENDER_RE.test(sender)) return null;

  // 2. Must be a debit, not a credit or refund
  if (!DEBIT_RE.test(body))  return null;
  if (CREDIT_RE.test(body))  return null;

  // 3. Must mention UPI
  if (!UPI_RE.test(body))    return null;

  // 4. Extract amount
  let amount = null;
  for (const re of AMOUNT_RE) {
    const m = body.match(re);
    if (m) {
      amount = parseFloat(m[1].replace(/,/g, ''));
      break;
    }
  }
  // Reject zero, negative, or suspiciously large amounts (> 10L — likely OTP mismatch)
  if (!amount || amount <= 0 || amount > 1_000_000) return null;

  // 5. Extract VPA and merchant
  const vpaMatch = body.match(VPA_RE);
  const vpa = vpaMatch ? vpaMatch[1].toLowerCase() : null;
  const merchant = extractMerchant(vpa, body);
  const category = categorize(vpa, body);

  // rawBody is intentionally NOT returned — never stored, privacy-safe
  return { amount, merchant, vpa, category };
}

// ─── Permission helpers ───────────────────────────────────────────────────────
export async function requestSMSPermission() {
  if (Platform.OS !== 'android') return false;
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      {
        title: 'Auto-detect UPI Payments',
        message:
          'Thunder Wallet reads bank SMS to auto-log UPI expenses. ' +
          'Your SMS is processed on-device only — nothing is sent to any server.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not Now',
      }
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch { return false; }
}

export async function hasSMSPermission() {
  if (Platform.OS !== 'android') return false;
  try {
    return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
  } catch { return false; }
}

// ─── Main fetch — reads last 48h inbox, returns only new UPI debits ───────────
export async function fetchNewUPITransactions() {
  if (!SmsAndroid) return { available: false, transactions: [] };

  const granted = await hasSMSPermission();
  if (!granted) return { available: true, permissionNeeded: true, transactions: [] };

  // Load already-seen SMS IDs to avoid duplicates
  let seen = new Set();
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    if (raw) seen = new Set(JSON.parse(raw));
  } catch {}

  const since = Date.now() - 48 * 60 * 60 * 1000;

  return new Promise((resolve) => {
    try {
      SmsAndroid.list(
        JSON.stringify({ box: 'inbox', maxCount: 100, minDate: since }),
        () => resolve({ available: true, transactions: [] }),
        (_count, smsList) => {
          try {
            const msgs = JSON.parse(smsList);
            const results = [];

            for (const msg of msgs) {
              const id = String(msg._id || '');
              if (!id || seen.has(id)) continue;

              const sender = (msg.address || '').replace(/[^A-Za-z0-9]/g, '');
              const parsed = parseUPISMS(msg.body || '', sender);
              if (!parsed) continue;

              const ts = parseInt(msg.date, 10);
              results.push({
                ...parsed,
                smsId: id,
                // Use SMS timestamp if valid, else now
                date: Number.isFinite(ts) && ts > 0
                  ? new Date(ts).toISOString()
                  : new Date().toISOString(),
              });
              // rawBody is never added — raw SMS content stays in memory only
            }

            resolve({ available: true, transactions: results });
          } catch {
            resolve({ available: true, transactions: [] });
          }
        }
      );
    } catch {
      resolve({ available: true, transactions: [] });
    }
  });
}

// ─── Mark SMS IDs as processed so they never re-appear ───────────────────────
export async function markSMSSeen(smsIds) {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    const seen = new Set(raw ? JSON.parse(raw) : []);
    for (const id of smsIds) seen.add(String(id));
    // Cap at 1000 IDs — prune oldest first
    const trimmed = [...seen].slice(-1000);
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(trimmed));
  } catch {}
}

export const isSMSAvailable = () => !!SmsAndroid;

// ─── Real-time SMS listener ───────────────────────────────────────────────────
// Fires callback the moment a bank SMS arrives while the app is open.
// Returns an unsubscribe function — call it in useEffect cleanup.
export function startUPIListener(onDetected) {
  if (!SmsListener) return () => {};

  const subscription = SmsListener.addListener((message) => {
    try {
      const sender = (message.originatingAddress || '').replace(/[^A-Za-z0-9]/g, '');
      const body   = message.body || '';
      const parsed = parseUPISMS(body, sender);
      if (!parsed) return;

      const smsId = String(message.timestamp || Date.now());
      onDetected({
        ...parsed,
        smsId,
        date: new Date().toISOString(),
      });
    } catch {}
  });

  // react-native-android-sms-listener returns { remove } or is itself removable
  return () => {
    try {
      if (subscription && typeof subscription.remove === 'function') {
        subscription.remove();
      }
    } catch {}
  };
}
