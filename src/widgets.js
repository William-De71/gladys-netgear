// -----------------------------------------------------------------------------
// Dashboard widgets of the NETGEAR integration.
//
//   - `overview`  the router at a glance: CPU and memory gauges (when the
//                 model reports them), connected clients, the internet link,
//                 public address, guest Wi-Fi and firmware, and two buttons
//                 (check for a firmware update, reboot with a confirmation);
//   - `traffic`   the traffic meter of the router: today and this month,
//                 down and up, their history once the router device exists
//                 in Gladys, the last speed test and a button to run one;
//   - `network`   the clients connected now (or the ones gone), with their
//                 connection (wired, Wi-Fi band, signal, blocked).
//
// The contents come from the snapshots of the last reading: a widget never
// costs a router call. Every text exists in the four languages (the content
// is cached per language and units). Content budget of a card: 8
// components, 1 main one (chart or card-list), 6 tiles, 2 texts, 1 status,
// 4 buttons.
// -----------------------------------------------------------------------------

import { t, formatNumber, ago } from './i18n.js';
import { clientName } from './device.js';
import { connectionName, firmwareSummary } from './events.js';

const WIDGETS = { OVERVIEW: 'overview', TRAFFIC: 'traffic', NETWORK: 'network' };
const WIDGET_ACTIONS = {
  CHECK_UPDATES: 'check_updates',
  REBOOT: 'reboot',
  SPEED_TEST: 'speed_test',
};

const CHART_INTERVALS = [
  'last-hour',
  'last-twelve-hours',
  'last-day',
  'last-three-days',
  'last-week',
];
const DEFAULT_INTERVAL = 'last-day';
const NETWORK_SHOW = ['present', 'absent', 'all'];
const DEFAULT_SHOW = 'present';
const MAX_LIST_ITEMS = 8;
const TTL = { min: 10, max: 3600, message: 60 };

const INTERNET_COLORS = {
  connected: 'success',
  connecting: 'warning',
  disconnected: 'danger',
  unknown: 'neutral',
};

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 * @example
 * clip('A very long title', 10); // -> 'A very lo…'
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Its freshness.
 * @returns {object} The content.
 * @example
 * messageContent('The router has not been read yet');
 */
function messageContent(message, ttl = TTL.message) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: clip(message, 300) }],
  };
}

const ttlOf = (pollSeconds) => Math.min(TTL.max, Math.max(TTL.min, Math.round(pollSeconds)));

/**
 * @description A tile color for a load in %.
 * @param {number|null} value - The load.
 * @returns {string} The color.
 */
function loadColor(value) {
  if (typeof value !== 'number') {
    return 'neutral';
  }
  if (value >= 90) {
    return 'danger';
  }
  return value >= 75 ? 'warning' : 'success';
}

/**
 * @description A volume in MB, written in MB, GB or TB.
 * @param {number|null} megabytes - The volume.
 * @param {string} language - The language.
 * @returns {{ value: string, unit: string }} The text and its unit.
 * @example
 * formatVolume(25350.1, 'fr'); // -> { value: '25,4', unit: 'Go' }
 */
function formatVolume(megabytes, language) {
  if (typeof megabytes !== 'number') {
    return { value: '–', unit: t('unitMB', language) };
  }
  if (megabytes >= 1000000) {
    return { value: formatNumber(megabytes / 1000000, language, 2), unit: t('unitTB', language) };
  }
  if (megabytes >= 1000) {
    return { value: formatNumber(megabytes / 1000, language, 1), unit: t('unitGB', language) };
  }
  return { value: formatNumber(megabytes, language, 0), unit: t('unitMB', language) };
}

/**
 * @description The guest Wi-Fi row value: "2.4 GHz on · 5 GHz off".
 * @param {object} toggles - `{ guest_wifi_2g, guest_wifi_5g }`.
 * @param {string} language - The language.
 * @returns {{ value: string, on: boolean }|null} The row, null when unknown.
 */
