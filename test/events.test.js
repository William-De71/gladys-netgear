// Scene payloads against the manifest and the limits of the core: flat data,
// at most 30 keys, scalar values, strings of at most 1,000 characters, every
// declared variable present; outputs exactly the declared ones.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  TRIGGERS,
  internetEvent,
  presenceEvent,
  newClientEvent,
  wanIpEvent,
  firmwareEvent,
  statusOutputs,
  firmwareOutputs,
  speedTestOutputs,
} from '../src/events.js';
import { LANGUAGES } from '../src/i18n.js';
import { fakeGladys, PHONE_MAC, NAS_MAC } from './helpers/fixtures.js';

const manifest = JSON.parse(
  readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const triggers = new Map(manifest.scene_triggers.map((trigger) => [trigger.key, trigger]));
const actions = new Map(manifest.scene_actions.map((action) => [action.key, action]));

const phone = {
  mac: PHONE_MAC,
  name: 'Phone of Alex',
  ip: '192.168.1.23',
  connection: '5g',
  ssid: 'Home_5G',
};
const nas = { mac: NAS_MAC, name: null, ip: null, connection: 'wired' };
const router = {
  identity: { model: 'R7000', firmware: '1.0.11.134' },
  cpu: 23.5,
  memory: 77.5,
  traffic: { todayDown: 3250.75, todayUp: 512.4, monthDown: 152400, monthUp: 9800.2 },
  wan: { status: 'connected', ip: '90.12.34.56' },
  toggles: { guest_wifi_2g: false, guest_wifi_5g: true },
  firmware: { available: true, latest: '1.0.11.140', current: '1.0.11.134' },
};

/**
 * @description One event of every trigger, in a language.
 * @param {string} language - The language.
 * @returns {Array<object>} The events.
 */
const events = (language) => [
  internetEvent({ status: 'disconnected', previous: 'connected' }, { ip: null }, language),
  internetEvent({ status: 'connected', previous: 'disconnected' }, router.wan, language),
  presenceEvent(fakeGladys, { client: phone, event: 'arrived' }, language),
  presenceEvent(fakeGladys, { client: nas, event: 'left' }, language),
  newClientEvent({ client: phone }, language),
  newClientEvent({ client: { mac: NAS_MAC, connection: null } }, language),
  wanIpEvent({ previous: '90.12.34.56', current: '90.12.34.99' }, language),
  firmwareEvent(router.firmware, language),
];

test('every trigger of the manifest has a builder, and back', () => {
  assert.deepEqual(
    [...new Set(events('en').map((event) => event.key))].sort(),
    Object.values(TRIGGERS).sort(),
  );
});

test('event data is flat, bounded, and carries every variable and filter field', () => {
  for (const language of LANGUAGES) {
    for (const { key, data } of events(language)) {
      const trigger = triggers.get(key);
      assert.ok(Object.keys(data).length <= 30, key);
      for (const [name, value] of Object.entries(data)) {
        assert.ok(
          value === null || ['string', 'number', 'boolean'].includes(typeof value),
          `${key}.${name}`,
        );
        if (typeof value === 'string') {
          assert.ok(value.length <= 1000, `${key}.${name}`);
        }
        if (typeof value === 'number') {
          assert.ok(Number.isFinite(value), `${key}.${name}`);
        }
      }
      for (const variable of trigger.variables) {
        assert.ok(variable.key in data, `${key}: variable ${variable.key}`);
      }
      for (const field of trigger.fields ?? []) {
        assert.ok(field.key in data, `${key}: field ${field.key}`);
      }
    }
  }
});

test('the filter values sent are among the options of the manifest', () => {
  for (const { key, data } of events('en')) {
    for (const field of triggers.get(key).fields ?? []) {
      if (field.options && data[field.key] !== 'unknown') {
        const values = field.options.map((option) => option.value);
        assert.ok(values.includes(data[field.key]), `${key}.${field.key}: ${data[field.key]}`);
      }
    }
  }
  assert.equal(
    presenceEvent(fakeGladys, { client: phone, event: 'left' }, 'en').data.device,
    'ext:netgear:client:10683faaaaaa',
  );
});

test('summaries in the language asked', () => {
  const [down, back, arrived, left, fresh, bare, wanIp, firmware] = events('fr');
  assert.equal(down.data.summary, 'La connexion Internet du routeur est coupée.');
  assert.equal(back.data.summary, 'La connexion Internet est rétablie (IP 90.12.34.56).');
  assert.equal(arrived.data.summary, 'Phone of Alex est connecté au réseau.');
  assert.equal(arrived.data.connection, 'Wi-Fi 5 GHz');
  assert.equal(left.data.summary, `${NAS_MAC} a quitté le réseau.`);
  assert.equal(
    fresh.data.summary,
    'Nouvel appareil sur le réseau : Phone of Alex (192.168.1.23, Wi-Fi 5 GHz).',
  );
  assert.equal(fresh.data.ssid, 'Home_5G');
  assert.equal(fresh.data.medium, 'wifi');
  assert.equal(bare.data.medium, 'unknown');
  assert.equal(
    wanIp.data.summary,
    'L’adresse IP publique a changé : 90.12.34.99 (avant : 90.12.34.56).',
  );
  assert.equal(
    firmware.data.summary,
    'Une mise à jour du micrologiciel est disponible (1.0.11.140).',
  );
});

test('scene action outputs: exactly the declared ones, scalars, -1 when unknown', () => {
  const check = (key, outputs) => {
    const declared = actions.get(key).outputs;
    assert.deepEqual(Object.keys(outputs).sort(), declared.map((output) => output.key).sort(), key);
    for (const { key: name, type } of declared) {
      assert.equal(typeof outputs[name], type, `${key}.${name}`);
      if (type === 'string') {
        assert.ok(outputs[name].length <= 10000);
      }
    }
  };
  const clients = [{ present: true }, { present: true }, { present: false }];
  const status = statusOutputs({ router, clients }, 'en');
  check('get_status', status);
  assert.equal(status.devices_present, 2);
  assert.equal(status.guest_wifi, true);
  assert.equal(
    status.summary,
    'Router: CPU 24 %, memory 78 %. Internet connected (90.12.34.56). 2 device(s) on the network. Today: 3,251 MB down, 512 MB up. A firmware update is available (1.0.11.140).',
  );
  const unknown = statusOutputs({ router: null, clients: [] }, 'de');
  check('get_status', unknown);
  assert.equal(unknown.cpu, -1);
  assert.equal(unknown.internet, 'unknown');
  check('check_updates', firmwareOutputs(router.firmware, 'es'));
  check('check_updates', firmwareOutputs(null, 'es'));
  const speed = speedTestOutputs({ down: 512.3, up: 98.7, ping: null }, 'fr');
  check('run_speed_test', speed);
  assert.equal(speed.ping, -1);
  assert.equal(speed.summary, '↓ 512,3 · ↑ 98,7 Mbit/s · ? ms');
});
