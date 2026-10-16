// A fake NETGEAR router for the tests: the SOAP answers of its local API as
// the captures of the pynetgear library show them (namespaced envelope, a
// <ResponseCode> after the answer element), with the values of a small home
// network, served through the `request` transport of the client. Tests never
// touch the network.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NOW = Date.parse('2026-10-15T18:00:00Z');
const MINUTE = 60000;
const ROUTER_MAC = 'a0:40:a0:00:00:01';
const PHONE_MAC = '10:68:3f:aa:aa:aa';
const NAS_MAC = '00:11:32:aa:bb:cc';
const TV_MAC = 'd0:e7:82:01:02:03';
const USERNAME = 'admin';
const PASSWORD = 'se<cr>et&1';
const COOKIE = 'sess_id=4f2c9a; path=/';
const SERIAL = '4RL1234567890';

const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A logger that keeps its lines.
 * @returns {object} The logger, with `lines`.
 */
function recordingLogger() {
  const lines = [];
  const keep =
    (level) =>
    (...args) =>
      lines.push([level, args.map(String).join(' ')]);
  return { lines, info: keep('info'), warn: keep('warn'), error: keep('error'), debug() {} };
}

/**
 * @description A temporary file path for the known MAC addresses.
 * @returns {string} The path (its directory exists, the file does not).
 */
const knownPath = () => join(mkdtempSync(join(tmpdir(), 'netgear-')), 'known-hosts.json');

// The settings: method names this fake router answers, and the answer field.
const TOGGLE_METHODS = {
  guest_wifi_2g: { get: 'GetGuestAccessEnabled2', set: 'SetGuestAccessEnabled2' },
  guest_wifi_5g: { get: 'Get5G1GuestAccessEnabled', set: 'Set5G1GuestAccessEnabled2' },
  access_control: { get: 'GetBlockDeviceEnableStatus', set: 'SetBlockDeviceEnable' },
  traffic_meter: { get: 'GetTrafficMeterEnabled', set: 'EnableTrafficMeter' },
  qos: { get: 'GetQoSEnableStatus', set: 'SetQoSEnableStatus' },
};

/**
 * @description The default state of the router.
 * @returns {object} The state.
 */
function defaultState() {
  return {
    endpoint: { port: 5000, ssl: false },
    // 2: SOAPLogin and a cookie; 1: Authenticate, session bound to the client.
    loginVersion: 2,
    password: PASSWORD,
    loggedIn: false,
    model: 'R7000',
    firmware: 'V1.0.11.134_10.2.120',
    newFirmware: '',
    // 1: GetAttachDevice (string list); 2: GetAttachDevice2 (XML list).
    attachedFormats: [1],
    clients: [
      {
        mac: PHONE_MAC,
        ip: '192.168.1.2',
        name: 'Pixel-8',
        type: 'wireless',
        band: '5GHz',
        linkRate: 433,
        signal: 83,
        allow: 'Allow',
        ssid: 'Home_5G',
      },
      {
        mac: NAS_MAC,
        ip: '192.168.1.3',
        name: 'nas',
        type: 'wired',
        band: 'wired',
        linkRate: null,
        signal: 100,
        allow: 'Allow',
        ssid: '',
      },
      {
        mac: TV_MAC,
        ip: '192.168.1.9',
        name: null,
        type: 'wireless',
        band: '2.4GHz',
        linkRate: 72,
        signal: 64,
        allow: 'Allow',
        ssid: 'Home',
      },
    ],
    system: { cpu: 12, memory: 41 },
    traffic: {
      NewTodayConnectionTime: '18:00',
      NewTodayUpload: '512.40',
      NewTodayDownload: '3,250.75',
      NewYesterdayConnectionTime: '24:00',
      NewYesterdayUpload: '900.00',
      NewYesterdayDownload: '6,100.00',
      NewWeekConnectionTime: '90:00',
      NewWeekUpload: '4,000.00/571.43',
      NewWeekDownload: '30,000.00/4,285.71',
      NewMonthConnectionTime: '354:00',
      NewMonthUpload: '9,800.20/653.35',
      NewMonthDownload: '152,400.00/10,160.00',
      NewLastMonthConnectionTime: '744:00',
      NewLastMonthUpload: '21,000.00/677.42',
      NewLastMonthDownload: '310,000.00/10,000.00',
    },
    link: 'Up',
    wanIp: '90.12.34.56',
    toggles: {
      guest_wifi_2g: false,
      guest_wifi_5g: false,
      access_control: true,
      traffic_meter: true,
      qos: false,
    },
    features: { DynamicQoS: '1', SpeedTest: '2', AttachedDevice: '1', SmartConnect: '0' },
    speedTest: { down: 512.3, up: 98.7, ping: 12, polls: 2 },
    speedPolls: 0,
    // Methods answering 503 once before answering.
    busyOnce: new Set(),
    // Answers code 401 to the next call, as after a reboot of the router.
    expireSession: false,
    rebooted: 0,
    configStarted: 0,
    configFinished: 0,
  };
}

