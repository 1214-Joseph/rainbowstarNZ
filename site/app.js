/**
 * Rainbowstar public site behaviour.
 *
 * Loaded as a plain <script src>, so it must not use modules. The export block
 * at the bottom is guarded so Node can unit-test the pure helpers while the
 * browser simply ignores it.
 */
'use strict';

var Rainbowstar = (function () {

  /** Flip to 'opaque' only if Task 21 proves the response is unreadable cross-origin. */
  var SUBMIT_MODE = 'readable';

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

  /**
   * Single-value settings with no _en counterpart (the admin shows them as one
   * field). Looking these up as English would come back undefined and leave the
   * markup's stale built-in text on an EN-mode page load.
   */
  var UNTRANSLATABLE_CONTENT = { site_name: true, contact_email: true, contact_line: true };

  /** settingValue, except untranslatable keys resolve in every language. */
  function contentValue(settings, key, lang) {
    return settingValue(settings, key, UNTRANSLATABLE_CONTENT[key] ? 'zh' : lang);
  }

  function applyContent(data, lang) {
    state.data = data;
    var settings = (data && data.settings) || {};

    Array.prototype.forEach.call(document.querySelectorAll('[data-content]'), function (el) {
      var value = contentValue(settings, el.getAttribute('data-content'), lang);
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

    if (hasField(form, 'checkin')) {
      var checkinVal = fieldValue(form, 'checkin');
      if (!checkinVal) bad('checkin', '請選擇入住日期', 'Please choose a check-in date');
    }
    if (hasField(form, 'checkout')) {
      var checkoutVal = fieldValue(form, 'checkout');
      if (!checkoutVal) bad('checkout', '請選擇退房日期', 'Please choose a check-out date');
    }
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
    if (hasField(form, 'start_date')) {
      var startVal = fieldValue(form, 'start_date');
      if (!startVal) bad('start_date', '請選擇開始日期', 'Please choose a start date');
    }
    if (hasField(form, 'end_date')) {
      var endVal = fieldValue(form, 'end_date');
      if (!endVal) bad('end_date', '請選擇結束日期', 'Please choose an end date');
    }
    if (hasField(form, 'start_date') && hasField(form, 'end_date')) {
      var start = fieldValue(form, 'start_date');
      var end = fieldValue(form, 'end_date');
      if (start && end && end < start) bad('end_date', '結束日期不可早於開始日期', 'End date cannot be before start date');
    }
    if (hasField(form, 'birthday')) {
      var birthday = fieldValue(form, 'birthday');
      if (!birthday) {
        bad('birthday', '請輸入出生日期', 'Please enter your date of birth');
      } else {
        var born = new Date(birthday);
        var years = (Date.now() - born.getTime()) / 31557600000;
        if (born > new Date() || years > 120) bad('birthday', '出生日期不正確', 'Date of birth is invalid');
      }
    }
    return errors;
  }

  function buildFormBody(form) {
    if (typeof HTMLFormElement === 'undefined' || !(form instanceof HTMLFormElement)) return new URLSearchParams();
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

  return {
    parseStyleText: parseStyleText,
    applyStyleShim: applyStyleShim,
    boot: boot,
    state: state,
    splitUrls: splitUrls,
    settingValue: settingValue,
    pickRow: pickRow,
    escapeHtml: escapeHtml,
    contentValue: contentValue,
    applyContent: applyContent,
    loadContent: loadContent,
    DEFAULT_LISTS: DEFAULT_LISTS,
    listItemsFor: listItemsFor,
    renderList: renderList,
    renderAllLists: renderAllLists,
    applyLang: applyLang,
    toggleLang: toggleLang,
    updateNav: updateNav,
    toggleMenu: toggleMenu,
    DEFAULT_ROOMS: DEFAULT_ROOMS,
    roomsToRender: roomsToRender,
    collectPhotos: collectPhotos,
    roomPrice: roomPrice,
    buildCarousel: buildCarousel,
    openLightbox: openLightbox,
    closeLightbox: closeLightbox,
    renderRooms: renderRooms,
    applyHeroPhotos: applyHeroPhotos,
    applySceneryPhotos: applySceneryPhotos,
    SUBMIT_MODE: SUBMIT_MODE,
    validate: validate,
    buildFormBody: buildFormBody,
    submitForm: submitForm,
    attachSubmit: attachSubmit,
    setType: setType,
    toggleAddon: toggleAddon
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Rainbowstar;
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', Rainbowstar.boot);
