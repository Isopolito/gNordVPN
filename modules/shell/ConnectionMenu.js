import Gio from 'gi://Gio';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import Vpn from '../Vpn.js';
import Favorites from './Favorites.js';
import MenuBase from './MenuBase.js';
import * as Common from '../common.js';
import * as Constants from '../constants.js';
import Logger from '../Logger.js';

export default class ConnectionMenu extends MenuBase {
    constructor(connectionLabel, connectionType, favoritesKey, connectionCallback, settings) {
        super();
        this._log = new Logger('ConnectionMenu');
        this._connectionCallback = connectionCallback;
        this._connectionMenu = null;
        this._connectionMenuItems = [];
        this._favConnectionItems = [];
        this._isBuilt = false;
        this._menuSeperator = null;
        this._buildGen = 0;
        this._buildInFlight = false;
        // Optional: lets the owner re-apply its visibility rules after a build (tryBuild shows populated menus).
        this.onBuilt = null;
        // Marks teardown: a build that was in flight when destroy() ran must not retry.
        this._cancellable = new Gio.Cancellable();

        this._favorites = new Favorites(settings);
        this._vpn = new Vpn(settings);

        this._connectionLabel = connectionLabel;
        this._connectionType = connectionType;
        this._favoritesKey = favoritesKey;
    }

    updateFavorite() {
        // Not built (initial or mid-rebuild): the pending build reads the latest favorites itself.
        if (!this._isBuilt) return;
        const connectionFavs = this._favorites.get(this._favoritesKey).favorites;

        // Favorites added since the last update.
        const toAddToFav = Common.safeObjectKeys(connectionFavs).filter(x => !this._favConnectionItems.includes(x));
        toAddToFav.forEach(connection => {
            this._toggleConnectionMenuItem(connection, false);
        });

        // Favorites removed since the last update.
        const toRemoveFromFav = this._favConnectionItems.filter(x => !Common.safeObjectKeys(connectionFavs).includes(x));
        toRemoveFromFav.forEach(connection => {
            this._toggleConnectionMenuItem(connection, true);
        });
    }

    rebuild(running = false) {
        this._isBuilt = false;
        ++this._buildGen;
        this._releaseRows();
        this._connectionMenuItems = [];
        this._favConnectionItems = [];
        this._menuSeperator = null;
        this._connectionMenu.menu.removeAll();
        this._connectionMenu.menu.addMenuItem(this._buildPlaceHolderMenuItem());
        // Kick off a new fetch on idle so it runs after the current task completes.
        // If _buildInFlight is still true at that point, tryBuild's gate discards and returns;
        // the in-flight fetch will see a gen mismatch, and _throttledMenuBuild retries later.
        this._scheduleIdle(() => this.tryBuild(running).catch(e => this._log.error('tryBuild after rebuild failed', e)));
    }

    _buildPlaceHolderMenuItem() {
        return new PopupMenu.PopupMenuItem("Loading...");
    }

    _buildConnectionMenuItem(connection, isFavorite) {
        const menuItem = new PopupMenu.PopupMenuItem(connection);
        const menuItemClickId = this._signals.connect(menuItem, `activate`, () => {
            const target = this._connections[connection];
            const connType = this._connectionType;
            if (!target || this._vpn.isConnectThrottled()) return;
            this._vpn.connectVpn(target).catch(e => this._log.error('connectVpn failed', e));
            this._connectionCallback(Constants.status.reconnecting, [connType, target]);
        });

        // Defer both the GSettings write and widget mutation to idle so this
        // callback doesn't destroy the menu item currently dispatching the event.
        this._addFavoriteButton(connection, menuItem, isFavorite, menuItemClickId, () => this._scheduleToggle(connection, isFavorite));
        return menuItem;
    }

    _scheduleToggle(connection, isFavorite) {
        // Each click gets its own idle so rapid clicks on different rows all land.
        this._scheduleIdle(() => {
            if (isFavorite) this._favorites.remove(this._favoritesKey, connection);
            else this._favorites.add(this._favoritesKey, connection, this._connections[connection]);
        });
    }

    _toggleConnectionMenuItem(connection, isFavorite) {
        const d = this._destroyMap[connection];
        if (d) {
            this._signals.disconnect([d.menuItemClickId, d.menuItem.favoritePressId]);
            d.icofavBtn.destroy();
            d.menuItem.destroy();
        }

        const newMenuItem = this._buildConnectionMenuItem(connection, !isFavorite);
        this._addConnectionMenuItem(connection, newMenuItem, !isFavorite);
    }

