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

test('all three application field lists are [key, label] pairs of the expected size', () => {
  assert.equal(lib.ACCOM_FIELDS.length, 20);
  assert.equal(lib.WORK_FIELDS.length, 35);
  assert.equal(lib.SERVICE_FIELDS.length, 31);
  for (const pair of lib.ACCOM_FIELDS.concat(lib.WORK_FIELDS, lib.SERVICE_FIELDS)) {
    assert.equal(pair.length, 2);
    assert.equal(typeof pair[0], 'string');
    assert.equal(typeof pair[1], 'string');
  }
});

test('the accommodation form stores emergency contacts and optional vehicle plates without legacy add-ons', () => {
  const keys = lib.ACCOM_FIELDS.map((field) => field[0]);
  for (const key of ['emergency_name', 'emergency_relation', 'emergency_phone', 'vehicle_plate']) {
    assert.ok(keys.includes(key), `missing ${key}`);
  }
  for (const removed of ['addons', 'pickup_date', 'dropoff_date', 'city_date', 'meal_avoid']) {
    assert.equal(keys.includes(removed), false, `legacy add-on field remains: ${removed}`);
  }
  assert.equal(lib.ACCOM_FIELDS.find((field) => field[0] === 'passport')[1], '護照號碼');
});

test('the work-exchange form stores a passport, applicant photo and optional vehicle plate', () => {
  const keys = lib.WORK_FIELDS.map((field) => field[0]);
  assert.ok(keys.includes('passport'));
  assert.ok(keys.includes('photo_url'));
  assert.ok(keys.includes('vehicle_plate'));
  assert.equal(lib.WORK_FIELDS.find((field) => field[0] === 'photo_url')[1], '本人照片');
});

