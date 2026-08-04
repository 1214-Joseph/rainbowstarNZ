/**
 * Rainbowstar 彩虹星民宿 — Google Apps Script back end.
 *
 *   doGet()                     -> public content JSON for the website
 *   doGet(?page=admin)          -> the passcode-protected admin panel
 *   doGet(?img=<fileId>)        -> a scoped image proxy (fallback for Drive CDN links)
 *   doPost()                    -> a form submission: append a row, email the owner
 *   google.script.run functions -> the admin panel's server side
 *
 * The script is bound to the content spreadsheet. Every reader and writer takes
 * `ss` as a parameter so it can be exercised with a fake spreadsheet in tests;
 * only the outermost entry points reach for the real one.
 */
'use strict';

var SHEET_SETTINGS = 'settings';
var SHEET_ROOMS = 'rooms';
var SHEET_WORK_ROOMS = 'work_rooms';
var SHEET_LISTS = 'workexchange_lists';
var SHEET_STAY = '住宿申請';
var SHEET_WORK = '換宿申請';
var SHEET_SERVICES = '其他服務申請';
var SHEET_SCHEDULE = '排程總覽';
var SHEET_ERRORS = 'errors';

var SCHEDULE_COLUMNS = [
  ['id', '申請編號'], ['submitted_at', '申請時間'], ['start_date', '服務日期'], ['end_date', '結束日期'],
  ['type', '申請類型'], ['items', '申請項目'], ['applicant', '申請人'], ['email', 'Email'],
  ['phone', '聯絡電話'], ['vehicle_plate', '車牌號碼'], ['details', '詳細內容'], ['photo_url', '本人照片'],
  ['status', '狀態'], ['flag', '資料檢查']
];

/** Settings keys the public content endpoint must never disclose. */
var PRIVATE_SETTINGS_KEYS = ['notify_email'];

/** Reads the settings tab's A/B columns into a plain key-value object. */
function readSettings_(ss) {
  var sheet = ss.getSheetByName(SHEET_SETTINGS);
  var settings = {};
  if (!sheet || sheet.getLastRow() < 1) return settings;

  sheet.getDataRange().getValues().forEach(function (row) {
    var key = String(row[0] || '').trim();
    if (!key || key.toLowerCase() === 'key') return;
    settings[key] = row[1];
  });
  return settings;
}

/** Reads a header-driven tab into an array of objects, skipping blank rows. */
function readTableRows_(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];

  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function (h) { return String(h || '').trim(); });
  var rows = [];

  for (var i = 1; i < values.length; i++) {
    var isBlankRow = values[i].every(function (cell) { return cell === '' || cell === null; });
    if (isBlankRow) continue;

    var row = {};
    for (var j = 0; j < headers.length; j++) {
      if (headers[j]) row[headers[j]] = values[i][j];
    }
    rows.push(row);
  }
  return rows;
}

function readRooms_(ss) {
  return readTableRows_(ss, SHEET_ROOMS);
}

function readWorkRooms_(ss) {
  return readTableRows_(ss, SHEET_WORK_ROOMS);
}

function readListRows_(ss) {
  return readTableRows_(ss, SHEET_LISTS);
}

function readSchedule_(ss) {
  var rows = readTableRows_(ss, SHEET_SCHEDULE);
  return rows.map(function (row) {
    var entry = {};
    SCHEDULE_COLUMNS.forEach(function (field) {
      var value = row[field[1]];
      entry[field[0]] = field[0] === 'submitted_at' && value instanceof Date ? value.toISOString() : value;
    });
    return entry;
  }).sort(compareScheduleEntries);
}

function buildContentPayload_(ss, includePrivate) {
  var allSettings = readSettings_(ss);
  var settingsToReturn = allSettings;

  if (!includePrivate) {
    // Build a fresh copy, excluding private keys
    settingsToReturn = {};
    for (var key in allSettings) {
      if (allSettings.hasOwnProperty(key) && PRIVATE_SETTINGS_KEYS.indexOf(key) < 0) {
        settingsToReturn[key] = allSettings[key];
      }
    }
  }

  var lists = groupLists(readListRows_(ss));
  var payload = {
    ok: true,
    settings: settingsToReturn,
    rooms: readRooms_(ss),
    work_rooms: readWorkRooms_(ss),
    rules: lists.rules,
    duties_out: lists.duties_out,
    duties_in: lists.duties_in
  };
  if (includePrivate) payload.schedule = readSchedule_(ss);
  return payload;
}

