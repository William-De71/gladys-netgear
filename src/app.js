// -----------------------------------------------------------------------------
// The NETGEAR integration: every handler, registered on a Gladys client.
//
// Brings a NETGEAR router (Nighthawk, Orbi...) into Gladys, over the local
// SOAP API of the router (the one of the NETGEAR apps):
//   - devices (device.js): the router (CPU, memory, traffic meter, speed
//     test, internet link, WAN address, clients, firmware), its switchable
//     settings (guest Wi-Fi, access control, traffic meter, parental control,
//     QoS, Smart Connect), and the clients of the network as presence
//     sensors, with their network access as a switch;
//   - scene triggers (tracker.js, events.js): internet down or back, new
//     public address, device arrived or left, new device on the network,
//     firmware update available;
//   - scene actions: read the status, run a speed test, check for a
//     firmware update, reboot;
//   - dashboard widgets (widgets.js): overview, traffic, network devices;
//   - Configuration screen actions: test the connection, forget the known
//     devices, write an anonymized diagnostic to the logs.
//
// Transport: local only. Nothing leaves the network, except what the router
// itself contacts (the NETGEAR update server on a firmware check, the Ookla
// servers on a speed test).
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK (test/app.test.js).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import {
  normalizeConfig,
  hasCredentials,
  readLanguage,
  INTERNAL_KEYS,
  AUTO_LANGUAGE,
} from './config.js';
import { createNetgearClient } from './netgear-api.js';
import { createOperations, TOGGLES } from './operations.js';
import { createKnownHosts, DEFAULT_PATH } from './store.js';
import { createWatcher } from './watcher.js';
import {
  DEVICE_TYPES,
  ROUTER_ID,
  idsOf,
  macId,
  macOf,
  idFromExternalId,
  featureKeyOf,
  routerName,
  routerSpecs,
  buildRouterDevice,
  buildRouterStates,
  buildSettingsDevice,
  buildSettingsStates,
  buildClientDevice,
  presenceFeatureId,
  accessFeatureId,
} from './device.js';
import {
  internetEvent,
  wanIpEvent,
  presenceEvent,
  newClientEvent,
  firmwareEvent,
  firmwareSummary,
  speedTestSummary,
  speedTestOutputs,
  statusOutputs,
  firmwareOutputs,
} from './events.js';
import {
  WIDGETS,
  WIDGET_ACTIONS,
  messageContent,
  readTrafficSettings,
  readNetworkSettings,
  buildOverviewWidget,
  buildTrafficWidget,
  buildNetworkWidget,
} from './widgets.js';
import { t, all, LANGUAGES } from './i18n.js';

const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const ACTIONS = {
  TEST_CONNECTION: 'test_connection',
  FORGET_DEVICES: 'forget_network_devices',
  DIAGNOSTIC: 'diagnostic',
};
const SCENE_ACTIONS = {
  GET_STATUS: 'get_status',
  RUN_SPEED_TEST: 'run_speed_test',
  CHECK_UPDATES: 'check_updates',
  REBOOT: 'reboot',
};
// A present client is dated again in Gladys this often (the "check presence"
// action of Gladys reads the date of the last value, as for Bluetooth).
const PRESENCE_HEARTBEAT_MS = 60000;
// The Discovery list never exceeds what the host API accepts in one batch.
const MAX_DISCOVERED = 2000;
// Clients written in a diagnostic.
const DIAGNOSTIC_SAMPLE = 5;

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options.
 * @param {Function} [options.request] - HTTP transport of the router client (tests).
 * @param {string} [options.knownHostsPath] - File of the known MAC addresses.
 * @param {Function} [options.now] - `() => number` in ms (tests).
 * @param {Function} [options.sleep] - `(ms) => Promise` (tests).
 * @param {object} [options.logger] - Logger.
 * @returns {{ watcher: object, known: object, api: object, ops: object, getConfig: Function }} Handles for the tests.
 * @example
 * createApp(new GladysIntegration());
 */
