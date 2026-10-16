// -----------------------------------------------------------------------------
// Client of the SOAP API of a NETGEAR router (Nighthawk, Orbi and most of the
// home routers of the brand): the local API the NETGEAR apps (Genie, Nighthawk
// app, Orbi app) use, served at /soap/server_sa/.
//
// Written after the pynetgear Python library (MatMaul/pynetgear, MIT, the
// library of the Home Assistant NETGEAR integration), see NOTICE:
//   - every call is a POST of a SOAP envelope, the action in the SOAPAction
//     header (`urn:NETGEAR-ROUTER:service:<Service>:1#<Method>`), a fixed
//     SessionID in the SOAP header;
//   - the answer carries a <ResponseCode>: 0 / 000 / 0000 (and 1, 2, 3 for a
//     few methods) is a success, 401 an expired or missing session, 501 a
//     method this model does not have, 404 a service it does not have, 503
//     a router too busy to answer (tried again once);
//   - login, version 2 (recent firmwares): DeviceConfig:1#SOAPLogin, the
//     session is the cookie of the answer; version 1 (older ones):
//     ParentalControl:1#Authenticate, the session is bound to the IP address
//     of the client and checked with a DeviceInfo:1#GetInfo;
//   - the port depends on the model: 5000 (http) for most, 80 (http) for
//     Orbi, 443 or 5555 (https) for a few. `auto` tries them in turn and
//     keeps the first one that answers;
//   - a write is framed by DeviceConfig:1#ConfigurationStarted and
//     #ConfigurationFinished (not after a Reboot).
//
// node:http(s) rather than fetch: the HTTPS certificate of the router is
// self-signed, and only node:https skips its check without a dependency. All
// calls go one at a time: the SOAP server of a home router handles a single
// request well, several badly. Errors carry a `kind` the app turns into a
// message:
//   auth         wrong user name or password
//   not_found    nothing answers like a NETGEAR SOAP API at this address/port
//   unsupported  this model or firmware has no such method (501, 404)
//   unreachable  network error, timeout
//   http         any other status or answer
// -----------------------------------------------------------------------------

import https from 'node:https';
import http from 'node:http';

const TIMEOUT_MS = 15000;
const SERVICE_PREFIX = 'urn:NETGEAR-ROUTER:service:';
// The routers do not check it; pynetgear sends the one captured from the app.
const SESSION_ID = 'A7D88AE69687E58D9A00';
const USER_AGENT = 'gladys-netgear';
// The ports of the SOAP API, in the order `auto` tries them.
const ENDPOINTS = [
  { port: 5000, ssl: false },
  { port: 80, ssl: false },
  { port: 443, ssl: true },
  { port: 5555, ssl: true },
];
const PORT_CHOICES = ['auto', ...ENDPOINTS.map((endpoint) => String(endpoint.port))];
// After a refused password, no new login before this delay (or a new
// configuration): every attempt shows in the logs of the router.
const AUTH_RETRY_MS = 5 * 60 * 1000;
// A busy router (503) or a truncated answer is tried again once, after this.
const RETRY_DELAY_MS = 3000;

