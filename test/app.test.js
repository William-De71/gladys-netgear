// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices and the states like the host API does, and a fake NETGEAR router.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, SCENE_ACTIONS, ACTIONS } from '../src/app.js';
import { WIDGETS, WIDGET_ACTIONS } from '../src/widgets.js';
import { TRIGGERS } from '../src/events.js';
import {
  netgearRouter,
  silent,
  recordingLogger,
  knownPath,
  NOW,
  PASSWORD,
  PHONE_MAC,
  NAS_MAC,
  TV_MAC,
  SERIAL,
} from './helpers/fixtures.js';

const CONFIG = { host: '192.168.1.1', username: 'admin', password: PASSWORD };
const PREFIX = 'ext:test-integration';
const ROUTER = `${PREFIX}:router:main`;
const SETTINGS = `${PREFIX}:settings:main`;
const PHONE = `${PREFIX}:client:${PHONE_MAC.replace(/:/g, '')}`;
const NAS = `${PREFIX}:client:${NAS_MAC.replace(/:/g, '')}`;
const TV = `${PREFIX}:client:${TV_MAC.replace(/:/g, '')}`;

/**
 * @description The integration, connected to a fake Gladys and a fake router.
 * @param {object} [options] - `{ config, fake, path, logger }`.
 * @returns {Promise<object>} `{ gladys, app, fake, clock, path }`.
 */
async function startApp({
  config = CONFIG,
  fake = netgearRouter(),
  path = knownPath(),
  logger = silent,
} = {}) {
  const clock = { now: NOW };
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, {
    request: fake,
    knownHostsPath: path,
    now: () => clock.now,
    sleep: async (ms) => {
      clock.now += ms;
    },
    logger,
  });
  await gladys.connect();
  return { gladys, app, fake, clock, path };
}

const created = async (gladys, externalId) => {
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  assert.ok(device, `${externalId} is offered`);
  await gladys.fake.deviceCreated(device);
  return device;
};
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);
const featureOf = (device, key) => device.features.find((f) => f.external_id.endsWith(`:${key}`));

/**
 * @description The next reading, `seconds` later.
 * @param {object} context - `{ app, clock }`.
 * @param {number} seconds - Seconds to move the clock.
 * @returns {Promise<void>}
 */
async function nextRound({ app, clock }, seconds = 30) {
  clock.now += seconds * 1000;
  await app.watcher.round();
}

test('the router, its settings and the named clients are offered, accepted by the host API checks', async (t) => {
  const { gladys, fake } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const ids = gladys.fake.discoveredDevices.map((device) => device.external_id);
  // Clients with a name only (default): the phone and the NAS, not the TV.
  assert.deepEqual(ids, [ROUTER, SETTINGS, PHONE, NAS]);
  assert.ok(gladys.fake.discoveredDevices.every((device) => device.should_poll === false));
  const [router, settings, phone] = gladys.fake.discoveredDevices;
  assert.equal(router.name, 'NETGEAR R7000');
  assert.deepEqual(
    router.features.map((f) => f.external_id.split(':').pop()),
    [
      'cpu',
      'memory',
      'download_today',
      'upload_today',
      'download_month',
      'upload_month',
      'speedtest_download',
      'speedtest_upload',
      'speedtest_ping',
      'internet',
      'wan_ip',
      'clients',
      'firmware',
    ],
  );
  // Parental control and Smart Connect are not answered by this model.
  assert.deepEqual(
    settings.features.map((f) => f.external_id.split(':').pop()),
    ['guest_wifi_2g', 'guest_wifi_5g', 'access_control', 'traffic_meter', 'qos'],
  );
  assert.deepEqual(
    phone.features.map((f) => f.external_id.split(':').pop()),
    ['presence', 'access'],
  );
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(
    gladys.fake.connectionStatus.message.fr,
    'R7000 : Internet connecté, 3 appareil(s) sur le réseau.',
  );
  assert.equal(gladys.fake.states.length, 0, 'nothing before a device exists');
  assert.equal(gladys.fake.sceneEvents.length, 0, 'the first reading is a baseline');
  assert.equal(fake.logins, 1, 'one session for every request');
  assert.ok(fake.calls.every((call) => !call.url.includes('se<cr>et')));
});

