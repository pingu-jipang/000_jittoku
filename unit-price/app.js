'use strict';
const form = document.querySelector('#unit-price-form');
const result = document.querySelector('#unit-price-result');
const error = document.querySelector('#unit-price-error');
const answer = document.querySelector('#unit-price-answer');
const rows = document.querySelector('#unit-price-rows');
const note = document.querySelector('#unit-price-note');
const units = {
  g: { category: 'weight', multiplier: 1, basis: 100, label: '100g' },
  kg: { category: 'weight', multiplier: 1000, basis: 100, label: '100g' },
  ml: { category: 'volume', multiplier: 1, basis: 1000, label: '1L' },
  l: { category: 'volume', multiplier: 1000, basis: 1000, label: '1L' }
};
const formatter = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 });
function getItem(id) {
  const price = Number(document.querySelector('#price-' + id).value);
  const quantity = Number(document.querySelector('#quantity-' + id).value);
  const unit = units[document.querySelector('#unit-' + id).value];
  if (!Number.isFinite(price) || price < 0 || !Number.isFinite(quantity) || quantity <= 0 || !unit) return null;
  return { price, quantity, unit, rate: price / (quantity * unit.multiplier) * unit.basis };
}
form.addEventListener('submit', (event) => {
  event.preventDefault();
  result.hidden = true;
  error.hidden = true;
  const a = getItem('a'), b = getItem('b');
  if (!a || !b) {
    error.textContent = '値段と内容量を正しく入力してください。';
    error.hidden = false; return;
  }
  if (a.unit.category !== b.unit.category) {
    error.textContent = '比較する商品の単位をそろえてください（重さ同士、または容量同士）。';
    error.hidden = false; return;
  }
  const label = a.unit.label;
  rows.replaceChildren();
  for (const [name, item] of [['商品A', a], ['商品B', b]]) {
    const row = document.createElement('div');
    row.className = 'result-item';
    const text = document.createElement('span');
    const value = document.createElement('strong');
    text.textContent = name;
    value.textContent = formatter.format(item.rate) + '円 / ' + label;
    row.append(text, value);
    rows.append(row);
  }
  const difference = Math.abs(a.rate - b.rate);
  if (difference < 0.000001) {
    answer.textContent = 'どちらも同じ単価です。';
    note.textContent = '';
  } else {
    const cheaper = a.rate < b.rate ? '商品A' : '商品B';
    const higher = Math.max(a.rate, b.rate);
    answer.textContent = cheaper + 'のほうがお得です。';
    note.textContent = label + 'あたり' + formatter.format(difference) + '円（約' + formatter.format(difference / higher * 100) + '%）安いです。';
  }
  result.hidden = false;
});
