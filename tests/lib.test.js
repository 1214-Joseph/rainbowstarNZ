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

test('ACCOM_FIELDS and WORK_FIELDS are [key, label] pairs of the expected size', () => {
  assert.equal(lib.ACCOM_FIELDS.length, 35);
  assert.equal(lib.WORK_FIELDS.length, 31);
  for (const pair of lib.ACCOM_FIELDS.concat(lib.WORK_FIELDS)) {
    assert.equal(pair.length, 2);
    assert.equal(typeof pair[0], 'string');
    assert.equal(typeof pair[1], 'string');
  }
});

test('ACCOM_FIELDS starts with the identity fields in old-form order', () => {
  assert.deepEqual(lib.ACCOM_FIELDS.slice(0, 3), [
    ['name_en', '英文姓名'],
    ['name_zh', '中文姓名'],
    ['birthday', '出生日期']
  ]);
});

test('joinMultiValue joins repeated checkbox keys with the default separator', () => {
  const parameters = { addons: ['M1 加購早餐 NZD$10', 'M2 加購午餐 NZD$12'] };
  const parameter = { addons: 'M2 加購午餐 NZD$12' };
  assert.equal(lib.joinMultiValue(parameters, parameter, 'addons'), 'M1 加購早餐 NZD$10 / M2 加購午餐 NZD$12');
});

test('joinMultiValue returns the scalar when only one value was submitted', () => {
  assert.equal(lib.joinMultiValue({ gender: ['女性'] }, { gender: '女性' }, 'gender'), '女性');
});

test('joinMultiValue returns an empty string for a missing key', () => {
  assert.equal(lib.joinMultiValue({}, {}, 'nope'), '');
});

test('buildHeaderRow wraps the labels with a timestamp and a data-check column', () => {
  const fields = [['a', '甲'], ['b', '乙']];
  assert.deepEqual(lib.buildHeaderRow(fields), ['時間', '甲', '乙', '資料檢查']);
});

test('headerNeedsUpdate is true for an empty sheet', () => {
  assert.equal(lib.headerNeedsUpdate([], ['時間', '甲', '資料檢查']), true);
  assert.equal(lib.headerNeedsUpdate(null, ['時間', '甲', '資料檢查']), true);
});

test('headerNeedsUpdate is false when the existing header already matches', () => {
  assert.equal(lib.headerNeedsUpdate(['時間', '甲', '資料檢查'], ['時間', '甲', '資料檢查']), false);
});

test('headerNeedsUpdate ignores surrounding whitespace', () => {
  assert.equal(lib.headerNeedsUpdate([' 時間 ', '甲', '資料檢查'], ['時間', '甲', '資料檢查']), false);
});

test('headerNeedsUpdate detects drift in length and in order', () => {
  assert.equal(lib.headerNeedsUpdate(['時間', '甲'], ['時間', '甲', '資料檢查']), true);
  assert.equal(lib.headerNeedsUpdate(['時間', '乙', '甲', '資料檢查'], ['時間', '甲', '乙', '資料檢查']), true);
});

test('buildResponseRow lines every value up under its header', () => {
  const fields = [['a', '甲'], ['b', '乙']];
  const values = { a: 'A', b: 'B' };
  const stamp = new Date('2026-07-09T00:00:00Z');
  assert.deepEqual(
    lib.buildResponseRow(fields, (k) => values[k] || '', stamp, '⚠️ 電話可疑'),
    [stamp, 'A', 'B', '⚠️ 電話可疑']
  );
});

test('buildResponseRow has exactly the width of buildHeaderRow', () => {
  const stamp = new Date();
  const row = lib.buildResponseRow(lib.ACCOM_FIELDS, () => '', stamp, '');
  assert.equal(row.length, lib.buildHeaderRow(lib.ACCOM_FIELDS).length);
});
