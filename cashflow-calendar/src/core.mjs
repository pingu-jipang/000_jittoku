/** ジットク・資金繰りカレンダー／純粋な計算と検証。依存ライブラリなし。 */
export const STORE_KEY = 'jittoku.cashflow.v1';
export const MAX_ENTRIES = 2000;
export const MAX_AMOUNT = 100_000_000_000; // 1,000億円／入力ミスを抑制
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function validMonth(value) {
  const match = typeof value === 'string' ? value.match(MONTH_RE) : null;
  return !!match && Number(match[1]) >= 1900 && Number(match[1]) <= 2200;
}
export function monthNumber(value) {
  if (!validMonth(value)) throw new Error('年月はYYYY-MM形式で入力してください。');
  const [year, month] = value.split('-').map(Number);
  return year * 12 + month - 1;
}
export function monthFromNumber(value) {
  const year = Math.floor(value / 12), month = value % 12 + 1;
  if (year < 1900 || year > 2200) throw new Error('対応する年月の範囲外です。');
  return `${year}-${String(month).padStart(2,'0')}`;
}
export function shiftMonth(value, diff) { return monthFromNumber(monthNumber(value) + diff); }
export const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}`;
};
export const makeEmptyData = () => ({
  version: 1,
  people: ['オレ','ミク'],
  opening: [null,null],
  entries: []
});

function check(condition, message) { if (!condition) throw new Error(message); }
export function validateEntry(raw) {
  check(raw && typeof raw === 'object', '登録内容が不正です。');
  check(raw.person === 0 || raw.person === 1, '対象者を選択してください。');
  check(validMonth(raw.month), '開始年月が不正です。');
  const name = String(raw.name ?? '').trim();
  check(name.length > 0 && name.length <= 100, '名称は1〜100文字で入力してください。');
  check(raw.sign === '+' || raw.sign === '-', '入出金区分を選択してください。');
  const amount = raw.amount;
  check(Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_AMOUNT, `金額は1〜${MAX_AMOUNT.toLocaleString('ja-JP')}円で入力してください。`);
  check(raw.recurrence === 'once' || raw.recurrence === 'monthly', '繰り返し区分が不正です。');
  const endMonth = raw.recurrence === 'monthly' ? raw.endMonth : null;
  if (raw.recurrence === 'monthly') {
    check(validMonth(endMonth), '毎月の終了年月が不正です。');
    const span = monthNumber(endMonth) - monthNumber(raw.month);
    check(span >= 0, '終了年月は開始年月以降にしてください。');
    check(span <= 600, '繰り返し期間は50年以内にしてください。');
  }
  const id = String(raw.id || '').trim();
  check(id.length > 0 && id.length <= 100, 'IDが不正です。');
  return {id, person: raw.person, month: raw.month, name, sign: raw.sign, amount, recurrence: raw.recurrence, endMonth};
}
export function validateData(raw) {
  check(raw && typeof raw === 'object' && raw.version === 1, '保存データのバージョンが不明です。');
  check(Array.isArray(raw.people) && raw.people.length === 2, '対象者の設定が不正です。');
  const people = raw.people.map(s => String(s || '').trim());
  check(people.every(s => s.length > 0 && s.length <= 30) && people[0] !== people[1], '対象者名はそれぞれ1〜30文字で、異なる名前にしてください。');
  check(Array.isArray(raw.opening) && raw.opening.length === 2, '期首残高の設定が不正です。');
  const opening = raw.opening.map(item => {
    if (item == null) return null;
    check(validMonth(item.month), '期首年月が不正です。');
    check(Number.isSafeInteger(item.amount) && item.amount >= 0 && item.amount <= MAX_AMOUNT, '期首残高は0円以上の整数にしてください。');
    return {month:item.month, amount:item.amount};
  });
  check(Array.isArray(raw.entries) && raw.entries.length <= MAX_ENTRIES, '登録件数が上限を超えています。');
  const entries = raw.entries.map(validateEntry);
  check(new Set(entries.map(e => e.id)).size === entries.length, '同じIDの登録があります。');
  check(new Set(entries.map(entrySignature)).size === entries.length, '同じ入出金が重複しています。');
  return {version:1, people, opening, entries};
}
export function entrySignature(entry) {
  return [entry.person,entry.month,entry.name.trim(),entry.sign,entry.amount,entry.recurrence,entry.endMonth || ''].join('\u0001');
}
export function ensureNoDuplicate(entries, entry, excludeId = null) {
  check(!entries.some(e => e.id !== excludeId && entrySignature(e) === entrySignature(entry)), '同じ内容の入出金がすでに登録されています。');
}
export function containsMonth(entry, month) {
  return entry.month <= month && (entry.recurrence === 'monthly' ? entry.endMonth >= month : entry.month === month);
}
export function monthEntries(entries, month, person = 'all') {
  return entries.filter(e => (person === 'all' || e.person === person) && containsMonth(e, month));
}
function safeAdd(a,b) {
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) throw new Error('計算結果が大きすぎます。入力金額をご確認ください。');
  return sum;
}
export function monthlyFlow(entries, month, person = 'all') {
  if (!validMonth(month)) throw new Error('表示年月が不正です。');
  let income = 0, expense = 0;
  for (const e of entries) {
    if ((person === 'all' || e.person === person) && containsMonth(e,month)) {
      if (e.sign === '+') income = safeAdd(income,e.amount);
      else expense = safeAdd(expense,e.amount);
    }
  }
  return {income, expense, net: safeAdd(income,-expense)};
}
function occurrenceCount(entry, fromMonth, toMonth) {
  const left = Math.max(monthNumber(entry.month), monthNumber(fromMonth));
  const right = Math.min(monthNumber(entry.recurrence === 'monthly' ? entry.endMonth : entry.month), monthNumber(toMonth));
  return Math.max(0, right - left + 1);
}
export function closingBalance(data, month, person) {
  check(person === 0 || person === 1, '対象者が不正です。');
  const opening = data.opening[person];
  if (!opening || month < opening.month) return null;
  let total = opening.amount;
  for (const e of data.entries) {
    if (e.person !== person) continue;
    const count = occurrenceCount(e,opening.month,month);
    if (count) total = safeAdd(total,(e.sign === '+' ? 1 : -1) * e.amount * count);
  }
  return total;
}
export function snapshot(data,month,person = 'all') {
  const flow = monthlyFlow(data.entries,month,person);
  let openingBalance, closing;
  if (person === 'all') {
    const a = closingBalance(data,month,0), b = closingBalance(data,month,1);
    closing = a === null || b === null ? null : safeAdd(a,b);
  } else {
    closing = closingBalance(data,month,person);
  }
  openingBalance = closing === null ? null : safeAdd(closing,-flow.net);
  return {month,...flow,openingBalance,closing,shortage:closing !== null && closing < 0};
}
export function yearSnapshots(data,year,person = 'all') {
  check(Number.isInteger(year) && year >= 1900 && year <= 2200,'表示年が範囲外です。');
  return Array.from({length:12},(_,i)=>snapshot(data,`${year}-${String(i+1).padStart(2,'0')}`,person));
}
export function firstShortage(data,fromMonth,throughMonth,person = 'all') {
  const first = monthNumber(fromMonth),last = monthNumber(throughMonth);
  for (let m=first;m<=last;m++) {
    const row = snapshot(data,monthFromNumber(m),person);
    if (row.shortage) return row;
  }
  return null;
}
export function yen(value) { return value === null ? '未確定' : `${value.toLocaleString('ja-JP')}円`; }
export function monthLabel(value) {const [y,m]=value.split('-'); return `${Number(y)}年${Number(m)}月`; }