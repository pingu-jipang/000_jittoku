import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEmptyData} from '../src/core.mjs';
import {exportCsv,importCsv,parseCsv,stringifyCsv} from '../src/csv.mjs';
const entry=(id,person,month,name,sign,amount,recurrence='once',endMonth=null)=>({id,person,month,name,sign,amount,recurrence,endMonth});
test('CSV往復で日本語・定期設定・期首残高・改行・引用符が欠落しない',()=>{
  const d=makeEmptyData();d.people=['亮平','ミク'];d.opening=[{month:'2026-11',amount:1_200_000},{month:'2027-01',amount:0}];
  d.entries=[entry('s-1',0,'2026-11','給与','+',300000,'monthly','2027-12'),entry('s-2',1,'2027-05','「結婚式」費用,前金\n分','-',123456)];
  const csv=exportCsv(d);
  assert.equal(csv.charCodeAt(0),0xFEFF);
  assert.ok(csv.startsWith('\uFEFF対象者,年月,名称,入出金,金額,繰り返し,終了年月,ID'));
  assert.deepEqual(importCsv(csv),d);
});
test('基本5列のCSVをそのまま読み込める',()=>{
  const csv='対象者,年月,名称,入出金,金額\r\nオレ,2027-01,給与,+,300000\r\nミク,2027-05,ご祝儀,+,1200000\r\n';
  const out=importCsv(csv);assert.equal(out.entries.length,2);
  assert.equal(out.entries[0].recurrence,'once');assert.equal(out.entries[1].amount,1200000);
  assert.deepEqual(out.opening,[null,null]);
});
test('CSV二重引用符と改行の処理',()=>{
  const rows=[['a','b'],['xx"yy','a,b\nc']];
  assert.deepEqual(parseCsv(stringifyCsv(rows)),rows);
  assert.throws(()=>parseCsv('a,b\n"x,y'),/引用符/);
});
test('同内容の重複取り込み・不正値を拒否',()=>{
  const csv='対象者,年月,名称,入出金,金額\nオレ,2027-01,給与,+,300000\nオレ,2027-01,給与,+,300000';
  assert.throws(()=>importCsv(csv),/同じ内容/);
  assert.throws(()=>importCsv('対象者,年月,名称,入出金,金額\nオレ,2027-01,給与,+,1.5'),/整数/);
});
test('先頭が式の名前をCSVに書き出す際の安全対策と復元',()=>{
  const d=makeEmptyData();d.entries=[entry('a',0,'2027-01','=1+1','+',500)];
  const csv=exportCsv(d);assert.ok(csv.includes('\u200B=1+1'));
  assert.deepEqual(importCsv(csv),d);
});