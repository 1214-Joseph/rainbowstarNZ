'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../site/app.js');

/** A stand-in element exposing just the surface applyStyleShim touches. */
function fakeElement(attributes, inlineStyle) {
  const declared = Object.assign({}, inlineStyle);
  const handlers = {};
  return {
    applied: declared,
    getAttribute: (name) => (name in attributes ? attributes[name] : null),
    addEventListener: (type, fn) => { (handlers[type] = handlers[type] || []).push(fn); },
    fire: (type) => (handlers[type] || []).forEach((fn) => fn()),
    style: {
      setProperty: (prop, value) => { declared[prop] = value; },
      getPropertyValue: (prop) => (prop in declared ? declared[prop] : ''),
      removeProperty: (prop) => { delete declared[prop]; }
    }
  };
}

function fakeRoot(bySelector) {
  return { querySelectorAll: (selector) => bySelector[selector] || [] };
}

test('parseStyleText splits declarations into property/value pairs', () => {
  assert.deepEqual(app.parseStyleText('background:#f1ebdd;color:#1f6b40'), [
    ['background', '#f1ebdd'],
    ['color', '#1f6b40']
  ]);
});

test('parseStyleText tolerates spacing, a trailing semicolon and empty input', () => {
  assert.deepEqual(app.parseStyleText(' transform : translateY(-2px) ; '), [['transform', 'translateY(-2px)']]);
  assert.deepEqual(app.parseStyleText(''), []);
  assert.deepEqual(app.parseStyleText(null), []);
});

test('parseStyleText keeps colons inside a value, as in box-shadow and rgba', () => {
  assert.deepEqual(app.parseStyleText('box-shadow:0 0 0 3px rgba(47,143,87,.14)'), [
    ['box-shadow', '0 0 0 3px rgba(47,143,87,.14)']
  ]);
});

test('parseStyleText drops malformed chunks that carry no colon', () => {
  assert.deepEqual(app.parseStyleText('color:red;garbage;'), [['color', 'red']]);
});

test('applyStyleShim applies hover styles on mouseenter', () => {
  const el = fakeElement({ 'style-hover': 'background:#f1ebdd' }, {});
  app.applyStyleShim(fakeRoot({ '[style-hover]': [el] }));

  el.fire('mouseenter');
  assert.equal(el.applied.background, '#f1ebdd');
});

test('applyStyleShim restores the original inline value on mouseleave', () => {
  const el = fakeElement({ 'style-hover': 'background:#f1ebdd' }, { background: 'transparent' });
  app.applyStyleShim(fakeRoot({ '[style-hover]': [el] }));

  el.fire('mouseenter');
  assert.equal(el.applied.background, '#f1ebdd');
  el.fire('mouseleave');
  assert.equal(el.applied.background, 'transparent');
});

test('applyStyleShim removes a property that had no original inline value', () => {
  const el = fakeElement({ 'style-hover': 'transform:translateY(-2px)' }, {});
  app.applyStyleShim(fakeRoot({ '[style-hover]': [el] }));

  el.fire('mouseenter');
  assert.equal(el.applied.transform, 'translateY(-2px)');
  el.fire('mouseleave');
  assert.equal('transform' in el.applied, false);
});

test('applyStyleShim binds focus and blur for style-focus', () => {
  const el = fakeElement({ 'style-focus': 'border-color:#2f8f57' }, { 'border-color': '#e4dccb' });
  app.applyStyleShim(fakeRoot({ '[style-focus]': [el] }));

  el.fire('focus');
  assert.equal(el.applied['border-color'], '#2f8f57');
  el.fire('blur');
  assert.equal(el.applied['border-color'], '#e4dccb');
});

test('applyStyleShim ignores an element whose shim attribute is empty', () => {
  const el = fakeElement({ 'style-hover': '' }, {});
  app.applyStyleShim(fakeRoot({ '[style-hover]': [el] }));
  assert.doesNotThrow(() => el.fire('mouseenter'));
});

test('settingValue returns undefined in English when no _en exists, so data-en survives', () => {
  assert.equal(app.settingValue({ tagline: '標語' }, 'tagline', 'en'), undefined);
  assert.equal(app.settingValue({ tagline: '標語', tagline_en: '' }, 'tagline', 'en'), undefined);
  assert.equal(app.settingValue({ tagline: '標語', tagline_en: 'Tagline' }, 'tagline', 'en'), 'Tagline');
  assert.equal(app.settingValue({ tagline: '標語' }, 'tagline', 'zh'), '標語');
});

test('pickRow falls back to Chinese in English mode, because rooms have no markup fallback', () => {
  assert.equal(app.pickRow({ name: '主屋' }, 'name', 'en'), '主屋');
  assert.equal(app.pickRow({ name: '主屋', name_en: 'Dorm' }, 'name', 'en'), 'Dorm');
  assert.equal(app.pickRow({}, 'name', 'zh'), undefined);
});

test('splitUrls matches the back end: newline, comma or pipe, trimmed and de-duplicated', () => {
  assert.deepEqual(app.splitUrls(' a.jpg ,\n b.jpg | a.jpg'), ['a.jpg', 'b.jpg']);
  assert.deepEqual(app.splitUrls(null), []);
});

