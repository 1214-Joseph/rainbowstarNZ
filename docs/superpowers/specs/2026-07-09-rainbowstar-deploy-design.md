# 彩虹星民宿 Rainbowstar — 上線部署與內容管理設計 (Design Spec)

- 日期：2026-07-09
- 狀態：草案 v2（已依既有資產稽核結果修訂，待使用者最終確認）
- 專案根目錄：`c:\Users\wuuu1\Desktop\rainbowstar`

---

## 1. 背景與目標

民宿業者的形象網站前端已大致完成（雙語 zh/繁中・en，含住宿預定與打工換宿兩份表單）。目前是設計工具產出的「預覽版」，`WEBAPP_URL` 為空、後端未接。要達成三件事：

1. **上線**：讓一般人能連進來、真的填寫並送出表單。
2. **業者可自行改內容**：非技術業者不碰程式碼，就能改文字、照片、換宿章程。
3. **表單真的收得到**：送出後業者收到 email，且資料像 Google 表單一樣一列一列存進試算表。

### 成功定義
- 公開網址可被任何人開啟，外觀/功能與**設計稿**一致（含照片輪播、燈箱、周邊景點區）。
- 業者在一個密碼保護的後台頁，能改所有主要文字（中英）、上傳/刪除/排序照片、增刪換宿章程與工作項目，存檔後公開站自動更新。
- 訪客送出任一表單後：業者信箱收到通知信；該筆資料出現在試算表對應分頁（含時間戳）；訪客看到**真實**的成功或失敗訊息（不再假成功）。
- 全程零費用（不含選配自訂網域）。

### 非目標（本期不做，見 §14）
- 訪客端付款/金流。
- 房型即時空房日曆。
- 訪客自動確認信（列為未來加值）。

---

## 2. 利害關係人

| 角色 | 說明 | 需求 |
|------|------|------|
| 開發者（使用者） | 建置與部署者，使用 Claude Code | 免費、可維護、交接後不必當長期中間人 |
| 民宿業者 | 網站主人，非技術 | 改字/換照片要簡單；收得到申請；資料集中好查 |
| 訪客 | 潛在住客／換宿者 | 網站開得快、表單好填、送得出去 |

帳號策略：**先用開發者自己的 Google 帳號建置與測試，通過後再遷移到業者帳號**（見 §11）。前端可變設定收斂為單一 `WEBAPP_URL`，降低遷移成本。

---

## 3. 既有資產盤點（已稽核，決定去留）

| 資產 | 路徑 | 判定 |
|------|------|------|
| **設計稿**（868 行） | `claude_design/彩虹星民宿 Rainbowstar.dc.html` | **採用為公開站來源**。功能最完整；但依賴 `support.js` (dc-runtime) 由 unpkg 載入 React/ReactDOM/Babel 於瀏覽器即時編譯 → 需壓平。**同時是本專案的內容真實來源**（章程、工作項目、房型選項）。 |
| dc-runtime | `claude_design/support.js` | **丟棄**（壓平後不需要） |
| 舊版靜態站（695 行） | `claude_design/uploads/rainbowstar-site/index.html` | **不上線，僅供參考**。雖自足無外部依賴，但相對設計稿有重大功能退化（見下）。其「真 CSS `:hover`/`:focus`」寫法可借鏡。 |
| **後端腳本**（172 行） | `.../rainbowstar-site/apps-script/Code.gs` | **採用並擴充**（不重寫） |
| Sheet 範本 CSV | `.../rainbowstar-site/sheet-template/*.csv` | **重建**（欄位不足，見 §4.1） |
| 部署說明 | `.../rainbowstar-site/SETUP.md` | 參考，最後改寫成新的交接文件 |

### 3.1 舊版 index.html 相對設計稿的功能退化（故不採用）
整個「周邊 / Around」區塊（含導覽項）缺席；燈箱 lightbox 完全不存在；房型照片輪播（箭頭/圓點/滑動）不存在且房型卡無圖；首頁大圖卡片降級為單張 CSS 背景；單一房型「精選大卡」版型缺席；Google Fonts 字體識別（Newsreader / Hanken Grotesk / Noto Serif TC / Caveat）缺席；換宿三張數據卡與 CTA 橫幅缺席；靜態預設房型卡缺 `data-en`（英文模式仍顯示中文）。