function ensureHeader_(sheet, expectedHeader) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(expectedHeader);
    return expectedHeader.slice();
  }

  var values = sheet.getDataRange().getValues();
  var existingHeader = values[0] || [];
  var expectedLabels = {};
  expectedHeader.forEach(function (label) { expectedLabels[String(label || '').trim()] = true; });
  var legacyLabels = existingHeader.filter(function (label) {
    var normalized = String(label || '').trim();
    return normalized && !expectedLabels[normalized];
  });
  var targetHeader = expectedHeader.concat(legacyLabels);
  if (!headerNeedsUpdate(existingHeader, targetHeader)) return targetHeader;

  var indexByLabel = {};
  existingHeader.forEach(function (label, index) { indexByLabel[String(label || '').trim()] = index; });
  var migrated = [targetHeader.slice()];
  values.slice(1).forEach(function (row) {
    migrated.push(targetHeader.map(function (label) {
      var oldIndex = indexByLabel[label];
      return oldIndex === undefined ? '' : row[oldIndex];
    }));
  });

  sheet.clear();
  sheet.getRange(1, 1, migrated.length, targetHeader.length).setValues(migrated);
  return targetHeader;
}

/**
 * Appends one submission. Creates the tab on first use, and repairs the header
 * row whenever it no longer matches the field list, so a later reordering of
 * ACCOM_FIELDS cannot silently misalign every column.
 */
function appendResponse_(ss, sheetName, fields, get, timestamp, flag) {
  return withDataLock_(function () {
    var sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
    var expectedHeader = buildHeaderRow(fields);
    var actualHeader = ensureHeader_(sheet, expectedHeader);
    var applicationId = String(get('application_id') || '');
    var idColumn = actualHeader.indexOf('申請編號');
    if (applicationId && idColumn >= 0) {
      var existingRows = sheet.getDataRange().getValues().slice(1);
      if (existingRows.some(function (existing) { return String(existing[idColumn]) === applicationId; })) return false;
    }
    var row = buildResponseRow(fields, get, timestamp, flag);
    while (row.length < actualHeader.length) row.push('');
    sheet.appendRow(row);
    return true;
  });
}

function responseApplicationExists_(ss, sheetName, applicationId) {
  return Boolean(readResponseApplication_(ss, sheetName, [], applicationId));
}

function readResponseApplication_(ss, sheetName, fields, applicationId) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2 || !applicationId) return null;
  var values = sheet.getDataRange().getValues();
  var header = values[0] || [];
  var idColumn = header.indexOf('申請編號');
  if (idColumn < 0) return null;
  var matched = values.slice(1).filter(function (row) {
    return String(row[idColumn]) === String(applicationId);
  })[0];
  if (!matched) return null;

  var response = { _timestamp: matched[header.indexOf('時間')], _flag: matched[header.indexOf('資料檢查')] };
  (fields || []).forEach(function (field) {
    var column = header.indexOf(field[1]);
    response[field[0]] = column < 0 ? '' : matched[column];
  });
  return response;
}

function scheduleRow_(entry) {
  return SCHEDULE_COLUMNS.map(function (field) { return sheetSafeValue_(entry[field[0]]); });
}

/** Prevents concurrent web-app submissions or admin edits from overwriting sheet rewrites. */
function withDataLock_(callback) {
  if (typeof LockService === 'undefined') return callback();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return callback();
  } finally {
    try {
      if (typeof SpreadsheetApp !== 'undefined' && SpreadsheetApp.flush) SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
  }
}

function appendSchedule_(ss, entry) {
  return withDataLock_(function () {
    var sheet = ss.getSheetByName(SHEET_SCHEDULE) || ss.insertSheet(SHEET_SCHEDULE);
    var header = SCHEDULE_COLUMNS.map(function (field) { return field[1]; });
    var actualHeader = ensureHeader_(sheet, header);
    var existingValues = sheet.getDataRange().getValues();
    var idColumn = actualHeader.indexOf('申請編號');
    if (idColumn >= 0 && existingValues.slice(1).some(function (row) {
      return String(row[idColumn]) === String(entry.id);
    })) return false;
    var newRow = scheduleRow_(entry);
    while (newRow.length < actualHeader.length) newRow.push('');
    sheet.appendRow(newRow);

    var values = sheet.getDataRange().getValues();
    var indexByLabel = {};
    actualHeader.forEach(function (label, index) { indexByLabel[label] = index; });
    var rows = values.slice(1).sort(function (a, b) {
      function entryFor(row) {
        var out = {};
        SCHEDULE_COLUMNS.forEach(function (field) { out[field[0]] = row[indexByLabel[field[1]]]; });
        return out;
      }
      return compareScheduleEntries(entryFor(a), entryFor(b));
    });
    var table = [actualHeader].concat(rows);
    sheet.clear();
    sheet.getRange(1, 1, table.length, actualHeader.length).setValues(table);
    return true;
  });
}

