'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../apps-script/lib.js');

test('splitUrls splits on newline, comma and pipe', () => {
  assert.deepEqual(lib.splitUrls('a.jpg,b.jpg'), ['a.jpg', 'b.jpg']);
  assert.deepEqual(lib.splitUrls('a.jpg\nb.jpg'), ['a.jpg', 'b.jpg']);
  assert.deepEqual(lib.splitUrls('a.jpg|b.jpg'), ['a.jpg', 'b.jpg']);
});

test('splitUrls trims whitespace and drops duplicates and blanks', () => {
  assert.deepEqual(lib.splitUrls('  a.jpg , \n b.jpg |a.jpg,,'), ['a.jpg', 'b.jpg']);
});

test('splitUrls returns an empty array for empty, null and undefined', () => {
  assert.deepEqual(lib.splitUrls(''), []);
  assert.deepEqual(lib.splitUrls(null), []);
  assert.deepEqual(lib.splitUrls(undefined), []);
});

test('joinUrls joins with newlines and tolerates an empty array', () => {
  assert.equal(lib.joinUrls(['a', 'b']), 'a\nb');
  assert.equal(lib.joinUrls([]), '');
});

test('settingValue returns the Chinese value in Chinese mode', () => {
  assert.equal(lib.settingValue({ tagline: '中文標語' }, 'tagline', 'zh'), '中文標語');
});

test('settingValue returns the English value when an _en key exists', () => {
  const settings = { tagline: '中文標語', tagline_en: 'English tagline' };
  assert.equal(lib.settingValue(settings, 'tagline', 'en'), 'English tagline');
});

test('settingValue returns undefined in English mode when _en is missing, so the caller keeps the built-in data-en text', () => {
  assert.equal(lib.settingValue({ tagline: '中文標語' }, 'tagline', 'en'), undefined);
  assert.equal(lib.settingValue({ tagline: '中文標語', tagline_en: '' }, 'tagline', 'en'), undefined);
  assert.equal(lib.settingValue({ tagline: '中文標語', tagline_en: null }, 'tagline', 'en'), undefined);
});

test('settingValue returns undefined when the key is absent or blank in either language', () => {
  assert.equal(lib.settingValue({}, 'tagline', 'zh'), undefined);
  assert.equal(lib.settingValue({ tagline: '' }, 'tagline', 'zh'), undefined);
  assert.equal(lib.settingValue(null, 'tagline', 'zh'), undefined);
});

test('pickRow falls back to Chinese in English mode, because data-driven rows have no built-in English', () => {
  assert.equal(lib.pickRow({ name: '主屋' }, 'name', 'en'), '主屋');
  assert.equal(lib.pickRow({ name: '主屋', name_en: 'Dorm' }, 'name', 'en'), 'Dorm');
  assert.equal(lib.pickRow({ name: '主屋', name_en: '' }, 'name', 'en'), '主屋');
});

test('pickRow returns undefined only when both languages are empty', () => {
  assert.equal(lib.pickRow({ name: '' }, 'name', 'zh'), undefined);
  assert.equal(lib.pickRow({}, 'name', 'en'), undefined);
});
