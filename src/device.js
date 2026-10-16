// -----------------------------------------------------------------------------
// The devices of the NETGEAR integration, offered on the Discovery screen.
//
// Category / type pairs come from DEVICE_FEATURE_CATEGORIES of the SDK, with
// an icon and a unit list in the Gladys front (front/src/utils/consts.js,
// server/utils/constants.js of Gladys 5.2.1). Gladys has no CPU nor memory
// category: `level-sensor` / `decimal` in % is its plain numeric level, the
// name of each feature tells them apart.
//
// One router, "NETGEAR <model>" (each group only when the router answers it):
//   - cpu, memory             level-sensor / decimal, %      (GetSystemInfo)
//   - download_today,         data / size, MB                (traffic meter)
//     upload_today,
//     download_month,
//     upload_month
//   - speedtest_download,     datarate / rate, Mbit/s        (speed test)
//     speedtest_upload
//   - speedtest_ping          duration / decimal, ms
//   - internet                text / text (connected, connecting, disconnected)
//   - wan_ip                  text / text
//   - clients                 counter-sensor / integer: clients connected now
//   - firmware                text / text
// One "NETGEAR <model> settings" device, the settings the router can switch:
//   - guest_wifi_2g, guest_wifi_5g, access_control, traffic_meter,
//     parental_control, qos, smart_connect      switch / binary, commands
// One device per client of the network, "<client name>":
//   - presence                presence-sensor / push, as the Bluetooth presence
//                             of Gladys: 1 while it is listed, 0 once it left
//   - access                  switch / binary, a command: allowed (1) or
//                             blocked (0) by the access control of the router
//                             (only when the router reports it)
//
// External ids: the router and the settings device are "main" (one router
// per integration), a client its MAC address without separators. Never a
// name. The router is read on the integration's own timer (one round for all
// devices), so `should_poll` is false.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { TOGGLES } from './operations.js';
import { t } from './i18n.js';

const DEVICE_TYPES = { ROUTER: 'router', SETTINGS: 'settings', CLIENT: 'client' };
const ROUTER_ID = 'main';
// Fastest internet link of a NETGEAR router (10 Gbit/s), in Mbit/s.
const MAX_RATE_MBPS = 10000;
// A month of a 10 Gbit/s line, in MB.
const MAX_TRAFFIC_MB = 100000000;

const sensor = { read_only: true, has_feedback: false, keep_history: true };
const text = {
  category: CATEGORIES.TEXT,
  type: TYPES.TEXT.TEXT,
  read_only: true,
  has_feedback: false,
  keep_history: false,
  min: 0,
  max: 0,
};
const percent = {
  ...sensor,
  category: CATEGORIES.LEVEL_SENSOR,
  type: TYPES.SENSOR.DECIMAL,
  unit: UNITS.PERCENT,
  min: 0,
  max: 100,
};
const traffic = {
  ...sensor,
  category: CATEGORIES.DATA,
  type: TYPES.DATA.SIZE,
  unit: UNITS.MEGABYTE,
  min: 0,
  max: MAX_TRAFFIC_MB,
};
const rate = {
  ...sensor,
  category: CATEGORIES.DATARATE,
  type: TYPES.DATARATE.RATE,
  unit: UNITS.MEGABITS_PER_SECOND,
  min: 0,
  max: MAX_RATE_MBPS,
};
const command = {
  category: CATEGORIES.SWITCH,
  type: TYPES.SWITCH.BINARY,
  read_only: false,
  has_feedback: true,
  keep_history: true,
  min: 0,
  max: 1,
};

const INTERNET_STATUSES = ['connected', 'connecting', 'disconnected'];
const round2 = (value) => (typeof value === 'number' ? Math.round(value * 100) / 100 : null);