test('a model without CPU, traffic meter nor speed test offers no such feature', async (t) => {
  const fake = netgearRouter({ system: null, traffic: null, features: {} });
  const { gladys } = await startApp({ fake });
  t.after(() => gladys.fake.shutdown());
  const router = gladys.fake.discoveredDevices[0];
  assert.deepEqual(
    router.features.map((f) => f.external_id.split(':').pop()),
    ['internet', 'wan_ip', 'clients', 'firmware'],
  );
});

test('creating the router publishes its states', async (t) => {
  const context = await startApp();
  const { gladys } = context;
  t.after(() => gladys.fake.shutdown());
  await created(gladys, ROUTER);
  assert.equal(gladys.fake.lastState(`${ROUTER}:cpu`), 12);
  assert.equal(gladys.fake.lastState(`${ROUTER}:memory`), 41);
  assert.equal(gladys.fake.lastState(`${ROUTER}:download_today`), 3250.75);
  assert.equal(gladys.fake.lastState(`${ROUTER}:upload_month`), 9800.2);
  assert.equal(gladys.fake.lastState(`${ROUTER}:internet`), 'Connected');
  assert.equal(gladys.fake.lastState(`${ROUTER}:wan_ip`), '90.12.34.56');
  assert.equal(gladys.fake.lastState(`${ROUTER}:clients`), 3);
  assert.equal(gladys.fake.lastState(`${ROUTER}:firmware`), '1.0.11.134_10.2.120');
  assert.equal(gladys.fake.lastState(`${ROUTER}:speedtest_download`), undefined, 'not run yet');
  const count = gladys.fake.states.length;
  await nextRound(context);
  assert.equal(gladys.fake.states.length, count, 'only the changes are published');
});

test('internet down then back, and a new public address, fire one event per transition', async (t) => {
  const context = await startApp();
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  await created(gladys, ROUTER);
  fake.state.link = 'Down';
  fake.state.wanIp = '0.0.0.0';
  await nextRound(context);
  await nextRound(context);
  assert.equal(gladys.fake.lastState(`${ROUTER}:internet`), 'Disconnected');
  fake.state.link = 'Up';
  await nextRound(context);
  assert.equal(gladys.fake.lastState(`${ROUTER}:internet`), 'Connecting');
  fake.state.wanIp = '90.12.34.57';
  await nextRound(context);
  const events = eventsOf(gladys, TRIGGERS.INTERNET_STATUS_CHANGED);
  assert.deepEqual(
    events.map((event) => [event.data.status, event.data.previous_status, event.data.wan_ip]),
    [
      ['disconnected', 'connected', ''],
      ['connected', 'disconnected', '90.12.34.57'],
    ],
  );
  assert.equal(eventsOf(gladys, TRIGGERS.WAN_IP_CHANGED).length, 0, 'a drop is not a new address');
  fake.state.wanIp = '90.12.34.99';
  await nextRound(context);
  const [changed] = eventsOf(gladys, TRIGGERS.WAN_IP_CHANGED);
  assert.deepEqual(
    [changed.data.wan_ip, changed.data.previous_wan_ip],
    ['90.12.34.99', '90.12.34.57'],
  );
});

