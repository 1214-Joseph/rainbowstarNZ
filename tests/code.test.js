'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const code = require('../apps-script/Code.js');

/** A stand-in for a Sheet: getDataRange().getValues() returns a 2-D array. */
function fakeSheet(values) {
  return {
    getLastRow: () => values.length,
    getDataRange: () => ({ getValues: () => values })
  };
}

/** A stand-in for a Spreadsheet: getSheetByName returns a fakeSheet or null. */
function fakeSpreadsheet(sheetsByName) {
  return { getSheetByName: (name) => sheetsByName[name] || null };
}

test('readSettings_ turns column A/B into a key-value object and skips the header', () => {
  const ss = fakeSpreadsheet({
    settings: fakeSheet([
      ['key', 'value'],
      ['site_name', '彩虹星民宿 Rainbowstar'],
      ['tagline_en', 'English tagline'],
      ['', 'orphaned value with no key']
    ])
  });
  assert.deepEqual(code.readSettings_(ss), {
    site_name: '彩虹星民宿 Rainbowstar',
    tagline_en: 'English tagline'
  });
});

test('readSettings_ returns an empty object when the tab is missing', () => {
  assert.deepEqual(code.readSettings_(fakeSpreadsheet({})), {});
});

test('readRooms_ maps each row onto the header row and skips blank rows', () => {
  const ss = fakeSpreadsheet({
    rooms: fakeSheet([
      ['name', 'name_en', 'price', 'photos'],
      ['主屋 Dorm Room', 'Main House Dorm Room', 35, 'a.jpg\nb.jpg'],
      ['', '', '', ''],
      ['自搭帳棚 Tent', 'Own Tent', 20, '']
    ])
  });
  assert.deepEqual(code.readRooms_(ss), [
    { name: '主屋 Dorm Room', name_en: 'Main House Dorm Room', price: 35, photos: 'a.jpg\nb.jpg' },
    { name: '自搭帳棚 Tent', name_en: 'Own Tent', price: 20, photos: '' }
  ]);
});

test('readRooms_ returns an empty array when the tab is missing or holds only a header', () => {
  assert.deepEqual(code.readRooms_(fakeSpreadsheet({})), []);
  assert.deepEqual(code.readRooms_(fakeSpreadsheet({ rooms: fakeSheet([['name']]) })), []);
});

test('readListRows_ maps the workexchange_lists tab onto its header', () => {
  const ss = fakeSpreadsheet({
    workexchange_lists: fakeSheet([
      ['list', 'order', 'text_zh', 'text_en'],
      ['rules', 1, '第一條', 'Rule one']
    ])
  });
  assert.deepEqual(code.readListRows_(ss), [
    { list: 'rules', order: 1, text_zh: '第一條', text_en: 'Rule one' }
  ]);
});

test('buildContentPayload_ assembles settings, rooms and the three lists', () => {
  const ss = fakeSpreadsheet({
    settings: fakeSheet([['key', 'value'], ['site_name', 'Rainbowstar']]),
    rooms: fakeSheet([['name', 'price'], ['主屋', 35]]),
    workexchange_lists: fakeSheet([
      ['list', 'order', 'text_zh', 'text_en'],
      ['duties_out', 1, '餵貓', 'Feed the cats'],
      ['rules', 2, '第二條', 'Rule two'],
      ['rules', 1, '第一條', 'Rule one']
    ])
  });
  const payload = code.buildContentPayload_(ss);
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.settings, { site_name: 'Rainbowstar' });
  assert.deepEqual(payload.rooms, [{ name: '主屋', price: 35 }]);
  assert.deepEqual(payload.rules, [{ zh: '第一條', en: 'Rule one' }, { zh: '第二條', en: 'Rule two' }]);
  assert.deepEqual(payload.duties_out, [{ zh: '餵貓', en: 'Feed the cats' }]);
  assert.deepEqual(payload.duties_in, []);
});

test('buildContentPayload_ still succeeds when every content tab is missing', () => {
  const payload = code.buildContentPayload_(fakeSpreadsheet({}));
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.rooms, []);
  assert.deepEqual(payload.rules, []);
});

/** A writable stand-in that records appendRow / getRange().setValues() calls. */
function fakeWritableSheet(values) {
  const rows = values.map((r) => r.slice());
  return {
    rows,
    getLastRow: () => rows.length,
    getDataRange: () => ({ getValues: () => rows }),
    appendRow: (row) => rows.push(row.slice()),
    getRange: (startRow, startCol, numRows, numCols) => ({
      setValues: (newValues) => {
        for (let i = 0; i < numRows; i++) {
          rows[startRow - 1 + i] = newValues[i].slice();
        }
      }
    })
  };
}

function fakeWritableSpreadsheet(sheetsByName) {
  const sheets = Object.assign({}, sheetsByName);
  return {
    sheets,
    getSheetByName: (name) => sheets[name] || null,
    insertSheet: (name) => {
      sheets[name] = fakeWritableSheet([]);
      return sheets[name];
    }
  };
}

const STAMP = new Date('2026-07-09T12:00:00Z');