function createApp(
  gladys,
  {
    request,
    knownHostsPath = DEFAULT_PATH,
    now = () => Date.now(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  let configLoaded = false;
  // Language of the last widget request: the fallback of the texts Gladys does
  // not ask for in a language, when the `language` setting is `auto`.
  let language = 'en';
  // Device and feature external ids the user created (states are only
  // published for them).
  let createdDevices = new Set();
  let createdFeatures = new Set();
  // Last connection status and Discovery list sent, to send them again only
  // when they change.
  let lastStatus = null;
  let lastDiscovery = null;

  const api = createNetgearClient({
    getConfig: () => config,
    now,
    sleep,
    ...(request ? { request } : {}),
  });
  const ops = createOperations(api, { sleep });
  const known = createKnownHosts({ path: knownHostsPath, logger });

  /**
   * @description Remember the language of a request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (typeof next !== 'string' || !/^[a-z]{2}$/.test(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Language of the texts Gladys does not ask for in a language
   * (feature names, states, scene summaries and outputs).
   * @returns {string} The language.
   */
  const textLanguage = () => (config.language === AUTO_LANGUAGE ? language : config.language);

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description The multi-language message of a failed call.
   * @param {Error} err - A NetgearError.
   * @returns {object} The message.
   */
  function errorMessage(err) {
    if (!hasCredentials(config)) {
      return all('noCredentials');
    }
    switch (err.kind) {
      case 'auth':
        return all('statusAuth');
      case 'not_found':
        return all('statusNotFound');
      case 'unreachable':
        return all('statusUnreachable', { host: config.host });
      case 'unsupported':
        return all('statusUnsupported');
      default:
        return all('statusError');
    }
  }

  /**
   * @description Refresh the list of the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
      createdFeatures = new Set(
        devices.flatMap((device) => (device.features ?? []).map((f) => f.external_id)),
      );
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  const isCreated = (type, id) => createdDevices.has(idsOf(gladys, type, id).device);

  /**
   * @description Publish the states of the created devices. The SDK remembers
   * what it sent (publishChangedStates) and forgets a device when the user
   * creates it: its states then go out again in full.
   * @returns {Promise<void>}
   */
  async function publishStates() {
    const lang = textLanguage();
    const states = [];
    const router = watcher.router();
    if (router && isCreated(DEVICE_TYPES.ROUTER, ROUTER_ID)) {
      states.push(...buildRouterStates(gladys, router, lang));
    }
    if (router && isCreated(DEVICE_TYPES.SETTINGS, ROUTER_ID)) {
      states.push(...buildSettingsStates(gladys, router.toggles));
    }
    const clients = watcher
      .clients()
      .filter((client) => isCreated(DEVICE_TYPES.CLIENT, macId(client.mac)));
    for (const client of clients) {
      const access = accessFeatureId(gladys, client.mac);
      if (typeof client.access === 'boolean' && createdFeatures.has(access)) {
        states.push({ device_feature_external_id: access, state: client.access ? 1 : 0 });
      }
    }
    const absent = clients
      .filter((client) => !client.present)
      .map((client) => ({
        device_feature_external_id: presenceFeatureId(gladys, client.mac),
        state: 0,
      }));
    const present = clients
      .filter((client) => client.present)
      .map((client) => ({
        device_feature_external_id: presenceFeatureId(gladys, client.mac),
        state: 1,
      }));
    // Only the features that exist on the created devices (a feature the
    // router answers later is not on a device created before).
    const kept = [...states, ...absent].filter(
      (state) =>
        createdFeatures.size === 0 || createdFeatures.has(state.device_feature_external_id),
    );
    if (kept.length > 0) {
      await gladys.publishChangedStates(kept);
    }
    if (present.length > 0) {
      await gladys.publishChangedStates(present, { heartbeat: PRESENCE_HEARTBEAT_MS });
    }
  }

  const publishQuietly = () =>
    publishStates().catch((err) => logger.warn(`Unable to publish the states: ${err.message}`));

  /**
   * @description Ask the dashboards to read the widgets again.
   */
  function refreshWidgets() {
    Object.values(WIDGETS).forEach((key) => gladys.requestWidgetRefresh(key));
  }

  /**
   * @description Publish a scene event; a failure is only logged.
   * @param {{ key: string, data: object }} event - The event.
   * @returns {Promise<void>}
   */
  async function publishEvent({ key, data }) {
    logger.info(`Scene event ${key}: ${data.summary}`);
    try {
      await gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Unable to publish the scene event ${key}: ${err.message}`);
    }
  }

  /**
   * @description The devices offered on the Discovery screen.
   * @returns {Array<object>} The devices.
   */
  function discoveredDevices() {
    const router = watcher.router();
    if (!hasCredentials(config) || !router) {
      return [];
    }
    const lang = textLanguage();
    const capabilities = watcher.capabilities();
    const settings = buildSettingsDevice(gladys, router, capabilities, lang);
    const devices = [
      buildRouterDevice(gladys, router, capabilities, lang),
      ...(settings ? [settings] : []),
    ];
    const withAccess = capabilities.has('access');
    const clients = watcher
      .clients()
      .filter(
        (client) =>
          isCreated(DEVICE_TYPES.CLIENT, macId(client.mac)) ||
          config.networkDevices === 'all' ||
          (config.networkDevices === 'named' && client.name),
      );
    devices.push(...clients.map((client) => buildClientDevice(gladys, client, withAccess, lang)));
    return devices.slice(0, MAX_DISCOVERED);
  }

  /**
   * @description Offer the devices, only when the list changed.
   * @param {boolean} [force] - Send it even when unchanged.
   * @returns {Promise<number>} How many devices are offered.
   */
  async function publishDiscoveredDevices(force = false) {
    const devices = discoveredDevices();
    const signature = JSON.stringify(
      devices.map((d) => [d.external_id, d.name, d.features.length]),
    );
    if (force || signature !== lastDiscovery) {
      await gladys.publishDiscoveredDevices(devices);
      lastDiscovery = signature;
    }
    return devices.length;
  }

  // --- The watcher -----------------------------------------------------------------
  const watcher = createWatcher({
    ops,
    known,
    getConfig: () => config,
    isEnabled: () => hasCredentials(config),
    onRound: async (round) => {
      const lang = textLanguage();
      const router = watcher.router();
      if (!round.baseline) {
        if (round.internet) {
          await publishEvent(internetEvent(round.internet, router?.wan, lang));
        }
        if (round.wanIp) {
          await publishEvent(wanIpEvent(round.wanIp, lang));
        }
        for (const change of round.presence) {
          await publishEvent(presenceEvent(gladys, change, lang));
        }
        for (const change of round.newClients) {
          await publishEvent(newClientEvent(change, lang));
        }
        if (round.firmware) {
          await publishEvent(firmwareEvent(round.firmware, lang));
        }
      }
      await publishQuietly();
      await publishDiscoveredDevices().catch((err) =>
        logger.warn(`Unable to offer the devices: ${err.message}`),
      );
      refreshWidgets();
      await reportStatus(
        true,
        Object.fromEntries(
          LANGUAGES.map((l) => [
            l,
            t('statusConnected', l, {
              model: router?.identity?.model ?? 'NETGEAR',
              internet: t(`internet_${router?.wan?.status ?? 'unknown'}`, l).toLowerCase(),
              clients: router?.clientsOnline ?? 0,
            }),
          ]),
        ),
      );
    },
    onError: async (err) => {
      await reportStatus(false, errorMessage(err));
    },
    now,
    logger,
  });

  /**
   * @description Read the router if it never was, before an answer that needs it.
   * @returns {Promise<void>}
   */
  async function ensureRead() {
    if (!hasCredentials(config)) {
      throw new Error('No router address or password is configured');
    }
    if (watcher.fetchedAt() === null) {
      await watcher.round();
    }
    if (watcher.fetchedAt() === null) {
      throw new Error('The router could not be read: see the connection status');
    }
  }

  /**
   * @description Ask the router to check for a firmware. No scene event comes
   * out of it.
   * @returns {Promise<object>} readFirmware.
   */
  async function checkFirmware() {
    const firmware = await ops.firmware(watcher.router()?.identity?.firmware ?? null);
    watcher.patchFirmware(firmware);
    refreshWidgets();
    return firmware;
  }

  /**
   * @description Run a speed test on the router and keep its result.
   * @returns {Promise<object>} `{ down, up, ping }`.
   */
  async function runSpeedTest() {
    logger.info('Speed test started on the router');
    const result = await ops.speedTest();
    watcher.patchSpeedTest(result);
    await publishDiscoveredDevices().catch(() => {});
    await publishQuietly();
    refreshWidgets();
    return result;
  }

  /**
   * @description Reboot the router.
   * @returns {Promise<void>}
   */
  async function reboot() {
    await ops.reboot();
    logger.info('Reboot of the router asked from Gladys');
  }

  // --- Dashboard widgets -------------------------------------------------------------

  /**
   * @description Common checks of a widget request.
   * @param {string} lang - The user language.
   * @returns {object|null} A message content, null when the widget can be built.
   */
  function widgetProblem(lang) {
    if (!hasCredentials(config)) {
      return messageContent(t('noCredentials', lang));
    }
    if (watcher.fetchedAt() === null) {
      return messageContent(t('notReadYet', lang), 30);
    }
    return null;
  }

  gladys.onWidgetGet(WIDGETS.OVERVIEW, async ({ language: lang }) => {
    rememberLanguage(lang);
    return (
      widgetProblem(lang) ??
      buildOverviewWidget({
        router: watcher.router(),
        language: lang,
        now: now(),
        fetchedAt: watcher.fetchedAt(),
        pollSeconds: config.pollInterval,
      })
    );
  });

  gladys.onWidgetGet(WIDGETS.TRAFFIC, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    const ids = idsOf(gladys, DEVICE_TYPES.ROUTER, ROUTER_ID);
    const charted =
      isCreated(DEVICE_TYPES.ROUTER, ROUTER_ID) &&
      createdFeatures.has(ids.feature('download_today'));
    return (
      widgetProblem(lang) ??
      buildTrafficWidget({
        router: watcher.router(),
        language: lang,
        now: now(),
        pollSeconds: config.pollInterval,
        interval: readTrafficSettings(settings).interval,
        featureId: charted ? ids.feature : null,
      })
    );
  });

  gladys.onWidgetGet(WIDGETS.NETWORK, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    return (
      widgetProblem(lang) ??
      buildNetworkWidget({
        clients: watcher.clients(),
        language: lang,
        now: now(),
        pollSeconds: config.pollInterval,
        show: readNetworkSettings(settings).show,
        created: new Set(
          watcher
            .clients()
            .filter((client) => isCreated(DEVICE_TYPES.CLIENT, macId(client.mac)))
            .map((client) => client.mac),
        ),
      })
    );
  });

  gladys.onWidgetAction(WIDGETS.OVERVIEW, async (actionKey) => {
    if (!hasCredentials(config)) {
      return all('noCredentials');
    }
    try {
      if (actionKey === WIDGET_ACTIONS.CHECK_UPDATES) {
        const firmware = await checkFirmware();
        return Object.fromEntries(LANGUAGES.map((l) => [l, firmwareSummary(firmware, l)]));
      }
      if (actionKey === WIDGET_ACTIONS.REBOOT) {
        await reboot();
        return all('rebooting');
      }
    } catch (err) {
      logger.warn(`Widget action ${actionKey}: ${err.message}`);
      return errorMessage(err);
    }
    return all('unknownAction');
  });

  gladys.onWidgetAction(WIDGETS.TRAFFIC, async (actionKey) => {
    if (!hasCredentials(config)) {
      return all('noCredentials');
    }
    if (actionKey !== WIDGET_ACTIONS.SPEED_TEST) {
      return all('unknownAction');
    }
    try {
      const result = await runSpeedTest();
      return Object.fromEntries(LANGUAGES.map((l) => [l, speedTestSummary(result, l)]));
    } catch (err) {
      logger.warn(`Widget action ${actionKey}: ${err.message}`);
      return errorMessage(err);
    }
  });

  // --- Scene actions -----------------------------------------------------------------
  gladys.onSceneAction(SCENE_ACTIONS.GET_STATUS, async () => {
    await ensureRead();
    return statusOutputs({ router: watcher.router(), clients: watcher.clients() }, textLanguage());
  });

  gladys.onSceneAction(SCENE_ACTIONS.RUN_SPEED_TEST, async () => {
    await ensureRead();
    return speedTestOutputs(await runSpeedTest(), textLanguage());
  });

  gladys.onSceneAction(SCENE_ACTIONS.CHECK_UPDATES, async () => {
    await ensureRead();
    return firmwareOutputs(await checkFirmware(), textLanguage());
  });

  gladys.onSceneAction(SCENE_ACTIONS.REBOOT, async () => {
    await ensureRead();
    await reboot();
  });

  // --- Device commands (settings and network access switches) ----------------------
  gladys.onSetValue(async (device, deviceFeature, value) => {
    const enabled = Number(value) === 1;
    const key = featureKeyOf(deviceFeature.external_id);
    if (idFromExternalId(device.external_id, DEVICE_TYPES.SETTINGS) && TOGGLES[key]) {
      const state = await ops.setToggle(key, enabled);
      watcher.patchToggle(key, state);
      logger.info(`Router setting ${key} switched ${state ? 'on' : 'off'} from Gladys`);
      await publishQuietly();
      refreshWidgets();
      return;
    }
    const id = idFromExternalId(device.external_id, DEVICE_TYPES.CLIENT);
    if (id && key === 'access') {
      if (!enabled && watcher.router()?.toggles?.access_control === false) {
        throw new Error(t('accessControlOff', 'en'));
      }
      const mac = macOf(id);
      await ops.setAccess(mac, enabled);
      watcher.patchAccess(mac, enabled);
      logger.info(`Network access of a client ${enabled ? 'allowed' : 'blocked'} from Gladys`);
      await publishQuietly();
      refreshWidgets();
      return;
    }
    throw new Error(`Read-only feature: ${deviceFeature.external_id}`);
  });

  // --- Configuration screen actions --------------------------------------------------
  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    if (!hasCredentials(config)) {
      return all('noCredentials');
    }
    try {
      const identity = await ops.identity();
      const endpoint = api.endpoint();
      return Object.fromEntries(
        LANGUAGES.map((l) => [
          l,
          t('testOk', l, {
            model: routerName(identity, l),
            firmware: identity.firmware ?? '?',
            port: endpoint ? `${endpoint.port}${endpoint.ssl ? ' (HTTPS)' : ''}` : '?',
          }),
        ]),
      );
    } catch (err) {
      return errorMessage(err);
    }
  });

  gladys.onAction(ACTIONS.FORGET_DEVICES, async () => {
    await known.clear();
    return all('forgotten');
  });

  // Gladys does not pass DEBUG to the container: what a bug report needs goes
  // to the Logs tab at the info level, on demand, without anything personal.
  gladys.onAction(ACTIONS.DIAGNOSTIC, async () => {
    if (!hasCredentials(config)) {
      return all('noCredentials');
    }
    try {
      await ensureRead();
    } catch (err) {
      logger.info(
        `NETGEAR diagnostic 1/1 error: ${JSON.stringify({ kind: err.kind ?? null, message: err.message })}`,
      );
      return errorMessage(err);
    }
    for (const line of diagnosticLines()) {
      logger.info(line);
    }
    return all('diagnosticDone');
  });

  /**
   * @description The diagnostic: what the router answers, without its serial
   * number, MAC addresses (only the maker part), names, SSIDs nor public IP.
   * @returns {string[]} The log lines.
   */
  function diagnosticLines() {
    const router = watcher.router() ?? {};
    const endpoint = api.endpoint();
    const clients = watcher.clients();
    const count = (pick) =>
      clients.reduce((acc, client) => {
        const value = String(pick(client));
        acc[value] = (acc[value] ?? 0) + 1;
        return acc;
      }, {});
    const parts = [
      [
        'router',
        {
          integration: VERSION,
          model: router.identity?.model ?? null,
          hardware: router.identity?.hardware ?? null,
          firmware: router.identity?.firmware ?? null,
          mode: router.identity?.mode ?? null,
          port: endpoint?.port ?? null,
          https: endpoint?.ssl ?? null,
          login: endpoint?.login ?? null,
          clientList: ops.attachedVersion() ? `v${ops.attachedVersion()}` : null,
          pollSeconds: config.pollInterval,
        },
      ],
      [
        'capabilities',
        {
          answered: [...watcher.capabilities()].sort(),
          missing: watcher.missing().sort(),
          features: watcher.features(),
          featuresOffered: routerSpecs(watcher.capabilities()).map((spec) => spec.key),
        },
      ],
      [
        'state',
        {
          internet: router.wan?.status ?? null,
          link: router.wan?.link ?? null,
          wanIpKnown: Boolean(router.wan?.ip),
          wanType: router.wan?.type ?? null,
          cpu: router.cpu ?? null,
          memory: router.memory ?? null,
          traffic: router.traffic ?? null,
          toggles: router.toggles ?? {},
          firmware: router.firmware
            ? { current: router.firmware.current, latest: router.firmware.latest }
            : null,
          speedTest: router.speedTest ?? null,
        },
      ],
      [
        'clients',
        {
          total: clients.length,
          present: clients.filter((c) => c.present).length,
          named: clients.filter((c) => c.name).length,
          connection: count((c) => c.connection),
          access: count((c) => c.access),
          sample: clients.slice(0, DIAGNOSTIC_SAMPLE).map((c) => ({
            maker: c.mac.slice(0, 8),
            connection: c.connection,
            signal: c.signal ?? null,
            linkRate: c.linkRate ?? null,
            access: c.access ?? null,
            type: c.type ?? null,
            named: Boolean(c.name),
            ip: Boolean(c.ip),
            ssid: Boolean(c.ssid),
          })),
        },
      ],
    ];
    return parts.map(
      ([name, value], index) =>
        `NETGEAR diagnostic ${index + 1}/${parts.length} ${name}: ${JSON.stringify(value)}`,
    );
  }

  // --- Devices -----------------------------------------------------------------------
  gladys.onScanRequest(async () => {
    await watcher.round({ slow: true });
    const count = await publishDiscoveredDevices(true);
    logger.info(`Scan: ${count} NETGEAR device(s) offered`);
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    await publishQuietly();
    refreshWidgets();
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration -----------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  /**
   * @description Read the router now; report missing settings.
   * @returns {Promise<void>}
   */
  async function refreshAll() {
    if (!hasCredentials(config)) {
      await reportStatus(false, all('noCredentials'));
      return;
    }
    await watcher.round({ slow: true });
  }

  gladys.onConfigUpdated(async (rawConfig) => {
    const previousHost = config.host;
    await loadConfig(rawConfig);
    logger.info(`Configuration updated: router read every ${config.pollInterval} s`);
    // New password, address or interval: log in again, start from a fresh baseline.
    api.reset();
    ops.reset();
    watcher.reset();
    lastDiscovery = null;
    if (configLoaded && config.host !== previousHost) {
      // Maybe another router: its network is new.
      await known.clear();
    }
    configLoaded = true;
    watcher.reschedule();
    await refreshAll();
  });

  // --- Connection lifecycle ----------------------------------------------------------
  // Each step on its own: a failing one must not keep the watcher from starting.
  gladys.on('connected', async () => {
    await loadConfig();
    configLoaded = true;
    await known.load();
    await refreshCreatedDevices();
    lastStatus = null;
    lastDiscovery = null;
    await refreshAll();
    watcher.start();
  });

  // --- Graceful shutdown -------------------------------------------------------------
  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    watcher.stop();
  });

  return { watcher, known, api, ops, getConfig: () => config };
}

export { createApp, ACTIONS, SCENE_ACTIONS, PRESENCE_HEARTBEAT_MS, VERSION };