// The features of the router: key, name (TEXTS key), the capability that
// brings it (watcher.capabilities()), shape, and the state of a snapshot (a
// number, `{ text }`, or null when unknown: not published).
const ROUTER_FEATURES = [
  { key: 'cpu', name: 'featureCpu', needs: 'system', shape: percent, state: (s) => s.cpu },
  { key: 'memory', name: 'featureMemory', needs: 'system', shape: percent, state: (s) => s.memory },
  ...[
    ['download_today', 'todayDown'],
    ['upload_today', 'todayUp'],
    ['download_month', 'monthDown'],
    ['upload_month', 'monthUp'],
  ].map(([key, field]) => ({
    key,
    name: `feature_${key}`,
    needs: 'traffic',
    shape: traffic,
    state: (s) => round2(s.traffic?.[field] ?? null),
  })),
  {
    key: 'speedtest_download',
    name: 'featureSpeedDown',
    needs: 'speed_test',
    shape: rate,
    state: (s) => round2(s.speedTest?.down ?? null),
  },
  {
    key: 'speedtest_upload',
    name: 'featureSpeedUp',
    needs: 'speed_test',
    shape: rate,
    state: (s) => round2(s.speedTest?.up ?? null),
  },
  {
    key: 'speedtest_ping',
    name: 'featurePing',
    needs: 'speed_test',
    shape: {
      ...sensor,
      category: CATEGORIES.DURATION,
      type: TYPES.DURATION.DECIMAL,
      unit: UNITS.MILLISECONDS,
      min: 0,
      max: 10000,
    },
    state: (s) => round2(s.speedTest?.ping ?? null),
  },
  {
    key: 'internet',
    name: 'featureInternet',
    shape: text,
    state: (s, language) =>
      INTERNET_STATUSES.includes(s.wan?.status)
        ? { text: t(`internet_${s.wan.status}`, language) }
        : null,
  },
  {
    key: 'wan_ip',
    name: 'featureWanIp',
    shape: text,
    state: (s) => (s.wan?.ip ? { text: s.wan.ip } : null),
  },
  {
    key: 'clients',
    name: 'featureClients',
    shape: {
      ...sensor,
      category: CATEGORIES.COUNTER_SENSOR,
      type: TYPES.SENSOR.INTEGER,
      min: 0,
      max: 10000,
    },
    state: (s) => s.clientsOnline ?? null,
  },
  {
    key: 'firmware',
    name: 'featureFirmware',
    shape: text,
    state: (s) => (s.identity?.firmware ? { text: s.identity.firmware } : null),
  },
];

/**
 * @description The external ids of a device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} type - A DEVICE_TYPES value.
 * @param {string} id - The platform id (see macId for a client).
 * @returns {{ device: string, feature: Function }} The ids.
 * @example
 * idsOf(gladys, 'router', 'main').device; // -> 'ext:netgear:router:main'
 */
function idsOf(gladys, type, id) {
  return gladys.externalIds(type, id);
}

/**
 * @description The platform id of a client: its MAC address without separators.
 * @param {string} mac - 'aa:bb:cc:dd:ee:ff'.
 * @returns {string} 'aabbccddeeff'.
 */
const macId = (mac) => mac.replace(/:/g, '');

/**
 * @description The MAC address of a client id.
 * @param {string} id - 'aabbccddeeff'.
 * @returns {string} 'aa:bb:cc:dd:ee:ff'.
 */
const macOf = (id) => id.match(/../g).join(':');

const ID_PATTERNS = {
  [DEVICE_TYPES.ROUTER]: '[a-z]+',
  [DEVICE_TYPES.SETTINGS]: '[a-z]+',
  [DEVICE_TYPES.CLIENT]: '[0-9a-f]{12}',
};

/**
 * @description The platform id a device (or feature) external id stands for.
 * @param {unknown} externalId - The external id.
 * @param {string} type - A DEVICE_TYPES value.
 * @returns {string|null} The id.
 * @example
 * idFromExternalId('ext:netgear:client:aabbccddeeff:presence', 'client'); // -> 'aabbccddeeff'
 */
function idFromExternalId(externalId, type) {
  const match = new RegExp(`:${type}:(${ID_PATTERNS[type]})(?::[a-z0-9_]+)?$`).exec(
    String(externalId ?? ''),
  );
  return match ? match[1] : null;
}

/**
 * @description The feature key of a feature external id.
 * @param {unknown} externalId - `ext:netgear:settings:main:qos`.
 * @returns {string|null} `qos`.
 */
function featureKeyOf(externalId) {
  const match = /:([a-z0-9_]+)$/.exec(String(externalId ?? ''));
  return match ? match[1] : null;
}

/**
 * @description The features of the router, given what it answers.
 * @param {Set<string>|string[]} capabilities - watcher.capabilities().
 * @returns {Array<object>} The specs.
 */
const routerSpecs = (capabilities = []) => {
  const set = new Set(capabilities);
  return ROUTER_FEATURES.filter((spec) => !spec.needs || set.has(spec.needs));
};

/**
 * @description The settings the router can switch, in TOGGLES order.
 * @param {Set<string>|string[]} capabilities - watcher.capabilities().
 * @returns {string[]} The TOGGLES keys.
 */
const toggleKeys = (capabilities = []) => {
  const set = new Set(capabilities);
  return Object.keys(TOGGLES).filter((key) => set.has(`toggle:${key}`));
};

/**
 * @description The name of the router device.
 * @param {object|null} identity - readIdentity.
 * @param {string} language - The language.
 * @returns {string} "NETGEAR R7000".
 */
const routerName = (identity, language) =>
  t('routerDeviceName', language, { model: identity?.model ?? 'Router' });

/**
 * @description The router device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} router - The router snapshot (watcher.router()).
 * @param {Set<string>|string[]} capabilities - watcher.capabilities().
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 * @example
 * buildRouterDevice(gladys, { identity: { model: 'R7000' } }, ['system'], 'fr');
 */
