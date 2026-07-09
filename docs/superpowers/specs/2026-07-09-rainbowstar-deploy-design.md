# 彩虹星民宿 Rainbowstar — 上線部署與內容管理設計 (Design Spec)

- 日期：2026-07-09
- 狀態：草案（待使用者最終確認）
- 專案根目錄：`c:\Users\wuuu1\Desktop\rainbowstar`
- 現有前端：`claude_design/彩虹星民宿 Rainbowstar.dc.html` + `claude_design/support.js`

---

## 1. 背景與目標

民宿業者的形象網站前端已大致完成（雙語 zh/繁中・en，含住宿預定與打工換宿兩份表單）。目前是設計工具產出的「預覽版」，`WEBAPP_URL` 為空、後端未建。要達成三件事：

1. **上線**：讓一般人能連進來、真的填寫並送出表單。
2. **業者可自行改內容**：非技術業者不碰程式碼，就能改文字與照片。
3. **表單真的收得到**：送出後業者收到 email，且資料像 Google 表單一樣一列一列存進試算表。

### 成功定義
- 公開網址可被任何人開啟，外觀/功能與現有設計一致。
- 業者在一個密碼保護的後台頁，能改所有主要文字（中英）＋上傳/刪除/排序照片，存檔後公開站自動更新。
- 訪客送出任一表單後：業者信箱收到通知信；該筆資料出現在試算表對應分頁（含時間戳）；訪客看到成功訊息。
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

帳號策略：**先用開發者自己的 Google 帳號建置與測試，通過後再遷移到業者帳號**（見 §11）。設定集中在單一 `WEBAPP_URL`，降低遷移成本。

---

## 3. 系統架構

四個元件，全部掛在單一 Google 帳號下，全部免費：

```
        ┌─────────────────────────────────────────────┐
訪客 ──▶ │  公開網站  index.html  (Cloudflare Pages·免費) │
        │   · 載入時 GET → 抓內容(文字/房型/照片URL)填頁  │
        │   · 送表單 POST(no-cors) → 丟後端              │
        └──────────────┬──────────────────────────────┘
                       │
                       ▼
        ┌─────────────────────────────────────────────┐
        │   Apps Script Web App  ＝ 中央大腦 (免費)      │
        │   doGet: 供內容 JSON / 供圖 / 供後台頁         │
        │   doPost: 收表單 / 存內容 / 上傳刪除照片        │
        └───┬───────────────┬───────────────┬─────────┘
            ▼               ▼               ▼
     Google 試算表        Google Drive   Gmail (MailApp)
     settings / rooms     照片資料夾      寄通知信給業者
     workexchange_lists
     responses_stay
     responses_work

        ┌─────────────────────────────────────────────┐
業者 ──▶ │  後台頁  admin (Apps Script HtmlService·密碼登入)│
        │   改文字(中英) + 上傳/刪/排序照片               │
        │   google.script.run → 同源、無 CORS            │
        └─────────────────────────────────────────────┘
```

- **① 公開網站**：純靜態，放 Cloudflare Pages（免費）。GitHub Pages 為等價備案。
- **② 後端大腦**：Google Apps Script Web App（免費）。唯一的動態層。
- **③ 資料庫/儲存**：Google 試算表（內容 + 表單回應）＋ Google Drive 資料夾（照片）。
- **④ 後台**：由 Apps Script 用 `HtmlService` 自行 host 的密碼頁 → 與後端同源，避開跨網域問題。

設計原則：**單一設定點**。公開站唯一需外部設定的是 `window.RAINBOWSTAR_CONFIG.WEBAPP_URL`。

---

## 4. 資料模型

### 4.1 Google 試算表分頁

**分頁 `settings`**（key/value；每個文字鍵可有 `<key>_en` 英文列，留空則前端自動 fallback 中文）

前端實際消費的鍵（來自 `data-content` 與 JS）：

| key | 用途 |
|-----|------|
| `site_name` | 站名（header/hero/footer 共用） |
| `tagline` | 首頁大標下方標語 |
| `intro_text` | 關於我們段落 |
| `feature_1` / `feature_2` / `feature_3` | 三張特色卡文字 |
| `accommodation_intro` | 住宿區介紹 |
| `booking_note` | 預定注意事項 |
| `workexchange_intro` | 換宿區介紹 |
| `location_text` | 聯絡－地點 |
| `contact_email` | 聯絡 email（同時設定 `mailto:`） |
| `contact_line` | 電話 / LINE |
| `hero_photos` | 首頁大圖（多張，換行或逗號分隔的圖片網址） |
| `scenery1_photos` / `scenery2_photos` / `scenery3_photos` | 周邊三個景點照片（各可多張） |

