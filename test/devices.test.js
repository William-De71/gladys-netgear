// The traps of the Gladys core that the fake Gladys does not catch
// (community feedback, thread 11005): a device is only polled with
// should_poll AND poll_frequency, every feature needs min / max / read_only /
// has_feedback, a wrong category / type pair shows no icon nor label, and a
// single invalid field rejects the whole discovery batch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

import {
  buildRouterDevice,
  buildRouterStates,
  buildSettingsDevice,
  buildSettingsStates,
  buildClientDevice,
  idFromExternalId,
  featureKeyOf,
  clientName,
  macId,
  macOf,
} from '../src/device.js';
import { TOGGLES } from '../src/operations.js';
import { LANGUAGES } from '../src/i18n.js';
import { fakeGladys, PHONE_MAC } from './helpers/fixtures.js';

const ALL = [
  'system',
  'traffic',
  'speed_test',
  'access',
  ...Object.keys(TOGGLES).map((key) => `toggle:${key}`),
];
const router = { identity: { model: 'R7000', firmware: '1.0.11.134', hardware: 'R7000' } };
const client = { mac: PHONE_MAC, name: 'Pixel-8' };

/**
 * @description Every device, in a language, with every capability.
 * @param {string} language - The language.
 * @returns {Array<object>} The devices.
 */
const devices = (language) => [
  buildRouterDevice(fakeGladys, router, ALL, language),
  buildSettingsDevice(fakeGladys, router, ALL, language),
  buildClientDevice(fakeGladys, client, true, language),
];

// DEVICE_FEATURE_UNITS_BY_CATEGORY of the Gladys core (server/utils/constants.js,
// v5.2.1), for the categories used here.
const UNITS = {
  'level-sensor': [DEVICE_FEATURE_UNITS.PERCENT],
  data: [DEVICE_FEATURE_UNITS.MEGABYTE, DEVICE_FEATURE_UNITS.GIGABYTE],
  datarate: [DEVICE_FEATURE_UNITS.MEGABITS_PER_SECOND],
  duration: [DEVICE_FEATURE_UNITS.MILLISECONDS, DEVICE_FEATURE_UNITS.DAYS],
};
// Pairs with an icon in the Gladys front (front/src/utils/consts.js, v5.2.1).
const PAIRS = [
  [DEVICE_FEATURE_CATEGORIES.LEVEL_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.DECIMAL],
  [DEVICE_FEATURE_CATEGORIES.DATA, DEVICE_FEATURE_TYPES.DATA.SIZE],
  [DEVICE_FEATURE_CATEGORIES.DATARATE, DEVICE_FEATURE_TYPES.DATARATE.RATE],
  [DEVICE_FEATURE_CATEGORIES.DURATION, DEVICE_FEATURE_TYPES.DURATION.DECIMAL],
  [DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.INTEGER],
  [DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT],
  [DEVICE_FEATURE_CATEGORIES.SWITCH, DEVICE_FEATURE_TYPES.SWITCH.BINARY],
  [DEVICE_FEATURE_CATEGORIES.PRESENCE_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.PUSH],
];

test('devices are never polled by Gladys: the integration has its own timer', () => {
  for (const device of devices('en')) {
    assert.equal(device.should_poll, false, device.external_id);
    assert.equal(device.poll_frequency, undefined);
  }
});

test('every feature carries min, max, read_only and has_feedback, in every language', () => {
  for (const language of LANGUAGES) {
    for (const device of devices(language)) {
      for (const feature of device.features) {
        for (const key of ['min', 'max']) {
          assert.equal(typeof feature[key], 'number', `${feature.external_id}.${key}`);
        }
        assert.ok(feature.min <= feature.max, feature.external_id);
        assert.equal(typeof feature.read_only, 'boolean', feature.external_id);
        assert.equal(typeof feature.has_feedback, 'boolean', feature.external_id);
        assert.ok(feature.name, feature.external_id);
      }
    }
  }
});