### 3.2 既有 Code.gs 已實作、可直接沿用
`doGet` 回傳 settings + rooms JSON；`readSettings_()` 讀 key/value（天然支援 `_en` 列）；`readRooms_()` 以標題列驅動（已支援任意欄位，含 `photos`）；`doPost` 依 `type` 分派、寫入時間戳、分頁不存在時自動建立；`val()` 以 `e.parameters` 正確處理 `addons` 複選；`sendNotifyEmail_()` 條列所有已填欄位並將 `replyTo` 設為申請人 email；`checkSuspicious_()` 亂填資料偵測（額外加值）；`jsonOutput_()` 統一 JSON 輸出。

**已驗證**：`ACCOM_FIELDS` / `WORK_FIELDS` 白名單與實際表單的每一個 `name=` 逐欄比對，**無任何欄位遺漏**。此白名單即 §13 所需的「防止任意寫入」防線。

### 3.3 既有 Code.gs / 前端必須修正的缺陷

1. **表單「假成功」（最嚴重）**
   前端以 `mode:'no-cors'` 送出，回應為 opaque、讀不到狀態，但 `.then()` **無條件**顯示「✓ 已送出」。同時後端在缺必要欄位（`Code.gs:68-70`）或拋出例外（`90-92`）時會回傳錯誤 JSON。訪客永遠讀不到 → **被拒絕或出錯的申請仍顯示成功，真實詢問就此遺失**。
   **修正**：因表單以 `application/x-www-form-urlencoded` 送出（簡單請求、不觸發預檢），改為可讀回應（移除 `no-cors`），依後端 `ok` 欄位顯示真實結果。**實作第一步先以最小測試驗證跨源可讀**；若證實不可讀，退回 `no-cors` 並改為「後端永不拒絕、一律落表」策略 + 錯誤另存 `errors` 分頁。

2. **標題列漂移**
   回應分頁的標題列僅在分頁為空時寫入一次（`Code.gs:80-82`），之後永不校正。日後若 `ACCOM_FIELDS`/`WORK_FIELDS` 順序或成員變動，舊標題會配上新資料，**整張表悄悄錯位**。
   **修正**：每次寫入前比對標題列；不符則補寫/校正，或改用標題→欄索引映射寫入。

3. **雙語被中文覆蓋**
   `applyContent()` 的 `valFor(key)` 在英文模式下若 `settings` 缺 `<key>_en`，會退回中文 `s[key]` 並覆寫元素內容，**蓋掉 HTML 內原本正確的 `data-en` 英文字**。
   **修正**：英文模式且無 `_en` 值時**跳過該元素**，保留 `data-en` 原文。

4. **`renderList` 一次性守衛**
   設計稿的 `renderList` 以 `dataset.done==='1'` 早退（`dc.html:534,554`），內容改為資料驅動後無法重繪。
   **修正**：移除守衛，改為 `innerHTML=''` 後重建（比照 `renderRooms`）。

5. **必填檢查過於粗糙**
   `Code.gs:68` 僅要求 `name_en`/`name_zh`/`email` 三者其一。與缺陷 1 疊加會靜默丟棄合法邊界案例。
   **修正**：放寬為「永不因此拒絕」，改以 `checkSuspicious_()` 標記。

---

## 4. 系統架構

四個元件，全部掛在單一 Google 帳號下，全部免費：

```
        ┌─────────────────────────────────────────────┐
訪客 ──▶ │  公開網站  index.html  (Cloudflare Pages·免費) │
        │   · 載入時 GET → 抓內容(文字/房型/照片/章程)   │
        │   · 送表單 POST → 丟後端，顯示真實結果         │
        └──────────────┬──────────────────────────────┘
                       │
                       ▼
        ┌─────────────────────────────────────────────┐
        │   Apps Script Web App  ＝ 中央大腦 (免費)      │
        │   doGet:  供內容 JSON / 供後台頁 / 供圖(退回用) │
        │   doPost: 收表單 → 落表 + 寄信                 │
        │   google.script.run: 後台存內容 / 傳刪照片      │
        └───┬───────────────┬───────────────┬─────────┘
            ▼               ▼               ▼
     Google 試算表        Google Drive   Gmail (MailApp)
     settings / rooms     照片資料夾      寄通知信給業者
     workexchange_lists
     住宿申請 / 換宿申請

        ┌─────────────────────────────────────────────┐
業者 ──▶ │  後台頁 (Apps Script HtmlService·密碼登入)      │
        │   改文字(中英) + 傳照片 + 編章程                │
        │   google.script.run → 同源、無 CORS            │
        └─────────────────────────────────────────────┘
```

