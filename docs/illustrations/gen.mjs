// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The three widgets on a made-up home network (fixed date, seeded
// randomness): an R7000 with a firmware update available, the traffic meter
// of the day and of the month with a speed test run 12 minutes ago, and the
// devices connected right now. A device-bound chart reads the history Gladys
// keeps for the features: here the history is made up, the content around it
// is real.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildOverviewWidget, buildTrafficWidget, buildNetworkWidget } =
  await load('src/widgets.js');
const { LANGUAGES, t } = await load('src/i18n.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

// Thursday 15 October 2026, 20:00 in Paris.
const NOW = Date.parse('2026-10-15T18:00:00Z');
const MINUTE = 60000;

// mulberry32: the same "random" history on every run.
function random(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// The traffic counters of the day, one point every 15 minutes over the last
// 24 hours: they grow, faster in the evening, and restart at midnight (Paris).
function history(seed, perHour) {
  const next = random(seed);
  const points = [];
  let total = 0;
  for (let m = 24 * 60; m >= 0; m -= 15) {
    const at = NOW - m * MINUTE;
    const date = new Date(at);
    const hour = (date.getUTCHours() + 2) % 24;
    if (hour === 0 && date.getUTCMinutes() === 0) {
      total = 0;
    }
    const busy = hour >= 18 && hour <= 23 ? 1 : hour >= 8 && hour < 18 ? 0.4 : 0.05;
    total += (perHour / 4) * busy * (0.6 + next() * 0.8);
    points.push({ t: date.toISOString(), v: Math.round(total) });
  }
  return points;
}

const download = history(3, 900);
const upload = history(5, 120);
const router = {
  identity: { model: 'R7000', firmware: '1.0.11.134_10.2.120' },
  lan: { ip: '192.168.1.1' },
  cpu: 9,
  memory: 46.2,
  traffic: {
    todayDown: download.at(-1).v,
    todayUp: upload.at(-1).v,
    monthDown: 152400.5,
    monthUp: 9800.2,
  },
  wan: { status: 'connected', ip: '90.12.34.56', link: true },
  clientsOnline: 17,
  toggles: { guest_wifi_2g: true, guest_wifi_5g: false, traffic_meter: true },
  firmware: { available: true, latest: '1.0.11.140_10.2.121', current: '1.0.11.134_10.2.120' },
  speedTest: { down: 512.3, up: 98.7, ping: 12, at: NOW - 12 * MINUTE },
};
const client = (mac, name, ip, connection, ssid, signal, linkRate, minutes, present = true) => ({
  mac,
  name,
  ip,
  connection,
  ssid,
  signal,
  linkRate,
  access: true,
  present,
  lastSeen: NOW - minutes * MINUTE,
});
const clients = [
  client('a4:83:e7:12:34:56', 'Phone of Alex', '192.168.1.23', '5g', 'Home_5G', 83, 866, 0),
  client('3c:2a:f4:01:02:03', 'Living room TV', '192.168.1.40', 'wired', null, 100, 1000, 0),
  client('00:11:32:aa:bb:cc', 'NAS', '192.168.1.10', 'wired', null, 100, 1000, 0),
  client('f0:18:98:44:55:66', 'MacBook Claire', '192.168.1.31', '5g', 'Home_5G', 71, 702, 0),
  client('b8:27:eb:77:88:99', 'Gladys', '192.168.1.5', 'wired', null, 100, 1000, 0),
  client('24:0a:c4:10:20:30', 'Boiler ESP32', '192.168.1.62', '2g', 'Home', 58, 72, 0),
  client('dc:a6:32:00:00:01', 'Printer', '192.168.1.70', '2g', 'Home', 64, 65, 0),
  client('44:65:0d:ab:cd:ef', null, '192.168.1.88', '2g', 'Home-Guest', 49, 54, 0),
  client('9c:b6:d0:11:22:33', 'iPhone Tom', '192.168.1.27', '5g', 'Home_5G', null, null, 95, false),
];
clients[7].access = false;
const created = new Set(['a4:83:e7:12:34:56', '9c:b6:d0:11:22:33', 'f0:18:98:44:55:66']);

const contents = {};
for (const language of LANGUAGES) {
  const traffic = buildTrafficWidget({
    router,
    language,
    now: NOW,
    pollSeconds: 30,
    interval: 'last-day',
    featureId: (key) => `ext:netgear:router:main:${key}`,
  });
  // The front reads the history of a device-bound chart from Gladys, and
  // names the series after the features.
  traffic.components = traffic.components.map((component) =>
    component.type === 'chart'
      ? {
          ...component,
          series: [
            { name: t('feature_download_today', language), points: download },
            { name: t('feature_upload_today', language), points: upload },
          ],
        }
      : component,
  );
  contents[language] = {
    overview: buildOverviewWidget({
      router,
      language,
      now: NOW,
      fetchedAt: NOW - 20000,
      pollSeconds: 30,
    }),
    traffic,
    network: buildNetworkWidget({ clients, language, now: NOW, pollSeconds: 30, created }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
