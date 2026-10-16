import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeConfig,
  normalizeHost,
  hasCredentials,
  readLanguage,
  POLL_INTERVAL,
  ABSENCE_DELAY,
} from '../src/config.js';

test('the address: a host name or an IP, without scheme, port nor path', () => {
  assert.equal(normalizeHost('192.168.1.1'), '192.168.1.1');
  assert.equal(normalizeHost(' http://192.168.1.1:5000/soap/server_sa/ '), '192.168.1.1');
  assert.equal(normalizeHost('routerlogin.net'), 'routerlogin.net');
  assert.equal(normalizeHost('fe80::1'), 'fe80::1');
  assert.equal(normalizeHost('[fe80::1]'), 'fe80::1');
  assert.equal(normalizeHost(''), null);
  assert.equal(normalizeHost(undefined), null);
});

test('defaults, bounds and types of every field', () => {
  const config = normalizeConfig({});
  assert.equal(config.port, 'auto');
  assert.equal(config.username, 'admin');
  assert.equal(config.pollInterval, POLL_INTERVAL.default);
  assert.equal(config.absenceDelay, ABSENCE_DELAY.default);
  assert.equal(config.networkDevices, 'named');
  assert.equal(config.language, 'auto');
  assert.equal(normalizeConfig({ port: '80' }).port, '80');
  assert.equal(normalizeConfig({ port: 5555 }).port, '5555');
  assert.equal(normalizeConfig({ port: '8080' }).port, 'auto');
  assert.equal(normalizeConfig({ poll_interval: '2' }).pollInterval, POLL_INTERVAL.min);
  assert.equal(normalizeConfig({ poll_interval: 1e6 }).pollInterval, POLL_INTERVAL.max);
  assert.equal(normalizeConfig({ absence_delay: '' }).absenceDelay, ABSENCE_DELAY.default);
  assert.equal(normalizeConfig({ network_devices: 'everything' }).networkDevices, 'named');
  assert.equal(normalizeConfig({ language: 'it' }).language, 'auto');
});

test('credentials need an address and a password; a password is kept as typed', () => {
  const config = normalizeConfig({ host: '10.0.0.1', username: ' admin ', password: ' p ' });
  assert.equal(config.username, 'admin');
  assert.equal(config.password, ' p ');
  assert.equal(hasCredentials(config), true);
  assert.equal(hasCredentials(normalizeConfig({ host: '10.0.0.1' })), false);
  assert.equal(hasCredentials(normalizeConfig({ password: 'p' })), false);
});

test('the stored language of the last widget request', () => {
  assert.equal(readLanguage({ last_language: 'de' }, 'en'), 'de');
  assert.equal(readLanguage({ last_language: 'german' }, 'en'), 'en');
  assert.equal(readLanguage(null, 'fr'), 'fr');
});
