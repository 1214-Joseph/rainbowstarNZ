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

  function applyHeroPhotos(urls) { void urls; }
  function applySceneryPhotos(settings) { void settings; }
  function renderRooms(rooms, lang) { void rooms; void lang; }
  function renderAllLists(data, lang) { void data; void lang; }

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
    loadContent: loadContent
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Rainbowstar;
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', Rainbowstar.boot);