**Apps Script 專案採「容器繫結」（bound to the Sheet）**：沿用既有 `SpreadsheetApp.getActiveSpreadsheet()`，不需 `SHEET_ID`。好處是交接時「複製這份試算表」會連腳本一起複製（見 §11）。

---

## 5. 資料模型

### 5.1 Google 試算表分頁

**分頁 `settings`**（A 欄 key、B 欄 value；每個文字鍵可有 `<key>_en` 列，缺則英文模式保留 HTML 原生 `data-en`）

| key | 用途 |
|-----|------|
| `site_name` | 站名（header / hero / footer 共用） |
| `tagline` | 首頁大標下方標語 |
| `intro_text` | 關於我們段落 |
| `feature_1` / `feature_2` / `feature_3` | 三張特色卡文字 |
| `accommodation_intro` | 住宿區介紹 |
| `booking_note` | 預定注意事項 |
| `workexchange_intro` | 換宿區介紹 |
| `location_text` | 聯絡－地點 |
| `contact_email` | 聯絡 email（同時設定 `mailto:`） |
| `contact_line` | 電話 / LINE |
| `notify_email` | **收表單通知信的信箱**（後台可改，沿用既有 `Code.gs:128` 機制） |
| `hero_photos` | 首頁大圖（多張，換行或逗號分隔的圖片網址） |
| `scenery1_photos` / `scenery2_photos` / `scenery3_photos` | 周邊三個景點照片（各可多張） |

> 前端另相容 `hero_image`/`hero_image2..4`/`hero_images` 與 `scenery1..3` 舊鍵；本設計標準化採用 `hero_photos` 與 `sceneryN_photos`。

**分頁 `rooms`**（一列一房型；前端依列數自動排版：單筆→精選大卡，多筆→卡片格）

| 欄位 | 用途 |
|------|------|
| `name` / `name_en` | 房型名稱 |
| `description` / `description_en` | 房型描述（支援換行） |
| `price` | 價格數字（空/0 顯示「—」；無 `_en`） |
| `unit` / `unit_en` | 價格單位（例：/ 床） |
| `note` / `note_en` | 備註（虛線下方小字，可選） |
| `photos` | 該房型照片（多張，換行/逗號分隔的網址） |

> 既有 `rooms.csv` 用 `photo`/`photo2`/`photo3` 且缺全部 `_en` 欄 → 需重建範本。

**分頁 `workexchange_lists`**（換宿章程與工作內容；一列一項，後台可增刪排序）

| 欄位 | 用途 |
|------|------|
| `list` | `rules`（換宿章程）/ `duties_out`（戶外工作）/ `duties_in`（室內工作） |
| `order` | 排序（數字，小到大） |
| `text_zh` | 中文內容 |
| `text_en` | 英文內容 |

> `rules` 由前端自動編號（含既有琥珀色數字徽章樣式），`duties_*` 以圓點呈現；後台不需維護編號。
> **種子資料以設計稿為準**：自 `dc.html` 的 `RULES`(16 條)、`DUTIES_OUT`(5 項)、`DUTIES_IN`(2 項) 匯入。

**分頁 `住宿申請` / `換宿申請`**（表單回應；**沿用既有中文分頁名與中文標題列**，對業者更易讀）

- 標題列：`時間` + 各欄中文標籤（來自 `ACCOM_FIELDS`/`WORK_FIELDS` 的 `f[1]`）+ `資料檢查`
- 分頁不存在時由 `doPost` 自動建立
- 複選欄（如 `addons`）以既有的 ` / ` 分隔串接
- `資料檢查` 欄存 `checkSuspicious_()` 的標記

### 5.2 Google Drive

- 根資料夾 `Rainbowstar Photos`，子資料夾對應各照片區塊：`hero`、`room-<index>`、`scenery-1..3`。
- 後台上傳的照片存入對應子資料夾；後端產生可公開存取的網址並寫回試算表對應照片欄。
- 供圖策略見 §7.3。

---

## 6. 元件一：公開網站（壓平設計稿）

