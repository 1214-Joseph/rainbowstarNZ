'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../apps-script/lib.js');

test('splitUrls splits on newline, comma and pipe', () => {
  assert.deepEqual(lib.splitUrls('a.jpg,b.jpg'), ['a.jpg', 'b.jpg']);
  assert.deepEqual(lib.splitUrls('a.jpg\nb.jpg'), ['a.jpg', 'b.jpg']);
  assert.deepEqual(lib.splitUrls('a.jpg|b.jpg'), ['a.jpg', 'b.jpg']);
});

test('splitUrls trims whitespace and drops duplicates and blanks', () => {
  assert.deepEqual(lib.splitUrls('  a.jpg , \n b.jpg |a.jpg,,'), ['a.jpg', 'b.jpg']);
});

test('splitUrls returns an empty array for empty, null and undefined', () => {
  assert.deepEqual(lib.splitUrls(''), []);
  assert.deepEqual(lib.splitUrls(null), []);
  assert.deepEqual(lib.splitUrls(undefined), []);
});

test('joinUrls joins with newlines and tolerates an empty array', () => {
  assert.equal(lib.joinUrls(['a', 'b']), 'a\nb');
  assert.equal(lib.joinUrls([]), '');
});