test('every category / type pair has an icon in Gladys, every unit belongs to its category', () => {
  for (const device of devices('en')) {
    for (const feature of device.features) {
      assert.ok(
        PAIRS.some(([category, type]) => feature.category === category && feature.type === type),
        `${feature.external_id}: ${feature.category} / ${feature.type}`,
      );
      if (feature.unit) {
        assert.ok(
          UNITS[feature.category]?.includes(feature.unit),
          `${feature.external_id}: ${feature.unit}`,
        );
      }
    }
  }
});

test('only the switches are commands', () => {
  for (const device of devices('en')) {
    for (const feature of device.features) {
      const command = feature.category === DEVICE_FEATURE_CATEGORIES.SWITCH;
      assert.equal(feature.read_only, !command, feature.external_id);
      assert.equal(feature.has_feedback, command, feature.external_id);
    }
  }
});

test('names tell the devices and the features apart', () => {
  assert.deepEqual(
    devices('fr').map((device) => device.name),
    ['NETGEAR R7000', 'Réglages NETGEAR R7000', 'Pixel-8'],
  );
  assert.equal(clientName({ mac: PHONE_MAC, name: null }), PHONE_MAC);
  for (const language of LANGUAGES) {
    for (const device of devices(language)) {
      const names = device.features.map((feature) => feature.name);
      assert.equal(new Set(names).size, names.length, `${device.external_id} ${language}`);
    }
  }
});

test('features follow what the router answers', () => {
  const bare = buildRouterDevice(fakeGladys, null, [], 'en');
  assert.equal(bare.name, 'NETGEAR Router');
  assert.deepEqual(
    bare.features.map((feature) => feature.external_id.split(':').pop()),
    ['internet', 'wan_ip', 'clients', 'firmware'],
  );
  assert.equal(buildSettingsDevice(fakeGladys, router, ['system'], 'en'), null);
  const one = buildSettingsDevice(fakeGladys, router, ['toggle:guest_wifi_5g'], 'en');
  assert.deepEqual(
    one.features.map((f) => f.name),
    ['Guest Wi-Fi 5 GHz'],
  );
  assert.equal(buildClientDevice(fakeGladys, client, false, 'en').features.length, 1);
});

test('external ids are built on stable platform ids and read back', () => {
  const ids = devices('en').map((device) => device.external_id);
  assert.deepEqual(ids, [
    'ext:netgear:router:main',
    'ext:netgear:settings:main',
    'ext:netgear:client:10683faaaaaa',
  ]);
  assert.equal(idFromExternalId(`${ids[2]}:presence`, 'client'), '10683faaaaaa');
  assert.equal(idFromExternalId(`${ids[1]}:qos`, 'settings'), 'main');
  assert.equal(idFromExternalId(ids[1], 'client'), null);
  assert.equal(featureKeyOf(`${ids[1]}:guest_wifi_2g`), 'guest_wifi_2g');
  assert.equal(macOf(macId(PHONE_MAC)), PHONE_MAC);
});

test('unknown values are not published; texts follow the language', () => {
  const states = buildRouterStates(
    fakeGladys,
    {
      cpu: 12.5,
      memory: null,
      traffic: { todayDown: 3250.754, todayUp: null },
      wan: { status: 'connected', ip: '90.12.34.56' },
      identity: { firmware: '1.0.11.134' },
    },
    'fr',
  );
  const id = (key) => `ext:netgear:router:main:${key}`;
  assert.deepEqual(states, [
    { device_feature_external_id: id('cpu'), state: 12.5 },
    { device_feature_external_id: id('download_today'), state: 3250.75 },
    { device_feature_external_id: id('internet'), text: 'Connecté' },
    { device_feature_external_id: id('wan_ip'), text: '90.12.34.56' },
    { device_feature_external_id: id('firmware'), text: '1.0.11.134' },
  ]);
  assert.deepEqual(buildSettingsStates(fakeGladys, { qos: true, guest_wifi_2g: null, x: true }), [
    { device_feature_external_id: 'ext:netgear:settings:main:qos', state: 1 },
  ]);
});
