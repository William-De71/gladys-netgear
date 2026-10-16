// The SOAP client and the operations against the fake router: login versions,
// port detection, session expiry, busy router, missing methods, writes framed
// by ConfigurationStarted / ConfigurationFinished, method name fallbacks.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createNetgearClient,
  envelope,
  escapeXml,
  responseCode,
  soapUrl,
  candidates,
  AUTH_RETRY_MS,
} from '../src/netgear-api.js';
import { createOperations } from '../src/operations.js';
import { netgearRouter, PASSWORD, COOKIE, NOW } from './helpers/fixtures.js';

const CONFIG = { host: '192.168.1.1', port: 'auto', username: 'admin', password: PASSWORD };

/**
 * @description A client on a fake router.
 * @param {object} [overrides] - Fields of the fake router state.
 * @param {object} [config] - Fields of the config.
 * @returns {object} `{ api, ops, fake, clock, config }`.
 */
function client(overrides = {}, config = {}) {
  const fake = netgearRouter(overrides);
  const clock = { now: NOW, slept: 0 };
  const current = { ...CONFIG, ...config };
  const api = createNetgearClient({
    getConfig: () => current,
    request: fake,
    now: () => clock.now,
    sleep: async (ms) => {
      clock.slept += ms;
    },
  });
  return {
    api,
    ops: createOperations(api, { sleep: async () => {} }),
    fake,
    clock,
    config: current,
  };
}

test('the envelope: namespaced method, fixed session id, escaped values', () => {
  const xml = envelope('DeviceConfig:1', 'SOAPLogin', { Username: 'admin', Password: 'a<b&c' });
  assert.match(xml, /<M1:SOAPLogin xmlns:M1="urn:NETGEAR-ROUTER:service:DeviceConfig:1">/);
  assert.match(xml, /<SessionID>A7D88AE69687E58D9A00<\/SessionID>/);
  assert.match(xml, /<Password>a&lt;b&amp;c<\/Password>/);
  assert.equal(escapeXml('<&>'), '&lt;&amp;&gt;');
  assert.equal(responseCode('<ResponseCode>000</ResponseCode>'), 0);
  assert.equal(responseCode('<x:ResponseCode> 401 </x:ResponseCode>'), 401);
  assert.equal(responseCode('nothing'), null);
});

test('URLs and the ports tried by "auto", the last one that answered first', () => {
  assert.equal(
    soapUrl('192.168.1.1', { port: 5000, ssl: false }),
    'http://192.168.1.1:5000/soap/server_sa/',
  );
  assert.equal(
    soapUrl('fe80::1', { port: 443, ssl: true }),
    'https://[fe80::1]:443/soap/server_sa/',
  );
  assert.deepEqual(
    candidates('auto', null).map((e) => e.port),
    [5000, 80, 443, 5555],
  );
  assert.deepEqual(
    candidates('auto', { port: 80, ssl: false }).map((e) => e.port),
    [80, 5000, 443, 5555],
  );
  assert.deepEqual(candidates('443', null), [{ port: 443, ssl: true }]);
});

test('login version 2: the cookie of SOAPLogin is sent back, one login for many calls', async () => {
  const { api, fake } = client();
  await api.call('DeviceInfo:1', 'GetInfo');
  await api.call('DeviceInfo:1', 'GetSystemInfo');
  assert.equal(fake.logins, 1);
  assert.equal(fake.calls.at(-1).headers.Cookie, COOKIE);
  assert.equal(
    fake.calls.at(-1).headers.SOAPAction,
    'urn:NETGEAR-ROUTER:service:DeviceInfo:1#GetSystemInfo',
  );
  assert.deepEqual(api.endpoint(), { port: 5000, ssl: false, login: 'v2' });
});

test('login version 1 when SOAPLogin is unknown: Authenticate, checked by GetInfo', async () => {
  const { api, fake } = client({ loginVersion: 1 });
  await api.call('DeviceInfo:1', 'GetSystemInfo');
  assert.equal(api.endpoint().login, 'v1');
  assert.deepEqual(
    fake.calls.slice(0, 3).map((c) => c.method),
    ['SOAPLogin', 'Authenticate', 'GetInfo'],
  );
  assert.equal(fake.calls.at(-1).headers.Cookie, undefined);
});

test('auto port: an Orbi answers on 80, an HTTPS router on 443', async () => {
  const orbi = client({ endpoint: { port: 80, ssl: false } });
  await orbi.api.call('DeviceInfo:1', 'GetInfo');
  assert.equal(orbi.api.endpoint().port, 80);
  const https = client({ endpoint: { port: 443, ssl: true } });
  await https.api.call('DeviceInfo:1', 'GetInfo');
  assert.deepEqual(https.api.endpoint(), { port: 443, ssl: true, login: 'v2' });
  assert.ok(https.fake.calls.at(-1).url.startsWith('https://'));
});

