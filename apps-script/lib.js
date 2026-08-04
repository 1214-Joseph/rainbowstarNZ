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

/** Accommodation application fields. */
var ACCOM_FIELDS = [
  ['name_en', '英文姓名'], ['name_zh', '中文姓名'], ['birthday', '出生日期'], ['gender', '性別'],
  ['country', '國家'], ['passport', '護照號碼'], ['email', 'E-mail'], ['phone', '連絡電話'],
  ['emergency_name', '緊急聯絡人'], ['emergency_relation', '與緊急聯絡人的關係'], ['emergency_phone', '緊急聯絡電話'],
  ['room_type', '想預定的房型'], ['guests', '入住人數'], ['checkin', '入住日期'], ['checkout', '退房日期'],
  ['vehicle_plate', '車牌號碼（選填）'], ['ack_phone', '已記下聯絡電話'],
  ['agree_price', '已了解價格與付款方式'], ['privacy_consent', '同意個人資料使用說明'],
  ['application_id', '申請編號']
];

/** Work-exchange application fields. */
var WORK_FIELDS = [
  ['name_en', '英文姓名'], ['name_zh', '中文姓名'], ['birthday', '出生日期'], ['age', '年齡'], ['gender', '性別'],
  ['country', '國家'], ['passport', '護照號碼'], ['email', 'E-mail'], ['phone', '連絡電話'], ['address', '居住地址'],
  ['emergency_name', '緊急聯絡人'], ['emergency_relation', '與緊急聯絡人的關係'], ['emergency_phone', '緊急聯絡電話'],
  ['stay_length', '申請換宿時間'], ['start_date', '希望換宿日期'], ['end_date', '結束日期'],
  ['blog_fb', '部落格或FB'], ['photo_url', '本人照片'], ['languages', '會說的語言'],
  ['has_license', '國際認可駕照'], ['vehicle_plate', '車牌號碼（選填）'], ['interests', '興趣'],
  ['health_ok', '身心狀況良好'], ['health_detail', '狀況說明(若填無)'],
  ['has_exchange_exp', '類似換宿經驗'], ['exchange_exp_detail', '經驗簡述'],
  ['education', '學歷'], ['work_exp', '工作經驗'], ['self_intro', '自我介紹'],
  ['agree_rules', '同意換宿章則'], ['agree_work', '了解工作內容'], ['agree_responsible', '願意負責內容'],
  ['remark', '備註'], ['privacy_consent', '同意個人資料使用說明'], ['application_id', '申請編號']
];

