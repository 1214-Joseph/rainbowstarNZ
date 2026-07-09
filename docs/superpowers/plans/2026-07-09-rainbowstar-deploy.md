# 彩虹星民宿 Rainbowstar 上線與內容管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把設計稿壓平成可上線的靜態網站，擴充既有 Apps Script 後端（修掉三個缺陷），做出密碼保護的後台頁讓業者自行改文字、傳照片、編換宿章程，並部署到 Cloudflare Pages。

**Architecture:** 公開站是零外部依賴的靜態檔（`site/index.html` + `site/app.js`），放 Cloudflare Pages。唯一的動態層是一支容器繫結的 Google Apps Script Web App，`doGet` 供內容 JSON、`doPost` 收表單並寄信、`?page=admin` 以 HtmlService 供出同源後台頁。資料存在 Google 試算表（內容 + 表單回應）與 Google Drive（照片）。

**Tech Stack:** Vanilla HTML/CSS/JS（無框架、無打包工具）、Google Apps Script（V8）、Google Sheets、Google Drive、Gmail (`MailApp`)、Cloudflare Pages。測試用 Node 內建 `node --test`（零相依），DOM 行為用 Playwright 在真實瀏覽器驗證。

---

## Global Constraints

以下為專案級要求，**每個 Task 的驗收都隱含包含本節**。

1. **零外部執行期相依**：公開站不得載入 unpkg、React、ReactDOM、Babel、`support.js`，或任何第三方 CDN 的 JS/CSS。**唯一允許的外部資源是 Google Fonts**（`Newsreader`、`Hanken Grotesk`、`Noto Serif TC`、`Noto Sans TC`、`Caveat`）——它是設計識別的一部分。
2. **零 npm 執行期相依**：`package.json` 只用於跑測試，且 **`dependencies` 與 `devDependencies` 皆須為空**。測試一律用 Node 內建的 `node:test` 與 `node:assert/strict`。
3. **Apps Script 相容**：`apps-script/*.js` 須能原封不動貼進 Apps Script 編輯器（V8 runtime）。禁止 `require`／`import`／`module.exports` 出現在 top-level；匯出一律包在 `if (typeof module !== 'undefined' && module.exports)` 守衛內。
4. **⚠️ 每個後台函式必須自行授權**：Web App 存取權為「任何人」，任何人載入 `?page=admin` 後即可直接呼叫 `google.script.run.saveContent(...)`。同源**不等於**已授權。除 `verifyPasscode` 外，**所有** `google.script.run` 可呼叫函式的第一個參數皆為 `token`，且進入時第一行必須是 `assertAuthorized_(token);`。
5. **⚠️ `?img=<fileId>` 必須限制範圍**：供圖前須確認該檔案位於 `PHOTO_ROOT_FOLDER_ID` 之下，否則回 404。未驗證等於把業者整個 Drive 變成公開讀取代理。
6. **表單永不拒絕**：`doPost` 不得因欄位缺漏而拒絕寫入。一律落表，可疑資料以 `資料檢查` 欄標記。理由：訪客端可能讀不到回應（見 Task 21），拒絕等於靜默丟失真實詢問。
7. **內容真實來源＝設計稿** `claude_design/彩虹星民宿 Rainbowstar.dc.html`。舊版 `claude_design/uploads/rainbowstar-site/index.html` **僅供參考，不得複製其內容或版型**。
8. **回應分頁沿用中文命名**：`住宿申請`、`換宿申請`；標題列為 `時間` + 各欄中文標籤 + `資料檢查`。
9. **秘密不入版控**：`ADMIN_PASSCODE`、`PHOTO_ROOT_FOLDER_ID` 存 Apps Script Script Properties；`notify_email` 存試算表 `settings` 分頁。三者皆不得出現在 repo 任何檔案。
10. **前端設定單一改動點**：`site/index.html` 內僅有一行 `window.RAINBOWSTAR_CONFIG={WEBAPP_URL:"..."}`。交接換帳號時只改這行。
11. **每個 Task 結束時必須 commit**，且 `npm test` 全綠。各 Task 標示的測試數量僅供參考，**判準是「全部通過、無跳過」**，不是數字相符。
12. **重複程式碼政策（已裁決，勿「修正」）**：
    - `splitUrls` 在 `apps-script/lib.js`、`site/app.js`、`apps-script/Admin.html` **各一份，刻意保留**。三者分屬 Apps Script 全域、瀏覽器 `<script src>`、HtmlService inline 三種執行環境，無模組系統可共享。函式僅 12 行且三處各有測試涵蓋。**Reviewer 不應要求合併。**
    - 換宿清單的 23 條中英文**只有一個真實來源**：`sheet-template/workexchange_lists.csv`。`site/app.js` 的 `DEFAULT_LISTS` 由 `scripts/build-defaults.js` 產生並入版控，**不得手動編輯**。
    - Node 端的 CSV 讀取器只有一份：`scripts/csv.js`，由測試與產生器共用。

### 對 spec 的一處刻意偏離（已評估）

Spec §6.1 第 9 點只要求檔名為 `index.html`。本計畫將行為抽到**同源**的 `site/app.js`，而非全部內嵌。理由：內嵌的 JS 無法被 `node --test` 直接測試，而三個必修缺陷有兩個在前端邏輯裡。`app.js` 是同源靜態檔，**不違反** Spec §17 的驗收條件（「無 React / Babel / support.js 外部請求」）。Cloudflare Pages 與 GitHub Pages 皆原生支援。

### 休假制度：做五休二（已確認，並須修補一處漏改）

業者已將休假制度由「做六休一」改為「**做五休二**」，但當時**只改了設計稿的 `RULES` 陣列**（`dc.html:506`），同一份檔案的換宿數據卡（`dc.html:140`）沒有同步更新。

| 出處 | 內容 | 判定 |
|---|---|---|
| 設計稿 `RULES` 陣列 (`dc.html:506`) | **做五休二** | ✅ 正確，業者已更新 |
| 設計稿數據卡 (`dc.html:140`) | 做六休一 | ❌ 漏改的殘留 |
| 舊版 index.html (`:217`) | 做六休一 | ❌ 更早的版本 |

因此「做六休一」**不是**另一個版本的事實，而是一處未同步的舊值。本計畫全站統一為**做五休二**，並在 Task 12 修補數據卡。這不是待確認事項。

---

## File Structure

```
rainbowstar/
├── package.json                      # 只為跑 node --test，零相依
├── site/
│   ├── index.html                    # 壓平後的公開站（markup + 設定行）
│   └── app.js                        # 公開站全部行為（可被 node 測試）
├── apps-script/
│   ├── lib.js                        # 純函式：無 Apps Script 全域，100% 可單元測試
│   ├── Code.js                       # doGet / doPost / 後台伺服端函式
│   └── Admin.html                    # 後台頁 UI（HtmlService template）
├── sheet-template/
│   ├── settings.csv
│   ├── rooms.csv
│   └── workexchange_lists.csv        # 換宿清單的唯一真實來源
├── scripts/
│   ├── csv.js                        # Node 端唯一的 CSV 讀取器（測試 + 產生器共用）
│   └── build-defaults.js             # 由 CSV 產生 app.js 的 DEFAULT_LISTS 區塊
├── tests/
│   ├── lib.test.js                   # apps-script/lib.js
│   ├── code.test.js                  # apps-script/Code.js（以假的 SpreadsheetApp 等注入）
│   ├── app.test.js                   # site/app.js 的純函式
│   ├── admin.test.js                 # Admin.html 的靜態授權檢查
│   └── seed.test.js                  # 三份 CSV 的完整性
└── HANDOFF.md                        # 部署 + 交接說明（取代舊 SETUP.md）
```

**責任邊界：**
- `lib.js` — 不碰任何 Google 全域。字串處理、欄位表、列組裝、標題列校正、可疑資料判定、清單排序。全部可測。
- `Code.js` — 只做「取得 Google 物件 → 交給 `lib.js` → 寫回」。所有讀寫函式接受 `ss` / `folder` 參數以便注入假物件。
- `app.js` — 前端。純函式（語言挑選、URL 切分）可測；DOM 函式以 Playwright 驗證。
- `Admin.html` — 只有 UI 與 `google.script.run` 呼叫，不含商業邏輯。

---

## Task 1: 專案骨架與測試跑道

**Files:**
- Create: `package.json`
- Create: `apps-script/lib.js`
- Create: `tests/lib.test.js`

**Interfaces:**
- Consumes: 無（第一個 Task）
- Produces:
  - `splitUrls(value: string|null): string[]` — 以換行/逗號/直線分隔，去空白、去重複、去空字串
  - `joinUrls(urls: string[]): string` — 以 `\n` 串接
  - 模組匯出守衛樣式：`if (typeof module !== 'undefined' && module.exports) module.exports = {...}`

---

- [ ] **Step 1: 建立 `package.json`**

```json
{
  "name": "rainbowstar",
  "private": true,
  "version": "1.0.0",
  "description": "Rainbowstar farmstay website: static front end, Google Apps Script back end.",
  "type": "commonjs",
  "scripts": {
    "test": "node --test tests/**/*.test.js"
  }
}
```

不要加任何 `dependencies` 或 `devDependencies`（Global Constraint 2）。

> **為何不是 `node --test tests/`？** 在 Windows + Node v24 下，Node 會把 `tests` 當成單一測試檔並報 `Cannot find module '...\tests'`。改用 glob 即可，且已實測會抓到後續新增的測試檔。

- [ ] **Step 2: 確認 Node 版本足夠**

Run: `node --version`
Expected: `v18.0.0` 或更高（`node --test` 需要 v18+；glob 展開需 v21+，本機為 v24.15.0）。

- [ ] **Step 3: 寫失敗的測試**

Create `tests/lib.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../apps-script/lib.js');

test('splitUrls splits on newline, comma and pipe', () => {
  assert.deepEqual(lib.splitUrls('a.jpg,b.jpg'), ['a.jpg', 'b.jpg']);
  assert.deepEqual(lib.splitUrls('a.jpg\nb.jpg'), ['a.jpg', 'b.jpg']);
  assert.deepEqual(lib.splitUrls('a.jpg|b.jpg'), ['a.jpg', 'b.jpg']);
});

test('splitUrls trims whitespace and drops duplicates and blanks', () => {
  assert.deepEqual(lib.splitUrls('  a.jpg , \n b.jpg |a.jpg,,'), ['a.jpg', 'b.jpg']);
});

test('splitUrls returns an empty array for empty, null and undefined', () => {
  assert.deepEqual(lib.splitUrls(''), []);
  assert.deepEqual(lib.splitUrls(null), []);
  assert.deepEqual(lib.splitUrls(undefined), []);
});

test('joinUrls joins with newlines and tolerates an empty array', () => {
  assert.equal(lib.joinUrls(['a', 'b']), 'a\nb');
  assert.equal(lib.joinUrls([]), '');
});
```

- [ ] **Step 4: 執行測試，確認它失敗**

Run: `npm test`
Expected: FAIL — `Cannot find module '../apps-script/lib.js'`

- [ ] **Step 5: 寫最小實作**

Create `apps-script/lib.js`:

```js
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
```

- [ ] **Step 6: 執行測試，確認它通過**

Run: `npm test`
Expected: PASS — 4 tests passing

- [ ] **Step 7: Commit**

```bash
git add package.json apps-script/lib.js tests/lib.test.js
git commit -m "Add project skeleton and a dependency-free test runner"
```

---

## Task 2: 語言挑選（修正「雙語被中文覆蓋」缺陷）

這裡有一個容易搞錯的區別，**兩種語言 fallback 語意不同**：

- `settingValue()` 給 `[data-content]` 元素用。這些元素在 HTML 裡**本來就帶有正確的 `data-en` 英文字**。所以英文模式下若試算表缺 `<key>_en`，必須回傳 `undefined`，讓呼叫端**跳過該元素**、保留 HTML 原生英文。這正是缺陷修正。
- `pickRow()` 給房型／清單這類**完全由資料產生**的內容用。它們在 HTML 裡沒有任何備援文字，所以英文模式下缺 `_en` 時**必須退回中文**，否則畫面會空白。

**Files:**
- Modify: `apps-script/lib.js`
- Modify: `tests/lib.test.js`

**Interfaces:**
- Consumes: Task 1 的 `splitUrls` / `joinUrls`
- Produces:
  - `settingValue(settings: object, key: string, lang: 'zh'|'en'): string|undefined` — 英文模式缺 `_en` 時回 `undefined`（**不退回中文**）
  - `pickRow(row: object, base: string, lang: 'zh'|'en'): string|undefined` — 英文模式缺 `_en` 時**退回中文**

---

- [ ] **Step 1: 寫失敗的測試**

Append to `tests/lib.test.js`:

```js
test('settingValue returns the Chinese value in Chinese mode', () => {
  assert.equal(lib.settingValue({ tagline: '中文標語' }, 'tagline', 'zh'), '中文標語');
});

test('settingValue returns the English value when an _en key exists', () => {
  const settings = { tagline: '中文標語', tagline_en: 'English tagline' };
  assert.equal(lib.settingValue(settings, 'tagline', 'en'), 'English tagline');
});

test('settingValue returns undefined in English mode when _en is missing, so the caller keeps the built-in data-en text', () => {
  assert.equal(lib.settingValue({ tagline: '中文標語' }, 'tagline', 'en'), undefined);
  assert.equal(lib.settingValue({ tagline: '中文標語', tagline_en: '' }, 'tagline', 'en'), undefined);
  assert.equal(lib.settingValue({ tagline: '中文標語', tagline_en: null }, 'tagline', 'en'), undefined);
});

test('settingValue returns undefined when the key is absent or blank in either language', () => {
  assert.equal(lib.settingValue({}, 'tagline', 'zh'), undefined);
  assert.equal(lib.settingValue({ tagline: '' }, 'tagline', 'zh'), undefined);
  assert.equal(lib.settingValue(null, 'tagline', 'zh'), undefined);
});

test('pickRow falls back to Chinese in English mode, because data-driven rows have no built-in English', () => {
  assert.equal(lib.pickRow({ name: '主屋' }, 'name', 'en'), '主屋');
  assert.equal(lib.pickRow({ name: '主屋', name_en: 'Dorm' }, 'name', 'en'), 'Dorm');
  assert.equal(lib.pickRow({ name: '主屋', name_en: '' }, 'name', 'en'), '主屋');
});

test('pickRow returns undefined only when both languages are empty', () => {
  assert.equal(lib.pickRow({ name: '' }, 'name', 'zh'), undefined);
  assert.equal(lib.pickRow({}, 'name', 'en'), undefined);
});
```

- [ ] **Step 2: 執行測試，確認它失敗**

Run: `npm test`
Expected: FAIL — `lib.settingValue is not a function`

- [ ] **Step 3: 寫實作**

Add to `apps-script/lib.js`, above the export block:

```js
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
```

Update the export block:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    splitUrls: splitUrls,
    joinUrls: joinUrls,
    settingValue: settingValue,
    pickRow: pickRow
  };
}
```

- [ ] **Step 4: 執行測試，確認它通過**

Run: `npm test`
Expected: PASS — 10 tests passing

- [ ] **Step 5: Commit**

```bash
git add apps-script/lib.js tests/lib.test.js
git commit -m "Distinguish the two language-fallback semantics

Elements carrying data-content already hold correct English in the markup,
so a missing _en value must leave them alone rather than overwrite them with
Chinese. Rows rendered purely from data have no such fallback and still need
Chinese when English is absent."
```

---

## Task 3: 表單欄位表、複選串接、標題列校正（修正「標題列漂移」缺陷）

**Files:**
- Modify: `apps-script/lib.js`
- Modify: `tests/lib.test.js`

**Interfaces:**
- Consumes: Task 2
- Produces:
  - `ACCOM_FIELDS: Array<[key: string, label: string]>` — 35 組，順序＝舊 Google 表單順序
  - `WORK_FIELDS: Array<[key: string, label: string]>` — 31 組
  - `joinMultiValue(parameters: object, parameter: object, key: string, sep?: string): string` — 預設分隔 `' / '`
  - `buildHeaderRow(fields): string[]` — `['時間', ...labels, '資料檢查']`
  - `headerNeedsUpdate(existing: any[], expected: string[]): boolean`
  - `buildResponseRow(fields, get: (key)=>any, timestamp: Date, flag: string): any[]`

---

- [ ] **Step 1: 寫失敗的測試**

Append to `tests/lib.test.js`:

```js
test('ACCOM_FIELDS and WORK_FIELDS are [key, label] pairs of the expected size', () => {
  assert.equal(lib.ACCOM_FIELDS.length, 35);
  assert.equal(lib.WORK_FIELDS.length, 31);
  for (const pair of lib.ACCOM_FIELDS.concat(lib.WORK_FIELDS)) {
    assert.equal(pair.length, 2);
    assert.equal(typeof pair[0], 'string');
    assert.equal(typeof pair[1], 'string');
  }
});

test('ACCOM_FIELDS starts with the identity fields in old-form order', () => {
  assert.deepEqual(lib.ACCOM_FIELDS.slice(0, 3), [
    ['name_en', '英文姓名'],
    ['name_zh', '中文姓名'],
    ['birthday', '出生日期']
  ]);
});

test('joinMultiValue joins repeated checkbox keys with the default separator', () => {
  const parameters = { addons: ['M1 加購早餐 NZD$10', 'M2 加購午餐 NZD$12'] };
  const parameter = { addons: 'M2 加購午餐 NZD$12' };
  assert.equal(lib.joinMultiValue(parameters, parameter, 'addons'), 'M1 加購早餐 NZD$10 / M2 加購午餐 NZD$12');
});

test('joinMultiValue returns the scalar when only one value was submitted', () => {
  assert.equal(lib.joinMultiValue({ gender: ['女性'] }, { gender: '女性' }, 'gender'), '女性');
});

test('joinMultiValue returns an empty string for a missing key', () => {
  assert.equal(lib.joinMultiValue({}, {}, 'nope'), '');
});

test('buildHeaderRow wraps the labels with a timestamp and a data-check column', () => {
  const fields = [['a', '甲'], ['b', '乙']];
  assert.deepEqual(lib.buildHeaderRow(fields), ['時間', '甲', '乙', '資料檢查']);
});

test('headerNeedsUpdate is true for an empty sheet', () => {
  assert.equal(lib.headerNeedsUpdate([], ['時間', '甲', '資料檢查']), true);
  assert.equal(lib.headerNeedsUpdate(null, ['時間', '甲', '資料檢查']), true);
});

test('headerNeedsUpdate is false when the existing header already matches', () => {
  assert.equal(lib.headerNeedsUpdate(['時間', '甲', '資料檢查'], ['時間', '甲', '資料檢查']), false);
});

test('headerNeedsUpdate ignores surrounding whitespace', () => {
  assert.equal(lib.headerNeedsUpdate([' 時間 ', '甲', '資料檢查'], ['時間', '甲', '資料檢查']), false);
});

test('headerNeedsUpdate detects drift in length and in order', () => {
  assert.equal(lib.headerNeedsUpdate(['時間', '甲'], ['時間', '甲', '資料檢查']), true);
  assert.equal(lib.headerNeedsUpdate(['時間', '乙', '甲', '資料檢查'], ['時間', '甲', '乙', '資料檢查']), true);
});

test('buildResponseRow lines every value up under its header', () => {
  const fields = [['a', '甲'], ['b', '乙']];
  const values = { a: 'A', b: 'B' };
  const stamp = new Date('2026-07-09T00:00:00Z');
  assert.deepEqual(
    lib.buildResponseRow(fields, (k) => values[k] || '', stamp, '⚠️ 電話可疑'),
    [stamp, 'A', 'B', '⚠️ 電話可疑']
  );
});

test('buildResponseRow has exactly the width of buildHeaderRow', () => {
  const stamp = new Date();
  const row = lib.buildResponseRow(lib.ACCOM_FIELDS, () => '', stamp, '');
  assert.equal(row.length, lib.buildHeaderRow(lib.ACCOM_FIELDS).length);
});
```

- [ ] **Step 2: 執行測試，確認它失敗**

Run: `npm test`
Expected: FAIL — `Cannot read properties of undefined (reading 'length')`（`lib.ACCOM_FIELDS` 尚未存在）

- [ ] **Step 3: 寫實作**

Add to `apps-script/lib.js`, above the export block. 這兩張表逐字沿用既有 `claude_design/uploads/rainbowstar-site/apps-script/Code.gs:18-42`，該檔已與實際表單逐欄比對過、無遺漏欄位：

```js
/** Accommodation application fields. Order matches the original Google Form. */
var ACCOM_FIELDS = [
  ['name_en', '英文姓名'], ['name_zh', '中文姓名'], ['birthday', '出生日期'], ['gender', '性別'],
  ['country', '國家'], ['passport', 'Passport號碼'], ['email', 'E-mail'], ['phone', '連絡電話'],
  ['room_type', '想預定的房型'], ['guests', '入住人數'], ['checkin', '入住日期'], ['checkout', '退房日期'],
  ['need_addon', '是否需加購服務'], ['addons', '需要加購的項目'], ['addon_remark', '加購備註(T1~T4)'],
  ['ack_phone', '已記下連絡電話'], ['agree_price', '已了解價格與付款方式'],
  ['pickup_route', '接機-國際/國內'], ['pickup_airline', '接機-航空'], ['pickup_from', '接機-出發地點'],
  ['pickup_flight', '接機-班機號碼'], ['pickup_date', '接機-抵達日期'], ['pickup_time', '接機-抵達時間'], ['pickup_pax', '接機-人數'],
  ['dropoff_route', '送機-國際/國內'], ['dropoff_airline', '送機-航空'], ['dropoff_date', '送機-起飛日期'], ['dropoff_time', '送機-起飛時間'], ['dropoff_pax', '送機-人數'],
  ['city_dir', '市區接送-方向'], ['city_date', '市區接送-日期'], ['city_time', '市區接送-時間'], ['city_place', '市區接送-地點'], ['city_pax', '市區接送-人數'],
  ['meal_avoid', '餐點忌諱的食物']
];

/** Work-exchange application fields. Order matches the original Google Form. */
var WORK_FIELDS = [
  ['name_en', '英文姓名'], ['name_zh', '中文姓名'], ['birthday', '出生日期'], ['age', '年齡'], ['gender', '性別'],
  ['country', '國家'], ['email', 'E-mail'], ['phone', '連絡電話'], ['address', '居住地址'],
  ['emergency_name', '緊急連絡人'], ['emergency_relation', '與緊急聯絡人的關係'], ['emergency_phone', '緊急連絡電話'],
  ['stay_length', '申請換宿時間'], ['start_date', '希望換宿日期'], ['end_date', '結束日期'],
  ['blog_fb', '部落格或FB'], ['photo_url', '照片連結'], ['languages', '會說的語言'],
  ['has_license', '國際認可駕照'], ['interests', '興趣'], ['health_ok', '身心狀況良好'], ['health_detail', '狀況說明(若填無)'],
  ['has_exchange_exp', '類似換宿經驗'], ['exchange_exp_detail', '經驗簡述'],
  ['education', '學歷'], ['work_exp', '工作經驗'], ['self_intro', '自我介紹'],
  ['agree_rules', '同意換宿章則'], ['agree_work', '了解工作內容'], ['agree_responsible', '願意負責內容'], ['remark', '備註']
];

/**
 * A checkbox group posts the same key several times, so e.parameters holds an
 * array while e.parameter holds only the last value.
 */
function joinMultiValue(parameters, parameter, key, sep) {
  var separator = sep || ' / ';
  var many = parameters && parameters[key];
  if (many && many.length > 1) return many.join(separator);
  var one = parameter && parameter[key];
  return isBlank_(one) ? '' : String(one);
}

function buildHeaderRow(fields) {
  return ['時間'].concat(fields.map(function (f) { return f[1]; })).concat(['資料檢查']);
}

/**
 * The original code wrote the header once and never looked at it again, so any
 * later change to the field list silently misaligned every column. Callers
 * compare and rewrite instead.
 */
function headerNeedsUpdate(existing, expected) {
  if (!existing || existing.length !== expected.length) return true;
  for (var i = 0; i < expected.length; i++) {
    if (String(existing[i]).trim() !== expected[i]) return true;
  }
  return false;
}

function buildResponseRow(fields, get, timestamp, flag) {
  return [timestamp].concat(fields.map(function (f) { return get(f[0]); })).concat([flag]);
}
```

Update the export block to add: `ACCOM_FIELDS`, `WORK_FIELDS`, `joinMultiValue`, `buildHeaderRow`, `headerNeedsUpdate`, `buildResponseRow`.

- [ ] **Step 4: 執行測試，確認它通過**

Run: `npm test`
Expected: PASS — 22 tests passing

- [ ] **Step 5: Commit**

```bash
git add apps-script/lib.js tests/lib.test.js
git commit -m "Add form field tables, multi-value joining and header reconciliation

The response sheet header was previously written only when the sheet was
empty and never checked again, so reordering a field list would leave old
headers sitting above newly ordered data. headerNeedsUpdate lets the caller
detect and repair that drift."
```

---

## Task 4: 可疑資料判定與通知信組裝

**Files:**
- Modify: `apps-script/lib.js`
- Modify: `tests/lib.test.js`

**Interfaces:**
- Consumes: Task 3（`ACCOM_FIELDS`、`WORK_FIELDS`）
- Produces:
  - `checkSuspicious(get: (key)=>any): string` — 無問題回 `''`，否則回 `'⚠️ 電話可疑、Email可疑'` 這種字串
  - `buildEmailSubject(type: 'accommodation'|'workexchange', get, flag): string`
  - `buildEmailBody(type, fields, get, flag): string`
  - `isValidEmail(value): boolean`

---

- [ ] **Step 1: 寫失敗的測試**

Append to `tests/lib.test.js`:

```js
const getter = (obj) => (key) => (obj[key] === undefined ? '' : obj[key]);

