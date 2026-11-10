'use strict';
const field = document.querySelector('#count-text');
const all = document.querySelector('#count-all');
const noSpace = document.querySelector('#count-no-space');
const lines = document.querySelector('#count-lines');
const formatter = new Intl.NumberFormat('ja-JP');
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ja', { granularity: 'grapheme' }) : null;
function countCharacters(value) {
  return segmenter ? [...segmenter.segment(value)].length : Array.from(value).length;
}
function updateCount() {
  const value = field.value;
  all.textContent = formatter.format(countCharacters(value));
  noSpace.textContent = formatter.format(countCharacters(value.replace(/\s/gu, '')));
  lines.textContent = formatter.format(value ? value.split(/\r\n|\n|\r/).length : 0);
}
field.addEventListener('input', updateCount);
updateCount();
