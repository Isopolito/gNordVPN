import {jest} from '@jest/globals';
import ResetManager from '../../../modules/prefs/ResetManager.js';

const DEFAULTS = {
    'autoconnect': false,
    'commonfavorite': true,
    'showlogin': true,
    'showlogout': true,
    'protection': false,
    'firewall': true,
    'killswitch': false,
    'notify': true,
    'lan-discovery': false,
    'post-quantum': false,
    'connection-protocol': 'nordlynx',
    'number-cities-per-countries': 5,
    'countries-selected-for-cities': ['United_States', 'Germany'],
    'number-servers-per-countries': 5,
    'countries-selected-for-servers': ['France'],
};

// Variants wrap a value the way GSettings does: get_value() returns an object with deep_unpack().
const variant = (v) => ({deep_unpack: () => v, unpack: () => v});

function createSettings(overrides = {}) {
    const values = {...DEFAULTS, ...overrides};
    return {
        values,
        set_value: jest.fn((key, v) => { values[key] = v.deep_unpack(); }),
        get_default_value: jest.fn((key) => variant(DEFAULTS[key])),
        get_value: jest.fn((key) => variant(values[key])),
        get_string: jest.fn((key) => values[key]),
    };
}

const createPicker = () => ({refresh: jest.fn()});

const createRow = () => ({selected: -1});

describe('ResetManager', () => {
    let manager;
    beforeEach(() => { manager = new ResetManager(); });

    describe('resetConnectionSettings', () => {
        it('resets connection keys to their defaults', () => {
            const settings = createSettings({
                firewall: false, killswitch: true, protection: true, 'lan-discovery': true, 'post-quantum': true,
                notify: false, 'connection-protocol': 'openvpn_tcp',
            });
            manager.resetConnectionSettings(settings, createRow());
            expect(settings.values).toMatchObject({
                firewall: true, killswitch: false, protection: false, 'lan-discovery': false, 'post-quantum': false,
                notify: true, 'connection-protocol': 'nordlynx',
            });
        });

        it('restores the combo row to the index of the default protocol', () => {
            const settings = createSettings({'connection-protocol': 'openvpn_tcp'});
            const proto = createRow();
            manager.resetConnectionSettings(settings, proto);
            expect(proto.selected).toBe(0);
        });

        it('selects the matching index when the default protocol is not the first entry', () => {
            const settings = createSettings();
            settings.get_default_value.mockImplementation((key) => variant(key === 'connection-protocol' ? 'openvpn_tcp' : DEFAULTS[key]));
            const proto = createRow();
            manager.resetConnectionSettings(settings, proto);
            expect(proto.selected).toBe(2);
        });
    });

    describe('_resetCitySetting', () => {
        it('resets the city keys and refreshes the picker (regression: used this.settings)', () => {
            const settings = createSettings({'number-cities-per-countries': 9, 'countries-selected-for-cities': ['Spain']});
            const picker = createPicker();

            manager._resetCitySetting(settings, picker);

            expect(settings.values['number-cities-per-countries']).toBe(5);
            expect(settings.values['countries-selected-for-cities']).toEqual(['United_States', 'Germany']);
            expect(picker.refresh).toHaveBeenCalledTimes(1);
        });
    });

    describe('resetServerSetting', () => {
        it('resets the server keys and refreshes the picker (regression: used this.settings)', () => {
            const settings = createSettings({'number-servers-per-countries': 1, 'countries-selected-for-servers': ['Spain']});
            const picker = createPicker();

            manager.resetServerSetting(settings, picker);

            expect(settings.values['number-servers-per-countries']).toBe(5);
            expect(settings.values['countries-selected-for-servers']).toEqual(['France']);
            expect(picker.refresh).toHaveBeenCalledTimes(1);
        });
    });

    describe('resetAllSettings', () => {
        it('resets every group including cities and servers without throwing', () => {
            const settings = createSettings({
                autoconnect: true, commonfavorite: false, showlogin: false, showlogout: false,
                firewall: false, 'number-cities-per-countries': 9, 'number-servers-per-countries': 9,
                'countries-selected-for-cities': ['Spain'], 'countries-selected-for-servers': ['Spain'],
            });
            const cityPicker = createPicker();
            const serverPicker = createPicker();

            manager.resetAllSettings(settings, createRow(), cityPicker, serverPicker);

            expect(settings.values).toMatchObject(DEFAULTS);
            expect(cityPicker.refresh).toHaveBeenCalledTimes(1);
            expect(serverPicker.refresh).toHaveBeenCalledTimes(1);
        });
    });
});
