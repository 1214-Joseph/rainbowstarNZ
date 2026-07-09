/**
 * Pure helpers shared by the Rainbowstar Apps Script back end.
 *
 * This file must paste cleanly into the Apps Script editor, so it may not use
 * require/import at the top level. The export block at the bottom is guarded so
 * that Apps Script, where `module` is undefined, simply skips it.
 */
'use strict';

function splitUrls(value) {
  if (value === null || value === undefined) return [];
  var out = [];
  String(value).split(/[\n,|]+/).forEach(function (raw) {
    var url = raw.trim();
    if (url && out.indexOf(url) < 0) out.push(url);
  });
  return out;
}

function joinUrls(urls) {
  return (urls || []).join('\n');
}

function isBlank_(value) {
  return value === undefined || value === null || value === '';
}

/**
 * Language pick for [data-content] elements.
 *
 * Returns undefined in English mode when no _en value exists. Callers MUST skip
 * the element in that case, leaving the correct English already present in the
 * markup's data-en attribute. Falling back to Chinese here is the bug this fixes.
 */
function settingValue(settings, key, lang) {
  if (!settings) return undefined;
  if (lang === 'en') {
    var english = settings[key + '_en'];
    return isBlank_(english) ? undefined : String(english);
  }
  var chinese = settings[key];
  return isBlank_(chinese) ? undefined : String(chinese);
}

/**
 * Language pick for rows rendered purely from data (rooms, rule lists).
 *
 * These have no markup fallback, so English mode falls back to Chinese rather
 * than rendering nothing.
 */
function pickRow(row, base, lang) {
  if (!row) return undefined;
  if (lang === 'en') {
    var english = row[base + '_en'];
    if (!isBlank_(english)) return String(english);
  }
  var chinese = row[base];
  return isBlank_(chinese) ? undefined : String(chinese);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    splitUrls: splitUrls,
    joinUrls: joinUrls,
    settingValue: settingValue,
    pickRow: pickRow
  };
}
