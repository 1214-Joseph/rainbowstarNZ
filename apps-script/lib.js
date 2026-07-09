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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { splitUrls: splitUrls, joinUrls: joinUrls };
}
