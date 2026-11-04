import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import Logger, {setDebugLogging} from './modules/Logger.js';
import VpnIndicator from './modules/VpnIndicator.js';

export default class GnordVpnLocal extends Extension {
    _isExtensionEnabled = false;
    _log = new Logger('Extension');

    enable() {
        if (this._isExtensionEnabled) {
            this._log.warn('enable() ignored because extension is already enabled');
            return;
        }
        this._isExtensionEnabled = true;

        this._settings = this.getSettings();
        setDebugLogging(this._settings.get_boolean('debug-logging'));
        this._debugLoggingChangedId = this._settings.connect('changed::debug-logging',
            () => setDebugLogging(this._settings.get_boolean('debug-logging')));
        this._log.debug('enable() called');

        this._vpnIndicator = new VpnIndicator(this);
        this._vpnIndicator.enable();

        Main.panel.addToStatusArea(this._vpnIndicator.getName(), this._vpnIndicator, 0, this._vpnIndicator.getPanelPosition());
    }

    disable() {
        this._log.debug('disable() called');
        if (this._vpnIndicator) {
            this._vpnIndicator.disable();
            this._vpnIndicator.destroy();
            this._vpnIndicator = null;
        }

        this._settings.disconnect(this._debugLoggingChangedId);
        this._debugLoggingChangedId = null;
        this._settings = null;
        setDebugLogging(false);

        this._isExtensionEnabled = false;
    }
}