/** Standalone services. Several services can be selected in one application. */
var SERVICE_FIELDS = [
  ['name_en', '英文姓名'], ['name_zh', '中文姓名'], ['country', '國家'], ['email', 'E-mail'], ['phone', '連絡電話'],
  ['services', '申請服務'], ['service_start', '寄放開始日期'], ['service_end', '寄放結束日期'],
  ['luggage_count', '行李件數'], ['vehicle_plate', '車牌號碼'], ['vehicle_details', '車輛說明'],
  ['pickup_route', '接機-國際/國內'], ['pickup_airline', '接機-航空'], ['pickup_from', '接機-出發地點'],
  ['pickup_flight', '接機-班機號碼'], ['pickup_date', '接機-抵達日期'], ['pickup_time', '接機-抵達時間'], ['pickup_pax', '接機-人數'],
  ['dropoff_route', '送機-國際/國內'], ['dropoff_airline', '送機-航空'], ['dropoff_date', '送機-起飛日期'],
  ['dropoff_time', '送機-起飛時間'], ['dropoff_pax', '送機-人數'],
  ['city_dir', '市區接送-方向'], ['city_date', '市區接送-日期'], ['city_time', '市區接送-時間'],
  ['city_place', '市區接送-地點'], ['city_pax', '市區接送-人數'],
  ['remark', '備註'], ['privacy_consent', '同意個人資料使用說明'], ['application_id', '申請編號']
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

function sheetSafeValue_(value) {
  if (typeof value === 'string' && /^[=+\-@]/.test(value.trim())) return "'" + value;
  return value;
}

function buildResponseRow(fields, get, timestamp, flag) {
  return [timestamp].concat(fields.map(function (f) { return sheetSafeValue_(get(f[0])); })).concat([sheetSafeValue_(flag)]);
}

function scheduleDates_(type, get) {
  if (type === 'accommodation') return { start: get('checkin'), end: get('checkout') };
  if (type === 'workexchange') return { start: get('start_date'), end: get('end_date') };

  var selected = String(get('services') || '').split(/\s*\/\s*/);
  var dates = [];
  if (selected.indexOf('寄放行李') >= 0 || selected.indexOf('寄放車輛') >= 0) {
    dates.push(get('service_start'), get('service_end'));
  }
  if (selected.indexOf('接機') >= 0) dates.push(get('pickup_date'));
  if (selected.indexOf('送機') >= 0) dates.push(get('dropoff_date'));
  if (selected.indexOf('市區接送') >= 0) dates.push(get('city_date'));
  dates = dates
    .map(function (value) { return String(value || '').trim(); })
    .filter(function (value) { return value; })
    .sort();
  return { start: dates[0] || '', end: dates[dates.length - 1] || '' };
}

function scheduleDetails_(type, get) {
  function joined(values) {
    return values.map(function (value) { return String(value || '').trim(); }).filter(Boolean).join(' ');
  }
  if (type === 'accommodation') {
    return joined([get('room_type'), get('guests') ? get('guests') + ' 人' : '']);
  }
  if (type === 'workexchange') {
    return joined([get('stay_length'), get('languages'), get('has_license')]);
  }

  var selected = String(get('services') || '').split(/\s*\/\s*/);
  var details = [];
  if (selected.indexOf('寄放行李') >= 0) details.push(joined(['行李', get('luggage_count') ? get('luggage_count') + ' 件' : '']));
  if (selected.indexOf('寄放車輛') >= 0) details.push(joined(['車輛', get('vehicle_plate'), get('vehicle_details')]));
  if (selected.indexOf('接機') >= 0) details.push(joined(['接機', get('pickup_flight'), get('pickup_date'), get('pickup_time'), get('pickup_pax') ? get('pickup_pax') + ' 人' : '']));
  if (selected.indexOf('送機') >= 0) details.push(joined(['送機', get('dropoff_airline'), get('dropoff_date'), get('dropoff_time'), get('dropoff_pax') ? get('dropoff_pax') + ' 人' : '']));
  if (selected.indexOf('市區接送') >= 0) details.push(joined(['市區接送', get('city_place'), get('city_date'), get('city_time'), get('city_pax') ? get('city_pax') + ' 人' : '']));
  return details.filter(Boolean).join('；');
}

function buildScheduleEntry(type, get, timestamp, flag, id) {
  var dates = scheduleDates_(type, get);
  var label = type === 'workexchange' ? '換宿申請' : (type === 'services' ? '其他服務' : '住宿申請');
  var items = type === 'accommodation' ? (get('room_type') || '住宿')
    : (type === 'workexchange' ? '打工換宿' : (get('services') || '其他服務'));

  return {
    id: id,
    submitted_at: timestamp,
    start_date: dates.start,
    end_date: dates.end,
    type: label,
    items: items,
    applicant: applicantName_(get),
    email: get('email'),
    phone: get('phone'),
    vehicle_plate: get('vehicle_plate'),
    details: scheduleDetails_(type, get),
    photo_url: type === 'workexchange' ? get('photo_url') : '',
    status: '新申請',
    flag: flag
  };
}

function compareScheduleEntries(a, b) {
  var aDate = String(a.start_date || '9999-12-31');
  var bDate = String(b.start_date || '9999-12-31');
  if (aDate !== bDate) return aDate < bDate ? -1 : 1;
  return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
}

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
  if (type === 'workexchange') return '換宿申請 Work Exchange';
  if (type === 'services') return '其他服務 Other Services';
  return '住宿申請 Accommodation';
}

function applicantName_(get) {
  return get('name_zh') || get('name_en') || get('email') || '(未具名)';
}

function singleLine_(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function cellText_(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function buildEmailSubject(type, get, flag) {
  var sanitizedFlag = singleLine_(flag);
  var suffix = sanitizedFlag ? '（' + sanitizedFlag + '）' : '';
  return '【彩虹星民宿】新' + typeLabel_(type) + ' - ' + singleLine_(applicantName_(get)) + suffix;
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

var LIST_NAMES = ['rules', 'duties_out', 'duties_in'];

function groupLists(rows) {
  var grouped = { rules: [], duties_out: [], duties_in: [] };

  (rows || []).forEach(function (row) {
    var listName = String(row.list || '').trim();
    if (LIST_NAMES.indexOf(listName) < 0) return;

    var zh = cellText_(row.text_zh);
    var en = cellText_(row.text_en);
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
    var zh = cellText_(item.zh);
    var en = cellText_(item.en);
    if (!zh && !en) return;
    rows.push([listName, rows.length + 1, zh, en]);
  });
  return rows;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    splitUrls: splitUrls,
    joinUrls: joinUrls,
    settingValue: settingValue,
    pickRow: pickRow,
    ACCOM_FIELDS: ACCOM_FIELDS,
    WORK_FIELDS: WORK_FIELDS,
    SERVICE_FIELDS: SERVICE_FIELDS,
    joinMultiValue: joinMultiValue,
    buildHeaderRow: buildHeaderRow,
    headerNeedsUpdate: headerNeedsUpdate,
    buildResponseRow: buildResponseRow,
    sheetSafeValue_: sheetSafeValue_,
    buildScheduleEntry: buildScheduleEntry,
    scheduleDetails_: scheduleDetails_,
    compareScheduleEntries: compareScheduleEntries,
    checkSuspicious: checkSuspicious,
    isValidEmail: isValidEmail,
    buildEmailSubject: buildEmailSubject,
    buildEmailBody: buildEmailBody,
    LIST_NAMES: LIST_NAMES,
    groupLists: groupLists,
    listRowsFrom: listRowsFrom
  };
}
