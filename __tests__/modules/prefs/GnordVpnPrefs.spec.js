import {jest} from '@jest/globals';
import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import {createFakeProcCom} from '../../helpers/vpn.js';   // first: patches the gi stubs Vpn.js needs
import {FakeSettings} from '../../helpers/FakeSettings.js';
import {fakes, registry, resetRegistry, findAll, createWindow} from '../../helpers/fakeGtk.js';
import GnordVpnPrefs from '../../../modules/prefs/GnordVpnPrefs.js';
import ResetManager from '../../../modules/prefs/ResetManager.js';

const {Button, CheckButton} = fakes;

const COUNTRIES_OUT = 'Canada\nFrance\nGermany\nJapan\nUnited_States\n';
const COUNTRY_IDS = [
    {name: 'Canada', id: 38}, {name: 'France', id: 74}, {name: 'Germany', id: 81},
    {name: 'Japan', id: 108}, {name: 'United States', id: 228},
];
const ACCOUNT_OUT = 'Account Information:\nEmail Address: user@example.com\nVPN Service: Active\n';
const flush = () => new Promise(r => setImmediate(r));

// Builds the real prefs UI against FakeSettings and a fake `nordvpn` CLI.
async function buildPrefs({settings = {}, cli = {}} = {}) {
    resetRegistry();
    const fake = new FakeSettings(settings);
    const procCom = createFakeProcCom({
        'nordvpn status': new Error('daemon down'),   // so setSettingsFromNord leaves settings alone
        'nordvpn account': new Error('not logged in'),
        'nordvpn countries': COUNTRIES_OUT,
        ...cli,
    });
    const prefs = new GnordVpnPrefs(fake, {name: 'gNordVpn-Local', version: '1'});
    prefs._vpn._procCom = procCom;
    prefs._vpn._httpGet = async () => COUNTRY_IDS;
    const window = createWindow();
    prefs.fillPreferencesWindow(window);
    await flush();
    fake.writes.length = 0; // only record what the test itself does
    return {prefs, settings: fake, procCom, window};
}

const rowTitled = (Class, title) => {
    const row = findAll(Class).find(r => r.title === title);
    if (!row) throw new Error(`no ${Class.name} titled '${title}'`);
    return row;
};
const switchRow = (title) => rowTitled(Adw.SwitchRow, title);
const comboRow = (title) => rowTitled(Adw.ComboRow, title);

const buttonLabelled = (label) => findAll(Button).find(b => b.label === label);