test('the other-services form keeps multi-service details out of accommodation applications', () => {
  const keys = lib.SERVICE_FIELDS.map((field) => field[0]);
  for (const key of ['services', 'service_start', 'service_end', 'luggage_count', 'vehicle_plate', 'pickup_date', 'dropoff_date', 'city_date']) {
    assert.ok(keys.includes(key), `missing ${key}`);
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

test('buildResponseRow prevents spreadsheet formula execution in visitor-entered text', () => {
  const row = lib.buildResponseRow([['name', '姓名']], () => '=IMPORTXML("https://evil.invalid")', new Date(), '');
  assert.equal(row[1], "'=IMPORTXML(\"https://evil.invalid\")");
});

test('buildScheduleEntry uses stay dates and keeps earlier submissions distinguishable', () => {
  const get = getter({
    room_type: '主屋', checkin: '2026-09-10', checkout: '2026-09-12',
    name_zh: '王美', email: 'mei@example.com', phone: '0211234567', vehicle_plate: 'ABC123', guests: '2'
  });
  assert.deepEqual(lib.buildScheduleEntry('accommodation', get, new Date('2026-08-03T01:02:03Z'), '', 'app-1'), {
    id: 'app-1', submitted_at: new Date('2026-08-03T01:02:03Z'), start_date: '2026-09-10', end_date: '2026-09-12',
    type: '住宿申請', items: '主屋', applicant: '王美', email: 'mei@example.com', phone: '0211234567',
    vehicle_plate: 'ABC123', people_count: 2, quantity: '', details: '主屋 2 人', photo_url: '',
    status: '新申請', conflict: '', flag: ''
  });
});

test('buildScheduleEntry spans the earliest and latest date in a multi-service request', () => {
  const get = getter({
    services: '寄放行李 / 接機 / 市區接送', service_start: '2026-09-10', service_end: '2026-09-17',
    luggage_count: '4', pickup_date: '2026-09-08', pickup_pax: '3', city_date: '2026-09-20',
    city_pax: '2', name_en: 'Mei Wang'
  });
  const entry = lib.buildScheduleEntry('services', get, new Date('2026-08-03T01:02:03Z'), '', 'app-2');
  assert.equal(entry.start_date, '2026-09-08');
  assert.equal(entry.end_date, '2026-09-20');
  assert.equal(entry.type, '其他服務');
  assert.equal(entry.items, '寄放行李 / 接機 / 市區接送');
  assert.match(entry.details, /行李/);
  assert.match(entry.details, /接機/);
  assert.match(entry.details, /市區接送/);
  assert.equal(entry.people_count, 3, 'the same travelling party is not counted twice across services');
  assert.equal(entry.quantity, '行李 4 件');
});

test('buildScheduleEntry shows both luggage and vehicle quantities for a combined storage request', () => {
  const entry = lib.buildScheduleEntry('services', getter({
    services: '寄放行李 / 寄放車輛', luggage_count: '5', vehicle_plate: 'ABC123'
  }), new Date('2026-08-03T01:02:03Z'), '', 'app-storage');

  assert.equal(entry.people_count, '');
  assert.equal(entry.quantity, '行李 5 件 / 車輛 1 台');
});

test('scheduleConflictMessages flags overlapping active accommodation requests for the same room only', () => {
  const rows = [
    { id: 'a', type: '住宿申請', items: '主屋', start_date: '2026-09-10', end_date: '2026-09-12', status: '新申請' },
    { id: 'b', type: '住宿申請', items: '主屋', start_date: '2026-09-11', end_date: '2026-09-14', status: '已確認' },
    { id: 'c', type: '住宿申請', items: '帳棚', start_date: '2026-09-11', end_date: '2026-09-13', status: '新申請' },
    { id: 'd', type: '住宿申請', items: '主屋', start_date: '2026-09-11', end_date: '2026-09-13', status: '已取消' }
  ];

  assert.deepEqual(lib.scheduleConflictMessages(rows), {
    a: '⚠️ 同房型日期可能重疊',
    b: '⚠️ 同房型日期可能重疊',
    c: '',
    d: ''
  });
});

test('schedule sorting and conflict checks accept real Google Sheet date cells', () => {
  const september = { start_date: new Date('2026-09-02T00:00:00Z'), submitted_at: new Date('2026-08-02T00:00:00Z') };
  const october = { start_date: new Date('2026-10-01T00:00:00Z'), submitted_at: new Date('2026-08-01T00:00:00Z') };
  assert.deepEqual([october, september].sort(lib.compareScheduleEntries), [september, october]);

  const conflicts = lib.scheduleConflictMessages([
    { id: 'sheet-a', type: '住宿申請', items: '主屋', start_date: new Date('2026-09-10'), end_date: new Date('2026-09-12'), status: '新申請' },
    { id: 'sheet-b', type: '住宿申請', items: '主屋', start_date: new Date('2026-09-11'), end_date: new Date('2026-09-14'), status: '已確認' }
  ]);
  assert.equal(conflicts['sheet-a'], '⚠️ 同房型日期可能重疊');
  assert.equal(conflicts['sheet-b'], '⚠️ 同房型日期可能重疊');
});

test('buildScheduleEntry ignores stale dates belonging to unselected services', () => {
  const get = getter({
    services: '寄放行李', service_start: '2026-09-10', service_end: '2026-09-17',
    pickup_date: '2026-08-01', city_date: '2026-12-31'
  });
  const entry = lib.buildScheduleEntry('services', get, new Date('2026-08-03T01:02:03Z'), '', 'app-stale');
  assert.equal(entry.start_date, '2026-09-10');
  assert.equal(entry.end_date, '2026-09-17');
});

test('compareScheduleEntries orders by service date, then application time, with undated rows last', () => {
  const rows = [
    { start_date: '', submitted_at: new Date('2026-08-01T00:00:00Z') },
    { start_date: '2026-09-01', submitted_at: new Date('2026-08-02T00:00:00Z') },
    { start_date: '2026-09-01', submitted_at: new Date('2026-08-01T00:00:00Z') },
    { start_date: '2026-08-31', submitted_at: new Date('2026-08-03T00:00:00Z') }
  ];
  rows.sort(lib.compareScheduleEntries);
  assert.deepEqual(rows.map((row) => row.start_date + '|' + row.submitted_at.toISOString().slice(0, 10)), [
    '2026-08-31|2026-08-03', '2026-09-01|2026-08-01', '2026-09-01|2026-08-02', '|2026-08-01'
  ]);
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

test('groupLists sorts each list by its order column', () => {
  const rows = [
    { list: 'rules', order: 2, text_zh: '第二', text_en: 'Second' },
    { list: 'rules', order: 1, text_zh: '第一', text_en: 'First' },
    { list: 'duties_out', order: 1, text_zh: '餵貓', text_en: 'Feed the cats' }
  ];
  const grouped = lib.groupLists(rows);
  assert.deepEqual(grouped.rules, [
    { zh: '第一', en: 'First' },
    { zh: '第二', en: 'Second' }
  ]);
  assert.deepEqual(grouped.duties_out, [{ zh: '餵貓', en: 'Feed the cats' }]);
  assert.deepEqual(grouped.duties_in, []);
});

test('groupLists always returns all three keys, even with no rows', () => {
  assert.deepEqual(lib.groupLists([]), { rules: [], duties_out: [], duties_in: [] });
  assert.deepEqual(lib.groupLists(null), { rules: [], duties_out: [], duties_in: [] });
});

test('groupLists ignores unknown list names and fully blank rows', () => {
  const rows = [
    { list: 'nonsense', order: 1, text_zh: 'x', text_en: 'x' },
    { list: 'rules', order: 1, text_zh: '', text_en: '' },
    { list: 'rules', order: 2, text_zh: '保留', text_en: '' }
  ];
  assert.deepEqual(lib.groupLists(rows).rules, [{ zh: '保留', en: '' }]);
});

test('groupLists treats a missing or non-numeric order as zero', () => {
  const rows = [
    { list: 'rules', order: 1, text_zh: 'b', text_en: '' },
    { list: 'rules', order: '', text_zh: 'a', text_en: '' }
  ];
  assert.deepEqual(lib.groupLists(rows).rules.map((i) => i.zh), ['a', 'b']);
});

test('listRowsFrom renumbers order from one, preserving the given sequence', () => {
  const items = [{ zh: '甲', en: 'A' }, { zh: '乙', en: 'B' }];
  assert.deepEqual(lib.listRowsFrom('rules', items), [
    ['rules', 1, '甲', 'A'],
    ['rules', 2, '乙', 'B']
  ]);
});

test('listRowsFrom drops items that are blank in both languages', () => {
  const items = [{ zh: '甲', en: '' }, { zh: '', en: '' }, { zh: '', en: 'C' }];
  assert.deepEqual(lib.listRowsFrom('duties_in', items), [
    ['duties_in', 1, '甲', ''],
    ['duties_in', 2, '', 'C']
  ]);
});

test('LIST_NAMES holds exactly the three editable lists', () => {
  assert.deepEqual(lib.LIST_NAMES, ['rules', 'duties_out', 'duties_in']);
});

test('groupLists preserves a cell holding the number 0 as the string "0"', () => {
  const rows = [{ list: 'rules', order: 1, text_zh: 0, text_en: 'Zero' }];
  const grouped = lib.groupLists(rows);
  assert.deepEqual(grouped.rules, [{ zh: '0', en: 'Zero' }]);
});

test('listRowsFrom preserves an item with zh: 0 as "0" and does not drop it', () => {
  const items = [{ zh: 0, en: 'Zero' }];
  const rows = lib.listRowsFrom('rules', items);
  assert.deepEqual(rows, [['rules', 1, '0', 'Zero']]);
});

test('listRowsFrom preserves an item with zh: false as "false" and does not drop it', () => {
  const items = [{ zh: false, en: 'Bool' }];
  const rows = lib.listRowsFrom('rules', items);
  assert.deepEqual(rows, [['rules', 1, 'false', 'Bool']]);
});

test('whitespace is trimmed identically by groupLists and listRowsFrom for round-tripping', () => {
  const rows = [{ list: 'rules', order: 1, text_zh: '  hello  ', text_en: '  world  ' }];
  const grouped = lib.groupLists(rows);
  assert.equal(grouped.rules[0].zh, 'hello');
  assert.equal(grouped.rules[0].en, 'world');
  const items = grouped.rules;
  const newRows = lib.listRowsFrom('rules', items);
  assert.deepEqual(newRows, [['rules', 1, 'hello', 'world']]);
});

test('both functions still drop rows blank in both languages', () => {
  const rows = [{ list: 'rules', order: 1, text_zh: '', text_en: '' }];
  const grouped = lib.groupLists(rows);
  assert.deepEqual(grouped.rules, []);
  const items = [{ zh: '', en: '' }];
  const newRows = lib.listRowsFrom('rules', items);
  assert.deepEqual(newRows, []);
});