test('presence: arrived at once, left after the absence delay only', async (t) => {
  const context = await startApp();
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  await created(gladys, PHONE);
  assert.equal(gladys.fake.lastState(`${PHONE}:presence`), 1);
  assert.equal(gladys.fake.lastState(`${PHONE}:access`), 1);
  const phone = fake.state.clients.shift();
  await nextRound(context, 120);
  assert.equal(eventsOf(gladys, TRIGGERS.NETWORK_DEVICE_PRESENCE).length, 0, 'not yet');
  assert.equal(gladys.fake.lastState(`${PHONE}:presence`), 1);
  await nextRound(context, 240);
  const [left] = eventsOf(gladys, TRIGGERS.NETWORK_DEVICE_PRESENCE);
  assert.equal(left.data.event, 'left');
  assert.equal(left.data.device, PHONE);
  assert.equal(left.data.connection, 'Wi-Fi');
  assert.equal(gladys.fake.lastState(`${PHONE}:presence`), 0);
  fake.state.clients.unshift(phone);
  await nextRound(context);
  assert.equal(eventsOf(gladys, TRIGGERS.NETWORK_DEVICE_PRESENCE).at(-1).data.event, 'arrived');
  assert.equal(gladys.fake.lastState(`${PHONE}:presence`), 1);
});

test('a MAC address never met fires "new device", once, and not after a restart', async (t) => {
  const path = knownPath();
  const context = await startApp({ path });
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  fake.state.clients.push({
    mac: 'aa:bb:cc:00:11:22',
    ip: '192.168.1.42',
    name: 'Guest-Phone',
    type: 'wireless',
    band: '2.4GHz',
    linkRate: 144,
    signal: 70,
    allow: 'Allow',
    ssid: 'Home',
  });
  await nextRound(context);
  await nextRound(context);
  const events = eventsOf(gladys, TRIGGERS.NEW_NETWORK_DEVICE);
  assert.equal(events.length, 1);
  assert.equal(events[0].data.mac, 'aa:bb:cc:00:11:22');
  assert.equal(events[0].data.medium, 'wifi');
  assert.match(events[0].data.summary, /Guest-Phone/);
  const again = await startApp({ path, fake });
  t.after(() => again.gladys.fake.shutdown());
  await nextRound(again);
  assert.equal(eventsOf(again.gladys, TRIGGERS.NEW_NETWORK_DEVICE).length, 0);
});

test('the clients list in format 2 (Orbi): band and SSID, the other format as fallback', async (t) => {
  const fake = netgearRouter({ model: 'RBR50', attachedFormats: [2] });
  const { gladys, app } = await startApp({
    fake,
    config: { ...CONFIG, network_devices: 'all' },
  });
  t.after(() => gladys.fake.shutdown());
  assert.equal(app.ops.attachedVersion(), 2);
  const ids = gladys.fake.discoveredDevices.map((device) => device.external_id);
  assert.ok(ids.includes(TV), 'all clients offered');
  const phone = app.watcher.client(PHONE_MAC);
  assert.equal(phone.connection, '5g');
  assert.equal(phone.ssid, 'Home_5G');
  const tv = app.watcher.client(TV_MAC);
  assert.equal(tv.name, null);
  assert.equal(gladys.fake.discoveredDevices.find((d) => d.external_id === TV).name, TV_MAC);
});

test('settings: switching the guest Wi-Fi uses the method name this model knows', async (t) => {
  const context = await startApp();
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  const settings = await created(gladys, SETTINGS);
  assert.equal(gladys.fake.lastState(`${SETTINGS}:guest_wifi_5g`), 0);
  const ack = await gladys.fake.setValue(settings, featureOf(settings, 'guest_wifi_5g'), 1);
  assert.equal(ack.success, true, ack.error);
  assert.equal(fake.state.toggles.guest_wifi_5g, true);
  assert.equal(gladys.fake.lastState(`${SETTINGS}:guest_wifi_5g`), 1);
  // Framed by ConfigurationStarted / ConfigurationFinished, as the apps do.
  assert.ok(fake.state.configStarted >= 1);
  assert.equal(fake.state.configStarted, fake.state.configFinished);
  await gladys.fake.setValue(settings, featureOf(settings, 'qos'), 1);
  assert.equal(fake.state.toggles.qos, true);
});

