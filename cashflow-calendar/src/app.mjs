import {
  STORAGE_KEY, MAX_ACCOUNTS, MAX_ENTRIES, makeInitialData, validateData,
  validDate, validMonth, summaryForMonth, accountBalanceOn, entriesOn,
  compactSigned, fullYen, shiftMonth,
} from './core.mjs';

const $ = selector => document.querySelector(selector);
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
};
const toText = v => String(v ?? '');
const escapeHtml = s => toText(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const yen = value => `${Number(value).toLocaleString('ja-JP')}円`;
const signedYen = value => value < 0 ? `−${yen(Math.abs(value))}` : `＋${yen(value)}`;
const uid = () => typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const blankEntry = (date=today(),accountId='') => ({id:uid(),date,accountId,name:'',sign:'-',amount:null});
const cleanEntries = entries => entries.filter(e => e.name.trim() || e.amount !== null);
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.version === 2 && Array.isArray(parsed.accounts) && Array.isArray(parsed.entries)) return parsed;
    }
  } catch { /* user can still enter data in memory */ }
  const initial = makeInitialData(today());
  initial.entries = [blankEntry(today(),initial.accounts[0].id)];
  return initial;
}
let data = loadData();
let confirmed = null;
let viewScope = 'all';
let viewMonth = today().slice(0,7);
let selectedDay = today();
let storageWarned = false;
function persist() {
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify(data)); }
  catch {
    if (!storageWarned) {storageWarned=true;showError('このブラウザでは自動保存できません。入力後、バックアップを書き出してください。');}
  }
}
function showError(text) { const e=$('#cc-error'); e.textContent=text; e.hidden=false; }
function clearError() { $('#cc-error').hidden=true; }
function inputEl({value='',type='text',placeholder='',ariaLabel='',inputMode='',min='',max=''}={}) {
  const input=document.createElement('input');
  input.type=type;
  input.value=value ?? '';
  if (placeholder) input.placeholder=placeholder;
  if (ariaLabel) input.setAttribute('aria-label',ariaLabel);
  if (inputMode) input.inputMode=inputMode;
  if (min!=='') input.min=min;
  if (max!=='') input.max=max;
  return input;
}
function refreshAccountLabels() {
  for (const a of data.accounts) {
    const node=document.querySelector(`[data-opening-name="${a.id}"]`);
    if (node) node.textContent=a.name.trim()||'（名前未入力）';
  }
  document.querySelectorAll('.cc-entry-account').forEach(select=>{
    const current=select.value;
    select.replaceChildren();
    for (const a of data.accounts) {
      const option=document.createElement('option');option.value=a.id;option.textContent=a.name.trim()||'（名前未入力）';select.appendChild(option);
    }
    select.value=data.accounts.some(a=>a.id===current)?current:data.accounts[0]?.id;
    const e=data.entries.find(row=>row.id===select.dataset.entry);
    if (e) e.accountId=select.value;
  });
}
function renderAccounts() {
  const root=$('#cc-accounts');root.replaceChildren();
  data.accounts.forEach((account,index)=>{
    const row=document.createElement('div'); row.className='cc-account-row';
    const input=inputEl({value:account.name,placeholder:'例：家族口座',ariaLabel:`ユーザー・口座 ${index+1}`,max:'30'});
    input.className='cc-account-input';input.maxLength=30;
    input.addEventListener('input',()=>{account.name=input.value;refreshAccountLabels();persist();});
    const remove=document.createElement('button');remove.type='button';remove.className='cc-remove';remove.textContent='×';remove.setAttribute('aria-label',`${account.name||index+1}を削除`);
    remove.disabled=data.accounts.length===1;
    remove.addEventListener('click',()=>{
      if (data.accounts.length<=1) return;
      const associated=cleanEntries(data.entries).filter(e=>e.accountId===account.id);
      if (associated.length && !window.confirm(`「${account.name}」の登録済み予定 ${associated.length} 件も削除します。よろしいですか？`)) return;
      data.accounts=data.accounts.filter(a=>a.id!==account.id);
      data.entries=data.entries.filter(e=>e.accountId!==account.id);
      if (!data.entries.length) data.entries=[blankEntry(today(),data.accounts[0].id)];
      renderInputLists();persist();
    });
    row.append(input,remove);root.append(row);
  });
  $('#cc-add-account').disabled=data.accounts.length>=MAX_ACCOUNTS;
}
function renderOpening() {
  const root=$('#cc-opening');root.replaceChildren();
  for (const a of data.accounts) {
    const row=document.createElement('div');row.className='cc-opening-row';
    const name=document.createElement('strong');name.className='cc-opening-name';name.dataset.openingName=a.id;name.textContent=a.name||'（名前未入力）';
    const dateLabel=document.createElement('label');dateLabel.innerHTML='<span>残高の基準日</span>';
    const dateInput=inputEl({type:'date',value:a.openingDate,ariaLabel:`${a.name}の残高基準日`});
    dateInput.addEventListener('change',()=>{a.openingDate=dateInput.value;persist();});dateLabel.append(dateInput);
    const moneyLabel=document.createElement('label');moneyLabel.innerHTML='<span>残高（円）</span>';
    const amountInput=inputEl({type:'number',value:a.openingBalance??'',placeholder:'例：200000',inputMode:'numeric',ariaLabel:`${a.name}の残高`});
    amountInput.step='1';
    amountInput.addEventListener('input',()=>{a.openingBalance=amountInput.value===''?null:Number(amountInput.value);persist();});
    moneyLabel.append(amountInput);row.append(name,dateLabel,moneyLabel);root.append(row);
  }
}
function addField(label, control, cls='') {
  const wrap=document.createElement('label');wrap.className=`cc-entry-field ${cls}`;
  const name=document.createElement('span');name.textContent=label;wrap.append(name,control);return wrap;
}
function renderEntries() {
  const root=$('#cc-entries');root.replaceChildren();
  if (!data.entries.length) data.entries.push(blankEntry(today(),data.accounts[0].id));
  data.entries.forEach((entry,index)=>{
    const row=document.createElement('div');row.className='cc-entry-row';
    const date=inputEl({type:'date',value:entry.date,ariaLabel:`${index+1}行目の年月日`});
    date.addEventListener('change',()=>{entry.date=date.value;persist();});
    const user=document.createElement('select');user.className='cc-entry-account';user.dataset.entry=entry.id;
    for(const a of data.accounts) {const option=document.createElement('option');option.value=a.id;option.textContent=a.name||'（名前未入力）';user.append(option);}
    if (data.accounts.some(a=>a.id===entry.accountId)) user.value=entry.accountId;
    else { entry.accountId=data.accounts[0].id;user.value=entry.accountId; }
    user.setAttribute('aria-label',`${index+1}行目のユーザー・口座`);
    user.addEventListener('change',()=>{entry.accountId=user.value;persist();});
    const name=inputEl({value:entry.name,placeholder:'例：式場代',ariaLabel:`${index+1}行目の名称`});name.maxLength=100;
    name.addEventListener('input',()=>{entry.name=name.value;persist();});
    const sign=document.createElement('select');sign.setAttribute('aria-label',`${index+1}行目のプラス・マイナス`);
    [['+','＋ 入金'],['-','− 出金']].forEach(([val,label])=>{const option=document.createElement('option');option.value=val;option.textContent=label;sign.append(option);});
    sign.value=entry.sign;sign.addEventListener('change',()=>{entry.sign=sign.value;persist();});
    const amount=inputEl({type:'number',value:entry.amount??'',placeholder:'例：30000',inputMode:'numeric',ariaLabel:`${index+1}行目の金額`});
    amount.step='1';amount.min='1';amount.addEventListener('input',()=>{entry.amount=amount.value===''?null:Number(amount.value);persist();});
    const remove=document.createElement('button');remove.type='button';remove.className='cc-entry-remove';remove.textContent='× この予定を削除';
    remove.addEventListener('click',()=>{
      data.entries=data.entries.filter(e=>e.id!==entry.id);
      if (!data.entries.length) data.entries=[blankEntry(today(),data.accounts[0].id)];
      renderEntries();persist();
    });
    row.append(addField('年月日',date),addField('ユーザー',user),addField('名称',name,'cc-entry-field-name'),addField('＋／−',sign),addField('金額（円）',amount),remove);
    root.append(row);
  });
  $('#cc-add-entry').disabled=data.entries.length>=MAX_ENTRIES;
}
function renderInputLists() { renderAccounts();renderOpening();renderEntries(); }
$('#cc-add-account').addEventListener('click',()=>{
  if (data.accounts.length>=MAX_ACCOUNTS) return;
  data.accounts.push({id:uid(),name:'',openingDate:today(),openingBalance:null});
  renderInputLists();persist();
  $('#cc-accounts').lastElementChild?.querySelector('input')?.focus();
});
$('#cc-add-entry').addEventListener('click',()=>{
  if (data.entries.length>=MAX_ENTRIES) return;
  const previous=data.entries.at(-1);
  data.entries.push(blankEntry(previous?.date||today(),data.accounts[0].id));
  renderEntries();persist();
  $('#cc-entries').lastElementChild?.querySelector('.cc-entry-field-name input')?.focus();
});

