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

/** A writable stand-in supporting appendRow, setValue, setValues and clear. */
function fakeWritableSheet(values) {
  const rows = values.map((r) => r.slice());

  function ensure(rowIndex, colCount) {
    while (rows.length <= rowIndex) rows.push([]);
    while (rows[rowIndex].length < colCount) rows[rowIndex].push('');
  }

  return {
    rows,
    getLastRow: () => rows.length,
    getDataRange: () => ({ getValues: () => rows }),
    appendRow: (row) => rows.push(row.slice()),
    clear: () => { rows.length = 0; },
    getRange: (startRow, startCol, numRows, numCols) => ({
      setValue: (value) => {
        ensure(startRow - 1, startCol);
        rows[startRow - 1][startCol - 1] = value;
      },
      setValues: (newValues) => {
        const height = numRows === undefined ? newValues.length : numRows;
        for (let i = 0; i < height; i++) {
          ensure(startRow - 1 + i, startCol - 1 + newValues[i].length);
          for (let j = 0; j < newValues[i].length; j++) {
            rows[startRow - 1 + i][startCol - 1 + j] = newValues[i][j];
          }
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

test('logError_ creates the errors sheet with a header row on first use', () => {
  const ss = fakeWritableSpreadsheet({});
  code.logError_(ss, 'test context', 'test detail');

  const errorSheet = ss.getSheetByName('errors');
  assert.ok(errorSheet, 'errors sheet was created');
  assert.deepEqual(errorSheet.rows[0], ['時間', '情境', '詳情'], 'header row is present');
  assert.equal(errorSheet.rows.length, 2, 'one data row was appended');
  assert.equal(errorSheet.rows[1][1], 'test context', 'context column is correct');
  assert.equal(errorSheet.rows[1][2], 'test detail', 'detail column is correct');
});

test('logError_ appends to the errors sheet without repeating the header on second use', () => {
  const ss = fakeWritableSpreadsheet({});
  code.logError_(ss, 'context 1', 'detail 1');
  code.logError_(ss, 'context 2', 'detail 2');

  const errorSheet = ss.getSheetByName('errors');
  assert.equal(errorSheet.rows.length, 3, 'two data rows plus one header');
  assert.deepEqual(errorSheet.rows[0], ['時間', '情境', '詳情'], 'header row unchanged');
  assert.equal(errorSheet.rows[1][1], 'context 1');
  assert.equal(errorSheet.rows[2][1], 'context 2');
});

test('when the response sheet appendRow throws, handlePost_ returns ok:false and logs the error', () => {
  const ss = fakeWritableSpreadsheet({});
  ss.insertSheet('住宿申請').appendRow = () => { throw new Error('Sheet is locked'); };
  global.MailApp = { sendEmail: () => {} };
  global.Session = { getEffectiveUser: () => ({ getEmail: () => 'fallback@example.com' }) };

  const result = code.handlePost_(ss, {
    parameter: { type: 'accommodation', name_zh: '王美' },
    parameters: {}
  }, STAMP);

  assert.equal(result.ok, false, 'handlePost_ returns ok:false');
  assert.match(result.error, /locked/i, 'error message mentions the thrown error');

  const errorSheet = ss.getSheetByName('errors');
  assert.ok(errorSheet, 'errors sheet was created');
  assert.equal(errorSheet.rows.length, 2, 'header row plus one error row');
  assert.equal(errorSheet.rows[1][1], 'doPost', 'context is "doPost"');
  assert.match(String(errorSheet.rows[1][2]), /locked/i, 'detail mentions the thrown message');
});

test('when logError_ itself throws, handlePost_ still returns ok:false and does not propagate the error', () => {
  const ss = fakeWritableSpreadsheet({});
  ss.insertSheet('住宿申請').appendRow = () => { throw new Error('Append failed'); };
  // Make logError_ throw by making insertSheet fail after the errors sheet is created
  let insertSheetCallCount = 0;
  const origInsertSheet = ss.insertSheet.bind(ss);
  ss.insertSheet = (name) => {
    insertSheetCallCount++;
    if (name === 'errors' && insertSheetCallCount > 1) {
      throw new Error('Cannot create sheet');
    }
    return origInsertSheet(name);
  };

  global.MailApp = { sendEmail: () => {} };
  global.Session = { getEffectiveUser: () => ({ getEmail: () => 'fallback@example.com' }) };

  // First call should succeed in creating the errors sheet
  code.handlePost_(ss, {
    parameter: { type: 'accommodation', name_zh: '王美' },
    parameters: {}
  }, STAMP);

  // Reset for second call where logError_ will fail
  insertSheetCallCount = 0;
  ss.insertSheet = (name) => {
    if (name === 'errors') {
      throw new Error('Cannot create sheet');
    }
    return origInsertSheet(name);
  };

  let caughtError = false;
  try {
    code.handlePost_(ss, {
      parameter: { type: 'accommodation', name_zh: '王美' },
      parameters: {}
    }, STAMP);
  } catch (e) {
    caughtError = true;
  }

  assert.equal(caughtError, false, 'handlePost_ did not throw');
});

test('a submission with an unrecognised type value still records and logs as unknown type', () => {
  const ss = fakeWritableSpreadsheet({
    settings: fakeWritableSheet([['key', 'value'], ['notify_email', 'owner@example.com']])
  });
  global.MailApp = { sendEmail: () => {} };

  const result = code.handlePost_(ss, {
    parameter: { type: 'work_exchange', name_zh: '王美' },
    parameters: {}
  }, STAMP);

  assert.equal(result.ok, true, 'submission is still recorded');
  const accomSheet = ss.getSheetByName('住宿申請');
  assert.ok(accomSheet, 'recorded in accommodation tab (default)');
  assert.equal(accomSheet.rows.length, 2, 'header plus one data row');

  const errorSheet = ss.getSheetByName('errors');
  assert.ok(errorSheet, 'errors sheet was created');
  assert.equal(errorSheet.rows.length, 2, 'header plus one error row');
  assert.equal(errorSheet.rows[1][1], 'unknown type', 'context is "unknown type"');
  assert.equal(errorSheet.rows[1][2], 'work_exchange', 'detail names the received value');
});

test('a submission with type exactly "workexchange" does not log an error', () => {
  const ss = fakeWritableSpreadsheet({
    settings: fakeWritableSheet([['key', 'value'], ['notify_email', 'owner@example.com']])
  });
  global.MailApp = { sendEmail: () => {} };

  code.handlePost_(ss, {
    parameter: { type: 'workexchange', name_zh: '王美' },
    parameters: {}
  }, STAMP);

  const errorSheet = ss.getSheetByName('errors');
  assert.equal(errorSheet, null, 'no errors sheet was created');
});

test('a submission with no type field does not log an error', () => {
  const ss = fakeWritableSpreadsheet({
    settings: fakeWritableSheet([['key', 'value'], ['notify_email', 'owner@example.com']])
  });
  global.MailApp = { sendEmail: () => {} };

  code.handlePost_(ss, {
    parameter: { name_zh: '王美' },
    parameters: {}
  }, STAMP);

  const errorSheet = ss.getSheetByName('errors');
  assert.equal(errorSheet, null, 'no errors sheet was created');
});

function stubScriptProperties(props) {
  global.PropertiesService = {
    getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null) })
  };
}

function stubCache() {
  const store = new Map();
  global.CacheService = {
    getScriptCache: () => ({
      put: (k, v) => store.set(k, v),
      get: (k) => (store.has(k) ? store.get(k) : null),
      remove: (k) => store.delete(k)
    })
  };
  return store;
}

/** Helper to stub Utilities with a fake digest that returns deterministic bytes including negatives. */
function stubUtilities() {
  global.Utilities = {
    getUuid: () => 'uuid-1',
    computeDigest: function(algo, input) {
      // Fake digest that returns 32 bytes with at least one negative
      const bytes = [];
      for (let i = 0; i < 32; i++) {
        bytes.push((input.charCodeAt(i % input.length) + i) % 256 - 128);
      }
      return bytes;
    },
    DigestAlgorithm: { SHA_256: 'sha256' }
  };
}

test('verifyPasscode rejects a wrong passcode and issues no token', () => {
  stubScriptProperties({ ADMIN_PASSCODE: 'letmein' });
  stubCache();
  stubUtilities();

  assert.deepEqual(code.verifyPasscode('wrong'), { ok: false });
});

test('verifyPasscode rejects everything when no passcode is configured', () => {
  stubScriptProperties({});
  stubCache();
  stubUtilities();

  assert.deepEqual(code.verifyPasscode(''), { ok: false });
  assert.deepEqual(code.verifyPasscode('anything'), { ok: false });
});

test('verifyPasscode issues a token that assertAuthorized_ then accepts', () => {
  stubScriptProperties({ ADMIN_PASSCODE: 'letmein' });
  stubCache();
  stubUtilities();

  const result = code.verifyPasscode('letmein');
  assert.equal(result.ok, true);
  assert.equal(result.token, 'uuid-1');
  assert.doesNotThrow(() => code.assertAuthorized_('uuid-1'));
});

test('assertAuthorized_ throws for an unknown, empty or null token', () => {
  stubScriptProperties({ ADMIN_PASSCODE: 'letmein' });
  stubCache();
  stubUtilities();

  assert.throws(() => code.assertAuthorized_('nope'), /未授權/);
  assert.throws(() => code.assertAuthorized_(''), /未授權/);
  assert.throws(() => code.assertAuthorized_(null), /未授權/);
});

test('photoUrlFor_ builds a Google CDN link and fileIdFromUrl_ reverses it', () => {
  const url = code.photoUrlFor_('FILE123');
  assert.equal(url, 'https://lh3.googleusercontent.com/d/FILE123=w1600');
  assert.equal(code.fileIdFromUrl_(url), 'FILE123');
});

test('fileIdFromUrl_ also reads the proxy form and returns null for anything else', () => {
  assert.equal(code.fileIdFromUrl_('https://script.google.com/macros/s/AKfy/exec?img=FILE123'), 'FILE123');
  assert.equal(code.fileIdFromUrl_('https://example.com/cat.jpg'), null);
  assert.equal(code.fileIdFromUrl_(''), null);
});

test('isInsidePhotoRoot_ accepts a file whose parent chain reaches the photo root', () => {
  const root = { getId: () => 'ROOT' };
  const sub = { getId: () => 'SUB', getParents: () => iterator([root]) };
  const file = { getParents: () => iterator([sub]) };
  assert.equal(code.isInsidePhotoRoot_(file, 'ROOT'), true);
});

test('isInsidePhotoRoot_ rejects a file living anywhere else in Drive', () => {
  const elsewhere = { getId: () => 'PRIVATE', getParents: () => iterator([]) };
  const file = { getParents: () => iterator([elsewhere]) };
  assert.equal(code.isInsidePhotoRoot_(file, 'ROOT'), false);
});

test('isInsidePhotoRoot_ rejects an orphan file with no parents', () => {
  assert.equal(code.isInsidePhotoRoot_({ getParents: () => iterator([]) }, 'ROOT'), false);
});

/** Mimics Apps Script's FolderIterator. */
function iterator(items) {
  let i = 0;
  return { hasNext: () => i < items.length, next: () => items[i++] };
}

// ============================================================================
// Fix: token revocation and doGet coverage
// ============================================================================

test('a token minted under passcode A is rejected after ADMIN_PASSCODE changes to B', () => {
  stubScriptProperties({ ADMIN_PASSCODE: 'passcode-a' });
  stubCache();
  stubUtilities();

  const result1 = code.verifyPasscode('passcode-a');
  assert.equal(result1.ok, true);

  // Change the passcode
  stubScriptProperties({ ADMIN_PASSCODE: 'passcode-b' });

  // Token should now be rejected
  assert.throws(() => code.assertAuthorized_('uuid-1'), /未授權/);
});

test('a token minted under passcode A is still accepted while ADMIN_PASSCODE is still A', () => {
  stubScriptProperties({ ADMIN_PASSCODE: 'passcode-a' });
  stubCache();
  stubUtilities();

  const result = code.verifyPasscode('passcode-a');
  assert.equal(result.ok, true);

  // Passcode hasn't changed; token should still work
  assert.doesNotThrow(() => code.assertAuthorized_('uuid-1'));
});

test('assertAuthorized_ throws when ADMIN_PASSCODE has been removed, even for a cached token', () => {
  stubScriptProperties({ ADMIN_PASSCODE: 'passcode-a' });
  stubCache();
  stubUtilities();

  const result = code.verifyPasscode('passcode-a');
  assert.equal(result.ok, true);

  // Remove the passcode
  stubScriptProperties({});

  // Token should now be rejected because passcode is gone
  assert.throws(() => code.assertAuthorized_('uuid-1'), /未授權/);
});

test('revokeToken removes a token and makes it invalid', () => {
  stubScriptProperties({ ADMIN_PASSCODE: 'passcode-a' });
  stubCache();
  stubUtilities();

  const result = code.verifyPasscode('passcode-a');
  assert.equal(result.ok, true);
  assert.doesNotThrow(() => code.assertAuthorized_('uuid-1'));

  // Revoke the token
  const revokeResult = code.revokeToken('uuid-1');
  assert.deepEqual(revokeResult, { ok: true });

  // Token should now be rejected
  assert.throws(() => code.assertAuthorized_('uuid-1'), /未授權/);
});

test('revokeToken returns {ok:true} for a token that was never valid', () => {
  stubCache();
  stubUtilities();

  const revokeResult = code.revokeToken('never-existed');
  assert.deepEqual(revokeResult, { ok: true });
});

test('passcodeFingerprint_ is deterministic and differs for different passcodes', () => {
  stubScriptProperties({ ADMIN_PASSCODE: 'passcode-a' });
  const cache1 = stubCache();
  stubUtilities();

  const result1 = code.verifyPasscode('passcode-a');
  const cachedValue1 = cache1.get('admin_token_uuid-1');

  stubScriptProperties({ ADMIN_PASSCODE: 'passcode-b' });
  const cache2 = stubCache();
  stubUtilities();

  const result2 = code.verifyPasscode('passcode-b');
  const cachedValue2 = cache2.get('admin_token_uuid-1');

  // Both should be hex strings
  assert.equal(typeof cachedValue1, 'string');
  assert.equal(typeof cachedValue2, 'string');
  // Hex strings should match pattern (2 chars per byte)
  assert.match(cachedValue1, /^[0-9a-f]+$/);
  assert.match(cachedValue2, /^[0-9a-f]+$/);
  // Different passcodes should produce different fingerprints
  assert.notEqual(cachedValue1, cachedValue2);
});

test('doGet with page=admin returns whatever serveAdmin_ produces', () => {
  stubUtilities();
  const adminHtml = '<html>Admin Panel</html>';
  global.HtmlService = {
    createTemplateFromFile: (name) => ({
      evaluate: () => ({
        setTitle: (title) => ({
          addMetaTag: (name, content) => adminHtml
        })
      })
    })
  };

  const result = code.doGet({ parameter: { page: 'admin' } });
  assert.equal(result, adminHtml);
});

test('doGet with img=<id> reaches serveImage_ and returns "Not found" for files outside photo root', () => {
  stubUtilities();
  stubScriptProperties({ PHOTO_ROOT_FOLDER_ID: 'ROOT' });
  global.DriveApp = {
    getFileById: () => ({
      getParents: () => iterator([])
    })
  };
  global.ContentService = {
    createTextOutput: (text) => ({
      setMimeType: (mime) => text
    }),
    MimeType: { TEXT: 'text/plain' }
  };

  const result = code.doGet({ parameter: { img: 'some-file-id' } });
  assert.equal(result, 'Not found');
});

test('doGet with no parameters returns content JSON with ok:true and generatedAt', () => {
  stubUtilities();
  const ss = fakeSpreadsheet({
    settings: fakeSheet([['key', 'value']]),
    rooms: fakeSheet([['name'], ['room1']]),
    workexchange_lists: fakeSheet([['list', 'order', 'text_zh', 'text_en']])
  });
  global.SpreadsheetApp = { getActiveSpreadsheet: () => ss };
  global.ContentService = {
    createTextOutput: (json) => ({
      setMimeType: (mime) => JSON.parse(json)
    }),
    MimeType: { JSON: 'application/json' }
  };

  const result = code.doGet({ parameter: {} });
  assert.equal(result.ok, true);
  assert.ok(result.generatedAt, 'generatedAt field is present');
  assert.ok(typeof result.generatedAt === 'string', 'generatedAt is a string');
});

test('doGet with no parameters returns ok:false when buildContentPayload_ throws', () => {
  stubUtilities();
  global.SpreadsheetApp = {
    getActiveSpreadsheet: () => {
      throw new Error('Spreadsheet access failed');
    }
  };
  global.ContentService = {
    createTextOutput: (json) => ({
      setMimeType: (mime) => JSON.parse(json)
    }),
    MimeType: { JSON: 'application/json' }
  };

  const result = code.doGet({ parameter: {} });
  assert.equal(result.ok, false);
  assert.match(result.error, /Spreadsheet access failed/);
});

function authorizedToken() {
  stubScriptProperties({ ADMIN_PASSCODE: 'letmein', PHOTO_ROOT_FOLDER_ID: 'ROOT' });
  stubCache();
  global.Utilities = {
    getUuid: () => 'uuid-1',
    computeDigest: function(algo, input) {
      const bytes = [];
      for (let i = 0; i < 32; i++) {
        bytes.push((input.charCodeAt(i % input.length) + i) % 256 - 128);
      }
      return bytes;
    },
    DigestAlgorithm: { SHA_256: 'sha256' }
  };
  return code.verifyPasscode('letmein').token;
}

test('upsertSettings_ updates existing keys and appends new ones, leaving others alone', () => {
  const sheet = fakeWritableSheet([
    ['key', 'value'],
    ['site_name', '舊站名'],
    ['hero_photos', 'a.jpg']
  ]);
  const ss = fakeWritableSpreadsheet({ settings: sheet });

  code.upsertSettings_(ss, { site_name: '新站名', tagline_en: 'New tagline' });

  assert.deepEqual(sheet.rows[1], ['site_name', '新站名']);
  assert.deepEqual(sheet.rows[2], ['hero_photos', 'a.jpg'], 'photo keys survive a text save');
  assert.deepEqual(sheet.rows[3], ['tagline_en', 'New tagline']);
});

test('upsertSettings_ creates the tab with a header when it is missing', () => {
  const ss = fakeWritableSpreadsheet({});
  code.upsertSettings_(ss, { site_name: 'Rainbowstar' });

  const sheet = ss.getSheetByName('settings');
  assert.deepEqual(sheet.rows[0], ['key', 'value']);
  assert.deepEqual(sheet.rows[1], ['site_name', 'Rainbowstar']);
});

test('writeRooms_ rewrites the tab under the canonical column order', () => {
  const ss = fakeWritableSpreadsheet({ rooms: fakeWritableSheet([['name'], ['舊房型']]) });

  code.writeRooms_(ss, [{ name: '主屋', name_en: 'Dorm', price: 35, photos: 'a.jpg' }]);

  const sheet = ss.getSheetByName('rooms');
  assert.deepEqual(sheet.rows[0], code.ROOM_COLUMNS);
  assert.equal(sheet.rows.length, 2, 'the old room is gone');
  assert.equal(sheet.rows[1][code.ROOM_COLUMNS.indexOf('name')], '主屋');
  assert.equal(sheet.rows[1][code.ROOM_COLUMNS.indexOf('price')], 35);
  assert.equal(sheet.rows[1][code.ROOM_COLUMNS.indexOf('photos')], 'a.jpg');
  assert.equal(sheet.rows[1][code.ROOM_COLUMNS.indexOf('note_en')], '', 'absent fields become empty strings');
});

test('writeLists_ rewrites all three lists with orders renumbered from one', () => {
  const ss = fakeWritableSpreadsheet({});
  code.writeLists_(ss, {
    rules: [{ zh: '第一條', en: 'Rule one' }, { zh: '第二條', en: '' }],
    duties_out: [{ zh: '餵貓', en: 'Feed the cats' }],
    duties_in: []
  });

  const sheet = ss.getSheetByName('workexchange_lists');
  assert.deepEqual(sheet.rows[0], ['list', 'order', 'text_zh', 'text_en']);
  assert.deepEqual(sheet.rows[1], ['rules', 1, '第一條', 'Rule one']);
  assert.deepEqual(sheet.rows[2], ['rules', 2, '第二條', '']);
  assert.deepEqual(sheet.rows[3], ['duties_out', 1, '餵貓', 'Feed the cats']);
  assert.equal(sheet.rows.length, 4);
});

test('loadAdminContent and saveContent and saveList all refuse an invalid token', () => {
  authorizedToken();
  assert.throws(() => code.loadAdminContent('bad'), /未授權/);
  assert.throws(() => code.saveContent('bad', { settings: {}, rooms: [] }), /未授權/);
  assert.throws(() => code.saveList('bad', 'rules', []), /未授權/);
});

test('saveContent writes settings and rooms, then loadAdminContent reads them back', () => {
  const token = authorizedToken();
  const ss = fakeWritableSpreadsheet({});
  global.SpreadsheetApp = { getActiveSpreadsheet: () => ss };

  code.saveContent(token, {
    settings: { site_name: 'Rainbowstar', tagline: '標語' },
    rooms: [{ name: '主屋', price: 35, photos: '' }]
  });

  const loaded = code.loadAdminContent(token);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.settings.site_name, 'Rainbowstar');
  assert.equal(loaded.rooms[0].name, '主屋');
});

test('saveList replaces only the named list and leaves the other two intact', () => {
  const token = authorizedToken();
  const ss = fakeWritableSpreadsheet({
    workexchange_lists: fakeWritableSheet([
      ['list', 'order', 'text_zh', 'text_en'],
      ['rules', 1, '舊規則', 'Old rule'],
      ['duties_in', 1, '清潔', 'Cleaning']
    ])
  });
  global.SpreadsheetApp = { getActiveSpreadsheet: () => ss };

  const result = code.saveList(token, 'rules', [{ zh: '新規則', en: 'New rule' }]);

  assert.equal(result.ok, true);
  const lists = code.__lib.groupLists(code.readListRows_(ss));
  assert.deepEqual(lists.rules, [{ zh: '新規則', en: 'New rule' }]);
  assert.deepEqual(lists.duties_in, [{ zh: '清潔', en: 'Cleaning' }]);
});

test('saveList rejects an unknown list name', () => {
  const token = authorizedToken();
  global.SpreadsheetApp = { getActiveSpreadsheet: () => fakeWritableSpreadsheet({}) };
  assert.throws(() => code.saveList(token, 'nonsense', []), /未知的清單/);
});

// ============================================================================
// Fix: stop publishing the owner's notification address
// ============================================================================

test('PRIVATE_SETTINGS_KEYS is exported and contains notify_email', () => {
  assert.ok(code.PRIVATE_SETTINGS_KEYS);
  assert.ok(Array.isArray(code.PRIVATE_SETTINGS_KEYS));
  assert.ok(code.PRIVATE_SETTINGS_KEYS.indexOf('notify_email') >= 0);
});

test('buildContentPayload_(ss) without second argument omits notify_email but keeps contact_email and site_name', () => {
  const ss = fakeSpreadsheet({
    settings: fakeSheet([
      ['key', 'value'],
      ['site_name', 'Rainbowstar'],
      ['contact_email', 'public@example.com'],
      ['notify_email', 'owner@example.com']
    ]),
    rooms: fakeSheet([['name']]),
    workexchange_lists: fakeSheet([['list', 'order', 'text_zh', 'text_en']])
  });
  const payload = code.buildContentPayload_(ss);
  assert.equal(payload.settings.site_name, 'Rainbowstar', 'site_name is present');
  assert.equal(payload.settings.contact_email, 'public@example.com', 'contact_email is present');
  assert.equal(payload.settings.notify_email, undefined, 'notify_email is omitted');
});

test('buildContentPayload_(ss, true) includes notify_email', () => {
  const ss = fakeSpreadsheet({
    settings: fakeSheet([
      ['key', 'value'],
      ['site_name', 'Rainbowstar'],
      ['notify_email', 'owner@example.com']
    ]),
    rooms: fakeSheet([['name']]),
    workexchange_lists: fakeSheet([['list', 'order', 'text_zh', 'text_en']])
  });
  const payload = code.buildContentPayload_(ss, true);
  assert.equal(payload.settings.site_name, 'Rainbowstar');
  assert.equal(payload.settings.notify_email, 'owner@example.com', 'notify_email is present');
});

test('buildContentPayload_(ss) does not mutate what readSettings_(ss) returns', () => {
  const ss = fakeSpreadsheet({
    settings: fakeSheet([
      ['key', 'value'],
      ['site_name', 'Rainbowstar'],
      ['notify_email', 'owner@example.com']
    ]),
    rooms: fakeSheet([['name']]),
    workexchange_lists: fakeSheet([['list', 'order', 'text_zh', 'text_en']])
  });

  // Call buildContentPayload_ which filters notify_email
  const payload = code.buildContentPayload_(ss);
  assert.equal(payload.settings.notify_email, undefined, 'filtered payload has no notify_email');

  // Read the settings again directly
  const freshSettings = code.readSettings_(ss);
  assert.equal(freshSettings.notify_email, 'owner@example.com', 'fresh read still has notify_email');
});

test('doGet with no parameters returns JSON whose settings has no notify_email', () => {
  const ss = fakeSpreadsheet({
    settings: fakeSheet([
      ['key', 'value'],
      ['site_name', 'Rainbowstar'],
      ['notify_email', 'owner@example.com'],
      ['contact_email', 'public@example.com']
    ]),
    rooms: fakeSheet([['name']]),
    workexchange_lists: fakeSheet([['list', 'order', 'text_zh', 'text_en']])
  });
  global.SpreadsheetApp = { getActiveSpreadsheet: () => ss };
  global.ContentService = {
    createTextOutput: (json) => ({
      setMimeType: (mime) => JSON.parse(json)
    }),
    MimeType: { JSON: 'application/json' }
  };

  const result = code.doGet({ parameter: {} });
  assert.equal(result.ok, true);
  assert.equal(result.settings.site_name, 'Rainbowstar', 'site_name is in response');
  assert.equal(result.settings.contact_email, 'public@example.com', 'contact_email is in response');
  assert.equal(result.settings.notify_email, undefined, 'notify_email is not in public response');
});

test('loadAdminContent(validToken) returns settings that includes notify_email', () => {
  const token = authorizedToken();
  const ss = fakeSpreadsheet({
    settings: fakeSheet([
      ['key', 'value'],
      ['site_name', 'Rainbowstar'],
      ['notify_email', 'owner@example.com']
    ]),
    rooms: fakeSheet([['name']]),
    workexchange_lists: fakeSheet([['list', 'order', 'text_zh', 'text_en']])
  });
  global.SpreadsheetApp = { getActiveSpreadsheet: () => ss };

  const result = code.loadAdminContent(token);
  assert.equal(result.ok, true);
  assert.equal(result.settings.notify_email, 'owner@example.com', 'admin sees notify_email');
});

test('sendNotifyEmail_ still sends to the address in notify_email', () => {
  const settings = { notify_email: 'owner@example.com' };
  const sent = [];
  global.MailApp = { sendEmail: (to, subject, body, opts) => sent.push({ to, subject, body, opts }) };
  global.Session = { getEffectiveUser: () => ({ getEmail: () => 'fallback@example.com' }) };

  // Call sendNotifyEmail_ with minimal fields to trigger email send
  code.sendNotifyEmail_(settings, 'accommodation', [], (k) => '', '');

  assert.equal(sent.length, 1, 'one email sent');
  assert.equal(sent[0].to, 'owner@example.com', 'email sent to notify_email address');
});

test('settingsKeyForSection_ maps the hero and scenery sections, and nothing else', () => {
  assert.equal(code.settingsKeyForSection_('hero'), 'hero_photos');
  assert.equal(code.settingsKeyForSection_('scenery-2'), 'scenery2_photos');
  assert.equal(code.settingsKeyForSection_('room-0'), null);
  assert.equal(code.settingsKeyForSection_('nonsense'), null);
});

test('readPhotoUrls_ reads the hero list out of settings', () => {
  const ss = fakeWritableSpreadsheet({
    settings: fakeWritableSheet([['key', 'value'], ['hero_photos', 'a.jpg\nb.jpg']])
  });
  assert.deepEqual(code.readPhotoUrls_(ss, 'hero'), ['a.jpg', 'b.jpg']);
});

test('readPhotoUrls_ reads a room photo list by row index', () => {
  const ss = fakeWritableSpreadsheet({
    rooms: fakeWritableSheet([['name', 'photos'], ['主屋', 'x.jpg'], ['帳棚', 'y.jpg\nz.jpg']])
  });
  assert.deepEqual(code.readPhotoUrls_(ss, 'room-1'), ['y.jpg', 'z.jpg']);
});

test('readPhotoUrls_ returns an empty array for an out-of-range room', () => {
  const ss = fakeWritableSpreadsheet({ rooms: fakeWritableSheet([['name', 'photos']]) });
  assert.deepEqual(code.readPhotoUrls_(ss, 'room-9'), []);
});

test('writePhotoUrls_ stores the hero list back into settings', () => {
  const ss = fakeWritableSpreadsheet({ settings: fakeWritableSheet([['key', 'value']]) });
  code.writePhotoUrls_(ss, 'hero', ['a.jpg', 'b.jpg']);
  assert.deepEqual(code.readPhotoUrls_(ss, 'hero'), ['a.jpg', 'b.jpg']);
});

test('writePhotoUrls_ stores a room list without disturbing its neighbour', () => {
  const ss = fakeWritableSpreadsheet({
    rooms: fakeWritableSheet([['name', 'photos'], ['主屋', 'x.jpg'], ['帳棚', 'y.jpg']])
  });
  code.writePhotoUrls_(ss, 'room-0', ['new.jpg']);
  assert.deepEqual(code.readPhotoUrls_(ss, 'room-0'), ['new.jpg']);
  assert.deepEqual(code.readPhotoUrls_(ss, 'room-1'), ['y.jpg']);
});

/** Minimal DriveApp stand-in: records created files, hands back stable ids. */
function stubDrive() {
  const created = [];
  const subfolders = new Map();
  const trashed = [];

  const makeFolder = (id, name) => ({
    getId: () => id,
    getName: () => name,
    getFoldersByName: (childName) => {
      const found = subfolders.get(childName);
      return { hasNext: () => Boolean(found), next: () => found };
    },
    createFolder: (childName) => {
      const child = makeFolder('FOLDER_' + childName, childName);
      subfolders.set(childName, child);
      return child;
    },
    createFile: (blob) => {
      const fileId = 'FILE' + (created.length + 1);
      const file = {
        getId: () => fileId,
        setSharing: () => file,
        setTrashed: (v) => trashed.push(file.getId()) && file
      };
      created.push({ blob, file });
      return file;
    }
  });

  const root = makeFolder('ROOT', 'Rainbowstar Photos');
  const iterator = (items) => { let i = 0; return { hasNext: () => i < items.length, next: () => items[i++] }; };

  global.DriveApp = {
    getFolderById: (id) => (id === 'ROOT' ? root : (() => { throw new Error('no folder ' + id); })()),
    // By default every file lives under the photo root, so trashPhotoFile_'s
    // scope check passes. Tests that need a file outside it override this.
    getFileById: (id) => ({
      getParents: () => iterator([root]),
      setTrashed: () => trashed.push(id)
    }),
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
    Permission: { VIEW: 'VIEW' }
  };
  global.Utilities = Object.assign({}, global.Utilities, {
    base64Decode: (s) => Buffer.from(s, 'base64'),
    newBlob: (bytes, mimeType, name) => ({ bytes, mimeType, name, setName: () => {} })
  });
  return { created, trashed };
}

test('uploadPhoto appends the new photo URL and returns the whole list', () => {
  const token = authorizedToken();
  const ss = fakeWritableSpreadsheet({ settings: fakeWritableSheet([['key', 'value'], ['hero_photos', 'old.jpg']]) });
  global.SpreadsheetApp = { getActiveSpreadsheet: () => ss };
  stubDrive();

  const result = code.uploadPhoto(token, 'hero', 'farm.jpg', 'aGVsbG8=', 'image/jpeg');

  assert.equal(result.ok, true);
  assert.deepEqual(result.urls, ['old.jpg', code.photoUrlFor_('FILE1')]);
  assert.deepEqual(code.readPhotoUrls_(ss, 'hero'), result.urls);
});

test('deletePhoto removes the URL from the sheet and trashes the Drive file', () => {
  const token = authorizedToken();
  const url = code.photoUrlFor_('FILE9');
  const ss = fakeWritableSpreadsheet({
    settings: fakeWritableSheet([['key', 'value'], ['hero_photos', 'keep.jpg\n' + url]])
  });
  global.SpreadsheetApp = { getActiveSpreadsheet: () => ss };
  const drive = stubDrive();

  const result = code.deletePhoto(token, 'hero', url);

  assert.deepEqual(result.urls, ['keep.jpg']);
  assert.deepEqual(drive.trashed, ['FILE9']);
});

test('deletePhoto still updates the sheet when the Drive file is already gone', () => {
  const token = authorizedToken();
  const ss = fakeWritableSpreadsheet({
    settings: fakeWritableSheet([['key', 'value'], ['hero_photos', 'a.jpg\nb.jpg']])
  });
  global.SpreadsheetApp = { getActiveSpreadsheet: () => ss };
  stubDrive();
  global.DriveApp.getFileById = () => { throw new Error('gone'); };

  assert.deepEqual(code.deletePhoto(token, 'hero', 'a.jpg').urls, ['b.jpg']);
});

test('deletePhoto will not trash a file the section does not list', () => {
  const token = authorizedToken();
  const ss = fakeWritableSpreadsheet({
    settings: fakeWritableSheet([['key', 'value'], ['hero_photos', 'keep.jpg']])
  });
  global.SpreadsheetApp = { getActiveSpreadsheet: () => ss };
  const drive = stubDrive();

  // A URL naming a real file that simply is not one of this section's photos.
  const result = code.deletePhoto(token, 'hero', code.photoUrlFor_('SOMEONE_ELSES_FILE'));

  assert.deepEqual(result.urls, ['keep.jpg'], 'the listed photo survives');
  assert.deepEqual(drive.trashed, [], 'nothing was trashed');
});

test('deletePhoto will not trash a listed file that lives outside the photo root', () => {
  const token = authorizedToken();
  const url = code.photoUrlFor_('OUTSIDE');
  const ss = fakeWritableSpreadsheet({
    settings: fakeWritableSheet([['key', 'value'], ['hero_photos', url]])
  });
  global.SpreadsheetApp = { getActiveSpreadsheet: () => ss };
  const drive = stubDrive();

  // The file exists and is listed, but its parent chain never reaches the root.
  const iterator = (items) => { let i = 0; return { hasNext: () => i < items.length, next: () => items[i++] }; };
  global.DriveApp.getFileById = () => ({
    getParents: () => iterator([{ getId: () => 'ELSEWHERE', getParents: () => iterator([]) }]),
    setTrashed: () => drive.trashed.push('OUTSIDE')
  });

  const result = code.deletePhoto(token, 'hero', url);

  assert.deepEqual(result.urls, [], 'the sheet still forgets the photo');
  assert.deepEqual(drive.trashed, [], 'but the file outside the photo root is untouched');
});

test('reorderPhotos keeps only URLs that already exist, in the given order', () => {
  const token = authorizedToken();
  const ss = fakeWritableSpreadsheet({
    settings: fakeWritableSheet([['key', 'value'], ['hero_photos', 'a.jpg\nb.jpg\nc.jpg']])
  });
  global.SpreadsheetApp = { getActiveSpreadsheet: () => ss };
  stubDrive();

  const result = code.reorderPhotos(token, 'hero', ['c.jpg', 'a.jpg', 'intruder.jpg']);

  assert.deepEqual(result.urls, ['c.jpg', 'a.jpg']);
});

test('every photo function refuses an invalid token', () => {
  authorizedToken();
  assert.throws(() => code.uploadPhoto('bad', 'hero', 'a.jpg', 'x', 'image/jpeg'), /未授權/);
  assert.throws(() => code.deletePhoto('bad', 'hero', 'a.jpg'), /未授權/);
  assert.throws(() => code.reorderPhotos('bad', 'hero', []), /未授權/);
});

test('uploadPhoto rejects an unknown section rather than writing nowhere', () => {
  const token = authorizedToken();
  global.SpreadsheetApp = { getActiveSpreadsheet: () => fakeWritableSpreadsheet({}) };
  stubDrive();
  assert.throws(() => code.uploadPhoto(token, 'nonsense', 'a.jpg', 'x', 'image/jpeg'), /未知的區塊/);
});
