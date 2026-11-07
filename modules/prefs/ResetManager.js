import {PROTOCOLS} from '../constants.js';

export default class ResetManager {
    resetAllSettings(settings, protoRow, cityPicker, serverPicker) {
        this._resetGeneralSetting(settings);
        this._resetAccountSetting(settings);
        this.resetConnectionSettings(settings, protoRow);
        this._resetCitySetting(settings, cityPicker);
        this.resetServerSetting(settings, serverPicker);
    }
    resetConnectionSettings(settings, protoRow) {
        this._resetSetting(settings, ['protection', 'firewall', 'killswitch', 'notify', 'lan-discovery', 'post-quantum', 'connection-protocol']);

        const protocol = settings.get_string(`connection-protocol`);
        protoRow.selected = Math.max(0, PROTOCOLS.findIndex(([value]) => value === protocol));
    }

    _resetGeneralSetting(settings) {
        this._resetSetting(settings, ['autoconnect', 'commonfavorite', 'showgroups']);
    }

    _resetAccountSetting(settings) {
        this._resetSetting(settings, ['showlogin', 'showlogout']);
    }

    _resetCitySetting(settings, cityPicker) {
        this._resetSetting(settings, ['number-cities-per-countries', 'countries-selected-for-cities']);
        cityPicker.refresh();
    }

    resetServerSetting(settings, serverPicker) {
        this._resetSetting(settings, ['number-servers-per-countries', 'countries-selected-for-servers']);
        serverPicker.refresh();
    }

    _resetSetting(settings, keys) {
        keys.forEach(key => {
            settings.set_value(key, settings.get_default_value(key));
        });
    }
}
