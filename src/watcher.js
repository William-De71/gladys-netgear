// -----------------------------------------------------------------------------
// The reading loop: every `poll_interval` seconds, the state of the router.
//
// Each round reads what moves (client list, CPU and memory, internet link and
// address, traffic meter); what hardly moves (model and firmware, LAN
// address, announced features, the switchable settings) is read every
// SLOW_INTERVAL_MS, and the firmware check (the router asks the NETGEAR
// update server) every FIRMWARE_INTERVAL_MS.
//
// It keeps the snapshots the devices, widgets and scene actions read, and
// hands each round to the app with its transitions (tracker.js). A round
// never overlaps another one. The client list is the probe of the round:
// when it fails (unreachable, wrong password), the round fails (onError); any
// other read failing keeps its previous value. A method this model does not
// have is not asked again before RETRY_MISSING_MS.
// -----------------------------------------------------------------------------

import { supports, internetStatus } from './read.js';
import { TOGGLES } from './operations.js';
import { nextPresence, diffInternet, diffWanIp, diffFirmware } from './tracker.js';

const SLOW_INTERVAL_MS = 5 * 60 * 1000;
const FIRMWARE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RETRY_MISSING_MS = 60 * 60 * 1000;

/**
 * @description Create the watcher.
 * @param {object} options - Options.
 * @param {object} options.ops - The router operations (operations.js).
 * @param {object} options.known - The known MAC addresses (store.js).
 * @param {Function} options.getConfig - `() => normalized config`.
 * @param {Function} options.isEnabled - `() => boolean`: address and account known.
 * @param {Function} options.onRound - `async (round) => void`.
 * @param {Function} options.onError - `async (err) => void`.
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {object} options.logger - Logger.
 * @returns {object} The watcher.
 * @example
 * const watcher = createWatcher({ ops, known, getConfig, isEnabled, onRound, onError, logger });
 * watcher.start();
 */
