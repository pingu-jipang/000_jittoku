import {STORE_KEY,MAX_ENTRIES,MAX_AMOUNT,makeEmptyData,validateData,validateEntry,ensureNoDuplicate,monthNumber,monthFromNumber,shiftMonth,currentMonth,monthEntries,monthLabel,yearSnapshots,snapshot,yen} from './core.mjs';
import {exportCsv,importCsv} from './csv.mjs';

const $=id=>document.getElementById(id);
const jp=new Intl.NumberFormat('ja-JP');
const uid=()=>globalThis.crypto?.randomUUID?.() || `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const integerText=(input,allowZero=false)=>{
  const str=String(input??'').replace(/[\s,，]/g,'');
  if(!/^\d+$/.test(str))throw new Error('金額は円単位の整数で入力してください。');
  const n=Number(str);
  if(!Number.isSafeInteger(n)||n>MAX_AMOUNT||(!allowZero&&n===0))throw new Error(`金額は${allowZero?'0':'1'}〜${jp.format(MAX_AMOUNT)}円で入力してください。`);
  return n;
};
let data=makeEmptyData(),scope='all',focusMonth=currentMonth(),editId=null,pickedPerson=0,pickedSign='+';
let loadWarning='',saveWarning='';
let toastTimer;
try {
  const raw=localStorage.getItem(STORE_KEY);
  if(raw)data=validateData(JSON.parse(raw));
} catch(e) {loadWarning=`保存データを読み込めませんでした。既存データは上書きせず、CSVへの復旧などをご検討ください。（${e.message}）`;}

function persist(next) {
  const validated=validateData(next);
  if(loadWarning) {saveWarning='保存データが破損しているため、自動上書きを停止中です。CSVを書き出してから、ブラウザの保存データをご確認ください。';data=validated;return false;}
  data=validated;
  try {localStorage.setItem(STORE_KEY,JSON.stringify(data));saveWarning='';return true;}
  catch {saveWarning='ブラウザへの保存に失敗しました。ページを閉じると消える可能性があります。CSVで書き出してください。';return false;}
}
function showToast(message) {
  clearTimeout(toastTimer);
  const t=$('toast');t.textContent=message;t.hidden=false;
  toastTimer=setTimeout(()=>{t.hidden=true;},2900);
}
const setText=(id,text)=>{$(id).textContent=text;};
function render() {
  document.querySelectorAll('.scope').forEach(button=>{
    const active=button.dataset.scope===String(scope);
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  });
  setText('scope-person-0',data.people[0]);setText('scope-person-1',data.people[1]);
  setText('entry-person-0',data.people[0]);setText('entry-person-1',data.people[1]);
  setText('focus-month-label',monthLabel(focusMonth));
  setText('year-label',`${focusMonth.slice(0,4)}年`);
  setText('chart-year',`${focusMonth.slice(0,4)}年`);
  $('prev-month').disabled=monthNumber(focusMonth)<=monthNumber('1900-01');
  $('next-month').disabled=monthNumber(focusMonth)>=monthNumber('2200-12');
  $('prev-year').disabled=Number(focusMonth.slice(0,4))<=1900;
  $('next-year').disabled=Number(focusMonth.slice(0,4))>=2200;
  let s,year;
  try {s=snapshot(data,focusMonth,scope);year=yearSnapshots(data,Number(focusMonth.slice(0,4)),scope);}
  catch(error) {showToast(error.message);return;}
  setText('focus-opening',yen(s.openingBalance));
  setText('focus-income',`+${yen(s.income)}`);
  setText('focus-expense',`−${yen(s.expense)}`);
  setText('focus-net',`${s.net>0?'+':''}${yen(s.net)}`);
  $('focus-net').style.color=s.net<0?'var(--red)':s.net>0?'var(--green)':'';
  setText('focus-closing',yen(s.closing));
  $('focus-closing').style.fontSize='';
  $('focus-closing').style.letterSpacing='';
  $('focus-closing').style.color='';
  $('focus-closing').setAttribute('aria-label',`月末の予想残高 ${yen(s.closing)}`);
  document.querySelector('.balance-card').classList.toggle('negative',s.shortage);
  setText('focus-status',s.closing===null?'期首残高が未設定、または期首年月より前のため、現金残高は未確定です。':s.shortage?`この月末に${yen(-s.closing)}不足する見込みです。`:s.closing===0?'この月末の残高は0円になる見込みです。':'登録済みの予定を反映した月末残高です。');
  const notice=$('notice');
  const warning=loadWarning||saveWarning;
  notice.hidden=!warning;if(warning)notice.textContent=warning;
  renderEntries();renderChart(year);renderCalendar(year);
}
function renderEntries() {
  const matches=monthEntries(data.entries,focusMonth,scope);
  setText('entry-count',`${matches.length}件`);
  const list=$('entry-list');list.replaceChildren();
  if(!matches.length) {
    const p=document.createElement('p');p.className='empty';p.textContent='この月の予定はまだありません。\n「＋ 登録する」から追加できます。';p.style.whiteSpace='pre-line';list.append(p);return;
  }
  for(const e of [...matches].reverse()) {
    const button=document.createElement('button');button.type='button';button.className='entry-item';button.dataset.entryId=e.id;button.setAttribute('aria-label',`${e.name} ${yen(e.amount)} を編集`);
    const main=document.createElement('span');main.className='entry-main';
    const title=document.createElement('span');title.className='entry-title';title.textContent=e.name;
    const meta=document.createElement('span');meta.className='entry-meta';
    meta.textContent=`${data.people[e.person]} · ${e.recurrence==='monthly'?`${monthLabel(e.month)}〜${monthLabel(e.endMonth)}・毎月`:'単発'} · タップで編集`;
    main.append(title,meta);
    const amount=document.createElement('span');amount.className='entry-amount '+(e.sign==='+'?'income':'out');amount.textContent=`${e.sign==='+'?'+':'−'}${jp.format(e.amount)}円`;
    button.append(main,amount);list.append(button);
  }
}
function compactYen(n) {
  const abs=Math.abs(n);
  if(abs>=100_000_000)return `${Number((n/100_000_000).toFixed(1))}億`;
  if(abs>=10_000)return `${Number((n/10_000).toFixed(1))}万`;
  return jp.format(n);
}
function renderChart(rows) {
  const target=$('chart'),msg=$('chart-message');target.replaceChildren();
  const known=rows.map((r,i)=>({i,v:r.closing})).filter(r=>r.v!==null);
  if(known.length===0) {
    const p=document.createElement('p');p.className='empty';p.textContent='期首残高を設定すると、月末残高の推移を表示できます。';target.append(p);
    msg.textContent='';msg.className='chart-message';return;
  }
  const svgNS='http://www.w3.org/2000/svg';
  const el=(tag,attrs={},txt)=>{const n=document.createElementNS(svgNS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(txt!==undefined)n.textContent=txt;return n;};
  const w=670,h=214,left=66,right=20,top=15,bottom=37;
  const all=[0,...known.map(d=>d.v)];let min=Math.min(...all),max=Math.max(...all);
  if(min===max){min-=100;max+=100;}
  const pad=Math.max((max-min)*.09,1);min-=pad;max+=pad;
  const x=i=>left+(w-left-right)*(i/11),y=v=>top+(h-top-bottom)*(max-v)/(max-min);
  const svg=el('svg',{viewBox:`0 0 ${w} ${h}`,role:'img','aria-label':`${focusMonth.slice(0,4)}年の月末残高の推移。${known.filter(d=>d.v<0).length}か月が残高不足。`});
  for(const tick of [min,(min+max)/2,max]) {
    svg.append(el('line',{x1:left,y1:y(tick),x2:w-right,y2:y(tick)}));
    svg.append(el('text',{x:0,y:y(tick)+4},compactYen(Math.round(tick))));
  }
  if(min<0&&max>0)svg.append(el('line',{x1:left,y1:y(0),x2:w-right,y2:y(0),class:'zero'}));
  for(let i=0;i<12;i+=2)svg.append(el('text',{x:x(i),y:h-7,'text-anchor':'middle'},`${i+1}月`));
  // 未確定月は線で結ばない。既知の隣接月だけを接続。
  let path='';let prev=-2;
  for(const {i,v} of known) {path+=`${prev===i-1?'L':'M'}${x(i).toFixed(2)},${y(v).toFixed(2)} `;prev=i;}
  svg.append(el('path',{d:path,class:'path'}));
  for(const {i,v}of known)svg.append(el('circle',{cx:x(i),cy:y(v),r:v<0?5:3.3,class:v<0?'neg-point':''}));
  target.append(svg);
  const first=rows.find(r=>r.shortage);
  msg.className='chart-message'+(first?' warning':'');
  msg.textContent=first?`${monthLabel(first.month)}に月末残高が${yen(first.closing)}となる見込みです。`:'月ごとの月末残高を表示しています。';
}
function renderCalendar(rows) {
  const list=$('calendar-list');list.replaceChildren();
  for(const r of rows) {
    const button=document.createElement('button');button.type='button';button.className=`month-card${r.month===focusMonth?' current':''}${r.shortage?' shortage':''}`;button.dataset.month=r.month;
    const top=document.createElement('div');top.className='month-card-top';
    const label=document.createElement('strong');label.textContent=monthLabel(r.month);
    const flag=document.createElement('span');flag.className='shortage-flag';flag.textContent=r.shortage?'⚠ 残高不足':'';top.append(label,flag);
    const grid=document.createElement('div');grid.className='month-card-grid';
    for(const [title,value,cls] of [['入金',`+${compactYen(r.income)}円`,''],['出金',`−${compactYen(r.expense)}円`,''],['月末残高',r.closing===null?'未確定':`${compactYen(r.closing)}円`,'balance-amt']]) {
      const unit=document.createElement('div');const s=document.createElement('span');s.textContent=title;
      const b=document.createElement('b');b.className=cls;b.textContent=value;
      unit.append(s,b);grid.append(unit);
    }
    button.append(top,grid);button.setAttribute('aria-label',`${monthLabel(r.month)}の内訳を見る。月末残高 ${yen(r.closing)}`);list.append(button);
  }
}
function setSelectedPerson(person) {
  pickedPerson=person;
  document.querySelectorAll('[data-person]').forEach(btn=>btn.classList.toggle('selected',Number(btn.dataset.person)===person));
}
function setSelectedSign(sign) {
  pickedSign=sign;
  document.querySelectorAll('[data-sign]').forEach(btn=>btn.classList.toggle('selected',btn.dataset.sign===sign));
}
function dialogOpen(dialog) {if(!dialog.open)dialog.showModal();}
function showError(id,error){const box=$(id);box.textContent=error;box.hidden=false;}
function resetError(id){$(id).hidden=true;$(id).textContent='';}
function openEntry(id=null) {
  const entry=id?data.entries.find(e=>e.id===id):null;
  if(id&&!entry)return;
  editId=entry?.id??null;
  $('entry-form').reset();resetError('entry-error');
  setText('entry-dialog-title',entry?'予定を編集':'予定を追加');
  $('entry-delete').hidden=!entry;
  $('entry-form').querySelector('button[type=submit]').textContent=entry?'変更を保存':'登録する';
  setSelectedPerson(entry?.person??(scope==='all'?0:scope));
  setSelectedSign(entry?.sign??'+');
  $('entry-amount').value=entry?String(entry.amount):'';
  $('entry-name').value=entry?.name??'';
  $('entry-month').value=entry?.month??focusMonth;
  $('entry-repeat').checked=entry?.recurrence==='monthly';
  $('entry-end').value=entry?.endMonth??shiftMonth(entry?.month??focusMonth,Math.min(12,monthNumber('2200-12')-monthNumber(entry?.month??focusMonth)));
  $('repeat-end-field').hidden=!$('entry-repeat').checked;
  dialogOpen($('entry-dialog'));
}
function openSettings() {
  resetError('settings-error');
  for(let i=0;i<2;i++) {
    $(`setting-name-${i}`).value=data.people[i];
    setText(`setting-person-title-${i}`,data.people[i]);
    $(`setting-month-${i}`).value=data.opening[i]?.month??'';
    $(`setting-amount-${i}`).value=data.opening[i]?.amount===undefined?'':String(data.opening[i].amount);
  }
  dialogOpen($('settings-dialog'));
}

$('entry-form').addEventListener('submit',e=>{
  e.preventDefault();resetError('entry-error');
  try {
    const entry=validateEntry({id:editId||uid(),person:pickedPerson,sign:pickedSign,amount:integerText($('entry-amount').value),name:$('entry-name').value,
      month:$('entry-month').value,recurrence:$('entry-repeat').checked?'monthly':'once',endMonth:$('entry-repeat').checked?$('entry-end').value:null});
    ensureNoDuplicate(data.entries,entry,editId);
    const entries=editId?data.entries.map(item=>item.id===editId?entry:item):[...data.entries,entry];
    if(entries.length>MAX_ENTRIES)throw new Error(`登録できる予定は最大${MAX_ENTRIES}件です。`);
    const saved=persist({...data,entries});
    if(!editId || !(entry.month<=focusMonth && (entry.recurrence==='monthly'?focusMonth<=entry.endMonth:focusMonth===entry.month))) focusMonth=entry.month;
    $('entry-dialog').close();render();showToast(saved?'予定を保存しました':'予定を更新しました（保存に注意）');
  }catch(error){showError('entry-error',error.message);}
});
$('entry-delete').addEventListener('click',()=>{
  const entry=data.entries.find(e=>e.id===editId);
  if(!entry||!confirm(`「${entry.name}」を削除しますか？\n毎月の予定の場合は、対象期間すべてから削除されます。`))return;
  const saved=persist({...data,entries:data.entries.filter(e=>e.id!==editId)});
  $('entry-dialog').close();render();showToast(saved?'予定を削除しました':'削除しました（保存に注意）');
});
$('settings-form').addEventListener('submit',e=>{
  e.preventDefault();resetError('settings-error');
  try {
    const people=[0,1].map(i=>$(`setting-name-${i}`).value.trim());
    const opening=[0,1].map(i=>{
      const month=$(`setting-month-${i}`).value.trim();
      const amount=$(`setting-amount-${i}`).value.trim();
      if(!month&&!amount)return null;
      if(!month||!amount)throw new Error(`${people[i]||`対象者${i+1}`}：期首年月と残高の両方を入力してください。`);
      return {month,amount:integerText(amount,true)};
    });
    const saved=persist({...data,people,opening});
    $('settings-dialog').close();render();showToast(saved?'設定を保存しました':'設定を更新しました（保存に注意）');
  }catch(error){showError('settings-error',error.message);}
});
$('entry-repeat').addEventListener('change',e=>{$('repeat-end-field').hidden=!e.target.checked;});
document.querySelectorAll('[data-person]').forEach(b=>b.addEventListener('click',()=>setSelectedPerson(Number(b.dataset.person))));
document.querySelectorAll('[data-sign]').forEach(b=>b.addEventListener('click',()=>setSelectedSign(b.dataset.sign)));
document.querySelectorAll('[data-scope]').forEach(b=>b.addEventListener('click',()=>{scope=b.dataset.scope==='all'?'all':Number(b.dataset.scope);render();}));
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
for(const id of ['entry-dialog','settings-dialog']) {
  const modal=$(id);
  modal.addEventListener('click',e=>{if(e.target===modal)modal.close();});
}
$('add-fab').addEventListener('click',()=>openEntry());
$('add-inline').addEventListener('click',()=>openEntry());
$('open-settings').addEventListener('click',openSettings);
$('entry-list').addEventListener('click',event=>{
  const btn=event.target.closest('[data-entry-id]');if(btn)openEntry(btn.dataset.entryId);
});
$('calendar-list').addEventListener('click',event=>{
  const btn=event.target.closest('[data-month]');if(!btn)return;
  focusMonth=btn.dataset.month;render();document.querySelector('.focus').scrollIntoView({behavior:'smooth',block:'start'});
});
function navigateMonth(shift){try{focusMonth=shiftMonth(focusMonth,shift);render();}catch{}}
$('prev-month').addEventListener('click',()=>navigateMonth(-1));
$('next-month').addEventListener('click',()=>navigateMonth(1));
$('prev-year').addEventListener('click',()=>navigateMonth(-12));
$('next-year').addEventListener('click',()=>navigateMonth(12));
$('export-btn').addEventListener('click',()=>{
  try{
    const csv=exportCsv(data);
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    const a=document.createElement('a');a.href=url;a.download=`jittoku_cashflow_${currentMonth()}.csv`;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    showToast('CSVを書き出しました');
  }catch(error){showError('settings-error',error.message);}
});
$('import-btn').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  resetError('settings-error');
  try{
    if(file.size>3_000_000)throw new Error('CSVが大きすぎます（最大3MB）。');
    const imported=importCsv(await file.text(),data);
    if(!confirm(`CSVの${imported.entries.length}件を読み込みます。\n現在のデータをすべて置き換えます。よろしいですか？`))return;
    const saved=persist(imported);$('settings-dialog').close();render();showToast(saved?'CSVを読み込みました':'CSVを読み込みました（保存に注意）');
  }catch(error){showError('settings-error',`読み込み失敗：${error.message}`);}
});
$('clear-all').addEventListener('click',()=>{
  if(!confirm('登録済みの予定・対象者名・期首残高をすべて削除しますか？\n元に戻すことはできません。先にCSVの保存をおすすめします。'))return;
  if(loadWarning) {
    try {localStorage.removeItem(STORE_KEY);loadWarning='';}catch{}
  }
  const saved=persist(makeEmptyData());
  $('settings-dialog').close();render();showToast(saved?'データを削除しました':'データを削除しました（保存に注意）');
});
render();