function guestWifi(toggles = {}, language) {
  const bands = [
    ['2g', toggles.guest_wifi_2g],
    ['5g', toggles.guest_wifi_5g],
  ].filter(([, value]) => typeof value === 'boolean');
  if (bands.length === 0) {
    return null;
  }
  return {
    value: bands
      .map(([band, on]) => `${t(`band_${band}`, language)} ${t(on ? 'on' : 'off', language)}`)
      .join(' · '),
    on: bands.some(([, on]) => on),
  };
}

/**
 * @description The `overview` widget.
 * @param {object} options - Options.
 * @param {object} options.router - The router snapshot.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now, in ms.
 * @param {number} options.fetchedAt - Time of the reading, in ms.
 * @param {number} options.pollSeconds - The reading interval.
 * @returns {object} The content.
 * @example
 * buildOverviewWidget({ router, language: 'fr', now, fetchedAt, pollSeconds: 30 });
 */
function buildOverviewWidget({ router, language, now, fetchedAt, pollSeconds }) {
  const identity = router.identity ?? {};
  const components = [
    {
      type: 'text',
      variant: 'caption',
      text: clip(
        t('overviewCaption', language, {
          model: identity.model ?? 'NETGEAR',
          ip: router.lan?.ip ?? '?',
          ago: ago(fetchedAt, now, language),
        }),
        80,
      ),
    },
  ];
  // An unknown load is no gauge at all rather than a misleading 0 %.
  [
    [router.cpu, 'tileCpu', 'cpu'],
    [router.memory, 'tileMemory', 'layers'],
  ]
    .filter(([value]) => typeof value === 'number')
    .forEach(([value, label, icon]) =>
      components.push({
        type: 'gauge',
        value,
        min: 0,
        max: 100,
        unit: '%',
        label: t(label, language),
        icon,
        color: loadColor(value),
      }),
    );
  if (typeof router.clientsOnline === 'number') {
    components.push({
      type: 'value',
      value: String(router.clientsOnline),
      label: t('tileClients', language),
      icon: 'smartphone',
      color: 'primary',
    });
  }

  const wan = router.wan ?? {};
  const guest = guestWifi(router.toggles, language);
  const firmware = router.firmware;
  components.push({
    type: 'status',
    items: [
      {
        label: t('rowInternet', language),
        value: t(`internet_${wan.status ?? 'unknown'}`, language),
        icon: 'globe',
        color: INTERNET_COLORS[wan.status ?? 'unknown'],
      },
      ...(wan.ip
        ? [{ label: t('rowWanIp', language), value: clip(wan.ip, 40), icon: 'map-pin' }]
        : []),
      ...(guest
        ? [
            {
              label: t('rowGuestWifi', language),
              value: clip(guest.value, 40),
              icon: 'wifi',
              color: guest.on ? 'info' : 'neutral',
            },
          ]
        : []),
      {
        label: t('rowFirmware', language),
        value: clip(
          firmware?.available
            ? t('updateAvailable', language, { version: firmware.latest ?? '' }).trim()
            : (identity.firmware ?? '?'),
          40,
        ),
        icon: 'download',
        color: firmware?.available ? 'warning' : firmware ? 'success' : 'neutral',
      },
    ],
  });

  components.push(
    {
      type: 'button',
      label: t('buttonCheckUpdates', language),
      icon: 'refresh-cw',
      style: 'secondary',
      action: { key: WIDGET_ACTIONS.CHECK_UPDATES },
    },
    {
      type: 'button',
      label: t('buttonReboot', language),
      icon: 'power',
      style: 'danger',
      action: { key: WIDGET_ACTIONS.REBOOT, confirm: true },
    },
  );
  return { ttl_seconds: ttlOf(pollSeconds), components };
}

/**
 * @description The settings of the `traffic` widget.
 * @param {object} [settings] - The raw settings.
 * @returns {{ interval: string }} The settings.
 */
