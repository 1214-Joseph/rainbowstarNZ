'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const site = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');

function formMarkup(id) {
  const match = site.match(new RegExp(`<form id="${id}"[\\s\\S]*?<\\/form>`));
  assert.ok(match, `missing ${id}`);
  return match[0];
}

test('online applications offer accommodation, work exchange, and other services as separate forms', () => {
  for (const id of ['seg-stay', 'seg-work', 'seg-services', 'formStay', 'formWork', 'formServices']) {
    assert.match(site, new RegExp(`id="${id}"`), `missing ${id}`);
  }
  assert.match(formMarkup('formServices'), /name="type" value="services"/);
});

test('accommodation asks for emergency contacts and an optional plate, with services removed', () => {
  const form = formMarkup('formStay');
  for (const name of ['emergency_name', 'emergency_relation', 'emergency_phone', 'vehicle_plate']) {
    assert.match(form, new RegExp(`name="${name}"`), `missing ${name}`);
  }
  assert.doesNotMatch(form, /name="addons"|加購早餐|加購午餐|加購晚餐|接機|送機|市區接送|寄放行李/);
  assert.doesNotMatch(form, /Passport 號碼/);
});

test('work exchange asks for passport, optional plate, and one required applicant photo file', () => {
  const form = formMarkup('formWork');
  assert.match(form, /name="passport"/);
  assert.match(form, /name="vehicle_plate"/);
  assert.match(form, /type="file"[^>]*name="applicant_photo"[^>]*required/);
  assert.doesNotMatch(form, /name="photo_url"/);
});

test('other services can be selected together and reveal service-specific fields', () => {
  const form = formMarkup('formServices');
  for (const value of ['寄放行李', '寄放車輛', '接機', '送機', '市區接送']) {
    assert.match(form, new RegExp(`name="services" value="${value}"`), `missing ${value}`);
  }
  for (const detail of ['service_start', 'service_end', 'luggage_count', 'vehicle_plate', 'pickup_date', 'dropoff_date', 'city_date']) {
    assert.match(form, new RegExp(`name="${detail}"`), `missing ${detail}`);
  }
});

test('all requested date ranges use the shared Airbnb-style calendar control', () => {
  for (const pair of [['checkin', 'checkout'], ['start_date', 'end_date'], ['service_start', 'service_end']]) {
    assert.match(site, new RegExp(`class="[^"]*rb-date-range[^"]*"[^>]*data-start="${pair[0]}"[^>]*data-end="${pair[1]}"`));
  }
});

test('the work-exchange section has a dedicated room gallery and every form carries privacy consent', () => {
  assert.match(site, /id="work-rooms-list"/);
  for (const id of ['formStay', 'formWork', 'formServices']) {
    assert.match(formMarkup(id), /name="privacy_consent"[^>]*required/, `${id} has no privacy consent`);
  }
});

test('application forms keep browser-native required-field validation enabled', () => {
  for (const id of ['formStay', 'formWork', 'formServices']) {
    assert.doesNotMatch(formMarkup(id), /\snovalidate(?:\s|>)/, `${id} disables native validation`);
  }
});
