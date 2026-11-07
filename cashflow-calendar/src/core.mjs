/** ジットク 資金繰りカレンダー: 日付別の残高計算。依存ライブラリ不要。 */
export const STORAGE_KEY = 'jittoku.cashflow-calendar.daily.v2';
export const MAX_ACCOUNTS = 20;
export const MAX_ENTRIES = 2000;
export const MAX_AMOUNT = 100_000_000_000;

const DAY_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const must = (condition, message) => { if (!condition) throw new Error(message); };

export function validDate(value) {
  const m = typeof value === 'string' ? DAY_RE.exec(value) : null;
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (y < 1900 || y > 2200) return false;
  return new Date(Date.UTC(y, mo, 0)).getUTCDate() >= d;
}
export function validMonth(value) {
  const m = typeof value === 'string' ? MONTH_RE.exec(value) : null;
  return !!m && Number(m[1]) >= 1900 && Number(m[1]) <= 2200;
}
export function makeInitialData(today = new Date().toLocaleDateString('sv-SE')) {
  const date = validDate(today) ? today : new Date().toISOString().slice(0, 10);
  return {
    version: 2,
    accounts: [
      { id: 'person-1', name: 'オレ', openingDate: date, openingBalance: null },
      { id: 'person-2', name: 'ミク', openingDate: date, openingBalance: null },
      { id: 'person-3', name: '家族口座', openingDate: date, openingBalance: null },
    ],
    entries: [],
  };
}
function normalizeAmount(value, label, allowNegative = false) {
  must(Number.isSafeInteger(value) && Math.abs(value) <= MAX_AMOUNT && (allowNegative || value >= 0), `${label}は${allowNegative ? '整数' : '0円以上の整数'}で入力してください。`);
  return value;
}
export function validateData(raw) {
  must(raw && typeof raw === 'object' && raw.version === 2, '保存データの形式が不正です。');
  must(Array.isArray(raw.accounts) && raw.accounts.length >= 1 && raw.accounts.length <= MAX_ACCOUNTS, 'ユーザーは1〜20件で入力してください。');
  const accounts = raw.accounts.map((account, i) => {
    must(account && typeof account === 'object', `${i + 1}番目のユーザーが不正です。`);
    const id = String(account.id ?? '').trim();
    const name = String(account.name ?? '').trim();
    must(id.length > 0 && id.length <= 100, 'ユーザーIDが不正です。');
    must(name.length >= 1 && name.length <= 30, 'ユーザー名は1〜30文字で入力してください。');
    must(validDate(account.openingDate), `${name}の残高の基準日を入力してください。`);
    must(account.openingBalance !== null && account.openingBalance !== undefined,
      `${name}の基準日時点の残高を入力してください（0円も可）。`);
    normalizeAmount(account.openingBalance, `${name}の残高`, true);
    return { id, name, openingDate: account.openingDate, openingBalance: account.openingBalance };
  });
  must(new Set(accounts.map(a => a.id)).size === accounts.length, 'ユーザーIDが重複しています。');
  must(new Set(accounts.map(a => a.name)).size === accounts.length, 'ユーザー名が重複しています。');
  must(Array.isArray(raw.entries) && raw.entries.length <= MAX_ENTRIES, '予定が多すぎます（上限2,000件）。');
  const ids = new Set(accounts.map(a => a.id));
  const entries = raw.entries.map((entry, i) => {
    must(entry && typeof entry === 'object', `${i + 1}行目の予定が不正です。`);
    const id = String(entry.id ?? '').trim();
    const name = String(entry.name ?? '').trim();
    must(id.length >= 1 && id.length <= 100, '予定IDが不正です。');
    must(validDate(entry.date), `${i + 1}行目の年月日が不正です。`);
    must(ids.has(entry.accountId), `${i + 1}行目のユーザーを選択してください。`);
    must(name.length >= 1 && name.length <= 100, `${i + 1}行目の名称を入力してください。`);
    must(entry.sign === '+' || entry.sign === '-', `${i + 1}行目の＋／−を選択してください。`);
    must(Number.isSafeInteger(entry.amount) && entry.amount > 0 && entry.amount <= MAX_AMOUNT,
      `${i + 1}行目の金額は1円以上の整数で入力してください。`);
    return {id, date: entry.date, accountId: entry.accountId, name, sign: entry.sign, amount: entry.amount};
  });
  must(new Set(entries.map(e => e.id)).size === entries.length, '予定IDが重複しています。');
  return {version: 2, accounts, entries};
}