function appendScheduleBestEffort_(ss, entry) {
  try {
    appendSchedule_(ss, entry);
    return true;
  } catch (error) {
    try { logError_(ss, 'schedule', error); } catch (logErr) { /* best effort */ }
    return false;
  }
}

function applicationId_(timestamp, type, clientId) {
  var supplied = String(clientId || '').trim().replace(/[^A-Za-z0-9._-]+/g, '').slice(0, 100);
  if (supplied) return type + '-' + supplied;
  if (typeof Utilities !== 'undefined' && Utilities.getUuid) return Utilities.getUuid();
  return type + '-' + timestamp.getTime();
}

function sendNotifyEmail_(settings, type, fields, get, flag) {
  var to = String(settings.notify_email || Session.getEffectiveUser().getEmail() || '').trim();
  if (!to) return;

  var options = {};
  var replyTo = String(get('email') || '').trim();
  if (isValidEmail(replyTo)) options.replyTo = replyTo;

  MailApp.sendEmail(to, buildEmailSubject(type, get, flag), buildEmailBody(type, fields, get, flag), options);
}

/**
 * Logs an error to the errors sheet. Creates the sheet on first use and ensures
 * the header row is present. The timestamp is added automatically.
 */
function logError_(ss, context, detail) {
  var sheet = ss.getSheetByName(SHEET_ERRORS) || ss.insertSheet(SHEET_ERRORS);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['時間', '情境', '詳情']);
  }

  sheet.appendRow([new Date(), context, String(detail)]);
}

/**
 * The testable core of doPost.
 *
 * It never rejects. The visitor may be posting with mode:'no-cors', in which
 * case the browser cannot read this result at all and would report success
 * regardless — so a rejection here would silently lose a real enquiry.
 */
function handlePost_(ss, e, timestamp) {
  var parameter = (e && e.parameter) || {};
  var parameters = (e && e.parameters) || {};

  // Check if the type is present but unrecognised.
  var typeValue = String(parameter.type || '').trim();
  if (typeValue && ['workexchange', 'accommodation', 'services'].indexOf(typeValue) < 0) {
    try {
      logError_(ss, 'unknown type', typeValue);
    } catch (logErr) {
      // Swallowed: if the error log fails, we must not turn one failure into two.
    }
  }

  var type = parameter.type === 'workexchange' ? 'workexchange'
    : (parameter.type === 'services' ? 'services' : 'accommodation');
  var fields = type === 'workexchange' ? WORK_FIELDS : (type === 'services' ? SERVICE_FIELDS : ACCOM_FIELDS);
  var sheetName = type === 'workexchange' ? SHEET_WORK : (type === 'services' ? SHEET_SERVICES : SHEET_STAY);
  var overrides = {};
  var get = function (key) {
    return overrides.hasOwnProperty(key) ? overrides[key] : joinMultiValue(parameters, parameter, key);
  };
  overrides.application_id = applicationId_(timestamp, type, parameter.application_id);
  var applicantPhotoUrl = '';
  var responseRecorded = false;

  try {
    var flag = checkSuspicious(get);
    var scheduleEntry = buildScheduleEntry(type, get, timestamp, flag, overrides.application_id);
    function scheduleFromStoredResponse_(stored) {
      var storedGet = function (key) {
        return stored && stored.hasOwnProperty(key) ? stored[key] : get(key);
      };
      return buildScheduleEntry(type, storedGet, (stored && stored._timestamp) || timestamp,
        (stored && stored._flag) || flag, overrides.application_id);
    }

    // A readable fetch may be retried after a connection interruption. Reuse the
    // client ID so the same application cannot create duplicate rows or photos.
    var existingResponse = readResponseApplication_(ss, sheetName, fields, overrides.application_id);
    if (existingResponse) {
      appendScheduleBestEffort_(ss, scheduleFromStoredResponse_(existingResponse));
      return { ok: true, message: '申請已送出 / Application received', duplicate: true };
    }

    if (type === 'workexchange') {
      applicantPhotoUrl = storeApplicantPhoto_(parameter);
      overrides.photo_url = applicantPhotoUrl;
      scheduleEntry = buildScheduleEntry(type, get, timestamp, flag, overrides.application_id);
    }
    responseRecorded = appendResponse_(ss, sheetName, fields, get, timestamp, flag);
    if (!responseRecorded) {
      if (applicantPhotoUrl) trashPhotoFile_(ss, applicantPhotoUrl);
      appendScheduleBestEffort_(ss, scheduleFromStoredResponse_(
        readResponseApplication_(ss, sheetName, fields, overrides.application_id)
      ));
      return { ok: true, message: '申請已送出 / Application received', duplicate: true };
    }

    // The response row is the durable source of truth. A temporary schedule-sort
    // error is logged but must not tell the visitor to retry and duplicate it.
    appendScheduleBestEffort_(ss, scheduleEntry);

    // Email is best effort. A quota error must never lose the recorded row.
    try {
      sendNotifyEmail_(readSettings_(ss), type, fields, get, flag);
    } catch (mailError) {
      // Intentionally swallowed; the row is already safe in the sheet.
    }

    return { ok: true, message: '申請已送出 / Application received' };
  } catch (error) {
    if (applicantPhotoUrl && !responseRecorded) trashPhotoFile_(ss, applicantPhotoUrl);
    // Log the error before returning, but swallow any failure of the error log itself.
    try {
      logError_(ss, 'doPost', error);
    } catch (logErr) {
      // Swallowed: if the error log fails, we must not turn one failure into two.
    }
    return { ok: false, error: String(error) };
  }
}

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return jsonOutput_(handlePost_(ss, e, new Date()));
}