> 註：前端另相容 `hero_image`/`hero_image2..4`/`hero_images` 與 `scenery1..3`，但本設計標準化採用 `hero_photos` 與 `sceneryN_photos`。每個文字鍵對應一列 `<key>_en`。

**分頁 `rooms`**（一列一房型，前端依列數自動排版：單筆→精選大卡，多筆→卡片格）

| 欄位 | 用途 |
|------|------|
| `name` / `name_en` | 房型名稱 |
| `description` / `description_en` | 房型描述（支援換行） |
| `price` | 價格數字（空/0 顯示「—」） |
| `unit` / `unit_en` | 價格單位（例：/ 床） |
| `note` / `note_en` | 備註（虛線下方小字，可選） |
| `photos` | 該房型照片（多張，換行/逗號分隔的網址） |

> 前端相容 `photo`/`photo1..8`/`images` 等多種欄名；本設計標準化採用 `photos` 單欄多值。

**分頁 `workexchange_lists`**（換宿章程與工作內容；一列一項，後台可增刪排序）

| 欄位 | 用途 |
|------|------|
| `list` | 清單類型：`rules`（換宿章程）/ `duties_out`（戶外工作）/ `duties_in`（室內工作） |
| `order` | 排序（數字，小到大） |
| `text_zh` | 中文內容 |
| `text_en` | 英文內容 |

> `rules` 由前端自動編號（1,2,3…），`duties_*` 以圓點呈現；後台不需維護編號。首次建置時，以現有寫死於程式碼的內容預先匯入（16 條章程、5 項戶外、2 項室內）。

**分頁 `responses_stay`**（住宿預定回應；欄位＝表單欄位 + 前置 `timestamp`）
`timestamp, name_en, name_zh, birthday, gender, country, passport, email, phone, room_type, guests, checkin, checkout, need_addon, addons, addon_remark, pickup_route, pickup_airline, pickup_from, pickup_flight, pickup_date, pickup_time, pickup_pax, dropoff_route, dropoff_airline, dropoff_date, dropoff_time, dropoff_pax, city_dir, city_date, city_time, city_place, city_pax, meal_avoid, ack_phone, agree_price`

**分頁 `responses_work`**（打工換宿回應）
`timestamp, name_en, name_zh, birthday, age, gender, country, email, phone, address, emergency_name, emergency_relation, emergency_phone, stay_length, start_date, end_date, blog_fb, photo_url, languages, has_license, interests, health_ok, health_detail, has_exchange_exp, exchange_exp_detail, education, work_exp, self_intro, agree_rules, agree_work, agree_responsible, remark`

> `addons` 為複選（多個 checkbox），送出時為重複鍵；後端須以 `e.parameters.addons`（陣列）取值並以「; 」串接後寫入單一儲存格。其餘複選/同名欄位同理。

### 4.2 Google Drive

- 一個根資料夾 `Rainbowstar Photos`，內含子資料夾對應各照片區塊（`hero`、`room-<id>`、`scenery-1..3`）。
- 後台上傳的照片存入對應子資料夾；後端產生可公開存取的圖片網址並寫回試算表對應照片欄。
- 圖片供應策略見 §6.3。

---

## 5. 元件一：公開網站（前端壓平）

### 5.1 現況問題
預覽版透過 `support.js`（dc-runtime）從 unpkg 載入 React 18 + Babel standalone，於瀏覽器即時編譯 `<x-dc>` 模板。缺點：首載慢（Babel ≈2.8MB＋編譯）、依賴 unpkg 可用性、對 SEO 不友善。

### 5.2 壓平做法（外觀與功能不變）
1. 將 `<x-dc>` 內的模板 markup 直接放進標準 `<body>`。
2. 將 `Component extends DCLogic` 的 `boot()` 內容改寫成一個載入時執行一次的 IIFE（該段本就是純 DOM 操作：`getElementById`、設 style、掛事件）。`props` 以一個小設定物件替代（`defaultLang`、`showNearby`）。
3. 以約 20 行 vanilla script 重現設計工具的偽屬性行為：
   - `style-hover="..."` → `mouseenter`/`mouseleave` 套用/還原
   - `style-focus="..."` → `focus`/`blur`
   - （如有 `style-active` 一併處理）