function createWatcher({
  ops,
  known,
  getConfig,
  isEnabled,
  onRound,
  onError,
  now = () => Date.now(),
  logger,
}) {
  let router = null;
  let identity = null;
  let lan = null;
  let features = {};
  let toggles = {};
  let firmware;
  let speedTest = null;
  let slowAt = null;
  let firmwareAt = null;
  let clients = new Map();
  let fetchedAt = null;
  // What answered at least once since the start: a feature never vanishes
  // from the Discovery list because one read failed.
  let capabilities = new Set();
  // method name -> time it was found missing
  let missing = new Map();
  let timer = null;
  let running = null;
  let started = false;

  /**
   * @description Read an optional part: undefined when it fails.
   * @param {string} name - A name for the logs and the missing map.
   * @param {Function} read - `async () => answer`.
   * @returns {Promise<unknown>} The answer.
   */
  async function readOptional(name, read) {
    const since = missing.get(name);
    if (since !== undefined && now() - since < RETRY_MISSING_MS) {
      return undefined;
    }
    try {
      const answer = await read();
      missing.delete(name);
      return answer;
    } catch (err) {
      if (err.kind === 'unsupported') {
        if (since === undefined) {
          logger.info(`Router ${name}: not supported by this model, skipped`);
        }
        missing.set(name, now());
      } else {
        logger.warn(`Router ${name}: ${err.message}`);
      }
      return undefined;
    }
  }

  /**
   * @description The parts read every SLOW_INTERVAL_MS (and the firmware check).
   * @param {boolean} force - Read them now.
   * @returns {Promise<void>}
   */
  async function readSlow(force) {
    const at = now();
    if (!force && slowAt !== null && at - slowAt < SLOW_INTERVAL_MS) {
      return;
    }
    identity = (await readOptional('identity', ops.identity)) ?? identity;
    lan = (await readOptional('lan', ops.lan)) ?? lan;
    features = (await readOptional('features', ops.featureList)) ?? features;
    if (supports(features, 'SpeedTest')) {
      capabilities.add('speed_test');
    }
    const next = { ...toggles };
    for (const key of Object.keys(TOGGLES)) {
      const value = await readOptional(`toggle ${key}`, () => ops.getToggle(key));
      if (typeof value === 'boolean') {
        next[key] = value;
        capabilities.add(`toggle:${key}`);
      }
    }
    toggles = next;
    if (force || firmwareAt === null || at - firmwareAt >= FIRMWARE_INTERVAL_MS) {
      const checked = await readOptional('firmware', () =>
        ops.firmware(identity?.firmware ?? null),
      );
      if (checked !== undefined) {
        firmware = checked;
        firmwareAt = at;
      }
    }
    slowAt = at;
  }

  /**
   * @description One reading of the router.
   * @param {boolean} forceSlow - Read the slow parts too.
   * @returns {Promise<void>}
   */
  async function readAll(forceSlow) {
    // The probe: a failure here fails the round.
    const list = await ops.attached(identity?.model ?? null);
    const at = now();
    const baseline = fetchedAt === null;
    const previousFirmware = baseline ? undefined : (firmware ?? null);
    await readSlow(forceSlow);
    const config = getConfig();
    const round = {
      baseline,
      presence: [],
      newClients: [],
      internet: null,
      wanIp: null,
      firmware: null,
    };

    // --- system and traffic ------------------------------------------------------
    const system = await readOptional('system', ops.system);
    if (system && (system.cpu !== null || system.memory !== null)) {
      capabilities.add('system');
    }
    const traffic = await readOptional('traffic', ops.traffic);
    if (traffic && Object.values(traffic).some((value) => value !== null)) {
      capabilities.add('traffic');
    }

    // --- internet link -----------------------------------------------------------
    const link = await readOptional('link', ops.link);
    const wanInfo = await readOptional('wan', ops.wan);
    const previousWan = router?.wan ?? null;
    const wan = {
      ip: wanInfo === undefined ? (previousWan?.ip ?? null) : wanInfo.ip,
      gateway: wanInfo === undefined ? (previousWan?.gateway ?? null) : wanInfo.gateway,
      type: wanInfo === undefined ? (previousWan?.type ?? null) : wanInfo.type,
      link: link === undefined ? (previousWan?.link ?? null) : link,
    };
    wan.status =
      link === undefined && wanInfo === undefined
        ? (previousWan?.status ?? 'unknown')
        : internetStatus(wan.link, wanInfo === undefined ? undefined : wanInfo.ip);
    if (!baseline) {
      round.internet = diffInternet(previousWan ?? undefined, wan);
      if (diffWanIp(previousWan?.ip, wan.ip)) {
        round.wanIp = { previous: previousWan.ip, current: wan.ip };
      }
    }

    // --- clients and presence ---------------------------------------------------
    const absenceMs = config.absenceDelay * 60000;
    // The router lists the clients it holds now: every one of them is online.
    const read = new Map(
      list.filter((c) => c.mac !== lan?.mac).map((c) => [c.mac, { ...c, online: true }]),
    );
    const next = new Map();
    for (const mac of new Set([...clients.keys(), ...read.keys()])) {
      const before = clients.get(mac);
      const fresh = read.get(mac);
      const client = { ...(before ?? {}), ...(fresh ?? { online: false }) };
      // A name, an address once known stays known.
      client.mac = mac;
      client.name = client.name ?? before?.name ?? null;
      client.ip = client.ip ?? before?.ip ?? null;
      if (!client.online) {
        client.signal = null;
        client.linkRate = null;
      }
      if (typeof client.access === 'boolean') {
        capabilities.add('access');
      }
      const presence = nextPresence(baseline ? undefined : before, client.online, at, absenceMs);
      client.present = presence.present;
      client.lastSeen = presence.lastSeen;
      if (presence.event) {
        round.presence.push({ client, event: presence.event });
      }
      next.set(mac, client);
    }
    clients = next;
    const online = [...read.keys()];
    const unknown = online.filter((mac) => !known.has(mac));
    if (unknown.length > 0) {
      if (known.initialized()) {
        unknown.forEach((mac) => round.newClients.push({ client: clients.get(mac) }));
      }
      await known.add(unknown);
    } else if (!known.initialized()) {
      await known.add([]);
    }

    // --- firmware ---------------------------------------------------------------
    if (firmware && diffFirmware(previousFirmware ?? undefined, firmware)) {
      round.firmware = firmware;
    }

    router = {
      identity,
      lan,
      cpu: system?.cpu ?? (system === undefined ? (router?.cpu ?? null) : null),
      memory: system?.memory ?? (system === undefined ? (router?.memory ?? null) : null),
      traffic: traffic ?? router?.traffic ?? null,
      wan,
      clientsOnline: online.length,
      firmware: firmware ?? null,
      speedTest,
      toggles,
    };
    fetchedAt = at;
    await onRound(round);
  }

  /**
   * @description Plan the next round.
   */
  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (started) {
      timer = setTimeout(() => {
        round().finally(schedule);
      }, getConfig().pollInterval * 1000);
      timer.unref?.();
    }
  }

  /**
   * @description Read the router now; joins a round already running.
   * @param {object} [options] - `{ slow }`: read the slow parts too.
   * @returns {Promise<void>} Never rejects: failures go to onError.
   */
  function round({ slow: forceSlow = false } = {}) {
    if (running) {
      return running;
    }
    if (!isEnabled()) {
      return Promise.resolve();
    }
    running = readAll(forceSlow)
      .catch(async (err) => {
        logger.warn(`Router reading failed: ${err.message}`);
        await onError(err);
      })
      .catch((err) => logger.error('Unable to report a reading failure', err))
      .finally(() => {
        running = null;
      });
    return running;
  }

  /**
   * @description Replace the router snapshot with some fields changed.
   * @param {object} fields - The fields.
   */
  function patchRouter(fields) {
    if (router) {
      router = { ...router, ...fields };
    }
  }

  return {
    round,
    start: () => {
      started = true;
      schedule();
    },
    stop: () => {
      started = false;
      clearTimeout(timer);
      timer = null;
    },
    reschedule: schedule,
    /** @description Forget everything: the next round is a new baseline. */
    reset: () => {
      router = null;
      identity = null;
      lan = null;
      features = {};
      toggles = {};
      firmware = undefined;
      speedTest = null;
      slowAt = null;
      firmwareAt = null;
      clients = new Map();
      fetchedAt = null;
      capabilities = new Set();
      missing = new Map();
    },
    router: () => router,
    clients: () => [...clients.values()],
    client: (mac) => clients.get(mac) ?? null,
    capabilities: () => new Set(capabilities),
    features: () => ({ ...features }),
    missing: () => [...missing.keys()],
    fetchedAt: () => fetchedAt,
    /**
     * @description Apply a setting switched from Gladys: no event.
     * @param {string} key - A TOGGLES key.
     * @param {boolean} enabled - Its new state.
     */
    patchToggle: (key, enabled) => {
      toggles = { ...toggles, [key]: enabled };
      patchRouter({ toggles });
    },
    /**
     * @description Apply an access changed from Gladys.
     * @param {string} mac - The client.
     * @param {boolean} allow - Allowed or blocked.
     */
    patchAccess: (mac, allow) => {
      const client = clients.get(mac);
      if (client) {
        clients.set(mac, { ...client, access: allow });
      }
    },
    /**
     * @description Apply a firmware check run from Gladys: no event.
     * @param {object} checked - readFirmware.
     */
    patchFirmware: (checked) => {
      firmware = checked;
      firmwareAt = now();
      patchRouter({ firmware });
    },
    /**
     * @description Keep the result of a speed test run from Gladys.
     * @param {object} result - `{ down, up, ping }`.
     */
    patchSpeedTest: (result) => {
      speedTest = { ...result, at: now() };
      capabilities.add('speed_test');
      patchRouter({ speedTest });
    },
  };
}

export { createWatcher, SLOW_INTERVAL_MS, FIRMWARE_INTERVAL_MS, RETRY_MISSING_MS };
