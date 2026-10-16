// -----------------------------------------------------------------------------
// SOAP answers of the router -> plain snapshots. Pure functions, no I/O.
//
// The answers are small, flat XML documents (namespaced tags, one element per
// value): a few regular expressions read them without an XML dependency.
// Unknown values are null, never 0: "--", "unknown" and "<unknown>" are what
// the routers write when they do not know (see pynetgear helpers).
// -----------------------------------------------------------------------------

const UNKNOWN = new Set(['', 'unknown', '<unknown>', '--', 'n/a', 'N/A']);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/**
 * @description Decode the XML entities of a text.
 * @param {string} text - The text.
 * @returns {string} The decoded text.
 * @example
 * decodeXml('a &amp; b'); // -> 'a & b'
 */
function decodeXml(text) {
  return String(text ?? '').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, name) => {
    if (name[0] === '#') {
      const code =
        name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/**
 * @description Remove the namespace prefixes of the tags.
 * @param {string} xml - The answer.
 * @returns {string} The answer, `<m:GetInfoResponse>` -> `<GetInfoResponse>`.
 */
const stripNamespaces = (xml) => String(xml ?? '').replace(/<(\/?)[\w-]+:([\w-]+)/g, '<$1$2');

/**
 * @description A value, or null when the router does not know it.
 * @param {unknown} value - The raw value.
 * @returns {string|null} The trimmed value.
 */
function known(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = decodeXml(String(value)).trim();
  return UNKNOWN.has(text) || text === '&lt;unknown&gt;' ? null : text;
}

/**
 * @description The inner XML of the first element of a name.
 * @param {string} xml - The XML (namespaces stripped).
 * @param {string} tag - The element name.
 * @returns {string|null} Its content, null when absent.
 */
function element(xml, tag) {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml);
  if (match) {
    return match[1];
  }
  return new RegExp(`<${tag}(?:\\s[^>]*)?/>`).test(xml) ? '' : null;
}

/**
 * @description The simple children of an element: `{ tag: text }`.
 * @param {string} xml - The content of the element.
 * @returns {object} The values (raw text, entities decoded).
 */
function children(xml) {
  const values = {};
  for (const match of String(xml ?? '').matchAll(/<([\w-]+)(?:\s[^>]*)?>([^<]*)<\/\1>/g)) {
    if (!(match[1] in values)) {
      values[match[1]] = decodeXml(match[2]);
    }
  }
  for (const match of String(xml ?? '').matchAll(/<([\w-]+)(?:\s[^>]*)?\/>/g)) {
    if (!(match[1] in values)) {
      values[match[1]] = '';
    }
  }
  return values;
}

/**
 * @description The values of a method's answer: the children of
 * `<MethodResponse>`.
 * @param {string} xml - The answer.
 * @param {string} method - The method.
 * @returns {object|null} The values, null when the answer has no such element.
 * @example
 * readResponse(xml, 'GetInfo').ModelName; // -> 'R7000'
 */
function readResponse(xml, method) {
  const content = element(stripNamespaces(xml), `${method}Response`);
  return content === null ? null : children(content);
}

/**
 * @description A number of an answer.
 * @param {unknown} value - The raw value ("25,350.10" accepted).
 * @returns {number|null} The number.
 */
function toNumber(value) {
  const text = known(value);
  if (text === null) {
    return null;
  }
  const number = Number(text.replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
}

/**
 * @description A 0 / 1 value of an answer.
 * @param {unknown} value - The raw value.
 * @returns {boolean|null} The boolean.
 */
function toBoolean(value) {
  const text = known(value);
  if (text === '1' || text?.toLowerCase() === 'true') {
    return true;
  }
  return text === '0' || text?.toLowerCase() === 'false' ? false : null;
}

/**
 * @description A MAC address written `aa:bb:cc:dd:ee:ff`, or null.
 * @param {unknown} value - The raw MAC (any case, `:` or `-`).
 * @returns {string|null} The MAC.
 * @example
 * normalizeMac('10-68-3F-AA-AA-AA'); // -> '10:68:3f:aa:aa:aa'
 */
function normalizeMac(value) {
  const hex = String(value ?? '')
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '');
  if (hex.length !== 12 || /^0{12}$/.test(hex)) {
    return null;
  }
  return hex.match(/../g).join(':');
}

/**
 * @description A usable IPv4 address, or null (0.0.0.0 is "none").
 * @param {unknown} value - The raw address.
 * @returns {string|null} The address.
 */
function readIp(value) {
  const text = known(value);
  if (!text || !/^\d{1,3}(\.\d{1,3}){3}$/.test(text) || text === '0.0.0.0') {
    return text && text.includes(':') ? text : null;
  }
  return text;
}

/**
 * @description The connection of a client: `wired`, `2g`, `5g`, `6g`, or
 * `wifi` when the band is not told.
 * @param {unknown} value - "wired", "wireless", "2.4GHz", "5GHz"...
 * @returns {string|null} The connection.
 */
function readConnection(value) {
  const text = known(value)?.toLowerCase();
  if (!text) {
    return null;
  }
  if (text.includes('wired') || text.includes('ethernet') || text === 'lan') {
    return 'wired';
  }
  if (text.includes('2.4') || text.includes('2g')) {
    return '2g';
  }
  if (text.includes('6g') || /\b6\s?ghz/.test(text)) {
    return '6g';
  }
  if (text.includes('5')) {
    return '5g';
  }
  return 'wifi';
}

/**
 * @description `Allow` / `Block` of a client: true when allowed.
 * @param {unknown} value - The raw value.
 * @returns {boolean|null} The access.
 */
function readAccess(value) {
  const text = known(value)?.toLowerCase();
  if (text === 'allow') {
    return true;
  }
  return text === 'block' ? false : null;
}

/**
 * @description The identity of the router (DeviceInfo:1#GetInfo).
 * @param {string} xml - The answer.
 * @returns {object} `{ model, name, serial, firmware, hardware, mode }`
 * (`mode`: `router` or `ap`).
 */
function readIdentity(xml) {
  const values = readResponse(xml, 'GetInfo') ?? {};
  return {
    model: known(values.ModelName) ?? known(values.Description),
    name: known(values.DeviceName),
    serial: known(values.SerialNumber),
    firmware: known(values.Firmwareversion)?.replace(/^V/, '') ?? null,
    hardware: known(values.Hardwareversion),
    mode: known(values.DeviceMode) === '1' ? 'ap' : 'router',
  };
}

/**
 * @description The LAN side of the router (LANConfigSecurity:1#GetInfo).
 * @param {string} xml - The answer.
 * @returns {{ ip: string|null, mac: string|null }} The address and MAC.
 */
function readLan(xml) {
  const values = readResponse(xml, 'GetInfo') ?? {};
  return { ip: readIp(values.NewLANIP), mac: normalizeMac(values.NewLANMACAddress) };
}

/**
 * @description The attached devices, format 1 (DeviceInfo:1#GetAttachDevice):
 * `count@index;ip;name;mac;type;linkrate;signal;allow@...`, the last fields
 * only on some models.
 * @param {string} xml - The answer.
 * @returns {Array<object>|null} The clients, null when the answer has no list.
 */
function readAttachedV1(xml) {
  const content = element(stripNamespaces(xml), 'NewAttachDevice');
  if (content === null) {
    return null;
  }
  // The name of an unknown device comes encoded twice: &amp;lt;unknown&amp;gt;.
  const text = decodeXml(content)
    .replace(/&lt;unknown&gt;/g, '<unknown>')
    .trim();
  if (!text || text === '0') {
    return [];
  }
  const entries = text.split('@');
  if (entries.length > 1) {
    entries.shift();
  }
  const clients = [];
  for (const entry of entries) {
    const info = entry.split(';');
    const mac = normalizeMac(info[3]);
    if (info.length < 4 || !mac) {
      continue;
    }
    clients.push({
      mac,
      ip: readIp(info[1]),
      name: known(info[2]),
      connection: readConnection(info[4]),
      linkRate: info.length >= 7 ? toNumber(info[5]) : null,
      signal: info.length >= 7 ? toNumber(info[6]) : null,
      access: info.length >= 8 ? readAccess(info[7]) : null,
      ssid: null,
      type: null,
    });
  }
  return clients;
}

/**
 * @description The attached devices, format 2 (DeviceInfo:1#GetAttachDevice2):
 * one <Device> element per client (Orbi and recent Nighthawk).
 * @param {string} xml - The answer.
 * @returns {Array<object>|null} The clients, null when the answer has no list.
 */
function readAttachedV2(xml) {
  const content = element(stripNamespaces(xml), 'NewAttachDevice');
  if (content === null) {
    return null;
  }
  const clients = [];
  for (const match of content.matchAll(/<Device>([\s\S]*?)<\/Device>/g)) {
    const values = children(match[1]);
    const mac = normalizeMac(values.MAC);
    if (!mac) {
      continue;
    }

    clients.push({
      mac,
      ip: readIp(values.IP),
      name: known(values.Name),
      connection: readConnection(values.ConnectionType),
      linkRate: toNumber(values.Linkspeed),
      signal: toNumber(values.SignalStrength),
      access: readAccess(values.AllowOrBlock),
      ssid: known(values.SSID),
      type: toNumber(values.DeviceType),
    });
  }
  return clients;
}

/**
 * @description The CPU and memory load (DeviceInfo:1#GetSystemInfo).
 * @param {string} xml - The answer.
 * @returns {{ cpu: number|null, memory: number|null }} The loads, in %.
 */
function readSystem(xml) {
  const values = readResponse(xml, 'GetSystemInfo') ?? {};
  const percent = (value) => {
    const number = toNumber(value);
    return number === null ? null : Math.min(100, Math.max(0, number));
  };
  return { cpu: percent(values.NewCPUUtilization), memory: percent(values.NewMemoryUtilization) };
}

/**
 * @description One value of the traffic meter: "6.19", "6.19/0.88" (total /
 * daily average: the total is kept), "25,350.10".
 * @param {unknown} value - The raw value.
 * @returns {number|null} The total, in MB.
 */
function trafficValue(value) {
  const text = known(value);
  if (text === null) {
    return null;
  }
  return toNumber(text.split('/')[0]);
}

/**
 * @description The traffic meter (DeviceConfig:1#GetTrafficMeterStatistics),
 * in MB.
 * @param {string} xml - The answer.
 * @returns {object} `{ todayDown, todayUp, yesterdayDown, yesterdayUp,
 * monthDown, monthUp, lastMonthDown, lastMonthUp }`.
 */
function readTraffic(xml) {
  const values = readResponse(xml, 'GetTrafficMeterStatistics') ?? {};
  return {
    todayDown: trafficValue(values.NewTodayDownload),
    todayUp: trafficValue(values.NewTodayUpload),
    yesterdayDown: trafficValue(values.NewYesterdayDownload),
    yesterdayUp: trafficValue(values.NewYesterdayUpload),
    monthDown: trafficValue(values.NewMonthDownload),
    monthUp: trafficValue(values.NewMonthUpload),
    lastMonthDown: trafficValue(values.NewLastMonthDownload),
    lastMonthUp: trafficValue(values.NewLastMonthUpload),
  };
}

/**
 * @description The internet side: WANIPConnection:1#GetInfo.
 * @param {string} xml - The answer.
 * @returns {{ ip: string|null, gateway: string|null, type: string|null }} The WAN.
 */
function readWanInfo(xml) {
  const values = readResponse(xml, 'GetInfo') ?? {};
  return {
    ip: readIp(values.NewExternalIPAddress),
    gateway: readIp(values.NewDefaultGateway),
    type: known(values.NewConnectionType) ?? known(values.NewAddressingType),
  };
}

/**
 * @description The Ethernet link of the internet port
 * (WANEthernetLinkConfig:1#GetEthernetLinkStatus).
 * @param {string} xml - The answer.
 * @returns {boolean|null} True when the link is up.
 */
function readLink(xml) {
  const values = readResponse(xml, 'GetEthernetLinkStatus') ?? {};
  const text = known(values.NewEthernetLinkStatus)?.toLowerCase();
  if (text === 'up') {
    return true;
  }
  return text === 'down' ? false : null;
}

/**
 * @description The internet status out of the link and the address: no
 * address while the link is up is "connecting". The router tells no more:
 * an outage past the modem shows as connected.
 * @param {boolean|null} link - readLink, null when unknown.
 * @param {string|null|undefined} ip - The WAN address, undefined when unknown.
 * @returns {string} connected, connecting, disconnected or unknown.
 */
function internetStatus(link, ip) {
  if (link === false) {
    return 'disconnected';
  }
  if (ip === undefined) {
    return link === true ? 'connected' : 'unknown';
  }
  if (ip) {
    return 'connected';
  }
  return link === true ? 'connecting' : 'disconnected';
}

/**
 * @description The single 0 / 1 value of a getter (guest Wi-Fi, QoS...).
 * @param {string} xml - The answer.
 * @param {string} method - The method.
 * @returns {boolean|null} The state.
 */
function readToggle(xml, method) {
  const values = readResponse(xml, method);
  if (!values) {
    return null;
  }
  const entries = Object.values(values);
  return entries.length === 0 ? null : toBoolean(entries[0]);
}

/**
 * @description The firmware check (DeviceConfig:1#CheckNewFirmware).
 * @param {string} xml - The answer.
 * @param {string|null} [installed] - The installed version, when the answer omits it.
 * @returns {{ current: string|null, latest: string|null, available: boolean,
 * notes: string|null }} The result.
 */
function readFirmware(xml, installed = null) {
  const values = readResponse(xml, 'CheckNewFirmware') ?? {};
  const clean = (value) => known(value)?.replace(/^V/, '') ?? null;
  const current = clean(values.CurrentVersion) ?? installed;
  const latest = clean(values.NewVersion);
  return {
    current,
    latest,
    available: Boolean(latest && latest !== current),
    notes: known(values.ReleaseNote),
  };
}

/**
 * @description The features the router announces
 * (DeviceInfo:1#GetSupportFeatureListXML): `{ SpeedTest: '2', ... }`.
 * @param {string} xml - The answer.
 * @returns {object} The features.
 */
function readFeatureList(xml) {
  const content = element(stripNamespaces(xml), 'features');
  return content === null ? {} : children(content);
}

/**
 * @description Whether a feature of the list is supported (any value but 0).
 * @param {object} features - readFeatureList.
 * @param {string} name - The feature.
 * @returns {boolean} True when supported.
 */
const supports = (features, name) => {
  const value = known(features?.[name]);
  return value !== null && value !== '0';
};

/**
 * @description A speed test result (AdvancedQoS:1#GetOOKLASpeedTestResult).
 * @param {string} xml - The answer.
 * @returns {{ down: number|null, up: number|null, ping: number|null }} Mbit/s and ms.
 */
function readSpeedTest(xml) {
  const values = readResponse(xml, 'GetOOKLASpeedTestResult') ?? {};
  return {
    down: toNumber(values.NewOOKLADownlinkBandwidth),
    up: toNumber(values.NewOOKLAUplinkBandwidth),
    ping: toNumber(values.AveragePing),
  };
}

export {
  decodeXml,
  stripNamespaces,
  known,
  readResponse,
  toNumber,
  toBoolean,
  normalizeMac,
  readIp,
  readConnection,
  readAccess,
  readIdentity,
  readLan,
  readAttachedV1,
  readAttachedV2,
  readSystem,
  readTraffic,
  readWanInfo,
  readLink,
  internetStatus,
  readToggle,
  readFirmware,
  readFeatureList,
  supports,
  readSpeedTest,
};