function jsonOutput_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

var ADMIN_TOKEN_TTL_SECONDS = 6 * 60 * 60;
var PHOTO_CDN_PREFIX = 'https://lh3.googleusercontent.com/d/';

function scriptProperty_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

/**
 * Computes a hex fingerprint of a passcode for token validation.
 *
 * Returns an empty string for an absent or empty passcode.
 * Otherwise returns a hex string computed via SHA-256 digest.
 * Each signed byte is masked with & 0xff before converting to hex.
 */
function passcodeFingerprint_(passcode) {
  if (!passcode) return '';

  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(passcode));
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var byte = bytes[i] & 0xff;
    hex += (byte < 16 ? '0' : '') + byte.toString(16);
  }
  return hex;
}

/**
 * The only admin function that does not require a token.
 *
 * A shared passcode buys a short-lived session token that lives in the script
 * cache, so the passcode itself is not replayed on every later call.
 */
function verifyPasscode(passcode) {
  var expected = scriptProperty_('ADMIN_PASSCODE');
  if (!expected || !passcode || String(passcode) !== String(expected)) return { ok: false };

  var token = Utilities.getUuid();
  var fingerprint = passcodeFingerprint_(expected);
  CacheService.getScriptCache().put('admin_token_' + token, fingerprint, ADMIN_TOKEN_TTL_SECONDS);
  return { ok: true, token: token };
}

/**
 * Every other google.script.run function must call this first.
 *
 * The web app is deployed for "Anyone", so any visitor who loads ?page=admin can
 * invoke these functions straight from the browser console. Same origin is not
 * authorisation.
 *
 * A token is valid only if:
 * 1. It is not falsy
 * 2. It exists in the cache
 * 3. ADMIN_PASSCODE is currently set
 * 4. The cached value matches the fingerprint of the current ADMIN_PASSCODE
 */
function assertAuthorized_(token) {
  if (!token) {
    throw new Error('未授權 Unauthorized');
  }

  var currentPasscode = scriptProperty_('ADMIN_PASSCODE');
  if (!currentPasscode) {
    throw new Error('未授權 Unauthorized');
  }

  var currentFingerprint = passcodeFingerprint_(currentPasscode);
  var cachedValue = CacheService.getScriptCache().get('admin_token_' + token);

  if (!cachedValue || cachedValue !== currentFingerprint) {
    throw new Error('未授權 Unauthorized');
  }
}

/**
 * Revokes a token by removing it from the cache.
 *
 * Returns {ok: true} whether the token existed or not.
 * No passcode or authorization required; knowing a token is sufficient to discard it.
 */
function revokeToken(token) {
  CacheService.getScriptCache().remove('admin_token_' + token);
  return { ok: true };
}