class NetgearError extends Error {
  /**
   * @param {string} kind - auth, not_found, unsupported, unreachable, http.
   * @param {string} message - The message (never carries the password).
   * @param {object} [extra] - `{ status, code }`.
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'NetgearError';
    this.kind = kind;
    this.status = extra.status;
    this.code = extra.code;
  }
}

/**
 * @description Escape a value for an XML text node.
 * @param {unknown} value - The value.
 * @returns {string} The escaped text.
 * @example
 * escapeXml('a<b&c'); // -> 'a&lt;b&amp;c'
 */
function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @description The SOAP envelope of a call.
 * @param {string} service - `DeviceInfo:1`.
 * @param {string} method - `GetInfo`.
 * @param {object} [params] - `{ NewEnable: '1' }`.
 * @returns {string} The envelope.
 */
function envelope(service, method, params = {}) {
  const fields = Object.entries(params)
    .map(([key, value]) => `<${key}>${escapeXml(value)}</${key}>\n`)
    .join('');
  return soapEnvelope(
    `<SOAP-ENV:Body>\n<M1:${method} xmlns:M1="${SERVICE_PREFIX}${service}">\n${fields}</M1:${method}>\n</SOAP-ENV:Body>`,
  );
}

/**
 * @description Wrap a SOAP body in the envelope the routers expect.
 * @param {string} body - The `<SOAP-ENV:Body>` element.
 * @returns {string} The envelope.
 */
const soapEnvelope = (body) =>
  `<?xml version="1.0" encoding="utf-8" standalone="no"?>
<SOAP-ENV:Envelope xmlns:SOAPSDK1="http://www.w3.org/2001/XMLSchema"
  xmlns:SOAPSDK2="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:SOAPSDK3="http://schemas.xmlsoap.org/soap/encoding/"
  xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
<SOAP-ENV:Header>
<SessionID>${SESSION_ID}</SessionID>
</SOAP-ENV:Header>
${body}
</SOAP-ENV:Envelope>
`;

/**
 * @description The envelope of the version 1 login (no namespace on the method).
 * @param {string} username - The user name.
 * @param {string} password - The password.
 * @returns {string} The envelope.
 */
const loginV1Envelope = (username, password) =>
  soapEnvelope(
    `<SOAP-ENV:Body>\n<Authenticate>\n  <NewUsername>${escapeXml(username)}</NewUsername>\n  <NewPassword>${escapeXml(password)}</NewPassword>\n</Authenticate>\n</SOAP-ENV:Body>`,
  );

/**
 * @description The <ResponseCode> of an answer.
 * @param {string} body - The answer.
 * @returns {number|null} The code, null when the answer has none.
 * @example
 * responseCode('<ResponseCode>000</ResponseCode>'); // -> 0
 */
function responseCode(body) {
  const match = /<(?:[\w-]+:)?ResponseCode>\s*(\d+)\s*</.exec(String(body ?? ''));
  return match ? Number(match[1]) : null;
}

/**
 * @description Whether an answer is a success (codes 0 to 3, as pynetgear).
 * @param {{ status: number, body: string }} answer - The answer.
 * @returns {boolean} True for a success.
 */
const isValid = (answer) => {
  const code = responseCode(answer.body);
  return answer.status === 200 && code !== null && code <= 3;
};

const isUnauthorized = (answer) => answer.status === 401 || responseCode(answer.body) === 401;

/**
 * @description The error of a failed connection.
 * @param {Error} err - The socket error.
 * @returns {NetgearError} The error.
 */
function networkError(err) {
  if (err instanceof NetgearError) {
    return err;
  }
  return new NetgearError('unreachable', `Router unreachable: ${err.code ?? err.message}`);
}

/**
 * @description The default transport: one HTTP(S) request, its whole body.
 * The router's certificate is self-signed: it is never checked.
 * @param {object} options - `{ url, method, headers, body, timeoutMs }`.
 * @returns {Promise<{ status: number, body: string, headers: object }>} The answer.
 */
function nodeRequest({ url, method, headers, body, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === 'http:' ? http : https;
    const req = lib.request(
      target,
      { method, headers, rejectUnauthorized: false, timeout: timeoutMs },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString('utf8'),
            headers: res.headers,
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('timeout', () =>
      req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })),
    );
    req.on('error', reject);
    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * @description The URL of the SOAP API on an endpoint.
 * @param {string} host - The address of the router (IPv6 without brackets accepted).
 * @param {{ port: number, ssl: boolean }} endpoint - The endpoint.
 * @returns {string} The URL.
 * @example
 * soapUrl('192.168.1.1', { port: 5000, ssl: false }); // -> 'http://192.168.1.1:5000/soap/server_sa/'
 */
function soapUrl(host, { port, ssl }) {
  const name = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return `${ssl ? 'https' : 'http'}://${name}:${port}/soap/server_sa/`;
}

/**
 * @description The endpoints to try for a port setting.
 * @param {string} port - `auto` or a port of ENDPOINTS.
 * @param {object|null} known - The endpoint that answered last, tried first.
 * @returns {Array<{ port: number, ssl: boolean }>} The endpoints.
 */
function candidates(port, known) {
  if (port !== 'auto') {
    const chosen = ENDPOINTS.find((endpoint) => String(endpoint.port) === String(port));
    return chosen ? [chosen] : [ENDPOINTS[0]];
  }
  const first = known ? ENDPOINTS.filter((e) => e.port === known.port && e.ssl === known.ssl) : [];
  return [...first, ...ENDPOINTS.filter((endpoint) => !first.includes(endpoint))];
}

/**
 * @description Create the router client.
 * @param {object} options - Options.
 * @param {Function} options.getConfig - `() => ({ host, port, username, password })`.
 * @param {Function} [options.request] - Transport (tests): same contract as nodeRequest.
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {Function} [options.sleep] - `(ms) => Promise`.
 * @returns {object} The client.
 * @example
 * const api = createNetgearClient({ getConfig: () => config });
 * const xml = await api.call('DeviceInfo:1', 'GetInfo');
 */
function createNetgearClient({
  getConfig,
  request = nodeRequest,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  // { port, ssl, login: 'v1' | 'v2' } of the session, null before a login.
  let endpoint = null;
  let cookie = null;
  let loggedIn = false;
  // The account the session belongs to.
  let sessionFor = null;
  let blockedUntil = 0;
  let blockedError = null;
  // One call at a time.
  let queue = Promise.resolve();

  const accountOf = (config) =>
    `${config.host}\n${config.port}\n${config.username}\n${config.password}`;

  /**
   * @description Run a task once the previous ones are done.
   * @param {Function} task - `async () => value`.
   * @returns {Promise<unknown>} Its result.
   */
  function exclusive(task) {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  }

  /**
   * @description Send one envelope to an endpoint.
   * @param {object} target - `{ port, ssl }`.
   * @param {string} service - The service, for the SOAPAction.
   * @param {string} method - The method, for the SOAPAction.
   * @param {string} body - The envelope.
   * @param {object} [options] - `{ auth, timeoutMs }`.
   * @returns {Promise<{ status: number, body: string, headers: object }>} The answer.
   */
  async function send(target, service, method, body, { auth = true, timeoutMs = TIMEOUT_MS } = {}) {
    const { host } = getConfig();
    try {
      return await request({
        url: soapUrl(host, target),
        method: 'POST',
        headers: {
          SOAPAction: `${SERVICE_PREFIX}${service}#${method}`,
          'Cache-Control': 'no-cache',
          'User-Agent': USER_AGENT,
          // What pynetgear sends; the routers do not read it.
          'Content-Type': 'multipart/form-data',
          'Content-Length': Buffer.byteLength(body),
          ...(auth && cookie ? { Cookie: cookie } : {}),
        },
        body,
        timeoutMs,
      });
    } catch (err) {
      throw networkError(err);
    }
  }

  /**
   * @description Log in on one endpoint: version 2 first, then version 1.
   * @param {{ port: number, ssl: boolean }} target - The endpoint.
   * @returns {Promise<string>} The login version, `v2` or `v1`.
   */
  async function loginAt(target) {
    const { username, password } = getConfig();
    cookie = null;
    const v2 = await send(
      target,
      'DeviceConfig:1',
      'SOAPLogin',
      envelope('DeviceConfig:1', 'SOAPLogin', { Username: username, Password: password }),
      { auth: false },
    );
    const setCookie = v2.headers?.['set-cookie'];
    if (isValid(v2) && setCookie) {
      // Sent back as received, as pynetgear does: the routers accept it.
      cookie = Array.isArray(setCookie) ? setCookie.join(', ') : String(setCookie);
      return 'v2';
    }
    const v1 = await send(
      target,
      'ParentalControl:1',
      'Authenticate',
      loginV1Envelope(username, password),
      { auth: false },
    );
    // The version 1 session is bound to the address of the client: GetInfo checks it.
    const check = await send(
      target,
      'DeviceInfo:1',
      'GetInfo',
      envelope('DeviceInfo:1', 'GetInfo'),
    );
    if (isValid(check)) {
      return 'v1';
    }
    const soap = [v2, v1, check].some(
      (answer) => responseCode(answer.body) !== null || answer.status === 401,
    );
    throw soap
      ? new NetgearError('auth', 'The router refused the user name or the password')
      : new NetgearError(
          'not_found',
          `No NETGEAR SOAP API on port ${target.port} (HTTP ${v2.status})`,
          { status: v2.status },
        );
  }

  /**
   * @description Log in, trying the endpoints of the port setting in turn.
   * @returns {Promise<void>}
   */
  async function login() {
    const config = getConfig();
    if (!config.host || !config.username || !config.password) {
      throw new NetgearError('auth', 'No router address, user name or password configured');
    }
    if (now() < blockedUntil && blockedError) {
      throw blockedError;
    }
    let refused = null;
    let last = null;
    for (const target of candidates(config.port, endpoint)) {
      try {
        const version = await loginAt(target);
        endpoint = { port: target.port, ssl: target.ssl, login: version };
        loggedIn = true;
        sessionFor = accountOf(config);
        blockedUntil = 0;
        blockedError = null;
        return;
      } catch (err) {
        refused = err.kind === 'auth' ? err : refused;
        last = err;
      }
    }
    if (refused) {
      blockedUntil = now() + AUTH_RETRY_MS;
      blockedError = refused;
      throw refused;
    }
    throw last;
  }

  /**
   * @description Log in when there is no session for the current account.
   * @returns {Promise<void>}
   */
  async function session() {
    if (loggedIn && sessionFor === accountOf(getConfig())) {
      return;
    }
    loggedIn = false;
    if (sessionFor !== accountOf(getConfig())) {
      endpoint = null;
    }
    await login();
  }

  /**
   * @description One authenticated call, outside the queue.
   * @param {string} service - `DeviceInfo:1`.
   * @param {string} method - `GetInfo`.
   * @param {object} [params] - The parameters.
   * @param {object} [options] - `{ timeoutMs, accept }`: `accept(code)` takes
   * an answer the default rule refuses (the speed test answers 501 for an old
   * result).
   * @returns {Promise<string>} The body of the answer.
   */
  async function callNow(service, method, params = {}, { timeoutMs, accept } = {}) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await session();
      const answer = await send(
        endpoint,
        service,
        method,
        envelope(service, method, params),
        timeoutMs ? { timeoutMs } : {},
      );
      const code = responseCode(answer.body);
      if (isValid(answer) || (answer.status === 200 && accept?.(code))) {
        return answer.body;
      }
      if (isUnauthorized(answer)) {
        // The session expired (reboot, another login): log in again, once.
        loggedIn = false;
        continue;
      }
      if (attempt === 0 && (answer.status === 503 || code === 503 || code === null)) {
        // Busy, or an answer without a code: pynetgear tries again once too.
        if (answer.status === 200 || answer.status === 503) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
      }
      if (answer.status === 501 || code === 501 || answer.status === 404 || code === 404) {
        throw new NetgearError('unsupported', `${service}#${method} is not supported`, {
          status: answer.status,
          code,
        });
      }
      throw new NetgearError(
        'http',
        `The router answered ${answer.status} (code ${code ?? 'none'}) to ${service}#${method}`,
        { status: answer.status, code },
      );
    }
    throw new NetgearError('auth', `The router keeps refusing the session on ${method}`);
  }