test('escapeHtml neutralises markup so sheet content cannot inject elements', () => {
  assert.equal(app.escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(app.escapeHtml('a & "b" \'c\''), 'a &amp; &quot;b&quot; &#39;c&#39;');
});

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { readSheetCsv } = require('../scripts/csv.js');

/** Reads the seeded CSV so the front-end fallback cannot drift away from it. */
function seededLists() {
  const lists = { rules: [], duties_out: [], duties_in: [] };
  readSheetCsv('workexchange_lists.csv').slice(1)
    .filter((r) => r[0] in lists)
    .forEach((r) => lists[r[0]].push({ zh: r[2], en: r[3] }));
  return lists;
}

test('DEFAULT_LISTS is byte-for-byte the seeded CSV content', () => {
  assert.deepEqual(app.DEFAULT_LISTS, seededLists());
});

test('site/app.js is not stale with respect to the seed CSV', () => {
  const script = path.join(__dirname, '..', 'scripts', 'build-defaults.js');
  assert.doesNotThrow(
    () => execFileSync(process.execPath, [script, '--check'], { stdio: 'pipe' }),
    'run: npm run build:defaults'
  );
});

test('listItemsFor prefers back-end data and falls back to the built-in defaults', () => {
  const fromServer = { rules: [{ zh: '伺服器規則', en: 'Server rule' }] };
  assert.deepEqual(app.listItemsFor(fromServer, 'rules'), fromServer.rules);
  assert.deepEqual(app.listItemsFor({ rules: [] }, 'rules'), app.DEFAULT_LISTS.rules);
  assert.deepEqual(app.listItemsFor(null, 'duties_in'), app.DEFAULT_LISTS.duties_in);
});

/** A stand-in host element recording the children renderList appends. */
function fakeHost() {
  const children = [];
  return {
    children,
    innerHTML: '',
    appendChild: (child) => children.push(child),
    querySelectorAll: () => children
  };
}

/** renderList builds real elements, so give it a document just rich enough. */
function installFakeDocument() {
  global.document = {
    createElement: () => {
      const el = {
        children: [],
        attributes: {},
        textContent: '',
        innerHTML: '',
        setAttribute(name, value) { this.attributes[name] = value; },
        getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; },
        appendChild(child) { this.children.push(child); return child; },
        querySelector: () => null
      };
      return el;
    }
  };
}

test('renderList numbers the rules and stores both languages on each item', () => {
  installFakeDocument();
  const host = fakeHost();
  app.renderList(host, [{ zh: '第一條', en: 'Rule one' }, { zh: '第二條', en: 'Rule two' }], 'rule', 'zh');

  assert.equal(host.children.length, 2);
  const firstText = host.children[0].children[1];
  assert.equal(firstText.textContent, '第一條');
  assert.equal(firstText.getAttribute('data-zh'), '第一條');
  assert.equal(firstText.getAttribute('data-en'), 'Rule one');
  assert.equal(host.children[0].children[0].textContent, '1');
  assert.equal(host.children[1].children[0].textContent, '2');
});

test('renderList shows the English text when the language is English', () => {
  installFakeDocument();
  const host = fakeHost();
  app.renderList(host, [{ zh: '餵貓', en: 'Feed the cats' }], 'out', 'en');
  assert.equal(host.children[0].children[1].textContent, 'Feed the cats');
});

test('renderList is idempotent: rendering twice does not duplicate items', () => {
  installFakeDocument();
  const host = fakeHost();
  const items = [{ zh: '甲', en: 'A' }];

  app.renderList(host, items, 'rule', 'zh');
  host.children.length = 0;          // innerHTML = '' is what the real code does
  app.renderList(host, items, 'rule', 'zh');

  assert.equal(host.children.length, 1, 'no dataset.done guard blocks the second render');
});

test('renderList tolerates an empty item list', () => {
  installFakeDocument();
  const host = fakeHost();
  assert.doesNotThrow(() => app.renderList(host, [], 'rule', 'zh'));
  assert.equal(host.children.length, 0);
});

test('collectPhotos reads the canonical photos column and the legacy photo columns', () => {
  assert.deepEqual(app.collectPhotos({ photos: 'a.jpg\nb.jpg' }), ['a.jpg', 'b.jpg']);
  assert.deepEqual(app.collectPhotos({ photo: 'a.jpg', photo2: 'b.jpg' }), ['a.jpg', 'b.jpg']);
  assert.deepEqual(app.collectPhotos({ photos: 'a.jpg', photo: 'a.jpg' }), ['a.jpg'], 'de-duplicated');
  assert.deepEqual(app.collectPhotos({}), []);
});

test('roomsToRender falls back to the single built-in room when the sheet is empty', () => {
  const rooms = [{ name: '主屋' }];
  assert.deepEqual(app.roomsToRender(rooms), rooms);
  assert.deepEqual(app.roomsToRender([]), app.DEFAULT_ROOMS);
  assert.deepEqual(app.roomsToRender(null), app.DEFAULT_ROOMS);
});

test('DEFAULT_ROOMS is bilingual, so English mode never shows Chinese room copy', () => {
  for (const room of app.DEFAULT_ROOMS) {
    assert.ok(room.name_en, 'missing name_en');
    assert.ok(room.description_en, 'missing description_en');
    assert.ok(room.unit_en, 'missing unit_en');
  }
});

test('roomPrice shows an em dash for an absent, zero or blank price', () => {
  assert.equal(app.roomPrice({ price: 35 }), 35);
  assert.equal(app.roomPrice({ price: '$35' }), '$35');
  assert.equal(app.roomPrice({}), '—');
  assert.equal(app.roomPrice({ price: '' }), '—');
  assert.equal(app.roomPrice({ price: 0 }), '—');
  assert.equal(app.roomPrice({ price: '0' }), '—');
});
