const toolSearch = document.querySelector('#tool-search');
const toolRows = [...document.querySelectorAll('.tool-row')];
const usableToolRows = [...document.querySelectorAll('[data-tool-target]')];
const calculators = [...document.querySelectorAll('[data-calculator]')];
const toolSearchEmpty = document.querySelector('#tool-search-empty');

function showTool(toolId, shouldScroll = true) {
  calculators.forEach((calculator) => {
    calculator.hidden = calculator.id !== toolId;
  });

  usableToolRows.forEach((row) => {
    const isActive = row.dataset.toolTarget === toolId;
    row.classList.toggle('active', isActive);
    row.querySelector('span').textContent = isActive ? '表示中' : '使う →';
  });

  if (shouldScroll) {
    document.querySelector(`#${toolId}`)?.scrollIntoView({ block: 'start' });
  }
}

usableToolRows.forEach((row) => {
  row.addEventListener('click', (event) => {
    event.preventDefault();
    showTool(row.dataset.toolTarget);
    history.replaceState(null, '', `#${row.dataset.toolTarget}`);
  });
});

toolSearch.addEventListener('input', () => {
  const query = toolSearch.value.trim().toLocaleLowerCase('ja');
  let visibleCount = 0;

  toolRows.forEach((row) => {
    const searchableText = (row.dataset.search || row.textContent).toLocaleLowerCase('ja');
    const matches = !query || searchableText.includes(query);
    row.hidden = !matches;
    if (matches) visibleCount += 1;
  });

  toolSearchEmpty.hidden = visibleCount !== 0;
});

const initialTool = location.hash.slice(1);
if (calculators.some((calculator) => calculator.id === initialTool)) {
  showTool(initialTool, false);
} else {
  showTool('recipe', false);
}

const ingredientList = document.querySelector('#ingredient-list');
const addRowButton = document.querySelector('#add-row');
const recipeForm = document.querySelector('#recipe-form');
const resultSection = document.querySelector('#result');
const resultTitle = document.querySelector('#result-title');
const resultList = document.querySelector('#result-list');
const copyResultButton = document.querySelector('#copy-result');
const copyStatus = document.querySelector('#copy-status');

const defaults = [
  { name: '豚バラ', quantity: '300', unit: 'g' },
  { name: '白菜', quantity: '1/2', unit: '個' },
  { name: '水', quantity: '300', unit: 'cc' },
];

function createIngredientRow(data = { name: '', quantity: '', unit: '' }) {
  const row = document.createElement('div');
  row.className = 'ingredient-row';
  row.innerHTML = `
    <input class="ingredient-name" aria-label="食材名" placeholder="食材名" value="${escapeHtml(data.name)}" />
    <input class="ingredient-quantity" aria-label="数量" inputmode="decimal" placeholder="数量" value="${escapeHtml(data.quantity)}" />
    <input class="ingredient-unit" aria-label="単位" placeholder="単位" value="${escapeHtml(data.unit)}" />
    <button class="remove-row" type="button" aria-label="この材料を削除">×</button>
  `;

  row.querySelector('.remove-row').addEventListener('click', () => {
    if (ingredientList.children.length > 1) row.remove();
  });

  ingredientList.appendChild(row);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function parseQuantity(raw) {
  const value = raw.trim();
  if (!value) return NaN;

  // "1/2" のような単純な分数を許可
  const fraction = value.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    return denominator === 0 ? NaN : numerator / denominator;
  }

  return Number(value.replace(',', '.'));
}

function formatQuantity(value) {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;

  // 料理で見やすい代表的な分数だけ分数表記に戻す
  const whole = Math.trunc(rounded);
  const decimal = Math.abs(rounded - whole);
  const fractionMap = [
    [0.25, '1/4'],
    [0.33, '1/3'],
    [0.5, '1/2'],
    [0.67, '2/3'],
    [0.75, '3/4'],
  ];

  const matched = fractionMap.find(([number]) => Math.abs(decimal - number) < 0.015);
  if (matched && whole === 0) return matched[1];
  if (matched && whole > 0) return `${whole}と${matched[1]}`;

  return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 }).format(rounded);
}

function getIngredients() {
  return [...ingredientList.querySelectorAll('.ingredient-row')].map((row) => ({
    name: row.querySelector('.ingredient-name').value.trim(),
    rawQuantity: row.querySelector('.ingredient-quantity').value.trim(),
    unit: row.querySelector('.ingredient-unit').value.trim(),
  }));
}

addRowButton.addEventListener('click', () => createIngredientRow());

defaults.forEach(createIngredientRow);

recipeForm.addEventListener('submit', (event) => {
  event.preventDefault();
  copyStatus.textContent = '';

  const original = Number(document.querySelector('#original-servings').value);
  const target = Number(document.querySelector('#target-servings').value);
  const ingredients = getIngredients();

  if (!(original > 0) || !(target > 0)) {
    alert('人数は0より大きい数字を入力してください。');
    return;
  }

  const validIngredients = ingredients.filter((item) => item.name || item.rawQuantity || item.unit);
  if (!validIngredients.length) {
    alert('材料を1つ以上入力してください。');
    return;
  }

  const parsed = validIngredients.map((item) => ({ ...item, quantity: parseQuantity(item.rawQuantity) }));
  if (parsed.some((item) => !item.name || Number.isNaN(item.quantity))) {
    alert('食材名と数量を確認してください。数量は「300」「0.5」「1/2」のように入力できます。');
    return;
  }

  const ratio = target / original;
  resultTitle.textContent = `${original}人前 → ${target}人前なら、こうなります。`;
  resultList.innerHTML = '';

  parsed.forEach((item) => {
    const converted = item.quantity * ratio;
    const row = document.createElement('div');
    row.className = 'result-item';
    row.innerHTML = `<span>${escapeHtml(item.name)}</span><strong>${escapeHtml(formatQuantity(converted))}${escapeHtml(item.unit)}</strong>`;
    resultList.appendChild(row);
  });

  resultSection.hidden = false;
  resultSection.scrollIntoView({ block: 'nearest' });
});

copyResultButton.addEventListener('click', async () => {
  const lines = [resultTitle.textContent];
  resultList.querySelectorAll('.result-item').forEach((item) => {
    lines.push(`${item.children[0].textContent}：${item.children[1].textContent}`);
  });

  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    copyStatus.textContent = 'コピーしました。';
  } catch {
    copyStatus.textContent = 'コピーできませんでした。結果を選択してコピーしてください。';
  }
});


const workToBuyForm = document.querySelector('#work-to-buy-form');
const workResult = document.querySelector('#work-result');
const workResultText = document.querySelector('#work-result-text');

function formatWorkAmount(value) {
  const rounded = Math.round((value + Number.EPSILON) * 10) / 10;
  return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 }).format(rounded);
}

workToBuyForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const price = Number(document.querySelector('#item-price').value);
  const hourlyWage = Number(document.querySelector('#hourly-wage').value);
  const dailyHours = Number(document.querySelector('#daily-hours').value);

  if (!(price > 0) || !(hourlyWage > 0) || !(dailyHours > 0)) {
    alert('価格、時給、1日の労働時間は0より大きい数字を入力してください。');
    return;
  }

  const requiredHours = price / hourlyWage;
  const requiredDays = requiredHours / dailyHours;

  workResultText.textContent = `約${formatWorkAmount(requiredHours)}時間、約${formatWorkAmount(requiredDays)}日分働く必要があります。`;
  workResult.hidden = false;
  workResult.scrollIntoView({ block: 'nearest' });
});
