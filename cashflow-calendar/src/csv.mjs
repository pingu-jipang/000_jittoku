/** UTF-8 CSV。BOM付き書き出し／二重引用符・改行・日本語対応。 */
import {makeEmptyData,validateData,validateEntry,ensureNoDuplicate,MAX_ENTRIES} from './core.mjs';
const HEADERS = ['対象者','年月','名称','入出金','金額','繰り返し','終了年月','ID'];
const BASE = HEADERS.slice(0,5);
const SETTINGS_KEY = '#JITTOKU_SETTINGS_V1';

export function parseCsv(text) {
  const src = String(text).replace(/^\uFEFF/,'');
  const rows = [];
  let row=[],field='',quoted=false,postQuote=false;
  for(let i=0;i<src.length;i++) {
    const c=src[i];
    if(quoted) {
      if(c==='"') {if(src[i+1]==='"') {field+='"';i++;} else {quoted=false;postQuote=true;}}
      else field+=c;
    } else if(postQuote) {
      if(c===',') {row.push(field);field='';postQuote=false;}
      else if(c==='\r'||c==='\n') {row.push(field);rows.push(row);field='';row=[];postQuote=false;if(c==='\r'&&src[i+1]==='\n')i++;}
      else if(c!==' '&&c!=='\t') throw new Error('CSVの引用符の後に不正な文字があります。');
    } else if(c==='"') {
      if(field!=='')throw new Error('CSVの引用符の位置が不正です。');
      quoted=true;
    } else if(c===',') {row.push(field);field='';}
    else if(c==='\r'||c==='\n') {row.push(field);rows.push(row);field='';row=[];if(c==='\r'&&src[i+1]==='\n')i++;}
    else field+=c;
  }
  if(quoted)throw new Error('CSVの引用符が閉じていません。');
  if(field!==''||row.length>0||postQuote) {row.push(field);rows.push(row);}
  return rows.filter(r=>!(r.length===1&&r[0].trim()===''));
}
function cell(v) { const str=String(v??''); return /[",\r\n]/.test(str) ? '"'+str.replace(/"/g,'""')+'"' : str; }
export function stringifyCsv(rows) {return rows.map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n';}
const guarded = s=>/^[=+\-@\t\r]/.test(s) ? `\u200B${s}` : s;
const unguarded = s=>s.startsWith('\u200B') && /^[=+\-@\t\r]/.test(s.slice(1)) ? s.slice(1) : s;

export function exportCsv(data) {
  const safe = validateData(data);
  const rows=[HEADERS];
  for(const e of safe.entries) {
    rows.push([guarded(safe.people[e.person]),e.month,guarded(e.name),e.sign,e.amount,
      e.recurrence==='monthly'?'毎月':'単発',e.endMonth||'',guarded(e.id)]);
  }
  // メタデータで人名と期首残高を復元。基本5列のCSVもインポート可能。
  rows.push([SETTINGS_KEY,JSON.stringify({people:safe.people,opening:safe.opening})]);
  return '\uFEFF'+stringifyCsv(rows);
}
export function importCsv(text,defaults=makeEmptyData()) {
  const rows=parseCsv(text);
  if(!rows.length)throw new Error('CSVが空です。');
  const header=rows.shift().map(s=>s.trim());
  if(!BASE.every(h=>header.includes(h)))throw new Error('必須列（対象者・年月・名称・入出金・金額）がありません。');
  if(new Set(header).size!==header.length)throw new Error('CSVの見出しが重複しています。');
  let metadata=null;
  const body=[];
  for(const row of rows) {
    if(row[0]===SETTINGS_KEY) {
      if(metadata!==null)throw new Error('設定データが重複しています。');
      try {metadata=JSON.parse(row[1]);}catch {throw new Error('CSVの設定データが破損しています。');}
      continue;
    }
    if(row.every(s=>s.trim()===''))continue;
    body.push(row);
  }
  if(body.length>MAX_ENTRIES)throw new Error('登録件数が上限を超えています。');
  const people=metadata?.people ?? defaults.people;
  const opening=metadata?.opening ?? defaults.opening;
  const idx=h=>header.indexOf(h);
  const entries=[];
  const usedIds=new Set();
  for(const [line,row] of body.entries()) {
    const val=h=>idx(h)<0?'':(row[idx(h)]??'').trim();
    const personName=unguarded(val('対象者'));
    const person=people.indexOf(personName);
    if(person<0)throw new Error(`${line+2}行目：対象者「${personName}」が不明です。設定の対象者名をご確認ください。`);
    const recurrence=val('繰り返し')==='毎月'?'monthly':'once';
    if(val('繰り返し')&&!['毎月','単発'].includes(val('繰り返し')))throw new Error(`${line+2}行目：繰り返し区分が不正です。`);
    const value=val('金額');
    if(!/^[0-9]+$/.test(value))throw new Error(`${line+2}行目：金額は正の整数で指定してください。`);
    const id=unguarded(val('ID'))||`csv-${line+1}`;
    const entry=validateEntry({id,person,month:val('年月'),name:unguarded(val('名称')),sign:val('入出金'),amount:Number(value),recurrence,endMonth:recurrence==='monthly'?val('終了年月'):null});
    if(usedIds.has(entry.id))throw new Error(`${line+2}行目：IDが重複しています。`);
    ensureNoDuplicate(entries,entry);
    usedIds.add(entry.id);
    entries.push(entry);
  }
  return validateData({version:1,people,opening,entries});
}