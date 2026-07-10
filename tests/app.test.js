'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../site/app.js');

/** A stand-in element exposing just the surface applyStyleShim touches. */
function fakeElement(attributes, inlineStyle) {
  const declared = Object.assign({}, inlineStyle);
  const handlers = {};
  return {
    applied: declared,
    getAttribute: (name) => (name in attributes ? attributes[name] : null),
    addEventListener: (type, fn) => { (handlers[type] = handlers[type] || []).push(fn); },
    fire: (type) => (handlers[type] || []).forEach((fn) => fn()),
    style: {
      setProperty: (prop, value) => { declared[prop] = value; },
      getPropertyValue: (prop) => (prop in declared ? declared[prop] : ''),
      removeProperty: (prop) => { delete declared[prop]; }
    }
  };
}

function fakeRoot(bySelector) {
  return { querySelectorAll: (selector) => bySelector[selector] || [] };
}

test('parseStyleText splits declarations into property/value pairs', () => {
  assert.deepEqual(app.parseStyleText('background:#f1ebdd;color:#1f6b40'), [
    ['background', '#f1ebdd'],
    ['color', '#1f6b40']
  ]);
});

test('parseStyleText tolerates spacing, a trailing semicolon and empty input', () => {
  assert.deepEqual(app.parseStyleText(' transform : translateY(-2px) ; '), [['transform', 'translateY(-2px)']]);
  assert.deepEqual(app.parseStyleText(''), []);
  assert.deepEqual(app.parseStyleText(null), []);
});

test('parseStyleText keeps colons inside a value, as in box-shadow and rgba', () => {
  assert.deepEqual(app.parseStyleText('box-shadow:0 0 0 3px rgba(47,143,87,.14)'), [
    ['box-shadow', '0 0 0 3px rgba(47,143,87,.14)']
  ]);
});

test('parseStyleText drops malformed chunks that carry no colon', () => {
  assert.deepEqual(app.parseStyleText('color:red;garbage;'), [['color', 'red']]);
});

test('applyStyleShim applies hover styles on mouseenter', () => {
  const el = fakeElement({ 'style-hover': 'background:#f1ebdd' }, {});
  app.applyStyleShim(fakeRoot({ '[style-hover]': [el] }));

  el.fire('mouseenter');
  assert.equal(el.applied.background, '#f1ebdd');
});

test('applyStyleShim restores the original inline value on mouseleave', () => {
  const el = fakeElement({ 'style-hover': 'background:#f1ebdd' }, { background: 'transparent' });
  app.applyStyleShim(fakeRoot({ '[style-hover]': [el] }));

  el.fire('mouseenter');
  assert.equal(el.applied.background, '#f1ebdd');
  el.fire('mouseleave');
  assert.equal(el.applied.background, 'transparent');
});

test('applyStyleShim removes a property that had no original inline value', () => {
  const el = fakeElement({ 'style-hover': 'transform:translateY(-2px)' }, {});
  app.applyStyleShim(fakeRoot({ '[style-hover]': [el] }));

  el.fire('mouseenter');
  assert.equal(el.applied.transform, 'translateY(-2px)');
  el.fire('mouseleave');
  assert.equal('transform' in el.applied, false);
});

test('applyStyleShim binds focus and blur for style-focus', () => {
  const el = fakeElement({ 'style-focus': 'border-color:#2f8f57' }, { 'border-color': '#e4dccb' });
  app.applyStyleShim(fakeRoot({ '[style-focus]': [el] }));

  el.fire('focus');
  assert.equal(el.applied['border-color'], '#2f8f57');
  el.fire('blur');
  assert.equal(el.applied['border-color'], '#e4dccb');
});

test('applyStyleShim ignores an element whose shim attribute is empty', () => {
  const el = fakeElement({ 'style-hover': '' }, {});
  app.applyStyleShim(fakeRoot({ '[style-hover]': [el] }));
  assert.doesNotThrow(() => el.fire('mouseenter'));
});
