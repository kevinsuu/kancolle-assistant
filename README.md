# <img src="./packages/shell/browser/ui/assets/icons/logo.png" alt="KanColle Assistant icon" width="48"> kancolle-assistant

**English** · [繁體中文](./README.zh-TW.md) · [简体中文](./README.zh-CN.md) ·
[日本語](./README.ja.md)

KanColle Assistant is a minimal, tabbed web browser for playing Kantai Collection, with integrated
KC3Kai and KCCacheProxy support.

This project is a modified fork of [planetarian/damecon-browser](https://github.com/planetarian/damecon-browser).<br>
The original Damecon project is built on Samuel Maddock's [electron-browser-shell](https://github.com/samuelmaddock/electron-browser-shell).

## Release status

| App version | README updated |
| ----------- | -------------- |
| `v1.0.0`    | `2026-08-25`   |

- **Downloads:** Installers and portable archives are available from
  [GitHub Releases](https://github.com/kevinsuu/kancolle-assistant/releases).
- **Per-version changes:** The
  [latest release notes](https://github.com/kevinsuu/kancolle-assistant/releases/latest) contain the
  generated update log between tags.
- **Cumulative capabilities:** [Feature status](#feature-status) shows what the current source
  supports, what may be added later, and what is out of scope.
- **Technical details:** The project-specific highlights below link to the relevant documents.

### Project-specific highlights

Compared with the original project, this source adds or improves:

1. **[Account access](./docs/dmm-local-login-storage.md)** — With confirmation, DMM credentials can be encrypted by the operating system's secure storage. An all-traffic mode for a trusted external forward proxy and clearer regional-error guidance are also included.
2. **[Adaptive game display](./docs/display-auto-fit.md)** — On startup, KC3 is fitted to its rendered content and the remaining display area determines the window and game-canvas scale; later manual adjustments remain available.
3. **[Normal-map fleet recommendations](./docs/fleet-recommender.md)** — KC3 Strategy Room can suggest up to three account-owned fleets for maps 1-1 through 7-5, including 5-6, without changing game state.
4. **[Expedition resource-goal planning](./docs/expedition-resource-planner.md)** — The independent Strategy Room **遠征推薦** page uses current resources, targets, selected expeditions, and fleets 2–4 to recommend one best pairing; the original Expedition Scorer remains unchanged and expeditions are never dispatched automatically.
5. **[Resource Center and ledger summary](./docs/resource-ledger-summary.md)** — The new KC3 Strategy Room **資源中心** dashboard shows current resources, gains, consumption, net change, hourly activity, source breakdowns, and consumables for today, yesterday, or the last 24 hours.
6. **[KC3 DevTools integration](./docs/kc3-devtools.md)** — The KC3 `KanColle` panel is moved forward and selected when game DevTools opens, reducing repeated manual navigation.
7. **[Strategy Room pinned links](./docs/strategy-room-recent-tabs.md)** — Pin up to five Strategy Room tabs in `常用連結`; ordinary navigation keeps their order unchanged, and a sixth pin replaces the bottom link.

These added Strategy Room interfaces follow KC3's selected language and support English,
Traditional Chinese, Simplified Chinese, and Japanese.

## ⚠️ Notice

#### KanColle Assistant is NOT intended to be used as a general-purpose browser.

KanColle Assistant is designed for one purpose only: playing KanColle.

KanColle Assistant is built upon Electron and lacks many security features found in major
browsers.

Seriously, I've literally never worked with Electron before. There's some real spaghetti-tier code going on here. Do you really wanna put your trust in that?

#### If you use KanColle Assistant for sensitive activities, you do so at your own risk.

## Usage

### From a Release build:

From the [Releases page](https://github.com/kevinsuu/kancolle-assistant/releases/latest), download
one of the following:

Installer: `kancolle-assistant-*.Setup.exe`

- Simply download and run it to install.
- This provides automatic updates for KanColle Assistant and is the simplest installation method.

Alternatively, use the ZIP file: `kancolle-assistant-*.zip`

- Download and extract its contents to an empty folder, then run `kancolle-assistant.exe`.
- This lets you use specific versions if desired, but lacks automatic updates.

### From source code, using `yarn`:

```bash
# Get the code
git clone --recurse-submodules https://github.com/kevinsuu/kancolle-assistant
cd kancolle-assistant

# Install and launch the browser
yarn
yarn start
```

### 🔌 Install extensions

Unpacked extensions inside `./extensions` will be loaded automatically.

- Supports both Manifest V2 and V3 extensions.
- Some/many plugins may not run properly (or at all) due to various extension APIs being unsupported.

There are a few plugins bundled with the Release builds for your convenience. It is safe to remove them if you wish (just delete from the `extensions` folder).

### ⚙️ Configure settings

On first launch, the settings page will open.

It will automatically begin downloading the latest Release version of KC3Kai, and upon completion, the KC3 start page will open.

You can access the KanColle Assistant settings at any time by clicking the app icon at the
top-left corner of the window.

### KC3Kai Update Configuration

The KC3Kai section in the settings page allows you to configure how KC3 is updated.

You can select from three different update channels: `release`, `master`, and `develop`.

- It is recommended to remain on the `release` channel, for the most stable experience.
- `master` and `develop` contain code actively in development, and may be unstable.
  - If using one of these two channels, the initial update may take several minutes to complete.
- Different channels are stored independently and have their own separate profiles.
  - You can switch between channels at any time, and those channels won't need to be re-downloaded.
  - Switching channels will automatically unload the old channel's extension and load the new one in.
  - To remove the files for a channel, simply delete the associated `kc3kai-*` folder within `./extensions`.

### Proxy Configuration

KanColle Assistant integrates with KCCacheProxy, so extensions such as ProxySwitchy are no longer
necessary.

You can configure your KCCP host/port in the `Proxy` section of the settings page.

The `Enabled` checkbox will enable/disable routing KanColle traffic through the proxy.

`KCCP internal` and `KCCP external` only proxy KanColle game-server traffic. They do not change
the public IP used for DMM login and region checks. To use an authorized HTTP/HTTPS forward proxy
for all browser traffic, select `all-external`, enter its host and forward-proxy port, and then
enable proxying. KanColle Assistant reapplies the proxy, closes pooled connections, and retries a DMM page
that was redirected to the regional-access error.

KanColle Assistant does not include or discover public proxies. Do not send DMM credentials through an
untrusted proxy. If DMM displays its regional-access page while you are already on a supported
network, disable unintended VPN, proxy, or private-relay software and retry.

## Feature status

### ✨ Showcase

Resource Center summarizes current resources and recent gains, consumption, and net changes:

![KC3 Strategy Room Resource Center dashboard.](./screenshots/resource-center.png)

Expedition Recommendations plans resource goals and assigns the best expedition to each available
fleet:

![KC3 Strategy Room Expedition Recommendations page.](./screenshots/expedition-recommendation.png)

Map Recommendations suggests account-owned fleets and equipment for normal maps:

![KC3 Strategy Room Map Recommendations page.](./screenshots/map-recommendation.png)

### 🚀 Current

- [x] Installer + Application auto-update
- [x] KC3Kai integration
- [x] Automatic updates for KC3
- [x] Support both release and in-development versions of KC3
- [x] Configurable KC3 update schedule (daily/weekly/always/never)
- [x] Auto-open KC3 start page (with developer tools) and strategy room
- [x] Prioritize and select the KC3 `KanColle` panel when game DevTools opens
- [x] KCCacheProxy full integration & proxy client support
- [x] Authorized all-traffic external proxy mode with DMM regional-error guidance
- [x] [Preset and custom browser colors, light/dark themes, and an uploadable settings icon](./docs/theme-personalization.md)
- [x] Manifest V3 extensions support
- [x] Chrome Webstore extensions support
- [x] New Tab page with links to common third-party KanColle resources
- [x] Configuration options for new tab behavior
  - Can select KC3 launch page, DMM game page, strategy room
- [x] Multiple window support
- [x] 'Custom' channel for managing your own KC3 folder location
- [x] Common keyboard shortcuts (F12, Ctrl+T, Ctrl+F4, Ctrl+Tab, Ctrl+D, etc)
- [x] Per-site address bar hiding with wildcard support
- [x] Common mouse gestures (Tab middle-click, draggable tabs, Ctrl+scroll, etc)
- [x] Find in page (Ctrl+F)
- [x] DMM-only local credential vault using operating-system encryption
- [x] One-time KanColle game-canvas auto-fit for the current display
- [x] Account-aware normal-map fleet recommendations for maps 1-1 through 7-5
- [x] Expedition resource-goal planning with fleet assignments
- [x] KC3 resource-ledger summaries for fixed recent periods
- [x] Up to five pinned KC3 Strategy Room quick links with stable ordering

### 🤞 Eventually

- [ ] Option to ask before installing KC3 updates
- [ ] Link hover URL tooltips
- [ ] Extension management (enable/disable/uninstall)
- [ ] .CRX extension loader
- [ ] Support for more common [`chrome.*` extension APIs](https://developer.chrome.com/extensions/devguide)
- [ ] Respect extension manifest permissions
  - I must reiterate, this is _not_ a secure browser

### ❌ Not planned

- Detachable tabs
- Advanced general-use browser features from Chrome/Edge/etc
  - Including a general-purpose password manager and other security features
- AI integration of any kind (you're welcome)

## License

GPL-3

This repository is a modified fork of the original [damecon-browser](https://github.com/planetarian/damecon-browser) project maintained by planetarian.<br>
Damecon itself is based on Samuel Maddock's [electron-browser-shell](https://github.com/samuelmaddock/electron-browser-shell) project.

The following notice has been retained from the original repository:

> For proprietary use [of electron-browser-shell], please [contact [samuelmaddock]](mailto:sam@samuelmaddock.com?subject=electron-browser-shell%20license) or [sponsor [samuelmaddock] on GitHub](https://github.com/sponsors/samuelmaddock/) under the appropriate tier to [acquire a proprietary-use license](https://github.com/samuelmaddock/electron-browser-shell/blob/master/LICENSE-PATRON.md). These contributions help make development and maintenance of this project more sustainable and show appreciation for the work thus far.

### Contributor license agreement

By sending a pull request, you hereby grant to owners and users of the
electron-browser-shell project a perpetual, worldwide, non-exclusive,
no-charge, royalty-free, irrevocable copyright license to reproduce, prepare
derivative works of, publicly display, publicly perform, sublicense, and
distribute your contributions and such derivative works.

The owners of the damecon-browser/electron-browser-shell projects will also be granted the right to relicense the
contributed source code and its derivative works.
