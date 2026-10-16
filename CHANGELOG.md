# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - unreleased

### Added

- A NETGEAR router device (Nighthawk, Orbi and the other routers with the local SOAP API of the NETGEAR apps): CPU and memory usage, traffic meter of the day and of the month, last speed test, internet status, WAN IP address, connected clients and firmware version; each group only when the router answers it.
- A settings device with the switches the router offers: guest Wi-Fi 2.4 GHz and 5 GHz, access control, traffic meter, parental control, QoS and Smart Connect.
- Devices of the network as presence sensors, from the client list of the router, with an absence delay, and their network access (allow or block) as a switch.
- Scene triggers: internet down or back, public IP address changed, device arrived or left, new device on the network, firmware update available.
- Scene actions: read the status, run a speed test, check for a firmware update, reboot.
- Dashboard widgets: router overview (with "check firmware" and "reboot" buttons), internet traffic with its daily chart and a speed test button, network devices.
- A Diagnostic button that writes an anonymized report to the logs of the integration.
- Local transport only: login version 2 or 1, port 5000, 80, 443 or 5555 found automatically, one session kept, no new attempt for 5 minutes after a refused password.
- English, French, German and Spanish everywhere: settings, devices, widgets, scenes and documentation.

[0.1.0]: https://github.com/William-De71/gladys-netgear/releases/tag/v0.1.0