test('network access: block then allow a client; refused while access control is off', async (t) => {
  const context = await startApp();
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  const phone = await created(gladys, PHONE);
  await gladys.fake.setValue(phone, featureOf(phone, 'access'), 0);
  assert.equal(fake.state.clients[0].allow, 'Block');
  assert.equal(gladys.fake.lastState(`${PHONE}:access`), 0);
  await gladys.fake.setValue(phone, featureOf(phone, 'access'), 1);
  assert.equal(fake.state.clients[0].allow, 'Allow');
  fake.state.toggles.access_control = false;
  await context.app.watcher.round({ slow: true });
  const refused = await gladys.fake.setValue(phone, featureOf(phone, 'access'), 0);
  assert.equal(refused.success, false);
  assert.match(String(refused.error), /access control/);
  assert.equal(fake.state.clients[0].allow, 'Allow');
});

test('a sensor feature is read-only', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const router = await created(gladys, ROUTER);
  const ack = await gladys.fake.setValue(router, featureOf(router, 'cpu'), 1);
  assert.equal(ack.success, false);
  assert.match(String(ack.error), /Read-only/);
});

test('scene action: run a speed test, the router device then carries its result', async (t) => {
  const context = await startApp();
  const { gladys } = context;
  t.after(() => gladys.fake.shutdown());
  await created(gladys, ROUTER);
  const ack = await gladys.fake.sceneAction(SCENE_ACTIONS.RUN_SPEED_TEST, {});
  assert.equal(ack.success, true, ack.error);
  const { outputs } = ack.data;
  assert.deepEqual(Object.keys(outputs).sort(), ['download', 'ping', 'summary', 'upload']);
  assert.equal(outputs.download, 512.3);
  assert.equal(outputs.upload, 98.7);
  assert.equal(outputs.ping, 12);
  assert.equal(gladys.fake.lastState(`${ROUTER}:speedtest_download`), 512.3);
});

test('scene actions: status, firmware check (no event), reboot', async (t) => {
  const context = await startApp();
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  const status = (await gladys.fake.sceneAction(SCENE_ACTIONS.GET_STATUS, {})).data.outputs;
  assert.equal(status.internet, 'connected');
  assert.equal(status.devices_present, 3);
  assert.equal(status.download_today, 3250.75);
  assert.equal(status.guest_wifi, false);
  assert.equal(status.update_available, false);
  assert.match(status.summary, /CPU 12 %/);
  fake.state.newFirmware = 'V1.0.11.140_10.2.121';
  const firmware = (await gladys.fake.sceneAction(SCENE_ACTIONS.CHECK_UPDATES, {})).data.outputs;
  assert.equal(firmware.update_available, true);
  assert.equal(firmware.new_version, '1.0.11.140_10.2.121');
  await nextRound(context);
  assert.equal(eventsOf(gladys, TRIGGERS.FIRMWARE_UPDATE_AVAILABLE).length, 0);
  const reboot = await gladys.fake.sceneAction(SCENE_ACTIONS.REBOOT, {});
  assert.equal(reboot.success, true, reboot.error);
  assert.equal(fake.state.rebooted, 1);
  // No ConfigurationFinished after a reboot: the router is gone.
  assert.equal(fake.state.configStarted - fake.state.configFinished, 1);
});

test('a firmware the router finds on its own check fires the trigger', async (t) => {
  const context = await startApp();
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  fake.state.newFirmware = 'V1.0.11.140_10.2.121';
  await nextRound(context, 6 * 3600);
  const [event] = eventsOf(gladys, TRIGGERS.FIRMWARE_UPDATE_AVAILABLE);
  assert.equal(event.data.new_version, '1.0.11.140_10.2.121');
});

