const yen = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 });

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
function monthDate(monthValue, day) {
  const [year, month] = monthValue.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${monthValue}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

// Tool search: works on the home page and every tool page.
const toolSearch = document.querySelector('#tool-search');
if (toolSearch) {
  const toolRows = [...document.querySelectorAll('.tool-row')];
  const empty = document.querySelector('#tool-search-empty');
  toolSearch.addEventListener('input', () => {
    const query = toolSearch.value.trim().toLocaleLowerCase('ja');
    let visibleCount = 0;
    toolRows.forEach((row) => {
      const searchableText = (row.dataset.search || row.textContent).toLocaleLowerCase('ja');
      const matches = !query || searchableText.includes(query);
      row.hidden = !matches;
      if (matches) visibleCount += 1;
    });
    if (empty) empty.hidden = visibleCount !== 0;
  });
}

// 1. Split bill
const splitForm = document.querySelector('#split-bill-form');
if (splitForm) {
  const addPartyButton = document.querySelector('#add-party');
  const partyList = document.querySelector('#party-list');
  const splitResult = document.querySelector('#split-result');
  const splitResultList = document.querySelector('#split-result-list');
  const splitResultNote = document.querySelector('#split-result-note');

  function participantInputs(card) {
    return [...card.querySelectorAll('.party-person-name')];
  }

  function participantNames(card) {
    return participantInputs(card).map((input) => input.value.trim()).filter(Boolean);
  }

  function uniqueNames(names) {
    return [...new Set(names)];
  }

  function updatePayerOptions(card) {
    const select = card.querySelector('.party-payer');
    const previous = select.value;
    const names = uniqueNames(participantNames(card));
    select.innerHTML = '';

    if (!names.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '参加者を入力してください';
      select.appendChild(option);
      select.disabled = true;
      return;
    }

    select.disabled = false;
    names.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
    select.value = names.includes(previous) ? previous : names[0];
  }

  function renumberParties() {
    [...partyList.querySelectorAll('.party-card')].forEach((card, index) => {
      card.dataset.partyNumber = String(index + 1);
      card.querySelector('.party-title').textContent = `${index + 1}次会`;
      const removeButton = card.querySelector('.remove-party');
      removeButton.hidden = index === 0;
    });
  }

  function addParticipantRow(card, name = '', shouldFocus = false) {
    const list = card.querySelector('.party-people');
    const row = document.createElement('div');
    row.className = 'party-person-row';
    const rowNumber = list.children.length + 1;
    row.innerHTML = `<input class="party-person-name" type="text" autocomplete="off" aria-label="参加者" placeholder="${String.fromCharCode(64 + Math.min(rowNumber, 26))}さん" value="${escapeHtml(name)}"><button class="remove-person" type="button" aria-label="この参加者を削除">×</button>`;
    const input = row.querySelector('.party-person-name');
    input.addEventListener('input', () => updatePayerOptions(card));
    row.querySelector('.remove-person').addEventListener('click', () => {
      if (list.children.length === 1) input.value = '';
      else row.remove();
      updatePayerOptions(card);
    });
    list.appendChild(row);
    updatePayerOptions(card);
    if (shouldFocus) input.focus();
  }

  function createPartyCard(data = {}) {
    const card = document.createElement('div');
    card.className = 'party-card';
    card.innerHTML = `
      <div class="party-card-head">
        <strong class="party-title"></strong>
        <label><span>合計金額</span><div class="unit-input"><input class="party-total" type="number" min="0" step="1" inputmode="numeric" placeholder="8000" value="${escapeHtml(data.total ?? '')}"><span>円</span></div></label>
        <button class="remove-party" type="button" aria-label="この会を削除">×</button>
      </div>
      <div class="party-card-body">
        <div class="party-participant-field">
          <span class="field-label">参加者</span>
          <div class="party-people"></div>
          <button class="link-button add-person" type="button">＋ 参加者を追加</button>
        </div>
        <label class="party-payer-field"><span>立替者</span><select class="party-payer"></select></label>
      </div>`;

    card.querySelector('.remove-party').addEventListener('click', () => {
      card.remove();
      renumberParties();
    });
    card.querySelector('.add-person').addEventListener('click', () => addParticipantRow(card, '', true));
    partyList.appendChild(card);

    const names = data.participants?.length ? data.participants : ['', '', ''];
    names.forEach((name) => addParticipantRow(card, name));
    updatePayerOptions(card);
    if (data.payer && participantNames(card).includes(data.payer)) card.querySelector('.party-payer').value = data.payer;
    renumberParties();
    return card;
  }

  function getPartyData(card) {
    return {
      name: card.querySelector('.party-title').textContent,
      total: card.querySelector('.party-total').value,
      payer: card.querySelector('.party-payer').value,
      participants: participantNames(card)
    };
  }

  addPartyButton.addEventListener('click', () => {
    const previousCard = partyList.lastElementChild;
    const inherited = previousCard ? uniqueNames(participantNames(previousCard)) : [];
    const card = createPartyCard({ participants: inherited.length ? inherited : [''] });
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  createPartyCard();

  splitForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const parties = [...partyList.querySelectorAll('.party-card')].map(getPartyData);
    if (!parties.length) { alert('会を1つ以上入力してください。'); return; }

    for (const party of parties) {
      const total = Math.round(Number(party.total));
      if (!(total > 0)) { alert(`${party.name}の合計金額を入力してください。`); return; }
      if (!party.participants.length) { alert(`${party.name}の参加者を1人以上入力してください。`); return; }
      if (uniqueNames(party.participants).length !== party.participants.length) { alert(`${party.name}に同じ参加者名が重複しています。`); return; }
      if (!party.payer || !party.participants.includes(party.payer)) { alert(`${party.name}の立替者を選んでください。`); return; }
      party.total = total;
    }

    const allParticipants = uniqueNames(parties.flatMap((party) => party.participants));
    const balances = Object.fromEntries(allParticipants.map((name) => [name, 0]));
    let hadRounding = false;

    for (const party of parties) {
      balances[party.payer] += party.total;
      const baseShare = Math.floor(party.total / party.participants.length);
      const remainder = party.total - baseShare * party.participants.length;
      if (remainder !== 0) hadRounding = true;
      party.participants.forEach((name, index) => {
        balances[name] -= baseShare + (index < remainder ? 1 : 0);
      });
    }

    const debtors = allParticipants.map((name) => ({ name, amount: -balances[name] })).filter((person) => person.amount > 0);
    const creditors = allParticipants.map((name) => ({ name, amount: balances[name] })).filter((person) => person.amount > 0);
    const payments = [];
    let d = 0;
    let c = 0;

    while (d < debtors.length && c < creditors.length) {
      const amount = Math.min(debtors[d].amount, creditors[c].amount);
      if (amount > 0) {
        payments.push({ from: debtors[d].name, to: creditors[c].name, amount });
        debtors[d].amount -= amount;
        creditors[c].amount -= amount;
      }
      if (debtors[d].amount === 0) d += 1;
      if (creditors[c].amount === 0) c += 1;
    }

    splitResultList.innerHTML = '';
    if (!payments.length) {
      const row = document.createElement('div');
      row.className = 'result-item';
      row.innerHTML = '<span>追加の支払いはありません。</span><strong>精算済み</strong>';
      splitResultList.appendChild(row);
    } else {
      payments.forEach((payment) => {
        const row = document.createElement('div');
        row.className = 'result-item';
        row.innerHTML = `<span>${escapeHtml(payment.from)} → ${escapeHtml(payment.to)}</span><strong>${yen.format(payment.amount)}円</strong>`;
        splitResultList.appendChild(row);
      });
    }
    splitResultNote.textContent = hadRounding ? '割り切れない金額は、各会の参加者順で1円ずつ調整しています。' : '';
    splitResult.hidden = false;
    splitResult.scrollIntoView({ block: 'nearest' });
  });
}

// 2. Recipe scaling
const recipeForm = document.querySelector('#recipe-form');
if (recipeForm) {
  const ingredientList = document.querySelector('#ingredient-list');
  const addRowButton = document.querySelector('#add-row');
  const resultSection = document.querySelector('#result');
  const resultTitle = document.querySelector('#result-title');
  const resultList = document.querySelector('#result-list');
  const copyResultButton = document.querySelector('#copy-result');
  const copyStatus = document.querySelector('#copy-status');
  const defaults = [{ name: '豚バラ', quantity: '300', unit: 'g' }, { name: '白菜', quantity: '1/2', unit: '個' }, { name: '水', quantity: '300', unit: 'cc' }];
  function createIngredientRow(data = { name: '', quantity: '', unit: '' }) {
    const row = document.createElement('div'); row.className = 'ingredient-row';
    row.innerHTML = `<input class="ingredient-name" aria-label="食材名" placeholder="食材名" value="${escapeHtml(data.name)}"><input class="ingredient-quantity" aria-label="数量" inputmode="decimal" placeholder="数量" value="${escapeHtml(data.quantity)}"><input class="ingredient-unit" aria-label="単位" placeholder="単位" value="${escapeHtml(data.unit)}"><button class="remove-row" type="button" aria-label="この材料を削除">×</button>`;
    row.querySelector('.remove-row').addEventListener('click', () => { if (ingredientList.children.length > 1) row.remove(); }); ingredientList.appendChild(row);
  }
  function parseQuantity(raw) {
    const value = raw.trim(); if (!value) return NaN;
    const fraction = value.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
    if (fraction) { const numerator = Number(fraction[1]); const denominator = Number(fraction[2]); return denominator === 0 ? NaN : numerator / denominator; }
    return Number(value.replace(',', '.'));
  }
  function formatQuantity(value) {
    const rounded = Math.round((value + Number.EPSILON) * 100) / 100; const whole = Math.trunc(rounded); const decimal = Math.abs(rounded - whole);
    const fractionMap = [[0.25, '1/4'], [0.33, '1/3'], [0.5, '1/2'], [0.67, '2/3'], [0.75, '3/4']];
    const matched = fractionMap.find(([number]) => Math.abs(decimal - number) < 0.015);
    if (matched && whole === 0) return matched[1]; if (matched && whole > 0) return `${whole}と${matched[1]}`;
    return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 }).format(rounded);
  }
  function getIngredients() { return [...ingredientList.querySelectorAll('.ingredient-row')].map((row) => ({ name: row.querySelector('.ingredient-name').value.trim(), rawQuantity: row.querySelector('.ingredient-quantity').value.trim(), unit: row.querySelector('.ingredient-unit').value.trim() })); }
  addRowButton.addEventListener('click', () => createIngredientRow()); defaults.forEach(createIngredientRow);
  recipeForm.addEventListener('submit', (event) => {
    event.preventDefault(); copyStatus.textContent = '';
    const original = Number(document.querySelector('#original-servings').value); const target = Number(document.querySelector('#target-servings').value); const ingredients = getIngredients();
    if (!(original > 0) || !(target > 0)) { alert('人数は0より大きい数字を入力してください。'); return; }
    const validIngredients = ingredients.filter((item) => item.name || item.rawQuantity || item.unit);
    if (!validIngredients.length) { alert('材料を1つ以上入力してください。'); return; }
    const parsed = validIngredients.map((item) => ({ ...item, quantity: parseQuantity(item.rawQuantity) }));
    if (parsed.some((item) => !item.name || Number.isNaN(item.quantity))) { alert('食材名と数量を確認してください。数量は「300」「0.5」「1/2」のように入力できます。'); return; }
    const ratio = target / original; resultTitle.textContent = `${original}人前 → ${target}人前なら、こうなります。`; resultList.innerHTML = '';
    parsed.forEach((item) => { const row = document.createElement('div'); row.className = 'result-item'; row.innerHTML = `<span>${escapeHtml(item.name)}</span><strong>${escapeHtml(formatQuantity(item.quantity * ratio))}${escapeHtml(item.unit)}</strong>`; resultList.appendChild(row); });
    resultSection.hidden = false; resultSection.scrollIntoView({ block: 'nearest' });
  });
  copyResultButton.addEventListener('click', async () => {
    const lines = [resultTitle.textContent]; resultList.querySelectorAll('.result-item').forEach((item) => lines.push(`${item.children[0].textContent}：${item.children[1].textContent}`));
    try { await navigator.clipboard.writeText(lines.join('\n')); copyStatus.textContent = 'コピーしました。'; } catch { copyStatus.textContent = 'コピーできませんでした。結果を選択してコピーしてください。'; }
  });
}