test('appendResponse_ creates the tab and writes the header before the first row', () => {
  const ss = fakeWritableSpreadsheet({});
  const fields = [['a', '甲'], ['b', '乙']];
  code.appendResponse_(ss, '住宿申請', fields, (k) => ({ a: 'A', b: 'B' }[k] || ''), STAMP, '');

  const sheet = ss.getSheetByName('住宿申請');
  assert.deepEqual(sheet.rows[0], ['時間', '甲', '乙', '資料檢查']);
  assert.deepEqual(sheet.rows[1], [STAMP, 'A', 'B', '']);
});

test('appendResponse_ repairs a drifted header instead of writing under stale labels', () => {
  const ss = fakeWritableSpreadsheet({
    住宿申請: fakeWritableSheet([['時間', '乙', '甲', '資料檢查'], [STAMP, 'old', 'row', '']])
  });
  const fields = [['a', '甲'], ['b', '乙']];
  code.appendResponse_(ss, '住宿申請', fields, (k) => ({ a: 'A', b: 'B' }[k] || ''), STAMP, '');

  const sheet = ss.getSheetByName('住宿申請');
  assert.deepEqual(sheet.rows[0], ['時間', '甲', '乙', '資料檢查'], 'header rewritten');
  assert.deepEqual(sheet.rows[2], [STAMP, 'A', 'B', ''], 'new row appended in the new order');
});

test('appendResponse_ leaves a correct header untouched', () => {
  const ss = fakeWritableSpreadsheet({
    住宿申請: fakeWritableSheet([['時間', '甲', '資料檢查']])
  });
  code.appendResponse_(ss, '住宿申請', [['a', '甲']], () => 'A', STAMP, '');
  assert.equal(ss.getSheetByName('住宿申請').rows.length, 2);
});

test('handlePost_ writes an accommodation row and reports success', () => {
  const ss = fakeWritableSpreadsheet({
    settings: fakeWritableSheet([['key', 'value'], ['notify_email', 'owner@example.com']])
  });
  const sent = [];
  global.MailApp = { sendEmail: (to, subject, body, opts) => sent.push({ to, subject, body, opts }) };

  const result = code.handlePost_(ss, {
    parameter: { type: 'accommodation', name_zh: '王美', email: 'mei@example.com', phone: '0211234567' },
    parameters: { addons: ['M1 加購早餐 NZD$10', 'M2 加購午餐 NZD$12'] }
  }, STAMP);

  assert.equal(result.ok, true);
  const rows = ss.getSheetByName('住宿申請').rows;
  assert.deepEqual(rows[0], code.__lib.buildHeaderRow(code.__lib.ACCOM_FIELDS));
  const addonsColumn = code.__lib.ACCOM_FIELDS.findIndex((f) => f[0] === 'addons') + 1;
  assert.equal(rows[1][addonsColumn], 'M1 加購早餐 NZD$10 / M2 加購午餐 NZD$12');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'owner@example.com');
  assert.equal(sent[0].opts.replyTo, 'mei@example.com');
});

test('handlePost_ routes a work-exchange submission to its own tab', () => {
  const ss = fakeWritableSpreadsheet({});
  global.MailApp = { sendEmail: () => {} };
  global.Session = { getEffectiveUser: () => ({ getEmail: () => 'fallback@example.com' }) };

  const result = code.handlePost_(ss, {
    parameter: { type: 'workexchange', name_zh: '王美' },
    parameters: {}
  }, STAMP);

  assert.equal(result.ok, true);
  assert.ok(ss.getSheetByName('換宿申請'));
  assert.equal(ss.getSheetByName('住宿申請'), null);
});

test('handlePost_ never rejects a submission with missing fields', () => {
  const ss = fakeWritableSpreadsheet({});
  global.MailApp = { sendEmail: () => {} };
  global.Session = { getEffectiveUser: () => ({ getEmail: () => 'fallback@example.com' }) };

  const result = code.handlePost_(ss, { parameter: {}, parameters: {} }, STAMP);

  assert.equal(result.ok, true, 'an empty submission is still recorded');
  assert.equal(ss.getSheetByName('住宿申請').rows.length, 2);
});

test('handlePost_ still records the row when sending the email throws', () => {
  const ss = fakeWritableSpreadsheet({});
  global.MailApp = { sendEmail: () => { throw new Error('quota exceeded'); } };
  global.Session = { getEffectiveUser: () => ({ getEmail: () => 'fallback@example.com' }) };

  const result = code.handlePost_(ss, {
    parameter: { type: 'accommodation', name_zh: '王美' },
    parameters: {}
  }, STAMP);

  assert.equal(result.ok, true);
  assert.equal(ss.getSheetByName('住宿申請').rows.length, 2);
});

test('handlePost_ flags suspicious data in the data-check column', () => {
  const ss = fakeWritableSpreadsheet({});
  global.MailApp = { sendEmail: () => {} };
  global.Session = { getEffectiveUser: () => ({ getEmail: () => 'fallback@example.com' }) };

  code.handlePost_(ss, {
    parameter: { type: 'accommodation', name_zh: '王美', phone: '12' },
    parameters: {}
  }, STAMP);

  const rows = ss.getSheetByName('住宿申請').rows;
  assert.match(rows[1][rows[1].length - 1], /電話可疑/);
});