### 6.1 壓平做法（外觀與功能不變）
1. 將 `<x-dc>` 內的模板 markup 直接放進標準 `<body>`。
2. 將 `Component extends DCLogic` 的 `boot()` 內容改寫成載入時執行一次的 IIFE（該段本就是純 DOM 操作）。`props` 以小設定物件替代（`defaultLang`、`showNearby`）。
3. 以約 20 行 vanilla script 重現設計工具的偽屬性行為：`style-hover` → `mouseenter`/`mouseleave` 套用/還原；`style-focus` → `focus`/`blur`。
   **明確採 JS shim，不改寫為真 CSS class。** 理由：設計稿的樣式全為 inline，抽成 CSS class 是大範圍重構且易產生視覺差異；shim 可保證視覺零差異。（舊版 index.html 的真 CSS 寫法僅供日後選配優化參考。）
4. **移除** `support.js`、React、ReactDOM、Babel、所有 unpkg 依賴。**保留 Google Fonts**（設計識別所需）。
5. 沿用既有 vanilla 邏輯：`applyContent`/`loadContent`/`attachSubmit`/驗證/輪播/燈箱/i18n/導覽。
6. 套用 §3.3 的缺陷修正 3（`valFor` 英文 fallback）與 4（`renderList` 可重繪）。
7. `renderList` 改為資料驅動：章程與工作內容由後端 JSON 提供；原寫死陣列降級為 fallback 預設值（後端不可達時使用）。
8. `DEFAULT_ROOMS` 保留 `name_en`/`description_en`（避免舊版 index.html 的英文模式顯示中文之缺陷）。
9. 檔名 → **`index.html`**（原檔名含中文與 `.dc`，GitHub/Cloudflare 皆需 `index.html`）。

### 6.2 執行期行為
- 載入時 `fetch(WEBAPP_URL + '?_=' + Date.now())` 取 `{settings, rooms, rules, duties_out, duties_in}` JSON → `applyContent()` 填入 `[data-content]`、hero、景點、房型、章程、工作內容。
- 後端不可達時使用內建預設內容（`DEFAULT_ROOMS` / `DEFAULT_RULES` / `DEFAULT_DUTIES_OUT` / `DEFAULT_DUTIES_IN`），畫面不空白。
- 兩表單以 `POST` + `URLSearchParams` 送出，**讀取回應的 `ok` 欄位**顯示真實成功/失敗（見 §3.3 缺陷 1 與 §10）。
- 語言、驗證、輪播、燈箱維持設計稿行為。

### 6.3 設定點
```html
<script>window.RAINBOWSTAR_CONFIG={WEBAPP_URL:"<部署後填入>"};</script>
```
遷移帳號時只改此行 + 重新上傳。

---

## 7. 元件二：Apps Script 後端（擴充既有 Code.gs）

### 7.1 `doGet(e)`（新增參數分派；既有無參數路徑保留）
- 無參數（或 `?_=timestamp`）：回傳 `{ok, settings, rooms, rules, duties_out, duties_in, generatedAt}`。清單項目形如 `{zh, en}`，後端已依 `order` 排序。
- `?page=admin`：以 `HtmlService` 回傳後台 HTML（見 §8）。
- `?img=<fileId>`：串流 Drive 檔案 blob（供圖退回方案，見 §7.3）。

### 7.2 `doPost(e)`（沿用既有流程 + 修正）
1. 沿用 `type` 分派、`val()` 複選處理、自動建分頁、時間戳、`checkSuspicious_()`、`sendNotifyEmail_()`。
2. **修正標題列漂移**：寫入前校正標題列。
3. **修正必填檢查**：不因欄位缺漏而拒絕；一律落表，以 `資料檢查` 欄標記。
4. 回傳 `{ok:true|false, message}`；前端讀取之（若跨源可讀）。

### 7.3 照片供應策略
Google Drive 公開直連網址歷史上不穩。採**雙軌 + 可退回**：
- 首選：上傳後設檔案為「知道連結者可讀」，產生 `https://lh3.googleusercontent.com/d/<fileId>=w1600` 形式的 CDN 直連網址寫回試算表。
- 退回：改用 `doGet?img=<fileId>` 由 Apps Script 串流 blob（較慢但可靠）。
- **實作前先做最小驗證**：上傳一張測試圖，確認公開站能正常顯示，再定案。

