# 實機部署驗證記錄（Task 21–22）

驗證日期：2026-07-19（NZ 後端掛在開發者測試帳號下，交接時再遷移）

## 部署資訊

- Web App URL（公開端點，可入版控）：
  `https://script.google.com/macros/s/AKfycby_LkKOVt-hlBMM6HvM8az-D_n2-c8-K5Eptxs2uJqAhlMGQNmZxDHqty1Ylu3epEkF/exec`
- 執行身分：我（部署者）／存取權：任何人
- 密碼與相簿資料夾 ID 存於 Apps Script 指令碼屬性，不入版控。

## Task 21 Step 4 — doGet 內容 JSON

`curl -sSL <WEBAPP_URL>`：

- `ok:true`，五鍵齊全（settings / rooms / rules / duties_out / duties_in）
- 清單筆數 `rules=16, duties_out=5, duties_in=2`，rooms=3 ✅
- `settings.notify_email` **未出現**於公開 JSON（PRIVATE_SETTINGS_KEYS 過濾生效）✅

## Task 21 Step 5 —【決策一】跨源 POST 回應可讀性

於 `https://example.com` 主控台以 `fetch` POST（urlencoded）：

```
READABLE {"ok":true,"message":"申請已送出 / Application received"}
```

**定案：跨源回應可讀。`SUBMIT_MODE = 'readable'` 維持 Task 16 預設，程式不需改動。**
訪客會看到伺服器真實回覆的成功／失敗，缺陷 1（假成功）的修法在真機成立。

注意：curl 直打時 302 redirect 後要改用 GET 取回應（curl 8.x 對 302 預設保留 POST 導致 411）；瀏覽器 fetch 無此問題。

## Task 21 Step 6 —【決策二】Drive CDN 直連圖

**首次實測失敗，原因是部署設定錯誤而非程式**：

```
上傳失敗：ScriptError: Exception: Unexpected error while getting the method
or property getFolderById on object DriveApp.
```

`PHOTO_ROOT_FOLDER_ID` 指令碼屬性被貼成整段資料夾網址；`getFolderById()` 需要純 ID。
→ 屬性改為純 ID 後重測（指令碼屬性為執行期讀取，不需重新部署）。重測結果見文末補記。

## Task 22 — 端到端驗證（對真實後端）

`site/index.html` 已填入 WEBAPP_URL；本機以 `http://localhost:8080` 靜態伺服器承載。

| 驗證項 | 結果 |
|---|---|
| 內容從試算表載入（顯示試算表編輯值「露宿自己的愛車 vehicle」而非內建預設） | ✅ |
| 後台改字回圈：tagline 改「測試標語 12345」→ 儲存 → 公開站顯示 → 還原 → 公開 JSON 復原 | ✅ |
| EN 切換：英文標語／章則（five days on, two days off）／英文房型名，中文退場 | ✅ |
| 空表單送出：紅色錯誤框逐欄列出、無 POST、無假成功 | ✅ |
| 住宿表單填妥送出：POST 302→200、伺服器 `ok:true` 後才顯示綠色成功 | ✅ |
| 亂填（電話 `12`）直打後端：`ok:true` 收下（`資料檢查` 標記待試算表目視確認） | ✅ |
| 換宿表單直打後端：`ok:true`（`換宿申請` 分頁自動建立） | ✅ |
| 未知 `type=bogus`：回 `ok:true` 不洩漏內部、寫入 `errors` 分頁（分頁待目視確認） | ✅ |
| 錯誤密碼登入：「密碼錯誤 Wrong passcode」、停在登入頁 | ✅ |
| **偽造 token 讀**：`loadAdminContent('forged-token')` → `DENIED ScriptError: Error: 未授權 Unauthorized` | ✅ |
| **偽造 token 寫**：`saveContent('forged-token', {...HACKED})` → 同上拒絕 | ✅ |
| token 保存於 sessionStorage，清除後要求重新輸入密碼；伺服器端每次呼叫都驗 token | ✅ |

尚待人工於試算表目視確認（無法以程式讀私有分頁）：
`住宿申請`／`換宿申請` 的測試列與 `資料檢查` 標記、`errors` 分頁的 bogus 記錄、
通知信三封（CORS 測試／端到端測試／換宿測試，回覆位址應為申請人 email）、
標題列對調自我修復實驗、刪除所有測試列。

## 補記 —【決策二】重測結果

（屬性修正後補填）
