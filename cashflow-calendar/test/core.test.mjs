import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeInitialData, validateData, validDate, balanceOn, accountBalanceOn,
  monthBalances, summaryForMonth, getMonthDates, shiftMonth, compactSigned,
} from '../src/core.mjs';
function fixture() {
  return validateData({
    version:2,
    accounts:[
      {id:'me',name:'オレ',openingDate:'2026-11-01',openingBalance:100000},
      {id:'miku',name:'ミク',openingDate:'2026-11-05',openingBalance:30000},
      {id:'joint',name:'家族口座',openingDate:'2026-11-01',openingBalance:30000},
    ],
    entries:[
      {id:'x',date:'2026-11-03',accountId:'me',name:'カード',sign:'-',amount:120000},
      {id:'y',date:'2026-11-04',accountId:'me',name:'給料',sign:'+',amount:150000},
      {id:'z',date:'2026-11-06',accountId:'joint',name:'式場代',sign:'-',amount:90000},
      {id:'p',date:'2026-11-05',accountId:'miku',name:'給与',sign:'+',amount:30000},
    ],
  });
}
test('日付：うるう年と形式を厳密に検証', () => {
  assert.equal(validDate('2028-02-29'),true);
  for (const d of ['2027-02-29','2026-04-31','2026-13-01','2026-1-01','2026-11-1']) assert.equal(validDate(d),false);
});
test('3ユーザーを作成できる',()=>{const d=makeInitialData('2026-11-07');assert.deepEqual(d.accounts.map(a=>a.name),['オレ','ミク','家族口座']);});
test('基準日より前の残高は未確定',()=>assert.equal(balanceOn(fixture(),'2026-11-04'),null));
test('当日の予定を含め日付順に反映',()=>{
  const d=fixture();
  assert.equal(accountBalanceOn(d,'me','2026-11-01'),100000);
  assert.equal(accountBalanceOn(d,'me','2026-11-03'),-20000);
  assert.equal(accountBalanceOn(d,'me','2026-11-04'),130000);
});
test('3ユーザー合計と口座別の内訳',()=>{
  const d=fixture();
  assert.equal(balanceOn(d,'2026-11-05'),220000);
  assert.equal(balanceOn(d,'2026-11-06'),130000);
  assert.equal(balanceOn(d,'2026-11-06','joint'),-60000);
});
test('不足が解消される日は緑に戻る',()=>{
  const d=fixture();
  const rows=monthBalances(d,'2026-11','me');
  assert.equal(rows[2].shortage,true);
  assert.equal(rows[2].missing,20000);
  assert.equal(rows[3].shortage,false);
  assert.equal(rows[3].balance,130000);
});
test('全体の不足開始日と最大不足額',()=>{
  const d=fixture();
  const s=summaryForMonth(d,'2026-11','joint');
  assert.equal(s.firstShortage.date,'2026-11-06');
  assert.equal(s.worstShortage,60000);
});
test('2028年2月は29日、月移動は年越し',()=>{
  assert.equal(getMonthDates('2028-02').length,29);
  assert.equal(shiftMonth('2026-12',1),'2027-01');
  assert.equal(shiftMonth('2027-01',-1),'2026-12');
});
test('残高0円は不足ではない',()=>{
  const d=fixture(); d.accounts[0].openingBalance=0;
  assert.equal(accountBalanceOn(d,'me','2026-11-01'),0);
  assert.equal(monthBalances(d,'2026-11','me')[0].shortage,false);
});
test('名前重複や異常額を拒否',()=>{
  const d=fixture(); d.accounts[1].name='オレ'; assert.throws(()=>validateData(d),/重複/);
  const d2=fixture(); d2.entries[0].amount=-200; assert.throws(()=>validateData(d2),/金額/);
});
test('ユーザー削除後に所属不明の予定があると拒否',()=>{
  const d=fixture(); d.accounts.pop(); assert.throws(()=>validateData(d),/ユーザー/);
});
test('小さなセルは短縮表示、厳密な値は別関数で保持',()=>{
  assert.equal(compactSigned(-12345),'−1.2万');
  assert.equal(compactSigned(1234),'＋1,234');
  assert.equal(compactSigned(null),'—');
});
test('別の日の同額の予定は正常に計算',()=>{
  const d=fixture(); d.entries.push({id:'extra',date:'2026-11-07',accountId:'joint',name:'式場代',sign:'-',amount:90000});
  assert.equal(accountBalanceOn(d,'joint','2026-11-07'),-150000);
});