### 7.4 後台可呼叫函式（經 `google.script.run`，非 HTTP，天然無 CORS）
- `verifyPasscode(passcode)`
- `loadAdminContent()`
- `saveContent(payload)` — 寫回 `settings` / `rooms`（含 `_en`、房型增刪與排序）
- `uploadPhoto(section, filename, base64)` — 解碼 → 存入對應 Drive 子資料夾 → 設分享 → 產生網址 → 寫入試算表照片欄
- `deletePhoto(section, url)` — 自試算表移除該網址（Drive 檔移入垃圾桶）
- `reorderPhotos(section, orderedUrls)`
- `saveList(listName, items)` — `workexchange_lists` 的增/刪/改/排序

### 7.5 設定
- **Script Properties**：`ADMIN_PASSCODE`、`PHOTO_ROOT_FOLDER_ID`
- **試算表 `settings` 分頁**：`notify_email`（沿用既有機制，且後台可改）
- 試算表以容器繫結取得，不需 `SHEET_ID`
- 密碼與資料夾 ID **不入版控**

---

## 8. 元件三：後台管理頁（Apps Script HtmlService）

### 8.1 存取與登入
- 網址：`<WEBAPP_URL>?page=admin`
- 輸入密碼 → `google.script.run.verifyPasscode()` 比對 `ADMIN_PASSCODE`；通過後以 `sessionStorage` 記住該分頁 session。

### 8.2 版面（分區）
- **基本資訊**：`site_name`、`contact_email`、`contact_line`、`location_text`、`notify_email`（中英）
- **首頁**：`tagline` + hero 照片管理
- **關於**：`intro_text`、`feature_1..3`（中英）
- **住宿**：`accommodation_intro`、`booking_note`（中英）＋ **房型清單**（可新增/刪除/排序；每筆 name / description / price / unit / note 中英 + 照片管理）
- **換宿**：`workexchange_intro`（中英）＋ **三組清單編輯器**：`rules`、`duties_out`、`duties_in`。每組可新增、刪除、拖曳排序；每項中英雙欄（英文可留空）。章程編號由前端自動產生。
- **周邊景點**：scenery 1–3 文字 + 各自照片管理

每個文字欄位皆為中文格 + 英文格（英文可留空）。

### 8.3 照片管理元件（各區塊共用）
- 縮圖牆顯示目前照片；支援選檔/拖曳上傳（可多張）、刪除、拖曳排序。
- 上傳：前端讀檔為 base64 → `google.script.run.uploadPhoto(...)` → 回傳新網址 → 刷新縮圖。

### 8.4 儲存
「儲存」→ `google.script.run.saveContent(payload)` 寫回試算表 → 顯示提示。公開站於訪客下次載入時取得新內容。

---

## 9. 元件四：Email 通知（沿用既有 `sendNotifyEmail_`）

- 收件人：`settings.notify_email`，退回 `Session.getEffectiveUser().getEmail()`。
- 主旨：`【彩虹星民宿】新<住宿申請/換宿申請> - <申請人姓名>`（可疑資料時附標記）。
- 內文條列所有已填欄位；`replyTo` 設為申請人 email，業者直接按「回覆」即可回信。
- 寄信失敗**不得**阻擋資料寫入（落表為保底）。
- 額度：Gmail 每日約 100 封，遠超民宿需求。

---

## 10. 跨網域（CORS）策略

三條資料路徑：
1. **讀內容**（公開站 → 後端）：`GET`，簡單請求；Web App 存取權「任何人」時可跨源讀取 JSON。
2. **送表單**（公開站 → 後端）：`POST` + `URLSearchParams`（`application/x-www-form-urlencoded`，簡單請求、不觸發預檢）。
   **目標**：移除 `mode:'no-cors'`，讀取回應 `ok` 以顯示真實結果，修掉「假成功」。
   **退回方案**：若實測證實跨源不可讀（302 轉址至 `script.googleusercontent.com` 導致），保留 `no-cors`，並改為「後端永不拒絕、一律落表」，另將例外寫入 `errors` 分頁供稽核。
3. **後台操作**（後台 → 後端）：後台頁由 Apps Script 同源 host，走 `google.script.run`，完全不經跨源 HTTP。

**風險緩解**：實作第一步即以最小測試驗證路徑 1 與路徑 2 在 Cloudflare 網域下的實際行為，再決定路徑 2 採目標或退回方案。

---

## 11. 部署步驟（一次性）