function photoUrlFor_(fileId) {
  return PHOTO_CDN_PREFIX + fileId + '=w1600';
}

function fileIdFromUrl_(url) {
  var value = String(url || '');
  function validId(raw) {
    try {
      var decoded = decodeURIComponent(String(raw || ''));
      return /^[A-Za-z0-9_-]+$/.test(decoded) ? decoded : null;
    } catch (error) {
      return null;
    }
  }
  var cdn = value.indexOf(PHOTO_CDN_PREFIX);
  if (cdn === 0) return validId(value.slice(PHOTO_CDN_PREFIX.length).split('=')[0]);

  var proxy = value.match(/[?&]img=([^&]+)/);
  if (proxy) return validId(proxy[1]);

  var drivePrefix = 'https://drive.google.com/open?';
  if (value.indexOf(drivePrefix) === 0) {
    var drive = value.slice(drivePrefix.length).match(/(?:^|&)id=([^&#]+)/);
    if (drive) return validId(drive[1]);
  }

  return null;
}

/** Walks a file's parent chain looking for the configured photo root folder. */
function isInsidePhotoRoot_(file, rootFolderId) {
  if (!rootFolderId) return false;

  var seen = {};
  var queue = [];
  var parents = file.getParents();
  while (parents.hasNext()) queue.push(parents.next());

  while (queue.length) {
    var folder = queue.shift();
    var id = folder.getId();
    if (id === rootFolderId) return true;
    if (seen[id]) continue;
    seen[id] = true;

    var grandparents = folder.getParents();
    while (grandparents.hasNext()) queue.push(grandparents.next());
  }
  return false;
}

/**
 * Serves a photo's bytes. Scoped to the photo folder on purpose: without this
 * check the endpoint would proxy any Drive file the owner can read.
 */
function serveImage_(fileId) {
  var rootFolderId = scriptProperty_('PHOTO_ROOT_FOLDER_ID');
  try {
    var file = DriveApp.getFileById(fileId);
    if (!isInsidePhotoRoot_(file, rootFolderId)) {
      return ContentService.createTextOutput('Not found').setMimeType(ContentService.MimeType.TEXT);
    }
    return file.getBlob();
  } catch (error) {
    return ContentService.createTextOutput('Not found').setMimeType(ContentService.MimeType.TEXT);
  }
}

var ROOM_COLUMNS = [
  'name', 'name_en', 'description', 'description_en',
  'price', 'unit', 'unit_en', 'note', 'note_en', 'photos'
];
var WORK_ROOM_COLUMNS = ['name', 'name_en', 'description', 'description_en', 'photos'];
var LIST_COLUMNS = ['list', 'order', 'text_zh', 'text_en'];

function sheetOrCreate_(ss, name, header) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (header) sheet.appendRow(header);
  }
  return sheet;
}

/**
 * Updates the given keys in place and appends the rest.
 *
 * Photo keys such as hero_photos live in this same tab but are maintained by
 * the photo functions, so a text save must not rewrite the whole sheet.
 */
function upsertSettings_(ss, settings) {
  var sheet = sheetOrCreate_(ss, SHEET_SETTINGS, ['key', 'value']);
  var values = sheet.getLastRow() ? sheet.getDataRange().getValues() : [];

  var rowByKey = {};
  for (var i = 0; i < values.length; i++) {
    var key = String(values[i][0] || '').trim();
    if (key && key.toLowerCase() !== 'key') rowByKey[key] = i + 1;
  }

  Object.keys(settings).forEach(function (key) {
    var value = settings[key] === undefined || settings[key] === null ? '' : settings[key];
    if (rowByKey[key]) {
      sheet.getRange(rowByKey[key], 2, 1, 1).setValue(value);
    } else {
      sheet.appendRow([key, value]);
    }
  });
}

function writeRooms_(ss, rooms) {
  var sheet = sheetOrCreate_(ss, SHEET_ROOMS, null);
  sheet.clear();

  var table = [ROOM_COLUMNS.slice()];
  (rooms || []).forEach(function (room) {
    table.push(ROOM_COLUMNS.map(function (column) {
      var value = room[column];
      return value === undefined || value === null ? '' : value;
    }));
  });
  sheet.getRange(1, 1, table.length, ROOM_COLUMNS.length).setValues(table);
}

function writeWorkRooms_(ss, rooms) {
  var sheet = sheetOrCreate_(ss, SHEET_WORK_ROOMS, null);
  sheet.clear();

  var table = [WORK_ROOM_COLUMNS.slice()];
  (rooms || []).forEach(function (room) {
    table.push(WORK_ROOM_COLUMNS.map(function (column) {
      var value = room[column];
      return value === undefined || value === null ? '' : value;
    }));
  });
  sheet.getRange(1, 1, table.length, WORK_ROOM_COLUMNS.length).setValues(table);
}

function writeLists_(ss, lists) {
  var sheet = sheetOrCreate_(ss, SHEET_LISTS, null);
  sheet.clear();

  var table = [LIST_COLUMNS.slice()];
  LIST_NAMES.forEach(function (listName) {
    listRowsFrom(listName, lists[listName] || []).forEach(function (row) {
      table.push(row);
    });
  });
  sheet.getRange(1, 1, table.length, LIST_COLUMNS.length).setValues(table);
}

function loadAdminContent(token) {
  assertAuthorized_(token);
  return buildContentPayload_(SpreadsheetApp.getActiveSpreadsheet(), true);
}

function saveContent(token, payload) {
  assertAuthorized_(token);
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  if (payload && payload.settings) upsertSettings_(ss, payload.settings);
  if (payload && payload.rooms) writeRooms_(ss, payload.rooms);
  if (payload && payload.work_rooms) writeWorkRooms_(ss, payload.work_rooms);

  return { ok: true };
}

var SCHEDULE_STATUSES = ['新申請', '已聯絡', '已確認', '已取消'];

function updateScheduleStatus(token, applicationId, status) {
  assertAuthorized_(token);
  if (SCHEDULE_STATUSES.indexOf(status) < 0) throw new Error('未知的狀態 Unknown status: ' + status);

  return withDataLock_(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_SCHEDULE);
    if (!sheet || sheet.getLastRow() < 2) throw new Error('找不到申請 Application not found');

    var values = sheet.getDataRange().getValues();
    var idColumn = values[0].indexOf('申請編號');
    var statusColumn = values[0].indexOf('狀態');
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][idColumn]) === String(applicationId)) {
        sheet.getRange(i + 1, statusColumn + 1, 1, 1).setValue(status);
        return { ok: true, id: applicationId, status: status };
      }
    }
    throw new Error('找不到申請 Application not found');
  });
}

