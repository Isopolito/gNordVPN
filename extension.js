import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {setDebugLogging} from './modules/Logger.js';
import VpnIndicator from './modules/shell/VpnIndicator.js';

export default class GnordVpnLocal extends Extension {
    enable() {
        this._settings = this.getSettings();
        setDebugLogging(this._settings.get_boolean('debug-logging'));
        this._debugLoggingChangedId = this._settings.connect('changed::debug-logging',
            () => setDebugLogging(this._settings.get_boolean('debug-logging')));

        this._vpnIndicator = new VpnIndicator(this);
        this._vpnIndicator.enable();

        Main.panel.addToStatusArea(this._vpnIndicator.getName(), this._vpnIndicator, 0, this._vpnIndicator.getPanelPosition());
    }

    disable() {
        this._vpnIndicator.destroy();
        this._vpnIndicator = null;

        this._settings.disconnect(this._debugLoggingChangedId);
        this._debugLoggingChangedId = null;
        this._settings = null;
        setDebugLogging(false);
    }
}
