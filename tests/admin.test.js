'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const admin = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Admin.html'), 'utf8');
const publicSite = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');
const publicApp = fs.readFileSync(path.join(__dirname, '..', 'site', 'app.js'), 'utf8');

/** Server functions that must never be reachable without a session token. */
const GUARDED = [
  'loadAdminContent', 'saveContent', 'saveList',
  'uploadPhoto', 'deletePhoto', 'reorderPhotos', 'updateScheduleStatus'
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
    'accommodation_intro', 'booking_note', 'workexchange_intro', 'workexchange_rooms_intro',
    'location_text', 'contact_email', 'contact_line', 'notify_email',
    'hero_eyebrow', 'hero_cta_primary', 'hero_cta_secondary', 'hero_badge_location',
    'hero_badge_host', 'hero_badge_work', 'hero_badge_sky', 'hero_photo_title', 'hero_photo_hint',
    'about_eyebrow', 'about_title', 'feature_1_title', 'feature_2_title', 'feature_3_title',
    'stay_eyebrow', 'stay_title', 'work_eyebrow', 'work_title',
    'work_stat_duration_value', 'work_stat_duration_label', 'work_stat_hours_value',
    'work_stat_hours_label', 'work_stat_schedule_value', 'work_stat_schedule_label',
    'work_rules_title', 'work_duties_title', 'work_duties_intro', 'work_duties_outdoor_title',
    'work_duties_indoor_title', 'work_cta_title', 'work_cta_text', 'work_cta_button',
    'work_rooms_eyebrow', 'work_rooms_title', 'work_rooms_empty',
    'nearby_eyebrow', 'nearby_title', 'nearby_intro', 'nearby_transport_title',
    'nearby_transport_text', 'nearby_essentials_title', 'nearby_essentials_text',
    'nearby_explore_title', 'nearby_explore_text', 'nearby_farm_title', 'nearby_farm_text',
    'scenery_heading', 'scenery1_label', 'scenery2_label', 'scenery3_label',
    'apply_eyebrow', 'apply_title', 'apply_intro', 'stay_form_note', 'work_form_note',
    'services_form_note', 'contact_eyebrow', 'contact_title', 'footer_note'
  ];
  for (const key of required) {
    assert.match(admin, new RegExp(`key:\\s*'${key}'`), `no admin editor for ${key}`);
  }
});

