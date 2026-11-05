import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {setDebugLogging} from './modules/Logger.js';
import GnordVpnPrefs from './modules/prefs/GnordVpnPrefs.js';

export default class Prefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        setDebugLogging(settings.get_boolean('debug-logging'));
        const prefs = new GnordVpnPrefs(
            settings,
            this.metadata
        );
        return prefs.fillPreferencesWindow(window);
    }
}
