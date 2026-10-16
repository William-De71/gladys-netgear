// -----------------------------------------------------------------------------
// Entry point of the NETGEAR external integration.
//
// Brings a NETGEAR router (Nighthawk, Orbi...) into Gladys, over the local
// SOAP API of the router:
//   - devices: the router (CPU, memory, traffic meter, speed test, internet
//     link, clients, firmware), its switchable settings (guest Wi-Fi, access
//     control, traffic meter, parental control, QoS, Smart Connect) and the
//     clients of the network (presence, network access), offered on the
//     Discovery screen (see src/device.js);
//   - scene triggers: internet down or back, new public address, device
//     arrived or left, new device on the network, firmware update available;
//   - scene actions: read the status, run a speed test, check for a firmware
//     update, reboot;
//   - dashboard widgets: overview, traffic, network devices.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the NETGEAR integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