function buildRouterDevice(gladys, router, capabilities, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.ROUTER, ROUTER_ID);
  const identity = router?.identity ?? null;
  return {
    name: routerName(identity, language),
    external_id: ids.device,
    model: identity?.model ?? 'NETGEAR',
    should_poll: false,
    params: [
      ...(identity?.firmware ? [{ name: 'FIRMWARE', value: identity.firmware }] : []),
      ...(identity?.hardware ? [{ name: 'HARDWARE', value: identity.hardware }] : []),
    ],
    features: routerSpecs(capabilities).map((spec) => ({
      name: t(spec.name, language),
      external_id: ids.feature(spec.key),
      ...spec.shape,
    })),
  };
}

/**
 * @description The states of the router.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} router - The router snapshot.
 * @param {string} language - Language of the texts.
 * @returns {Array<object>} The states.
 */
function buildRouterStates(gladys, router, language) {
  const ids = idsOf(gladys, DEVICE_TYPES.ROUTER, ROUTER_ID);
  return ROUTER_FEATURES.flatMap((spec) => {
    const value = spec.state(router, language);
    if (value === null || value === undefined) {
      return [];
    }
    const id = ids.feature(spec.key);
    return [
      typeof value === 'object'
        ? { device_feature_external_id: id, text: value.text }
        : { device_feature_external_id: id, state: value },
    ];
  });
}

/**
 * @description The device of the settings the router can switch; null when
 * it answers none of them.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} router - The router snapshot.
 * @param {Set<string>|string[]} capabilities - watcher.capabilities().
 * @param {string} [language] - Language of the names.
 * @returns {object|null} The discovered device.
 */
function buildSettingsDevice(gladys, router, capabilities, language = 'en') {
  const keys = toggleKeys(capabilities);
  if (keys.length === 0) {
    return null;
  }
  const ids = idsOf(gladys, DEVICE_TYPES.SETTINGS, ROUTER_ID);
  return {
    name: t('settingsDeviceName', language, { model: router?.identity?.model ?? 'Router' }),
    external_id: ids.device,
    model: router?.identity?.model ?? 'NETGEAR',
    should_poll: false,
    params: [],
    features: keys.map((key) => ({
      name: t(`toggle_${key}`, language),
      external_id: ids.feature(key),
      ...command,
    })),
  };
}

/**
 * @description The states of the settings device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} toggles - `{ key: boolean }`.
 * @returns {Array<object>} The states.
 */
function buildSettingsStates(gladys, toggles = {}) {
  const ids = idsOf(gladys, DEVICE_TYPES.SETTINGS, ROUTER_ID);
  return Object.entries(toggles)
    .filter(([key, value]) => TOGGLES[key] && typeof value === 'boolean')
    .map(([key, value]) => ({
      device_feature_external_id: ids.feature(key),
      state: value ? 1 : 0,
    }));
}

/**
 * @description The name of a client: its name on the router, else its MAC.
 * @param {object} client - The client snapshot.
 * @returns {string} The name.
 */
const clientName = (client) => client.name || client.mac;

/**
 * @description The device of a client of the network.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} client - The client snapshot.
 * @param {boolean} withAccess - Whether the router reports the access control.
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildClientDevice(gladys, client, withAccess, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.CLIENT, macId(client.mac));
  return {
    name: clientName(client),
    external_id: ids.device,
    should_poll: false,
    params: [{ name: 'MAC', value: client.mac }],
    features: [
      {
        name: t('featurePresence', language),
        external_id: ids.feature('presence'),
        category: CATEGORIES.PRESENCE_SENSOR,
        type: TYPES.SENSOR.PUSH,
        read_only: true,
        has_feedback: false,
        keep_history: true,
        min: 0,
        max: 1,
      },
      ...(withAccess
        ? [{ name: t('featureAccess', language), external_id: ids.feature('access'), ...command }]
        : []),
    ],
  };
}

const presenceFeatureId = (gladys, mac) =>
  idsOf(gladys, DEVICE_TYPES.CLIENT, macId(mac)).feature('presence');
const accessFeatureId = (gladys, mac) =>
  idsOf(gladys, DEVICE_TYPES.CLIENT, macId(mac)).feature('access');

export {
  DEVICE_TYPES,
  ROUTER_ID,
  ROUTER_FEATURES,
  INTERNET_STATUSES,
  idsOf,
  macId,
  macOf,
  idFromExternalId,
  featureKeyOf,
  routerSpecs,
  toggleKeys,
  routerName,
  clientName,
  buildRouterDevice,
  buildRouterStates,
  buildSettingsDevice,
  buildSettingsStates,
  buildClientDevice,
  presenceFeatureId,
  accessFeatureId,
};