1. **建 Google 資產**：新增試算表 `彩虹星民宿網站內容`，建立 `settings` / `rooms` / `workexchange_lists` 分頁與表頭（回應分頁首次送出時自動建立）。建立 Drive 根資料夾。
2. **匯入種子內容**：以 `dc.html` 為真實來源，匯入 settings 文字（含 `_en`）、rooms、以及 16 條章程 / 5 項戶外 / 2 項室內工作。
3. **貼上並擴充後端**：於試算表 **擴充功能 → Apps Script**（容器繫結）貼上擴充後的 `Code.gs` 與後台 `admin.html`。
4. **設定 Script Properties**：`ADMIN_PASSCODE`、`PHOTO_ROOT_FOLDER_ID`。設定 `settings.notify_email`。
5. **部署 Web App**：執行身分＝我；存取權＝任何人 → 取得 `WEBAPP_URL`。
6. **最小驗證**：跨源 GET JSON 可讀？跨源 POST 回應可讀？上傳一張測試照片，公開站能否顯示？→ 據此定案 §7.3 與 §10 路徑 2。
7. **壓平前端**：依 §6 產出乾淨 `index.html`（移除 support.js/React/Babel，保留 Google Fonts），填入 `WEBAPP_URL`。
8. **上架公開站**：Cloudflare Pages 直接上傳 → 取得公開網址（選配綁自訂網域）。GitHub Pages 為等價備案。
9. **驗收**：跑 §16 全部驗收項。

---

## 12. 帳號交接清單（開發者帳號 → 業者帳號）

1. 將試算表「**建立副本**」到業者 Drive（容器繫結腳本會**一併複製**）。
2. 在業者帳號重建 Drive 照片根資料夾，**重新設定 Script Properties**（`ADMIN_PASSCODE`、`PHOTO_ROOT_FOLDER_ID`）——Script Properties **不隨副本複製**。
3. 設定 `settings.notify_email` 為業者信箱。
4. 以業者帳號**重新部署 Web App** → 取得**新的 `WEBAPP_URL`**。
5. 將新 `WEBAPP_URL` 填入 `index.html` 的設定行（**單一改動點**）→ 重新上傳 Cloudflare。
6. 上傳正式照片（測試期照片為拋棄式；Drive 網址會隨帳號改變）。
7. 交付業者：後台網址 + 密碼；示範改一次字、換一次照片、看一次申請信與試算表。

---

## 13. 費用

| 項目 | 費用 |
|------|------|
| Cloudflare Pages（公開站 host） | 免費 |
| Apps Script（後端 + 後台 + 寄信） | 免費（每日 100 封信額度） |
| Google 試算表 + Drive | 免費（15GB 內） |
| 自訂網域（選配） | 約 NZD$20–40/年，非必要 |
| **合計（不綁網域）** | **NZD$0** |

---

## 14. 安全性考量

- **後台密碼**：密碼存 Script Properties，不入版控，且不在前端比對。
- **⚠️ 每個後台函式必須自行授權（關鍵）**：Web App 存取權為「任何人」，因此**任何人載入 `?page=admin` 後即可直接呼叫 `google.script.run.saveContent(...)` 等函式**。同源**不等於**已授權。
  作法：`verifyPasscode(passcode)` 驗證成功後產生一次性 session token（`Utilities.getUuid()`），存入 `CacheService`（6 小時）；其餘所有後台函式（`loadAdminContent` / `saveContent` / `saveList` / `uploadPhoto` / `deletePhoto` / `reorderPhotos`）**第一個參數皆為 token**，並在進入時呼叫 `assertAuthorized_(token)`，不符即拋出。
- **⚠️ `?img=<fileId>` 必須限制範圍（關鍵）**：若不驗證，此端點會成為「業者整個 Drive 的公開讀取代理」——任何人傳入任意 `fileId` 即可取得業者有權讀取的任何檔案。
  作法：供圖前確認該檔案的上層資料夾位於 `PHOTO_ROOT_FOLDER_ID` 之下，否則回傳 404。
