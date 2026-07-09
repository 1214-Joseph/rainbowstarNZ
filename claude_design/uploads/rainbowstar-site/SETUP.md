# 彩虹星民宿網站 — 架設說明 SETUP

這是一個**免費、永久**的民宿網站方案。架構：

```
主人改 Google Sheet ─┐
                     ├─→ Apps Script ──→ 靜態網站 (GitHub Pages)
訪客送出表單 ────────┘         └─→ 寫入 Sheet + 自動寄 Gmail
```

- **網站本身**：一個 `index.html`，放在 GitHub Pages（免費、永久）。
- **內容後台**：一個 Google Sheet。主人改 Sheet → 網站自動更新，**完全不用碰程式碼**。
- **表單**：訪客在網站填申請 → 一支 Google Apps Script 把資料寫進 Sheet，並寄 Gmail 通知。

> 角色分工：**你（工程師）** 維護 `index.html` 與 Apps Script；**民宿主人** 只需要會用 Google Sheet。

---

## 📁 這個資料夾有什麼

| 檔案 | 用途 |
|---|---|
| `index.html` | 網站本體（含 UI/UX 設計）。部署用這個。 |
| `apps-script/Code.gs` | 後端腳本，貼到 Google Apps Script。 |
| `sheet-template/settings.csv` | Sheet 的 `settings` 分頁範本（文字、價格說明、聯絡方式）。 |
| `sheet-template/rooms.csv` | Sheet 的 `rooms` 分頁範本（房型／房價表）。 |
| `SETUP.md` | 你正在看的這份說明。 |

---

## ① 建立 Google Sheet（內容後台）