  return {
    /**
     * @description One authenticated call.
     * @param {string} service - `DeviceInfo:1`.
     * @param {string} method - `GetInfo`.
     * @param {object} [params] - The parameters.
     * @param {object} [options] - `{ timeoutMs, accept }`.
     * @returns {Promise<string>} The answer (XML).
     */
    call: (service, method, params, options) =>
      exclusive(() => callNow(service, method, params, options)),
    /**
     * @description A write, framed by ConfigurationStarted and
     * ConfigurationFinished (not after a reboot, the router is gone).
     * @param {string} service - The service.
     * @param {string} method - The method.
     * @param {object} [params] - The parameters.
     * @returns {Promise<string>} The answer of the method.
     */
    set: (service, method, params = {}) =>
      exclusive(async () => {
        await callNow('DeviceConfig:1', 'ConfigurationStarted', { NewSessionID: SESSION_ID });
        try {
          return await callNow(service, method, params);
        } finally {
          if (method !== 'Reboot') {
            await callNow('DeviceConfig:1', 'ConfigurationFinished', {
              NewStatus: 'ChangesApplied',
            }).catch(() => {});
          }
        }
      }),
    /** @description Forget the session and the endpoint (configuration changed). */
    reset() {
      endpoint = null;
      cookie = null;
      loggedIn = false;
      sessionFor = null;
      blockedUntil = 0;
      blockedError = null;
    },
    /** @returns {object|null} `{ port, ssl, login }` of the session. */
    endpoint: () => (endpoint ? { ...endpoint } : null),
    hasSession: () => loggedIn,
  };
}

export {
  createNetgearClient,
  NetgearError,
  nodeRequest,
  envelope,
  escapeXml,
  responseCode,
  soapUrl,
  candidates,
  ENDPOINTS,
  PORT_CHOICES,
  SERVICE_PREFIX,
  SESSION_ID,
  AUTH_RETRY_MS,
};
