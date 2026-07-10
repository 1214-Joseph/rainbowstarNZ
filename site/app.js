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

  // <default-lists:begin> generated by scripts/build-defaults.js — do not edit by hand
  var DEFAULT_LISTS = {
    rules: [
      { zh: "換宿時間：換宿期間至少兩星期，每天工作 3 小時（有一定的工作量），工作時間為早上 10:00 到中午 13:00；若有特殊情況時間會調整，工作量較多時會增加時數，擇日補休。", en: "Duration: a minimum of 2 weeks, 3 hours of work per day (with a set workload), from 10:00 to 13:00. Hours may be adjusted for special situations; if the workload is heavier, extra hours are added and made up with time off another day." },
      { zh: "休假：做五休二。", en: "Days off: five days on, two days off." },
      { zh: "換宿志工來到農場第一天為住宿（須付費），這是為了讓志工調整好心情，為接下來的工作做準備。", en: "Your first day at the farm is a paid stay, so you can settle in and prepare for the work ahead." },
      { zh: "換宿志工若臨時更改行程，請於七日前通知我們；因為行程更改我們也需要時間調度人員，請大家體諒與遵守。", en: "If you change your schedule, please tell us at least 7 days in advance, as we need time to rearrange staffing. Thank you for understanding." },
      { zh: "每位換宿志工都需一同維護公共區域的整潔，物品用完請歸回原位。", en: "Every volunteer helps keep shared areas tidy; please return items to where you found them." },
      { zh: "尊重他人隱私；非公用物品請勿使用。", en: "Respect others' privacy; do not use items that are not communal." },
      { zh: "換宿志工若當天身體不適，請馬上通知我們。", en: "If you feel unwell on a given day, please tell us immediately." },
      { zh: "對工作內容不清楚，或不確定工具的使用方式，請立即詢問，以免發生意外。", en: "If you are unsure about a task or how to use a tool, ask right away to avoid accidents." },
      { zh: "工作時需注意個人安全；若因對工作內容不清楚、未經同意擅自使用工具、或不正確使用工具所導致的傷害，農場將不負任何責任。", en: "Always mind your personal safety. The farm is not responsible for injuries caused by not understanding the task, using tools without our permission, or using tools incorrectly." },
      { zh: "有任何問題請與我們當面溝通，勿請他人代為傳話，以免造成雙方誤解。", en: "Please discuss any issues with us face to face; do not pass messages through others, to avoid misunderstandings." },
      { zh: "維護農場安全，當日工具使用完後務必歸位；離開前詳細檢查是否有危險物品遺留（如鐵釘、鐵絲、鋤頭、工具）。", en: "Keep the farm safe: always return tools after use, and check before leaving that no hazardous items are left behind (nails, wire, hoes, tools)." },
      { zh: "最後清潔：離開前請整理好自己的地方（包括床鋪的換洗），請勿遺留任何私人物品與垃圾。", en: "Final cleanup: before leaving, tidy your space (including washing bed linens) and do not leave any personal items or trash." },
      { zh: "換宿志工若因使用不當造成任何工具或物品的損壞，我們有權要求賠償；若對農場人員有任何不禮貌，我們將保留法律追訴權。", en: "If improper use damages tools or property, we may ask for compensation; for any disrespect toward farm staff, we reserve the right to take legal action." },
      { zh: "若違反換宿章則與住宿生活公約，我們會口頭告知，屢勸不聽我們有權要求志工八小時內離開農場。", en: "If you break the rules or house guidelines, we will give a verbal warning; if ignored repeatedly, we may ask the volunteer to leave the farm within 8 hours." },
      { zh: "請詳讀換宿章則與工作內容，仔細衡量自己的狀況，確定自己可以勝任此工作，並同意且願意遵守我們的生活公約與工作內容，再進行報名。", en: "Please read the rules and job content carefully, assess your own situation, make sure you can handle the work, and agree to follow our house guidelines and duties before applying." },
      { zh: "換宿志工入住時請提供護照影本一份；換宿工作需自備口罩與手套。", en: "Please provide a copy of your passport on arrival; bring your own mask and gloves for the work." }
    ],
    duties_out: [
      { zh: "花園整理（種花、除草、修剪樹枝）", en: "Garden care (planting flowers, weeding, pruning branches)" },
      { zh: "菜園整理（翻土、種菜、澆水、拔雜草）", en: "Vegetable garden (tilling, planting, watering, weeding)" },
      { zh: "餵貓", en: "Feeding the cats" },
      { zh: "農場建設", en: "Farm construction" },
      { zh: "每星期四將垃圾桶拉出，隔日再拉回。", en: "Take the bins out every Thursday and bring them back the next day." }
    ],
    duties_in: [
      { zh: "房屋內外清潔（房間、走廊、廁所、衛浴、客廳、餐廳、洗衣間、門口內外、庭院）", en: "Cleaning inside and out (rooms, hallway, toilet, bathroom, living room, dining room, laundry, entrance, yard)" },
      { zh: "維持公共區域的整潔", en: "Keeping shared areas tidy" }
    ]
  };
  // <default-lists:end>

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

  function applyHeroPhotos(urls) { void urls; }
  function applySceneryPhotos(settings) { void settings; }
  function renderRooms(rooms, lang) { void rooms; void lang; }

  return {
    parseStyleText: parseStyleText,
    applyStyleShim: applyStyleShim,
    boot: boot,
    state: state,
    splitUrls: splitUrls,
    settingValue: settingValue,
    pickRow: pickRow,
    escapeHtml: escapeHtml,
    applyContent: applyContent,
    loadContent: loadContent,
    DEFAULT_LISTS: DEFAULT_LISTS,
    listItemsFor: listItemsFor,
    renderList: renderList,
    renderAllLists: renderAllLists,
    applyLang: applyLang,
    toggleLang: toggleLang,
    updateNav: updateNav,
    toggleMenu: toggleMenu
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Rainbowstar;
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', Rainbowstar.boot);
