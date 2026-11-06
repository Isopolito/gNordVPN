export default class ResetManager {
    resetAllSettings(settings, protoRow, techRow, cityPicker, serverPicker) {
        this._resetGeneralSetting(settings);
        this._resetAccountSetting(settings);
        this.resetConnectionSettings(settings, protoRow, techRow);
        this._resetCitySetting(settings, cityPicker);
        this.resetServerSetting(settings, serverPicker);
    }
    resetConnectionSettings(settings, protoRow, techRow) {
        this._resetSetting(settings, ['cybersec', 'firewall', 'killswitch', 'obfuscate', 'notify', 'ipv6', 'protocol', 'technology']);

        const protocol = settings.get_string(`protocol`);
        protoRow.selected = protocol === 'UDP' ? 0 : 1;

        const tech = settings.get_string(`technology`);
        techRow.selected = tech === 'OPENVPN' ? 0 : 1;
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
