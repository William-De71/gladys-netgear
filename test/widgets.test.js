// Every widget content through validateWidgetContent (the checks of the core,
// which only run in debug mode in production) and the content budget of a
// card, in the four languages and in the edge cases.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  buildOverviewWidget,
  buildTrafficWidget,
  buildNetworkWidget,
  readTrafficSettings,
  readNetworkSettings,
  formatVolume,
  guestWifi,
  messageContent,
} from '../src/widgets.js';
import { LANGUAGES } from '../src/i18n.js';
import { NOW, MINUTE, PHONE_MAC, NAS_MAC, TV_MAC } from './helpers/fixtures.js';

const types = (content) => content.components.map((component) => component.type);

/**
 * @description Assert a content is valid and within the budget of a card.
 * @param {object} content - The content.
 * @param {string} label - For the messages.
 */
function assertValid(content, label) {
  assert.deepEqual(validateWidgetContent(content), [], label);
  const count = (list) => types(content).filter((type) => list.includes(type)).length;
  assert.ok(content.components.length <= 8, label);
  assert.ok(count(['value', 'gauge']) <= 6, label);
  assert.ok(count(['chart', 'card-list', 'image']) <= 1, label);
  assert.ok(count(['text']) <= 2, label);
  assert.ok(count(['status']) <= 1, label);
  assert.ok(count(['button']) <= 4, label);
  assert.ok(content.ttl_seconds >= 10 && content.ttl_seconds <= 3600, label);
  for (const component of content.components) {
    for (const item of component.items ?? []) {
      if (component.type === 'status') {
        assert.ok(item.value, `${label}: a status row without value is dropped`);
      }
    }
  }
}

const router = {
  identity: { model: 'R7000', firmware: '1.0.11.134_10.2.120' },
  lan: { ip: '192.168.1.1' },
  cpu: 23.5,
  memory: 77.5,
  traffic: { todayDown: 3250.75, todayUp: 512.4, monthDown: 152400, monthUp: 9800.2 },
  wan: { status: 'connected', ip: '90.12.34.56', link: true },
  clientsOnline: 17,
  toggles: { guest_wifi_2g: true, guest_wifi_5g: false, traffic_meter: true },
  firmware: { available: true, latest: '1.0.11.140', current: '1.0.11.134' },
  speedTest: { down: 512.3, up: 98.7, ping: 12, at: NOW - 5 * MINUTE },
};
const clients = [
  {
    mac: PHONE_MAC,
    name: 'Phone of Alex',
    ip: '192.168.1.23',
    present: true,
    connection: '5g',
    ssid: 'Home_5G',
    signal: 83,
    linkRate: 866,
    access: true,
    lastSeen: NOW,
  },
  {
    mac: NAS_MAC,
    name: 'nas',
    ip: '192.168.1.10',
    present: true,
    connection: 'wired',
    signal: 100,
    linkRate: null,
    access: true,
    lastSeen: NOW,
  },
  {
    mac: TV_MAC,
    name: null,
    ip: '192.168.1.40',
    present: false,
    connection: '2g',
    access: false,
    lastSeen: NOW - 30 * MINUTE,
  },
];
const feature = (key) => `ext:netgear:router:main:${key}`;

test('overview: gauges, tiles, status, buttons, in every language', () => {
  for (const language of LANGUAGES) {
    const content = buildOverviewWidget({
      router,
      language,
      now: NOW,
      fetchedAt: NOW - MINUTE,
      pollSeconds: 30,
    });
    assertValid(content, `overview ${language}`);
    assert.deepEqual(types(content), [
      'text',
      'gauge',
      'gauge',
      'value',
      'status',
      'button',
      'button',
    ]);
    const buttons = content.components.filter((c) => c.type === 'button');
    assert.ok(
      buttons.every((b) => b.label.length <= 24),
      language,
    );
    assert.equal(buttons[1].action.confirm, true);
  }
  const fr = buildOverviewWidget({
    router,
    language: 'fr',
    now: NOW,
    fetchedAt: NOW,
    pollSeconds: 30,
  });
  assert.equal(fr.components[0].text, 'R7000 · 192.168.1.1 · à l’instant');
  const rows = fr.components.find((c) => c.type === 'status').items;
  assert.deepEqual(
    rows.map((row) => row.value),
    ['Connecté', '90.12.34.56', '2,4 GHz activé · 5 GHz désactivé', 'Mise à jour 1.0.11.140'],
  );
});

