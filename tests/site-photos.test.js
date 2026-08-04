'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../site/app');

function photoElement() {
  const element = {
    style: {},
    children: [],
    onclick: null,
    className: '',
    classList: {
      contains(name) { return element.className.split(/\s+/).includes(name); }
    },
    setAttribute(name, value) {
      if (name === 'class') this.className = value;
      else this[name] = value;
    },
    appendChild(child) { this.children.push(child); return child; },
    querySelector(selector) {
      if (selector === '.rbzoom') return this.children.find((child) => child.className === 'rbzoom') || null;
      return null;
    }
  };
  return element;
}

function withPhotoDom(elements, callback) {
  const previousDocument = global.document;
  const previousComputedStyle = global.getComputedStyle;
  global.document = {
    getElementById(id) { return elements[id] || null; },
    querySelector(selector) { return elements[selector] || null; },
    createElement() { return photoElement(); }
  };
  global.getComputedStyle = () => ({ position: 'static' });
  try { callback(); }
  finally {
    global.document = previousDocument;
    global.getComputedStyle = previousComputedStyle;
  }
}

test('empty hero photo stays a quiet non-interactive placeholder', () => {
  const hero = photoElement();
  const placeholder = photoElement();

  withPhotoDom({ heroPhoto: hero, heroPhotoPh: placeholder }, () => app.applyHeroPhotos([]));

  assert.equal(hero.onclick, null);
  assert.notEqual(hero.style.cursor, 'zoom-in');
  assert.equal(hero.querySelector('.rbzoom'), null);
  assert.notEqual(placeholder.style.display, 'none');
});

test('empty scenery tiles do not show zoom controls or open an empty lightbox', () => {
  const tiles = [photoElement(), photoElement(), photoElement()];
  const elements = {};
  tiles.forEach((tile, index) => { elements[`#nearby [data-scenery="${index + 1}"]`] = tile; });

  withPhotoDom(elements, () => app.applySceneryPhotos({}));

  for (const tile of tiles) {
    assert.equal(tile.onclick, null);
    assert.notEqual(tile.style.cursor, 'zoom-in');
    assert.equal(tile.querySelector('.rbzoom'), null);
  }
});

test('uploaded public photos remain zoomable', () => {
  const hero = photoElement();
  const placeholder = photoElement();
  const scenery = photoElement();
  const elements = {
    heroPhoto: hero,
    heroPhotoPh: placeholder,
    '#nearby [data-scenery="1"]': scenery
  };

  withPhotoDom(elements, () => {
    app.applyHeroPhotos(['https://example.com/hero.jpg']);
    app.applySceneryPhotos({ scenery1_photos: 'https://example.com/view.jpg' });
  });

  assert.equal(hero.style.cursor, 'zoom-in');
  assert.ok(hero.querySelector('.rbzoom'));
  assert.equal(placeholder.style.display, 'none');
  assert.equal(scenery.style.cursor, 'zoom-in');
  assert.ok(scenery.querySelector('.rbzoom'));
});

test('a room without uploaded photos has no fake slides or lightbox action', () => {
  const host = photoElement();

  withPhotoDom({}, () => {
    const slides = app.roomSlides({ photos: '' });
    assert.deepEqual(slides, []);
    app.setupPhotoHost(host, slides, {});
  });

  assert.equal(host.onclick, null);
  assert.notEqual(host.style.cursor, 'zoom-in');
  assert.equal(host.querySelector('.rbzoom'), null);
  assert.equal(host.children.length, 1, 'the empty room photo keeps one quiet icon');
});