1. 到 [sheets.google.com](https://sheets.google.com) 新建一個空白試算表，命名為「彩虹星民宿網站內容」。
2. 建立 **2 個分頁**，名稱**必須完全一致**（小寫）：`settings`、`rooms`。
   （收申請用的 `住宿申請`、`換宿申請` 兩個分頁，第一次有人送出表單時會**自動建立**，你不用先開。）
3. 把範本內容填進去：
   - `settings` 分頁 → 用 `sheet-template/settings.csv` 的內容（A 欄是 key、B 欄是值）。**key 那一欄不要改**，只改 B 欄的值。
   - `rooms` 分頁 → 用 `sheet-template/rooms.csv` 的內容（第一列是欄位名：name / description / price / unit / note，不要改；price 請填實際房價）。
   > 匯入 CSV 的方式：分頁上 **檔案 → 匯入 → 上傳 → 選 CSV → 「取代目前工作表」**。或直接把內容複製貼上。
4. **重要**：把 `settings` 的 `contact_email` 和 `notify_email` 改成你要收通知的 Gmail。

---

## ② 貼上後端腳本並部署（Apps Script）

1. 在這個 Google Sheet 上方選 **擴充功能 (Extensions) → Apps Script**。
2. 把預設的程式碼全部刪掉，貼上 `apps-script/Code.gs` 的全部內容，按 💾 儲存。
3. 右上角點 **部署 (Deploy) → 新增部署作業 (New deployment)**。
   - 類型齒輪選 **網頁應用程式 (Web app)**。
   - **執行身分 (Execute as)**：`我 (你的帳號)`。
   - **誰可以存取 (Who has access)**：**任何人 (Anyone)**。← 一定要選這個，網站才讀得到。
4. 按 **部署**。第一次會跳出授權，按 **授權存取 → 選你的帳號 → 進階 → 前往（不安全）→ 允許**。
   （這是 Google 對自己寫的腳本的標準提醒，因為腳本會用到你的 Sheet 和 Gmail。）
5. 複製最後得到的 **網頁應用程式網址**，長得像：
   ```
   https://script.google.com/macros/s/AKfyc..................../exec
   ```
   這個 `/exec` 網址先留著，下一步要用。

> 之後如果你**改了 Code.gs**，要重新「部署 → 管理部署作業 → 編輯 → 版本選新版本 → 部署」才會生效。
> 但**只改 Sheet 內容不用重新部署**，網站會自動抓到。

---

## ③ 把網址填回網站

打開 `index.html`，找到最上面這段（約第 100 行）：

```html
<script>
  window.RAINBOWSTAR_CONFIG = {
    WEBAPP_URL: ""
  };
</script>
```

把剛剛的 `/exec` 網址貼進雙引號裡：

```html
    WEBAPP_URL: "https://script.google.com/macros/s/AKfyc.../exec"
```

存檔。此時你**直接用瀏覽器打開 index.html** 就能看到網站，而且會載入 Sheet 的內容、表單也能送出了。

---

## ④ 部署到 GitHub Pages（免費永久上線）

1. 到 [github.com](https://github.com) 建一個新的 repository（Public），例如 `rainbowstar`。
2. 上傳 `index.html`（網站只需要這一個檔案；其他檔案是給你參考的，可不上傳）。
3. repo 上方 **Settings → Pages**：
   - Source 選 **Deploy from a branch**，branch 選 `main`、資料夾 `/ (root)`，按 Save。
4. 等 1～2 分鐘，網址會出現在同一頁，像：
   ```
   https://你的帳號.github.io/rainbowstar/
   ```
   這就是民宿的正式網站，永久免費。

**想用自己的網域**（例如 `rainbowstar.co.nz`）？在 Settings → Pages 的 Custom domain 填網域，再到網域商設定 DNS 即可（網域本身要另外買，約每年 NZ$15～25，但 hosting 仍免費）。

> 替代方案：[Cloudflare Pages](https://pages.cloudflare.com) 也是免費永久、速度更快，把同一個 `index.html` 拖上去就好。兩個擇一即可。

---

## ⑤ 主人日常怎麼維護（重點！）

**完全不用找工程師，只要打開那個 Google Sheet：**

- **改房價** → 到 `rooms` 分頁，改 `price` 那一格的數字 → 存檔。回網站重新整理就變了。
- **改住宿／換宿說明、聯絡方式** → 到 `settings` 分頁，改 B 欄的文字 → 存檔。
- **新增一個房型** → 在 `rooms` 分頁加一列（填 name / description / price / unit / note）。
- **換首頁大圖** → 在 `settings` 的 `hero_image` 那格貼一張圖片網址（可用 Google Drive 公開連結或免費圖床）。

> 小提醒：Google 對網站讀取內容會有約 1～5 分鐘的快取，改完不一定「秒更新」，等幾分鐘或重整即可。

**雙語（繁中／英文）：**
- 網站右上角有「EN／中」切換鈕，介面與表單都已內建中英雙語，會記住訪客的選擇。
- 表單欄位的英文是寫死在 `index.html` 裡的，主人不用管。送出的申請一律以中文記錄，方便你閱讀。
- 由 Sheet 控制的文字（如 `intro_text`、房型說明）若也想要英文版，**可選擇性**在 `settings` 多加一列 `intro_text_en`、或在 `rooms` 多加一欄 `description_en`；切到英文時會優先顯示 `_en`，沒有就退回中文。不加也完全沒問題。

**收申請：**
- 住宿申請會自動寫進 `住宿申請` 分頁，換宿申請寫進 `換宿申請` 分頁（欄位完全比照舊版表單）。
- 同時會寄一封通知信到 `notify_email` 設定的 Gmail，直接點「回覆」就能回信給申請人。

---

## ⚠️ 注意事項與常見問題

- **表單送出方式**：網站用 `no-cors` 方式送出，所以資料一定會寫進 Sheet、信也會寄出，但瀏覽器讀不到伺服器回覆，網站一律顯示「已送出」。對民宿訂房／換宿表單來說這樣最穩定。
- **Gmail 寄信額度**：一般 Gmail 帳號每天約 100 封，對民宿流量綽綽有餘。
- **內容載入失敗也不會壞**：萬一 Sheet 暫時讀不到，網站會用 `index.html` 內的預設文字，不會空白。
- **安全**：Apps Script 用「任何人」存取，是指任何人都能送表單／讀公開內容，**別人看不到也改不到你的 Sheet**；只有你的 Google 帳號能編輯。
- **要更友善的後台？** 目前主人是直接編 Google Sheet。若日後想要「網站內建一個有密碼的 /admin 管理頁」或「Decap CMS」，這個架構都可以再加上去，跟我說一聲即可。

---

有任何一步卡住，把畫面截圖給我，我幫你看。
