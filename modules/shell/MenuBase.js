import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import Signals from './Signals.js';

// Shared by the menus that list connections with a favorite star on each row.
export default class MenuBase {
    constructor() {
        this._signals = new Signals();
        this._pendingIdleIds = [];
        this._destroyMap = {};
    }

    buildFavIcon(isFavorite) {
        const icon_name = isFavorite ? `starred-symbolic` : `non-starred-symbolic`;
        const iconfav = new St.Icon({
            icon_name: icon_name,
            style_class: `system-status-icon`
        });

        return new St.Button({
            style_class: `ci-action-btn`,
            can_focus: true,
            child: iconfav,
            x_align: Clutter.ActorAlign.END,
            x_expand: true,
            y_expand: true
        });
    }

    // Runs `callback` once on idle. The source is tracked so destroy() can remove it.
    _scheduleIdle(callback) {
        const id = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._pendingIdleIds = this._pendingIdleIds.filter(i => i !== id);
            callback();
            return GLib.SOURCE_REMOVE;
        });
        this._pendingIdleIds.push(id);
    }

    _removePendingIdles() {
        this._pendingIdleIds.forEach(id => GLib.Source.remove(id));
        this._pendingIdleIds = [];
    }

    // Disconnects the signals of every tracked row and forgets them. Call before the rows are removed from the menu.
    _releaseRows() {
        Object.values(this._destroyMap).forEach(({menuItemClickId, menuItem}) =>
            this._signals.disconnect([menuItemClickId, menuItem.favoritePressId]));
        this._destroyMap = {};
    }

    // Adds the favorite star to a row and records the row's widgets under `key` for later destruction.
    _addFavoriteButton(key, menuItem, isFavorite, menuItemClickId, onPress) {
        const icofavBtn = this.buildFavIcon(isFavorite);
        menuItem.add_child(icofavBtn);
        menuItem.icofavBtn = icofavBtn;
        this._destroyMap[key] = {menuItemClickId, menuItem, icofavBtn};
        menuItem.favoritePressId = this._signals.connect(icofavBtn, `button-press-event`, onPress);
    }
}
