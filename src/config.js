// -----------------------------------------------------------------------------
// Configuration of the NETGEAR integration.
//
// Fields of the config_schema:
//   - `host`             address of the router (192.168.1.1, routerlogin.net);
//   - `port`             port of its SOAP API: `auto` (5000, 80, 443, 5555
//                        tried in turn) or one of them;
//   - `username`         the router administrator account (admin);
//   - `password`         its password (a `secret`: never sent back to the UI,
//                        never logged);
//   - `poll_interval`    how often the router is read, in seconds;
//   - `network_devices`  which clients are offered as presence devices:
//                        `named` (a name known to the router), `all`, `none`;
//   - `absence_delay`    minutes a client must be gone before it is absent;
//   - `language`         language of the texts Gladys does not ask for in a
//                        language (feature names, scene summaries): `auto`
//                        follows the language of the last widget request.
//
// Internal key, outside the config_schema (never shown in the UI):
//   - `last_language`    language of the last widget request, kept for the
//                        texts after a restart.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';
import { PORT_CHOICES } from './netgear-api.js';

// A round is five small SOAP calls; the SOAP server of a home router answers
// one at a time: 30 s follows a link that drops without loading it.
const POLL_INTERVAL = { min: 10, max: 300, default: 30 };
// A phone asleep on Wi-Fi leaves the client list of the router for a while.
const ABSENCE_DELAY = { min: 1, max: 60, default: 5 };
const NETWORK_DEVICES = ['named', 'all', 'none'];
const DEFAULT_NETWORK_DEVICES = 'named';
const AUTO_LANGUAGE = 'auto';
const DEFAULT_PORT = 'auto';
const DEFAULT_USERNAME = 'admin';
const INTERNAL_KEYS = { language: 'last_language' };

/**
 * @description Read a bounded number field, falling back to its default.
 * @param {unknown} raw - The raw value (the form can send numbers as strings).
 * @param {{ min: number, max: number, default: number }} bounds - The bounds.
 * @returns {number} The value.
 * @example
 * readNumber('60', POLL_INTERVAL); // -> 60
 */
function readNumber(raw, bounds) {
  const value = Number(raw ?? bounds.default);
  if (raw === '' || !Number.isFinite(value)) {
    return bounds.default;
  }
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

const readString = (raw) => (typeof raw === 'string' ? raw.trim() : '');

/**
 * @description The address of the router: a host name or an IP address,
 * without scheme, port nor path. Null when it cannot be one.
 * @param {unknown} raw - What the user typed.
 * @returns {string|null} The address.
 * @example
 * normalizeHost('http://192.168.1.1:5000/'); // -> '192.168.1.1'
 */
function normalizeHost(raw) {
  const text = readString(raw);
  if (!text) {
    return null;
  }
  // A bare IPv6 address.
  if (/^[0-9a-f:]+$/i.test(text) && text.includes('::')) {
    return text.toLowerCase();
  }
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `http://${text}`);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    return host || null;
  } catch {
    return null;
  }
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {object} The config: `{ host, port, username, password,
 * pollInterval (s), networkDevices, absenceDelay (min), language }`.
 * @example
 * normalizeConfig({ host: '192.168.1.1', username: 'admin', password: 'p' });
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  return {
    host: normalizeHost(config.host),
    port: PORT_CHOICES.includes(String(config.port ?? '')) ? String(config.port) : DEFAULT_PORT,
    username: readString(config.username) || DEFAULT_USERNAME,
    // A secret is kept as typed.
    password: typeof config.password === 'string' ? config.password : '',
    pollInterval: readNumber(config.poll_interval, POLL_INTERVAL),
    networkDevices: NETWORK_DEVICES.includes(config.network_devices)
      ? config.network_devices
      : DEFAULT_NETWORK_DEVICES,
    absenceDelay: readNumber(config.absence_delay, ABSENCE_DELAY),
    language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE,
  };
}

/**
 * @description Whether the router can be read.
 * @param {object} config - A normalized config.
 * @returns {boolean} True with an address, a user name and a password.
 */
const hasCredentials = (config) => Boolean(config.host && config.username && config.password);

/**
 * @description Read the stored language of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 * @example
 * readLanguage({ last_language: 'fr' }, 'en'); // -> 'fr'
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback;
}

export {
  POLL_INTERVAL,
  ABSENCE_DELAY,
  NETWORK_DEVICES,
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  DEFAULT_PORT,
  DEFAULT_USERNAME,
  normalizeHost,
  normalizeConfig,
  hasCredentials,
  readLanguage,
};