// 3. Hourly wage
const wageForm = document.querySelector('#hourly-wage-form');
if (wageForm) {
  const wageMonth = document.querySelector('#wage-month'); const wageWorkdays = document.querySelector('#wage-workdays'); const hourlyWageResult = document.querySelector('#hourly-wage-result'); const hourlyWageAnswer = document.querySelector('#hourly-wage-answer'); const hourlyWageDetail = document.querySelector('#hourly-wage-detail');
  function countWeekdays(monthValue) { const [year, month] = monthValue.split('-').map(Number); const lastDay = new Date(year, month, 0).getDate(); let count = 0; for (let day = 1; day <= lastDay; day += 1) { const weekday = new Date(year, month - 1, day).getDay(); if (weekday !== 0 && weekday !== 6) count += 1; } return count; }
  wageMonth.value = currentMonthValue(); wageWorkdays.value = countWeekdays(wageMonth.value); wageMonth.addEventListener('change', () => { wageWorkdays.value = countWeekdays(wageMonth.value); });
  wageForm.addEventListener('submit', (event) => {
    event.preventDefault(); const dailyHours = Number(document.querySelector('#wage-daily-hours').value); const workdays = Number(wageWorkdays.value); const takehome = Number(document.querySelector('#wage-takehome').value);
    if (!(dailyHours > 0) || !(workdays > 0) || !(takehome > 0)) { alert('労働時間、勤務日数、手取り額は0より大きい数字を入力してください。'); return; }
    const monthlyHours = dailyHours * workdays; const hourly = takehome / monthlyHours;
    hourlyWageAnswer.textContent = `約${yen.format(Math.round(hourly))}円 / 時間`; hourlyWageDetail.textContent = `1か月の労働時間：${oneDecimal.format(monthlyHours)}時間（${oneDecimal.format(dailyHours)}時間 × ${yen.format(workdays)}日）`;
    hourlyWageResult.hidden = false; hourlyWageResult.scrollIntoView({ block: 'nearest' });
  });
}