test('checkSuspicious passes clean data', () => {
  assert.equal(checkClean(), '');
  function checkClean() {
    return lib.checkSuspicious(getter({
      name_en: 'Mei Wang', name_zh: '王美', phone: '0211234567',
      email: 'mei@example.com', address: '123 Main Street'
    }));
  }
});

test('checkSuspicious flags a phone with fewer than six digits', () => {
  assert.match(lib.checkSuspicious(getter({ phone: '123' })), /電話可疑/);
});

test('checkSuspicious ignores an empty phone rather than flagging it', () => {
  assert.equal(lib.checkSuspicious(getter({ phone: '' })), '');
});

test('checkSuspicious flags repeated-character and too-short names', () => {
  assert.match(lib.checkSuspicious(getter({ name_en: 'aaaa' })), /英文姓名可疑/);
  assert.match(lib.checkSuspicious(getter({ name_en: 'a' })), /英文姓名可疑/);
  assert.match(lib.checkSuspicious(getter({ name_zh: '啊啊啊' })), /中文姓名可疑/);
});

test('checkSuspicious flags a malformed email and a too-short address', () => {
  assert.match(lib.checkSuspicious(getter({ email: 'not-an-email' })), /Email可疑/);
  assert.match(lib.checkSuspicious(getter({ address: 'ab' })), /地址可疑/);
});

test('checkSuspicious joins several problems into one note', () => {
  const flag = lib.checkSuspicious(getter({ phone: '1', email: 'bad' }));
  assert.match(flag, /^⚠️ /);
  assert.match(flag, /電話可疑/);
  assert.match(flag, /Email可疑/);
});

test('isValidEmail accepts ordinary addresses and rejects malformed ones', () => {
  assert.equal(lib.isValidEmail('a@b.co'), true);
  assert.equal(lib.isValidEmail('a@b'), false);
  assert.equal(lib.isValidEmail('a b@c.co'), false);
  assert.equal(lib.isValidEmail(''), false);
});

test('buildEmailSubject names the application type and the applicant', () => {
  const subject = lib.buildEmailSubject('workexchange', getter({ name_zh: '王美' }), '');
  assert.equal(subject, '【彩虹星民宿】新換宿申請 Work Exchange - 王美');
});

test('buildEmailSubject falls back through Chinese name, English name, then email', () => {
  assert.match(lib.buildEmailSubject('accommodation', getter({ name_en: 'Mei' }), ''), /- Mei$/);
  assert.match(lib.buildEmailSubject('accommodation', getter({ email: 'm@e.co' }), ''), /- m@e\.co$/);
});

test('buildEmailSubject appends the suspicious-data flag in parentheses', () => {
  const subject = lib.buildEmailSubject('accommodation', getter({ name_zh: '王美' }), '⚠️ 電話可疑');
  assert.match(subject, /（⚠️ 電話可疑）$/);
});

test('buildEmailBody lists only the fields that were filled in', () => {
  const fields = [['a', '甲'], ['b', '乙'], ['c', '丙']];
  const body = lib.buildEmailBody('accommodation', fields, getter({ a: 'A', c: 'C' }), '');
  assert.match(body, /甲： A/);
  assert.match(body, /丙： C/);
  assert.doesNotMatch(body, /乙/);
});

test('buildEmailBody leads with a warning line when data looks suspicious', () => {
  const body = lib.buildEmailBody('accommodation', [['a', '甲']], getter({ a: 'A' }), '⚠️ 電話可疑');
  assert.match(body, /⚠️ 系統提醒：⚠️ 電話可疑/);
});
```

- [ ] **Step 2: 執行測試，確認它失敗**

Run: `npm test`
Expected: FAIL — `lib.checkSuspicious is not a function`

- [ ] **Step 3: 寫實作**

Add to `apps-script/lib.js`, above the export block:

```js
function isRepeatedChars_(value) {
  return /^(.)\1+$/.test(value);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

/**
 * A backstop for obviously fake submissions. It only ever annotates; it must
 * never cause a submission to be rejected, because the visitor may not be able
 * to read our response (see Global Constraint 6).
 */
function checkSuspicious(get) {
  var notes = [];

  var rawPhone = String(get('phone') || '').trim();
  if (rawPhone && rawPhone.replace(/[^0-9]/g, '').length < 6) notes.push('電話可疑');

  var nameEn = String(get('name_en') || '').trim();
  if (nameEn && (isRepeatedChars_(nameEn) || nameEn.length < 2)) notes.push('英文姓名可疑');

  var nameZh = String(get('name_zh') || '').trim();
  if (nameZh && isRepeatedChars_(nameZh)) notes.push('中文姓名可疑');

  var email = String(get('email') || '').trim();
  if (email && !isValidEmail(email)) notes.push('Email可疑');

  var address = String(get('address') || '').trim();
  if (address && (isRepeatedChars_(address) || address.length < 4)) notes.push('地址可疑');

  return notes.length ? '⚠️ ' + notes.join('、') : '';
}

function typeLabel_(type) {
  return type === 'workexchange' ? '換宿申請 Work Exchange' : '住宿申請 Accommodation';
}

function applicantName_(get) {
  return get('name_zh') || get('name_en') || get('email') || '(未具名)';
}

function buildEmailSubject(type, get, flag) {
  var suffix = flag ? '（' + flag + '）' : '';
  return '【彩虹星民宿】新' + typeLabel_(type) + ' - ' + applicantName_(get) + suffix;
}

function buildEmailBody(type, fields, get, flag) {
  var lines = ['你收到一筆新的' + typeLabel_(type) + '：', ''];
  if (flag) {
    lines.push('⚠️ 系統提醒：' + flag + '（此筆資料可能為測試或亂填，請留意）', '');
  }
  fields.forEach(function (field) {
    var value = get(field[0]);
    if (!isBlank_(value)) lines.push(field[1] + '： ' + value);
  });
  lines.push('', '— 這封信由民宿網站自動寄出 —');
  return lines.join('\n');
}
```

Update the export block to add: `checkSuspicious`, `isValidEmail`, `buildEmailSubject`, `buildEmailBody`.

- [ ] **Step 4: 執行測試，確認它通過**

Run: `npm test`
Expected: PASS — 34 tests passing

- [ ] **Step 5: Commit**

```bash
git add apps-script/lib.js tests/lib.test.js
git commit -m "Add suspicious-data heuristics and notification email builders

The heuristic only annotates a submission, never rejects it, because the
visitor's browser cannot read an opaque no-cors response and would show
success regardless."
```

---

## Task 5: 換宿章程與工作內容清單的分組與排序

**Files:**
- Modify: `apps-script/lib.js`
- Modify: `tests/lib.test.js`

**Interfaces:**
- Consumes: Task 4
- Produces:
  - `LIST_NAMES: string[]` — `['rules', 'duties_out', 'duties_in']`
  - `groupLists(rows: Array<{list, order, text_zh, text_en}>): {rules: Item[], duties_out: Item[], duties_in: Item[]}`
    其中 `Item = {zh: string, en: string}`，依 `order` 由小到大排序
  - `listRowsFrom(listName: string, items: Item[]): Array<[list, order, text_zh, text_en]>` — 後台存檔時把 UI 的順序寫回列（`order` 從 1 開始重新編號）

---

- [ ] **Step 1: 寫失敗的測試**

Append to `tests/lib.test.js`:

```js
test('groupLists sorts each list by its order column', () => {
  const rows = [
    { list: 'rules', order: 2, text_zh: '第二', text_en: 'Second' },
    { list: 'rules', order: 1, text_zh: '第一', text_en: 'First' },
    { list: 'duties_out', order: 1, text_zh: '餵貓', text_en: 'Feed the cats' }
  ];
  const grouped = lib.groupLists(rows);
  assert.deepEqual(grouped.rules, [
    { zh: '第一', en: 'First' },
    { zh: '第二', en: 'Second' }
  ]);
  assert.deepEqual(grouped.duties_out, [{ zh: '餵貓', en: 'Feed the cats' }]);
  assert.deepEqual(grouped.duties_in, []);
});

test('groupLists always returns all three keys, even with no rows', () => {
  assert.deepEqual(lib.groupLists([]), { rules: [], duties_out: [], duties_in: [] });
  assert.deepEqual(lib.groupLists(null), { rules: [], duties_out: [], duties_in: [] });
});

test('groupLists ignores unknown list names and fully blank rows', () => {
  const rows = [
    { list: 'nonsense', order: 1, text_zh: 'x', text_en: 'x' },
    { list: 'rules', order: 1, text_zh: '', text_en: '' },
    { list: 'rules', order: 2, text_zh: '保留', text_en: '' }
  ];
  assert.deepEqual(lib.groupLists(rows).rules, [{ zh: '保留', en: '' }]);
});

test('groupLists treats a missing or non-numeric order as zero', () => {
  const rows = [
    { list: 'rules', order: 1, text_zh: 'b', text_en: '' },
    { list: 'rules', order: '', text_zh: 'a', text_en: '' }
  ];
  assert.deepEqual(lib.groupLists(rows).rules.map((i) => i.zh), ['a', 'b']);
});

test('listRowsFrom renumbers order from one, preserving the given sequence', () => {
  const items = [{ zh: '甲', en: 'A' }, { zh: '乙', en: 'B' }];
  assert.deepEqual(lib.listRowsFrom('rules', items), [
    ['rules', 1, '甲', 'A'],
    ['rules', 2, '乙', 'B']
  ]);
});

test('listRowsFrom drops items that are blank in both languages', () => {
  const items = [{ zh: '甲', en: '' }, { zh: '', en: '' }, { zh: '', en: 'C' }];
  assert.deepEqual(lib.listRowsFrom('duties_in', items), [
    ['duties_in', 1, '甲', ''],
    ['duties_in', 2, '', 'C']
  ]);
});

test('LIST_NAMES holds exactly the three editable lists', () => {
  assert.deepEqual(lib.LIST_NAMES, ['rules', 'duties_out', 'duties_in']);
});
```

- [ ] **Step 2: 執行測試，確認它失敗**

Run: `npm test`
Expected: FAIL — `lib.groupLists is not a function`

- [ ] **Step 3: 寫實作**

Add to `apps-script/lib.js`, above the export block:

```js
var LIST_NAMES = ['rules', 'duties_out', 'duties_in'];

function groupLists(rows) {
  var grouped = { rules: [], duties_out: [], duties_in: [] };

  (rows || []).forEach(function (row) {
    var listName = String(row.list || '').trim();
    if (LIST_NAMES.indexOf(listName) < 0) return;

    var zh = String(row.text_zh === undefined || row.text_zh === null ? '' : row.text_zh).trim();
    var en = String(row.text_en === undefined || row.text_en === null ? '' : row.text_en).trim();
    if (!zh && !en) return;

    var order = Number(row.order);
    grouped[listName].push({ order: isNaN(order) ? 0 : order, zh: zh, en: en });
  });

  LIST_NAMES.forEach(function (listName) {
    grouped[listName].sort(function (a, b) { return a.order - b.order; });
    grouped[listName] = grouped[listName].map(function (item) {
      return { zh: item.zh, en: item.en };
    });
  });

  return grouped;
}

function listRowsFrom(listName, items) {
  var rows = [];
  (items || []).forEach(function (item) {
    var zh = String(item.zh || '').trim();
    var en = String(item.en || '').trim();
    if (!zh && !en) return;
    rows.push([listName, rows.length + 1, zh, en]);
  });
  return rows;
}
```

Update the export block to add: `LIST_NAMES`, `groupLists`, `listRowsFrom`.

- [ ] **Step 4: 執行測試，確認它通過**

Run: `npm test`
Expected: PASS — 41 tests passing

- [ ] **Step 5: Commit**

```bash
git add apps-script/lib.js tests/lib.test.js
git commit -m "Group and order the editable work-exchange lists

The admin panel hands back an ordered array, so listRowsFrom renumbers from
one rather than trusting whatever order column happened to arrive."
```

---

## Task 6: `Code.js` 讀取層與內容 JSON

`Code.js` 的規則：**所有讀寫函式都接受 `ss` 參數**，絕不在函式內部呼叫 `SpreadsheetApp.getActiveSpreadsheet()`。只有 `doGet` / `doPost` / 後台入口這些最外層函式才取得 `ss`。這樣底下每一層都能用假物件測試。

**Files:**
- Create: `apps-script/Code.js`
- Create: `tests/code.test.js`

**Interfaces:**
- Consumes: Task 5 全部 `lib.js` 匯出
- Produces:
  - `SHEET_SETTINGS = 'settings'`, `SHEET_ROOMS = 'rooms'`, `SHEET_LISTS = 'workexchange_lists'`, `SHEET_STAY = '住宿申請'`, `SHEET_WORK = '換宿申請'`
  - `readSettings_(ss): object` — key/value；略過標題列
  - `readRooms_(ss): object[]` — 以標題列為鍵
  - `readListRows_(ss): object[]` — 以標題列為鍵（`list`/`order`/`text_zh`/`text_en`）
  - `buildContentPayload_(ss): {ok, settings, rooms, rules, duties_out, duties_in}`

---

- [ ] **Step 1: 寫失敗的測試**

Create `tests/code.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const code = require('../apps-script/Code.js');

/** A stand-in for a Sheet: getDataRange().getValues() returns a 2-D array. */
function fakeSheet(values) {
  return {
    getLastRow: () => values.length,
    getDataRange: () => ({ getValues: () => values })
  };
}

/** A stand-in for a Spreadsheet: getSheetByName returns a fakeSheet or null. */
function fakeSpreadsheet(sheetsByName) {
  return { getSheetByName: (name) => sheetsByName[name] || null };
}

test('readSettings_ turns column A/B into a key-value object and skips the header', () => {
  const ss = fakeSpreadsheet({
    settings: fakeSheet([
      ['key', 'value'],
      ['site_name', '彩虹星民宿 Rainbowstar'],
      ['tagline_en', 'English tagline'],
      ['', 'orphaned value with no key']
    ])
  });
  assert.deepEqual(code.readSettings_(ss), {
    site_name: '彩虹星民宿 Rainbowstar',
    tagline_en: 'English tagline'
  });
});

test('readSettings_ returns an empty object when the tab is missing', () => {
  assert.deepEqual(code.readSettings_(fakeSpreadsheet({})), {});
});

test('readRooms_ maps each row onto the header row and skips blank rows', () => {
  const ss = fakeSpreadsheet({
    rooms: fakeSheet([
      ['name', 'name_en', 'price', 'photos'],
      ['主屋 Dorm Room', 'Main House Dorm Room', 35, 'a.jpg\nb.jpg'],
      ['', '', '', ''],
      ['自搭帳棚 Tent', 'Own Tent', 20, '']
    ])
  });
  assert.deepEqual(code.readRooms_(ss), [
    { name: '主屋 Dorm Room', name_en: 'Main House Dorm Room', price: 35, photos: 'a.jpg\nb.jpg' },
    { name: '自搭帳棚 Tent', name_en: 'Own Tent', price: 20, photos: '' }
  ]);
});

test('readRooms_ returns an empty array when the tab is missing or holds only a header', () => {
  assert.deepEqual(code.readRooms_(fakeSpreadsheet({})), []);
  assert.deepEqual(code.readRooms_(fakeSpreadsheet({ rooms: fakeSheet([['name']]) })), []);
});

test('readListRows_ maps the workexchange_lists tab onto its header', () => {
  const ss = fakeSpreadsheet({
    workexchange_lists: fakeSheet([
      ['list', 'order', 'text_zh', 'text_en'],
      ['rules', 1, '第一條', 'Rule one']
    ])
  });
  assert.deepEqual(code.readListRows_(ss), [
    { list: 'rules', order: 1, text_zh: '第一條', text_en: 'Rule one' }
  ]);
});

test('buildContentPayload_ assembles settings, rooms and the three lists', () => {
  const ss = fakeSpreadsheet({
    settings: fakeSheet([['key', 'value'], ['site_name', 'Rainbowstar']]),
    rooms: fakeSheet([['name', 'price'], ['主屋', 35]]),
    workexchange_lists: fakeSheet([
      ['list', 'order', 'text_zh', 'text_en'],
      ['duties_out', 1, '餵貓', 'Feed the cats'],
      ['rules', 2, '第二條', 'Rule two'],
      ['rules', 1, '第一條', 'Rule one']
    ])
  });
  const payload = code.buildContentPayload_(ss);
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.settings, { site_name: 'Rainbowstar' });
  assert.deepEqual(payload.rooms, [{ name: '主屋', price: 35 }]);
  assert.deepEqual(payload.rules, [{ zh: '第一條', en: 'Rule one' }, { zh: '第二條', en: 'Rule two' }]);
  assert.deepEqual(payload.duties_out, [{ zh: '餵貓', en: 'Feed the cats' }]);
  assert.deepEqual(payload.duties_in, []);
});

test('buildContentPayload_ still succeeds when every content tab is missing', () => {
  const payload = code.buildContentPayload_(fakeSpreadsheet({}));
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.rooms, []);
  assert.deepEqual(payload.rules, []);
});
```

- [ ] **Step 2: 執行測試，確認它失敗**

Run: `npm test`
Expected: FAIL — `Cannot find module '../apps-script/Code.js'`

- [ ] **Step 3: 寫實作**

Create `apps-script/Code.js`:

```js
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

if (typeof module !== 'undefined' && module.exports) {
  Object.assign(global, require('./lib.js'));
  module.exports = {
    SHEET_SETTINGS: SHEET_SETTINGS,
    SHEET_ROOMS: SHEET_ROOMS,
    SHEET_LISTS: SHEET_LISTS,
    SHEET_STAY: SHEET_STAY,
    SHEET_WORK: SHEET_WORK,
    readSettings_: readSettings_,
    readTableRows_: readTableRows_,
    readRooms_: readRooms_,
    readListRows_: readListRows_,
    buildContentPayload_: buildContentPayload_
  };
}
```

> **為什麼是 `Object.assign(global, require('./lib.js'))`？** 在 Apps Script 裡，`lib.js` 的函式本來就是全域的，`Code.js` 可以直接呼叫 `groupLists(...)`。在 Node 測試裡沒有這層全域共享，所以在守衛內把 `lib.js` 的匯出灌進 `global`，讓 `Code.js` 的程式碼**一字不改**就能在兩邊執行。守衛外的程式碼完全沒有 `require`。

- [ ] **Step 4: 執行測試，確認它通過**

Run: `npm test`
Expected: PASS — 48 tests passing

- [ ] **Step 5: Commit**

```bash
git add apps-script/Code.js tests/code.test.js
git commit -m "Add the spreadsheet readers and the public content payload

Readers take the spreadsheet as a parameter rather than reaching for the
active one, so a fake spreadsheet drives them under test."
```

---

## Task 7: `doPost` — 收表單、校正標題列、永不拒絕、寄信

**Files:**
- Modify: `apps-script/Code.js`
- Modify: `tests/code.test.js`

**Interfaces:**
- Consumes: Task 6 的 `readSettings_`、Task 3–4 的 `lib.js` 函式
- Produces:
  - `appendResponse_(ss, sheetName, fields, get, timestamp, flag): void` — 分頁不存在則建立；標題列漂移則重寫
  - `sendNotifyEmail_(settings, type, fields, get, flag): void` — 收件人取 `settings.notify_email`，退回 `Session.getEffectiveUser().getEmail()`
  - `handlePost_(ss, e, timestamp): {ok: boolean, message?: string, error?: string}` — `doPost` 的可測核心
  - `doPost(e)` — 只負責取得 `ss` 與包成 JSON 輸出

---

- [ ] **Step 1: 寫失敗的測試**

Append to `tests/code.test.js`:

```js
/** A writable stand-in that records appendRow / getRange().setValues() calls. */
function fakeWritableSheet(values) {
  const rows = values.map((r) => r.slice());
  return {
    rows,
    getLastRow: () => rows.length,
    getDataRange: () => ({ getValues: () => rows }),
    appendRow: (row) => rows.push(row.slice()),
    getRange: (startRow, startCol, numRows, numCols) => ({
      setValues: (newValues) => {
        for (let i = 0; i < numRows; i++) {
          rows[startRow - 1 + i] = newValues[i].slice();
        }
      }
    })
  };
}

function fakeWritableSpreadsheet(sheetsByName) {
  const sheets = Object.assign({}, sheetsByName);
  return {
    sheets,
    getSheetByName: (name) => sheets[name] || null,
    insertSheet: (name) => {
      sheets[name] = fakeWritableSheet([]);
      return sheets[name];
    }
  };
}

const STAMP = new Date('2026-07-09T12:00:00Z');

test('appendResponse_ creates the tab and writes the header before the first row', () => {
  const ss = fakeWritableSpreadsheet({});
  const fields = [['a', '甲'], ['b', '乙']];
  code.appendResponse_(ss, '住宿申請', fields, (k) => ({ a: 'A', b: 'B' }[k] || ''), STAMP, '');

  const sheet = ss.getSheetByName('住宿申請');
  assert.deepEqual(sheet.rows[0], ['時間', '甲', '乙', '資料檢查']);
  assert.deepEqual(sheet.rows[1], [STAMP, 'A', 'B', '']);
});

test('appendResponse_ repairs a drifted header instead of writing under stale labels', () => {
  const ss = fakeWritableSpreadsheet({
    住宿申請: fakeWritableSheet([['時間', '乙', '甲', '資料檢查'], [STAMP, 'old', 'row', '']])
  });
  const fields = [['a', '甲'], ['b', '乙']];
  code.appendResponse_(ss, '住宿申請', fields, (k) => ({ a: 'A', b: 'B' }[k] || ''), STAMP, '');

  const sheet = ss.getSheetByName('住宿申請');
  assert.deepEqual(sheet.rows[0], ['時間', '甲', '乙', '資料檢查'], 'header rewritten');
  assert.deepEqual(sheet.rows[2], [STAMP, 'A', 'B', ''], 'new row appended in the new order');
});

test('appendResponse_ leaves a correct header untouched', () => {
  const ss = fakeWritableSpreadsheet({
    住宿申請: fakeWritableSheet([['時間', '甲', '資料檢查']])
  });
  code.appendResponse_(ss, '住宿申請', [['a', '甲']], () => 'A', STAMP, '');
  assert.equal(ss.getSheetByName('住宿申請').rows.length, 2);
});

test('handlePost_ writes an accommodation row and reports success', () => {
  const ss = fakeWritableSpreadsheet({
    settings: fakeWritableSheet([['key', 'value'], ['notify_email', 'owner@example.com']])
  });
  const sent = [];
  global.MailApp = { sendEmail: (to, subject, body, opts) => sent.push({ to, subject, body, opts }) };

  const result = code.handlePost_(ss, {
    parameter: { type: 'accommodation', name_zh: '王美', email: 'mei@example.com', phone: '0211234567' },
    parameters: { addons: ['M1 加購早餐 NZD$10', 'M2 加購午餐 NZD$12'] }
  }, STAMP);

  assert.equal(result.ok, true);
  const rows = ss.getSheetByName('住宿申請').rows;
  assert.deepEqual(rows[0], code.__lib.buildHeaderRow(code.__lib.ACCOM_FIELDS));
  const addonsColumn = code.__lib.ACCOM_FIELDS.findIndex((f) => f[0] === 'addons') + 1;
  assert.equal(rows[1][addonsColumn], 'M1 加購早餐 NZD$10 / M2 加購午餐 NZD$12');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'owner@example.com');
  assert.equal(sent[0].opts.replyTo, 'mei@example.com');
});

test('handlePost_ routes a work-exchange submission to its own tab', () => {
  const ss = fakeWritableSpreadsheet({});
  global.MailApp = { sendEmail: () => {} };
  global.Session = { getEffectiveUser: () => ({ getEmail: () => 'fallback@example.com' }) };

  const result = code.handlePost_(ss, {
    parameter: { type: 'workexchange', name_zh: '王美' },
    parameters: {}
  }, STAMP);

  assert.equal(result.ok, true);
  assert.ok(ss.getSheetByName('換宿申請'));
  assert.equal(ss.getSheetByName('住宿申請'), null);
});

test('handlePost_ never rejects a submission with missing fields', () => {
  const ss = fakeWritableSpreadsheet({});
  global.MailApp = { sendEmail: () => {} };
  global.Session = { getEffectiveUser: () => ({ getEmail: () => 'fallback@example.com' }) };

  const result = code.handlePost_(ss, { parameter: {}, parameters: {} }, STAMP);

  assert.equal(result.ok, true, 'an empty submission is still recorded');
  assert.equal(ss.getSheetByName('住宿申請').rows.length, 2);
});

test('handlePost_ still records the row when sending the email throws', () => {
  const ss = fakeWritableSpreadsheet({});
  global.MailApp = { sendEmail: () => { throw new Error('quota exceeded'); } };
  global.Session = { getEffectiveUser: () => ({ getEmail: () => 'fallback@example.com' }) };

  const result = code.handlePost_(ss, {
    parameter: { type: 'accommodation', name_zh: '王美' },
    parameters: {}
  }, STAMP);

  assert.equal(result.ok, true);
  assert.equal(ss.getSheetByName('住宿申請').rows.length, 2);
});