const readTrafficSettings = (settings = {}) => ({
  interval: CHART_INTERVALS.includes(settings.interval) ? settings.interval : DEFAULT_INTERVAL,
});

/**
 * @description The `traffic` widget.
 * @param {object} options - Options.
 * @param {object} options.router - The router snapshot.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now, in ms.
 * @param {number} options.pollSeconds - The reading interval.
 * @param {string} [options.interval] - The chart period.
 * @param {Function|null} [options.featureId] - `(key) => external id` of the
 * router features, null when its device or its traffic features do not exist
 * in Gladys (no chart then: the core has no history of them).
 * @returns {object} The content.
 */
function buildTrafficWidget({
  router,
  language,
  now,
  pollSeconds,
  interval = DEFAULT_INTERVAL,
  featureId = null,
}) {
  const traffic = router.traffic;
  const components = [];
  const known = traffic && Object.values(traffic).some((value) => typeof value === 'number');
  if (known) {
    components.push({
      type: 'text',
      variant: 'caption',
      text: clip(
        t('trafficCaption', language, {
          state:
            router.toggles?.traffic_meter === false
              ? t('trafficMeterOff', language)
              : t('trafficMeterOn', language),
        }),
        80,
      ),
    });
    [
      ['todayDown', 'tileTodayDown', 'download', 'info'],
      ['todayUp', 'tileTodayUp', 'upload', 'primary'],
      ['monthDown', 'tileMonthDown', 'download', 'info'],
      ['monthUp', 'tileMonthUp', 'upload', 'primary'],
    ].forEach(([field, label, icon, color]) =>
      components.push({
        type: 'value',
        ...formatVolume(traffic[field], language),
        label: t(label, language),
        icon,
        color,
      }),
    );
    if (featureId) {
      components.push({
        type: 'chart',
        device_features: [featureId('download_today'), featureId('upload_today')],
        interval,
        chart_type: 'area',
        title: t('chartToday', language),
        unit: t('unitMB', language),
      });
    }
  } else {
    components.push({ type: 'text', variant: 'body', text: t('noTraffic', language) });
  }
  const speed = router.speedTest;
  const mbps = (value) =>
    typeof value === 'number' ? `${formatNumber(value, language, 1)} Mbit/s` : '?';
  components.push({
    type: 'status',
    items: speed
      ? [
          {
            label: t('rowSpeedDown', language),
            value: mbps(speed.down),
            icon: 'download',
            color: 'info',
          },
          {
            label: t('rowSpeedUp', language),
            value: mbps(speed.up),
            icon: 'upload',
            color: 'info',
          },
          {
            label: t('rowPing', language),
            value: clip(
              [
                typeof speed.ping === 'number'
                  ? `${formatNumber(speed.ping, language, 0)} ms`
                  : '?',
                speed.at ? ago(speed.at, now, language) : null,
              ]
                .filter(Boolean)
                .join(' · '),
              40,
            ),
            icon: 'clock',
          },
        ]
      : [
          {
            label: t('rowSpeedTest', language),
            value: t('speedTestNever', language),
            icon: 'activity',
            color: 'neutral',
          },
        ],
  });
  components.push({
    type: 'button',
    label: t('buttonSpeedTest', language),
    icon: 'zap',
    style: 'secondary',
    action: { key: WIDGET_ACTIONS.SPEED_TEST, confirm: true },
  });
  return { ttl_seconds: ttlOf(pollSeconds), components };
}

/**
 * @description The settings of the `network` widget.
 * @param {object} [settings] - The raw settings.
 * @returns {{ show: string }} The settings.
 */
const readNetworkSettings = (settings = {}) => ({
  show: NETWORK_SHOW.includes(settings.show) ? settings.show : DEFAULT_SHOW,
});

/**
 * @description The badge text of a client's connection.
 * @param {string|null} connection - wired, 2g, 5g, 6g, wifi.
 * @param {string} language - The language.
 * @returns {string} "Wired", "5 GHz".
 */