test('widgets: valid contents in every language, buttons answer a toast', async (t) => {
  const context = await startApp();
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  await created(gladys, ROUTER);
  for (const language of ['en', 'fr', 'de', 'es']) {
    for (const key of Object.values(WIDGETS)) {
      const ack = await gladys.fake.widgetGet(key, { language, settings: {} });
      assert.equal(ack.success, true, `${key}: ${ack.error}`);
      assert.deepEqual(validateWidgetContent(ack.data.content), [], `${key} ${language}`);
    }
  }
  const traffic = await gladys.fake.widgetGet(WIDGETS.TRAFFIC, { language: 'en', settings: {} });
  assert.ok(
    traffic.data.content.components.some((c) => c.type === 'chart'),
    'chart once created',
  );
  const toast = await gladys.fake.widgetAction(WIDGETS.TRAFFIC, WIDGET_ACTIONS.SPEED_TEST);
  assert.match(toast.data.message.en, /512\.3/);
  const firmware = await gladys.fake.widgetAction(WIDGETS.OVERVIEW, WIDGET_ACTIONS.CHECK_UPDATES);
  assert.match(firmware.data.message.fr, /à jour/);
  const reboot = await gladys.fake.widgetAction(WIDGETS.OVERVIEW, WIDGET_ACTIONS.REBOOT);
  assert.match(reboot.data.message.en, /rebooting/);
  assert.equal(fake.state.rebooted, 1);
});

test('wrong password: an auth status, and no new login before 5 minutes', async (t) => {
  const fake = netgearRouter({ password: 'other' });
  const context = await startApp({ fake });
  const { gladys } = context;
  t.after(() => gladys.fake.shutdown());
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /refuses the user name or the password/);
  const logins = fake.logins;
  await nextRound(context, 60);
  assert.equal(fake.logins, logins, 'no attempt within the delay');
  await nextRound(context, 300);
  assert.ok(fake.logins > logins);
});

test('unreachable router and missing settings are reported', async (t) => {
  const fake = netgearRouter({ endpoint: { port: 1234, ssl: false } });
  const { gladys } = await startApp({ fake });
  t.after(() => gladys.fake.shutdown());
  assert.match(gladys.fake.connectionStatus.message.fr, /ne répond pas à 192\.168\.1\.1/);
  const empty = await startApp({ config: {} });
  t.after(() => empty.gladys.fake.shutdown());
  assert.match(empty.gladys.fake.connectionStatus.message.en, /Enter the address/);
});

test('configuration actions: test the connection, forget the devices', async (t) => {
  const fake = netgearRouter({ endpoint: { port: 80, ssl: false } });
  const { gladys } = await startApp({ fake });
  t.after(() => gladys.fake.shutdown());
  const tested = (await gladys.fake.action(ACTIONS.TEST_CONNECTION)).data.message;
  assert.equal(tested.en, 'Connected to NETGEAR R7000 (firmware 1.0.11.134_10.2.120) on port 80.');
  const forgotten = (await gladys.fake.action(ACTIONS.FORGET_DEVICES)).data.message;
  assert.match(forgotten.fr, /oubliés/);
});

test('diagnostic: written at the info level, without serial, MAC, names, SSID nor public IP', async (t) => {
  const logger = recordingLogger();
  const { gladys } = await startApp({ logger });
  t.after(() => gladys.fake.shutdown());
  const message = (await gladys.fake.action(ACTIONS.DIAGNOSTIC)).data.message;
  assert.match(message.en, /NETGEAR diagnostic/);
  const lines = logger.lines.filter(([, line]) => line.startsWith('NETGEAR diagnostic'));
  assert.equal(lines.length, 4);
  assert.ok(lines.every(([level]) => level === 'info'));
  const text = lines.map(([, line]) => line).join('\n');
  assert.match(text, /"model":"R7000"/);
  assert.match(text, /"clientList":"v1"/);
  for (const secret of [
    SERIAL,
    PHONE_MAC,
    NAS_MAC,
    'Pixel-8',
    'Home_5G',
    '90.12.34.56',
    PASSWORD,
  ]) {
    assert.ok(!text.includes(secret), secret);
  }
});
