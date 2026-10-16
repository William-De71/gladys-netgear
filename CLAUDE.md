# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for NETGEAR routers (Nighthawk,
Orbi...): a Node.js service (Node 22+, ESM, no build step) that runs in its
own sandboxed Docker container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It calls the local SOAP API of the router
(`/soap/server_sa/`, the API of the NETGEAR apps) with the administrator
account, every 30 seconds by default. The client is a rewrite after the
pynetgear Python library (MIT, see NOTICE). Transport: local only.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/widgets.test.js          # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect()
src/netgear-api.js      SOAP client (login v2 / v1, port detection, kept session, queue, error kinds)
src/operations.js       one function per router call, method name fallbacks, read-back writes
src/read.js             SOAP answers -> plain snapshots (null, never 0, when unknown)
src/watcher.js          the timer loop: fast reads every round, slow ones every 5 min, firmware every 6 h
src/tracker.js          snapshots -> scene trigger transitions, presence (pure logic)
src/store.js            MAC addresses already met, in /data/known-hosts.json
src/events.js           scene trigger payloads and scene action outputs
src/device.js           router, settings and client devices, their states
src/widgets.js          overview, traffic and network dashboard widgets
src/config.js           configuration (address, port, account, intervals, language)
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: device and
  feature external ids (router and settings `main`, client MAC without
  separators: never a name), feature `category` / `type` / `unit` / `min` /
  `max` / `step`, the keys of `config_schema`, `actions`, the widgets and
  their settings, scene triggers (fields, options, variables) and scene
  actions (fields, outputs). `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update the baseline to make a
  test pass without a documented migration.
- **Category / type pairs** come from the SDK constants and have an icon in
  the Gladys front (`test/devices.test.js` lists them). CPU and memory are
  `level-sensor` / `decimal` in %: Gladys has no category of their own; the
  traffic meter is `data` / `size` in MB. Do not
  change them without a migration (the Discovery "Update" button compares
  category, type and unit).
- **`should_poll` stays false**: the router is read on the integration's own
  timer, one round for every device. It never resyncs on existing devices.
- **One login, kept, one call at a time.** The SOAP server of a home router
  handles one request well: every call goes through the queue of
  netgear-api.js. Never log in per request; after a refused password, no new
  login for 5 minutes (or until the configuration is saved). A write is framed
  by ConfigurationStarted / ConfigurationFinished (not after Reboot) and read
  back (operations.js). Never call the methods that return Wi-Fi keys
  (GetWPASecurityKeys, Get*GuestAccessNetworkInfo).
- **Models differ.** A method a model lacks answers 501 / 404 (`unsupported`):
  the watcher skips it for an hour and the feature is not offered. A new
  method name for a known function goes in the lists of TOGGLES
  (operations.js), with a test of the fake router.
- **Presence** is `presence-sensor` / `push`, like the Bluetooth presence of
  Gladys: 1 re-published every minute while the client is online in the
  router's list, 0 once, after the absence delay. Per-client signal and link
  rate stay in the network widget: as features they would eat the quota of
  300 states per minute.
- **The first round is a baseline**: no scene event replays history after a
  restart or a configuration change. A change the integration makes itself (a
  setting switched, a firmware check or a speed test run from Gladys) never
  fires a scene trigger.
- **No DEBUG for users.** Gladys does not pass DEBUG to the container: the
  Diagnostic action writes an anonymized report at the info level (no serial
  number, MAC, name, SSID, public IP). Keep it that way when adding fields.
- **The container rootfs is read-only.** Write only under `/data`. Never log
  the password; never put it in an URL.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. A field older cores do not know needs a higher `gladys_version`
  minimum (see `src/constants.js` of the integration-store): a widget button
  with a form would need 5.2.0. Transport: `["local"]`.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (a local server on 127.0.0.1 at
  most).