4. 移除 `support.js`、React、ReactDOM、Babel、所有 unpkg 依賴。保留 Google Fonts（可接受）。
5. 保留既有的 `applyContent`/`loadContent`/`attachSubmit`/驗證/輪播/燈箱/i18n/導覽邏輯（皆為 vanilla，直接沿用）。
6. 將換宿章程/工作內容的 `renderList` 由「寫死陣列 + `dataset.done` 一次性守衛」改為**資料驅動且可重建**：清單內容改由後端 JSON 提供，於 `applyContent()` 時清空並重建（移除一次性守衛）；語言切換沿用既有 `data-zh`/`data-en` 機制。原寫死內容降級為 fallback 預設值（後端不可達時使用）。
7. 檔名 `彩虹星民宿 Rainbowstar.dc.html`（含中文與 `.dc`）→ 改為 **`index.html`**。

### 5.3 執行期行為（不變）
- 載入時 `fetch(WEBAPP_URL + '?_=' + Date.now())` 取 `{settings, rooms, rules, duties_out, duties_in}` JSON → `applyContent()` 填入 `[data-content]`、hero、景點、房型、換宿章程與工作內容。
- 房型無資料時使用內建 `DEFAULT_ROOMS`；章程/工作內容無資料時使用內建 `DEFAULT_RULES` / `DEFAULT_DUTIES_OUT` / `DEFAULT_DUTIES_IN`。
- 兩表單以 `fetch(WEBAPP_URL, {method:'POST', mode:'no-cors', body: URLSearchParams(FormData)})` 送出（fire-and-forget）。
- 語言、驗證、輪播、燈箱維持現狀。

### 5.4 設定點
```html
<script>window.RAINBOWSTAR_CONFIG={WEBAPP_URL:"<部署後填入>"};</script>
```
遷移帳號時只改此行 + 重新上傳。

---

## 6. 元件二：Apps Script 後端

單一 Web App（部署設定：執行身分＝我；存取權＝任何人）。以查詢參數/`action` 分派。

### 6.1 `doGet(e)`
- 無參數（或 `?_=timestamp`）：回傳公開內容 JSON `{settings:{...}, rooms:[...], rules:[...], duties_out:[...], duties_in:[...]}`（清單項目形如 `{zh, en}`，後端已依 `order` 排序），`Content-Type: application/json`。供公開站讀取。
- `?page=admin`：回傳後台 HTML（`HtmlService`）。見 §7。
- `?img=<fileId>`（若採 proxy 供圖）：回傳該 Drive 檔案 blob。見 §6.3。

### 6.2 `doPost(e)`
以 `e.parameter.action`（或表單 `type`）分派：
- **表單送出**（`type=accommodation` / `type=workexchange`，來自公開站）：
  1. 驗證/清洗欄位；複選欄位以 `e.parameters` 取陣列串接。
  2. append 一列到 `responses_stay` 或 `responses_work`（前置 `timestamp`）。
  3. 呼叫 §8 寄信。
  4. 回傳簡單 200（公開站以 `no-cors` 送出、不讀回應）。
- **後台動作**（來自同源後台，經 `google.script.run`，非 `doPost`）：見 §7；後台用 `google.script.run` 直接呼叫 Apps Script 函式，不走 HTTP `doPost`，天然無 CORS。

### 6.3 照片供應策略
Google Drive 公開直連網址歷史上不穩。採**雙軌 + 可退回**：
- 首選：上傳後設檔案為「知道連結者可讀」，產生 `https://lh3.googleusercontent.com/d/<fileId>=w1600` 形式的 CDN 直連網址寫回試算表（快、走 Google CDN）。
- 退回：若直連被 Google 政策擋，改用 `doGet?img=<fileId>` 由 Apps Script 串流 blob（較慢但可靠）。
- **實作前先做最小驗證**：上傳一張測試圖，確認公開站 `<img>`/background 能正常顯示，再決定採哪一軌。

### 6.4 設定（Script Properties）
`ADMIN_PASSCODE`、`OWNER_EMAIL`、`SHEET_ID`、`PHOTO_ROOT_FOLDER_ID`。全部存 Script Properties，不寫死在程式碼。

---

## 7. 元件三：後台管理頁（Apps Script HtmlService）

### 7.1 存取與登入
- 網址：`<WEBAPP_URL>?page=admin`。
- 登入：輸入密碼欄 → `google.script.run` 驗證比對 `ADMIN_PASSCODE`。通過後在該分頁 session 記住（`sessionStorage`）。
- 定位：低風險內容管理頁，密碼保護足夠（見 §13）。

