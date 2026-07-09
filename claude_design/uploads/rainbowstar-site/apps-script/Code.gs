/**
 * Rainbowstar 彩虹星民宿 — 後端 (Google Apps Script Web App)
 * ------------------------------------------------------------------
 *   doGet  → 把 Google Sheet 的內容(settings + rooms)變成 JSON 給網站讀
 *   doPost → 收到網站表單 → 依類型寫進「住宿申請 / 換宿申請」分頁 → 自動寄 Gmail 通知
 *
 * 表單欄位完全比照舊版 Google 表單。主人之後只要改 Sheet，網站就會跟著變。
 * 設定方式請看 SETUP.md。
 * ------------------------------------------------------------------
 */

var SHEET_SETTINGS = 'settings';   // 鍵值：網站文字、價格說明等
var SHEET_ROOMS    = 'rooms';      // 房型/房價表
var SHEET_STAY     = '住宿申請';    // 住宿申請會寫在這（自動建立）
var SHEET_WORK     = '換宿申請';    // 換宿申請會寫在這（自動建立）

/** 住宿申請欄位（key 對應網站表單 name；中文是 Sheet 標題）順序＝舊表單順序 */
var ACCOM_FIELDS = [
  ['name_en','英文姓名'], ['name_zh','中文姓名'], ['birthday','出生日期'], ['gender','性別'],
  ['country','國家'], ['passport','Passport號碼'], ['email','E-mail'], ['phone','連絡電話'],
  ['room_type','想預定的房型'], ['guests','入住人數'], ['checkin','入住日期'], ['checkout','退房日期'],
  ['need_addon','是否需加購服務'], ['addons','需要加購的項目'], ['addon_remark','加購備註(T1~T4)'],
  ['ack_phone','已記下連絡電話'], ['agree_price','已了解價格與付款方式'],
  ['pickup_route','接機-國際/國內'], ['pickup_airline','接機-航空'], ['pickup_from','接機-出發地點'],
  ['pickup_flight','接機-班機號碼'], ['pickup_date','接機-抵達日期'], ['pickup_time','接機-抵達時間'], ['pickup_pax','接機-人數'],
  ['dropoff_route','送機-國際/國內'], ['dropoff_airline','送機-航空'], ['dropoff_date','送機-起飛日期'], ['dropoff_time','送機-起飛時間'], ['dropoff_pax','送機-人數'],
  ['city_dir','市區接送-方向'], ['city_date','市區接送-日期'], ['city_time','市區接送-時間'], ['city_place','市區接送-地點'], ['city_pax','市區接送-人數'],
  ['meal_avoid','餐點忌諱的食物']
];

/** 換宿申請欄位 順序＝舊表單順序 */
var WORK_FIELDS = [
  ['name_en','英文姓名'], ['name_zh','中文姓名'], ['birthday','出生日期'], ['age','年齡'], ['gender','性別'],
  ['country','國家'], ['email','E-mail'], ['phone','連絡電話'], ['address','居住地址'],
  ['emergency_name','緊急連絡人'], ['emergency_relation','與緊急聯絡人的關係'], ['emergency_phone','緊急連絡電話'],
  ['stay_length','申請換宿時間'], ['start_date','希望換宿日期'], ['end_date','結束日期'],
  ['blog_fb','部落格或FB'], ['photo_url','照片連結'], ['languages','會說的語言'],
  ['has_license','國際認可駕照'], ['interests','興趣'], ['health_ok','身心狀況良好'], ['health_detail','狀況說明(若填無)'],
  ['has_exchange_exp','類似換宿經驗'], ['exchange_exp_detail','經驗簡述'],
  ['education','學歷'], ['work_exp','工作經驗'], ['self_intro','自我介紹'],
  ['agree_rules','同意換宿章則'], ['agree_work','了解工作內容'], ['agree_responsible','願意負責內容'], ['remark','備註']
];

