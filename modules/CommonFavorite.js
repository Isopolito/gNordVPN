import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import Vpn from './Vpn.js';
import Favorites from './Favorites.js';
import MenuBase from './MenuBase.js';
import * as Constants from './constants.js';
import Logger from './Logger.js';

export default class CommonFavorite extends MenuBase {
    constructor(connectionCallback, settings) {
        super();
        this._connectionCallback = connectionCallback;
        this._isBuilt = false;
        this.favList = {};
        this.prevShowHide = true;

        this._log = new Logger('CommonFavorite');
        this._favorites = new Favorites(settings);
        this._vpn = new Vpn(settings);
    }

    destroy() {
        this._vpn.destroy();
        this._removePendingIdles();
        this._signals.disconnectAll();
        this._favoriteMenu.destroy();
        this._isBuilt = false;
        this._destroyMap = {};
        this.favList = {};
    }

    updateFavorite() {

        let newFav = {};

        Object.keys(Constants.favorites).forEach(key => {
            const getFav = this._favorites.get(Constants.favorites[key]).favorites;
            const getFavReformat = {};
            Object.keys(getFav).forEach(k => {
                getFavReformat[k] = {item: getFav[k], type: Constants.favorites[key]};
            });
            newFav = {...newFav, ...getFavReformat};
        });

        // Favorites added since the last update.
        const toAddToFav = Object.keys(newFav).filter(x => !Object.keys(this.favList).includes(x));
        toAddToFav.forEach(favorite => { this.favList[favorite] = newFav[favorite]; this._toggleFavoriteMenuItem(favorite, true); });

        // Favorites removed since the last update.
        const toRemoveFromFav = Object.keys(this.favList).filter(x => !Object.keys(newFav).includes(x));
        toRemoveFromFav.forEach(favorite => { this._toggleFavoriteMenuItem(favorite, false); });

        this.showHide(this.prevShowHide);
    }

    rebuild() {
        this._isBuilt = false;
        this._destroyMap = {};
        this.favList = {};
        this.build();
    }

    _buildFavoriteMenuItem(favorite) {
        const menuItem = new PopupMenu.PopupMenuItem(favorite);
        const menuItemClickId = this._connectTracked(menuItem, `activate`, () => {
            const item = this.favList[favorite]?.item;
            const rawType = this.favList[favorite]?.type;
            if (!item || !rawType || this._vpn.isConnectThrottled()) return;
            this._vpn.connectVpn(item).catch(e => this._log.error('connectVpn failed', e));
            const type = rawType.substring(rawType.lastIndexOf('-') + 1);
            this._connectionCallback(Constants.status.reconnecting, [type, item]);
        });

        // Defer both the GSettings write and widget mutation to idle so this
        // callback doesn't destroy the menu item currently dispatching the event.
        this._addFavoriteButton(favorite, menuItem, true, menuItemClickId, () => this._scheduleToggle(favorite));
        return menuItem;
    }

    _scheduleToggle(favorite) {
        // Capture the type now (before idle) since favList may change by the time idle fires.
        const favoriteType = this.favList[favorite]?.type;
        // Each click gets its own idle so rapid clicks all land.
        this._scheduleIdle(() => {
            if (favoriteType) this._favorites.remove(favoriteType, favorite);
        });
    }

    _toggleFavoriteMenuItem(favorite, toAdd) {
        const menuItemElements = this._destroyMap[favorite];
        if (menuItemElements) {
            this._signals.disconnect([menuItemElements.menuItemClickId, menuItemElements.menuItem.favoritePressId]);
            menuItemElements.icofavBtn.destroy();
            menuItemElements.menuItem.destroy();
        }

        if (toAdd) {
            const newMenuItem = this._buildFavoriteMenuItem(favorite);
            this._addFavoriteMenuItem(favorite, newMenuItem);

        } else {
            delete this.favList[favorite];
        }
    }

    _addFavoriteMenuItem(favorite, newMenuItem) {
        const byType = {};
        Object.keys(this.favList).forEach(key => {
            if (!byType[this.favList[key].type]) byType[this.favList[key].type] = [];
            byType[this.favList[key].type].push(key);
        });

        let idx = 0;
        let typeFound;
        const typeList = Object.keys(Constants.favorites).map(e => Constants.favorites[e]);
        typeList.every(type => {
            if (!byType[type]) byType[type] = [];
            if (type === this.favList[favorite].type) typeFound = type;
            else idx += byType[type].length;

            return !typeFound;
        });

        idx += byType[typeFound].sort().findIndex(item => item === favorite);

        this._favoriteMenu.menu.addMenuItem(newMenuItem, idx);
    }

    get isBuilt() {
        return this._isBuilt;
    }

    get menu() {
        return this._favoriteMenu;
    }

    build() {
        if (this._isBuilt) return;
        if (!this._favoriteMenu) this._favoriteMenu = new PopupMenu.PopupSubMenuMenuItem("Favorites");
        else this._favoriteMenu.menu.removeAll();

        this.favList = {};
        Object.keys(Constants.favorites).forEach(key => {
            const getFav = this._favorites.get(Constants.favorites[key]).favorites;
            const getFavReformat = {};
            Object.keys(getFav).forEach(k => {
                getFavReformat[k] = {item: getFav[k], type: Constants.favorites[key]};
            });

            this.favList = {...this.favList, ...getFavReformat};

            for (const fav of Object.keys(getFav).sort()) {
                const menuItem = this._buildFavoriteMenuItem(fav);
                this._favoriteMenu.menu.addMenuItem(menuItem);
            }
        });

        if (Object.keys(this.favList).length < 1) {
            this._favoriteMenu.hide();
        } else {
            this._favoriteMenu.show();
        }

        this._isBuilt = true;
    }

    showHide(show=true) {
        this.prevShowHide = show;
        if (Object.keys(this.favList).length < 1 || !show) {
            this._favoriteMenu.hide();
        } else {
            this._favoriteMenu.show();
        }
    }
}
