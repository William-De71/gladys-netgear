// -----------------------------------------------------------------------------
// What the integration asks the router, method by method, on top of the SOAP
// client (netgear-api.js) and the parsers (read.js).
//
// The NETGEAR models do not all name their methods the same way: the guest
// Wi-Fi of an R7000 is GetGuestAccessEnabled, that of an R8000
// GetGuestAccessEnabled2. Like pynetgear, each getter or setter tries the
// names it knows in turn and keeps the one that answered first for the next
// time. A write is read back: it only counts when the router reports the new
// value.
// -----------------------------------------------------------------------------

import { NetgearError, responseCode } from './netgear-api.js';
import {
  readIdentity,
  readLan,
  readAttachedV1,
  readAttachedV2,
  readSystem,
  readTraffic,
  readWanInfo,
  readLink,
  readToggle,
  readFirmware,
  readFeatureList,
  readSpeedTest,
} from './read.js';

const SERVICES = {
  DEVICE_INFO: 'DeviceInfo:1',
  DEVICE_CONFIG: 'DeviceConfig:1',
  LAN: 'LANConfigSecurity:1',
  WAN_IP: 'WANIPConnection:1',
  WAN_LINK: 'WANEthernetLinkConfig:1',
  PARENTAL: 'ParentalControl:1',
  QOS: 'AdvancedQoS:1',
  WLAN: 'WLANConfiguration:1',
};

// The settings of the router Gladys can switch, in the order they are offered.
const TOGGLES = {
  guest_wifi_2g: {
    service: SERVICES.WLAN,
    get: ['GetGuestAccessEnabled', 'GetGuestAccessEnabled2'],
    set: ['SetGuestAccessEnabled', 'SetGuestAccessEnabled2'],
    param: 'NewGuestAccessEnabled',
  },
  guest_wifi_5g: {
    service: SERVICES.WLAN,
    get: ['Get5GGuestAccessEnabled', 'Get5G1GuestAccessEnabled', 'Get5GGuestAccessEnabled2'],
    set: ['Set5GGuestAccessEnabled', 'Set5G1GuestAccessEnabled2', 'Set5GGuestAccessEnabled2'],
    param: 'NewGuestAccessEnabled',
  },
  access_control: {
    service: SERVICES.DEVICE_CONFIG,
    get: ['GetBlockDeviceEnableStatus'],
    set: ['SetBlockDeviceEnable'],
    param: 'NewBlockDeviceEnable',
  },
  traffic_meter: {
    service: SERVICES.DEVICE_CONFIG,
    get: ['GetTrafficMeterEnabled'],
    set: ['EnableTrafficMeter'],
    param: 'NewTrafficMeterEnable',
  },
  parental_control: {
    service: SERVICES.PARENTAL,
    get: ['GetEnableStatus'],
    set: ['EnableParentalControl'],
    param: 'NewEnable',
  },
  qos: {
    service: SERVICES.QOS,
    get: ['GetQoSEnableStatus'],
    set: ['SetQoSEnableStatus'],
    param: 'NewQoSEnable',
  },
  smart_connect: {
    service: SERVICES.WLAN,
    get: ['IsSmartConnectEnabled'],
    set: ['SetSmartConnectEnable'],
    param: 'NewSmartConnectEnable',
  },
};

// Models that list their clients with GetAttachDevice2 (the MODELS_V2 list of
// the Home Assistant NETGEAR integration). The others start with
// GetAttachDevice; each falls back on the other format.
const MODELS_V2 = [
  'Orbi',
  'RBE',
  'RBK',
  'RBR',
  'RBS',
  'RBW',
  'RS',
  'LBK',
  'LBR',
  'CBK',
  'CBR',
  'SRC',
  'SRK',
  'SRS',
  'SXK',
  'SXR',
  'SXS',
];

// The router measures the line for up to a minute; it answers 1 meanwhile.
const SPEED_TEST = { delayMs: 2000, attempts: 40 };
const FIRMWARE_TIMEOUT_MS = 60000;

const isV2Model = (model) => MODELS_V2.some((prefix) => String(model ?? '').startsWith(prefix));
// A failure that means "not on this model": try the next name.
const isMissing = (err) => err?.kind === 'unsupported';

/**
 * @description Create the operations on a router client.
 * @param {object} api - The SOAP client (netgear-api.js).
 * @param {object} [options] - Options.
 * @param {Function} [options.sleep] - `(ms) => Promise`.
 * @returns {object} The operations.
 * @example
 * const ops = createOperations(api);
 * const clients = await ops.attached('R7000');
 */
