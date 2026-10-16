// The parsers, on the answers captured by the pynetgear library (capture/ and
// tests/ of MatMaul/pynetgear) and on the shapes the routers are known to send.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  decodeXml,
  readResponse,
  normalizeMac,
  readIp,
  readConnection,
  readIdentity,
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
} from '../src/read.js';
import { answer } from './helpers/fixtures.js';

// capture/device_scan.response of pynetgear.
const DEVICE_SCAN = `<?xml version="1.0" encoding="UTF-8"?>
<soap-env:Envelope
        xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/"
        soap-env:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"
        >
<soap-env:Body>
    <m:GetAttachDeviceResponse
        xmlns:m="urn:NETGEAT-ROUTER:service:DeviceInfo:1">
        <NewAttachDevice>7@1;192.168.1.2;android-ada682e3ff4d6b20;10:68:3F:AA:AA:AA;wireless;72;88@2;192.168.1.3;odin;C8:9C:DC:AA:AA:AA;wired;;100@3;192.168.1.4;Philips-hue;00:17:88:AA:AA:AA;wired;;100@4;192.168.1.5;android-e948fcdcfcf326b;AC:22:0B:AA:AA:AA;wireless;150;72@5;192.168.1.7;android-7ae1452d7d9dcb52;BC:F5:AC:AA:AA:AA;wireless;433;83@6;192.168.1.8;Pauluss-MBP;14:10:9F:AA:AA:AA;wireless;1;100@7;192.168.1.9;Chromecast;D0:E7:82:AA:AA:AA;wireless;72;100</NewAttachDevice>
    </m:GetAttachDeviceResponse>
    <ResponseCode>000</ResponseCode>
</soap-env:Body>
</soap-env:Envelope>`;