function saveList(token, listName, items) {
  assertAuthorized_(token);
  if (LIST_NAMES.indexOf(listName) < 0) throw new Error('未知的清單 Unknown list: ' + listName);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lists = groupLists(readListRows_(ss));
  lists[listName] = items || [];
  writeLists_(ss, lists);

  return { ok: true, items: lists[listName] };
}

function serveAdmin_() {
  return HtmlService.createTemplateFromFile('Admin')
    .evaluate()
    .setTitle('彩虹星民宿 — 網站後台')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doGet(e) {
  var parameter = (e && e.parameter) || {};

  if (parameter.page === 'admin') return serveAdmin_();
  if (parameter.img) return serveImage_(parameter.img);

  try {
    var payload = buildContentPayload_(SpreadsheetApp.getActiveSpreadsheet());
    payload.generatedAt = new Date().toISOString();
    return jsonOutput_(payload);
  } catch (error) {
    return jsonOutput_({ ok: false, error: String(error) });
  }
}

/** Returns the settings key holding this section's photos, or null for rooms. */
function settingsKeyForSection_(section) {
  if (section === 'hero') return 'hero_photos';
  var scenery = String(section || '').match(/^scenery-([123])$/);
  if (scenery) return 'scenery' + scenery[1] + '_photos';
  return null;
}

function roomIndexForSection_(section) {
  var room = String(section || '').match(/^room-(\d+)$/);
  return room ? Number(room[1]) : null;
}

function workRoomIndexForSection_(section) {
  var room = String(section || '').match(/^work-room-(\d+)$/);
  return room ? Number(room[1]) : null;
}

function assertKnownSection_(section) {
  if (settingsKeyForSection_(section) === null && roomIndexForSection_(section) === null && workRoomIndexForSection_(section) === null) {
    throw new Error('未知的區塊 Unknown section: ' + section);
  }
}

/**
 * Validates that a section not only has a known shape, but can actually receive
 * a photo. For room-<n> sections, this checks that the room exists in the rooms
 * tab. For hero and scenery-N, these are created on demand in the settings tab.
 */
function assertSectionExists_(ss, section) {
  assertKnownSection_(section);

  var roomIndex = roomIndexForSection_(section);
  if (roomIndex !== null) {
    var rooms = readRooms_(ss);
    if (!rooms[roomIndex]) {
      throw new Error('房型不存在 Room not found: ' + section);
    }
  }
  var workRoomIndex = workRoomIndexForSection_(section);
  if (workRoomIndex !== null) {
    var workRooms = readWorkRooms_(ss);
    if (!workRooms[workRoomIndex]) throw new Error('換宿房型不存在 Work room not found: ' + section);
  }
}

function readPhotoUrls_(ss, section) {
  assertKnownSection_(section);

  var settingsKey = settingsKeyForSection_(section);
  if (settingsKey) return splitUrls(readSettings_(ss)[settingsKey]);

  var workRoomIndex = workRoomIndexForSection_(section);
  var rooms = workRoomIndex === null ? readRooms_(ss) : readWorkRooms_(ss);
  var room = rooms[workRoomIndex === null ? roomIndexForSection_(section) : workRoomIndex];
  return room ? splitUrls(room.photos) : [];
}

function writePhotoUrls_(ss, section, urls) {
  assertKnownSection_(section);

  var settingsKey = settingsKeyForSection_(section);
  if (settingsKey) {
    var update = {};
    update[settingsKey] = joinUrls(urls);
    upsertSettings_(ss, update);
    return;
  }

  var workRoomIndex = workRoomIndexForSection_(section);
  var rooms = workRoomIndex === null ? readRooms_(ss) : readWorkRooms_(ss);
  var index = workRoomIndex === null ? roomIndexForSection_(section) : workRoomIndex;
  if (!rooms[index]) throw new Error('房型不存在 Room not found: ' + section);
  rooms[index].photos = joinUrls(urls);
  if (workRoomIndex === null) writeRooms_(ss, rooms);
  else writeWorkRooms_(ss, rooms);
}

/** Gets, or creates, the section's subfolder beneath the configured photo root. */
function folderForSection_(section) {
  var rootFolderId = scriptProperty_('PHOTO_ROOT_FOLDER_ID');
  if (!rootFolderId) throw new Error('尚未設定 PHOTO_ROOT_FOLDER_ID');

  var root = DriveApp.getFolderById(rootFolderId);
  var existing = root.getFoldersByName(section);
  return existing.hasNext() ? existing.next() : root.createFolder(section);
}

var MAX_APPLICANT_PHOTO_BASE64 = 3 * 1024 * 1024;

function storeApplicantPhoto_(parameter) {
  var base64 = String((parameter && parameter.photo_base64) || '');
  var mimeType = String((parameter && parameter.photo_mime) || '').toLowerCase();
  if (!base64) throw new Error('請上傳本人照片');
  if (base64.length > MAX_APPLICANT_PHOTO_BASE64) throw new Error('本人照片過大');
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(mimeType) < 0) throw new Error('不支援的圖片格式');

  var rawName = String((parameter && parameter.photo_name) || 'applicant.jpg');
  var filename = rawName.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120) || 'applicant.jpg';
  var bytes = Utilities.base64Decode(base64);
  var blob = Utilities.newBlob(bytes, mimeType, filename);
  var file = folderForSection_('applicant-photos').createFile(blob);
  return 'https://drive.google.com/open?id=' + file.getId();
}