// 4. Cashflow
const cashForm = document.querySelector('#month-survival-form');
if (cashForm) {
  const cashMonth = document.querySelector('#cash-month'); const cashflowList = document.querySelector('#cashflow-list'); const addCashflowButton = document.querySelector('#add-cashflow'); const cashResult = document.querySelector('#cash-result'); const cashResultTitle = document.querySelector('#cash-result-title'); const cashResultSummary = document.querySelector('#cash-result-summary'); const cashResultList = document.querySelector('#cash-result-list');
  cashMonth.value = currentMonthValue();
  function createCashflowRow(data = {}) {
    const row = document.createElement('div'); row.className = 'cashflow-row';
    row.innerHTML = `<input class="cash-day" type="number" min="1" max="31" step="1" inputmode="numeric" aria-label="日" placeholder="20" value="${escapeHtml(data.day ?? '')}"><input class="cash-name" type="text" aria-label="名称" placeholder="給料" value="${escapeHtml(data.name ?? '')}"><select class="cash-sign" aria-label="プラスまたはマイナス"><option value="income" ${data.type === 'income' ? 'selected' : ''}>＋</option><option value="expense" ${data.type !== 'income' ? 'selected' : ''}>−</option></select><input class="cash-amount" type="number" min="0" step="1" inputmode="numeric" aria-label="金額" placeholder="250000" value="${escapeHtml(data.amount ?? '')}"><button class="remove-cashflow" type="button" aria-label="この予定を削除">×</button>`;
    row.querySelector('.remove-cashflow').addEventListener('click', () => { if (cashflowList.children.length > 1) row.remove(); }); cashflowList.appendChild(row);
  }
  createCashflowRow({ day: '20', name: '給料', type: 'income', amount: '250000' }); createCashflowRow({ day: '27', name: 'カード', type: 'expense', amount: '150000' }); addCashflowButton.addEventListener('click', () => createCashflowRow());
  function daysInSelectedMonth() { const [year, month] = cashMonth.value.split('-').map(Number); return new Date(year, month, 0).getDate(); }
  function cashDateFromDay(day) { return monthDate(cashMonth.value, day); }
  function formatShortDate(dateString) { const [, month, day] = dateString.split('-'); return `${Number(month)}/${Number(day)}`; }
  cashForm.addEventListener('submit', (event) => {
    event.preventDefault(); const currentBalance = Math.round(Number(document.querySelector('#current-balance').value)); if (Number.isNaN(currentBalance)) { alert('現在の残高を入力してください。'); return; }
    const rows = [...cashflowList.querySelectorAll('.cashflow-row')];
    const entries = rows.map((row, index) => { const rawAmount = row.querySelector('.cash-amount').value.trim(); return { index, day: Number(row.querySelector('.cash-day').value), name: row.querySelector('.cash-name').value.trim(), type: row.querySelector('.cash-sign').value, rawAmount, amount: rawAmount === '' ? NaN : Math.round(Number(rawAmount)) }; }).filter((entry) => entry.name || entry.rawAmount);
    const lastDay = daysInSelectedMonth();
    for (const entry of entries) { if (!entry.name || !Number.isInteger(entry.day) || entry.day < 1 || entry.day > lastDay || !(entry.amount >= 0)) { alert(`日付は1〜${lastDay}日、名称と金額も入力してください。`); return; } entry.date = cashDateFromDay(entry.day); }
    entries.sort((a, b) => a.day - b.day || a.index - b.index);
    let balance = currentBalance; let minBalance = currentBalance; let firstNegative = currentBalance < 0 ? { current: true, balance: currentBalance } : null; const timeline = [];
    entries.forEach((entry) => { const signed = entry.type === 'income' ? entry.amount : -entry.amount; balance += signed; minBalance = Math.min(minBalance, balance); if (!firstNegative && balance < 0) firstNegative = { ...entry, balance }; timeline.push({ ...entry, signed, balance }); });
    const minimumNeeded = Math.max(0, -minBalance);
    if (firstNegative?.current) { cashResultTitle.textContent = '現在すでに残高不足です。'; cashResultSummary.textContent = `現在${yen.format(Math.abs(firstNegative.balance))}円不足しています。今月を乗り切るには、あと最低${yen.format(minimumNeeded)}円必要です。`; }
    else if (firstNegative) { const [, month, day] = firstNegative.date.split('-').map(Number); cashResultTitle.textContent = `${month}月${day}日に残高不足になります。`; cashResultSummary.textContent = `その時点で${yen.format(Math.abs(firstNegative.balance))}円不足します。今月を乗り切るには、あと最低${yen.format(minimumNeeded)}円必要です。`; }
    else { cashResultTitle.textContent = '今月はもちます。'; cashResultSummary.textContent = `予定をすべて反映しても、残高は最低${yen.format(minBalance)}円です。月末時点では${yen.format(balance)}円残ります。`; }
    cashResultList.innerHTML = '';
    timeline.forEach((entry) => { const row = document.createElement('div'); row.className = 'cash-result-row'; const signedText = `${entry.signed >= 0 ? '+' : '-'}${yen.format(Math.abs(entry.signed))}円`; row.innerHTML = `<span>${formatShortDate(entry.date)}</span><span>${escapeHtml(entry.name)} ${signedText}</span><strong class="${entry.balance < 0 ? 'negative' : ''}">${yen.format(entry.balance)}円</strong>`; cashResultList.appendChild(row); });
    cashResult.hidden = false; cashResult.scrollIntoView({ block: 'nearest' });
  });
}

// 5. Work to buy
const workToBuyForm = document.querySelector('#work-to-buy-form');
if (workToBuyForm) {
  const workResult = document.querySelector('#work-result'); const workResultText = document.querySelector('#work-result-text');
  function formatWorkAmount(value) { const rounded = Math.round((value + Number.EPSILON) * 10) / 10; return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 }).format(rounded); }
  workToBuyForm.addEventListener('submit', (event) => {
    event.preventDefault(); const price = Number(document.querySelector('#item-price').value); const hourlyWage = Number(document.querySelector('#hourly-wage-input').value); const dailyHours = Number(document.querySelector('#daily-hours').value);
    if (!(price > 0) || !(hourlyWage > 0) || !(dailyHours > 0)) { alert('価格、時給、1日の労働時間は0より大きい数字を入力してください。'); return; }
    const requiredHours = price / hourlyWage; const requiredDays = requiredHours / dailyHours;
    workResultText.textContent = `約${formatWorkAmount(requiredHours)}時間、約${formatWorkAmount(requiredDays)}日分働く必要があります。`; workResult.hidden = false; workResult.scrollIntoView({ block: 'nearest' });
  });
}