    _addConnectionMenuItem(connection, newMenuItem, isFavorite) {
        if (isFavorite) {
            let idx = this._connectionMenuItems.findIndex(item => item === connection);
            if (idx >= 0) this._connectionMenuItems.splice(idx, 1);

            this._favConnectionItems.push(connection);
            this._favConnectionItems.sort();
            idx = this._favConnectionItems.findIndex(item => item === connection);
            this._connectionMenu.menu.addMenuItem(newMenuItem, idx);

            this._menuSeperator.destroy();
            this._menuSeperator = new PopupMenu.PopupSeparatorMenuItem();
            this._connectionMenu.menu.addMenuItem(this._menuSeperator, this._favConnectionItems.length);
        } else {
            let idx = this._favConnectionItems.findIndex(item => item === connection);
            if (idx >= 0) this._favConnectionItems.splice(idx, 1);

            this._connectionMenuItems.push(connection);
            this._connectionMenuItems.sort();
            idx = this._connectionMenuItems.findIndex(item => item === connection) + this._favConnectionItems.length + 1;
            idx = idx > this._connectionMenu.menu.numMenuItems
                ? this._connectionMenu.menu.numMenuItems - 1
                : idx;

            this._connectionMenu.menu.addMenuItem(newMenuItem, idx);
        }
    }

    get isBuilt() {
        return this._isBuilt;
    }

    get menu() {
        return this._connectionMenu;
    }

    destroy() {
        this._cancellable.cancel();
        this._vpn.destroy();
        ++this._buildGen;
        this._removePendingIdles();
        this._signals.disconnectAll();
        this._connectionMenu.destroy();
        this._connectionMenuItems = [];
        this._favConnectionItems = [];
        this._isBuilt = false;
    }

    async tryBuild(running = true) {
        if (!this._connectionMenu)
            this._connectionMenu = new PopupMenu.PopupSubMenuMenuItem(this._connectionLabel);

        if (this._isBuilt || this._buildInFlight) return;
        const gen = ++this._buildGen;
        this._buildInFlight = true;

        const t = this._log.startTimer();
        let connections;
        try {
            connections = await this._vpn.getConnectionList(this._connectionType, running);
        } catch (e) {
            if (Common.isCancelled(e)) return;
            this._log.warn('tryBuild fetch failed', {type: this._connectionType, error: e?.message});
            return;
        } finally {
            this._buildInFlight = false;
            // Only retry when a rebuild() invalidated our gen while we were in-flight.
            // gen mismatch means rebuild() ran and bumped _buildGen — we need a fresh fetch.
            // If gen still matches, the fetch completed legitimately (no-data / error / success);
            // normal refresh cycles handle the next attempt, so no retry is needed here.
            if (gen !== this._buildGen && !this._cancellable.is_cancelled()) {
                this._scheduleIdle(() => this.tryBuild(running).catch(e => this._log.error('tryBuild retry failed', e)));
            }
        }

        if (gen !== this._buildGen) return;

        if (!connections || Object.keys(connections).length === 0) {
            if (this._connectionMenu.menu.numMenuItems === 0)
                this._connectionMenu.menu.addMenuItem(this._buildPlaceHolderMenuItem());
            this._log.endTimer(t, 'SPAN', {operation: `tryBuild:${this._connectionType}`, result: 'no-data'});
            return;
        }

        this._connectionMenuItems = [];
        this._favConnectionItems = [];

        const connectionFavs = this._favorites.get(this._favoritesKey, connections);
        this._connections = {...connectionFavs.favorites, ...connectionFavs.itemsMinusFavorites};

        this._connectionMenu.menu.removeAll();

        for (const connection of Common.safeObjectKeys(connectionFavs.favorites).sort()) {
            const menuItem = this._buildConnectionMenuItem(connection, true);
            this._favConnectionItems.push(connection);
            this._connectionMenu.menu.addMenuItem(menuItem);
        }

        this._menuSeperator = new PopupMenu.PopupSeparatorMenuItem();
        this._connectionMenu.menu.addMenuItem(this._menuSeperator);

        for (const connection of Common.safeObjectKeys(connectionFavs.itemsMinusFavorites).sort()) {
            const menuItem = this._buildConnectionMenuItem(connection, false);
            this._connectionMenuItems.push(connection);
            this._connectionMenu.menu.addMenuItem(menuItem);
        }

        const itemCount = Common.safeObjectKeys(this._connections).length;
        this._log.endTimer(t, 'SPAN', {operation: `tryBuild:${this._connectionType}`, itemCount});

        if (itemCount < 1) {
            this._connectionMenu.hide();
        } else {
            this._connectionMenu.show();
        }

        this._isBuilt = true;
        this.onBuilt?.();
    }

    showHide(show = true) {
        if (Common.safeObjectKeys(this._connections).length < 1 || !show) {
            this._connectionMenu.hide();
        } else {
            this._connectionMenu.show();
        }
    }
}