test('overview: unknown values make no gauge nor guest row', () => {
  const content = buildOverviewWidget({
    router: { ...router, cpu: null, memory: null, toggles: {}, wan: null, firmware: null },
    language: 'en',
    now: NOW,
    fetchedAt: NOW,
    pollSeconds: 30,
  });
  assertValid(content, 'bare overview');
  assert.ok(!types(content).includes('gauge'));
  assert.deepEqual(
    content.components.find((c) => c.type === 'status').items.map((row) => row.label),
    ['Internet', 'Firmware'],
  );
});

test('traffic: four tiles, the chart once the router device exists, the speed test', () => {
  for (const language of LANGUAGES) {
    const content = buildTrafficWidget({
      router,
      language,
      now: NOW,
      pollSeconds: 30,
      featureId: feature,
    });
    assertValid(content, `traffic ${language}`);
    assert.deepEqual(types(content), [
      'text',
      'value',
      'value',
      'value',
      'value',
      'chart',
      'status',
      'button',
    ]);
    assert.ok(content.components.at(-1).label.length <= 24, language);
  }
  const en = buildTrafficWidget({ router, language: 'en', now: NOW, pollSeconds: 30 });
  assert.ok(!types(en).includes('chart'), 'no chart without the device');
  assert.deepEqual(
    en.components.filter((c) => c.type === 'value').map((c) => [c.value, c.unit]),
    [
      ['3.3', 'GB'],
      ['512', 'MB'],
      ['152.4', 'GB'],
      ['9.8', 'GB'],
    ],
  );
  assert.deepEqual(
    en.components.find((c) => c.type === 'status').items.map((row) => row.value),
    ['512.3 Mbit/s', '98.7 Mbit/s', '12 ms · 5 min ago'],
  );
  const none = buildTrafficWidget({
    router: { ...router, traffic: null, speedTest: null },
    language: 'fr',
    now: NOW,
    pollSeconds: 30,
  });
  assertValid(none, 'traffic without meter');
  assert.match(none.components[0].text, /compteur de trafic/);
});

test('network: present, absent, all, empty; connection and blocked badges', () => {
  for (const language of LANGUAGES) {
    for (const show of ['present', 'absent', 'all']) {
      const content = buildNetworkWidget({ clients, language, now: NOW, pollSeconds: 30, show });
      assertValid(content, `network ${show} ${language}`);
    }
  }
  const all = buildNetworkWidget({
    clients,
    language: 'en',
    now: NOW,
    pollSeconds: 30,
    show: 'all',
    created: new Set([PHONE_MAC]),
  });
  const items = all.components[1].items;
  assert.deepEqual(
    items.map((item) => [item.title, item.badge.text, item.badge.color]),
    [
      ['nas', 'Wired', 'info'],
      ['Phone of Alex', '5 GHz', 'success'],
      [TV_MAC, 'Blocked', 'danger'],
    ],
  );
  assert.equal(items[1].subtitle, '192.168.1.23 · Home_5G · signal 83 % · 866 Mbit/s');
  assert.equal(items[2].subtitle, '192.168.1.40 · 30 min ago');
  const empty = buildNetworkWidget({ clients: [], language: 'de', now: NOW, pollSeconds: 30 });
  assertValid(empty, 'empty');
  assert.equal(types(empty).join(), 'text,text');
});

test('helpers', () => {
  assert.deepEqual(formatVolume(null, 'en'), { value: '–', unit: 'MB' });
  assert.deepEqual(formatVolume(999, 'en'), { value: '999', unit: 'MB' });
  assert.deepEqual(formatVolume(25350.1, 'fr'), { value: '25,4', unit: 'Go' });
  assert.deepEqual(formatVolume(2500000, 'de'), { value: '2,5', unit: 'TB' });
  assert.equal(guestWifi({}, 'en'), null);
  assert.equal(readTrafficSettings({ interval: 'forever' }).interval, 'last-day');
  assert.equal(readNetworkSettings({ show: 'absent' }).show, 'absent');
  assertValid(messageContent('x'.repeat(500)), 'message');
});
