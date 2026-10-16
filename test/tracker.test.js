import { test } from 'node:test';
import assert from 'node:assert/strict';

import { nextPresence, internetUp, diffInternet, diffWanIp, diffFirmware } from '../src/tracker.js';

const MIN = 60000;

test('presence: the baseline fires nothing, arriving is immediate, leaving waits', () => {
  assert.deepEqual(nextPresence(undefined, true, 0, 5 * MIN), {
    present: true,
    lastSeen: 0,
    event: null,
  });
  assert.deepEqual(nextPresence(undefined, false, 0, 5 * MIN), {
    present: false,
    lastSeen: null,
    event: null,
  });
  const here = { present: true, lastSeen: 0 };
  assert.equal(nextPresence(here, false, 4 * MIN, 5 * MIN).event, null);
  assert.equal(nextPresence(here, false, 4 * MIN, 5 * MIN).present, true);
  assert.equal(nextPresence(here, false, 5 * MIN, 5 * MIN).event, 'left');
  assert.equal(nextPresence({ present: false, lastSeen: 0 }, false, 9 * MIN, 5 * MIN).event, null);
  assert.equal(
    nextPresence({ present: false, lastSeen: 0 }, true, 9 * MIN, 5 * MIN).event,
    'arrived',
  );
});

test('internet: a change between up and down, connecting counts as down', () => {
  assert.equal(diffInternet(undefined, { status: 'disconnected' }), null, 'baseline');
  assert.deepEqual(diffInternet({ status: 'connected' }, { status: 'disconnected' }), {
    status: 'disconnected',
    previous: 'connected',
  });
  assert.deepEqual(diffInternet({ status: 'connecting' }, { status: 'connected' }), {
    status: 'connected',
    previous: 'disconnected',
  });
  assert.equal(diffInternet({ status: 'connecting' }, { status: 'disconnected' }), null);
  assert.equal(diffInternet({ status: 'connected' }, { status: 'unknown' }), null);
  assert.equal(internetUp('connected'), true);
  assert.equal(internetUp('unknown'), null);
});

test('WAN address: a change between two known addresses only', () => {
  assert.equal(diffWanIp(undefined, '1.2.3.4'), false, 'baseline');
  assert.equal(diffWanIp(null, '1.2.3.4'), false, 'back after a drop');
  assert.equal(diffWanIp('1.2.3.4', null), false, 'a drop');
  assert.equal(diffWanIp('1.2.3.4', '1.2.3.4'), false);
  assert.equal(diffWanIp('1.2.3.4', '5.6.7.8'), true);
});

test('firmware: a new firmware offered by the router, once', () => {
  const none = { available: false, latest: null };
  const next = { available: true, latest: '3.0.0.4.388.9_0' };
  assert.equal(diffFirmware(undefined, next), false, 'baseline');
  assert.equal(diffFirmware(null, next), false, 'not read before');
  assert.equal(diffFirmware(none, next), true);
  assert.equal(diffFirmware(next, next), false);
  assert.equal(diffFirmware(next, { available: true, latest: '3.0.0.4.388.10_0' }), true);
  assert.equal(diffFirmware(next, none), false);
});