/** ============ 讀取內容：網站載入時會呼叫 ============ */
function doGet(e) {
  try {
    return jsonOutput_({
      ok: true,
      settings: readSettings_(),
      rooms: readRooms_(),
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

/** ============ 接收表單：訪客送出申請時會呼叫 ============ */
function doPost(e) {
  try {
    var p  = (e && e.parameter)  ? e.parameter  : {};
    var pp = (e && e.parameters) ? e.parameters : {}; // 複選欄位（如加購項目）會是陣列
    var type = p.type || 'accommodation';
    var isWork = (type === 'workexchange');
    var fields    = isWork ? WORK_FIELDS : ACCOM_FIELDS;
    var sheetName = isWork ? SHEET_WORK  : SHEET_STAY;

    if (!p.name_en && !p.name_zh && !p.email) {
      return jsonOutput_({ ok: false, error: '缺少必要欄位' });
    }

    // 取值小工具：複選用 " / " 串起來
    function val(key) {
      if (pp[key] && pp[key].length > 1) return pp[key].join(' / ');
      return (p[key] !== undefined && p[key] !== null) ? p[key] : '';
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['時間'].concat(fields.map(function (f) { return f[1]; })).concat(['資料檢查']));
    }
    var flag = checkSuspicious_(val);                       // 後盾：標記可疑資料
    var row = [new Date()].concat(fields.map(function (f) { return val(f[0]); })).concat([flag]);
    sheet.appendRow(row);

    sendNotifyEmail_(type, fields, val, flag);

    return jsonOutput_({ ok: true, message: '申請已送出 / Application received' });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

/** 讀 settings 分頁 → { key: value } */
function readSettings_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETTINGS);
  var out = {};
  if (!sheet || sheet.getLastRow() < 1) return out;
  var values = sheet.getDataRange().getValues();
  for (var i = 0; i < values.length; i++) {
    var key = String(values[i][0] || '').trim();
    if (!key || key.toLowerCase() === 'key') continue;
    out[key] = values[i][1];
  }
  return out;
}

/** 讀 rooms 分頁 → [ {name, description, price, unit, note}, ... ] */
function readRooms_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ROOMS);
  var out = [];
  if (!sheet || sheet.getLastRow() < 2) return out;
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function (h) { return String(h || '').trim(); });
  for (var i = 1; i < values.length; i++) {
    if (values[i].every(function (c) { return c === '' || c === null; })) continue;
    var obj = {};
    for (var j = 0; j < headers.length; j++) if (headers[j]) obj[headers[j]] = values[i][j];
    out.push(obj);
  }
  return out;
}

/** 寄通知信，列出所有有填的欄位 */
function sendNotifyEmail_(type, fields, val, flag) {
  var settings = readSettings_();
  var to = (settings.notify_email || Session.getEffectiveUser().getEmail() || '').toString().trim();
  if (!to) return;

  var isWork = (type === 'workexchange');
  var label = isWork ? '換宿申請 Work Exchange' : '住宿申請 Accommodation';
  var who = val('name_zh') || val('name_en') || val('email');
  var subject = '【彩虹星民宿】新' + label + ' - ' + who + (flag ? '（' + flag + '）' : '');

  var lines = ['你收到一筆新的' + label + '：', ''];
  if (flag) lines.push('⚠️ 系統提醒：' + flag + '（此筆資料可能為測試或亂填，請留意）', '');
  fields.forEach(function (f) {
    var v = val(f[0]);
    if (v !== '' && v !== null && v !== undefined) lines.push(f[1] + '： ' + v);
  });
  lines.push('', '— 這封信由民宿網站自動寄出 —');

  var options = {};
  var email = val('email');
  if (email && /\S+@\S+\.\S+/.test(email)) options.replyTo = email;

  MailApp.sendEmail(to, subject, lines.join('\n'), options);
}

/** 後盾偵錯：檢查明顯亂填的資料，回傳提醒文字（沒問題則回空字串） */
function checkSuspicious_(val) {
  var notes = [];
  var rawPhone = String(val('phone') || '').trim();
  var phone = rawPhone.replace(/[^0-9]/g, '');
  if (rawPhone && phone.length < 6) notes.push('電話可疑');
  var ne = String(val('name_en') || '').trim();
  if (ne && (/^(.)\1+$/.test(ne) || ne.length < 2)) notes.push('英文姓名可疑');
  var nz = String(val('name_zh') || '').trim();
  if (nz && /^(.)\1+$/.test(nz)) notes.push('中文姓名可疑');
  var em = String(val('email') || '').trim();
  if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) notes.push('Email可疑');
  var addr = String(val('address') || '').trim();
  if (addr && (/^(.)\1+$/.test(addr) || addr.length < 4)) notes.push('地址可疑');
  return notes.length ? ('⚠️ ' + notes.join('、')) : '';
}

/** 統一輸出 JSON */
function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
