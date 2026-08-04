'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const admin = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Admin.html'), 'utf8');
const publicSite = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');
const publicApp = fs.readFileSync(path.join(__dirname, '..', 'site', 'app.js'), 'utf8');

function loadAdminRuntime(nodes = {}) {
  const script = admin.match(/<script>([\s\S]*?)<\/script>/)[1];
  const bootstrap = script.indexOf("\n  document.getElementById('loginBtn').onclick");
  assert.notEqual(bootstrap, -1, 'admin bootstrap marker is missing');
  const context = {
    document: { getElementById(id) { return nodes[id] || null; } },
    console,
    Promise,
    Object,
    Array,
    String,
    Number
  };
  vm.createContext(context);
  vm.runInContext(script.slice(0, bootstrap), context);
  return context;
}

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
    'hero_badge_host', 'hero_badge_work',
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
  assert.match(admin, /updated\.price\s*=\s*price\.value/, 'no admin editor for the price column');
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

test('each paid room card renders exactly one photo manager', () => {
  const calls = admin.match(/renderPhotoManager\('room-' \+ index/g) || [];
  assert.equal(calls.length, 1);
});

test('the admin has only three owner-facing destinations', () => {
  const labels = ['申請管理', '編輯網站', '通知設定'];
  let previous = -1;
  for (const label of labels) {
    const index = admin.indexOf(`label: '${label}'`);
    assert.ok(index > previous, `${label} is missing or out of order`);
    previous = index;
  }
  assert.match(admin, /function showAdminPage\(/);
  assert.match(admin, /class:\s*'admin-page'/);
  assert.match(admin, /\.admin-page\[hidden\]/);
});

test('the visual editor follows the same section order as the public website', () => {
  const ids = ['home', 'about', 'stay', 'work', 'nearby', 'apply', 'contact'];
  let previous = -1;
  for (const id of ids) {
    const index = admin.indexOf(`editorId: '${id}'`);
    assert.ok(index > previous, `${id} is missing or out of order`);
    previous = index;
  }
  assert.match(admin, /function renderWebsiteEditor\(/);
  assert.match(admin, /data-editor-section/);
});

test('paid rooms and work-exchange rooms render inside the visual website editor', () => {
  assert.match(admin, /function renderStayEditor\([\s\S]*renderRoomEditors\(/);
  assert.match(admin, /function renderWorkEditor\([\s\S]*renderWorkRoomEditors\(/);
  assert.match(admin, /function renderWorkEditor\([\s\S]*renderListEditors\(/);
});

test('the website editor defaults to Chinese and switches one language at a time', () => {
  assert.match(admin, /EDITOR_LANGUAGE\s*=\s*'zh'/);
  assert.match(admin, /function toggleEditorLanguage\(/);
  assert.match(admin, /id:\s*'editorLanguageButton'/);
  assert.doesNotMatch(admin, /English，可留空/);
});

test('collecting a Chinese draft preserves English, photos, and legacy sheet values', () => {
  const nodes = {
    f_hero_eyebrow: { value: '修改後的中文' },
    r0_name: { value: '修改後的房名' },
    lirules_0_zh: { value: '修改後的章則' }
  };
  const runtime = loadAdminRuntime(nodes);
  runtime.CONTENT = {
    settings: {
      hero_eyebrow: '原中文', hero_eyebrow_en: 'English copy',
      hero_photos: 'https://example.com/hero.jpg', legacy_key: 'keep me'
    },
    rooms: [{ name: '原房名', name_en: 'English room', description: '', description_en: '', unit: '', unit_en: '', note: '', note_en: '', price: '', photos: 'room.jpg' }],
    work_rooms: [],
    rules: [{ zh: '原章則', en: 'English rule' }],
    duties_out: [],
    duties_in: []
  };
  runtime.EDITOR_LANGUAGE = 'zh';

  const settings = runtime.collectSettings();
  const rooms = runtime.collectRooms();
  const rules = runtime.collectListItems('rules');

  assert.equal(settings.hero_eyebrow, '修改後的中文');
  assert.equal(settings.hero_eyebrow_en, 'English copy');
  assert.equal(settings.hero_photos, 'https://example.com/hero.jpg');
  assert.equal(settings.legacy_key, 'keep me');
  assert.equal(rooms[0].name, '修改後的房名');
  assert.equal(rooms[0].name_en, 'English room');
  assert.equal(rooms[0].photos, 'room.jpg');
  assert.deepEqual({ ...rules[0] }, { zh: '修改後的章則', en: 'English rule' });
});

test('the normal content save excludes photo and legacy settings managed elsewhere', () => {
  const nodes = {
    f_hero_eyebrow: { value: '新的首頁文字' },
    f_show_home: { checked: true }
  };
  const runtime = loadAdminRuntime(nodes);
  runtime.CONTENT = {
    settings: {
      hero_eyebrow: '原文字', hero_eyebrow_en: 'English copy',
      hero_photos: 'https://example.com/hero.jpg', legacy_key: 'keep me'
    },
    rooms: [], work_rooms: [], rules: [], duties_out: [], duties_in: []
  };
  runtime.EDITOR_LANGUAGE = 'zh';

  const payload = runtime.collectPayload();

  assert.deepEqual({ ...payload.settings }, { show_home: 'true', hero_eyebrow: '新的首頁文字' });
});

test('language switching preserves the draft before rendering the other language', () => {
  const runtime = loadAdminRuntime();
  const calls = [];
  runtime.preserveDraftContent = () => calls.push('preserve');
  runtime.renderSections = () => calls.push('render');
  runtime.EDITOR_LANGUAGE = 'zh';

  runtime.toggleEditorLanguage();

  assert.equal(runtime.EDITOR_LANGUAGE, 'en');
  assert.equal(runtime.ACTIVE_ADMIN_PAGE, 'website');
  assert.deepEqual([...calls], ['preserve', 'render']);
});

test('the visual editor does not expose technical CMS labels', () => {
  for (const label of ['上方小標', '主要按鈕文字', '次要按鈕文字', '特色標籤：地點', '照片角標']) {
    assert.doesNotMatch(admin, new RegExp(label));
  }
});

test('the admin shows the schedule and updates statuses through an authenticated call', () => {
  assert.match(admin, /function renderSchedule\(/);
  assert.match(admin, /CONTENT\.schedule/);
  assert.match(admin, /runAuth\(\s*'updateScheduleStatus'\s*,/);
  assert.match(admin, /CONTENT\.schedule\s*=\s*result\.schedule/);
  assert.match(admin, /replaceScheduleCard\(/);
  assert.match(admin, /row\.details/);
  assert.match(admin, /row\.photo_url/);
  assert.match(admin, /查看本人照片/);
  for (const status of ['新申請', '已聯絡', '已確認', '已完成', '已取消']) assert.match(admin, new RegExp(status));
  for (const column of ['人數', '數量', '排程提醒']) assert.match(admin, new RegExp(column));
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
  assert.match(admin, /runAuth\(\s*'saveList'\s*,\s*meta\.name\s*,\s*collectSaveListItems\(meta\.name\)\s*\)/);
});

test('an empty new list row survives language switching but is omitted from the sheet save', () => {
  const nodes = { lirules_0_zh: { value: '' } };
  const runtime = loadAdminRuntime(nodes);
  runtime.CONTENT = { rules: [{ zh: '', en: '' }] };
  runtime.EDITOR_LANGUAGE = 'zh';

  assert.equal(runtime.collectListItems('rules').length, 1);
  assert.deepEqual([...runtime.collectSaveListItems('rules')], []);
});

test('global save serializes sheet writes so list saves cannot overwrite one another', async () => {
  const nodes = {
    saveBtn: { disabled: false },
    saveMsg: { className: '', textContent: '' },
    saveState: { className: '', textContent: '' }
  };
  const runtime = loadAdminRuntime(nodes);
  const starts = [];
  let active = 0;
  let maxActive = 0;
  runtime.CONTENT = { settings: {}, rooms: [], work_rooms: [], rules: [], duties_out: [], duties_in: [] };
  runtime.preserveDraftContent = () => {};
  runtime.collectPayload = () => ({ settings: {}, rooms: [], work_rooms: [] });
  runtime.collectListItems = (name) => [{ zh: name, en: '' }];
  runtime.runAuth = (name, target) => {
    starts.push(name === 'saveList' ? target : name);
    active++;
    maxActive = Math.max(maxActive, active);
    return Promise.resolve().then(() => { active--; return { ok: true }; });
  };

  await runtime.saveAll();

  assert.equal(maxActive, 1);
  assert.deepEqual(starts, ['saveContent', 'rules', 'duties_out', 'duties_in']);
});

test('global save locks the editor and does not clear a change made after saving began', async () => {
  const appNode = { inert: false, setAttribute() {} };
  const nodes = {
    app: appNode,
    saveBtn: { disabled: false },
    saveMsg: { className: '', textContent: '' },
    saveState: { className: '', textContent: '' }
  };
  const runtime = loadAdminRuntime(nodes);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  runtime.CONTENT = { settings: {}, rooms: [], work_rooms: [], rules: [], duties_out: [], duties_in: [] };
  runtime.preserveDraftContent = () => {};
  runtime.collectPayload = () => ({ settings: {}, rooms: [], work_rooms: [] });
  runtime.collectListItems = () => [];
  runtime.runAuth = () => gate.then(() => ({ ok: true }));

  const saving = runtime.saveAll();
  assert.equal(appNode.inert, true);
  assert.equal(nodes.saveBtn.disabled, true);
  runtime.markDirty();
  release();
  await saving;

  assert.equal(appNode.inert, false);
  assert.equal(nodes.saveBtn.disabled, false);
  assert.equal(runtime.HAS_UNSAVED_CHANGES, true);
  assert.equal(nodes.saveState.textContent, '有尚未儲存的修改');
});

test('photo writes and global save share one editor write lock', async () => {
  const nodes = {
    app: { inert: false, setAttribute() {} },
    saveBtn: { disabled: false },
    saveMsg: { className: '', textContent: '' }
  };
  const runtime = loadAdminRuntime(nodes);
  let calls = 0;
  runtime.runAuth = () => { calls++; return Promise.resolve({ ok: true }); };

  assert.equal(runtime.beginEditorWrite(), true);
  assert.equal(await runtime.saveAll(), false);
  assert.equal(calls, 0);
  runtime.endEditorWrite();
  assert.equal(nodes.app.inert, false);
  assert.equal(nodes.saveBtn.disabled, false);
  assert.match(admin, /function persistOrder\([\s\S]*?beginEditorWrite\(\)/);
  assert.match(admin, /remove\.onclick\s*=\s*function\s*\(\)\s*\{[\s\S]*?beginEditorWrite\(\)/);
  assert.match(admin, /picker\.onchange\s*=\s*function\s*\(\)\s*\{[\s\S]*?beginEditorWrite\(\)/);
});

test('the rules editor does not ask the owner to maintain numbering', () => {
  assert.doesNotMatch(admin, /placeholder="順序"/);
  assert.match(admin, /編號會自動產生/);
});

test('each list item follows the active editor language and offers a delete control', () => {
  assert.match(admin, /listFieldId\(listName,\s*index,\s*EDITOR_LANGUAGE\)/);
  assert.match(admin, /刪除這一項/);
});

test('removed photo helper copy is not editable in the admin', () => {
  for (const key of ['hero_badge_sky', 'hero_photo_title', 'hero_photo_hint', 'scenery_heading', 'scenery1_label', 'scenery2_label', 'scenery3_label']) {
    assert.doesNotMatch(admin, new RegExp(`key:\\s*'${key}'`));
  }
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
