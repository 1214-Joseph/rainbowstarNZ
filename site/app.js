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

  return {
    parseStyleText: parseStyleText,
    applyStyleShim: applyStyleShim,
    boot: boot
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Rainbowstar;
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', Rainbowstar.boot);
