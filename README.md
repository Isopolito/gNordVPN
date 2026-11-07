# gNordVPN: GNOME Interface for NordVPN

<img align="right" src="img/screenshot1.png">


## Overview

**gNordVPN** puts NordVPN controls directly in the GNOME top bar. It uses the NordVPN CLI under the hood to show live connection state, surface quick actions, and expose the most useful NordVPN settings without leaving the desktop shell.

## Prerequisites

- A NordVPN account
- The NordVPN Linux CLI installed and working
- GNOME Shell 42 or newer

## Features

- 🖥️ **Top-bar control**: Connect, disconnect, and inspect NordVPN status from the GNOME panel.
- 📡 **Live status display**: See connection state, country, and server details at a glance.
- 🌍 **Fast server selection**: Browse and connect by country, city, or server.
- 🧩 **Server groups**: Connect to server groups such as Double VPN or Onion Over VPN, with favorites.
- ⭐ **Favorites**: Pin commonly used countries, cities, servers, and groups for quicker access.
- ✅ **Searchable country lists**: The Cities and Servers pages use a searchable checklist, so no modifier keys are needed to select several countries.
- ⚙️ **Connection preferences**: Configure options such as auto-connect, protocol, real-time protection, LAN discovery, post-quantum encryption, and notifications from the extension settings.
- 🧭 **Panel customization**: Move the indicator to the left, center, or right side of the top bar.
- 🎨 **Style overrides**: A Styles page with a live preview, Size and Theme presets, Shape controls (corners, bold, border, spacing), and per-state colors and panel text. An Advanced CSS section is the fallback for anything the controls don't cover.

## Installation
This extension uses the NordVPN command line client, which can be set up as follows.

### Install NordVPN
1. Install NordVPN with `sudo apt install nordvpn`.
2. Configure your credentials with `nordvpn login`, following the prompts.
3. Check NordVPN is set up with `nordvpn c`, if it connects successfully then you're good to go.

### Install the extension
#### Easiest way: 
Enable on gnome-extensions at [gNordVPN on gnome extensions](https://extensions.gnome.org/extension/2569/gnordvpn-local/)

#### Manual install:
1. Create a folder for the extension with `mkdir ~/.local/share/gnome-shell/extensions/gnordvpn-local@isopolito`
2. Copy the files from this repo into that folder
3. Enable the extension using `Tweaks` (if you don't have it, install via `sudo apt install gnome-tweaks`)

## Troubleshooting

If the extension shows an error state, make sure NordVPN CLI is functioning (`nordvpn status`). The extension relies on NordVPN CLI being operational. If any behavior suddenly changes, check `nordvpn` CLI to see if anything has changed there, sometimes they make breaking changes that need to be handled by the extension. Other times they have transient errors on their end that eventually clear up.

## Known Issues

When this extension is used with **Dash to Panel**, the gNordVpn panel icon can look unusually large. Fix it on the **Styles** page of the extension settings:

1. Under **Shape**, set **Spacing** to **Compact**.
2. If that isn't right, set **Spacing** to **Custom** and adjust the padding and margin values (px) until it fits.
3. Only if the controls can't do what you need, open **Custom CSS (advanced)** and add CSS there. It applies to every state and is added after the generated CSS, so it wins. Per-state extra CSS is available there too.

## Bug Reports

Please raise an issue with the following data points:
  1. Version of gnome: `gnome-shell --version`
  2. Version of nordvpn: `nordvpn --version`
  3. Version the gNordVpn extension
  4. Screenshots of the problem if applicable
  5. Steps to reproduce the issue

## Development

Contributions welcome! If you find any issues or think of any cool features, check to see if it's already documented under Issues, if not--raise it.

### Running tests

Run `npm ci && npm test`. Tests use Jest; `gi://...` and `resource:///...` imports are mapped by `moduleNameMapper` in `package.json` to stubs under `__mocks__/gi` and `__mocks__/resource`, so add a stub there when a module imports a new GNOME library. `deploy_local.sh` installs into your live GNOME session, so run it yourself; it is not part of the tests.

### Linting

`npm run lint` runs ESLint over `extension.js`, `prefs.js` and `modules/`. It must pass; CI runs it with the tests.

### Debug logging

The extension only logs warnings and errors. To see debug and timing lines (what `debug-logs.sh` reads), turn on "Write debug messages to the log" in the General page of the preferences, or set `debug-logging` yourself:

`gsettings --schemadir ~/.local/share/gnome-shell/extensions/gnordvpn-local@isopolito/schemas set org.gnome.shell.extensions.gnordvpn-local debug-logging true`

### Code layout

`modules/shell/` runs in the GNOME Shell process, `modules/prefs/` in the preferences window, and `modules/` holds code both use. The processes cannot share GUI libraries, so shell code never imports Gtk, Gdk or Adw, and preferences code never imports St, Clutter, Meta or Shell. A test enforces this.

## Thanks

Thanks [TheRobVK](https://github.com/ThatRobVK) for creating the original version of this extension. Also thanks to all who have contributed, it's much appreciated!

## License

This project is licensed under the GNU General Public License v3.0. See the [LICENSE](LICENSE) file for details.