test('handlePost_ flags suspicious data in the data-check column', () => {
  const ss = fakeWritableSpreadsheet({});
  global.MailApp = { sendEmail: () => {} };
  global.Session = { getEffectiveUser: () => ({ getEmail: () => 'fallback@example.com' }) };

  code.handlePost_(ss, {
    parameter: { type: 'accommodation', name_zh: '王美', phone: '12' },
    parameters: {}
  }, STAMP);

  const rows = ss.getSheetByName('住宿申請').rows;
  assert.match(rows[1][rows[1].length - 1], /電話可疑/);
});
```

- [ ] **Step 2: 執行測試，確認它失敗**

Run: `npm test`
Expected: FAIL — `code.appendResponse_ is not a function`

- [ ] **Step 3: 寫實作**

Add to `apps-script/Code.js`, above the export block:

```js
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
 * The testable core of doPost.
 *
 * It never rejects. The visitor may be posting with mode:'no-cors', in which
 * case the browser cannot read this result at all and would report success
 * regardless — so a rejection here would silently lose a real enquiry.
 */
function handlePost_(ss, e, timestamp) {
  var parameter = (e && e.parameter) || {};
  var parameters = (e && e.parameters) || {};

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
```

Update the export block to add `appendResponse_`, `sendNotifyEmail_`, `handlePost_`, and expose `lib` for the tests:

```js
if (typeof module !== 'undefined' && module.exports) {
  var lib = require('./lib.js');
  Object.assign(global, lib);
  module.exports = {
    SHEET_SETTINGS: SHEET_SETTINGS,
    SHEET_ROOMS: SHEET_ROOMS,
    SHEET_LISTS: SHEET_LISTS,
    SHEET_STAY: SHEET_STAY,
    SHEET_WORK: SHEET_WORK,
    readSettings_: readSettings_,
    readTableRows_: readTableRows_,
    readRooms_: readRooms_,
    readListRows_: readListRows_,
    buildContentPayload_: buildContentPayload_,
    appendResponse_: appendResponse_,
    sendNotifyEmail_: sendNotifyEmail_,
    handlePost_: handlePost_,
    __lib: lib
  };
}
```

- [ ] **Step 4: 執行測試，確認它通過**

Run: `npm test`
Expected: PASS — 56 tests passing

- [ ] **Step 5: Commit**

```bash
git add apps-script/Code.js tests/code.test.js
git commit -m "Record every submission, repair header drift, and never reject

A submission posted with mode:'no-cors' yields an opaque response the visitor
cannot read, so the page shows success whatever we return. Rejecting an
incomplete submission would therefore discard a real enquiry without anyone
noticing. Suspicious data is annotated instead. Email failures are swallowed
because the row is already safe in the sheet."
```

---

## Task 8: `doGet` 路由、後台授權、範圍受限的供圖端點

**兩個安全閘在這個 Task 建立。** Web App 的存取權是「任何人」，所以：

- 任何人載入 `?page=admin` 後，都能從瀏覽器主控台直接呼叫 `google.script.run.saveContent(...)`。密碼只擋 UI。因此 `verifyPasscode` 之外的**每個**後台函式都必須先 `assertAuthorized_(token)`。
- `?img=<fileId>` 若不驗證歸屬，就是把「業者有權讀取的任何 Drive 檔案」開放給全世界。因此必須確認該檔案的上層資料夾在 `PHOTO_ROOT_FOLDER_ID` 之下。

**Files:**
- Modify: `apps-script/Code.js`
- Modify: `tests/code.test.js`

**Interfaces:**
- Consumes: Task 7
- Produces:
  - `verifyPasscode(passcode: string): {ok: boolean, token?: string}` — 唯一不需 token 的後台函式
  - `assertAuthorized_(token: string): void` — token 無效即 `throw new Error('未授權')`
  - `photoUrlFor_(fileId: string): string` — `https://lh3.googleusercontent.com/d/<fileId>=w1600`
  - `fileIdFromUrl_(url: string): string|null` — 從 CDN 網址或 `?img=` 網址反解 fileId
  - `isInsidePhotoRoot_(file, rootFolderId): boolean`
  - `doGet(e)` — 依 `page` / `img` 分派

---

- [ ] **Step 1: 寫失敗的測試**

Append to `tests/code.test.js`:

```js
function stubScriptProperties(props) {
  global.PropertiesService = {
    getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null) })
  };
}

function stubCache() {
  const store = new Map();
  global.CacheService = {
    getScriptCache: () => ({
      put: (k, v) => store.set(k, v),
      get: (k) => (store.has(k) ? store.get(k) : null),
      remove: (k) => store.delete(k)
    })
  };
  return store;
}

test('verifyPasscode rejects a wrong passcode and issues no token', () => {
  stubScriptProperties({ ADMIN_PASSCODE: 'letmein' });
  stubCache();
  global.Utilities = { getUuid: () => 'uuid-1' };

  assert.deepEqual(code.verifyPasscode('wrong'), { ok: false });
});

test('verifyPasscode rejects everything when no passcode is configured', () => {
  stubScriptProperties({});
  stubCache();
  global.Utilities = { getUuid: () => 'uuid-1' };

  assert.deepEqual(code.verifyPasscode(''), { ok: false });
  assert.deepEqual(code.verifyPasscode('anything'), { ok: false });
});

test('verifyPasscode issues a token that assertAuthorized_ then accepts', () => {
  stubScriptProperties({ ADMIN_PASSCODE: 'letmein' });
  stubCache();
  global.Utilities = { getUuid: () => 'uuid-1' };

  const result = code.verifyPasscode('letmein');
  assert.equal(result.ok, true);
  assert.equal(result.token, 'uuid-1');
  assert.doesNotThrow(() => code.assertAuthorized_('uuid-1'));
});

test('assertAuthorized_ throws for an unknown, empty or null token', () => {
  stubScriptProperties({ ADMIN_PASSCODE: 'letmein' });
  stubCache();

  assert.throws(() => code.assertAuthorized_('nope'), /未授權/);
  assert.throws(() => code.assertAuthorized_(''), /未授權/);
  assert.throws(() => code.assertAuthorized_(null), /未授權/);
});

test('photoUrlFor_ builds a Google CDN link and fileIdFromUrl_ reverses it', () => {
  const url = code.photoUrlFor_('FILE123');
  assert.equal(url, 'https://lh3.googleusercontent.com/d/FILE123=w1600');
  assert.equal(code.fileIdFromUrl_(url), 'FILE123');
});

test('fileIdFromUrl_ also reads the proxy form and returns null for anything else', () => {
  assert.equal(code.fileIdFromUrl_('https://script.google.com/macros/s/AKfy/exec?img=FILE123'), 'FILE123');
  assert.equal(code.fileIdFromUrl_('https://example.com/cat.jpg'), null);
  assert.equal(code.fileIdFromUrl_(''), null);
});

test('isInsidePhotoRoot_ accepts a file whose parent chain reaches the photo root', () => {
  const root = { getId: () => 'ROOT' };
  const sub = { getId: () => 'SUB', getParents: () => iterator([root]) };
  const file = { getParents: () => iterator([sub]) };
  assert.equal(code.isInsidePhotoRoot_(file, 'ROOT'), true);
});

test('isInsidePhotoRoot_ rejects a file living anywhere else in Drive', () => {
  const elsewhere = { getId: () => 'PRIVATE', getParents: () => iterator([]) };
  const file = { getParents: () => iterator([elsewhere]) };
  assert.equal(code.isInsidePhotoRoot_(file, 'ROOT'), false);
});

test('isInsidePhotoRoot_ rejects an orphan file with no parents', () => {
  assert.equal(code.isInsidePhotoRoot_({ getParents: () => iterator([]) }, 'ROOT'), false);
});

/** Mimics Apps Script's FolderIterator. */
function iterator(items) {
  let i = 0;
  return { hasNext: () => i < items.length, next: () => items[i++] };
}
```

- [ ] **Step 2: 執行測試，確認它失敗**

Run: `npm test`
Expected: FAIL — `code.verifyPasscode is not a function`

- [ ] **Step 3: 寫實作**

Add to `apps-script/Code.js`, above the export block:

```js
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
```

Update the export block to add `verifyPasscode`, `assertAuthorized_`, `photoUrlFor_`, `fileIdFromUrl_`, `isInsidePhotoRoot_`.

- [ ] **Step 4: 執行測試，確認它通過**

Run: `npm test`
Expected: PASS — 65 tests passing

- [ ] **Step 5: Commit**

```bash
git add apps-script/Code.js tests/code.test.js
git commit -m "Gate the admin functions and scope the image proxy

The web app is deployed for Anyone, so loading the admin page is enough to
call its server functions from the console. A passcode now buys a cached
session token that every other admin function demands.

The image endpoint walks a file's parent chain and refuses anything outside
the configured photo folder, so it cannot be used to read arbitrary files
from the owner's Drive."
```

---

## Task 9: 後台伺服端 — 讀取、寫回文字與房型、編輯清單

**Files:**
- Modify: `apps-script/Code.js`
- Modify: `tests/code.test.js`

**Interfaces:**
- Consumes: Task 8 的 `assertAuthorized_`；Task 6 的讀取層；Task 5 的 `groupLists` / `listRowsFrom`
- Produces:
  - `ROOM_COLUMNS: string[]` — `['name','name_en','description','description_en','price','unit','unit_en','note','note_en','photos']`
  - `upsertSettings_(ss, settings: object): void` — 逐鍵更新或新增，**不動未提及的鍵**（`hero_photos` 等由照片函式維護）
  - `writeRooms_(ss, rooms: object[]): void` — 以 `ROOM_COLUMNS` 重寫整個分頁
  - `writeLists_(ss, lists: {rules, duties_out, duties_in}): void` — 重寫整個分頁
  - `loadAdminContent(token): {ok, settings, rooms, rules, duties_out, duties_in}`
  - `saveContent(token, payload: {settings, rooms}): {ok: true}`
  - `saveList(token, listName, items: Item[]): {ok: true, items}`

> **`upsertSettings_` 為何不整頁重寫？** 照片欄位（`hero_photos`、`scenery1_photos`…）也住在 `settings` 分頁，但由 Task 10 的照片函式維護。若「儲存文字」整頁重寫，就會把同時間上傳的照片洗掉。逐鍵 upsert 讓兩條路互不干擾。

---

- [ ] **Step 1: 把測試用的假試算表補上寫入能力**

Replace `fakeWritableSheet` in `tests/code.test.js` with this fuller version（其餘測試不受影響）:

```js
/** A writable stand-in supporting appendRow, setValue, setValues and clear. */
function fakeWritableSheet(values) {
  const rows = values.map((r) => r.slice());

  function ensure(rowIndex, colCount) {
    while (rows.length <= rowIndex) rows.push([]);
    while (rows[rowIndex].length < colCount) rows[rowIndex].push('');
  }

  return {
    rows,
    getLastRow: () => rows.length,
    getDataRange: () => ({ getValues: () => rows }),
    appendRow: (row) => rows.push(row.slice()),
    clear: () => { rows.length = 0; },
    getRange: (startRow, startCol, numRows, numCols) => ({
      setValue: (value) => {
        ensure(startRow - 1, startCol);
        rows[startRow - 1][startCol - 1] = value;
      },
      setValues: (newValues) => {
        const height = numRows === undefined ? newValues.length : numRows;
        for (let i = 0; i < height; i++) {
          ensure(startRow - 1 + i, startCol - 1 + newValues[i].length);
          for (let j = 0; j < newValues[i].length; j++) {
            rows[startRow - 1 + i][startCol - 1 + j] = newValues[i][j];
          }
        }
      }
    })
  };
}
```

- [ ] **Step 2: 寫失敗的測試**

Append to `tests/code.test.js`:

```js
function authorizedToken() {
  stubScriptProperties({ ADMIN_PASSCODE: 'letmein', PHOTO_ROOT_FOLDER_ID: 'ROOT' });
  stubCache();
  global.Utilities = { getUuid: () => 'uuid-1' };
  return code.verifyPasscode('letmein').token;
}

test('upsertSettings_ updates existing keys and appends new ones, leaving others alone', () => {
  const sheet = fakeWritableSheet([
    ['key', 'value'],
    ['site_name', '舊站名'],
    ['hero_photos', 'a.jpg']
  ]);
  const ss = fakeWritableSpreadsheet({ settings: sheet });

  code.upsertSettings_(ss, { site_name: '新站名', tagline_en: 'New tagline' });

  assert.deepEqual(sheet.rows[1], ['site_name', '新站名']);
  assert.deepEqual(sheet.rows[2], ['hero_photos', 'a.jpg'], 'photo keys survive a text save');
  assert.deepEqual(sheet.rows[3], ['tagline_en', 'New tagline']);
});

test('upsertSettings_ creates the tab with a header when it is missing', () => {
  const ss = fakeWritableSpreadsheet({});
  code.upsertSettings_(ss, { site_name: 'Rainbowstar' });

  const sheet = ss.getSheetByName('settings');
  assert.deepEqual(sheet.rows[0], ['key', 'value']);
  assert.deepEqual(sheet.rows[1], ['site_name', 'Rainbowstar']);
});

test('writeRooms_ rewrites the tab under the canonical column order', () => {
  const ss = fakeWritableSpreadsheet({ rooms: fakeWritableSheet([['name'], ['舊房型']]) });

  code.writeRooms_(ss, [{ name: '主屋', name_en: 'Dorm', price: 35, photos: 'a.jpg' }]);

  const sheet = ss.getSheetByName('rooms');
  assert.deepEqual(sheet.rows[0], code.ROOM_COLUMNS);
  assert.equal(sheet.rows.length, 2, 'the old room is gone');
  assert.equal(sheet.rows[1][code.ROOM_COLUMNS.indexOf('name')], '主屋');
  assert.equal(sheet.rows[1][code.ROOM_COLUMNS.indexOf('price')], 35);
  assert.equal(sheet.rows[1][code.ROOM_COLUMNS.indexOf('photos')], 'a.jpg');
  assert.equal(sheet.rows[1][code.ROOM_COLUMNS.indexOf('note_en')], '', 'absent fields become empty strings');
});

test('writeLists_ rewrites all three lists with orders renumbered from one', () => {
  const ss = fakeWritableSpreadsheet({});
  code.writeLists_(ss, {
    rules: [{ zh: '第一條', en: 'Rule one' }, { zh: '第二條', en: '' }],
    duties_out: [{ zh: '餵貓', en: 'Feed the cats' }],
    duties_in: []
  });

  const sheet = ss.getSheetByName('workexchange_lists');
  assert.deepEqual(sheet.rows[0], ['list', 'order', 'text_zh', 'text_en']);
  assert.deepEqual(sheet.rows[1], ['rules', 1, '第一條', 'Rule one']);
  assert.deepEqual(sheet.rows[2], ['rules', 2, '第二條', '']);
  assert.deepEqual(sheet.rows[3], ['duties_out', 1, '餵貓', 'Feed the cats']);
  assert.equal(sheet.rows.length, 4);
});

test('loadAdminContent and saveContent and saveList all refuse an invalid token', () => {
  authorizedToken();
  assert.throws(() => code.loadAdminContent('bad'), /未授權/);
  assert.throws(() => code.saveContent('bad', { settings: {}, rooms: [] }), /未授權/);
  assert.throws(() => code.saveList('bad', 'rules', []), /未授權/);
});

test('saveContent writes settings and rooms, then loadAdminContent reads them back', () => {
  const token = authorizedToken();
  const ss = fakeWritableSpreadsheet({});
  global.SpreadsheetApp = { getActiveSpreadsheet: () => ss };

  code.saveContent(token, {
    settings: { site_name: 'Rainbowstar', tagline: '標語' },
    rooms: [{ name: '主屋', price: 35, photos: '' }]
  });

  const loaded = code.loadAdminContent(token);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.settings.site_name, 'Rainbowstar');
  assert.equal(loaded.rooms[0].name, '主屋');
});

test('saveList replaces only the named list and leaves the other two intact', () => {
  const token = authorizedToken();
  const ss = fakeWritableSpreadsheet({
    workexchange_lists: fakeWritableSheet([
      ['list', 'order', 'text_zh', 'text_en'],
      ['rules', 1, '舊規則', 'Old rule'],
      ['duties_in', 1, '清潔', 'Cleaning']
    ])
  });
  global.SpreadsheetApp = { getActiveSpreadsheet: () => ss };

  const result = code.saveList(token, 'rules', [{ zh: '新規則', en: 'New rule' }]);

  assert.equal(result.ok, true);
  const lists = code.__lib.groupLists(code.readListRows_(ss));
  assert.deepEqual(lists.rules, [{ zh: '新規則', en: 'New rule' }]);
  assert.deepEqual(lists.duties_in, [{ zh: '清潔', en: 'Cleaning' }]);
});

test('saveList rejects an unknown list name', () => {
  const token = authorizedToken();
  global.SpreadsheetApp = { getActiveSpreadsheet: () => fakeWritableSpreadsheet({}) };
  assert.throws(() => code.saveList(token, 'nonsense', []), /未知的清單/);
});
```

- [ ] **Step 3: 執行測試，確認它失敗**

Run: `npm test`
Expected: FAIL — `code.upsertSettings_ is not a function`

- [ ] **Step 4: 寫實作**

Add to `apps-script/Code.js`, above the export block:

```js
var ROOM_COLUMNS = [
  'name', 'name_en', 'description', 'description_en',
  'price', 'unit', 'unit_en', 'note', 'note_en', 'photos'
];
var LIST_COLUMNS = ['list', 'order', 'text_zh', 'text_en'];

function sheetOrCreate_(ss, name, header) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (header) sheet.appendRow(header);
  }
  return sheet;
}

/**
 * Updates the given keys in place and appends the rest.
 *
 * Photo keys such as hero_photos live in this same tab but are maintained by
 * the photo functions, so a text save must not rewrite the whole sheet.
 */
function upsertSettings_(ss, settings) {
  var sheet = sheetOrCreate_(ss, SHEET_SETTINGS, ['key', 'value']);
  var values = sheet.getLastRow() ? sheet.getDataRange().getValues() : [];

  var rowByKey = {};
  for (var i = 0; i < values.length; i++) {
    var key = String(values[i][0] || '').trim();
    if (key && key.toLowerCase() !== 'key') rowByKey[key] = i + 1;
  }

  Object.keys(settings).forEach(function (key) {
    var value = settings[key] === undefined || settings[key] === null ? '' : settings[key];
    if (rowByKey[key]) {
      sheet.getRange(rowByKey[key], 2, 1, 1).setValue(value);
    } else {
      sheet.appendRow([key, value]);
    }
  });
}

function writeRooms_(ss, rooms) {
  var sheet = sheetOrCreate_(ss, SHEET_ROOMS, null);
  sheet.clear();

  var table = [ROOM_COLUMNS.slice()];
  (rooms || []).forEach(function (room) {
    table.push(ROOM_COLUMNS.map(function (column) {
      var value = room[column];
      return value === undefined || value === null ? '' : value;
    }));
  });
  sheet.getRange(1, 1, table.length, ROOM_COLUMNS.length).setValues(table);
}

function writeLists_(ss, lists) {
  var sheet = sheetOrCreate_(ss, SHEET_LISTS, null);
  sheet.clear();

  var table = [LIST_COLUMNS.slice()];
  LIST_NAMES.forEach(function (listName) {
    listRowsFrom(listName, lists[listName] || []).forEach(function (row) {
      table.push(row);
    });
  });
  sheet.getRange(1, 1, table.length, LIST_COLUMNS.length).setValues(table);
}

function loadAdminContent(token) {
  assertAuthorized_(token);
  return buildContentPayload_(SpreadsheetApp.getActiveSpreadsheet());
}

function saveContent(token, payload) {
  assertAuthorized_(token);
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  if (payload && payload.settings) upsertSettings_(ss, payload.settings);
  if (payload && payload.rooms) writeRooms_(ss, payload.rooms);

  return { ok: true };
}

function saveList(token, listName, items) {
  assertAuthorized_(token);
  if (LIST_NAMES.indexOf(listName) < 0) throw new Error('未知的清單 Unknown list: ' + listName);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lists = groupLists(readListRows_(ss));
  lists[listName] = items || [];
  writeLists_(ss, lists);

  return { ok: true, items: lists[listName] };
}
```

Update the export block to add `ROOM_COLUMNS`, `LIST_COLUMNS`, `sheetOrCreate_`, `upsertSettings_`, `writeRooms_`, `writeLists_`, `loadAdminContent`, `saveContent`, `saveList`.

- [ ] **Step 5: 執行測試，確認它通過**

Run: `npm test`
Expected: PASS — 73 tests passing

- [ ] **Step 6: Commit**

```bash
git add apps-script/Code.js tests/code.test.js
git commit -m "Add the admin panel's content readers and writers

Settings are upserted key by key rather than rewritten, because the photo
columns share that tab and are owned by the photo functions. Saving text
must not wipe a photo uploaded moments earlier."
```

---

## Task 10: 後台伺服端 — 照片上傳、刪除、排序

照片欄位的歸屬：

| section | 存放位置 |
|---|---|
| `hero` | `settings` 分頁的 `hero_photos` |
| `scenery-1` / `scenery-2` / `scenery-3` | `settings` 分頁的 `scenery1_photos` / `scenery2_photos` / `scenery3_photos` |
| `room-<i>`（`i` 為 0 起算的房型列序） | `rooms` 分頁第 `i` 列的 `photos` 欄 |

**Files:**
- Modify: `apps-script/Code.js`
- Modify: `tests/code.test.js`

**Interfaces:**
- Consumes: Task 9 的 `upsertSettings_` / `writeRooms_`；Task 8 的 `assertAuthorized_` / `photoUrlFor_` / `fileIdFromUrl_`
- Produces:
  - `settingsKeyForSection_(section): string|null`
  - `readPhotoUrls_(ss, section): string[]`
  - `writePhotoUrls_(ss, section, urls: string[]): void`
  - `folderForSection_(section): Folder` — 於 `PHOTO_ROOT_FOLDER_ID` 下取得或建立同名子資料夾
  - `uploadPhoto(token, section, filename, base64, mimeType): {ok: true, urls: string[]}`
  - `deletePhoto(token, section, url): {ok: true, urls: string[]}`
  - `reorderPhotos(token, section, orderedUrls): {ok: true, urls: string[]}`

---

- [ ] **Step 1: 寫失敗的測試**

Append to `tests/code.test.js`:

```js
test('settingsKeyForSection_ maps the hero and scenery sections, and nothing else', () => {
  assert.equal(code.settingsKeyForSection_('hero'), 'hero_photos');
  assert.equal(code.settingsKeyForSection_('scenery-2'), 'scenery2_photos');
  assert.equal(code.settingsKeyForSection_('room-0'), null);
  assert.equal(code.settingsKeyForSection_('nonsense'), null);
});

test('readPhotoUrls_ reads the hero list out of settings', () => {
  const ss = fakeWritableSpreadsheet({
    settings: fakeWritableSheet([['key', 'value'], ['hero_photos', 'a.jpg\nb.jpg']])
  });
  assert.deepEqual(code.readPhotoUrls_(ss, 'hero'), ['a.jpg', 'b.jpg']);
});

test('readPhotoUrls_ reads a room photo list by row index', () => {
  const ss = fakeWritableSpreadsheet({
    rooms: fakeWritableSheet([['name', 'photos'], ['主屋', 'x.jpg'], ['帳棚', 'y.jpg\nz.jpg']])
  });
  assert.deepEqual(code.readPhotoUrls_(ss, 'room-1'), ['y.jpg', 'z.jpg']);
});

test('readPhotoUrls_ returns an empty array for an out-of-range room', () => {
  const ss = fakeWritableSpreadsheet({ rooms: fakeWritableSheet([['name', 'photos']]) });
  assert.deepEqual(code.readPhotoUrls_(ss, 'room-9'), []);
});

test('writePhotoUrls_ stores the hero list back into settings', () => {
  const ss = fakeWritableSpreadsheet({ settings: fakeWritableSheet([['key', 'value']]) });
  code.writePhotoUrls_(ss, 'hero', ['a.jpg', 'b.jpg']);
  assert.deepEqual(code.readPhotoUrls_(ss, 'hero'), ['a.jpg', 'b.jpg']);
});

test('writePhotoUrls_ stores a room list without disturbing its neighbour', () => {
  const ss = fakeWritableSpreadsheet({
    rooms: fakeWritableSheet([['name', 'photos'], ['主屋', 'x.jpg'], ['帳棚', 'y.jpg']])
  });
  code.writePhotoUrls_(ss, 'room-0', ['new.jpg']);
  assert.deepEqual(code.readPhotoUrls_(ss, 'room-0'), ['new.jpg']);
  assert.deepEqual(code.readPhotoUrls_(ss, 'room-1'), ['y.jpg']);
});

/** Minimal DriveApp stand-in: records created files, hands back stable ids. */
function stubDrive() {
  const created = [];
  const subfolders = new Map();
  const trashed = [];

  const makeFolder = (id, name) => ({
    getId: () => id,
    getName: () => name,
    getFoldersByName: (childName) => {
      const found = subfolders.get(childName);
      return { hasNext: () => Boolean(found), next: () => found };
    },
    createFolder: (childName) => {
      const child = makeFolder('FOLDER_' + childName, childName);
      subfolders.set(childName, child);
      return child;
    },
    createFile: (blob) => {
      const file = {
        getId: () => 'FILE' + (created.length + 1),
        setSharing: () => file,
        setTrashed: (v) => trashed.push(file.getId()) && file
      };
      created.push({ blob, file });
      return file;
    }
  });

  const root = makeFolder('ROOT', 'Rainbowstar Photos');
  global.DriveApp = {
    getFolderById: (id) => (id === 'ROOT' ? root : (() => { throw new Error('no folder ' + id); })()),
    getFileById: (id) => ({ setTrashed: () => trashed.push(id) }),
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
    Permission: { VIEW: 'VIEW' }
  };
  global.Utilities = Object.assign({}, global.Utilities, {
    base64Decode: (s) => Buffer.from(s, 'base64'),
    newBlob: (bytes, mimeType, name) => ({ bytes, mimeType, name, setName: () => {} })
  });
  return { created, trashed };
}

test('uploadPhoto appends the new photo URL and returns the whole list', () => {
  const token = authorizedToken();
  const ss = fakeWritableSpreadsheet({ settings: fakeWritableSheet([['key', 'value'], ['hero_photos', 'old.jpg']]) });
  global.SpreadsheetApp = { getActiveSpreadsheet: () => ss };
  stubDrive();

  const result = code.uploadPhoto(token, 'hero', 'farm.jpg', 'aGVsbG8=', 'image/jpeg');

  assert.equal(result.ok, true);
  assert.deepEqual(result.urls, ['old.jpg', code.photoUrlFor_('FILE1')]);
  assert.deepEqual(code.readPhotoUrls_(ss, 'hero'), result.urls);
});

test('deletePhoto removes the URL from the sheet and trashes the Drive file', () => {
  const token = authorizedToken();
  const url = code.photoUrlFor_('FILE9');
  const ss = fakeWritableSpreadsheet({
    settings: fakeWritableSheet([['key', 'value'], ['hero_photos', 'keep.jpg\n' + url]])
  });
  global.SpreadsheetApp = { getActiveSpreadsheet: () => ss };
  const drive = stubDrive();

  const result = code.deletePhoto(token, 'hero', url);

  assert.deepEqual(result.urls, ['keep.jpg']);
  assert.deepEqual(drive.trashed, ['FILE9']);
});

test('deletePhoto still updates the sheet when the Drive file is already gone', () => {
  const token = authorizedToken();
  const ss = fakeWritableSpreadsheet({
    settings: fakeWritableSheet([['key', 'value'], ['hero_photos', 'a.jpg\nb.jpg']])
  });
  global.SpreadsheetApp = { getActiveSpreadsheet: () => ss };
  stubDrive();
  global.DriveApp.getFileById = () => { throw new Error('gone'); };

  assert.deepEqual(code.deletePhoto(token, 'hero', 'a.jpg').urls, ['b.jpg']);
});

test('reorderPhotos keeps only URLs that already exist, in the given order', () => {
  const token = authorizedToken();
  const ss = fakeWritableSpreadsheet({
    settings: fakeWritableSheet([['key', 'value'], ['hero_photos', 'a.jpg\nb.jpg\nc.jpg']])
  });
  global.SpreadsheetApp = { getActiveSpreadsheet: () => ss };
  stubDrive();

  const result = code.reorderPhotos(token, 'hero', ['c.jpg', 'a.jpg', 'intruder.jpg']);

  assert.deepEqual(result.urls, ['c.jpg', 'a.jpg']);
});

test('every photo function refuses an invalid token', () => {
  authorizedToken();
  assert.throws(() => code.uploadPhoto('bad', 'hero', 'a.jpg', 'x', 'image/jpeg'), /未授權/);
  assert.throws(() => code.deletePhoto('bad', 'hero', 'a.jpg'), /未授權/);
  assert.throws(() => code.reorderPhotos('bad', 'hero', []), /未授權/);
});

test('uploadPhoto rejects an unknown section rather than writing nowhere', () => {
  const token = authorizedToken();
  global.SpreadsheetApp = { getActiveSpreadsheet: () => fakeWritableSpreadsheet({}) };
  stubDrive();
  assert.throws(() => code.uploadPhoto(token, 'nonsense', 'a.jpg', 'x', 'image/jpeg'), /未知的區塊/);
});
```

- [ ] **Step 2: 執行測試，確認它失敗**

Run: `npm test`
Expected: FAIL — `code.settingsKeyForSection_ is not a function`

- [ ] **Step 3: 寫實作**

Add to `apps-script/Code.js`, above the export block:

```js
/** Returns the settings key holding this section's photos, or null for rooms. */
function settingsKeyForSection_(section) {
  if (section === 'hero') return 'hero_photos';
  var scenery = String(section || '').match(/^scenery-([123])$/);
  if (scenery) return 'scenery' + scenery[1] + '_photos';
  return null;
}

function roomIndexForSection_(section) {
  var room = String(section || '').match(/^room-(\d+)$/);
  return room ? Number(room[1]) : null;
}

function assertKnownSection_(section) {
  if (settingsKeyForSection_(section) === null && roomIndexForSection_(section) === null) {
    throw new Error('未知的區塊 Unknown section: ' + section);
  }
}

function readPhotoUrls_(ss, section) {
  assertKnownSection_(section);

  var settingsKey = settingsKeyForSection_(section);
  if (settingsKey) return splitUrls(readSettings_(ss)[settingsKey]);

  var rooms = readRooms_(ss);
  var room = rooms[roomIndexForSection_(section)];
  return room ? splitUrls(room.photos) : [];
}

function writePhotoUrls_(ss, section, urls) {
  assertKnownSection_(section);

  var settingsKey = settingsKeyForSection_(section);
  if (settingsKey) {
    var update = {};
    update[settingsKey] = joinUrls(urls);
    upsertSettings_(ss, update);
    return;
  }

  var rooms = readRooms_(ss);
  var index = roomIndexForSection_(section);
  if (!rooms[index]) throw new Error('房型不存在 Room not found: ' + section);
  rooms[index].photos = joinUrls(urls);
  writeRooms_(ss, rooms);
}

/** Gets, or creates, the section's subfolder beneath the configured photo root. */
function folderForSection_(section) {
  var rootFolderId = scriptProperty_('PHOTO_ROOT_FOLDER_ID');
  if (!rootFolderId) throw new Error('尚未設定 PHOTO_ROOT_FOLDER_ID');

  var root = DriveApp.getFolderById(rootFolderId);
  var existing = root.getFoldersByName(section);
  return existing.hasNext() ? existing.next() : root.createFolder(section);
}

function uploadPhoto(token, section, filename, base64, mimeType) {
  assertAuthorized_(token);
  assertKnownSection_(section);

  var blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType || 'image/jpeg', filename || 'photo.jpg');
  var file = folderForSection_(section).createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var urls = readPhotoUrls_(ss, section).concat([photoUrlFor_(file.getId())]);
  writePhotoUrls_(ss, section, urls);

  return { ok: true, urls: urls };
}

function deletePhoto(token, section, url) {
  assertAuthorized_(token);
  assertKnownSection_(section);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var urls = readPhotoUrls_(ss, section).filter(function (existing) { return existing !== url; });
  writePhotoUrls_(ss, section, urls);

  // Best effort: the sheet is the source of truth, so a missing Drive file is fine.
  var fileId = fileIdFromUrl_(url);
  if (fileId) {
    try {
      DriveApp.getFileById(fileId).setTrashed(true);
    } catch (error) {
      // Already gone, or never ours.
    }
  }

  return { ok: true, urls: urls };
}

function reorderPhotos(token, section, orderedUrls) {
  assertAuthorized_(token);
  assertKnownSection_(section);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = readPhotoUrls_(ss, section);
  var urls = (orderedUrls || []).filter(function (url) { return existing.indexOf(url) >= 0; });

  writePhotoUrls_(ss, section, urls);
  return { ok: true, urls: urls };
}
```

Update the export block to add `settingsKeyForSection_`, `roomIndexForSection_`, `readPhotoUrls_`, `writePhotoUrls_`, `folderForSection_`, `uploadPhoto`, `deletePhoto`, `reorderPhotos`.

- [ ] **Step 4: 執行測試，確認它通過**

Run: `npm test`
Expected: PASS — 86 tests passing

- [ ] **Step 5: Commit**

```bash
git add apps-script/Code.js tests/code.test.js
git commit -m "Add photo upload, deletion and reordering for the admin panel

The sheet is the source of truth for which photos a section shows, so
deleting one succeeds even when the Drive file has already vanished, and
reordering silently drops any URL that is not already present."
```

---

## Task 11: 種子 CSV

三份 CSV 匯入試算表後即為初始內容。文字**逐字取自設計稿** `claude_design/彩虹星民宿 Rainbowstar.dc.html`（`RULES` 位於第 504–521 行、`DUTIES_OUT` 522–528、`DUTIES_IN` 529–532、`data-content` 元素散落全檔）。

**兩個例外，須知悉：**
1. 房型的 `description`／`unit` 取自 `claude_design/uploads/rainbowstar-site/sheet-template/rooms.csv`。設計稿只為「主屋」提供了 `DEFAULT_ROOMS` 文案，帳棚與車宿沒有描述文字；該 CSV 是唯一來源，且屬事實性資料（非舊版 index.html 的版型內容），因此採用。
2. `contact_email` 與 `notify_email` 先填佔位地址，部署時（Task 22）改成真實信箱。

**Files:**
- Create: `scripts/csv.js`
- Create: `sheet-template/settings.csv`
- Create: `sheet-template/rooms.csv`
- Create: `sheet-template/workexchange_lists.csv`
- Create: `tests/seed.test.js`

**Interfaces:**
- Consumes: Task 5 的 `LIST_NAMES`；Task 9 的 `ROOM_COLUMNS`
- Produces:
  - `scripts/csv.js` 匯出 `parseCsv(text): string[][]` 與 `readSheetCsv(name): string[][]`（讀 `sheet-template/<name>`）。**Node 端唯一的 CSV 讀取器**，測試與 Task 14 的產生器共用。
  - 三份 CSV，欄位分別對應 Task 6/9 定義的分頁結構

---

- [ ] **Step 1: 建立共用的 CSV 讀取器**

Create `scripts/csv.js`. 這是 Node 端唯一的 CSV 讀取器——測試與 `build-defaults.js` 都用它，避免同一支 parser 抄三遍。

```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');

/** A minimal RFC-4180 reader: quoted fields, embedded commas and "" escapes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell !== ''));
}

function readSheetCsv(name) {
  return parseCsv(fs.readFileSync(path.join(__dirname, '..', 'sheet-template', name), 'utf8'));
}

module.exports = { parseCsv, readSheetCsv };
```

- [ ] **Step 2: 寫失敗的測試**

Create `tests/seed.test.js`:

```js
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
```

- [ ] **Step 3: 執行測試，確認它失敗**

Run: `npm test`
Expected: FAIL — `ENOENT: no such file or directory, open '.../sheet-template/settings.csv'`

- [ ] **Step 4: 建立 `sheet-template/settings.csv`**

```csv
key,value
site_name,"彩虹星民宿 Rainbowstar"
tagline,"在南島的大農莊住下來——花園、菜園，還有貓咪相伴，抬頭就是滿天星斗。無論旅遊、打工度假或打工換宿，都歡迎成為我們的家人。"
tagline_en,"Settle into a real South Island farm — flower gardens, a veggie patch, friendly cats, and skies full of stars. Come to travel, on a working holiday, or to work-exchange with us."
intro_text,"彩虹星民宿（原十里香農場）坐落於基督城近郊，由台灣人用心經營。這是一座真正的農莊——有花園、菜園，還有貓咪相伴。無論你是來旅遊、打工度假，或想以打工換宿深入體驗紐西蘭的農場生活，都歡迎成為我們的家人。"
intro_text_en,"Rainbowstar Farmstay (formerly Shilixiang Farm) sits just outside Christchurch, run by a Taiwanese family. It's a real working farm — with a flower garden, a vegetable patch, and friendly cats. Whether you're travelling, on a working holiday, or here to work-exchange, you're warmly welcome to become part of our family."
feature_1,"乾淨溫馨的房間，適合短住與長住，走進門就像回到家。"
feature_1_en,"Clean, cozy rooms for short or long stays — it feels just like home."
feature_2,"用勞務換取住宿，深入體驗紐西蘭在地生活，認識來自各地的朋友。"
feature_2_en,"Exchange a few hours of work for accommodation, live like a local, and meet friends from around the world."
feature_3,"鄰近超市與巴士站，提供在地生活資訊，讓你快速安頓下來。"
feature_3_en,"Close to supermarkets and bus stops, with local tips to help you settle in quickly."
accommodation_intro,"以下為房型與參考房價，實際空房與優惠請以線上申請後的回覆為準。"
accommodation_intro_en,"Room types and reference rates below. Actual availability and offers are confirmed after you apply online."
booking_note,"＊房價可能依季節調整，請以申請後的回覆為準。"
booking_note_en,"*Rates may vary by season; the final price is confirmed after you apply."
workexchange_intro,"以勞務換取住宿，每天工作數小時即可換得免費住宿，是深入體驗紐西蘭農場生活、節省旅費的好方式。"
workexchange_intro_en,"Exchange a few hours of work each day for free accommodation — a wonderful way to experience New Zealand farm life and save on travel costs."
location_text,"紐西蘭 基督城 Christchurch, New Zealand"
location_text_en,"Christchurch, New Zealand"
contact_email,your-email@gmail.com
contact_line,"021-550819 ／ 0064-21550819"
notify_email,your-email@gmail.com
hero_photos,
scenery1_photos,
scenery2_photos,
scenery3_photos,
```

> `site_name` 不需要 `_en` 列：站名中英同體。`contact_line` 與 `contact_email` 亦無需翻譯。

- [ ] **Step 5: 建立 `sheet-template/rooms.csv`**

`price` 留空，公開站會顯示「—」，由業者在後台填入實際房價。`note` 留空，避免把「請填實際房價」這類內部提示印在公開網頁上。

```csv
name,name_en,description,description_en,price,unit,unit_en,note,note_en,photos
"主屋 Dorm Room","Main House Dorm Room","經濟實惠的床位，適合長住打工度假者。","Affordable dorm beds — great for long-stay working-holiday travellers.",,"/ 床","/ bed",,,
"自搭帳棚 Tent","Own Tent","自備帳棚，室內提供廁所、浴室、廚房使用。","Bring your own tent; indoor toilet, bathroom and kitchen are available to use.",,"/ 晚","/ night",,,
"露宿自己的愛車 vehicle","Sleep in your own vehicle","睡自己的車，室內提供廁所、浴室、廚房使用。","Sleep in your own vehicle; indoor toilet, bathroom and kitchen are available to use.",,"/ 晚","/ night",,,
```

- [ ] **Step 6: 建立 `sheet-template/workexchange_lists.csv`**

```csv
list,order,text_zh,text_en
rules,1,"換宿時間：換宿期間至少兩星期，每天工作 3 小時（有一定的工作量），工作時間為早上 10:00 到中午 13:00；若有特殊情況時間會調整，工作量較多時會增加時數，擇日補休。","Duration: a minimum of 2 weeks, 3 hours of work per day (with a set workload), from 10:00 to 13:00. Hours may be adjusted for special situations; if the workload is heavier, extra hours are added and made up with time off another day."
rules,2,"休假：做五休二。","Days off: five days on, two days off."
rules,3,"換宿志工來到農場第一天為住宿（須付費），這是為了讓志工調整好心情，為接下來的工作做準備。","Your first day at the farm is a paid stay, so you can settle in and prepare for the work ahead."
rules,4,"換宿志工若臨時更改行程，請於七日前通知我們；因為行程更改我們也需要時間調度人員，請大家體諒與遵守。","If you change your schedule, please tell us at least 7 days in advance, as we need time to rearrange staffing. Thank you for understanding."
rules,5,"每位換宿志工都需一同維護公共區域的整潔，物品用完請歸回原位。","Every volunteer helps keep shared areas tidy; please return items to where you found them."
rules,6,"尊重他人隱私；非公用物品請勿使用。","Respect others' privacy; do not use items that are not communal."
rules,7,"換宿志工若當天身體不適，請馬上通知我們。","If you feel unwell on a given day, please tell us immediately."
rules,8,"對工作內容不清楚，或不確定工具的使用方式，請立即詢問，以免發生意外。","If you are unsure about a task or how to use a tool, ask right away to avoid accidents."
rules,9,"工作時需注意個人安全；若因對工作內容不清楚、未經同意擅自使用工具、或不正確使用工具所導致的傷害，農場將不負任何責任。","Always mind your personal safety. The farm is not responsible for injuries caused by not understanding the task, using tools without our permission, or using tools incorrectly."
rules,10,"有任何問題請與我們當面溝通，勿請他人代為傳話，以免造成雙方誤解。","Please discuss any issues with us face to face; do not pass messages through others, to avoid misunderstandings."
rules,11,"維護農場安全，當日工具使用完後務必歸位；離開前詳細檢查是否有危險物品遺留（如鐵釘、鐵絲、鋤頭、工具）。","Keep the farm safe: always return tools after use, and check before leaving that no hazardous items are left behind (nails, wire, hoes, tools)."
rules,12,"最後清潔：離開前請整理好自己的地方（包括床鋪的換洗），請勿遺留任何私人物品與垃圾。","Final cleanup: before leaving, tidy your space (including washing bed linens) and do not leave any personal items or trash."
rules,13,"換宿志工若因使用不當造成任何工具或物品的損壞，我們有權要求賠償；若對農場人員有任何不禮貌，我們將保留法律追訴權。","If improper use damages tools or property, we may ask for compensation; for any disrespect toward farm staff, we reserve the right to take legal action."
rules,14,"若違反換宿章則與住宿生活公約，我們會口頭告知，屢勸不聽我們有權要求志工八小時內離開農場。","If you break the rules or house guidelines, we will give a verbal warning; if ignored repeatedly, we may ask the volunteer to leave the farm within 8 hours."
rules,15,"請詳讀換宿章則與工作內容，仔細衡量自己的狀況，確定自己可以勝任此工作，並同意且願意遵守我們的生活公約與工作內容，再進行報名。","Please read the rules and job content carefully, assess your own situation, make sure you can handle the work, and agree to follow our house guidelines and duties before applying."
rules,16,"換宿志工入住時請提供護照影本一份；換宿工作需自備口罩與手套。","Please provide a copy of your passport on arrival; bring your own mask and gloves for the work."
duties_out,1,"花園整理（種花、除草、修剪樹枝）","Garden care (planting flowers, weeding, pruning branches)"
duties_out,2,"菜園整理（翻土、種菜、澆水、拔雜草）","Vegetable garden (tilling, planting, watering, weeding)"
duties_out,3,"餵貓","Feeding the cats"
duties_out,4,"農場建設","Farm construction"
duties_out,5,"每星期四將垃圾桶拉出，隔日再拉回。","Take the bins out every Thursday and bring them back the next day."
duties_in,1,"房屋內外清潔（房間、走廊、廁所、衛浴、客廳、餐廳、洗衣間、門口內外、庭院）","Cleaning inside and out (rooms, hallway, toilet, bathroom, living room, dining room, laundry, entrance, yard)"
duties_in,2,"維持公共區域的整潔","Keeping shared areas tidy"
```

- [ ] **Step 7: 執行測試，確認它通過**

Run: `npm test`
Expected: PASS — 98 tests passing

- [ ] **Step 8: Commit**

```bash
git add scripts/csv.js sheet-template/ tests/seed.test.js
git commit -m "Seed the content spreadsheet from the design file

The seeded rules, duties and copy are transcribed from the design file, which
the spec names as the source of truth for operational content. Tests assert
the counts and the 1..N ordering so a transcription slip cannot pass silently.

Room descriptions for the tent and vehicle options come from the existing
sheet template, the only place they exist; the design file supplies copy for
the dorm room alone."
```

---

## Task 12: 壓平設計稿 — `index.html` 與 `style-hover` shim

設計稿的互動樣式寫成非標準的 `style-hover` / `style-focus` 屬性，只有 dc-runtime 認得。這個 Task 用約 30 行 vanilla JS 還原它們，並把模板搬進標準 `<body>`。

**Files:**
- Create: `site/index.html`
- Create: `site/app.js`
- Create: `tests/app.test.js`

**Interfaces:**
- Consumes: 無（前端獨立於後端測試）
- Produces:
  - `Rainbowstar.parseStyleText(text: string): Array<[prop, value]>`
  - `Rainbowstar.applyStyleShim(root): void` — 綁定 `[style-hover]` 的 `mouseenter`/`mouseleave` 與 `[style-focus]` 的 `focus`/`blur`
  - `Rainbowstar.boot(): void` — DOMContentLoaded 時執行一次
  - 全域物件 `Rainbowstar`；Node 下透過 `module.exports` 匯出

> **前端為何要重複 `splitUrls` 之類的小函式？** `apps-script/lib.js` 只存在於 Apps Script 執行環境，瀏覽器拿不到。兩邊各留一份極小的實作、各自有測試，比引入打包工具（違反 Global Constraint 2）划算。

---

- [ ] **Step 1: 寫失敗的測試**

Create `tests/app.test.js`:

```js
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
```

- [ ] **Step 2: 執行測試，確認它失敗**

Run: `npm test`
Expected: FAIL — `Cannot find module '../site/app.js'`

- [ ] **Step 3: 建立 `site/app.js`**

```js
/**
 * Rainbowstar public site behaviour.
 *
 * Loaded as a plain <script src>, so it must not use modules. The export block
 * at the bottom is guarded so Node can unit-test the pure helpers while the
 * browser simply ignores it.
 */
'use strict';

var Rainbowstar = (function () {

  /** Splits an inline style string, keeping colons that appear inside a value. */
  function parseStyleText(text) {
    var pairs = [];
    String(text === null || text === undefined ? '' : text).split(';').forEach(function (chunk) {
      var separator = chunk.indexOf(':');
      if (separator < 0) return;
      var prop = chunk.slice(0, separator).trim();
      var value = chunk.slice(separator + 1).trim();
      if (prop && value) pairs.push([prop, value]);
    });
    return pairs;
  }

  function bindShim(el, attribute, onEvents, offEvents) {
    var pairs = parseStyleText(el.getAttribute(attribute));
    if (!pairs.length) return;

    var originals = pairs.map(function (pair) {
      return [pair[0], el.style.getPropertyValue(pair[0])];
    });

    onEvents.forEach(function (type) {
      el.addEventListener(type, function () {
        pairs.forEach(function (pair) { el.style.setProperty(pair[0], pair[1]); });
      });
    });

    offEvents.forEach(function (type) {
      el.addEventListener(type, function () {
        originals.forEach(function (original) {
          if (original[1]) el.style.setProperty(original[0], original[1]);
          else el.style.removeProperty(original[0]);
        });
      });
    });
  }

  /**
   * Reproduces the design tool's style-hover / style-focus pseudo-attributes.
   *
   * The design's styling is entirely inline, so lifting it into real CSS classes
   * would be a wide refactor with a real chance of visual drift. This shim keeps
   * the markup byte-for-byte and costs thirty lines.
   */
  function applyStyleShim(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[style-hover]'), function (el) {
      bindShim(el, 'style-hover', ['mouseenter'], ['mouseleave']);
    });
    Array.prototype.forEach.call(root.querySelectorAll('[style-focus]'), function (el) {
      bindShim(el, 'style-focus', ['focus'], ['blur']);
    });
  }

  function boot() {
    applyStyleShim(document);
    var year = document.getElementById('year');
    if (year) year.textContent = String(new Date().getFullYear());
  }

  return {
    parseStyleText: parseStyleText,
    applyStyleShim: applyStyleShim,
    boot: boot
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Rainbowstar;
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', Rainbowstar.boot);
```

- [ ] **Step 4: 執行測試，確認它通過**

Run: `npm test`
Expected: PASS — 105 tests passing

- [ ] **Step 5: 建立 `site/index.html`**

從 `claude_design/彩虹星民宿 Rainbowstar.dc.html` 搬運，做四件事：拆掉 runtime 外殼、保留 Google Fonts、加設定行、掛 `app.js`。

檔案結構如下（`{{...}}` 標示要從設計稿逐行複製的區段，**不要重打**）：

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>彩虹星民宿 Rainbowstar — 紐西蘭基督城農莊民宿</title>
<meta name="description" content="Rainbowstar Farmstay in Christchurch, New Zealand — accommodation &amp; work exchange. 紐西蘭基督城民宿，住宿與打工換宿線上申請。">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&family=Hanken+Grotesk:wght@400;500;600;700&family=Noto+Serif+TC:wght@500;600;700&family=Noto+Sans+TC:wght@400;500;700&family=Caveat:wght@500;600;700&display=swap" rel="stylesheet">
<script>window.RAINBOWSTAR_CONFIG={WEBAPP_URL:""};</script>
<style>
{{ 複製 dc.html 第 17–27 行的 CSS，一字不改 }}
</style>
</head>
<body>
{{ 複製 dc.html 第 30–481 行的所有 markup，一字不改，但套用下方「必要修改」 }}
<script src="./app.js"></script>
</body>
</html>
```

**搬運規則：**

1. **刪除** `<x-dc>`、`</x-dc>`、`<helmet>`、`</helmet>` 這四個標籤本身（保留它們包住的內容）。
2. **刪除** dc.html 第 6 行的 `<script src="./support.js"></script>`。
3. **刪除** dc.html 第 482 行之後的整段 `<script>`（`class Component extends DCLogic { ... }`）。該邏輯會在 Task 13–16 逐段搬進 `app.js`。
4. **保留** 所有 `style-hover`、`style-focus`、`data-zh`、`data-en`、`data-ph-zh`、`data-ph-en`、`data-content`、`data-scenery`、`data-jump` 屬性——`app.js` 依賴它們。
5. **保留** 空的容器：`<div id="rooms-list">`、`<ol id="rulesList">`、`<ul id="dutiesOut">`、`<ul id="dutiesIn">`。

**必要修改（唯一一處內容更動）：**

dc.html 第 140 行的換宿數據卡仍寫「做六休一」。業者早已改為「做五休二」，但當時只更新了同檔第 506 行的 `RULES` 陣列，數據卡漏改。補上：

```html
<!-- 原本 -->
<div data-zh="做六休一" data-en="6 on, 1 off" style="font-weight:700;font-size:15px;color:#2f2b22">做六休一</div>

<!-- 改成 -->
<div data-zh="做五休二" data-en="5 on, 2 off" style="font-weight:700;font-size:15px;color:#2f2b22">做五休二</div>
```

- [ ] **Step 6: 在真實瀏覽器驗證頁面與 hover shim**

用 Playwright（MCP `browser_*` 工具）開啟本機檔案，無需啟動伺服器——`WEBAPP_URL` 為空字串時不會發出任何網路請求。

1. `browser_navigate` 至 `file:///c:/Users/wuuu1/Desktop/rainbowstar/site/index.html`
2. `browser_console_messages` — Expected: 無 error（`Rainbowstar is not defined`、`support.js 404` 皆代表搬運出錯）
3. `browser_network_requests` — Expected: 只有 `fonts.googleapis.com` / `fonts.gstatic.com` 的請求。**不得出現 `unpkg.com`、`support.js`、`react`、`babel`**。
4. `browser_snapshot` — Expected: 可見 `關於`、`住宿`、`換宿`、`周邊`、`線上申請`、`聯絡` 六個導覽項；頁面含 `#top`、`#about`、`#stay`、`#work`、`#nearby`、`#apply`、`#contact` 七個區塊。
5. `browser_hover` 於導覽列的「關於」連結，再 `browser_take_screenshot` — Expected: 背景轉為淺米色 `#f1ebdd`、文字轉為 `#1f6b40`（`style-hover` 生效）。
6. `browser_snapshot` 確認換宿數據卡顯示「做五休二」。

若無 Playwright，改以瀏覽器手動開啟該檔，按 F12 檢查 Console 與 Network 分頁，結果須與上述一致。

- [ ] **Step 7: Commit**

```bash
git add site/index.html site/app.js tests/app.test.js
git commit -m "Flatten the design into a standalone page

The design tool's runtime pulled React, ReactDOM and Babel from a CDN and
transpiled the page in the browser on every visit. None of that survives:
the markup moves into a plain body and a thirty-line shim reproduces the
style-hover and style-focus pseudo-attributes the runtime used to interpret.

The work-exchange stat card still said six days on, one off. The owner moved
to five on, two off some time ago but the change only ever reached the rules
array in the same file, so the stat card had been contradicting the rules it
sits next to. Both now say five on, two off."
```

---

## Task 13: 內容層 — 抓取後端 JSON 並填入頁面（修正「雙語被中文覆蓋」缺陷）

**Files:**
- Modify: `site/app.js`
- Modify: `tests/app.test.js`

**Interfaces:**
- Consumes: Task 12 的 `Rainbowstar` 物件
- Produces:
  - `Rainbowstar.splitUrls(value): string[]`
  - `Rainbowstar.settingValue(settings, key, lang): string|undefined` — 英文模式缺 `_en` 時回 `undefined`（**元素保留自身 `data-en`**）
  - `Rainbowstar.pickRow(row, base, lang): string|undefined` — 英文模式缺 `_en` 時退回中文
  - `Rainbowstar.escapeHtml(value): string`
  - `Rainbowstar.applyContent(data, lang): void`
  - `Rainbowstar.loadContent(): Promise<void>`
  - `Rainbowstar.state = { data: null, lang: 'zh' }`

---

- [ ] **Step 1: 寫失敗的測試**

Append to `tests/app.test.js`:

```js
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
```

- [ ] **Step 2: 執行測試，確認它失敗**

Run: `npm test`
Expected: FAIL — `app.settingValue is not a function`

- [ ] **Step 3: 寫實作**

Add to `site/app.js`, inside the IIFE above the `return` statement:

```js
  var state = { data: null, lang: 'zh' };

  function isBlank(value) {
    return value === undefined || value === null || value === '';
  }

  function splitUrls(value) {
    if (isBlank(value)) return [];
    var urls = [];
    String(value).split(/[\n,|]+/).forEach(function (raw) {
      var url = raw.trim();
      if (url && urls.indexOf(url) < 0) urls.push(url);
    });
    return urls;
  }

  /**
   * Language pick for [data-content] elements.
   *
   * These elements already carry the correct English in their data-en attribute.
   * Returning Chinese here when the sheet has no _en row would overwrite it,
   * which is exactly the bug this guards against. Callers skip on undefined.
   */
  function settingValue(settings, key, lang) {
    if (!settings) return undefined;
    if (lang === 'en') {
      var english = settings[key + '_en'];
      return isBlank(english) ? undefined : String(english);
    }
    var chinese = settings[key];
    return isBlank(chinese) ? undefined : String(chinese);
  }

  /** Language pick for rows rendered purely from data, which have no markup fallback. */
  function pickRow(row, base, lang) {
    if (!row) return undefined;
    if (lang === 'en') {
      var english = row[base + '_en'];
      if (!isBlank(english)) return String(english);
    }
    var chinese = row[base];
    return isBlank(chinese) ? undefined : String(chinese);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function applyContent(data, lang) {
    state.data = data;
    var settings = (data && data.settings) || {};

    Array.prototype.forEach.call(document.querySelectorAll('[data-content]'), function (el) {
      var value = settingValue(settings, el.getAttribute('data-content'), lang);
      if (value === undefined) return;  // keep the markup's own data-zh / data-en text
      el.innerHTML = value.indexOf('\n') >= 0
        ? escapeHtml(value).replace(/\n/g, '<br>')
        : escapeHtml(value);
    });

    var emailValue = settingValue(settings, 'contact_email', 'zh');
    var emailLink = document.getElementById('contactEmail');
    if (emailValue && emailLink) {
      emailLink.textContent = emailValue;
      emailLink.href = 'mailto:' + emailValue;
    }

    applyHeroPhotos(splitUrls(settings.hero_photos || settings.hero_image));
    applySceneryPhotos(settings);
    renderRooms((data && data.rooms) || [], lang);
    renderAllLists(data, lang);
  }

  function loadContent() {
    var config = (typeof window !== 'undefined' && window.RAINBOWSTAR_CONFIG) || { WEBAPP_URL: '' };
    if (!config.WEBAPP_URL) return Promise.resolve();

    var banner = document.getElementById('loadingBanner');
    if (banner) banner.style.display = 'block';

    return fetch(config.WEBAPP_URL + '?_=' + Date.now())
      .then(function (response) { return response.json(); })
      .then(function (data) { if (data && data.ok !== false) applyContent(data, state.lang); })
      .catch(function (error) { console.warn('內容載入失敗，使用預設內容：', error); })
      .then(function () { if (banner) banner.style.display = 'none'; });
  }
```

`applyHeroPhotos`、`applySceneryPhotos`、`renderRooms`、`renderAllLists` 由 Task 14–15 實作。**本 Task 先加入暫時的空實作**，讓頁面可載入：

```js
  function applyHeroPhotos(urls) { void urls; }
  function applySceneryPhotos(settings) { void settings; }
  function renderRooms(rooms, lang) { void rooms; void lang; }
  function renderAllLists(data, lang) { void data; void lang; }
```

Extend the returned object with: `state`, `splitUrls`, `settingValue`, `pickRow`, `escapeHtml`, `applyContent`, `loadContent`.

- [ ] **Step 4: 執行測試，確認它通過**

Run: `npm test`
Expected: PASS — 109 tests passing

- [ ] **Step 5: Commit**

```bash
git add site/app.js tests/app.test.js
git commit -m "Load sheet content without clobbering the built-in English

Elements carrying data-content already hold correct English in their markup.
The old code asked the settings map for a value and wrote whatever came back,
so a sheet with no _en row silently replaced English with Chinese whenever a
visitor switched language. A missing _en value now leaves the element alone."
```

---

## Task 14: 語言切換、導覽、換宿清單（修正 `renderList` 一次性守衛）

設計稿的 `renderList`（`dc.html:533-558`）以 `dataset.done==='1'` 早退，只能畫一次。內容改為後端驅動後，必須能重畫（資料抵達時、語言切換時）。

**Files:**
- Create: `scripts/build-defaults.js`
- Modify: `package.json`（新增 `build:defaults` script）
- Modify: `site/app.js`
- Modify: `tests/app.test.js`

**Interfaces:**
- Consumes: Task 13 的 `state`、`pickRow`、`escapeHtml`；Task 11 的 `scripts/csv.js`
- Produces:
  - `scripts/build-defaults.js` — 由 `sheet-template/workexchange_lists.csv` 產生 `site/app.js` 內標記區塊中的 `DEFAULT_LISTS`。`--check` 模式在 `app.js` 過期時以非零碼結束。
  - `Rainbowstar.DEFAULT_LISTS: {rules: Item[], duties_out: Item[], duties_in: Item[]}` — `Item = {zh, en}`，**由產生器寫入，不得手動編輯**
  - `Rainbowstar.listItemsFor(data, listName): Item[]` — 後端有資料用後端的，否則用 `DEFAULT_LISTS`
  - `Rainbowstar.renderList(host, items, kind, lang): void` — `kind` 為 `'rule' | 'out' | 'in'`；**冪等**，每次先清空
  - `Rainbowstar.applyLang(): void`
  - `Rainbowstar.toggleLang(): void`

---

- [ ] **Step 1: 寫失敗的測試**

Append to `tests/app.test.js`:

```js
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
```

- [ ] **Step 2: 執行測試，確認它失敗**

Run: `npm test`
Expected: FAIL — `app.DEFAULT_LISTS is undefined`

- [ ] **Step 3: 在 `site/app.js` 放入產生器的標記區塊**

`DEFAULT_LISTS` **不手抄**。在 `site/app.js` 的 IIFE 內，`listItemsFor` 之前，放入這兩行標記與一個空殼；下一步的產生器會把它填滿：

```js
  // <default-lists:begin> generated by scripts/build-defaults.js — do not edit by hand
  var DEFAULT_LISTS = { rules: [], duties_out: [], duties_in: [] };
  // <default-lists:end>
```

- [ ] **Step 4: 寫產生器**

Create `scripts/build-defaults.js`:

```js
'use strict';
/**
 * Regenerates the DEFAULT_LISTS block in site/app.js from the seeded CSV.
 *
 * The public page needs the work-exchange lists before the back end answers,
 * and the spreadsheet is seeded from the same CSV, so the two must agree.
 * Generating one from the other removes the chance of a transcription slip.
 *
 *   node scripts/build-defaults.js           rewrite site/app.js
 *   node scripts/build-defaults.js --check   exit 1 if site/app.js is stale
 */
const fs = require('node:fs');
const path = require('node:path');
const { readSheetCsv } = require('./csv.js');

const APP_PATH = path.join(__dirname, '..', 'site', 'app.js');
const BEGIN = '  // <default-lists:begin> generated by scripts/build-defaults.js — do not edit by hand';
const END = '  // <default-lists:end>';
const LIST_NAMES = ['rules', 'duties_out', 'duties_in'];

function listsFromCsv() {
  const lists = { rules: [], duties_out: [], duties_in: [] };
  readSheetCsv('workexchange_lists.csv').slice(1).forEach((row) => {
    if (LIST_NAMES.includes(row[0])) lists[row[0]].push({ zh: row[2], en: row[3] });
  });
  return lists;
}

function render(lists) {
  const body = LIST_NAMES.map((name) => {
    const items = lists[name]
      .map((item) => `      { zh: ${JSON.stringify(item.zh)}, en: ${JSON.stringify(item.en)} }`)
      .join(',\n');
    return `    ${name}: [\n${items}\n    ]`;
  }).join(',\n');

  return `${BEGIN}\n  var DEFAULT_LISTS = {\n${body}\n  };\n${END}`;
}

function main() {
  const current = fs.readFileSync(APP_PATH, 'utf8');
  const start = current.indexOf(BEGIN);
  const end = current.indexOf(END);
  if (start < 0 || end < 0) {
    console.error('site/app.js is missing the default-lists markers');
    process.exit(1);
  }

  const updated = current.slice(0, start) + render(listsFromCsv()) + current.slice(end + END.length);

  if (process.argv.includes('--check')) {
    if (updated !== current) {
      console.error('site/app.js is stale. Run: npm run build:defaults');
      process.exit(1);
    }
    console.log('site/app.js DEFAULT_LISTS is up to date');
    return;
  }

  fs.writeFileSync(APP_PATH, updated);
  console.log('Regenerated DEFAULT_LISTS in site/app.js');
}

main();
```

Add the script to `package.json`:

```json
  "scripts": {
    "test": "node --test tests/",
    "build:defaults": "node scripts/build-defaults.js"
  }
```

- [ ] **Step 5: 產生 `DEFAULT_LISTS` 並確認內容**

Run: `npm run build:defaults`
Expected: `Regenerated DEFAULT_LISTS in site/app.js`

Run: `node -e "console.log(require('./site/app.js').DEFAULT_LISTS.rules.length, require('./site/app.js').DEFAULT_LISTS.duties_out.length, require('./site/app.js').DEFAULT_LISTS.duties_in.length)"`
Expected: `16 5 2`

> 之後只要改了 `sheet-template/workexchange_lists.csv`，就必須重跑 `npm run build:defaults`。`npm test` 內的 `--check` 會擋下忘記重跑的情況。

- [ ] **Step 6: 寫其餘實作**

Add to `site/app.js`, inside the IIFE:

```js
  function listItemsFor(data, listName) {
    var fromServer = data && data[listName];
    return (fromServer && fromServer.length) ? fromServer : DEFAULT_LISTS[listName];
  }

  var RULE_ITEM_STYLE = 'position:relative;padding:0 0 14px 40px;color:#4a463b;font-size:14px;line-height:1.62;border-bottom:1px solid #f3ecdd;margin-bottom:14px';
  var RULE_BADGE_STYLE = 'position:absolute;left:0;top:0;width:26px;height:26px;border-radius:9px;background:rgba(242,166,60,.16);color:#c47f16;font-weight:700;font-size:12.5px;display:flex;align-items:center;justify-content:center;font-family:\'Newsreader\',serif';
  var DUTY_ITEM_STYLE = 'position:relative;padding-left:22px;color:#4a463b;font-size:13.8px;line-height:1.55';

  /**
   * Rebuilds a list from data. The design's version early-returned on a
   * dataset.done guard, so it could only ever run once; content now arrives
   * asynchronously and changes with the language, so it must be re-runnable.
   */
  function renderList(host, items, kind, lang) {
    if (!host) return;
    host.innerHTML = '';

    (items || []).forEach(function (item, index) {
      var li = document.createElement('li');
      var marker = document.createElement('span');

      if (kind === 'rule') {
        li.setAttribute('style', RULE_ITEM_STYLE);
        marker.setAttribute('style', RULE_BADGE_STYLE);
        marker.textContent = String(index + 1);
      } else {
        li.setAttribute('style', DUTY_ITEM_STYLE);
        marker.setAttribute('style',
          'position:absolute;left:2px;top:8px;width:7px;height:7px;border-radius:50%;background:' +
          (kind === 'out' ? '#2f8f57' : '#4c9ed4'));
      }
      li.appendChild(marker);

      var text = document.createElement('span');
      text.setAttribute('data-zh', item.zh);
      text.setAttribute('data-en', item.en);
      text.textContent = (lang === 'en' && item.en) ? item.en : item.zh;
      li.appendChild(text);

      host.appendChild(li);
    });
  }

  function renderAllLists(data, lang) {
    renderList(document.getElementById('rulesList'), listItemsFor(data, 'rules'), 'rule', lang);
    renderList(document.getElementById('dutiesOut'), listItemsFor(data, 'duties_out'), 'out', lang);
    renderList(document.getElementById('dutiesIn'), listItemsFor(data, 'duties_in'), 'in', lang);
  }

  function readStoredLang() {
    try { return localStorage.getItem('rb_lang') || 'zh'; } catch (error) { return 'zh'; }
  }

  function applyLang() {
    var lang = state.lang;
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-Hant';

    Array.prototype.forEach.call(document.querySelectorAll('[data-zh]'), function (el) {
      var text = lang === 'en' ? el.getAttribute('data-en') : el.getAttribute('data-zh');
      if (text !== null) el.innerHTML = text;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-ph-zh]'), function (el) {
      var text = lang === 'en' ? el.getAttribute('data-ph-en') : el.getAttribute('data-ph-zh');
      if (text !== null) el.setAttribute('placeholder', text);
    });

    var button = document.getElementById('langBtn');
    if (button) button.textContent = lang === 'en' ? '中文' : 'EN';

    // Re-apply data-driven content, which applyLang's blanket sweep just overwrote.
    applyContent(state.data, lang);
  }

  function toggleLang() {
    state.lang = state.lang === 'en' ? 'zh' : 'en';
    try { localStorage.setItem('rb_lang', state.lang); } catch (error) { /* private mode */ }
    applyLang();
  }

  function closeMenu() {
    var nav = document.getElementById('navlinks');
    if (nav && window.innerWidth <= 860) { nav.dataset.open = ''; nav.style.display = 'none'; }
  }

  function toggleMenu() {
    var nav = document.getElementById('navlinks');
    if (!nav) return;
    var open = nav.dataset.open === '1';
    nav.dataset.open = open ? '' : '1';
    nav.style.display = open ? 'none' : 'flex';
  }

  function updateNav() {
    var nav = document.getElementById('navlinks');
    var button = document.getElementById('menuBtn');
    if (!nav || !button) return;

    if (window.innerWidth <= 860) {
      button.style.display = 'inline-flex';
      nav.setAttribute('style',
        'position:absolute;left:0;right:0;top:100%;flex-direction:column;align-items:stretch;gap:2px;' +
        'background:#fffef9;border-bottom:1px solid #ece3d3;padding:10px 18px 16px;' +
        'box-shadow:0 14px 26px rgba(60,50,30,.08);display:' + (nav.dataset.open === '1' ? 'flex' : 'none'));
    } else {
      button.style.display = 'none';
      nav.dataset.open = '';
      nav.setAttribute('style', 'display:flex;align-items:center;gap:2px');
    }
  }
```

Replace the placeholder `renderAllLists` from Task 13 with the real one above. Extend the returned object with: `DEFAULT_LISTS`, `listItemsFor`, `renderList`, `renderAllLists`, `applyLang`, `toggleLang`, `updateNav`, `toggleMenu`.

Then wire them up in `boot()`:

```js
  function boot() {
    applyStyleShim(document);

    state.lang = readStoredLang();

    var langButton = document.getElementById('langBtn');
    if (langButton) langButton.onclick = toggleLang;

    var menuButton = document.getElementById('menuBtn');
    if (menuButton) menuButton.onclick = toggleMenu;

    Array.prototype.forEach.call(document.querySelectorAll('#navlinks a'), function (link) {
      link.onclick = closeMenu;
    });
    Array.prototype.forEach.call(document.querySelectorAll('#about [data-jump]'), function (card) {
      card.onclick = function () { location.hash = '#' + card.getAttribute('data-jump'); };
    });

    var year = document.getElementById('year');
    if (year) year.textContent = String(new Date().getFullYear());

    window.onresize = updateNav;
    updateNav();
    applyLang();
    loadContent();
  }
```

- [ ] **Step 7: 執行測試，確認它通過**

Run: `npm test`
Expected: 全部通過。若 `DEFAULT_LISTS is byte-for-byte the seeded CSV content` 或 `site/app.js is not stale` 失敗，跑 `npm run build:defaults` 再測一次，**不要**改測試。

- [ ] **Step 8: 在瀏覽器驗證**

1. `browser_navigate` 至 `file:///c:/Users/wuuu1/Desktop/rainbowstar/site/index.html`
2. `browser_snapshot` — Expected: 換宿章則區出現 16 條、編號 1–16；戶外工作 5 項、室內工作 2 項。
3. `browser_click` 右上角 `EN` 按鈕，`browser_snapshot` — Expected: 導覽變成 `About / Stay / Work Exchange / Around / Apply / Contact`；章則第 2 條變成 `Days off: five days on, two days off.`；按鈕文字變成 `中文`。
4. `browser_click` 再切回中文，`browser_snapshot` — Expected: 章則仍是 16 條（**不是 32 條**）。這條驗證 `renderList` 的冪等性。
5. `browser_resize` 至寬度 400，`browser_snapshot` — Expected: 漢堡鈕出現、導覽收合。

- [ ] **Step 9: Commit**

```bash
git add scripts/build-defaults.js package.json site/app.js tests/app.test.js
git commit -m "Render the work-exchange lists from data, re-runnably

The design's list renderer early-returned on a dataset.done guard, so it drew
once and never again. The lists now arrive from the sheet and re-render on a
language switch, so the guard is gone and the container is cleared instead.

A test compares the built-in fallback against the seeded CSV so the two
cannot drift apart."
```

---

## Task 15: 房型、照片輪播、燈箱、首頁與景點照片

**Files:**
- Modify: `site/app.js`
- Modify: `tests/app.test.js`

**Interfaces:**
- Consumes: Task 14 的 `state`、`pickRow`、`escapeHtml`、`splitUrls`
- Produces:
  - `Rainbowstar.DEFAULT_ROOMS: object[]` — 單筆，含 `name_en` / `description_en` / `unit_en`
  - `Rainbowstar.roomsToRender(rooms): object[]`
  - `Rainbowstar.collectPhotos(room): string[]`
  - `Rainbowstar.roomPrice(room): string`
  - `Rainbowstar.buildCarousel(host, slides, startIndex): void`
  - `Rainbowstar.openLightbox(slides, startIndex, meta): void` / `closeLightbox(): void`
  - `Rainbowstar.renderRooms(rooms, lang): void`
  - `Rainbowstar.applyHeroPhotos(urls): void` / `applySceneryPhotos(settings): void`

---

- [ ] **Step 1: 寫失敗的測試**

Append to `tests/app.test.js`:

```js
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
```

- [ ] **Step 2: 執行測試，確認它失敗**

Run: `npm test`
Expected: FAIL — `app.collectPhotos is not a function`

- [ ] **Step 3: 寫實作**

Add to `site/app.js`, inside the IIFE. 這是從 `dc.html:630-747, 825-852` 的搬運，改用 `state.lang` 取代區域 `LANG`：

```js
  var DEFAULT_ROOMS = [{
    name: '主屋 Dorm Room',
    name_en: 'Main House Dorm Room',
    description: '經濟實惠的床位，適合長住打工度假者。',
    description_en: 'Affordable dorm beds — great for long-stay working-holiday travellers.',
    price: '—',
    unit: '/ 床',
    unit_en: '/ bed'
  }];

  var PHOTO_KEYS = [
    'photo', 'photo1', 'photo2', 'photo3', 'photo4', 'photo5', 'photo6', 'photo7', 'photo8',
    'photos', 'images', 'image', 'image1', 'image2', 'image3', 'image4', 'img', 'photo_url'
  ];
  var DEMO_GRADIENTS = [
    'linear-gradient(150deg,#eaf5ee,#f3ecd9)',
    'linear-gradient(150deg,#e3eef8,#eef4e9)',
    'linear-gradient(150deg,#f4ede0,#e9f4ee)'
  ];
  var ROOM_ACCENTS = ['#2f8f57', '#4c9ed4', '#f2a63c', '#ec6a45', '#9a86cf'];

  function collectPhotos(room) {
    var urls = [];
    PHOTO_KEYS.forEach(function (key) {
      splitUrls(room[key]).forEach(function (url) {
        if (urls.indexOf(url) < 0) urls.push(url);
      });
    });
    return urls;
  }

  function roomsToRender(rooms) {
    return (rooms && rooms.length) ? rooms : DEFAULT_ROOMS;
  }

  function roomPrice(room) {
    var price = room.price;
    return (price === undefined || price === '' || price === 0 || price === '0') ? '—' : price;
  }

  function roomSlides(room) {
    var urls = collectPhotos(room);
    if (urls.length) return urls.map(function (url) { return { url: url }; });
    return DEMO_GRADIENTS.map(function (gradient) {
      return { gradient: gradient, labelZh: '房型照片', labelEn: 'Room photo' };
    });
  }

  function makeSlide(slide) {
    var el = document.createElement('div');
    var base = 'position:absolute;inset:0;transition:opacity .35s ease';
    if (slide.url) {
      el.setAttribute('style', base + ';background:#eee;background-image:url("' +
        String(slide.url).replace(/"/g, '%22') + '");background-size:cover;background-position:center');
    } else {
      el.setAttribute('style', base + ';background:' + slide.gradient +
        ';display:flex;align-items:center;justify-content:center;color:#a7a08d;font-size:12.5px;font-weight:600');
      var label = document.createElement('span');
      label.setAttribute('data-zh', slide.labelZh);
      label.setAttribute('data-en', slide.labelEn);
      label.textContent = state.lang === 'en' ? slide.labelEn : slide.labelZh;
      el.appendChild(label);
    }
    return el;
  }

  function buildCarousel(host, slides, startIndex) {
    if (!host) return;
    host.innerHTML = '';
    host.style.position = 'relative';
    host.style.overflow = 'hidden';

    var index = 0;
    var dots = [];
    var slideEls = slides.map(function (slide) {
      var el = makeSlide(slide);
      host.appendChild(el);
      return el;
    });

    function show(next) {
      index = (next + slides.length) % slides.length;
      host.__index = index;
      slideEls.forEach(function (el, i) { el.style.opacity = i === index ? '1' : '0'; });
      dots.forEach(function (dot, i) {
        dot.style.background = i === index ? '#fff' : 'rgba(255,255,255,.55)';
        dot.style.transform = i === index ? 'scale(1.25)' : 'none';
      });
    }

    if (slides.length > 1) {
      [-1, 1].forEach(function (direction) {
        var arrow = document.createElement('button');
        arrow.type = 'button';
        arrow.setAttribute('aria-label', direction < 0 ? 'previous photo' : 'next photo');
        arrow.setAttribute('style', 'position:absolute;top:50%;' + (direction < 0 ? 'left:8px' : 'right:8px') +
          ';transform:translateY(-50%);width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.9);' +
          'border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;' +
          'box-shadow:0 3px 10px rgba(0,0,0,.2);color:#2f2b22;z-index:2');
        arrow.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
          'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="' +
          (direction < 0 ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6') + '"/></svg>';
        arrow.onclick = function (event) { event.preventDefault(); event.stopPropagation(); show(index + direction); };
        host.appendChild(arrow);
      });

      var dotBar = document.createElement('div');
      dotBar.setAttribute('style', 'position:absolute;bottom:9px;left:0;right:0;display:flex;justify-content:center;gap:6px;z-index:2');
      slides.forEach(function (_, i) {
        var dot = document.createElement('span');
        dot.setAttribute('style', 'width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.55);' +
          'box-shadow:0 1px 3px rgba(0,0,0,.35);cursor:pointer;transition:transform .15s,background .15s');
        dot.onclick = function (event) { event.preventDefault(); event.stopPropagation(); show(i); };
        dotBar.appendChild(dot);
        dots.push(dot);
      });
      host.appendChild(dotBar);

      var startX = null;
      host.ontouchstart = function (event) { startX = event.touches[0].clientX; };
      host.ontouchend = function (event) {
        if (startX === null) return;
        var dx = event.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 40) show(index + (dx < 0 ? 1 : -1));
        startX = null;
      };
    }

    show(startIndex || 0);
  }

  function addEnlargeHint(el) {
    if (!el || el.querySelector('.rbzoom')) return;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    var hint = document.createElement('div');
    hint.className = 'rbzoom';
    hint.setAttribute('style', 'position:absolute;top:10px;right:10px;width:30px;height:30px;border-radius:9px;' +
      'background:rgba(255,255,255,.92);display:flex;align-items:center;justify-content:center;color:#2f2b22;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.22);pointer-events:none;z-index:3');
    hint.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
    el.appendChild(hint);
  }

  function ensureLightbox() {
    if (document.getElementById('rbLightbox')) return;
    var box = document.createElement('div');
    box.id = 'rbLightbox';
    box.setAttribute('style', 'position:fixed;inset:0;z-index:200;display:none;align-items:center;justify-content:center;' +
      'padding:20px;background:rgba(28,24,16,.82);backdrop-filter:blur(6px)');
    box.innerHTML = '<div style="position:relative;width:min(940px,95vw);max-height:92vh;background:#fff;' +
      'border-radius:20px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 40px 90px rgba(0,0,0,.5)">' +
      '<div class="lbphoto" style="position:relative;background:#0c0c0c;height:min(60vh,520px)"></div>' +
      '<div style="padding:22px 26px 26px">' +
      '<div class="lbname" style="font-family:\'Newsreader\',\'Noto Serif TC\',serif;font-weight:600;font-size:23px;color:#2f2b22;margin-bottom:8px"></div>' +
      '<div class="lbdesc" style="color:#6b6558;font-size:14.5px;line-height:1.7;margin-bottom:14px;white-space:pre-line"></div>' +
      '<div class="lbprice" style="display:flex;align-items:baseline;gap:4px"></div></div></div>' +
      '<button class="lbclose" type="button" aria-label="close" style="position:absolute;top:16px;right:16px;' +
      'width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);' +
      'color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
      'stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';

    document.body.appendChild(box);
    box.addEventListener('click', function (event) { if (event.target === box) closeLightbox(); });
    box.querySelector('.lbclose').onclick = closeLightbox;
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeLightbox(); });
  }

  function openLightbox(slides, startIndex, meta) {
    ensureLightbox();
    var box = document.getElementById('rbLightbox');
    buildCarousel(box.querySelector('.lbphoto'), slides, startIndex || 0);
    box.querySelector('.lbname').textContent = (meta && meta.name) || '';

    var description = box.querySelector('.lbdesc');
    description.textContent = (meta && meta.description) || '';
    description.style.display = (meta && meta.description) ? 'block' : 'none';

    box.querySelector('.lbprice').innerHTML = (meta && meta.priceHtml) || '';
    box.style.display = 'flex';
    document.documentElement.style.overflow = 'hidden';
  }

  function closeLightbox() {
    var box = document.getElementById('rbLightbox');
    if (box) box.style.display = 'none';
    document.documentElement.style.overflow = '';
  }

  function setupPhotoHost(host, slides, meta) {
    if (!host) return;
    buildCarousel(host, slides, 0);
    host.style.cursor = 'zoom-in';
    addEnlargeHint(host);
    host.onclick = function () { openLightbox(slides, host.__index || 0, meta || {}); };
  }

  function priceMarkup(room, accent, large) {
    var price = roomPrice(room);
    var unit = pickRow(room, 'unit', state.lang) || '';
    return '<span style="font-family:\'Newsreader\',serif;font-size:' + (large ? '34px' : '30px') +
      ';font-weight:600;color:' + accent + '">' + (String(price).indexOf('$') >= 0 ? '' : '$') + escapeHtml(price) +
      '</span><span style="font-size:' + (large ? '14px' : '13px') + ';color:#9a927f;margin-left:3px">' +
      escapeHtml(unit) + '</span>';
  }

  function buildRoomCard(room, index, lang) {
    var accent = ROOM_ACCENTS[index % ROOM_ACCENTS.length];
    var note = pickRow(room, 'note', lang);
    var card = document.createElement('div');
    card.setAttribute('style', 'background:#fff;border:1px solid #ece3d3;border-radius:20px;' +
      'box-shadow:0 10px 30px rgba(60,50,30,.06);display:flex;flex-direction:column;overflow:hidden');
    card.innerHTML =
      '<div class="rphoto" style="height:190px"></div><div style="height:5px;background:' + accent + '"></div>' +
      '<div style="padding:24px 24px 26px;display:flex;flex-direction:column;flex:1">' +
      '<div class="rn" style="font-family:\'Newsreader\',\'Noto Serif TC\',serif;font-weight:600;color:#2f2b22;font-size:21px;margin-bottom:8px"></div>' +
      '<div class="rd" style="color:#726b5c;font-size:14.5px;line-height:1.6;flex:1;margin-bottom:16px;white-space:pre-line"></div>' +
      '<div style="display:flex;align-items:baseline;gap:4px">' + priceMarkup(room, accent, false) + '</div>' +
      (note ? '<div class="rt" style="font-size:12.5px;color:#9a927f;margin-top:12px;padding-top:12px;border-top:1px dashed #ece3d3;white-space:pre-line"></div>' : '') +
      '</div>';

    var name = pickRow(room, 'name', lang) || '';
    var description = pickRow(room, 'description', lang) || '';
    card.querySelector('.rn').textContent = name;
    card.querySelector('.rd').textContent = description;
    if (note) card.querySelector('.rt').textContent = note;

    setupPhotoHost(card.querySelector('.rphoto'), roomSlides(room), {
      name: name, description: description, priceHtml: priceMarkup(room, accent, false)
    });
    return card;
  }

  function buildFeaturedRoom(room, lang) {
    var accent = '#2f8f57';
    var note = pickRow(room, 'note', lang);
    var wrap = document.createElement('div');
    wrap.setAttribute('style', 'display:flex;flex-wrap:wrap;background:#fff;border:1px solid #ece3d3;' +
      'border-radius:26px;overflow:hidden;box-shadow:0 22px 50px rgba(60,50,30,.10);max-width:1000px;margin:0 auto');
    wrap.innerHTML =
      '<div class="rphoto" style="flex:1 1 480px;min-width:300px;min-height:380px"></div>' +
      '<div style="flex:1 1 360px;min-width:280px;padding:clamp(28px,4vw,48px);display:flex;flex-direction:column;justify-content:center">' +
      '<div style="display:flex;align-items:center;gap:9px;margin-bottom:14px">' +
      '<span style="width:22px;height:2px;background:' + accent + ';border-radius:2px"></span>' +
      '<span style="font-size:11.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:' + accent + '">' +
      (lang === 'en' ? 'Our room' : '我們的房型') + '</span></div>' +
      '<div class="rn" style="font-family:\'Newsreader\',\'Noto Serif TC\',serif;font-weight:600;color:#2f2b22;font-size:clamp(24px,3vw,31px);margin-bottom:12px;line-height:1.15"></div>' +
      '<div class="rd" style="color:#6b6558;font-size:15.5px;line-height:1.7;margin-bottom:20px;white-space:pre-line"></div>' +
      '<div style="display:flex;align-items:baseline;gap:4px;margin-bottom:' + (note ? '14px' : '24px') + '">' +
      priceMarkup(room, accent, true) + '</div>' +
      (note ? '<div class="rt" style="font-size:13px;color:#9a927f;margin-bottom:24px;padding-top:14px;border-top:1px dashed #ece3d3;white-space:pre-line"></div>' : '') +
      '<a href="#apply" style="align-self:flex-start;display:inline-flex;align-items:center;gap:8px;background:#ec6a45;' +
      'color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:999px;' +
      'box-shadow:0 10px 24px rgba(236,106,69,.26)">' + (lang === 'en' ? 'Apply online' : '線上申請') + '</a></div>';

    var name = pickRow(room, 'name', lang) || '';
    var description = pickRow(room, 'description', lang) || '';
    wrap.querySelector('.rn').textContent = name;
    wrap.querySelector('.rd').textContent = description;
    if (note) wrap.querySelector('.rt').textContent = note;

    setupPhotoHost(wrap.querySelector('.rphoto'), roomSlides(room), {
      name: name, description: description, priceHtml: priceMarkup(room, accent, true)
    });
    return wrap;
  }

  function renderRooms(rooms, lang) {
    var host = document.getElementById('rooms-list');
    if (!host) return;

    var list = roomsToRender(rooms);
    host.innerHTML = '';

    if (list.length === 1) {
      host.setAttribute('style', 'margin-top:44px;display:block');
      host.appendChild(buildFeaturedRoom(list[0], lang));
    } else {
      host.setAttribute('style', 'margin-top:44px;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,340px));' +
        'gap:22px;justify-content:center');
      list.forEach(function (room, index) { host.appendChild(buildRoomCard(room, index, lang)); });
    }
  }

  function applyHeroPhotos(urls) {
    var hero = document.getElementById('heroPhoto');
    if (!hero) return;

    var slides = urls.length
      ? urls.map(function (url) { return { url: url }; })
      : DEMO_GRADIENTS.map(function (gradient) {
          return { gradient: gradient, labelZh: '農場實景', labelEn: 'Farm photo' };
        });

    if (urls.length) {
      var placeholder = document.getElementById('heroPhotoPh');
      if (placeholder) placeholder.style.display = 'none';
    }

    hero.style.cursor = 'zoom-in';
    addEnlargeHint(hero);
    hero.onclick = function () {
      var siteName = document.querySelector('[data-content="site_name"]');
      openLightbox(slides, 0, { name: siteName ? siteName.textContent : '彩虹星民宿' });
    };

    if (urls.length) {
      hero.style.backgroundImage = 'url("' + urls[0].replace(/"/g, '%22') + '")';
      hero.style.backgroundSize = 'cover';
      hero.style.backgroundPosition = 'center';
    }
  }

  function applySceneryPhotos(settings) {
    ['1', '2', '3'].forEach(function (n) {
      var tile = document.querySelector('#nearby [data-scenery="' + n + '"]');
      if (!tile) return;

      var urls = splitUrls(settings['scenery' + n + '_photos'] || settings['scenery' + n]);
      var label = tile.querySelector('span[data-zh]');
      var labelZh = label ? label.getAttribute('data-zh') : '';
      var labelEn = label ? label.getAttribute('data-en') : '';

      tile.style.cursor = 'zoom-in';
      addEnlargeHint(tile);

      if (urls.length) {
        tile.style.backgroundImage = 'url("' + urls[0].replace(/"/g, '%22') + '")';
        tile.style.backgroundSize = 'cover';
        tile.style.backgroundPosition = 'center';
        Array.prototype.forEach.call(tile.children, function (child) {
          if (!child.classList || !child.classList.contains('rbzoom')) child.style.display = 'none';
        });
      }

      tile.onclick = function () {
        var slides = urls.length
          ? urls.map(function (url) { return { url: url }; })
          : DEMO_GRADIENTS.map(function (gradient) {
              return { gradient: gradient, labelZh: labelZh, labelEn: labelEn };
            });
        openLightbox(slides, 0, { name: state.lang === 'en' ? labelEn : labelZh });
      };
    });
  }
```

Delete the four placeholder stubs from Task 13. Extend the returned object with: `DEFAULT_ROOMS`, `roomsToRender`, `collectPhotos`, `roomPrice`, `buildCarousel`, `openLightbox`, `closeLightbox`, `renderRooms`, `applyHeroPhotos`, `applySceneryPhotos`.

- [ ] **Step 4: 執行測試，確認它通過**

Run: `npm test`
Expected: PASS — 119 tests passing

- [ ] **Step 5: 在瀏覽器驗證**

1. `browser_navigate` 至 `file:///c:/Users/wuuu1/Desktop/rainbowstar/site/index.html`
2. `browser_snapshot` — Expected: 住宿區出現**一張精選大卡**（單一房型走 featured 版型），含「線上申請」按鈕與 `$—` 價格。
3. `browser_click` 該房型照片 — Expected: 燈箱開啟，顯示房型名稱。
4. `browser_press_key` `Escape` — Expected: 燈箱關閉。
5. `browser_click` 首頁大圖卡 — Expected: 燈箱開啟；三張漸層佔位可用左右箭頭與圓點切換。
6. `browser_click` 周邊景點三張圖之一 — Expected: 燈箱開啟並顯示該景點名稱（如「農場一角」）。
7. `browser_console_messages` — Expected: 無 error。

- [ ] **Step 6: Commit**

```bash
git add site/app.js tests/app.test.js
git commit -m "Restore the room cards, photo carousels and lightbox

A single room renders as the featured layout with a photo and an apply
button; several render as a centred grid with per-card accent bars. The
built-in fallback room carries English copy so the language toggle never
strands an English visitor on Chinese text."
```

---

## Task 16: 表單驗證與送出（修正「假成功」缺陷）

設計稿以 `mode:'no-cors'` 送出，回應是 opaque，`.then()` 卻無條件顯示「✓ 已送出」。後端若拋錯，訪客仍看到成功，而業者永遠收不到那筆詢問。

表單以 `application/x-www-form-urlencoded` 送出（簡單請求、不觸發預檢），**理論上回應可跨源讀取**。因此預設走「讀真實回應」，並保留一條在 Task 21 實測後可能啟用的退路。

**Files:**
- Modify: `site/app.js`
- Modify: `tests/app.test.js`

**Interfaces:**
- Consumes: Task 15 的全部；`state`
- Produces:
  - `Rainbowstar.SUBMIT_MODE = 'readable'` — Task 21 實測後可改為 `'opaque'`
  - `Rainbowstar.validate(form): Array<{name, message}>`
  - `Rainbowstar.submitForm(form, config, fetchImpl): Promise<{ok: boolean, reason?: string}>`
  - `Rainbowstar.attachSubmit(formId, messageId): void`
  - `Rainbowstar.setType(type: 'accommodation'|'workexchange'): void`
  - `Rainbowstar.toggleAddon(show: boolean): void`

---

- [ ] **Step 1: 寫失敗的測試**

Append to `tests/app.test.js`:

```js
/** A stand-in <form> exposing only what validate() and submitForm() touch. */
function fakeForm(values) {
  const fields = Object.keys(values).map((name) => ({ name, value: values[name] }));
  return {
    fields,
    querySelector: (selector) => {
      const match = selector.match(/^\[name="(.+)"\](:checked)?$/);
      if (!match) return null;
      const field = fields.find((f) => f.name === match[1]);
      if (!field) return null;
      if (match[2] && !field.checked) return null;
      return field;
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
```

- [ ] **Step 2: 執行測試，確認它失敗**

Run: `npm test`
Expected: FAIL — `app.validate is not a function`

- [ ] **Step 3: 寫實作**

Add to `site/app.js`, inside the IIFE. `buildFormBody` 抽出來是為了讓 `submitForm` 在 Node 測試裡不需要真的 `FormData`：

```js
  var MESSAGES = {
    ok: { zh: '✓ 申請已送出，我們會盡快與你聯絡！', en: '✓ Application sent — we\'ll be in touch soon!' },
    err: { zh: '送出失敗，請稍後再試，或直接 email 我們。', en: 'Submission failed. Please try again or email us.' },
    noBackend: { zh: '網站尚未連接後端（請站長在設定區填入 Apps Script 網址）。', en: 'Backend not connected yet — the owner needs to add the Apps Script URL.' },
    sending: { zh: '送出中…', en: 'Sending…' }
  };

  function tx(entry) { return entry[state.lang === 'en' ? 'en' : 'zh']; }
  function vmsg(zh, en) { return state.lang === 'en' ? en : zh; }

  function fieldValue(form, name) {
    var el = form.querySelector('[name="' + name + '"]');
    return el ? el.value : '';
  }
  function hasField(form, name) { return Boolean(form.querySelector('[name="' + name + '"]')); }
  function digitsOnly(value) { return String(value || '').replace(/[^0-9]/g, ''); }
  function looksFake(value) {
    var text = String(value || '').trim();
    return text.length < 2 || /^(.)\1+$/.test(text);
  }
  function isEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim()); }
  function isUrl(value) { return /^https?:\/\/.+\..+/i.test(String(value || '').trim()); }

  function validate(form) {
    var errors = [];
    function bad(name, zh, en) { errors.push({ name: name, message: vmsg(zh, en) }); }

    if (hasField(form, 'room_type') && !form.querySelector('[name="room_type"]:checked')) {
      bad('room_type', '請選擇想預定的房型', 'Please choose a room type');
    }
    if (hasField(form, 'name_en')) {
      var nameEn = fieldValue(form, 'name_en');
      if (!/[A-Za-z]{2,}/.test(nameEn) || looksFake(nameEn)) {
        bad('name_en', '英文姓名請填寫正確（至少兩個英文字母）', 'Please enter a valid English name');
      }
    }
    if (hasField(form, 'name_zh') && looksFake(fieldValue(form, 'name_zh'))) bad('name_zh', '中文姓名請填寫正確', 'Please enter a valid name');
    if (hasField(form, 'country') && looksFake(fieldValue(form, 'country'))) bad('country', '國家請填寫正確', 'Please enter a valid country');
    if (hasField(form, 'phone') && digitsOnly(fieldValue(form, 'phone')).length < 6) bad('phone', '電話請填寫正確（至少 6 位數字）', 'Please enter a valid phone number (at least 6 digits)');
    if (hasField(form, 'email') && !isEmail(fieldValue(form, 'email'))) bad('email', 'Email 格式不正確', 'Please enter a valid email');

    if (hasField(form, 'passport')) {
      var passport = fieldValue(form, 'passport').trim();
      if (passport.length < 5 || looksFake(passport) || !/[A-Za-z0-9]/.test(passport)) {
        bad('passport', '護照號碼請填寫正確', 'Please enter a valid passport number');
      }
    }
    if (hasField(form, 'guests') && !(parseInt(fieldValue(form, 'guests'), 10) >= 1)) bad('guests', '入住人數請填寫數字', 'Please enter a valid number of guests');

    if (hasField(form, 'checkin') && hasField(form, 'checkout')) {
      var checkin = fieldValue(form, 'checkin');
      var checkout = fieldValue(form, 'checkout');
      if (checkin && checkout && checkout <= checkin) bad('checkout', '退房日期需晚於入住日期', 'Check-out must be after check-in');
    }
    if (hasField(form, 'address')) {
      var address = fieldValue(form, 'address');
      if (looksFake(address) || address.trim().length < 4) bad('address', '居住地址請填寫正確', 'Please enter a valid address');
    }
    if (hasField(form, 'emergency_phone') && digitsOnly(fieldValue(form, 'emergency_phone')).length < 6) bad('emergency_phone', '緊急連絡電話請填寫正確', 'Please enter a valid emergency phone');
    if (hasField(form, 'emergency_name') && looksFake(fieldValue(form, 'emergency_name'))) bad('emergency_name', '緊急連絡人請填寫正確', 'Please enter a valid emergency contact');
    if (hasField(form, 'photo_url') && !isUrl(fieldValue(form, 'photo_url'))) bad('photo_url', '照片連結請填有效網址（http 開頭）', 'Please enter a valid photo URL (starting with http)');

    if (hasField(form, 'age')) {
      var age = parseInt(fieldValue(form, 'age'), 10);
      if (!(age >= 10 && age <= 99)) bad('age', '年齡請填寫正確', 'Please enter a valid age');
    }
    if (hasField(form, 'start_date') && hasField(form, 'end_date')) {
      var start = fieldValue(form, 'start_date');
      var end = fieldValue(form, 'end_date');
      if (start && end && end < start) bad('end_date', '結束日期不可早於開始日期', 'End date cannot be before start date');
    }
    if (hasField(form, 'birthday')) {
      var birthday = fieldValue(form, 'birthday');
      if (birthday) {
        var born = new Date(birthday);
        var years = (Date.now() - born.getTime()) / 31557600000;
        if (born > new Date() || years > 120) bad('birthday', '出生日期不正確', 'Date of birth is invalid');
      }
    }
    return errors;
  }

  function buildFormBody(form) {
    if (typeof FormData === 'undefined') return '';
    return new URLSearchParams(new FormData(form));
  }

  /**
   * Sends the form and reports what actually happened.
   *
   * The old code posted with mode:'no-cors' and then unconditionally announced
   * success. An opaque response carries no status and no body, so a submission
   * the back end rejected still looked fine to the visitor and the enquiry was
   * lost. A urlencoded body is a simple request, so the response should be
   * readable cross-origin; opaque mode remains only as a verified fallback.
   */
  function submitForm(form, config, fetchImpl) {
    var url = config && config.WEBAPP_URL;
    if (!url) return Promise.resolve({ ok: false, reason: 'WEBAPP_URL is not configured' });

    var opaque = (config.SUBMIT_MODE || SUBMIT_MODE) === 'opaque';
    var options = { method: 'POST', body: buildFormBody(form) };
    if (opaque) options.mode = 'no-cors';

    return fetchImpl(url, options)
      .then(function (response) {
        if (opaque) return { ok: true };
        return response.json().then(function (payload) {
          return payload && payload.ok
            ? { ok: true }
            : { ok: false, reason: (payload && payload.error) || 'unknown error' };
        });
      })
      .catch(function (error) { return { ok: false, reason: String(error) }; });
  }

  function setInvalid(el, invalid) {
    if (!el) return;
    if (invalid) {
      el.style.borderColor = '#ec6a45';
      el.style.boxShadow = '0 0 0 3px rgba(236,106,69,.18)';
    } else {
      el.style.borderColor = '';
      el.style.boxShadow = '';
    }
  }

  function setMessage(el, kind, html) {
    if (!el) return;
    if (!kind) { el.style.display = 'none'; el.innerHTML = ''; return; }

    el.setAttribute('style', 'display:block;margin-top:16px;padding:13px 16px;border-radius:12px;' +
      'font-size:14.5px;line-height:1.55;' + (kind === 'ok'
        ? 'background:#e7f4ec;color:#1f6b40;border:1px solid #bfe2cd'
        : 'background:#fdece7;color:#b3401f;border:1px solid #f3c6b7'));
    el.innerHTML = html;
  }

  function scrollToEl(el) {
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 96, behavior: 'smooth' });
  }

  function attachSubmit(formId, messageId) {
    var form = document.getElementById(formId);
    var message = document.getElementById(messageId);
    if (!form) return;

    form.onsubmit = function (event) {
      event.preventDefault();
      setMessage(message, null);
      Array.prototype.forEach.call(form.querySelectorAll('[name]'), function (el) { setInvalid(el, false); });

      var errors = validate(form);
      if (errors.length) {
        errors.forEach(function (error) { setInvalid(form.querySelector('[name="' + error.name + '"]'), true); });
        setMessage(message, 'err', vmsg('請修正以下欄位：', 'Please fix the following:') + '<br>• ' +
          errors.map(function (e) { return e.message; }).join('<br>• '));
        scrollToEl(form.querySelector('[name="' + errors[0].name + '"]'));
        return;
      }

      var config = window.RAINBOWSTAR_CONFIG || { WEBAPP_URL: '' };
      if (!config.WEBAPP_URL) { setMessage(message, 'err', tx(MESSAGES.noBackend)); return; }

      var button = form.querySelector('button[type=submit]');
      var label = button.textContent;
      button.disabled = true;
      button.textContent = tx(MESSAGES.sending);

      submitForm(form, config, window.fetch.bind(window)).then(function (result) {
        if (result.ok) {
          setMessage(message, 'ok', tx(MESSAGES.ok));
          form.reset();
          if (formId === 'formStay') toggleAddon(false);
        } else {
          console.warn('送出失敗：', result.reason);
          setMessage(message, 'err', tx(MESSAGES.err));
        }
        scrollToEl(message);
        button.disabled = false;
        button.textContent = label;
      });
    };
  }

  function segmentStyle(button, active) {
    if (!button) return;
    button.style.background = active ? '#2f8f57' : 'transparent';
    button.style.color = active ? '#fff' : '#7a7263';
    button.style.boxShadow = active ? '0 8px 18px rgba(47,143,87,.26)' : 'none';
  }

  function setType(type) {
    var stay = type === 'accommodation';
    segmentStyle(document.getElementById('seg-stay'), stay);
    segmentStyle(document.getElementById('seg-work'), !stay);

    var stayForm = document.getElementById('formStay');
    var workForm = document.getElementById('formWork');
    if (stayForm) stayForm.style.display = stay ? 'block' : 'none';
    if (workForm) workForm.style.display = stay ? 'none' : 'block';
  }

  function toggleAddon(show) {
    var details = document.getElementById('addonDetails');
    if (details) details.style.display = show ? 'block' : 'none';
  }
```

Add near the top of the IIFE:

```js
  /** Flip to 'opaque' only if Task 21 proves the response is unreadable cross-origin. */
  var SUBMIT_MODE = 'readable';
```

Extend `boot()` with:

```js
    setType('accommodation');
    attachSubmit('formStay', 'msgStay');
    attachSubmit('formWork', 'msgWork');

    var stayButton = document.getElementById('seg-stay');
    if (stayButton) stayButton.onclick = function () { setType('accommodation'); };
    var workButton = document.getElementById('seg-work');
    if (workButton) workButton.onclick = function () { setType('workexchange'); };

    Array.prototype.forEach.call(document.querySelectorAll('input[name="need_addon"]'), function (radio) {
      radio.onchange = function () { toggleAddon(radio.value === 'YES'); };
    });
```

Extend the returned object with: `SUBMIT_MODE`, `validate`, `submitForm`, `attachSubmit`, `setType`, `toggleAddon`.

- [ ] **Step 4: 執行測試，確認它通過**

Run: `npm test`
Expected: PASS — 131 tests passing

- [ ] **Step 5: 在瀏覽器驗證**

1. `browser_navigate` 至 `file:///c:/Users/wuuu1/Desktop/rainbowstar/site/index.html`
2. `browser_click` 「換宿申請」分頁鈕 — Expected: 住宿表單隱藏、換宿表單顯示。切回亦然。
3. 切到住宿表單，`browser_click` 送出鈕（不填任何欄位） — Expected: 出現紅色錯誤框列出多個欄位；頁面捲到第一個錯誤欄位；該欄位邊框轉紅。**不得**出現成功訊息。
4. `browser_fill_form` 填妥所有必填欄位後 `browser_click` 送出 — Expected: 因 `WEBAPP_URL` 為空，顯示「網站尚未連接後端」的**錯誤**訊息。這正是修正後的行為：**沒有後端就不會假裝成功**。
5. `browser_click` 加購服務的 `YES` — Expected: 加購細節區塊展開；點 `NO` 收合。

- [ ] **Step 6: Commit**

```bash
git add site/app.js tests/app.test.js
git commit -m "Tell the visitor what actually happened to their submission

The page used to post with mode:'no-cors' and then announce success in the
then-handler. An opaque response has no status and no body, so a submission
the back end rejected or threw on still rendered a green tick, and the
enquiry vanished. The urlencoded body is a simple request, so the response
should be readable cross-origin; submitForm now reads it and reports the
truth. An opaque fallback stays behind a flag pending the live check."
```

---

## Task 17: 後台頁外殼與登入

後台頁由 Apps Script 的 `HtmlService` 供出，與後端同源，因此 `google.script.run` 不受 CORS 限制。但**同源不等於已授權**：任何人打開這頁就能從主控台呼叫伺服端函式，所以密碼換得的 token 必須隨每一次呼叫送出。

`Admin.html` 內是 UI，不含商業邏輯，無法用 `node --test` 驅動。取而代之，本 Task 加入一支**靜態檢查測試**，強制 Global Constraint 4 不被違反；行為驗證留到 Task 22 的實機測試。

**Files:**
- Create: `apps-script/Admin.html`
- Create: `tests/admin.test.js`

**Interfaces:**
- Consumes: Task 8 的 `verifyPasscode(passcode)`、Task 9 的 `loadAdminContent(token)`
- Produces（`Admin.html` 內的全域）:
  - `TOKEN: string|null`、`CONTENT: object|null`
  - `run(name, ...args): Promise<any>` — 包裝 `google.script.run`
  - `runAuth(name, ...args): Promise<any>` — 自動把 `TOKEN` 放在第一個參數
  - `showApp()` / `showLogin(errorMessage)`

---

- [ ] **Step 1: 寫失敗的測試**

Create `tests/admin.test.js`:

```js
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
```

- [ ] **Step 2: 執行測試，確認它失敗**

Run: `npm test`
Expected: FAIL — `ENOENT: no such file or directory, open '.../apps-script/Admin.html'`

- [ ] **Step 3: 建立 `apps-script/Admin.html`**

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<base target="_top">
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { margin:0; background:#fdfbf6; color:#2f2b22; font-family:'Noto Sans TC',system-ui,-apple-system,sans-serif; font-size:15px; line-height:1.6; }
  .wrap { max-width:960px; margin:0 auto; padding:28px 20px 80px; }
  h1 { font-size:22px; margin:0 0 4px; color:#1f6b40; }
  .sub { color:#9a927f; font-size:13px; margin-bottom:26px; }
  .card { background:#fff; border:1px solid #ece3d3; border-radius:16px; padding:22px; margin-bottom:18px; box-shadow:0 8px 24px rgba(60,50,30,.05); }
  .card h2 { font-size:17px; margin:0 0 16px; color:#1f6b40; }
  label { display:block; font-weight:600; font-size:13px; margin:14px 0 6px; color:#3a382f; }
  input[type=text], input[type=email], textarea {
    width:100%; padding:10px 12px; border:1.5px solid #e4dccb; border-radius:10px;
    font:inherit; background:#fff; color:#2f2b22;
  }
  input:focus, textarea:focus { outline:2px solid #2f8f57; border-color:transparent; }
  textarea { min-height:84px; resize:vertical; }
  .row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  @media (max-width:700px) { .row { grid-template-columns:1fr; } }
  .btn { border:0; border-radius:999px; padding:11px 22px; font-weight:700; cursor:pointer; font-size:14px; }
  .btn-primary { background:#2f8f57; color:#fff; }
  .btn-primary:disabled { opacity:.55; cursor:default; }
  .btn-ghost { background:#f2ece0; color:#5c5648; }
  .btn-danger { background:#fdece7; color:#b3401f; }
  .msg { display:none; margin:14px 0; padding:11px 14px; border-radius:10px; font-size:14px; }
  .msg.ok { display:block; background:#e7f4ec; color:#1f6b40; border:1px solid #bfe2cd; }
  .msg.err { display:block; background:#fdece7; color:#b3401f; border:1px solid #f3c6b7; }
  .bar { position:sticky; bottom:0; background:rgba(253,251,246,.94); border-top:1px solid #ece3d3; padding:14px 20px; display:flex; gap:12px; justify-content:flex-end; }
  #login { max-width:380px; margin:14vh auto; }
</style>
</head>
<body>

<div id="login">
  <div class="card">
    <h1>彩虹星民宿 — 網站後台</h1>
    <div class="sub">Rainbowstar site admin</div>
    <label for="passcode">密碼 Passcode</label>
    <input type="password" id="passcode" autocomplete="current-password">
    <div id="loginMsg" class="msg"></div>
    <div style="margin-top:16px"><button class="btn btn-primary" id="loginBtn">登入 Sign in</button></div>
  </div>
</div>

<div id="app" style="display:none">
  <div class="wrap">
    <h1>網站後台</h1>
    <div class="sub">改完記得按最下面的「儲存」。公開網站會在訪客下次開啟時更新。</div>
    <div id="sections"></div>
    <div id="saveMsg" class="msg"></div>
  </div>
  <div class="bar">
    <button class="btn btn-ghost" id="reloadBtn">重新載入</button>
    <button class="btn btn-primary" id="saveBtn">儲存</button>
  </div>
</div>

<script>
  var TOKEN = null;
  var CONTENT = null;

  /** Unauthenticated call. Only verifyPasscode may use this. */
  function run(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    return new Promise(function (resolve, reject) {
      google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[name].apply(null, args);
    });
  }

  /**
   * Authenticated call.
   *
   * The web app is published for Anyone, so loading this page is enough to
   * invoke its server functions from the console. Every guarded function takes
   * the session token as its first argument and verifies it server-side.
   */
  function runAuth(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    args.unshift(TOKEN);
    return new Promise(function (resolve, reject) {
      google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[name].apply(null, args);
    });
  }

  function setMsg(el, kind, text) {
    el.className = 'msg' + (kind ? ' ' + kind : '');
    el.textContent = text || '';
  }

  function showLogin(errorMessage) {
    document.getElementById('login').style.display = 'block';
    document.getElementById('app').style.display = 'none';
    if (errorMessage) setMsg(document.getElementById('loginMsg'), 'err', errorMessage);
  }

  function showApp() {
    document.getElementById('login').style.display = 'none';
    document.getElementById('app').style.display = 'block';
  }

  function loadAndRender() {
    return runAuth('loadAdminContent').then(function (content) {
      CONTENT = content;
      renderSections();
    });
  }

  function signIn() {
    var button = document.getElementById('loginBtn');
    var passcode = document.getElementById('passcode').value;
    button.disabled = true;

    run('verifyPasscode', passcode).then(function (result) {
      if (!result || !result.ok) {
        button.disabled = false;
        showLogin('密碼錯誤 Wrong passcode');
        return;
      }
      TOKEN = result.token;
      try { sessionStorage.setItem('rb_admin_token', TOKEN); } catch (error) { /* private mode */ }
      showApp();
      return loadAndRender();
    }).catch(function (error) {
      button.disabled = false;
      showLogin(String(error));
    });
  }

  /** Filled in by Tasks 18-20. */
  function renderSections() {}

  document.getElementById('loginBtn').onclick = signIn;
  document.getElementById('passcode').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') signIn();
  });
  document.getElementById('reloadBtn').onclick = function () { loadAndRender(); };

  (function restoreSession() {
    var saved = null;
    try { saved = sessionStorage.getItem('rb_admin_token'); } catch (error) { /* private mode */ }
    if (!saved) return;
    TOKEN = saved;
    runAuth('loadAdminContent').then(function (content) {
      CONTENT = content;
      showApp();
      renderSections();
    }).catch(function () { TOKEN = null; showLogin(''); });
  })();
</script>
</body>
</html>
```

- [ ] **Step 4: 執行測試，確認它通過**

Run: `npm test`
Expected: PASS — 137 tests passing

- [ ] **Step 5: Commit**

```bash
git add apps-script/Admin.html tests/admin.test.js
git commit -m "Add the admin shell and its passcode gate

Same origin is not authorisation: the web app answers to Anyone, so loading
this page is enough to call its server functions from the console. The
passcode buys a session token that runAuth prepends to every guarded call,
and a static check keeps any future call from bypassing it."
```

---

## Task 18: 後台 — 文字與房型編輯器

**Files:**
- Modify: `apps-script/Admin.html`
- Modify: `tests/admin.test.js`

**Interfaces:**
- Consumes: Task 17 的 `CONTENT`、`runAuth`、`renderSections`
- Produces（`Admin.html` 內的全域）:
  - `SECTIONS: Array<{title, keys: Array<{key, label, multiline?, translatable?}>, photos?: string}>`
  - `renderTextField(key, label, options): HTMLElement`
  - `renderRoomsEditor(): HTMLElement`
  - `collectPayload(): {settings: object, rooms: object[]}`
  - `saveAll(): Promise<void>`

---

- [ ] **Step 1: 寫失敗的測試**

Append to `tests/admin.test.js`:

```js
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
```

- [ ] **Step 2: 執行測試，確認它失敗**

Run: `npm test`
Expected: FAIL — `no admin editor for site_name`

- [ ] **Step 3: 寫實作**

Replace the placeholder `renderSections` in `Admin.html`'s `<script>` with:

```js
  var SECTIONS = [
    { title: '基本資訊', keys: [
      { key: 'site_name', label: '站名', translatable: false },
      { key: 'contact_email', label: '聯絡 Email（顯示在網站上）', translatable: false },
      { key: 'contact_line', label: '電話 / LINE', translatable: false },
      { key: 'notify_email', label: '收表單通知信的信箱', translatable: false },
      { key: 'location_text', label: '地點' }
    ] },
    { title: '首頁', photos: 'hero', keys: [
      { key: 'tagline', label: '首頁標語', multiline: true }
    ] },
    { title: '關於我們', keys: [
      { key: 'intro_text', label: '介紹段落', multiline: true },
      { key: 'feature_1', label: '特色一：舒適住宿', multiline: true },
      { key: 'feature_2', label: '特色二：打工換宿', multiline: true },
      { key: 'feature_3', label: '特色三：生活便利', multiline: true }
    ] },
    { title: '住宿', keys: [
      { key: 'accommodation_intro', label: '住宿區介紹', multiline: true },
      { key: 'booking_note', label: '預定注意事項', multiline: true }
    ] },
    { title: '打工換宿', keys: [
      { key: 'workexchange_intro', label: '換宿區介紹', multiline: true }
    ] },
    { title: '周邊景點', keys: [] }
  ];

  var ROOM_FIELDS = [
    { column: 'name', label: '房型名稱' },
    { column: 'description', label: '房型描述', multiline: true },
    { column: 'unit', label: '價格單位（例：/ 床）' },
    { column: 'note', label: '備註（可留空）', multiline: true }
  ];

  function el(tag, attributes, children) {
    var node = document.createElement(tag);
    Object.keys(attributes || {}).forEach(function (name) {
      if (name === 'class') node.className = attributes[name];
      else if (name === 'text') node.textContent = attributes[name];
      else node.setAttribute(name, attributes[name]);
    });
    (children || []).forEach(function (child) { node.appendChild(child); });
    return node;
  }

  function inputFor(value, multiline, id) {
    var node = document.createElement(multiline ? 'textarea' : 'input');
    if (!multiline) node.type = 'text';
    node.id = id;
    node.value = value === undefined || value === null ? '' : String(value);
    return node;
  }

  /** One label plus a Chinese box and, unless untranslatable, an English box. */
  function renderTextField(key, label, options) {
    var settings = CONTENT.settings || {};
    var wrap = el('div', {});

    if (options.translatable === false) {
      wrap.appendChild(el('label', { text: label, for: 'f_' + key }));
      wrap.appendChild(inputFor(settings[key], options.multiline, 'f_' + key));
      return wrap;
    }

    var row = el('div', { class: 'row' });
    var zh = el('div', {});
    zh.appendChild(el('label', { text: label + '（中文）', for: 'f_' + key }));
    zh.appendChild(inputFor(settings[key], options.multiline, 'f_' + key));

    var en = el('div', {});
    en.appendChild(el('label', { text: label + '（English，可留空）', for: 'f_' + key + '_en' }));
    en.appendChild(inputFor(settings[key + '_en'], options.multiline, 'f_' + key + '_en'));

    row.appendChild(zh);
    row.appendChild(en);
    wrap.appendChild(row);
    return wrap;
  }

  function renderRoomCard(room, index) {
    var card = el('div', { class: 'card', id: 'room_' + index });
    card.appendChild(el('h2', { text: '房型 ' + (index + 1) }));

    ROOM_FIELDS.forEach(function (field) {
      var row = el('div', { class: 'row' });

      var zh = el('div', {});
      zh.appendChild(el('label', { text: field.label + '（中文）' }));
      zh.appendChild(inputFor(room[field.column], field.multiline, 'r' + index + '_' + field.column));

      var en = el('div', {});
      en.appendChild(el('label', { text: field.label + '（English，可留空）' }));
      en.appendChild(inputFor(room[field.column + '_en'], field.multiline, 'r' + index + '_' + field.column + '_en'));

      row.appendChild(zh);
      row.appendChild(en);
      card.appendChild(row);
    });

    card.appendChild(el('label', { text: '價格（數字；留空顯示破折號）' }));
    card.appendChild(inputFor(room.price, false, 'r' + index + '_price'));

    card.appendChild(renderPhotoManager('room-' + index, room.photos));

    var remove = el('button', { class: 'btn btn-danger', type: 'button', text: '刪除這個房型' });
    remove.style.marginTop = '16px';
    remove.onclick = function () {
      CONTENT.rooms = collectRooms().filter(function (_, i) { return i !== index; });
      renderSections();
    };
    card.appendChild(remove);
    return card;
  }

  function collectRooms() {
    return (CONTENT.rooms || []).map(function (room, index) {
      var updated = { photos: room.photos || '' };
      ROOM_FIELDS.forEach(function (field) {
        updated[field.column] = document.getElementById('r' + index + '_' + field.column).value;
        updated[field.column + '_en'] = document.getElementById('r' + index + '_' + field.column + '_en').value;
      });
      updated.price = document.getElementById('r' + index + '_price').value;
      return updated;
    });
  }

  function collectPayload() {
    var settings = {};
    SECTIONS.forEach(function (section) {
      section.keys.forEach(function (field) {
        settings[field.key] = document.getElementById('f_' + field.key).value;
        if (field.translatable !== false) {
          settings[field.key + '_en'] = document.getElementById('f_' + field.key + '_en').value;
        }
      });
    });
    return { settings: settings, rooms: collectRooms() };
  }

  function saveAll() {
    var button = document.getElementById('saveBtn');
    var message = document.getElementById('saveMsg');
    button.disabled = true;
    setMsg(message, '', '');

    return runAuth('saveContent', collectPayload()).then(function () {
      setMsg(message, 'ok', '已儲存。公開網站會在訪客下次開啟時更新。');
      button.disabled = false;
    }).catch(function (error) {
      setMsg(message, 'err', '儲存失敗：' + error);
      button.disabled = false;
    });
  }

  function renderSections() {
    var host = document.getElementById('sections');
    host.innerHTML = '';

    SECTIONS.forEach(function (section) {
      var card = el('div', { class: 'card' });
      card.appendChild(el('h2', { text: section.title }));
      section.keys.forEach(function (field) {
        card.appendChild(renderTextField(field.key, field.label, field));
      });
      if (section.photos) card.appendChild(renderPhotoManager(section.photos, (CONTENT.settings || {})[section.photos + '_photos']));
      if (section.title === '周邊景點') {
        ['1', '2', '3'].forEach(function (n) {
          card.appendChild(el('label', { text: '景點 ' + n + ' 照片' }));
          card.appendChild(renderPhotoManager('scenery-' + n, (CONTENT.settings || {})['scenery' + n + '_photos']));
        });
      }
      host.appendChild(card);
    });

    var roomsCard = el('div', { class: 'card' });
    roomsCard.appendChild(el('h2', { text: '房型' }));
    host.appendChild(roomsCard);

    (CONTENT.rooms || []).forEach(function (room, index) { host.appendChild(renderRoomCard(room, index)); });

    var add = el('button', { class: 'btn btn-ghost', type: 'button', text: '＋ 新增房型' });
    add.onclick = function () {
      CONTENT.rooms = collectRooms().concat([{ name: '', description: '', price: '', unit: '', note: '', photos: '' }]);
      renderSections();
    };
    host.appendChild(add);

    renderListEditors(host);
  }

  /** Filled in by Task 19. */
  function renderPhotoManager(section, photosValue) { void section; void photosValue; return document.createElement('div'); }
  /** Filled in by Task 20. */
  function renderListEditors(host) { void host; }
```

Wire the save button, replacing nothing else:

```js
  document.getElementById('saveBtn').onclick = saveAll;
```

- [ ] **Step 4: 執行測試，確認它通過**

Run: `npm test`
Expected: PASS — 141 tests passing

- [ ] **Step 5: Commit**

```bash
git add apps-script/Admin.html tests/admin.test.js
git commit -m "Let the owner edit every text field and room from the admin panel

Each translatable field shows a Chinese box and an English box; leaving the
English box empty is meaningful, because the public page then keeps the
English already written into its markup. Site name, contact details and the
notification address are the same in both languages and offer one box."
```

---

## Task 19: 後台 — 照片管理（上傳、刪除、拖曳排序）

業者用手機拍的照片動輒 4–8 MB。base64 會再放大約三分之一，`google.script.run` 的參數有大小上限，且 Apps Script 執行時間有限。因此**上傳前先在瀏覽器把長邊縮到 1600px**，這也正好對應 `photoUrlFor_` 產生的 `=w1600` CDN 尺寸。

**Files:**
- Modify: `apps-script/Admin.html`
- Modify: `tests/admin.test.js`

**Interfaces:**
- Consumes: Task 10 的 `uploadPhoto` / `deletePhoto` / `reorderPhotos`；Task 18 的 `el` / `CONTENT` / `renderSections`
- Produces（`Admin.html` 內的全域）:
  - `MAX_IMAGE_EDGE = 1600`
  - `downscaleImage(file, maxEdge): Promise<{base64: string, mimeType: string}>`
  - `renderPhotoManager(section, photosValue): HTMLElement`
  - `updatePhotoState(section, urls): void` — 把回傳的網址寫回 `CONTENT`，避免與 `saveContent` 互相覆蓋

---

- [ ] **Step 1: 寫失敗的測試**

Append to `tests/admin.test.js`:

```js
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
```

- [ ] **Step 2: 執行測試，確認它失敗**

Run: `npm test`
Expected: FAIL — `runAuth('uploadPhoto', section, ...` not found

- [ ] **Step 3: 寫實作**

Replace the placeholder `renderPhotoManager` in `Admin.html` with:

```js
  var MAX_IMAGE_EDGE = 1600;

  function splitUrls(value) {
    if (!value) return [];
    var urls = [];
    String(value).split(/[\n,|]+/).forEach(function (raw) {
      var url = raw.trim();
      if (url && urls.indexOf(url) < 0) urls.push(url);
    });
    return urls;
  }

  /**
   * Shrinks a photo before upload.
   *
   * A phone photo is several megabytes, base64 inflates it by a third, and
   * google.script.run caps its arguments. 1600px is also the width the CDN link
   * requests, so nothing visible is lost.
   */
  function downscaleImage(file, maxEdge) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('讀取檔案失敗')); };
      reader.onload = function () {
        var image = new Image();
        image.onerror = function () { reject(new Error('這不是有效的圖片檔')); };
        image.onload = function () {
          var scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(image.width * scale);
          canvas.height = Math.round(image.height * scale);
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);

          var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /** Keeps CONTENT in step with the sheet, so a later saveContent cannot undo a photo change. */
  function updatePhotoState(section, urls) {
    var joined = urls.join('\n');
    var roomMatch = section.match(/^room-(\d+)$/);

    if (roomMatch) {
      CONTENT.rooms[Number(roomMatch[1])].photos = joined;
      return;
    }
    var key = section === 'hero' ? 'hero_photos' : 'scenery' + section.split('-')[1] + '_photos';
    CONTENT.settings = CONTENT.settings || {};
    CONTENT.settings[key] = joined;
  }

  function renderPhotoManager(section, photosValue) {
    var wrap = el('div', {});
    wrap.style.marginTop = '14px';

    var status = el('div', { class: 'msg' });
    var grid = el('div', {});
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;margin:10px 0';

    var urls = splitUrls(photosValue);

    function persistOrder() {
      runAuth('reorderPhotos', section, urls).then(function (result) {
        updatePhotoState(section, result.urls);
        urls = result.urls;
        paint();
      }).catch(function (error) { setMsg(status, 'err', '排序失敗：' + error); });
    }

    function paint() {
      grid.innerHTML = '';
      if (!urls.length) {
        grid.appendChild(el('div', { text: '（尚無照片）' }));
      }

      urls.forEach(function (url, index) {
        var tile = el('div', {});
        tile.draggable = true;
        tile.style.cssText = 'position:relative;width:120px;height:90px;border-radius:10px;overflow:hidden;' +
          'border:1px solid #e4dccb;background:#f2ece0 center/cover no-repeat;cursor:grab';
        tile.style.backgroundImage = 'url("' + url.replace(/"/g, '%22') + '")';

        tile.addEventListener('dragstart', function (event) { event.dataTransfer.setData('text/plain', String(index)); });
        tile.addEventListener('dragover', function (event) { event.preventDefault(); });
        tile.addEventListener('drop', function (event) {
          event.preventDefault();
          var from = Number(event.dataTransfer.getData('text/plain'));
          if (from === index) return;
          var moved = urls.splice(from, 1)[0];
          urls.splice(index, 0, moved);
          persistOrder();
        });

        var remove = el('button', { type: 'button', text: '×' });
        remove.style.cssText = 'position:absolute;top:4px;right:4px;width:24px;height:24px;border-radius:50%;' +
          'border:0;background:rgba(255,255,255,.92);color:#b3401f;font-weight:700;cursor:pointer';
        remove.onclick = function () {
          if (!confirm('確定刪除這張照片？')) return;
          runAuth('deletePhoto', section, url).then(function (result) {
            updatePhotoState(section, result.urls);
            urls = result.urls;
            paint();
          }).catch(function (error) { setMsg(status, 'err', '刪除失敗：' + error); });
        };
        tile.appendChild(remove);
        grid.appendChild(tile);
      });
    }

    var picker = el('input', { type: 'file', accept: 'image/*' });
    picker.multiple = true;
    picker.onchange = function () {
      var files = Array.prototype.slice.call(picker.files);
      picker.value = '';
      if (!files.length) return;

      setMsg(status, 'ok', '上傳中… (0/' + files.length + ')');
      var done = 0;

      files.reduce(function (chain, file) {
        return chain.then(function () {
          return downscaleImage(file, MAX_IMAGE_EDGE).then(function (image) {
            return runAuth('uploadPhoto', section, file.name, image.base64, image.mimeType);
          }).then(function (result) {
            updatePhotoState(section, result.urls);
            urls = result.urls;
            done++;
            setMsg(status, 'ok', '上傳中… (' + done + '/' + files.length + ')');
            paint();
          });
        });
      }, Promise.resolve()).then(function () {
        setMsg(status, 'ok', '已上傳 ' + done + ' 張照片。');
      }).catch(function (error) {
        setMsg(status, 'err', '上傳失敗：' + error);
      });
    };

    wrap.appendChild(el('label', { text: '照片（可多張；拖曳縮圖可調整順序）' }));
    wrap.appendChild(grid);
    wrap.appendChild(picker);
    wrap.appendChild(status);
    paint();
    return wrap;
  }
```

- [ ] **Step 4: 執行測試，確認它通過**

Run: `npm test`
Expected: PASS — 145 tests passing

- [ ] **Step 5: Commit**

```bash
git add apps-script/Admin.html tests/admin.test.js
git commit -m "Manage photos from the admin panel

Photos are shrunk to a 1600px long edge in the browser before upload, which
is the width the CDN link asks for anyway; a phone photo would otherwise
inflate past what google.script.run will carry.

Each photo call writes the returned URL list straight back into the in-memory
content, so pressing Save afterwards cannot resurrect a deleted photo."
```

---

## Task 20: 後台 — 換宿章程與工作內容清單編輯器

**Files:**
- Modify: `apps-script/Admin.html`
- Modify: `tests/admin.test.js`

**Interfaces:**
- Consumes: Task 9 的 `saveList(token, listName, items)`；Task 18 的 `el` / `CONTENT` / `renderSections`
- Produces（`Admin.html` 內的全域）:
  - `LIST_META: Array<{name: 'rules'|'duties_out'|'duties_in', title: string}>`
  - `collectListItems(listName): Array<{zh, en}>`
  - `renderListEditors(host): void`

---

- [ ] **Step 1: 寫失敗的測試**

Append to `tests/admin.test.js`:

```js
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
```

- [ ] **Step 2: 執行測試，確認它失敗**

Run: `npm test`
Expected: FAIL — `no editor for list rules`

- [ ] **Step 3: 寫實作**

Replace the placeholder `renderListEditors` in `Admin.html` with:

```js
  var LIST_META = [
    { name: 'rules', title: '換宿章則' },
    { name: 'duties_out', title: '戶外工作內容' },
    { name: 'duties_in', title: '室內工作內容' }
  ];

  function collectListItems(listName) {
    return (CONTENT[listName] || []).map(function (_, index) {
      return {
        zh: document.getElementById('li' + listName + '_' + index + '_zh').value,
        en: document.getElementById('li' + listName + '_' + index + '_en').value
      };
    }).filter(function (item) { return item.zh.trim() || item.en.trim(); });
  }

  function saveOneList(listName, status) {
    return runAuth('saveList', listName, collectListItems(listName)).then(function (result) {
      CONTENT[listName] = result.items;
      setMsg(status, 'ok', '已儲存。');
      renderSections();
    }).catch(function (error) {
      setMsg(status, 'err', '儲存失敗：' + error);
    });
  }

  function renderListEditors(host) {
    LIST_META.forEach(function (meta) {
      var listName = meta.name;
      var card = el('div', { class: 'card' });
      card.appendChild(el('h2', { text: meta.title }));
      card.appendChild(el('div', { class: 'sub', text: '編號會自動產生，不需要自己填。拖曳不支援，請用上下箭頭調整順序。' }));

      var status = el('div', { class: 'msg' });
      var items = CONTENT[listName] || [];

      items.forEach(function (item, index) {
        var block = el('div', {});
        block.style.cssText = 'border-top:1px dashed #ece3d3;padding-top:12px;margin-top:12px';

        var header = el('div', {});
        header.style.cssText = 'display:flex;align-items:center;gap:8px;justify-content:space-between';
        header.appendChild(el('strong', { text: (listName === 'rules' ? '第 ' + (index + 1) + ' 條' : '第 ' + (index + 1) + ' 項') }));

        var controls = el('div', {});
        [['↑', -1], ['↓', 1]].forEach(function (pair) {
          var move = el('button', { class: 'btn btn-ghost', type: 'button', text: pair[0] });
          move.style.cssText = 'padding:4px 10px;margin-left:6px';
          move.disabled = (pair[1] < 0 && index === 0) || (pair[1] > 0 && index === items.length - 1);
          move.onclick = function () {
            var current = collectListItems(listName);
            var moved = current.splice(index, 1)[0];
            current.splice(index + pair[1], 0, moved);
            CONTENT[listName] = current;
            renderSections();
          };
          controls.appendChild(move);
        });

        var remove = el('button', { class: 'btn btn-danger', type: 'button', text: '刪除這一項' });
        remove.style.cssText = 'padding:4px 10px;margin-left:6px';
        remove.onclick = function () {
          CONTENT[listName] = collectListItems(listName).filter(function (_, i) { return i !== index; });
          renderSections();
        };
        controls.appendChild(remove);
        header.appendChild(controls);
        block.appendChild(header);

        var row = el('div', { class: 'row' });

        var zh = el('div', {});
        zh.appendChild(el('label', { text: '中文' }));
        zh.appendChild(inputFor(item.zh, true, 'li' + listName + '_' + index + '_zh'));

        var en = el('div', {});
        en.appendChild(el('label', { text: 'English（可留空）' }));
        en.appendChild(inputFor(item.en, true, 'li' + listName + '_' + index + '_en'));

        row.appendChild(zh);
        row.appendChild(en);
        block.appendChild(row);
        card.appendChild(block);
      });

      var add = el('button', { class: 'btn btn-ghost', type: 'button', text: '＋ 新增一項' });
      add.style.marginTop = '16px';
      add.onclick = function () {
        CONTENT[listName] = collectListItems(listName).concat([{ zh: '', en: '' }]);
        renderSections();
      };

      var save = el('button', { class: 'btn btn-primary', type: 'button', text: '儲存這份清單' });
      save.style.cssText = 'margin-top:16px;margin-left:10px';
      save.onclick = function () { saveOneList(listName, status); };

      card.appendChild(add);
      card.appendChild(save);
      card.appendChild(status);
      host.appendChild(card);
    });
  }
```

> 上下箭頭而非拖曳：清單項目是多行文字框，拖曳與文字選取會互相干擾。照片縮圖沒有這個問題，所以維持拖曳。Spec §8.2 要求「可排序」，此處以箭頭達成。

- [ ] **Step 4: 執行測試，確認它通過**

Run: `npm test`
Expected: PASS — 149 tests passing

- [ ] **Step 5: Commit**

```bash
git add apps-script/Admin.html tests/admin.test.js
git commit -m "Let the owner edit the work-exchange rules and duty lists

The rules were written in 2012 and the owner expects to rework them, so they
move out of the markup and into the sheet. Numbering is generated on the
public page, so the editor never asks anyone to renumber by hand.

List items reorder with arrow buttons rather than dragging: the items are
multi-line text areas, and dragging fights text selection."
```

---

## Task 21: 實機部署後端，並定案兩個待驗證的技術決策

到此為止所有程式碼都在假物件上通過測試。這個 Task 第一次接觸真實的 Google 服務，並回答 Spec §16「待實作時定案」的兩個問題。**兩者皆須實測，不得憑推測跳過。**

**Files:**
- Modify: `site/app.js`（僅在實測結果要求時，改 `SUBMIT_MODE`）
- Modify: `apps-script/Code.js`（僅在實測結果要求時，改 `photoUrlFor_`）
- Create: `docs/superpowers/plans/2026-07-09-live-verification.md`（記錄實測結果）

**Interfaces:**
- Consumes: Task 1–20 的全部產出
- Produces: 一個可用的 `WEBAPP_URL`；`SUBMIT_MODE` 與供圖策略的定案

---

- [ ] **Step 1: 建立 Google 資產**

1. 到 [sheets.google.com](https://sheets.google.com) 新建試算表，命名 `彩虹星民宿網站內容`。
2. 建立三個分頁，名稱**完全一致**（小寫）：`settings`、`rooms`、`workexchange_lists`。
   （`住宿申請`、`換宿申請` 由 `doPost` 首次執行時自動建立，不需預先開。）
3. 逐一匯入種子資料：分頁上 **檔案 → 匯入 → 上傳 → 選 CSV → 「取代目前工作表」**，分別匯入 `sheet-template/settings.csv`、`rooms.csv`、`workexchange_lists.csv`。
4. 到 [drive.google.com](https://drive.google.com) 新建資料夾 `Rainbowstar Photos`，從網址列複製資料夾 ID（`.../folders/<這一段>`）。

- [ ] **Step 2: 貼上後端並設定**

1. 在試算表選 **擴充功能 → Apps Script**（這會建立**容器繫結**的專案，`SpreadsheetApp.getActiveSpreadsheet()` 才有作用）。
2. 刪掉預設程式碼。新增三個檔案並貼上內容：
   - 檔案 `lib.gs` ← `apps-script/lib.js` 全部內容
   - 檔案 `Code.gs` ← `apps-script/Code.js` 全部內容
   - 檔案 `Admin.html`（**HTML 類型**）← `apps-script/Admin.html` 全部內容
3. **專案設定 → 指令碼屬性**，新增兩筆：
   - `ADMIN_PASSCODE` = 自訂一組密碼（**不要**寫進 repo）
   - `PHOTO_ROOT_FOLDER_ID` = Step 1 拿到的資料夾 ID
4. 在試算表 `settings` 分頁，把 `contact_email` 與 `notify_email` 改成你測試用的 Gmail。

- [ ] **Step 3: 部署 Web App**

**部署 → 新增部署作業 → 類型選「網頁應用程式」**
- 執行身分 (Execute as)：**我**
- 誰可以存取 (Who has access)：**任何人 (Anyone)** ← 網站才讀得到

按部署，完成授權流程（授權存取 → 選帳號 → 進階 → 前往（不安全）→ 允許）。複製 `/exec` 結尾的網址。

> 之後每次修改 `.gs` 或 `Admin.html`，都要 **部署 → 管理部署作業 → 編輯（鉛筆）→ 版本選「新版本」→ 部署** 才會生效。**只改試算表內容不需重新部署。**

- [ ] **Step 4: 驗證 doGet 回傳內容 JSON**

Run: `curl -sS "<WEBAPP_URL>" | head -c 400`

Expected: 一段 JSON，`"ok":true`，且含 `settings`、`rooms`、`rules`、`duties_out`、`duties_in` 五個鍵。

再確認清單筆數：

Run: `curl -sS "<WEBAPP_URL>" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.rules.length, j.duties_out.length, j.duties_in.length)})"`

Expected: `16 5 2`

- [ ] **Step 5: 【決策一】實測跨源 POST 的回應是否可讀**

這決定 `SUBMIT_MODE`。在**任意非 Google 網域**的分頁開啟主控台執行（例如先 `browser_navigate` 到 `https://example.com`，再用 `browser_evaluate`）：

```js
fetch('<WEBAPP_URL>', {
  method: 'POST',
  body: new URLSearchParams({ type: 'accommodation', name_zh: 'CORS 測試', email: 'test@example.com' })
})
  .then(r => r.json())
  .then(j => console.log('READABLE', j))
  .catch(e => console.log('BLOCKED', String(e)));
```

- **若印出 `READABLE {ok: true, ...}`** → 保持 `SUBMIT_MODE = 'readable'`（Task 16 的預設），不需改動。
- **若印出 `BLOCKED ...`（CORS 錯誤）** → 在 `site/app.js` 把 `SUBMIT_MODE` 改為 `'opaque'`，並在 `apps-script/Code.js` 的 `handlePost_` 之外，額外把例外寫入一個 `errors` 分頁（因為訪客再也讀不到錯誤）：

```js
function logError_(ss, context, error) {
  var sheet = ss.getSheetByName('errors') || ss.insertSheet('errors');
  if (sheet.getLastRow() === 0) sheet.appendRow(['時間', '情境', '錯誤']);
  sheet.appendRow([new Date(), context, String(error)]);
}
```

並在 `handlePost_` 的 `catch` 內呼叫 `logError_(ss, 'doPost', error)`。

無論走哪條路，都到試算表確認 `住宿申請` 分頁多了一列「CORS 測試」，然後**刪掉該列**。

- [ ] **Step 6: 【決策二】實測 Drive CDN 直連圖是否可用**

1. 開啟 `<WEBAPP_URL>?page=admin`，輸入密碼登入。
2. 在「首頁」區塊上傳一張測試照片。
3. 到試算表 `settings` 分頁複製 `hero_photos` 的值（應為 `https://lh3.googleusercontent.com/d/...=w1600`）。
4. 直接在瀏覽器開啟該網址。

- **若圖片正常顯示** → 保持 `photoUrlFor_` 現狀，不需改動。
- **若被擋（403 / 重新導向到登入頁）** → 改 `apps-script/Code.js` 的 `photoUrlFor_`，改用受範圍限制的代理端點：

```js
function photoUrlFor_(fileId) {
  return ScriptApp.getService().getUrl() + '?img=' + fileId;
}
```

並確認 `fileIdFromUrl_` 仍能反解（它已支援 `?img=` 形式）。重新部署後，重新上傳一張測試照片，確認公開站顯示得出來。

> ⚠️ 改用代理後，`?img=` 端點就成為熱路徑。務必再次確認 `isInsidePhotoRoot_` 有生效：拿一個**不在** `Rainbowstar Photos` 底下的 Drive 檔案 ID 去打 `<WEBAPP_URL>?img=<那個ID>`，Expected: 回傳 `Not found`，**不是**檔案內容。

- [ ] **Step 7: 記錄實測結果**

Create `docs/superpowers/plans/2026-07-09-live-verification.md`，寫下：Web App 網址（可公開）、決策一的結果與 `SUBMIT_MODE` 最終值、決策二的結果與 `photoUrlFor_` 最終形式、`?img=` 越權測試的實際輸出。**不要**寫入密碼或資料夾 ID。

- [ ] **Step 8: Commit**

```bash
npm test
git add -A
git commit -m "Settle the two decisions the design left to a live check

Records whether an Apps Script web app returns a readable cross-origin
response to a urlencoded POST, which decides whether the visitor can be told
the truth about a failed submission, and whether Drive's CDN links serve our
photos directly or the scoped proxy has to carry them."
```

---

## Task 22: 端到端驗證

在公開站上線前，用真實後端把每一條驗收標準走一遍。此時 `site/index.html` 仍是本機檔案，但已可連上真實 Apps Script。

**Files:**
- Modify: `site/index.html`（填入 `WEBAPP_URL`）

**Interfaces:**
- Consumes: Task 21 的 `WEBAPP_URL`
- Produces: 一份通過的驗收結果

---

- [ ] **Step 1: 接線**

把 Task 21 的 `/exec` 網址填進 `site/index.html`：

```html
<script>window.RAINBOWSTAR_CONFIG={WEBAPP_URL:"https://script.google.com/macros/s/AKfyc.../exec"};</script>
```

> `WEBAPP_URL` 是公開端點，可以入版控。密碼與資料夾 ID 不行。

- [ ] **Step 2: 驗證內容確實從試算表載入**

因為現在會發出跨源請求，`file://` 會被 CORS 擋。用 Node 內建模組起一個臨時靜態伺服器（不新增任何相依）：

```bash
node -e "const h=require('http'),f=require('fs'),p=require('path');h.createServer((q,s)=>{const t=p.join('site',q.url==='/'?'index.html':q.url);f.readFile(t,(e,d)=>e?(s.writeHead(404),s.end()):(s.writeHead(200,{'Content-Type':t.endsWith('.js')?'text/javascript':'text/html'}),s.end(d)))}).listen(8080,()=>console.log('http://localhost:8080'))"
```

1. `browser_navigate` 至 `http://localhost:8080`
2. `browser_console_messages` — Expected: 無 error。
3. 在試算表把 `settings` 的 `tagline` 改成 `測試標語 12345`，重新整理頁面 — Expected: 首頁標語變成 `測試標語 12345`。改回原值。

- [ ] **Step 3: 驗證雙語不再被中文覆蓋（缺陷 3）**

1. 在試算表把 `tagline_en` **整列刪掉**。
2. 重新整理頁面，`browser_click` `EN` 按鈕，`browser_snapshot`。
   Expected: 首頁標語顯示 **`index.html` 內建的英文**（`Settle into a real South Island farm — …`），**不是**中文。
3. 把 `tagline_en` 加回試算表，重新整理並切到 EN — Expected: 顯示試算表的英文值。

- [ ] **Step 4: 驗證後台**

1. `browser_navigate` 至 `<WEBAPP_URL>?page=admin`
2. 輸入**錯誤**密碼 — Expected: 顯示「密碼錯誤」，不進入後台。
3. **驗證授權閘（Global Constraint 4）**：在登入頁的主控台執行
   `browser_evaluate`: `google.script.run.withFailureHandler(e=>console.log('DENIED',String(e))).withSuccessHandler(r=>console.log('LEAKED',r)).loadAdminContent('forged-token')`
   Expected: 印出 `DENIED ... 未授權`。**若印出 `LEAKED`，立即停止並修正 `assertAuthorized_`。**
4. 輸入正確密碼登入 — Expected: 顯示所有區塊與現有內容。
5. 改「關於我們」的介紹段落 → 按「儲存」→ 重新整理公開站 — Expected: 網站文字更新。
6. 在「首頁」上傳兩張照片，拖曳調整順序，刪掉一張 → 重新整理公開站 — Expected: 首頁大圖顯示剩下的那張；點擊可開燈箱。
7. 在「換宿章則」新增一條、用 `↑` 移到第一位、按「儲存這份清單」→ 重新整理公開站 — Expected: 該條出現在章則第 1 條，且編號重新排為 1–17。刪除它並重新儲存。

- [ ] **Step 5: 驗證表單真的送得到（缺陷 1）**

1. 回到 `http://localhost:8080`，`browser_click` 送出鈕（空表單） — Expected: 紅色錯誤框，**無**成功訊息。
2. `browser_fill_form` 填妥住宿表單所有必填欄位（含勾選一個房型、兩個加購項目），送出。
   Expected: 綠色成功訊息。
3. 到試算表 `住宿申請` 分頁 — Expected: 新增一列；`時間` 欄有時間戳；`需要加購的項目` 欄是兩個項目以 ` / ` 串接；`資料檢查` 欄為空。
4. 檢查 `notify_email` 信箱 — Expected: 收到主旨 `【彩虹星民宿】新住宿申請 Accommodation - <姓名>` 的信；按「回覆」時收件人是申請人的 email。
5. 切到換宿表單，填妥送出 — Expected: `換宿申請` 分頁新增一列 + 收到信。
6. **驗證亂填標記**：再送一筆，電話填 `12` — Expected: 該列 `資料檢查` 欄出現 `⚠️ 電話可疑`，且通知信主旨含該標記。

- [ ] **Step 6: 驗證標題列漂移已修（缺陷 2）**

1. 手動把 `住宿申請` 分頁的標題列第 2、3 格對調（`英文姓名` ↔ `中文姓名`）。
2. 再送出一筆表單。
3. Expected: 標題列被自動修正回正確順序；新列的值與標題對齊。

驗證後刪掉所有測試列。

- [ ] **Step 7: 記錄結果並 commit**

把 Step 3–6 的實際輸出補進 `docs/superpowers/plans/2026-07-09-live-verification.md`。

```bash
npm test
git add site/index.html docs/superpowers/plans/2026-07-09-live-verification.md
git commit -m "Wire the site to the live back end and verify it end to end

Confirms the three defects the audit found are actually fixed against real
Google services: a missing _en row no longer overwrites English, a reordered
header row is repaired before the next row lands, and an empty form now shows
an error instead of a green tick.

Also confirms the admin functions reject a forged token, which is the check
that matters most: the web app answers to anyone."
```

---

## Task 23: 上架公開站與交接文件

**Files:**
- Create: `HANDOFF.md`
- Delete: `claude_design/uploads/rainbowstar-site/SETUP.md`（由 `HANDOFF.md` 取代）

**Interfaces:**
- Consumes: Task 22 通過的網站
- Produces: 公開網址；業者可獨立操作的說明

---

- [ ] **Step 1: 部署到 Cloudflare Pages**

1. 註冊／登入 [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create → Pages → Upload assets**。
2. 專案名稱填 `rainbowstar`。
3. 把 **`site/` 資料夾**整個拖進上傳區（裡面應只有 `index.html` 與 `app.js`）。
4. 部署完成後取得 `https://rainbowstar.pages.dev`。

- [ ] **Step 2: 驗證線上版**

1. `browser_navigate` 至 `https://rainbowstar.pages.dev`
2. `browser_network_requests` — Expected: 只有本站的 `index.html` / `app.js`、Google Fonts、以及一次對 `script.google.com` 的 GET。**不得**出現 `unpkg.com`、`react`、`babel`、`support.js`。
3. 送出一筆真實測試表單 — Expected: 落表 + 收到信。送完刪掉該列。
4. `browser_resize` 至 390×844，`browser_snapshot` — Expected: 行動版排版正常，漢堡選單可開合。

- [ ] **Step 3: 寫 `HANDOFF.md`**

內容需涵蓋（面向兩種讀者，各自分節）：

**給業者（非技術）**
- 後台網址、如何登入、忘記密碼找誰
- 怎麼改文字：進後台 → 找到欄位 → 改 → 按「儲存」→ 提醒公開站會在訪客下次開啟時更新
- 怎麼換照片：進後台 → 找到區塊 → 選檔上傳／拖曳排序／按 × 刪除（照片會自動縮小，不用先處理）
- 怎麼改換宿章則：三份清單各自有「儲存這份清單」按鈕
- 英文欄位留空是**刻意允許**的：留空時網站會顯示內建英文
- 收到申請：信箱會收到通知信，可直接按「回覆」回信給申請人；所有申請也存在試算表的 `住宿申請` / `換宿申請` 分頁
- 主旨或 `資料檢查` 欄出現 `⚠️` 代表資料可能是亂填的，請留意

**給開發者**
- 四個元件與資料流（引用 spec §4 的架構圖）
- 改了 `.gs` 或 `Admin.html` 之後**必須重新部署**；只改試算表內容不用
- Script Properties：`ADMIN_PASSCODE`、`PHOTO_ROOT_FOLDER_ID`（**不在 repo 裡**）
- `npm test` 跑全部單元測試
- **帳號交接清單**（逐字引用 spec §12 的七個步驟）
- Task 21 兩個決策的實際結果（引用 `2026-07-09-live-verification.md`）

**一處已修補的舊值（供日後查考）**
- 休假制度為「做五休二」。業者早年由「做六休一」改過來，但當時只改到設計稿的 `RULES` 陣列，換宿數據卡與更早的靜態站仍留著舊值。兩處皆已在 Task 12 統一。
- 教訓：休假制度現在只存在於試算表的 `workexchange_lists`（章則第 2 條），但**數據卡的文字仍寫死在 `index.html`**。若業者日後再改休假制度，後台改得動章則、改不動數據卡。若這成為困擾，可把數據卡三張卡也納入 `settings` 鍵（`stat_1`…），屬未來加值。

- [ ] **Step 4: 移除已被取代的舊說明**

```bash
git rm claude_design/uploads/rainbowstar-site/SETUP.md
```

> `claude_design/uploads/rainbowstar-site/index.html`、`apps-script/Code.gs`、`sheet-template/*.csv` **保留**在 repo：它們是這次設計的歷史依據（見 spec §3），且 `Code.gs` 是現行後端的來源。只刪除會誤導人照做的 `SETUP.md`。

- [ ] **Step 5: 最終驗收**

逐條核對 spec §17 的 14 項驗收標準，全部打勾。任何一項未過就回到對應的 Task。

- [ ] **Step 6: Commit**

```bash
npm test
git add HANDOFF.md
git commit -m "Publish the site and hand it over

HANDOFF.md speaks to two readers: the owner, who needs to know which button
saves which thing, and the next developer, who needs to know that editing a
.gs file means redeploying while editing the sheet does not.

It also carries forward the one content question the design file could not
settle on its own: whether the work exchange runs five days on and two off,
as the rules say, or six on and one off, as the stat card said."
```

---

## 執行順序與相依關係

```
Task 1 (骨架)
  └─ Task 2–5   (lib.js 純邏輯：語言、欄位、信件、清單)
       └─ Task 6–10 (Code.js：讀取、doPost、授權與供圖、後台函式、照片)
            └─ Task 11 (種子 CSV；Task 14 的測試會回頭比對它)
                 └─ Task 12–16 (前端：壓平、內容、i18n 與清單、房型與燈箱、表單)
                      └─ Task 17–20 (Admin.html：登入、文字與房型、照片、清單)
                           └─ Task 21 (實機部署 + 兩個決策定案)
                                └─ Task 22 (端到端驗證)
                                     └─ Task 23 (上架 + 交接)
```

Task 1–20 全部可離線完成、只靠 `npm test` 驗證。Task 21 是第一個需要 Google 帳號的節點；Task 21 的兩個決策可能回頭修改 `site/app.js`（`SUBMIT_MODE`）與 `apps-script/Code.js`（`photoUrlFor_`），這是設計中預期的迴路，不是返工。