function createOperations(api, { sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  // Method names in the order to try, the one that answered first.
  const order = Object.fromEntries(
    Object.entries(TOGGLES).map(([key, toggle]) => [
      key,
      { get: [...toggle.get], set: [...toggle.set] },
    ]),
  );
  let attachedVersion = null;

  const promote = (list, index) => {
    if (index > 0) {
      list.unshift(...list.splice(index, 1));
    }
  };

  /**
   * @description Read a toggle, trying each method name.
   * @param {string} key - A TOGGLES key.
   * @returns {Promise<boolean|null>} Its state.
   */
  async function getToggle(key) {
    const { service } = TOGGLES[key];
    const names = order[key].get;
    let last = null;
    for (let index = 0; index < names.length; index += 1) {
      const method = names[index];
      try {
        const xml = await api.call(service, method);
        promote(names, index);
        return readToggle(xml, method);
      } catch (err) {
        if (!isMissing(err)) {
          throw err;
        }
        last = err;
      }
    }
    throw last;
  }

  /**
   * @description Switch a toggle, trying each method name until the router
   * reports the new state.
   * @param {string} key - A TOGGLES key.
   * @param {boolean} enabled - The new state.
   * @returns {Promise<boolean>} The state read back.
   */
  async function setToggle(key, enabled) {
    const { service, param } = TOGGLES[key];
    const names = order[key].set;
    for (let index = 0; index < names.length; index += 1) {
      try {
        await api.set(service, names[index], { [param]: enabled ? '1' : '0' });
      } catch (err) {
        if (isMissing(err)) {
          continue;
        }
        throw err;
      }
      if ((await getToggle(key)) === enabled) {
        promote(names, index);
        return enabled;
      }
    }
    throw new NetgearError('http', `The router did not apply ${key} = ${enabled ? 1 : 0}`);
  }

  /**
   * @description The clients of the network, in the format the model answers.
   * @param {string|null} model - The model, to pick the first format to try.
   * @returns {Promise<Array<object>>} The clients.
   */
  async function attached(model) {
    const first = attachedVersion ?? (isV2Model(model) ? 2 : 1);
    let last = null;
    for (const version of [first, 3 - first]) {
      try {
        const xml = await api.call(
          SERVICES.DEVICE_INFO,
          version === 2 ? 'GetAttachDevice2' : 'GetAttachDevice',
        );
        const list = version === 2 ? readAttachedV2(xml) : readAttachedV1(xml);
        if (list !== null) {
          attachedVersion = version;
          return list;
        }
        last = new NetgearError('http', `GetAttachDevice${version === 2 ? '2' : ''}: no list`);
      } catch (err) {
        if (!isMissing(err) && err.kind !== 'http') {
          throw err;
        }
        last = err;
      }
    }
    throw last;
  }

  /**
   * @description Run a speed test on the router and wait for its result.
   * @returns {Promise<{ down: number|null, up: number|null, ping: number|null }>} The result.
   */
  async function speedTest() {
    await api.set(SERVICES.QOS, 'SetOOKLASpeedTestStart');
    for (let attempt = 0; attempt < SPEED_TEST.attempts; attempt += 1) {
      const xml = await api.call(
        SERVICES.QOS,
        'GetOOKLASpeedTestResult',
        {},
        {
          // 501: the router gives the previous result.
          accept: (code) => code === 501,
        },
      );
      const code = responseCode(xml);
      if (code !== 1) {
        return readSpeedTest(xml);
      }
      await sleep(SPEED_TEST.delayMs);
    }
    throw new NetgearError('http', 'The speed test did not finish in time');
  }

  return {
    attached,
    getToggle,
    setToggle,
    speedTest,
    identity: async () => readIdentity(await api.call(SERVICES.DEVICE_INFO, 'GetInfo')),
    lan: async () => readLan(await api.call(SERVICES.LAN, 'GetInfo')),
    system: async () => readSystem(await api.call(SERVICES.DEVICE_INFO, 'GetSystemInfo')),
    traffic: async () =>
      readTraffic(await api.call(SERVICES.DEVICE_CONFIG, 'GetTrafficMeterStatistics')),
    wan: async () => readWanInfo(await api.call(SERVICES.WAN_IP, 'GetInfo')),
    link: async () => readLink(await api.call(SERVICES.WAN_LINK, 'GetEthernetLinkStatus')),
    featureList: async () =>
      readFeatureList(await api.call(SERVICES.DEVICE_INFO, 'GetSupportFeatureListXML')),
    /**
     * @description Ask the router whether a firmware is available (it asks
     * the NETGEAR update server).
     * @param {string|null} installed - The installed version.
     * @returns {Promise<object>} readFirmware.
     */
    firmware: async (installed) =>
      readFirmware(
        await api.call(
          SERVICES.DEVICE_CONFIG,
          'CheckNewFirmware',
          {},
          {
            timeoutMs: FIRMWARE_TIMEOUT_MS,
          },
        ),
        installed,
      ),
    /**
     * @description Allow or block a client on the network (access control).
     * @param {string} mac - `aa:bb:cc:dd:ee:ff`.
     * @param {boolean} allow - Allow or block.
     * @returns {Promise<void>}
     */
    setAccess: async (mac, allow) => {
      await api.set(SERVICES.DEVICE_CONFIG, 'SetBlockDeviceByMAC', {
        NewAllowOrBlock: allow ? 'Allow' : 'Block',
        NewMACAddress: mac.toUpperCase(),
      });
    },
    reboot: async () => {
      await api.set(SERVICES.DEVICE_CONFIG, 'Reboot');
    },
    /** @returns {number|null} The client list format in use (1 or 2). */
    attachedVersion: () => attachedVersion,
    /** @description Forget the method names learned (configuration changed). */
    reset() {
      attachedVersion = null;
      for (const [key, toggle] of Object.entries(TOGGLES)) {
        order[key] = { get: [...toggle.get], set: [...toggle.set] };
      }
    },
  };
}

export { createOperations, SERVICES, TOGGLES, MODELS_V2, SPEED_TEST, isV2Model };