- **⚠️ `settings` 分頁同時存放「公開文案」與「私密設定」**：`contact_email` 是刻意公開的，`notify_email` 不是。公開的 `doGet` 內容 JSON **必須過濾掉** `PRIVATE_SETTINGS_KEYS`（目前為 `notify_email`），否則任何人 `curl` 一次就取得業者的收信信箱。`loadAdminContent` 則需取得完整設定（後台要編輯它）。日後新增任何私密鍵，務必同時加入該清單。
- **公開 Web App**：存取權「任何人」是讀內容/收表單所需。既有 `ACCOM_FIELDS`/`WORK_FIELDS` 白名單即防止任意寫入其他分頁的防線，**須保留**。
- **表單濫用/spam**：沿用前端驗證 + 後端欄位白名單 + `checkSuspicious_()` 標記。未來可加 honeypot 或 Turnstile。
- **個資**：表單含護照號、緊急聯絡、出生日期等；試算表僅業者帳號可編輯。公開站不顯示任何回應資料。
- **無敏感值入版控**：`WEBAPP_URL` 可公開（本就是公開端點）；密碼、資料夾 ID、通知信箱不入版控。

---

## 15. 範圍外／未來加值

- 訪客自動確認信（訪客留 email 時回一封）。
- 反 spam：honeypot 欄位、送出速率限制、Cloudflare Turnstile（免費）。
- 自訂網域 + SEO / OG 圖強化。
- 房型空房日曆 / 金流（明確排除）。

---

## 16. 已確認決策

1. 先用開發者帳號測試、之後遷移至業者帳號。
2. 保留自訂表單，資料落 Sheet + 寄 email（不改用官方 Google Form）。
3. 文字、照片、換宿章程與工作內容**全部**在後台編輯，業者不需開試算表。
4. 公開站放 Cloudflare Pages（GitHub Pages 等價備案）。
5. **內容真實來源＝設計稿 `dc.html`**（休假「做五休二」、3 種房型、戶外工作 5 項、室內 2 項）。舊版 index.html 的較豐富內容**不採用**；業者日後可在後台自行增改。
6. 回應分頁沿用既有中文名 `住宿申請` / `換宿申請` 與中文標題列（含 `資料檢查` 欄）。
7. Apps Script 採容器繫結（不需 `SHEET_ID`）；`notify_email` 留在 `settings` 分頁以便後台編輯。
8. 版本控制：專案已 `git init`，後續推送至使用者提供的 GitHub repo。
9. 後端**擴充**既有 `Code.gs`，不重寫。

### 待實作時定案（非阻塞）
- 照片供應優先採 Google CDN 直連（`lh3.googleusercontent.com/d/<fileId>`），必要時退回 `doGet?img=` proxy。
- 表單 POST 是否移除 `no-cors`（改讀真實回應），以最小驗證定案；退回方案見 §10。

---

## 17. 驗收標準

- [ ] 公開網址可被任意瀏覽器開啟，版面/功能與**設計稿**一致：hero 大圖卡 + 燈箱、房型輪播（箭頭/圓點/滑動）、單筆房型精選大卡、周邊景點區與其燈箱、Google Fonts 字體、雙語切換、行動版導覽、兩表單。
- [ ] 公開站不再依賴 unpkg（無 React / Babel / support.js 外部請求）。
- [ ] 公開站載入時成功抓取後端內容並套用（改後台一項文字，重新整理後可見變化）。
- [ ] **英文模式下，`settings` 缺 `_en` 的欄位保留 HTML 原生英文，不被中文覆蓋。**
- [ ] 後台頁需密碼進入；錯誤密碼被拒。
- [ ] 後台改文字（中英）→ 儲存 → 公開站重新載入後更新。
- [ ] 後台上傳照片 → 公開站對應區塊顯示該照片；刪除後消失；可拖曳排序。
- [ ] 後台可新增/刪除/拖曳排序換宿章程與戶外/室內工作項目（中英）；公開站重新載入後反映，且章程自動重新編號。
- [ ] 住宿表單送出 → `住宿申請` 分頁新增一列（含時間戳、`addons` 複選正確串接、`資料檢查` 欄）＋ 業者收到通知信（`replyTo` 為申請人）＋ 訪客見結果訊息。
- [ ] 換宿表單送出 → `換宿申請` 分頁同上。
- [ ] **「假成功」已修**：後端拒絕或拋錯時，訪客不會看到成功訊息（或已改為後端永不拒絕、一律落表）。
- [ ] **標題列漂移已修**：變更欄位順序後重送，欄位仍與標題對齊。
- [ ] 全部服務零費用。
- [ ] 交接清單可將整套從開發者帳號遷至業者帳號，且前端僅需改一行 `WEBAPP_URL`。
