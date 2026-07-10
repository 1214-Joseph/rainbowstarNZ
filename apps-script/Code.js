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
    __lib: lib
  };
}
