'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const admin = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Admin.html'), 'utf8');

/** Server functions that must never be reachable without a session token. */
const GUARDED = [
  'loadAdminContent', 'saveContent', 'saveList',
  'uploadPhoto', 'deletePhoto', 'reorderPhotos'
];

test('the admin page never calls a guarded server function through the unauthenticated helper', () => {
  for (const fn of GUARDED) {
    const direct = new RegExp(`\\brun\\(\\s*['"]${fn}['"]`);
    assert.equal(direct.test(admin), false, `${fn} is called via run() instead of runAuth()`);
  }
});

test('every guarded server function is reached through runAuth', () => {
  for (const fn of GUARDED) {
    const viaAuth = new RegExp(`\\brunAuth\\(\\s*['"]${fn}['"]`);
    assert.ok(viaAuth.test(admin), `${fn} is never called through runAuth()`);
  }
});

test('runAuth puts the session token in front of the caller arguments', () => {
  assert.match(admin, /function runAuth\([\s\S]*?\.unshift\(TOKEN\)/);
});

test('verifyPasscode is the only server call allowed without a token', () => {
  const calls = [...admin.matchAll(/\brun\(\s*['"]([A-Za-z_]+)['"]/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(calls)], ['verifyPasscode']);
});

test('the admin page never embeds a passcode or a folder id', () => {
  assert.doesNotMatch(admin, /ADMIN_PASSCODE\s*[:=]\s*['"][^'"]+['"]/);
  assert.doesNotMatch(admin, /PHOTO_ROOT_FOLDER_ID\s*[:=]\s*['"][^'"]+['"]/);
});

test('the admin page starts on the login screen with the app hidden', () => {
  assert.match(admin, /<div id="login"/);
  assert.match(admin, /<div id="app"[^>]*style="[^"]*display:none/);
});

test('the admin page offers an editor for every settings key the public site reads', () => {
  const required = [
    'site_name', 'tagline', 'intro_text', 'feature_1', 'feature_2', 'feature_3',
    'accommodation_intro', 'booking_note', 'workexchange_intro',
    'location_text', 'contact_email', 'contact_line', 'notify_email'
  ];
  for (const key of required) {
    assert.match(admin, new RegExp(`key:\\s*'${key}'`), `no admin editor for ${key}`);
  }
});

test('the admin page edits every room column the sheet stores', () => {
  for (const column of ['name', 'description', 'unit', 'note']) {
    assert.match(admin, new RegExp(`column:\\s*'${column}'`), `no admin editor for room column ${column}`);
  }
  assert.match(admin, /_price'\)\.value/, 'no admin editor for the price column');
});

test('saveContent is sent both settings and rooms', () => {
  assert.match(admin, /runAuth\(\s*'saveContent'\s*,\s*collectPayload\(\)\s*\)/);
});

test('site_name, the contact fields and notify_email are marked untranslatable', () => {
  for (const key of ['site_name', 'contact_email', 'contact_line', 'notify_email']) {
    const entry = new RegExp(`key:\\s*'${key}'[^}]*translatable:\\s*false`);
    assert.match(admin, entry, `${key} should not offer an English field`);
  }
});