test('every public text editor is wired to a front-end consumer', () => {
  const keys = [...admin.matchAll(/\{\s*key:\s*'([^']+)'/g)].map((match) => match[1]);
  for (const key of keys) {
    if (key === 'notify_email') continue;
    if (key.startsWith('show_') || key === 'work_rooms_empty') {
      assert.match(publicApp, new RegExp(`['"]${key}['"]`), `${key} is saved but never read by the public app`);
    } else {
      assert.match(publicSite, new RegExp(`data-content="${key}"`), `${key} has no data-content target`);
    }
  }
});

test('the admin lets the owner show or hide every major public section', () => {
  for (const key of ['show_home', 'show_about', 'show_stay', 'show_work', 'show_nearby', 'show_apply', 'show_contact']) {
    assert.match(admin, new RegExp(`visibilityKey:\\s*'${key}'`), `no visibility control for ${key}`);
  }
  assert.match(admin, /function renderVisibilityField\(/);
  assert.match(admin, /settings\[section\.visibilityKey\]/);
});

test('the admin page edits every room column the sheet stores', () => {
  for (const column of ['name', 'description', 'unit', 'note']) {
    assert.match(admin, new RegExp(`column:\\s*'${column}'`), `no admin editor for room column ${column}`);
  }
  assert.match(admin, /_price'\)\.value/, 'no admin editor for the price column');
});

test('saveContent is sent both settings and rooms', () => {
  assert.match(admin, /runAuth\(\s*'saveContent'\s*,\s*collectPayload\(\)\s*\)/);
  assert.match(admin, /work_rooms:\s*collectWorkRooms\(\)/);
});

test('the admin manages dedicated work rooms and keeps their photos in work-room sections', () => {
  assert.match(admin, /function renderWorkRoomCard\(/);
  assert.match(admin, /function collectWorkRooms\(/);
  assert.match(admin, /renderPhotoManager\('work-room-' \+ index/);
  assert.match(admin, /CONTENT\.work_rooms/);
});

test('the admin shows the schedule and updates statuses through an authenticated call', () => {
  assert.match(admin, /function renderSchedule\(/);
  assert.match(admin, /CONTENT\.schedule/);
  assert.match(admin, /runAuth\(\s*'updateScheduleStatus'\s*,/);
  assert.match(admin, /row\.details/);
  assert.match(admin, /row\.photo_url/);
  assert.match(admin, /查看本人照片/);
  for (const status of ['新申請', '已聯絡', '已確認', '已取消']) assert.match(admin, new RegExp(status));
});

test('site_name, the contact fields and notify_email are marked untranslatable', () => {
  for (const key of ['site_name', 'contact_email', 'contact_line', 'notify_email']) {
    const entry = new RegExp(`key:\\s*'${key}'[^}]*translatable:\\s*false`);
    assert.match(admin, entry, `${key} should not offer an English field`);
  }
});

test('photos are uploaded, deleted and reordered through authenticated calls', () => {
  assert.match(admin, /runAuth\(\s*'uploadPhoto'\s*,\s*section\s*,/);
  assert.match(admin, /runAuth\(\s*'deletePhoto'\s*,\s*section\s*,/);
  assert.match(admin, /runAuth\(\s*'reorderPhotos'\s*,\s*section\s*,/);
});

test('images are downscaled in the browser before upload', () => {
  assert.match(admin, /MAX_IMAGE_EDGE\s*=\s*1600/);
  assert.match(admin, /function downscaleImage/);
  assert.match(admin, /createElement\('canvas'\)/);
});

test('the upload input only accepts images and allows several at once', () => {
  assert.match(admin, /type:\s*'file'[\s\S]{0,120}accept:\s*'image\/\*'/);
  assert.match(admin, /multiple/);
});

test('the photo manager writes returned URLs back into CONTENT so a later save cannot clobber them', () => {
  assert.match(admin, /function updatePhotoState/);
  assert.match(admin, /updatePhotoState\(section,\s*result\.urls\)/);
});

test('all three editable lists are offered', () => {
  for (const name of ['rules', 'duties_out', 'duties_in']) {
    assert.match(admin, new RegExp(`name:\\s*'${name}'`), `no editor for list ${name}`);
  }
});

test('lists are saved through an authenticated saveList call', () => {
  assert.match(admin, /runAuth\(\s*'saveList'\s*,\s*listName\s*,\s*collectListItems\(listName\)\s*\)/);
});

test('the rules editor does not ask the owner to maintain numbering', () => {
  assert.doesNotMatch(admin, /placeholder="順序"/);
  assert.match(admin, /編號會自動產生/);
});

test('each list item offers a Chinese and an English box plus a delete control', () => {
  assert.match(admin, /'li' \+ listName \+ '_' \+ index \+ '_zh'/);
  assert.match(admin, /'li' \+ listName \+ '_' \+ index \+ '_en'/);
  assert.match(admin, /刪除這一項/);
});

test('the scenery photo manager reads the same key shape it writes (no leading space)', () => {
  assert.doesNotMatch(admin, / scenery/, 'scenery key should not have a leading space');
});

test('the scenery photo manager key matches the write path', () => {
  assert.match(admin, /\['scenery' \+ n \+ '_photos'\]/);
});

test('uploadPhoto, deletePhoto, and save do not appear as function definitions', () => {
  assert.doesNotMatch(admin, /function\s+uploadPhoto\s*\(/);
  assert.doesNotMatch(admin, /function\s+deletePhoto\s*\(/);
  assert.doesNotMatch(admin, /function\s+save\s*\(/);
});