function safeSum(a, b) {
  const n = a + b;
  must(Number.isSafeInteger(n), '計算結果が大きすぎます。入力額を見直してください。');
  return n;
}
/** 基準日の残高は「その日の入出金がまだ反映されていない額」として扱う。 */
export function accountBalanceOn(data, accountId, date) {
  must(validDate(date), '対象日が不正です。');
  const a = data.accounts.find(account => account.id === accountId);
  must(!!a, '指定したユーザーがありません。');
  if (date < a.openingDate || a.openingBalance === null) return null;
  let result = a.openingBalance;
  for (const e of data.entries) {
    if (e.accountId !== accountId || e.date < a.openingDate || e.date > date) continue;
    result = safeSum(result, e.sign === '+' ? e.amount : -e.amount);
  }
  return result;
}
/** scope='all' または account.id。ひとりでも基準日前なら全体残高は未確定。 */
export function balanceOn(data, date, scope = 'all') {
  must(validDate(date), '対象日が不正です。');
  const selected = scope === 'all' ? data.accounts : data.accounts.filter(a => a.id === scope);
  must(selected.length > 0, 'ユーザーを選択してください。');
  let total = 0;
  for (const a of selected) {
    const balance = accountBalanceOn(data, a.id, date);
    if (balance === null) return null;
    total = safeSum(total, balance);
  }
  return total;
}
export function getMonthDates(month) {
  must(validMonth(month), '対象年月はYYYY-MM形式で入力してください。');
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({length:days}, (_, i) => `${month}-${String(i+1).padStart(2,'0')}`);
}
export function monthBalances(data, month, scope = 'all') {
  return getMonthDates(month).map(date => {
    const balance = balanceOn(data, date, scope);
    return {date, balance, shortage: balance !== null && balance < 0,
      missing: balance === null ? null : Math.max(0, -balance)};
  });
}
export function summaryForMonth(data, month, scope = 'all') {
  const days = monthBalances(data, month, scope);
  const known = days.filter(x => x.balance !== null);
  const shortageDays = known.filter(x => x.shortage);
  return {
    days,
    firstShortage: shortageDays[0] ?? null,
    worstShortage: shortageDays.length ? Math.max(...shortageDays.map(x => x.missing)) : 0,
    closingBalance: known.length ? known[known.length-1].balance : null,
    knownDays: known.length,
    shortageCount: shortageDays.length,
  };
}
export function entriesOn(data, date, scope = 'all') {
  return data.entries.filter(e => e.date === date && (scope === 'all' || e.accountId === scope));
}
export function shiftMonth(month, offset) {
  must(validMonth(month) && Number.isInteger(offset), '対象年月が不正です。');
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + offset;
  const nextYear = Math.floor(total / 12), nextMonth = total % 12 + 1;
  must(nextYear >= 1900 && nextYear <= 2200, '対象年月の範囲外です。');
  return `${nextYear}-${String(nextMonth).padStart(2,'0')}`;
}
export const fullYen = value => `${Number(value).toLocaleString('ja-JP')}円`;
export function compactSigned(value) {
  if (value === null) return '—';
  const prefix = value < 0 ? '−' : '＋';
  const n = Math.abs(value);
  if (n < 10000) return `${prefix}${n.toLocaleString('ja-JP')}`;
  // カレンダーの小さなセルでは概数。日別詳細には必ず1円単位を表示する。
  if (n < 100000000) return `${prefix}${(n / 10000).toFixed(n < 100000 ? 1 : 0).replace(/\.0$/, '')}万`;
  return `${prefix}${(n / 100000000).toFixed(1).replace(/\.0$/, '')}億`;
}