test('a fixed port is the only one tried', async () => {
  const { api, fake } = client({ endpoint: { port: 80, ssl: false } }, { port: '5000' });
  await assert.rejects(() => api.call('DeviceInfo:1', 'GetInfo'), { kind: 'unreachable' });
  assert.ok(fake.calls.every((c) => c.port === 5000));
});

test('a wrong password is an auth error, not tried again for 5 minutes', async () => {
  const { api, fake, clock } = client({ password: 'other' });
  await assert.rejects(() => api.call('DeviceInfo:1', 'GetInfo'), { kind: 'auth' });
  const logins = fake.logins;
  await assert.rejects(() => api.call('DeviceInfo:1', 'GetInfo'), { kind: 'auth' });
  assert.equal(fake.logins, logins, 'blocked');
  clock.now += AUTH_RETRY_MS;
  fake.state.password = PASSWORD;
  await api.call('DeviceInfo:1', 'GetInfo');
});

test('a server that is no NETGEAR router: not_found', async () => {
  const api = createNetgearClient({
    getConfig: () => ({ ...CONFIG, port: '80' }),
    request: async () => ({ status: 404, body: '<html>Not found</html>', headers: {} }),
  });
  await assert.rejects(() => api.call('DeviceInfo:1', 'GetInfo'), { kind: 'not_found' });
});

test('an expired session logs in again once; a busy router is tried again', async () => {
  const { api, fake, clock } = client();
  await api.call('DeviceInfo:1', 'GetInfo');
  fake.state.expireSession = true;
  await api.call('DeviceInfo:1', 'GetInfo');
  assert.equal(fake.logins, 2);
  fake.state.busyOnce.add('GetSystemInfo');
  await api.call('DeviceInfo:1', 'GetSystemInfo');
  assert.equal(clock.slept, 3000);
});

test('a method the model does not have is "unsupported"', async () => {
  const { api } = client();
  await assert.rejects(() => api.call('DeviceInfo:1', 'GetAllSatellites'), {
    kind: 'unsupported',
  });
});

test('a write is framed by ConfigurationStarted / ConfigurationFinished', async () => {
  const { api, fake } = client();
  await api.set('DeviceConfig:1', 'SetBlockDeviceByMAC', {
    NewAllowOrBlock: 'Block',
    NewMACAddress: '10:68:3F:AA:AA:AA',
  });
  assert.deepEqual(
    fake.calls.slice(1).map((c) => c.method),
    ['ConfigurationStarted', 'SetBlockDeviceByMAC', 'ConfigurationFinished'],
  );
  assert.match(fake.calls[1].body, /<NewSessionID>A7D88AE69687E58D9A00<\/NewSessionID>/);
  assert.match(fake.calls[3].body, /<NewStatus>ChangesApplied<\/NewStatus>/);
});

test('calls never overlap: the second waits for the first', async () => {
  const { api, fake } = client();
  await Promise.all([
    api.call('DeviceInfo:1', 'GetInfo'),
    api.call('DeviceInfo:1', 'GetSystemInfo'),
    api.call('DeviceConfig:1', 'GetTrafficMeterStatistics'),
  ]);
  assert.equal(fake.logins, 1, 'one login for the three');
});

test('toggles: the second method name when the first is unknown, kept for next time', async () => {
  const { ops, fake } = client();
  assert.equal(await ops.getToggle('guest_wifi_2g'), false);
  const before = fake.calls.length;
  assert.equal(await ops.getToggle('guest_wifi_2g'), false);
  assert.deepEqual(
    fake.calls.slice(before).map((c) => c.method),
    ['GetGuestAccessEnabled2'],
  );
  assert.equal(await ops.setToggle('guest_wifi_2g', true), true);
  assert.equal(fake.state.toggles.guest_wifi_2g, true);
  await assert.rejects(() => ops.getToggle('smart_connect'), { kind: 'unsupported' });
});

test('client list: format 1 first for a Nighthawk, format 2 first for an Orbi, each as fallback', async () => {
  const nighthawk = client({ attachedFormats: [2] });
  const list = await nighthawk.ops.attached('R7000');
  assert.equal(list.length, 3);
  assert.equal(nighthawk.ops.attachedVersion(), 2);
  const orbi = client({ attachedFormats: [1, 2] });
  await orbi.ops.attached('RBR850');
  assert.equal(orbi.fake.calls.at(-1).method, 'GetAttachDevice2');
});

test('speed test: started, polled while in progress, then read', async () => {
  const { ops, fake } = client();
  assert.deepEqual(await ops.speedTest(), { down: 512.3, up: 98.7, ping: 12 });
  assert.equal(fake.state.speedPolls, 3);
});
