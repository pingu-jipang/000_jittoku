import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEmptyData,validateData,validateEntry,ensureNoDuplicate,monthEntries,monthlyFlow,closingBalance,snapshot,yearSnapshots,firstShortage,shiftMonth} from '../src/core.mjs';
const tx=(id,person,month,name,sign,amount,recurrence='once',endMonth=null)=>({id,person,month,name,sign,amount,recurrence,endMonth});

test('初期状態に期首残高・登録がない',()=>{
  const d=makeEmptyData();assert.deepEqual(d.opening,[null,null]);assert.equal(d.entries.length,0);
  const s=snapshot(d,'2027-01','all');assert.equal(s.closing,null);assert.equal(s.net,0);
});
test('月次収支と期首繰越（開始月以前の取引は含めない）',()=>{
  const d=makeEmptyData();d.opening=[{month:'2027-01',amount:500_000},{month:'2027-01',amount:200_000}];
  d.entries=[tx('a',0,'2026-12','過去','-',90_000),tx('b',0,'2027-01','給与','+',300_000),tx('c',0,'2027-01','式場代','-',200_000),tx('d',1,'2027-01','給与','+',250_000)];
  assert.equal(snapshot(d,'2027-01',0).openingBalance,500_000);
  assert.equal(snapshot(d,'2027-01',0).closing,600_000);
  assert.equal(snapshot(d,'2027-01',1).closing,450_000);
  assert.equal(snapshot(d,'2027-01','all').closing,1_050_000);
  assert.equal(snapshot(d,'2027-01','all').net,350_000);
});
test('毎月の繰り返しが開始〜終了月にのみ反映される／複数年',()=>{
  const d=makeEmptyData();d.opening=[{month:'2026-11',amount:100_000},null];
  d.entries=[tx('sal',0,'2026-11','給与','+',300_000,'monthly','2027-12')];
  assert.equal(monthlyFlow(d.entries,'2026-10',0).income,0);
  assert.equal(monthlyFlow(d.entries,'2026-11',0).income,300_000);
  assert.equal(monthlyFlow(d.entries,'2027-12',0).income,300_000);
  assert.equal(monthlyFlow(d.entries,'2028-01',0).income,0);
  assert.equal(closingBalance(d,'2027-12',0),4_300_000);
  assert.equal(closingBalance(d,'2028-01',0),4_300_000);
  assert.equal(monthEntries(d.entries,'2027-01',0).length,1);
});
test('片方のみ期首設定→合計残高未確定、収支は計算できる',()=>{
  const d=makeEmptyData();d.opening=[{month:'2027-01',amount:100_000},null];
  d.entries=[tx('a',1,'2027-01','給与','+',250_000)];
  assert.equal(snapshot(d,'2027-01','all').income,250_000);
  assert.equal(snapshot(d,'2027-01','all').closing,null);
  assert.equal(snapshot(d,'2027-01',0).closing,100_000);
  assert.equal(snapshot(d,'2027-01',1).closing,null);
});
test('期首年月より前は不明、月初/月末が正しくつながる',()=>{
  const d=makeEmptyData();d.opening=[{month:'2027-03',amount:30_000},null];
  d.entries=[tx('x',0,'2027-03','支払','-',10_000,'monthly','2027-05')];
  assert.equal(snapshot(d,'2027-02',0).closing,null);
  assert.equal(snapshot(d,'2027-04',0).openingBalance,20_000);
  assert.equal(snapshot(d,'2027-04',0).closing,10_000);
  assert.equal(snapshot(d,'2027-05',0).closing,0);
});
test('途中で赤字になり、翌月復帰しても赤字月を検知',()=>{
  const d=makeEmptyData();d.opening=[{month:'2027-01',amount:50_000},null];
  d.entries=[tx('x',0,'2027-02','申込金','-',90_000),tx('y',0,'2027-03','賞与','+',100_000)];
  assert.equal(snapshot(d,'2027-02',0).closing,-40_000);
  assert.equal(snapshot(d,'2027-02',0).shortage,true);
  assert.equal(snapshot(d,'2027-03',0).closing,60_000);
  assert.equal(firstShortage(d,'2027-01','2027-12',0).month,'2027-02');
  assert.equal(yearSnapshots(d,2027,0).length,12);
});
test('既存IDの編集は許容、同内容の二重登録は防止',()=>{
  const d=makeEmptyData();const a=tx('a',0,'2027-01','給与','+',100_000);
  d.entries=[a];ensureNoDuplicate(d.entries,a,'a');
  assert.throws(()=>ensureNoDuplicate(d.entries,{...a,id:'b'}),/同じ内容/);
  const updated=tx('a',0,'2027-01','給与','+',120_000);
  d.entries=d.entries.map(e=>e.id==='a'?updated:e);
  assert.equal(monthlyFlow(d.entries,'2027-01',0).income,120_000);
  d.entries=d.entries.filter(e=>e.id!=='a');
  assert.equal(monthlyFlow(d.entries,'2027-01',0).income,0);
});
test('終了月＜開始月・不正金額・不正対象者・重複ID拒否',()=>{
  assert.throws(()=>validateEntry(tx('a',0,'2027-02','家賃','-',10000,'monthly','2027-01')),/終了年月/);
  assert.throws(()=>validateEntry(tx('a',0,'2027-02','家賃','-',-1)),/金額/);
  assert.throws(()=>validateEntry(tx('a',2,'2027-02','家賃','-',1)),/対象者/);
  const d=makeEmptyData();d.entries=[tx('x',0,'2027-01','A','+',1),tx('x',0,'2027-02','B','+',1)];
  assert.throws(()=>validateData(d),/同じID/);
  assert.equal(shiftMonth('2026-12',1),'2027-01');
});