// capture/trafficmeter.response of pynetgear.
const TRAFFIC = `<?xml version="1.0" encoding="UTF-8"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP-ENV:Body>
    <m:GetTrafficMeterStatisticsResponse xmlns:m="urn:NETGEAR-ROUTER:service:DeviceConfig:1">
      <NewTodayConnectionTime>00:14</NewTodayConnectionTime>
      <NewTodayUpload>6.19</NewTodayUpload>
      <NewTodayDownload>209.58</NewTodayDownload>
      <NewYesterdayConnectionTime>00:00</NewYesterdayConnectionTime>
      <NewYesterdayUpload>0.00</NewYesterdayUpload>
      <NewYesterdayDownload>0.00</NewYesterdayDownload>
      <NewMonthUpload>6.19/0.20</NewMonthUpload>
      <NewMonthDownload>25,350.10/6.76</NewMonthDownload>
      <NewLastMonthUpload>--</NewLastMonthUpload>
      <NewLastMonthDownload>0.00/0.00</NewLastMonthDownload>
    </m:GetTrafficMeterStatisticsResponse>
    <ResponseCode>000</ResponseCode>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;

test('entities, namespaces, unknown values', () => {
  assert.equal(decodeXml('a &amp; b &lt;c&gt; &#233; &#x41;'), 'a & b <c> é A');
  const values = readResponse(answer('GetInfo', '<ModelName>R7000</ModelName><Empty/>'), 'GetInfo');
  assert.deepEqual(values, { ModelName: 'R7000', Empty: '' });
  assert.equal(readResponse('<html/>', 'GetInfo'), null);
  assert.equal(normalizeMac('10-68-3F-AA-AA-AA'), '10:68:3f:aa:aa:aa');
  assert.equal(normalizeMac('00:00:00:00:00:00'), null);
  assert.equal(normalizeMac('zz'), null);
  assert.equal(readIp('0.0.0.0'), null);
  assert.equal(readIp('--'), null);
  assert.equal(readIp('90.12.34.56'), '90.12.34.56');
});

test('connections: wired, bands, plain wireless', () => {
  assert.equal(readConnection('wired'), 'wired');
  assert.equal(readConnection('Wired'), 'wired');
  assert.equal(readConnection('2.4GHz'), '2g');
  assert.equal(readConnection('5GHz'), '5g');
  assert.equal(readConnection('6GHz'), '6g');
  assert.equal(readConnection('wireless'), 'wifi');
  assert.equal(readConnection(''), null);
});

test('client list, format 1: the capture of pynetgear', () => {
  const clients = readAttachedV1(DEVICE_SCAN);
  assert.equal(clients.length, 7);
  assert.deepEqual(clients[0], {
    mac: '10:68:3f:aa:aa:aa',
    ip: '192.168.1.2',
    name: 'android-ada682e3ff4d6b20',
    connection: 'wifi',
    linkRate: 72,
    signal: 88,
    access: null,
    ssid: null,
    type: null,
  });
  assert.equal(clients[1].connection, 'wired');
  assert.equal(clients[1].linkRate, null);
});

test('client list, format 1: no signal, unknown name, access, empty list', () => {
  const short = readAttachedV1(
    '<NewAttachDevice>2@1;192.168.1.4;MACBOOK-PRO;80:E6:50:13:2B:E0@3;192.168.1.18;RASPBERRYPI;B8:27:EB:D9:05:E1</NewAttachDevice>',
  );
  assert.deepEqual(
    short.map((c) => [c.name, c.connection, c.signal]),
    [
      ['MACBOOK-PRO', null, null],
      ['RASPBERRYPI', null, null],
    ],
  );
  const unknown = readAttachedV1(
    '<NewAttachDevice>1@1;192.168.1.2;&amp;lt;unknown&amp;gt;;10:68:3F:AA:AA:AA;wireless;72;88;Block</NewAttachDevice>',
  );
  assert.equal(unknown[0].name, null);
  assert.equal(unknown[0].access, false);
  assert.deepEqual(readAttachedV1('<NewAttachDevice>0</NewAttachDevice>'), []);
  assert.equal(readAttachedV1('INVALID'), null);
  assert.deepEqual(readAttachedV1('<NewAttachDevice>UNKNOWN#FORMATTING</NewAttachDevice>'), []);
});

test('client list, format 2: one element per device', () => {
  const clients = readAttachedV2(
    answer(
      'GetAttachDevice2',
      `<NewAttachDevice><Device><IP>10.0.0.5</IP><Name>iPhone</Name><MAC>AA:BB:CC:00:11:22</MAC><ConnectionType>5GHz</ConnectionType><SSID>Orbi&amp;Co</SSID><Linkspeed>866</Linkspeed><SignalStrength>76</SignalStrength><AllowOrBlock>Allow</AllowOrBlock><DeviceType>17</DeviceType></Device><Device><IP>10.0.0.6</IP><Name>--</Name><MAC>AA:BB:CC:00:11:33</MAC><ConnectionType>wired</ConnectionType><SSID></SSID><Linkspeed></Linkspeed><SignalStrength>100</SignalStrength><AllowOrBlock>Allow</AllowOrBlock></Device></NewAttachDevice>`,
    ),
  );
  assert.deepEqual(clients[0], {
    mac: 'aa:bb:cc:00:11:22',
    ip: '10.0.0.5',
    name: 'iPhone',
    connection: '5g',
    linkRate: 866,
    signal: 76,
    access: true,
    ssid: 'Orbi&Co',
    type: 17,
  });
  assert.equal(clients[1].name, null);
  assert.equal(clients[1].ssid, null);
});

test('identity, system, traffic meter (capture), WAN, link', () => {
  const identity = readIdentity(
    answer(
      'GetInfo',
      '<ModelName>RBR50</ModelName><SerialNumber>X</SerialNumber><Firmwareversion>V2.7.3.22</Firmwareversion><Hardwareversion>RBR50</Hardwareversion><DeviceMode>1</DeviceMode>',
    ),
  );
  assert.equal(identity.model, 'RBR50');
  assert.equal(identity.firmware, '2.7.3.22');
  assert.equal(identity.mode, 'ap');
  assert.deepEqual(
    readSystem(
      answer(
        'GetSystemInfo',
        '<NewCPUUtilization>7</NewCPUUtilization><NewMemoryUtilization>130</NewMemoryUtilization>',
      ),
    ),
    { cpu: 7, memory: 100 },
  );
  const traffic = readTraffic(TRAFFIC);
  assert.equal(traffic.todayDown, 209.58);
  assert.equal(traffic.todayUp, 6.19);
  assert.equal(traffic.monthDown, 25350.1);
  assert.equal(traffic.lastMonthUp, null);
  const wan = readWanInfo(
    answer(
      'GetInfo',
      '<NewExternalIPAddress>0.0.0.0</NewExternalIPAddress><NewConnectionType>PPPoE</NewConnectionType>',
    ),
  );
  assert.deepEqual(wan, { ip: null, gateway: null, type: 'PPPoE' });
  assert.equal(
    readLink(answer('GetEthernetLinkStatus', '<NewEthernetLinkStatus>Up</NewEthernetLinkStatus>')),
    true,
  );
  assert.equal(
    readLink(
      answer('GetEthernetLinkStatus', '<NewEthernetLinkStatus>Down</NewEthernetLinkStatus>'),
    ),
    false,
  );
});

test('internet status out of the link and the address', () => {
  assert.equal(internetStatus(true, '1.2.3.4'), 'connected');
  assert.equal(internetStatus(true, null), 'connecting');
  assert.equal(internetStatus(false, '1.2.3.4'), 'disconnected');
  assert.equal(internetStatus(null, null), 'disconnected');
  assert.equal(internetStatus(null, '1.2.3.4'), 'connected');
  assert.equal(internetStatus(true, undefined), 'connected');
  assert.equal(internetStatus(null, undefined), 'unknown');
});

test('toggles, firmware, feature list, speed test', () => {
  assert.equal(
    readToggle(
      answer('IsSmartConnectEnabled', '<NewSmartConnectEnable>1</NewSmartConnectEnable>'),
      'IsSmartConnectEnabled',
    ),
    true,
  );
  assert.equal(
    readToggle(
      answer('GetQoSEnableStatus', '<NewQoSEnableStatus>0</NewQoSEnableStatus>'),
      'GetQoSEnableStatus',
    ),
    false,
  );
  assert.equal(readToggle(answer('GetQoSEnableStatus', ''), 'GetQoSEnableStatus'), null);
  const none = readFirmware(
    answer('CheckNewFirmware', '<CurrentVersion>V1.0.1</CurrentVersion><NewVersion></NewVersion>'),
  );
  assert.deepEqual(none, { current: '1.0.1', latest: null, available: false, notes: null });
  const update = readFirmware(
    answer(
      'CheckNewFirmware',
      '<CurrentVersion>V1.0.1</CurrentVersion><NewVersion>V1.0.2</NewVersion><ReleaseNote>Fixes</ReleaseNote>',
    ),
  );
  assert.equal(update.available, true);
  assert.equal(update.latest, '1.0.2');
  const features = readFeatureList(
    answer(
      'GetSupportFeatureListXML',
      '<newFeatureList><features><SpeedTest>2</SpeedTest><SmartConnect>0</SmartConnect></features></newFeatureList>',
    ),
  );
  assert.equal(supports(features, 'SpeedTest'), true);
  assert.equal(supports(features, 'SmartConnect'), false);
  assert.equal(supports(features, 'Missing'), false);
  assert.deepEqual(
    readSpeedTest(
      answer(
        'GetOOKLASpeedTestResult',
        '<NewOOKLAUplinkBandwidth>20.5</NewOOKLAUplinkBandwidth><NewOOKLADownlinkBandwidth>300</NewOOKLADownlinkBandwidth><AveragePing>9</AveragePing>',
      ),
    ),
    { down: 300, up: 20.5, ping: 9 },
  );
});
