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

const getter = (obj) => (key) => (obj[key] === undefined ? '' : obj[key]);

test('checkSuspicious passes clean data', () => {
  assert.equal(checkClean(), '');
  function checkClean() {
    return lib.checkSuspicious(getter({
      name_en: 'Mei Wang', name_zh: '王美', phone: '0211234567',
      email: 'mei@example.com', address: '123 Main Street'
    }));
  }
});

test('checkSuspicious flags a phone with fewer than six digits', () => {
  assert.match(lib.checkSuspicious(getter({ phone: '123' })), /電話可疑/);
});

test('checkSuspicious ignores an empty phone rather than flagging it', () => {
  assert.equal(lib.checkSuspicious(getter({ phone: '' })), '');
});

test('checkSuspicious flags repeated-character and too-short names', () => {
  assert.match(lib.checkSuspicious(getter({ name_en: 'aaaa' })), /英文姓名可疑/);
  assert.match(lib.checkSuspicious(getter({ name_en: 'a' })), /英文姓名可疑/);
  assert.match(lib.checkSuspicious(getter({ name_zh: '啊啊啊' })), /中文姓名可疑/);
});

test('checkSuspicious flags a malformed email and a too-short address', () => {
  assert.match(lib.checkSuspicious(getter({ email: 'not-an-email' })), /Email可疑/);
  assert.match(lib.checkSuspicious(getter({ address: 'ab' })), /地址可疑/);
});

test('checkSuspicious joins several problems into one note', () => {
  const flag = lib.checkSuspicious(getter({ phone: '1', email: 'bad' }));
  assert.match(flag, /^⚠️ /);
  assert.match(flag, /電話可疑/);
  assert.match(flag, /Email可疑/);
});

test('isValidEmail accepts ordinary addresses and rejects malformed ones', () => {
  assert.equal(lib.isValidEmail('a@b.co'), true);
  assert.equal(lib.isValidEmail('a@b'), false);
  assert.equal(lib.isValidEmail('a b@c.co'), false);
  assert.equal(lib.isValidEmail(''), false);
});

test('buildEmailSubject names the application type and the applicant', () => {
  const subject = lib.buildEmailSubject('workexchange', getter({ name_zh: '王美' }), '');
  assert.equal(subject, '【彩虹星民宿】新換宿申請 Work Exchange - 王美');
});

test('buildEmailSubject falls back through Chinese name, English name, then email', () => {
  assert.match(lib.buildEmailSubject('accommodation', getter({ name_en: 'Mei' }), ''), /- Mei$/);
  assert.match(lib.buildEmailSubject('accommodation', getter({ email: 'm@e.co' }), ''), /- m@e\.co$/);
});

test('buildEmailSubject appends the suspicious-data flag in parentheses', () => {
  const subject = lib.buildEmailSubject('accommodation', getter({ name_zh: '王美' }), '⚠️ 電話可疑');
  assert.match(subject, /（⚠️ 電話可疑）$/);
});

test('buildEmailBody lists only the fields that were filled in', () => {
  const fields = [['a', '甲'], ['b', '乙'], ['c', '丙']];
  const body = lib.buildEmailBody('accommodation', fields, getter({ a: 'A', c: 'C' }), '');
  assert.match(body, /甲： A/);
  assert.match(body, /丙： C/);
  assert.doesNotMatch(body, /乙/);
});

test('buildEmailBody leads with a warning line when data looks suspicious', () => {
  const body = lib.buildEmailBody('accommodation', [['a', '甲']], getter({ a: 'A' }), '⚠️ 電話可疑');
  assert.match(body, /⚠️ 系統提醒：⚠️ 電話可疑/);
});

test('buildEmailSubject replaces CRLF with exactly one space in applicant name', () => {
  const subject = lib.buildEmailSubject('accommodation', getter({ name_zh: '王美\r\n攻擊' }), '');
  assert.equal(subject, '【彩虹星民宿】新住宿申請 Accommodation - 王美 攻擊');
});

test('buildEmailSubject replaces lone CR with exactly one space', () => {
  const subject = lib.buildEmailSubject('accommodation', getter({ name_zh: '王美\r攻擊' }), '');
  assert.equal(subject, '【彩虹星民宿】新住宿申請 Accommodation - 王美 攻擊');
});

test('buildEmailSubject replaces lone LF with exactly one space', () => {
  const subject = lib.buildEmailSubject('accommodation', getter({ name_zh: '王美\n攻擊' }), '');
  assert.equal(subject, '【彩虹星民宿】新住宿申請 Accommodation - 王美 攻擊');
});

test('buildEmailSubject collapses multiple newlines to exactly one space', () => {
  const subject = lib.buildEmailSubject('accommodation', getter({ name_zh: '王美\n\n\n攻擊' }), '');
  assert.equal(subject, '【彩虹星民宿】新住宿申請 Accommodation - 王美 攻擊');
});

test('buildEmailSubject sanitizes newlines and prevents header injection in name', () => {
  const subject = lib.buildEmailSubject('accommodation', getter({ name_zh: '王美\r\nBcc: attacker@example.com' }), '');
  assert.doesNotMatch(subject, /\r/);
  assert.doesNotMatch(subject, /\n/);
  assert.match(subject, /王美/);
  assert.match(subject, /attacker@example\.com/);
});

test('buildEmailSubject replaces CRLF with exactly one space in suspicious flag', () => {
  const subject = lib.buildEmailSubject('accommodation', getter({ name_zh: '王美' }), '⚠️ 電話\r\n可疑');
  assert.equal(subject, '【彩虹星民宿】新住宿申請 Accommodation - 王美（⚠️ 電話 可疑）');
});

test('buildEmailSubject produces unchanged output for ordinary names without newlines', () => {
  const subject = lib.buildEmailSubject('accommodation', getter({ name_zh: '王美' }), '⚠️ 電話可疑');
  assert.equal(subject, '【彩虹星民宿】新住宿申請 Accommodation - 王美（⚠️ 電話可疑）');
});
