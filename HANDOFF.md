# 彩虹星民宿網站 — 交接說明

一頁看懂整個系統怎麼跑、業者平常怎麼用、以及要遷移到業者帳號時怎麼做。

## 網址

| 用途 | 網址 |
|---|---|
| 公開網站 | https://1214-joseph.github.io/rainbowstarNZ/ |
| 內容後台（業者用） | `<WEBAPP_URL>?page=admin`，目前是 https://script.google.com/macros/s/AKfycby_LkKOVt-hlBMM6HvM8az-D_n2-c8-K5Eptxs2uJqAhlMGQNmZxDHqty1Ylu3epEkF/exec?page=admin |
| 資料（試算表） | Google 帳號裡的「彩虹星民宿網站內容」試算表 |
| 照片（Drive） | Google Drive 的「Rainbowstar Photos」資料夾（**只能透過後台上傳**，直接丟檔案進資料夾不會出現在網站上） |

## 架構（誰負責什麼）

```
GitHub Pages（免費靜態託管）
  └─ site/index.html + app.js ──讀取──▶ Apps Script doGet（內容 JSON）──讀── Google 試算表
                                └─表單──▶ Apps Script doPost ──寫── 試算表分頁 + 通知信
後台 <WEBAPP_URL>?page=admin ──密碼登入──▶ Apps Script（改文字/房型/章則/照片）
```

- 全部免費：GitHub Pages、Apps Script、試算表、Drive 都在免費額度內。
- 試算表內容改了**不需要**任何重新部署，訪客下次開網頁就看到新內容。

## 業者日常操作

1. **改文字／房型／章則**：開後台 → 輸入密碼 → 直接改 → 按最下面「儲存」。
2. **照片**：各區塊的「Choose File」選圖即自動上傳（會自動縮到 1600px）；拖曳縮圖調順序；「×」刪除。照片不用按儲存。
3. **收申請**：每筆表單申請會（a）寫進試算表的「住宿申請」或「換宿申請」分頁、（b）寄通知信到 `notify_email` 信箱；按「回覆」就是回給申請人。
4. **可疑資料**：亂填的申請會在試算表「資料檢查」欄與信件主旨標 ⚠️，人工判斷即可。
5. **errors 分頁**：系統出狀況時的記錄（例如不明來源的表單），平常不用管。

## 換密碼／換信箱

- **通知信箱與顯示信箱**：後台「基本資訊」→「收表單通知信的信箱」（不公開）與「聯絡 Email」（會顯示在網站上）→ 儲存。
- **後台密碼**：開試算表 → 擴充功能 → Apps Script → 左側齒輪「專案設定」→ 指令碼屬性 → 改 `ADMIN_PASSCODE` 的值 → 儲存。改密碼後所有已登入的瀏覽器會自動失效，需用新密碼重新登入。

## 遷移到業者的 Google 帳號（上線前最後一步）

1. 用開發帳號把試算表「共用」給業者帳號，業者「建立副本」（副本會歸業者所有；或直接轉移擁有權）。
2. 業者開啟副本 → 擴充功能 → Apps Script → 建立三個檔案並貼上 repo 裡 `apps-script/` 的內容：
   - `lib.gs` ← `lib.js`、`Code.gs` ← `Code.js`、`Admin.html`（HTML 類型）← `Admin.html`
3. 業者 Drive 新建照片資料夾，複製資料夾 ID（網址 `/folders/` 後面那段，**只要 ID**）。
4. 專案設定 → 指令碼屬性：`ADMIN_PASSCODE`（設一組新的長密碼）、`PHOTO_ROOT_FOLDER_ID`（第 3 步的 ID）。
5. 部署 → 新增部署作業 → 網頁應用程式 → 執行身分「我」、存取權「任何人」→ 部署 → 複製新的 `/exec` 網址。
6. 把 `site/index.html` 第 11 行的 `WEBAPP_URL` 換成新網址 → commit → push → GitHub Actions 自動重新發布網站。
7. 舊照片用後台重新上傳一次（照片存在誰的 Drive，就跟著誰的部署走）。

## 開發者備忘

- **改了 `.gs` 或 `Admin.html`**：貼到 Apps Script 後要「部署 → 管理部署作業 → 編輯 → 版本選新版本 → 部署」才會生效；只改試算表內容不用。
- **改了 `site/`**：push 到 GitHub 即自動部署（`.github/workflows/pages.yml`，目前 `main` 與 `feat/deploy-rainbowstar` 都會觸發）。
- **測試**：`npm test`（208 個測試，零相依，Node 內建 test runner）。
- **實測記錄**：`docs/superpowers/plans/2026-07-09-live-verification.md`（兩個設計期懸而未決的技術決策都在真機定案：跨源 POST 回應可讀 → `SUBMIT_MODE='readable'`；Drive CDN 直連圖可匿名存取 → 不需圖片代理）。
- **安全模型**：Web App 對「任何人」開放，所以同源不等於授權——每個後台函式第一步都驗 token；token 綁密碼指紋，換密碼即全數撤銷。偽造 token 的讀/寫攻擊已在真機實測被拒。