function uploadPhoto(token, section, filename, base64, mimeType) {
  assertAuthorized_(token);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  assertSectionExists_(ss, section);

  var blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType || 'image/jpeg', filename || 'photo.jpg');
  var file = folderForSection_(section).createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var urls = readPhotoUrls_(ss, section).concat([photoUrlFor_(file.getId())]);
  writePhotoUrls_(ss, section, urls);

  return { ok: true, urls: urls };
}

function deletePhoto(token, section, url) {
  assertAuthorized_(token);
  assertKnownSection_(section);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = readPhotoUrls_(ss, section);

  // Only ever trash a file this section actually lists. A caller-supplied URL is
  // an instruction to forget a photo, not a licence to delete an arbitrary file.
  var isListed = existing.indexOf(url) >= 0;
  var urls = existing.filter(function (kept) { return kept !== url; });
  writePhotoUrls_(ss, section, urls);

  if (isListed) trashPhotoFile_(ss, url);
  return { ok: true, urls: urls };
}

/**
 * Trashes the Drive file behind a photo URL, but only if it lives under the
 * configured photo root.
 *
 * Without the scope check, anyone holding an admin token could hand us a URL
 * naming any file the owner can reach and have it deleted. The sheet is the
 * source of truth for which photos exist, so a file that has already vanished
 * is not an error.
 */