describe('GnordVpnPrefs', () => {
    describe('General page', () => {
        it('shows the version row with the repo link', async () => {
            resetRegistry();
            const prefs = new GnordVpnPrefs(new FakeSettings({}), {name: 'gNordVpn-Local', version: '7', url: 'https://example.com/repo'});
            prefs._vpn._procCom = createFakeProcCom({'nordvpn status': new Error('down'), 'nordvpn account': new Error('x'), 'nordvpn countries': COUNTRIES_OUT});
            prefs._vpn._httpGet = async () => COUNTRY_IDS;
            prefs.fillPreferencesWindow(createWindow());
            await flush();
            const row = rowTitled(Adw.ActionRow, 'gNordVpn-Local, v7');
            expect(row.subtitle).toBe('<a href="https://example.com/repo">https://example.com/repo</a>');
        });

        it('shows the panel position setting and writes changes to panel-position', async () => {
            const {settings} = await buildPrefs();
            const combo = comboRow('Panel position');
            expect(combo.model.strings).toEqual(['Left', 'Center', 'Right']);
            expect(combo.selected).toBe(2);

            combo.selected = 0;
            expect(settings.get_string('panel-position')).toBe('left');
            combo.selected = 1;
            expect(settings.get_string('panel-position')).toBe('center');
        });

        it.each([
            ['Show a Favorites submenu', 'commonfavorite', false],
            ['Show a Groups submenu', 'showgroups', true],
            ['Write debug messages to the log', 'debug-logging', false],
        ])('binds the "%s" switch to %s both ways', async (title, key, initial) => {
            const {settings} = await buildPrefs();
            const sw = switchRow(title);
            expect(sw.active).toBe(initial);

            sw.active = !initial;
            expect(settings.get_boolean(key)).toBe(!initial);
            settings.set_boolean(key, initial);
            expect(sw.active).toBe(initial);
        });

        it('binds the refresh interval spin row to refresh-timeout', async () => {
            const {settings} = await buildPrefs();
            const spin = rowTitled(Adw.SpinRow, 'Seconds between NordVPN status calls');
            expect(spin.value).toBe(15);

            spin.value = 30;
            expect(settings.get_int('refresh-timeout')).toBe(30);
        });

        it('Reset All Settings resets through ResetManager', async () => {
            const spy = jest.spyOn(ResetManager.prototype, 'resetAllSettings');
            try {
                const {settings} = await buildPrefs({settings: {
                    autoconnect: true, commonfavorite: true, showlogin: false, showlogout: true,
                    firewall: true, protocol: 'TCP', technology: 'NORDLYNX', showgroups: false,
                    'number-cities-per-countries': 3, 'number-servers-per-countries': 4,
                }});
                buttonLabelled('Reset All Settings').click();

                expect(spy).toHaveBeenCalledTimes(1);
                for (const key of ['autoconnect', 'commonfavorite', 'showgroups', 'showlogin', 'showlogout', 'firewall', 'protocol',
                    'technology', 'number-cities-per-countries', 'number-servers-per-countries']) {
                    expect({key, value: settings.get_value(key).deep_unpack()})
                        .toEqual({key, value: settings.get_default_value(key).deep_unpack()});
                }
            } finally {
                spy.mockRestore();
            }
        });
    });

    describe('Account page', () => {
        it('binds the show login and show logout switches to their keys', async () => {
            const {settings} = await buildPrefs();
            const login = switchRow('Show login button in menu');
            const logout = switchRow('Show logout button in menu');
            expect([login.active, logout.active]).toEqual([true, false]);

            login.active = false;
            logout.active = true;
            expect(settings.get_boolean('showlogin')).toBe(false);
            expect(settings.get_boolean('showlogout')).toBe(true);
            settings.set_boolean('showlogin', true);
            expect(login.active).toBe(true);
        });

        it('logged out: only Login is enabled and it calls Vpn.loginVpn', async () => {
            const {prefs} = await buildPrefs();
            const loginSpy = jest.spyOn(prefs._vpn, 'loginVpn').mockResolvedValue();
            const logoutSpy = jest.spyOn(prefs._vpn, 'logoutVpn').mockResolvedValue();

            buttonLabelled('Logout').click();   // disabled: ignored
            expect(logoutSpy).not.toHaveBeenCalled();
            buttonLabelled('Login').click();
            expect(loginSpy).toHaveBeenCalledTimes(1);
        });

        it('logged in: only Logout is enabled and it calls Vpn.logoutVpn', async () => {
            const {prefs} = await buildPrefs({cli: {'nordvpn account': ACCOUNT_OUT}});
            const loginSpy = jest.spyOn(prefs._vpn, 'loginVpn').mockResolvedValue();
            const logoutSpy = jest.spyOn(prefs._vpn, 'logoutVpn').mockResolvedValue();

            expect(rowTitled(Adw.ActionRow, 'Email').subtitle).toBe('user@example.com');
            expect(rowTitled(Adw.ActionRow, 'Status').subtitle).toBe('Active');
            buttonLabelled('Login').click();    // disabled: ignored
            expect(loginSpy).not.toHaveBeenCalled();
            buttonLabelled('Logout').click();
            expect(logoutSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('Connection page', () => {
        const SWITCHES = {
            'Autoconnect to VPN on startup': 'autoconnect',
            'CyberSec': 'cybersec',
            'Firewall': 'firewall',
            'Killswitch': 'killswitch',
            'Obfuscate': 'obfuscate',
            'Analytics': 'analytics',
            'IPv6': 'ipv6',
        };

        it.each(Object.entries(SWITCHES))('switch "%s" writes %s', async (title, key) => {
            const {settings} = await buildPrefs();
            const sw = switchRow(title);
            expect(sw.active).toBe(settings.get_boolean(key));

            sw.active = true;
            expect(settings.get_boolean(key)).toBe(true);
            sw.active = false;
            expect(settings.get_boolean(key)).toBe(false);
            settings.set_boolean(key, true);
            expect(sw.active).toBe(true);
        });

        it('says changes are sent to NordVPN on Apply', async () => {
            await buildPrefs();
            const group = findAll(Adw.PreferencesGroup).find(g => g.description === 'Changes are sent to NordVPN when you press Apply.');
            expect(group).toBeDefined();
        });

        it('technology row writes OPENVPN / NORDLYNX', async () => {
            const {settings} = await buildPrefs({settings: {technology: 'OPENVPN'}});
            const tech = comboRow('Technology');
            expect(tech.model.strings).toEqual(['OpenVpn', 'NordLynx']);
            expect(tech.selected).toBe(0);

            tech.selected = 1;
            expect(settings.get_string('technology')).toBe('NORDLYNX');
            tech.selected = 0;
            expect(settings.get_string('technology')).toBe('OPENVPN');
        });

        it('protocol row writes UDP / TCP', async () => {
            const {settings} = await buildPrefs();
            const proto = comboRow('Protocol');
            expect(proto.selected).toBe(0);
            proto.selected = 1;
            expect(settings.get_string('protocol')).toBe('TCP');
            proto.selected = 0;
            expect(settings.get_string('protocol')).toBe('UDP');
        });

        it('a fresh install (schema defaults) shows OpenVPN', async () => {
            await buildPrefs();
            expect(comboRow('Technology').selected).toBe(0);
        });

        it('OPENVPN enables obfuscate and protocol; NORDLYNX disables them', async () => {
            await buildPrefs({settings: {technology: 'OPENVPN'}});
            const [obfuscate, proto, tech] = [switchRow('Obfuscate'), comboRow('Protocol'), comboRow('Technology')];
            expect([obfuscate.sensitive, proto.sensitive]).toEqual([true, true]);

            tech.selected = 1;
            expect([obfuscate.sensitive, proto.sensitive]).toEqual([false, false]);
            tech.selected = 0;
            expect([obfuscate.sensitive, proto.sensitive]).toEqual([true, true]);
        });

        it('starts with obfuscate and protocol disabled when technology is NORDLYNX', async () => {
            await buildPrefs({settings: {technology: 'NORDLYNX'}});
            expect(switchRow('Obfuscate').sensitive).toBe(false);
            expect(comboRow('Protocol').sensitive).toBe(false);
        });

        it('refreshes the rows from `nordvpn settings` after the async sync', async () => {
            const {settings} = await buildPrefs({
                settings: {technology: 'OPENVPN', protocol: 'UDP'},
                cli: {'nordvpn status': 'Status: Disconnected', 'nordvpn settings': 'Technology: NORDLYNX\nProtocol: TCP\n'},
            });
            expect(settings.get_string('technology')).toBe('NORDLYNX');
            expect(comboRow('Technology').selected).toBe(1);
            expect(comboRow('Protocol').selected).toBe(1);
            expect(comboRow('Protocol').sensitive).toBe(false);
        });

        it('Apply calls applySettingsToNord once and is disabled while it runs', async () => {
            const {prefs} = await buildPrefs();
            let finish;
            const spy = jest.spyOn(prefs._vpn, 'applySettingsToNord').mockReturnValue(new Promise(r => { finish = r; }));
            const apply = buttonLabelled('Apply');

            apply.click();
            expect(apply.sensitive).toBe(false);
            apply.click();   // ignored while in flight
            expect(spy).toHaveBeenCalledTimes(1);

            finish();
            await flush();
            expect(apply.sensitive).toBe(true);
            expect(spy).toHaveBeenCalledTimes(1);
        });

        it('Reset Connection Settings restores the schema defaults, ending on OPENVPN', async () => {
            const {settings} = await buildPrefs({settings: {
                cybersec: true, firewall: true, killswitch: true, obfuscate: true, notify: true, ipv6: true,
                protocol: 'TCP', technology: 'NORDLYNX',
            }});
            buttonLabelled('Reset Connection Settings').click();

            for (const key of ['cybersec', 'firewall', 'killswitch', 'obfuscate', 'notify', 'ipv6', 'protocol']) {
                expect({key, value: settings.get_value(key).deep_unpack()})
                    .toEqual({key, value: settings.get_default_value(key).deep_unpack()});
            }
            expect(settings.get_string('technology')).toBe('OPENVPN');
            expect(comboRow('Technology').selected).toBe(0);
            expect(comboRow('Protocol').selected).toBe(0);
            expect(comboRow('Protocol').sensitive).toBe(true);
        });
    });

    describe('Cities and Servers pages', () => {
        const pickerRows = (picker) => picker.group.children;
        const checked = (picker) => pickerRows(picker).filter(r => r.children[0].active).map(r => r.title);
        const check = (picker, title) => pickerRows(picker).find(r => r.title === title).children.find(c => c instanceof CheckButton);

        it('populates both pickers from the CLI countries and checks the saved ones first', async () => {
            const {prefs} = await buildPrefs({settings: {
                'countries-selected-for-cities': ['Germany', 'United_States'],
                'countries-selected-for-servers': [74],
            }});
            expect(pickerRows(prefs._cityPicker).map(r => r.title)).toEqual(['Germany', 'United States', 'Canada', 'France', 'Japan']);
            expect(checked(prefs._cityPicker)).toEqual(['Germany', 'United States']);
            expect(pickerRows(prefs._serverPicker).map(r => r.title)).toEqual(['France', 'Canada', 'Germany', 'Japan', 'United States']);
            expect(checked(prefs._serverPicker)).toEqual(['France']);
        });

        it('does not write settings while the pickers are being populated', async () => {
            const fake = new FakeSettings({
                'countries-selected-for-cities': ['Germany'],
                'countries-selected-for-servers': [74],
            });
            resetRegistry();
            const prefs = new GnordVpnPrefs(fake);
            prefs._vpn._procCom = createFakeProcCom({'nordvpn status': new Error('down'), 'nordvpn account': new Error('x'), 'nordvpn countries': COUNTRIES_OUT});
            prefs._vpn._httpGet = async () => COUNTRY_IDS;
            prefs.fillPreferencesWindow(createWindow());
            await flush();

            const touched = fake.writes.map(([k]) => k);
            expect(touched).not.toContain('countries-selected-for-cities');
            expect(touched).not.toContain('countries-selected-for-servers');
        });

        it('writes countries-selected-for-cities when a country is toggled', async () => {
            const {prefs, settings} = await buildPrefs();
            check(prefs._cityPicker, 'Canada').userSet(true);
            check(prefs._cityPicker, 'United States').userSet(true);
            expect(settings.get_value('countries-selected-for-cities').deep_unpack()).toEqual(['Canada', 'United_States']);

            check(prefs._cityPicker, 'Canada').userSet(false);
            check(prefs._cityPicker, 'United States').userSet(false);
            expect(settings.get_value('countries-selected-for-cities').deep_unpack()).toEqual([]);
        });

        it('writes countries-selected-for-servers (country ids) when a country is toggled', async () => {
            const {prefs, settings} = await buildPrefs();
            check(prefs._serverPicker, 'Germany').userSet(true);
            check(prefs._serverPicker, 'Japan').userSet(true);
            expect(settings.get_value('countries-selected-for-servers').deep_unpack()).toEqual([81, 108]);
        });

        it('shows the failed state when the country list cannot be read', async () => {
            const {prefs} = await buildPrefs({cli: {'nordvpn countries': new Error('down')}});
            expect(pickerRows(prefs._cityPicker).map(r => r.title)).toEqual(['Couldn’t load countries — is nordvpnd running?']);
        });

        it('binds the max cities / servers spin rows to their keys', async () => {
            const {settings} = await buildPrefs();
            const cities = findAll(Adw.SpinRow).find(r => r.title === 'Max cities per country');
            const servers = findAll(Adw.SpinRow).find(r => r.title === 'Max servers per country');
            expect([cities.value, servers.value]).toEqual([10, 10]);

            cities.value = 25;
            servers.value = 7;
            expect(settings.get_int('number-cities-per-countries')).toBe(25);
            expect(settings.get_int('number-servers-per-countries')).toBe(7);
        });

        it('Reset All Settings re-syncs the pickers with the defaults', async () => {
            const {prefs} = await buildPrefs({settings: {'countries-selected-for-cities': ['Japan']}});
            expect(checked(prefs._cityPicker)).toEqual(['Japan']);
            buttonLabelled('Reset All Settings').click();
            expect(checked(prefs._cityPicker)).toEqual([]);
        });
    });
});

describe('closing the preferences window', () => {
    const cancelled = () => new GLib.Error(0, Gio.IOErrorEnum.CANCELLED, 'Operation was cancelled');

    // A fake CLI that honours the cancellable like the real ProcCom, and can hold `nordvpn countries`.
    function openWindow({holdCountries} = {}) {
        resetRegistry();
        const fake = new FakeSettings({});
        const prefs = new GnordVpnPrefs(fake, {name: 'gNordVpn-Local', version: '1'});
        const calls = [];
        prefs._vpn._procCom = {
            calls,
            async execCommunicateAsync(cmd, cancellable = null) {
                calls.push({cmd, cancellable});
                if (cmd === 'nordvpn countries' && holdCountries) await holdCountries;
                if (cancellable?.is_cancelled()) throw cancelled();
                if (cmd === 'nordvpn status' || cmd === 'nordvpn account') throw new Error('down');
                return COUNTRIES_OUT;
            },
        };
        prefs._vpn._httpGet = async () => COUNTRY_IDS;
        const window = createWindow();
        prefs.fillPreferencesWindow(window);
        return {prefs, window, calls};
    }

    it('cancels the pending reads and leaves the country pickers loading', async () => {
        let release;
        const {prefs, window} = openWindow({holdCountries: new Promise(r => { release = r; })});
        window.emit('destroy');
        expect(prefs._vpn._cancellable.is_cancelled()).toBe(true);
        release();
        await flush();
        expect(prefs._cityPicker.group.children.map(r => r.title)).toEqual(['Loading countries…']);
    });

    it('still runs Apply after the window closed, because its commands are never cancelled', async () => {
        const {prefs, window, calls} = openWindow();
        await flush();
        window.emit('destroy');
        calls.length = 0;
        await prefs._vpn.applySettingsToNord();
        expect(calls.length).toBeGreaterThan(0);
        expect(calls.every(c => c.cancellable === null)).toBe(true);
    });
});