### 7.2 版面（分區）
- **基本資訊**：`site_name`、`contact_email`、`contact_line`、`location_text`（中英）
- **首頁**：`tagline` + hero 照片管理
- **關於**：`intro_text`、`feature_1..3`（中英）
- **住宿**：`accommodation_intro`、`booking_note`（中英）＋ **房型清單**（可新增/刪除/排序，每筆：name/description/price/unit/note 中英 + 照片管理）
- **換宿**：`workexchange_intro`（中英）＋ **三組清單編輯器**：換宿章程 `rules`、戶外工作 `duties_out`、室內工作 `duties_in`。每組可新增項目、刪除項目、拖曳排序；每項中英雙欄（英文可留空）。章程編號由前端自動產生，後台不需手動維護。
- **周邊景點**：scenery 1–3 文字 + 各自照片管理
- 每個文字欄位：中文格 + 英文格（英文可留空）。

### 7.3 照片管理元件（每區塊共用）
- 縮圖牆顯示目前照片。
- 操作：選檔/拖曳上傳（可多張）、刪除、拖曳排序。
- 上傳流程：前端讀檔為 base64 → `google.script.run.uploadPhoto(section, filename, base64)` → 後端存入對應 Drive 子資料夾 → 產生網址 → 更新試算表對應照片欄 → 回傳新網址 → 前端刷新縮圖。
- 刪除：`google.script.run.deletePhoto(section, url)` → 從試算表移除該網址（Drive 檔可保留或移入垃圾桶）。

### 7.4 儲存
- 「儲存」→ `google.script.run.saveContent(payload)` 將該區塊文字寫回 `settings`/`rooms`。
- 成功顯示提示；公開站於訪客下次載入時取得新內容。

---

## 8. 元件四：Email 通知

- 表單送出成功後，後端以 `MailApp.sendEmail` 寄給 `OWNER_EMAIL`。
- 主旨：`【Rainbowstar】新<住宿預定/打工換宿>申請 — <申請人姓名>`。
- 內文：條列所有欄位（中文標籤 + 值），空值略過；換宿附上照片/部落格連結。
- 額度：Gmail/Apps Script 免費帳號每日 100 封，遠超民宿需求。
- 失敗處理：寄信失敗不應阻擋資料寫入（已寫入試算表為主要保底）。

---

## 9. 跨網域（CORS）策略

三條資料路徑各自避開 CORS：
1. **讀內容**（公開站 → 後端）：`GET`，簡單請求；Apps Script Web App（存取權＝任何人）回 JSON 可跨源讀取。
2. **送表單**（公開站 → 後端）：`POST` + `mode:'no-cors'` + `URLSearchParams`（`application/x-www-form-urlencoded`，簡單請求、不觸發預檢）。fire-and-forget，不需讀回應。此為現有前端寫法。
3. **後台操作**（後台 → 後端）：後台頁由 Apps Script 同源 host，用 `google.script.run`，完全不經跨源 HTTP。

**風險緩解**：實作第一步先驗證路徑 1（跨源 GET JSON）在 Cloudflare 網域下實際可讀（含 302 轉址情境），通過再往下。

---

## 10. 部署步驟（一次性）

1. **建 Google 資產**：新增試算表（`settings`/`rooms`/`responses_stay`/`responses_work` 分頁與表頭）＋ Drive 根資料夾。
2. **貼後端程式**：在試算表容器綁定或獨立 Apps Script 專案貼上 `Code.gs` 與後台 `admin.html`（HtmlService template）。
3. **設定 Script Properties**：`ADMIN_PASSCODE`、`OWNER_EMAIL`、`SHEET_ID`、`PHOTO_ROOT_FOLDER_ID`。
4. **部署 Web App**：執行身分＝我、存取權＝任何人 → 取得 `WEBAPP_URL`。
5. **最小驗證**：跨源 GET JSON、送一筆測試表單（收信＋落表）、上傳一張測試照片（公開站顯示）。
6. **接線前端**：`WEBAPP_URL` 填入 `index.html`。
7. **壓平前端**：依 §5 產出乾淨 `index.html`（移除 support.js/React/Babel）。
8. **上架公開站**：Cloudflare Pages 直接上傳 → 取得公開網址（選配綁自訂網域）。
9. **驗收**：跑 §16 全部驗收項。

---

## 11. 帳號交接清單（開發者帳號 → 業者帳號）