function connectionBadge(connection, language) {
  if (!connection) {
    return t('badgeHere', language);
  }
  if (connection === 'wired') {
    return t('badgeWired', language);
  }
  return connection === 'wifi' ? 'Wi-Fi' : t(`band_${connection}`, language);
}

/**
 * @description The second line of a client: IP, network, signal.
 * @param {object} client - The client snapshot.
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The line.
 */
function clientDetails(client, now, language) {
  if (!client.present) {
    return [client.ip, client.lastSeen && ago(client.lastSeen, now, language)]
      .filter(Boolean)
      .join(' · ');
  }
  return [
    client.ip,
    client.ssid ??
      (client.connection !== 'wired' ? connectionName(client.connection, language) : null),
    typeof client.signal === 'number' && client.connection !== 'wired'
      ? t('signalValue', language, { value: client.signal })
      : null,
    typeof client.linkRate === 'number' && client.linkRate > 0
      ? `${formatNumber(client.linkRate, language, 0)} Mbit/s`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * @description The `network` widget: clients with a name first, then by name.
 * @param {object} options - Options.
 * @param {Array<object>} options.clients - The client snapshots.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now, in ms.
 * @param {number} options.pollSeconds - The reading interval.
 * @param {string} [options.show] - present, absent or all.
 * @param {Set<string>} [options.created] - MACs of the clients created in Gladys.
 * @returns {object} The content.
 */
function buildNetworkWidget({
  clients,
  language,
  now,
  pollSeconds,
  show = DEFAULT_SHOW,
  created = new Set(),
}) {
  const present = clients.filter((client) => client.present);
  const listed = clients
    .filter((client) =>
      show === 'all' ? true : show === 'present' ? client.present : !client.present,
    )
    .filter((client) => show !== 'absent' || client.lastSeen)
    .sort((a, b) => {
      if (show === 'absent') {
        return (b.lastSeen ?? 0) - (a.lastSeen ?? 0);
      }
      if (Boolean(a.name) !== Boolean(b.name)) {
        return a.name ? -1 : 1;
      }
      return clientName(a).localeCompare(clientName(b), language);
    });
  const caption = t('networkCaption', language, {
    present: present.length,
    total: clients.length,
  });
  if (listed.length === 0) {
    return {
      ttl_seconds: ttlOf(pollSeconds),
      components: [
        { type: 'text', variant: 'caption', text: clip(caption, 80) },
        { type: 'text', variant: 'body', text: t(`networkEmpty_${show}`, language) },
      ],
    };
  }
  const extra = listed.length - MAX_LIST_ITEMS;
  return {
    ttl_seconds: ttlOf(pollSeconds),
    components: [
      {
        type: 'text',
        variant: 'caption',
        text: clip(
          extra > 0 ? `${caption} · ${t('networkMore', language, { count: extra })}` : caption,
          80,
        ),
      },
      {
        type: 'card-list',
        display: 'list',
        items: listed.slice(0, MAX_LIST_ITEMS).map((client) => {
          let badge;
          if (client.access === false) {
            badge = { text: clip(t('badgeBlocked', language), 16), color: 'danger' };
          } else if (client.present) {
            badge = {
              text: clip(connectionBadge(client.connection, language), 16),
              color: created.has(client.mac) ? 'success' : 'info',
            };
          } else {
            badge = { text: clip(t('badgeGone', language), 16), color: 'neutral' };
          }
          return {
            title: clip(clientName(client), 60),
            // The IP first: the line is cut to one line by the front.
            subtitle: clip(clientDetails(client, now, language), 60),
            badge,
          };
        }),
      },
    ],
  };
}

export {
  WIDGETS,
  WIDGET_ACTIONS,
  CHART_INTERVALS,
  DEFAULT_INTERVAL,
  NETWORK_SHOW,
  clip,
  messageContent,
  formatVolume,
  guestWifi,
  firmwareSummary,
  readTrafficSettings,
  readNetworkSettings,
  buildOverviewWidget,
  buildTrafficWidget,
  buildNetworkWidget,
};
