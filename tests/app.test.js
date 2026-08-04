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

test('contentValue resolves untranslatable settings in English mode, so an edited site name survives an EN-mode page load', () => {
  assert.equal(app.contentValue({ site_name: '彩虹星 123' }, 'site_name', 'en'), '彩虹星 123');
  assert.equal(app.contentValue({ contact_email: 'a@b.co' }, 'contact_email', 'en'), 'a@b.co');
  assert.equal(app.contentValue({ contact_line: '021-000' }, 'contact_line', 'en'), '021-000');
  // Translatable keys keep the missing-_en guard: undefined preserves the markup's built-in English.
  assert.equal(app.contentValue({ tagline: '標語' }, 'tagline', 'en'), undefined);
  assert.equal(app.contentValue({ tagline: '標語', tagline_en: 'Tagline' }, 'tagline', 'en'), 'Tagline');
});

test('section visibility hides the section and every matching navigation link, defaulting missing settings to visible', () => {
  const previousDocument = global.document;
  const sections = {
    top: { style: {} }, about: { style: {} }, stay: { style: {} }, work: { style: {} },
    nearby: { style: {} }, apply: { style: {} }, contact: { style: {} }
  };
  const links = Object.fromEntries(Object.keys(sections).map((id) => [id, [{ style: {} }, { style: {} }]]));
  const jumps = Object.fromEntries(Object.keys(sections).map((id) => [id, [{ style: {} }]]));
  global.document = {
    getElementById: (id) => sections[id] || null,
    querySelectorAll: (selector) => {
      const match = selector.match(/^\[href="#(.+)"\],\[data-jump="(.+)"\]$/);
      return match ? (links[match[1]] || []).concat(jumps[match[2]] || []) : [];
    }
  };

  try {
    app.applySectionVisibility({ show_home: 'false', show_about: 'false', show_work: '0', show_nearby: 'true' });
  } finally {
    global.document = previousDocument;
  }

  assert.equal(sections.about.style.display, 'none');
  assert.equal(sections.top.style.display, 'none');
  assert.equal(sections.work.style.display, 'none');
  assert.equal(sections.nearby.style.display, '');
  assert.equal(sections.stay.style.display, '', 'a missing setting keeps the section visible');
  assert.ok(links.about.every((link) => link.style.display === 'none'));
  assert.ok(links.work.every((link) => link.style.display === 'none'));
  assert.ok(links.stay.every((link) => link.style.display === ''));
  assert.ok(links.top.every((link) => link.style.display !== 'none'), 'site-name links stay visible when only the hero is hidden');
  assert.ok(jumps.about.every((link) => link.style.display === 'none'));
  assert.ok(jumps.work.every((link) => link.style.display === 'none'));
  assert.ok(jumps.stay.every((link) => link.style.display === ''));
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

test('room photo slides preserve the whole uploaded image instead of cropping it', () => {
  const previousDocument = global.document;
  const attributes = {};
  global.document = {
    createElement: () => ({
      setAttribute: (name, value) => { attributes[name] = value; }
    })
  };

  try {
    app.makeSlide({ url: 'https://example.com/square-room.jpg' });
  } finally {
    global.document = previousDocument;
  }

  assert.match(attributes.style, /background-size:contain/);
  assert.match(attributes.style, /background-repeat:no-repeat/);
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

test('workRoomsToRender stays empty until the owner adds dedicated work rooms', () => {
  const rooms = [{ name: '花園小屋' }];
  assert.deepEqual(app.workRoomsToRender(rooms), rooms);
  assert.deepEqual(app.workRoomsToRender([]), []);
  assert.deepEqual(app.workRoomsToRender(null), []);
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

/** A stand-in <form> exposing only what validate() and submitForm() touch. */
function fakeForm(values) {
  const fields = [];
  Object.keys(values).forEach((name) => {
    const entries = Array.isArray(values[name]) ? values[name] : [values[name]];
    entries.forEach((entry) => {
      if (entry && typeof entry === 'object') fields.push(Object.assign({ name, value: '' }, entry));
      else fields.push({ name, value: entry });
    });
  });
  return {
    fields,
    querySelector: (selector) => {
      const match = selector.match(/^\[name="(.+)"\](:checked)?$/);
      if (!match) return null;
      const field = fields.find((f) => f.name === match[1]);
      if (!field) return null;
      if (match[2] && !field.checked) return null;
      return field;
    },
    querySelectorAll: (selector) => {
      const match = selector.match(/^\[name="(.+)"\](:checked)?$/);
      if (!match) return [];
      return fields.filter((field) => field.name === match[1] && (!match[2] || field.checked));
    }
  };
}

const namesOf = (errors) => errors.map((e) => e.name);

test('validate accepts a well-formed accommodation submission', () => {
  const form = fakeForm({
    name_en: 'Mei Wang', name_zh: '王美', country: '台灣', phone: '0211234567',
    email: 'mei@example.com', passport: 'A12345678', guests: '2',
    checkin: '2026-08-01', checkout: '2026-08-05'
  });
  assert.deepEqual(app.validate(form), []);
});

test('validate rejects an English name shorter than two letters or made of one repeated letter', () => {
  assert.ok(namesOf(app.validate(fakeForm({ name_en: 'a' }))).includes('name_en'));
  assert.ok(namesOf(app.validate(fakeForm({ name_en: 'aaaa' }))).includes('name_en'));
});

test('validate rejects a phone with fewer than six digits and a malformed email', () => {
  assert.ok(namesOf(app.validate(fakeForm({ phone: '123' }))).includes('phone'));
  assert.ok(namesOf(app.validate(fakeForm({ email: 'nope' }))).includes('email'));
});

test('validate rejects a checkout on or before the check-in date', () => {
  const same = fakeForm({ checkin: '2026-08-01', checkout: '2026-08-01' });
  assert.ok(namesOf(app.validate(same)).includes('checkout'));
  const before = fakeForm({ checkin: '2026-08-05', checkout: '2026-08-01' });
  assert.ok(namesOf(app.validate(before)).includes('checkout'));
});

test('validate rejects an end date before the start date, but allows an equal one', () => {
  assert.ok(namesOf(app.validate(fakeForm({ start_date: '2026-08-05', end_date: '2026-08-01' }))).includes('end_date'));
  assert.deepEqual(namesOf(app.validate(fakeForm({ start_date: '2026-08-01', end_date: '2026-08-01' }))), []);
});

test('rangeLength reports accommodation nights and inclusive service days', () => {
  assert.equal(app.rangeLength('2026-09-10', '2026-09-17', false), 7);
  assert.equal(app.rangeLength('2026-09-10', '2026-09-10', true), 1);
  assert.equal(app.rangeLength('2026-09-10', '2026-09-09', false), null);
  assert.equal(app.rangeLength('', '2026-09-10', false), null);
});

test('calendarDays produces a six-week Monday-first grid with ISO dates', () => {
  const days = app.calendarDays(2026, 8); // September 2026
  assert.equal(days.length, 42);
  assert.equal(days[0].iso, '2026-08-31');
  assert.equal(days[1].iso, '2026-09-01');
  assert.equal(days[1].inMonth, true);
  assert.equal(days[0].inMonth, false);
});

test('validate requires at least one other service and the matching storage details', () => {
  const none = fakeForm({ services: [{ value: '寄放行李', checked: false }] });
  assert.ok(namesOf(app.validate(none)).includes('services'));

  const luggage = fakeForm({
    services: [{ value: '寄放行李', checked: true }],
    service_start: '2026-09-10', service_end: '2026-09-17', luggage_count: '2'
  });
  assert.deepEqual(app.validate(luggage), []);

  const noCount = fakeForm({
    services: [{ value: '寄放行李', checked: true }],
    service_start: '2026-09-10', service_end: '2026-09-17', luggage_count: '0'
  });
  assert.ok(namesOf(app.validate(noCount)).includes('luggage_count'));
});

test('validate requires a plate for vehicle storage but keeps it optional on stay forms', () => {
  const storage = fakeForm({
    services: [{ value: '寄放車輛', checked: true }],
    service_start: '2026-09-10', service_end: '2026-09-17', vehicle_plate: ''
  });
  assert.ok(namesOf(app.validate(storage)).includes('vehicle_plate'));
  assert.deepEqual(app.validate(fakeForm({ vehicle_plate: '' })), []);
});

test('toggleServiceDetails clears and disables fields for a deselected service', () => {
  const stalePickup = { value: '2026-09-08', disabled: false };
  const luggageField = { value: '2', disabled: false };
  const pickupSection = {
    style: {},
    getAttribute: () => '接機',
    querySelectorAll: () => [stalePickup]
  };
  const luggageSection = {
    style: {},
    getAttribute: () => '寄放行李',
    querySelectorAll: () => [luggageField]
  };
  const form = {
    querySelectorAll: (selector) => selector === '[name="services"]:checked'
      ? [{ value: '寄放行李' }]
      : (selector === '[data-service-detail]' ? [pickupSection, luggageSection] : [])
  };

  app.toggleServiceDetails(form);

  assert.equal(pickupSection.style.display, 'none');
  assert.equal(stalePickup.value, '');
  assert.equal(stalePickup.disabled, true);
  assert.equal(luggageSection.style.display, 'block');
  assert.equal(luggageField.disabled, false);
});

test('validate requires the work-exchange applicant photo input to hold one file', () => {
  assert.ok(namesOf(app.validate(fakeForm({ applicant_photo: { files: [] } }))).includes('applicant_photo'));
  assert.deepEqual(app.validate(fakeForm({ applicant_photo: { files: [{ name: 'mei.jpg', type: 'image/jpeg' }] } })), []);
});

test('photoPayloadFromDataUrl strips the data URL and rejects an oversized result', () => {
  assert.deepEqual(app.photoPayloadFromDataUrl('data:image/jpeg;base64,aGVsbG8=', 'mei.png'), {
    base64: 'aGVsbG8=', mimeType: 'image/jpeg', filename: 'mei.jpg'
  });
  assert.throws(() => app.photoPayloadFromDataUrl('data:image/jpeg;base64,' + 'a'.repeat(app.MAX_APPLICANT_PHOTO_BASE64 + 1), 'x.jpg'), /照片過大/);
});

test('setType exposes exactly one of the three application forms', () => {
  const ids = {};
  ['seg-stay', 'seg-work', 'seg-services', 'formStay', 'formWork', 'formServices'].forEach((id) => {
    ids[id] = { style: {} };
  });
  global.document = { getElementById: (id) => ids[id] || null };

  app.setType('services');

  assert.equal(ids.formStay.style.display, 'none');
  assert.equal(ids.formWork.style.display, 'none');
  assert.equal(ids.formServices.style.display, 'block');
  assert.equal(ids['seg-services'].style.background, '#2f8f57');
});

test('validate rejects an age outside 10..99 and a photo URL that is not http', () => {
  assert.ok(namesOf(app.validate(fakeForm({ age: '5' }))).includes('age'));
  assert.ok(namesOf(app.validate(fakeForm({ age: '150' }))).includes('age'));
  assert.ok(namesOf(app.validate(fakeForm({ photo_url: 'not a url' }))).includes('photo_url'));
  assert.deepEqual(namesOf(app.validate(fakeForm({ photo_url: 'https://example.com/me.jpg' }))), []);
});

test('validate only checks fields the form actually contains', () => {
  assert.deepEqual(app.validate(fakeForm({})), [], 'an empty form raises no errors about absent fields');
});

test('submitForm reports failure when the back end answers ok:false', async () => {
  const fetchImpl = async () => ({ json: async () => ({ ok: false, error: 'boom' }) });
  const result = await app.submitForm(fakeForm({}), { WEBAPP_URL: 'https://example.com/exec' }, fetchImpl);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'boom');
});

test('submitForm reports success when the back end answers ok:true', async () => {
  const fetchImpl = async () => ({ json: async () => ({ ok: true }) });
  const result = await app.submitForm(fakeForm({}), { WEBAPP_URL: 'https://example.com/exec' }, fetchImpl);
  assert.equal(result.ok, true);
});

test('submitForm reports failure when the network throws', async () => {
  const fetchImpl = async () => { throw new Error('offline'); };
  const result = await app.submitForm(fakeForm({}), { WEBAPP_URL: 'https://example.com/exec' }, fetchImpl);
  assert.equal(result.ok, false);
});

test('submitForm refuses to claim success when no back end is configured', async () => {
  const result = await app.submitForm(fakeForm({}), { WEBAPP_URL: '' }, async () => { throw new Error('never'); });
  assert.equal(result.ok, false);
  assert.match(result.reason, /WEBAPP_URL/);
});

test('submitForm in opaque mode assumes success, which is the whole reason readable mode is preferred', async () => {
  const fetchImpl = async () => ({ type: 'opaque' });
  const result = await app.submitForm(
    fakeForm({}), { WEBAPP_URL: 'https://example.com/exec', SUBMIT_MODE: 'opaque' }, fetchImpl
  );
  assert.equal(result.ok, true);
});

test('validate rejects a blank checkout when checkin is filled', () => {
  const form = fakeForm({ checkin: '2026-08-01', checkout: '' });
  assert.ok(namesOf(app.validate(form)).includes('checkout'));
});

test('validate rejects a blank checkin field when present', () => {
  const form = fakeForm({ checkin: '', checkout: '2026-08-05' });
  assert.ok(namesOf(app.validate(form)).includes('checkin'));
});

test('validate rejects a blank end_date when start_date is filled', () => {
  const form = fakeForm({ start_date: '2026-08-01', end_date: '' });
  assert.ok(namesOf(app.validate(form)).includes('end_date'));
});

test('validate rejects a blank start_date field when present', () => {
  const form = fakeForm({ start_date: '', end_date: '2026-08-05' });
  assert.ok(namesOf(app.validate(form)).includes('start_date'));
});

test('validate rejects a blank birthday field when present', () => {
  const form = fakeForm({ birthday: '' });
  assert.ok(namesOf(app.validate(form)).includes('birthday'));
});

test('validate does not reject blank date fields when the form has none of them', () => {
  const form = fakeForm({ name_en: 'John Doe' });
  const errors = app.validate(form);
  assert.ok(!namesOf(errors).includes('checkin'));
  assert.ok(!namesOf(errors).includes('checkout'));
  assert.ok(!namesOf(errors).includes('start_date'));
  assert.ok(!namesOf(errors).includes('end_date'));
  assert.ok(!namesOf(errors).includes('birthday'));
});

test('validate preserves the existing checkout-before-checkin check when both are filled', () => {
  const form = fakeForm({ checkin: '2026-08-05', checkout: '2026-08-01' });
  assert.ok(namesOf(app.validate(form)).includes('checkout'));
});

test('buildFormBody returns an empty URLSearchParams for non-form objects without throwing', () => {
  const result1 = app.buildFormBody({});
  assert.ok(result1 instanceof URLSearchParams);

  const result2 = app.buildFormBody(null);
  assert.ok(result2 instanceof URLSearchParams);
});

test('applicationIdFor reuses the same id when a failed request is retried', () => {
  const field = { value: 'retry-id-123' };
  const form = { querySelector: (selector) => selector === '[name="application_id"]' ? field : null };
  assert.equal(app.applicationIdFor(form), 'retry-id-123');
  assert.equal(app.applicationIdFor(form), 'retry-id-123');
});