function setMonth(next) { if (!validMonth(next)) return; viewMonth=next;selectedDay='';renderResult(); }
function renderScope() {
  const input=$('#cc-scope');input.replaceChildren();
  for(const [id,label] of [['all','全体合計'],...confirmed.accounts.map(a=>[a.id,a.name])]) {
    const option=document.createElement('option');option.value=id;option.textContent=label;input.append(option);
  }
  if(![...input.options].some(o=>o.value===viewScope))viewScope='all';
  input.value=viewScope;
}
function chooseInitialMonth() {
  const candidates=confirmed.entries.map(e=>e.date).filter(date=>date>=today()).sort();
  return (candidates[0]||today()).slice(0,7);
}
function renderResult() {
  const monthInput=$('#cc-month');monthInput.value=viewMonth;
  renderScope();
  const summary=summaryForMonth(confirmed,viewMonth,viewScope);
  const monthMsg=$('#cc-month-message');monthMsg.classList.toggle('danger',summary.shortageCount>0);
  const label=viewScope==='all'?'全体':confirmed.accounts.find(a=>a.id===viewScope)?.name||'';
  const d=summary.firstShortage;
  if (d) {
    monthMsg.textContent=`${label}：${Number(d.date.slice(-2))}日に残高不足（${yen(d.missing)}）。この月の最大不足額は${yen(summary.worstShortage)}。`;
  } else if (summary.knownDays===0) {
    monthMsg.textContent=`${label}：この月は残高の基準日前のため計算できません。`;
  } else {
    monthMsg.textContent=`${label}：この月の残高不足はありません。月末見込み ${signedYen(summary.closingBalance)}。`;
  }
  const grid=$('#cc-calendar');grid.replaceChildren();
  const [y,m]=viewMonth.split('-').map(Number);
  const leading=new Date(Date.UTC(y,m-1,1)).getUTCDay();
  for (let i=0;i<leading;i++){const gap=document.createElement('span');gap.className='cc-calendar-gap';grid.append(gap);}
  if (!selectedDay.startsWith(viewMonth)) {
    selectedDay=d?.date || (viewMonth===today().slice(0,7)?today():summary.days[0].date);
  }
  for (const x of summary.days) {
    const btn=document.createElement('button');btn.type='button';
    btn.className=`cc-day ${x.balance===null?'unknown':x.shortage?'red':'green'} ${x.date===selectedDay?'selected':''}`;
    const n=document.createElement('span');n.className='cc-num';n.textContent=Number(x.date.slice(-2));
    const v=document.createElement('span');v.className='cc-figure';v.textContent=compactSigned(x.balance);
    const mark=document.createElement('span');mark.className='cc-mark';mark.textContent=x.balance===null?'未確定':x.shortage?'不足':'残高';
    btn.append(n,v,mark);
    const state=x.balance===null?'残高未確定':x.shortage?`不足 ${yen(x.missing)}`:`残高 ${yen(x.balance)}`;
    btn.setAttribute('aria-label',`${Number(x.date.slice(-2))}日：${state}`);btn.title=`${x.date}：${state}`;
    btn.setAttribute('aria-pressed',String(x.date===selectedDay));
    btn.addEventListener('click',()=>{
      selectedDay=x.date;
      grid.querySelectorAll('.cc-day.selected').forEach(el=>{el.classList.remove('selected');el.setAttribute('aria-pressed','false');});
      btn.classList.add('selected');btn.setAttribute('aria-pressed','true');renderDayDetail();
    });grid.append(btn);
  }
  renderDayDetail();
}
function renderDayDetail() {
  const root=$('#cc-day-detail');root.replaceChildren();
  const day=selectedDay;
  const balance=summaryForMonth(confirmed,day.slice(0,7),viewScope).days.find(x=>x.date===day);
  const title=document.createElement('h3');title.textContent=`${Number(day.slice(5,7))}月${Number(day.slice(8))}日の残高`;
  const figure=document.createElement('div');
  figure.className=`cc-day-balance ${balance.balance===null?'unknown':balance.shortage?'red':'green'}`;
  figure.textContent=balance.balance===null?'未確定':signedYen(balance.balance);
  root.append(title,figure);
  if (balance.shortage) {
    const note=document.createElement('p');note.className='cc-shortage-note';note.textContent=`この日は ${yen(balance.missing)} 足りません。`;root.append(note);
  }
  const accounts=viewScope==='all'?confirmed.accounts:confirmed.accounts.filter(a=>a.id===viewScope);
  if(viewScope==='all') {
    const list=document.createElement('ul');list.className='cc-day-breakdown';
    accounts.forEach(a=>{
      const li=document.createElement('li');const name=document.createElement('span');name.textContent=a.name;
      const money=document.createElement('strong');const value=accountBalanceOn(confirmed,a.id,day);
      money.textContent=value===null?'基準日前':signedYen(value);if(value!==null&&value<0)money.className='red';
      li.append(name,money);list.append(li);
    });root.append(list);
  }
  const heading=document.createElement('h4');heading.className='cc-day-transaction-title';heading.textContent='この日の予定';root.append(heading);
  const events=entriesOn(confirmed,day,viewScope);
  if(!events.length) {const p=document.createElement('p');p.className='cc-hint';p.textContent='登録された予定はありません。';root.append(p);}
  else events.forEach(e=>{
    const line=document.createElement('div');line.className='cc-day-transaction';
    const info=document.createElement('span');const name=document.createElement('strong');name.textContent=e.name;
    const sub=document.createElement('small');sub.textContent=confirmed.accounts.find(a=>a.id===e.accountId)?.name||'';
    info.append(name,sub);
    const money=document.createElement('strong');money.textContent=`${e.sign==='+'?'＋':'−'}${yen(e.amount)}`;
    line.append(info,money);root.append(line);
  });
}
$('#cc-form').addEventListener('submit',event=>{
  event.preventDefault();clearError();
  try {
    const prepared={...data,entries:cleanEntries(data.entries)};
    // A half-filled row must not be silently discarded.
    confirmed=validateData(prepared);
    viewMonth=chooseInitialMonth();viewScope='all';selectedDay='';
    $('#cc-result').hidden=false;renderResult();
    $('#cc-result').scrollIntoView({behavior:'smooth',block:'start'});
  } catch(e) {showError(e.message);$('#cc-error').scrollIntoView({behavior:'smooth',block:'center'});}
});
$('#cc-scope').addEventListener('change',event=>{viewScope=event.target.value;selectedDay='';renderResult();});
$('#cc-month').addEventListener('change',event=>setMonth(event.target.value));
$('#cc-prev').addEventListener('click',()=>{try{setMonth(shiftMonth(viewMonth,-1));}catch{}});
$('#cc-next').addEventListener('click',()=>{try{setMonth(shiftMonth(viewMonth,1));}catch{}});

$('#cc-export').addEventListener('click',()=>{
  const body=JSON.stringify({...data,entries:cleanEntries(data.entries)},null,2);
  const blob=new Blob([body],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download=`jittoku-cashflow-${today()}.json`;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('#cc-backup-note').textContent='バックアップファイルを作成しました。';
});
$('#cc-import').addEventListener('click',()=>$('#cc-import-file').click());
$('#cc-import-file').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try {
    if(file.size>2_000_000)throw new Error('2MB以下のファイルを選択してください。');
    const parsed=validateData(JSON.parse(await file.text()));
    if(!window.confirm('現在のデータをバックアップファイルの内容で置き換えます。よろしいですか？'))return;
    data={...parsed,entries:parsed.entries.length?parsed.entries:[blankEntry(today(),parsed.accounts[0].id)]};
    confirmed=null;$('#cc-result').hidden=true;renderInputLists();persist();
    $('#cc-backup-note').textContent='データを読み込みました。';
  } catch(e) {$('#cc-backup-note').textContent=`読み込みに失敗しました：${e.message}`;}
  finally {event.target.value='';}
});
renderInputLists();