遷移時（測試通過後）：
1. 將試算表「建立副本」到業者 Drive（或轉移擁有權）；記下新 `SHEET_ID`。
2. 在業者帳號下建立/複製 Apps Script 專案與後台頁；設定 Script Properties（新 `SHEET_ID`、業者 `OWNER_EMAIL`、新 Drive 資料夾 ID、密碼）。
3. 以業者帳號**重新部署 Web App** → 取得**新的 `WEBAPP_URL`**。
4. 將新 `WEBAPP_URL` 填入 `index.html` 的設定行（單一改動點）→ 重新上傳 Cloudflare。
5. 上傳正式照片（測試期照片為拋棄式）。
6. 交付業者：後台網址 + 密碼；示範改一次字、換一次照片、看一次申請信與試算表。

> 因遷移必然更換 `WEBAPP_URL` 與照片位置，設計刻意將前端可變設定收斂為一行，並將照片視為可重建資料。

---

## 12. 費用

| 項目 | 費用 |
|------|------|
| Cloudflare Pages（公開站 host） | 免費 |
| Apps Script（後端 + 後台 + 寄信） | 免費（每日 100 封信額度） |
| Google 試算表 + Drive | 免費（15GB 內） |
| 自訂網域（選配） | 約 NZD$20–40/年，非必要 |
| **合計（不綁網域）** | **NZD$0** |

---

## 13. 安全性考量

- **後台密碼**：低敏感內容管理，單一共享密碼 + 同源 `google.script.run` 足夠。密碼存 Script Properties，不入版控。避免在前端明碼比對。
- **公開 Web App**：存取權「任何人」是讀內容/收表單所需；後端須驗證/清洗輸入，僅接受預期欄位，避免任意寫入試算表其他分頁。
- **表單濫用/spam**：v1 依賴前端既有驗證 + 後端欄位白名單。未來可加簡易 honeypot 或速率限制（見 §14）。
- **個資**：表單含護照號、緊急聯絡、出生日期等；試算表存取權限僅限業者帳號；交接後由業者掌控。公開站不顯示任何回應資料。
- **無敏感金鑰入版控**：`WEBAPP_URL` 可公開（本就是公開端點）；密碼與 email 僅存 Script Properties。

---

## 14. 範圍外／未來加值

- 訪客自動確認信（訪客留 email 時回一封）。
- 反 spam：honeypot 欄位、送出速率限制、Turnstile（Cloudflare 免費）。
- 自訂網域 + 網站 SEO/OG 圖強化。
- 房型空房日曆 / 金流（明確排除）。

---

## 15. 假設與待確認

1. 業者接受「先用開發者帳號測試、之後遷移」——**已確認**。
2. 表單資料保留漂亮自訂表單，落 Sheet + 寄 email——**已確認**。
3. 內容與照片全部在後台頁編輯，業者不需開試算表——**已確認**。
4. 公開站放 Cloudflare Pages（GitHub Pages 等價備案）——**已確認**。
5. 換宿章程與工作內容清單改為**後台可編輯**（存於 `workexchange_lists` 分頁）——**已確認**。理由：現有內容約為 2012 年撰寫，業者預期需大幅更動。
6. 版本控制：專案 `git init`，後續推送至使用者提供的 GitHub repo——**已確認**。
7. **待確認（實作細節，非阻塞）**：照片供應優先採 Google CDN 直連（`lh3.googleusercontent.com/d/<fileId>`），必要時退回 Apps Script proxy（`doGet?img=`）。實作時以最小驗證定案。

---

## 16. 驗收標準

- [ ] 公開網址可被任意瀏覽器開啟，版面/功能與現有設計一致（hero、房型輪播、燈箱、雙語切換、導覽、兩表單）。
- [ ] 公開站不再依賴 unpkg（無 React/Babel/support.js 外部請求）。
- [ ] 公開站載入時成功抓取後端內容並套用（改試算表一格文字，重新整理後可見變化）。
- [ ] 後台頁需密碼進入；錯誤密碼被拒。
- [ ] 後台改文字（中英）→ 儲存 → 公開站重新載入後更新。
- [ ] 後台上傳照片 → 公開站對應區塊顯示該照片；刪除後消失。
- [ ] 後台可新增/刪除/拖曳排序換宿章程與戶外/室內工作項目（中英）；公開站重新載入後反映，且章程自動重新編號。
- [ ] 住宿表單送出 → `responses_stay` 新增一列（含時間戳、複選欄正確串接）＋ 業者收到通知信 ＋ 訪客見成功訊息。
- [ ] 換宿表單送出 → `responses_work` 同上。
- [ ] 全部服務零費用。
- [ ] 交接清單可將整套從開發者帳號遷至業者帳號，且僅需改前端一行 `WEBAPP_URL`。