function trashPhotoFile_(ss, url) {
  var fileId = fileIdFromUrl_(url);
  if (!fileId) return;

  try {
    var file = DriveApp.getFileById(fileId);
    if (!isInsidePhotoRoot_(file, scriptProperty_('PHOTO_ROOT_FOLDER_ID'))) return;
    file.setTrashed(true);
  } catch (error) {
    // Log the error, but wrap the logging in its own try/catch so a logging
    // failure cannot turn one failure into two.
    try {
      logError_(ss, 'trashPhotoFile', error);
    } catch (logErr) {
      // Swallowed: if the error log fails, we must not turn one failure into two.
    }
  }
}

function reorderPhotos(token, section, orderedUrls) {
  assertAuthorized_(token);
  assertKnownSection_(section);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = readPhotoUrls_(ss, section);
  var urls = (orderedUrls || []).filter(function (url) { return existing.indexOf(url) >= 0; });

  writePhotoUrls_(ss, section, urls);
  return { ok: true, urls: urls };
}

if (typeof module !== 'undefined' && module.exports) {
  var lib = require('./lib.js');
  Object.assign(global, lib);
  module.exports = {
    SHEET_SETTINGS: SHEET_SETTINGS,
    SHEET_ROOMS: SHEET_ROOMS,
    SHEET_WORK_ROOMS: SHEET_WORK_ROOMS,
    SHEET_LISTS: SHEET_LISTS,
    SHEET_STAY: SHEET_STAY,
    SHEET_WORK: SHEET_WORK,
    SHEET_SERVICES: SHEET_SERVICES,
    SHEET_SCHEDULE: SHEET_SCHEDULE,
    SHEET_ERRORS: SHEET_ERRORS,
    PRIVATE_SETTINGS_KEYS: PRIVATE_SETTINGS_KEYS,
    ROOM_COLUMNS: ROOM_COLUMNS,
    WORK_ROOM_COLUMNS: WORK_ROOM_COLUMNS,
    SCHEDULE_COLUMNS: SCHEDULE_COLUMNS,
    MAX_APPLICANT_PHOTO_BASE64: MAX_APPLICANT_PHOTO_BASE64,
    LIST_COLUMNS: LIST_COLUMNS,
    readSettings_: readSettings_,
    readTableRows_: readTableRows_,
    readRooms_: readRooms_,
    readWorkRooms_: readWorkRooms_,
    readListRows_: readListRows_,
    readSchedule_: readSchedule_,
    buildContentPayload_: buildContentPayload_,
    appendResponse_: appendResponse_,
    responseApplicationExists_: responseApplicationExists_,
    readResponseApplication_: readResponseApplication_,
    withDataLock_: withDataLock_,
    appendSchedule_: appendSchedule_,
    sendNotifyEmail_: sendNotifyEmail_,
    logError_: logError_,
    handlePost_: handlePost_,
    sheetOrCreate_: sheetOrCreate_,
    upsertSettings_: upsertSettings_,
    writeRooms_: writeRooms_,
    writeWorkRooms_: writeWorkRooms_,
    writeLists_: writeLists_,
    loadAdminContent: loadAdminContent,
    saveContent: saveContent,
    saveList: saveList,
    updateScheduleStatus: updateScheduleStatus,
    verifyPasscode: verifyPasscode,
    assertAuthorized_: assertAuthorized_,
    revokeToken: revokeToken,
    photoUrlFor_: photoUrlFor_,
    fileIdFromUrl_: fileIdFromUrl_,
    isInsidePhotoRoot_: isInsidePhotoRoot_,
    settingsKeyForSection_: settingsKeyForSection_,
    roomIndexForSection_: roomIndexForSection_,
    workRoomIndexForSection_: workRoomIndexForSection_,
    assertSectionExists_: assertSectionExists_,
    readPhotoUrls_: readPhotoUrls_,
    writePhotoUrls_: writePhotoUrls_,
    folderForSection_: folderForSection_,
    storeApplicantPhoto_: storeApplicantPhoto_,
    uploadPhoto: uploadPhoto,
    deletePhoto: deletePhoto,
    reorderPhotos: reorderPhotos,
    doGet: doGet,
    __lib: lib
  };
}