/**
 * @description A SOAP answer.
 * @param {string} method - The method.
 * @param {string} fields - The inner XML of the answer element.
 * @param {string|number} [code] - The ResponseCode.
 * @returns {string} The envelope.
 */
const answer = (method, fields, code = '000') => `<?xml version="1.0" encoding="UTF-8"?>
<soap-env:Envelope
        xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/"
        soap-env:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"
        >
<soap-env:Body>
    <m:${method}Response
        xmlns:m="urn:NETGEAR-ROUTER:service:Test:1">
        ${fields}
    </m:${method}Response>
    <ResponseCode>${code}</ResponseCode>
</soap-env:Body>
</soap-env:Envelope>
`;

const tags = (values) =>
  Object.entries(values)
    .map(([key, value]) => `<${key}>${value}</${key}>`)
    .join('\n        ');

const escape = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * @description The value of a parameter of a request.
 * @param {string} body - The request.
 * @param {string} name - The parameter.
 * @returns {string|null} Its raw (escaped) value.
 */
const param = (body, name) => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(body)?.[1] ?? null;

/**
 * @description A fake router: a `request` transport with its state.
 * @param {object} [overrides] - Fields of the state to replace.
 * @returns {Function} The transport, with `state`, `calls` and `logins`.
 */
function netgearRouter(overrides = {}) {
  const state = { ...defaultState(), ...overrides };
  const calls = [];
  const transport = async ({ url, headers, body }) => {
    const target = new URL(url);
    const [service, method] = headers.SOAPAction.replace('urn:NETGEAR-ROUTER:service:', '').split(
      '#',
    );
    // URL leaves the default port of the scheme out.
    const port = Number(target.port) || (target.protocol === 'https:' ? 443 : 80);
    calls.push({ url, port, service, method, headers, body });
    transport.calls = calls;
    if (
      port !== state.endpoint.port ||
      (target.protocol === 'https:') !== state.endpoint.ssl ||
      target.pathname !== '/soap/server_sa/'
    ) {
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    }
    const ok = (fields = '', code = '000') => ({
      status: 200,
      body: answer(method, fields, code),
      headers: {},
    });
    const code = (value) => ({ status: 200, body: answer(method, '', value), headers: {} });
    if (state.busyOnce.has(method)) {
      state.busyOnce.delete(method);
      return { status: 503, body: 'busy', headers: {} };
    }

    // --- login -------------------------------------------------------------------
    if (method === 'SOAPLogin') {
      if (state.loginVersion !== 2) {
        return code(501);
      }
      transport.logins += 1;
      if (
        param(body, 'Password') !== escape(state.password) ||
        param(body, 'Username') !== USERNAME
      ) {
        return code(401);
      }
      state.loggedIn = true;
      return { ...ok(), headers: { 'set-cookie': [COOKIE] } };
    }
    if (method === 'Authenticate') {
      transport.logins += 1;
      state.loggedIn =
        state.loginVersion === 1 && param(body, 'NewPassword') === escape(state.password);
      return code(state.loggedIn ? '000' : 401);
    }
    const authenticated = state.loggedIn && (state.loginVersion === 1 || headers.Cookie === COOKIE);
    if (!authenticated || state.expireSession) {
      state.expireSession = false;
      state.loggedIn = false;
      return code(401);
    }

    // --- device info -------------------------------------------------------------
    if (service === 'DeviceInfo:1' && method === 'GetInfo') {
      return ok(
        tags({
          ModelName: state.model,
          Description: 'NETGEAR Smart WiFi Router',
          SerialNumber: SERIAL,
          Firmwareversion: state.firmware,
          Hardwareversion: `${state.model}`,
          DeviceName: 'Nighthawk',
          DeviceMode: '0',
        }),
      );
    }
    if (service === 'LANConfigSecurity:1' && method === 'GetInfo') {
      return ok(tags({ NewLANIP: '192.168.1.1', NewLANMACAddress: ROUTER_MAC.toUpperCase() }));
    }
    if (method === 'GetAttachDevice') {
      if (!state.attachedFormats.includes(1)) {
        return code(501);
      }
      const list = state.clients.map(
        (c, i) =>
          `${i + 1};${c.ip};${c.name ? escape(c.name) : '&amp;lt;unknown&amp;gt;'};${c.mac.toUpperCase()};${c.type};${c.linkRate ?? ''};${c.signal};${c.allow}`,
      );
      return ok(`<NewAttachDevice>${[state.clients.length, ...list].join('@')}</NewAttachDevice>`);
    }
    if (method === 'GetAttachDevice2') {
      if (!state.attachedFormats.includes(2)) {
        return code(501);
      }
      const devices = state.clients
        .map(
          (c) =>
            `<Device>${tags({
              IP: c.ip,
              Name: c.name ? escape(c.name) : 'unknown',
              NameUserSet: 'false',
              MAC: c.mac.toUpperCase(),
              ConnectionType: c.band === 'wired' ? 'wired' : c.band,
              SSID: c.ssid,
              Linkspeed: c.linkRate ?? '',
              SignalStrength: c.signal,
              AllowOrBlock: c.allow,
              DeviceType: '24',
              DeviceModel: '',
              ConnAPMAC: ROUTER_MAC.toUpperCase(),
            })}</Device>`,
        )
        .join('');
      return ok(`<NewAttachDevice>${devices}</NewAttachDevice>`);
    }
    if (method === 'GetSystemInfo') {
      return state.system
        ? ok(
            tags({
              NewCPUUtilization: state.system.cpu,
              NewPhysicalMemory: '256',
              NewMemoryUtilization: state.system.memory,
              NewPhysicalFlash: '128',
              NewAvailableFlash: '64',
            }),
          )
        : code(501);
    }
    if (method === 'GetSupportFeatureListXML') {
      return ok(`<newFeatureList><features>${tags(state.features)}</features></newFeatureList>`);
    }

    // --- internet ----------------------------------------------------------------
    if (method === 'GetEthernetLinkStatus') {
      return ok(tags({ NewEthernetLinkStatus: state.link }));
    }
    if (service === 'WANIPConnection:1' && method === 'GetInfo') {
      return ok(
        tags({
          NewEnable: '1',
          NewConnectionType: 'DHCP',
          NewExternalIPAddress: state.wanIp,
          NewSubnetMask: '255.255.255.0',
          NewAddressingType: 'DHCP',
          NewDefaultGateway: '90.12.34.1',
          NewMACAddress: ROUTER_MAC.toUpperCase(),
        }),
      );
    }
    if (method === 'GetTrafficMeterStatistics') {
      return state.traffic ? ok(tags(state.traffic)) : code(501);
    }

    // --- settings ----------------------------------------------------------------
    for (const [key, names] of Object.entries(TOGGLE_METHODS)) {
      if (method === names.get) {
        return ok(tags({ NewValue: state.toggles[key] ? '1' : '0' }));
      }
      if (method === names.set) {
        const value = /<(New\w+)>([01])</.exec(body)?.[2];
        state.toggles[key] = value === '1';
        return ok();
      }
    }

    // --- commands ----------------------------------------------------------------
    if (method === 'ConfigurationStarted') {
      state.configStarted += 1;
      return ok();
    }
    if (method === 'ConfigurationFinished') {
      state.configFinished += 1;
      return ok();
    }
    if (method === 'SetBlockDeviceByMAC') {
      const mac = param(body, 'NewMACAddress').toLowerCase();
      const client = state.clients.find((c) => c.mac === mac);
      if (client) {
        client.allow = param(body, 'NewAllowOrBlock');
      }
      return ok();
    }
    if (method === 'Reboot') {
      state.rebooted += 1;
      return ok();
    }
    if (method === 'CheckNewFirmware') {
      return ok(
        tags({
          CurrentVersion: state.firmware,
          NewVersion: state.newFirmware,
          ReleaseNote: state.newFirmware ? 'Security fixes' : '',
        }),
      );
    }
    if (method === 'SetOOKLASpeedTestStart') {
      state.speedPolls = 0;
      return ok();
    }
    if (method === 'GetOOKLASpeedTestResult') {
      state.speedPolls += 1;
      if (state.speedPolls <= state.speedTest.polls) {
        return code(1);
      }
      return ok(
        tags({
          NewOOKLAUplinkBandwidth: state.speedTest.up,
          NewOOKLADownlinkBandwidth: state.speedTest.down,
          AveragePing: state.speedTest.ping,
        }),
      );
    }
    return code(501);
  };
  transport.state = state;
  transport.calls = calls;
  transport.logins = 0;
  return transport;
}

// A fake Gladys enough for the device builders (external ids only).
const fakeGladys = {
  externalIds: (type, id) => {
    const device = `ext:netgear:${type}:${id}`;
    return { device, feature: (key) => `${device}:${key}` };
  },
};

export {
  NOW,
  MINUTE,
  ROUTER_MAC,
  PHONE_MAC,
  NAS_MAC,
  TV_MAC,
  USERNAME,
  PASSWORD,
  COOKIE,
  SERIAL,
  silent,
  recordingLogger,
  knownPath,
  answer,
  netgearRouter,
  fakeGladys,
};
