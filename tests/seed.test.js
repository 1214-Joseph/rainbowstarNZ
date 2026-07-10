'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const code = require('../apps-script/Code.js');
const lib = require('../apps-script/lib.js');
const { readSheetCsv } = require('../scripts/csv.js');

const readCsv = readSheetCsv;

test('parseCsv keeps a comma that sits inside a quoted field', () => {
  const { parseCsv } = require('../scripts/csv.js');
  assert.deepEqual(parseCsv('a,"b,c"\n'), [['a', 'b,c']]);
  assert.deepEqual(parseCsv('a,"say ""hi"""\n'), [['a', 'say "hi"']]);
});

test('settings.csv has a key/value header and no duplicate keys', () => {
  const rows = readCsv('settings.csv');
  assert.deepEqual(rows[0], ['key', 'value']);

  const keys = rows.slice(1).map((r) => r[0]);
  assert.equal(new Set(keys).size, keys.length, 'duplicate key in settings.csv');
});

test('settings.csv defines every content key the site reads', () => {
  const keys = new Set(readCsv('settings.csv').slice(1).map((r) => r[0]));
  const required = [
    'site_name', 'tagline', 'intro_text', 'feature_1', 'feature_2', 'feature_3',
    'accommodation_intro', 'booking_note', 'workexchange_intro',
    'location_text', 'contact_email', 'contact_line', 'notify_email',
    'hero_photos', 'scenery1_photos', 'scenery2_photos', 'scenery3_photos'
  ];
  for (const key of required) assert.ok(keys.has(key), `settings.csv is missing ${key}`);
});

test('settings.csv carries an _en row for every translatable text key', () => {
  const keys = new Set(readCsv('settings.csv').slice(1).map((r) => r[0]));
  const translatable = [
    'tagline', 'intro_text', 'feature_1', 'feature_2', 'feature_3',
    'accommodation_intro', 'booking_note', 'workexchange_intro', 'location_text'
  ];
  for (const key of translatable) assert.ok(keys.has(key + '_en'), `settings.csv is missing ${key}_en`);
});

test('rooms.csv uses the canonical column order and lists the three room types', () => {
  const rows = readCsv('rooms.csv');
  assert.deepEqual(rows[0], code.ROOM_COLUMNS);
  assert.equal(rows.length - 1, 3);
  assert.deepEqual(rows.slice(1).map((r) => r[0]), ['主屋 Dorm Room', '自搭帳棚 Tent', '露宿自己的愛車 vehicle']);
});

test('rooms.csv room names match the room_type options offered by the booking form', () => {
  const design = fs.readFileSync(
    path.join(__dirname, '..', 'claude_design', '彩虹星民宿 Rainbowstar.dc.html'), 'utf8'
  );
  for (const row of readCsv('rooms.csv').slice(1)) {
    assert.ok(design.includes(`name="room_type" value="${row[0]}"`), `no room_type option for ${row[0]}`);
  }
});

test('workexchange_lists.csv has the right header and only known list names', () => {
  const rows = readCsv('workexchange_lists.csv');
  assert.deepEqual(rows[0], ['list', 'order', 'text_zh', 'text_en']);
  for (const row of rows.slice(1)) {
    assert.ok(lib.LIST_NAMES.includes(row[0]), `unknown list name ${row[0]}`);
    assert.equal(row.length, 4);
  }
});

test('workexchange_lists.csv seeds 16 rules, 5 outdoor duties and 2 indoor duties', () => {
  const rows = readCsv('workexchange_lists.csv').slice(1);
  const counts = { rules: 0, duties_out: 0, duties_in: 0 };
  for (const row of rows) counts[row[0]]++;
  assert.deepEqual(counts, { rules: 16, duties_out: 5, duties_in: 2 });
});

test('workexchange_lists.csv numbers each list from one with no gaps', () => {
  const rows = readCsv('workexchange_lists.csv').slice(1);
  for (const listName of lib.LIST_NAMES) {
    const orders = rows.filter((r) => r[0] === listName).map((r) => Number(r[1]));
    assert.deepEqual(orders, orders.map((_, i) => i + 1), `${listName} orders are not 1..N`);
  }
});

test('every seeded list item is bilingual', () => {
  for (const row of readCsv('workexchange_lists.csv').slice(1)) {
    assert.ok(row[2].trim().length > 0, `missing Chinese for ${row[0]} #${row[1]}`);
    assert.ok(row[3].trim().length > 0, `missing English for ${row[0]} #${row[1]}`);
  }
});

test('the second rule states the five-on two-off schedule agreed in the spec', () => {
  const rows = readCsv('workexchange_lists.csv').slice(1);
  const rule2 = rows.find((r) => r[0] === 'rules' && r[1] === '2');
  assert.match(rule2[2], /做五休二/);
});

test('groupLists round-trips the seeded CSV into the shape the site consumes', () => {
  const rows = readCsv('workexchange_lists.csv').slice(1).map((r) => ({
    list: r[0], order: Number(r[1]), text_zh: r[2], text_en: r[3]
  }));
  const grouped = lib.groupLists(rows);
  assert.equal(grouped.rules.length, 16);
  assert.equal(grouped.duties_out[2].zh, '餵貓');
  assert.equal(grouped.duties_in.length, 2);
});
