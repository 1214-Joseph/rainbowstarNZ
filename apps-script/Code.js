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
var SHEET_LISTS = 'workexchange_lists';
var SHEET_STAY = '住宿申請';
var SHEET_WORK = '換宿申請';
var SHEET_ERRORS = 'errors';

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

function readListRows_(ss) {
  return readTableRows_(ss, SHEET_LISTS);
}

function buildContentPayload_(ss) {
  var lists = groupLists(readListRows_(ss));
  return {
    ok: true,
    settings: readSettings_(ss),
    rooms: readRooms_(ss),
    rules: lists.rules,
    duties_out: lists.duties_out,
    duties_in: lists.duties_in
  };
}

/**
 * Appends one submission. Creates the tab on first use, and repairs the header
 * row whenever it no longer matches the field list, so a later reordering of
 * ACCOM_FIELDS cannot silently misalign every column.
 */
function appendResponse_(ss, sheetName, fields, get, timestamp, flag) {
  var sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  var expectedHeader = buildHeaderRow(fields);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(expectedHeader);
  } else {
    var existingHeader = sheet.getDataRange().getValues()[0];
    if (headerNeedsUpdate(existingHeader, expectedHeader)) {
      sheet.getRange(1, 1, 1, expectedHeader.length).setValues([expectedHeader]);
    }
  }

  sheet.appendRow(buildResponseRow(fields, get, timestamp, flag));
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

  // Check if the type is present but unrecognised (not 'workexchange' or 'accommodation').
  var typeValue = String(parameter.type || '').trim();
  if (typeValue && typeValue !== 'workexchange' && typeValue !== 'accommodation') {
    try {
      logError_(ss, 'unknown type', typeValue);
    } catch (logErr) {
      // Swallowed: if the error log fails, we must not turn one failure into two.
    }
  }

  var type = parameter.type === 'workexchange' ? 'workexchange' : 'accommodation';
  var fields = type === 'workexchange' ? WORK_FIELDS : ACCOM_FIELDS;
  var sheetName = type === 'workexchange' ? SHEET_WORK : SHEET_STAY;

  var get = function (key) { return joinMultiValue(parameters, parameter, key); };

  try {
    var flag = checkSuspicious(get);
    appendResponse_(ss, sheetName, fields, get, timestamp, flag);

    // Email is best effort. A quota error must never lose the recorded row.
    try {
      sendNotifyEmail_(readSettings_(ss), type, fields, get, flag);
    } catch (mailError) {
      // Intentionally swallowed; the row is already safe in the sheet.
    }

    return { ok: true, message: '申請已送出 / Application received' };
  } catch (error) {
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
 * The only admin function that does not require a token.
 *
 * A shared passcode buys a short-lived session token that lives in the script
 * cache, so the passcode itself is not replayed on every later call.
 */
function verifyPasscode(passcode) {
  var expected = scriptProperty_('ADMIN_PASSCODE');
  if (!expected || !passcode || String(passcode) !== String(expected)) return { ok: false };

  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('admin_token_' + token, '1', ADMIN_TOKEN_TTL_SECONDS);
  return { ok: true, token: token };
}

/**
 * Every other google.script.run function must call this first.
 *
 * The web app is deployed for "Anyone", so any visitor who loads ?page=admin can
 * invoke these functions straight from the browser console. Same origin is not
 * authorisation.
 */
function assertAuthorized_(token) {
  if (!token || !CacheService.getScriptCache().get('admin_token_' + token)) {
    throw new Error('未授權 Unauthorized');
  }
}

function photoUrlFor_(fileId) {
  return PHOTO_CDN_PREFIX + fileId + '=w1600';
}

function fileIdFromUrl_(url) {
  var value = String(url || '');
  var cdn = value.indexOf(PHOTO_CDN_PREFIX);
  if (cdn === 0) return value.slice(PHOTO_CDN_PREFIX.length).split('=')[0] || null;

  var proxy = value.match(/[?&]img=([^&]+)/);
  if (proxy) return proxy[1];

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

if (typeof module !== 'undefined' && module.exports) {
  var lib = require('./lib.js');
  Object.assign(global, lib);
  module.exports = {
    SHEET_SETTINGS: SHEET_SETTINGS,
    SHEET_ROOMS: SHEET_ROOMS,
    SHEET_LISTS: SHEET_LISTS,
    SHEET_STAY: SHEET_STAY,
    SHEET_WORK: SHEET_WORK,
    SHEET_ERRORS: SHEET_ERRORS,
    readSettings_: readSettings_,
    readTableRows_: readTableRows_,
    readRooms_: readRooms_,
    readListRows_: readListRows_,
    buildContentPayload_: buildContentPayload_,
    appendResponse_: appendResponse_,
    sendNotifyEmail_: sendNotifyEmail_,
    logError_: logError_,
    handlePost_: handlePost_,
    verifyPasscode: verifyPasscode,
    assertAuthorized_: assertAuthorized_,
    photoUrlFor_: photoUrlFor_,
    fileIdFromUrl_: fileIdFromUrl_,
    isInsidePhotoRoot_: isInsidePhotoRoot_,
    __lib: lib
  };
}
