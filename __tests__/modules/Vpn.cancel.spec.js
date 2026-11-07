import {jest} from '@jest/globals';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {createFakeSettings, createVpn} from '../helpers/vpn.js';

const STATUS = 'nordvpn status';
const cancelledError = () => new GLib.Error(0, Gio.IOErrorEnum.CANCELLED, 'Operation was cancelled');

// Fake ProcCom that records the cancellable each command was given and honours it like the real one:
// a cancelled cancellable rejects the call.
function createRecordingProcCom({responses = {}, hold = {}} = {}) {
    const calls = [];
    return {
        calls,
        async execCommunicateAsync(cmd, cancellable = null) {
            calls.push({cmd, cancellable});
            if (hold[cmd]) await hold[cmd];
            if (cancellable?.is_cancelled()) throw cancelledError();
            const r = responses[cmd];
            if (r instanceof Error) throw r;
            return r ?? '';
        },
        cmds: () => calls.map(c => c.cmd),
        cancellableOf: (cmd) => calls.find(c => c.cmd === cmd).cancellable,
    };
}

const vpnWith = (procCom, settings = createFakeSettings({
    'number-cities-per-countries': 5, 'countries-selected-for-cities': ['Albania'], 'countries-selected-for-servers': [],
    'number-servers-per-countries': 5, 'connection-protocol': 'nordlynx',
})) => {
    const vpn = createVpn({procCom, settings});
    vpn._session = {abort: jest.fn()};
    return vpn;
};

describe('Vpn read-only calls carry the cancellable', () => {
    it.each([
        ['getStatus', STATUS, (v) => v.getStatus()],
        ['checkLogin', 'nordvpn account', (v) => v.checkLogin()],
        ['getAccount', 'nordvpn account', (v) => v.getAccount()],
        ['getCountries', 'nordvpn countries', (v) => v.getCountries(false, true)],
        ['getCities', 'nordvpn cities Albania', (v) => v.getCities(true)],
        ['setSettingsFromNord', 'nordvpn settings', (v) => v.setSettingsFromNord()],
    ])('%s', async (name, cmd, call) => {
        const procCom = createRecordingProcCom();
        const vpn = vpnWith(procCom);
        await call(vpn);
        expect(procCom.cancellableOf(cmd)).toBe(vpn._cancellable);
    });
});

describe('Vpn state-changing calls never carry a cancellable', () => {
    it('connectVpn with a query, disconnect, login and logout', async () => {
        const procCom = createRecordingProcCom({responses: {'nordvpn login': 'Continue in the browser: http://x'}});
        const vpn = vpnWith(procCom);
        Gio.app_info_launch_default_for_uri = () => {};
        await vpn.connectVpn('Albania');
        await vpn.disconnectVpn();
        await vpn.loginVpn();
        await vpn.logoutVpn();
        expect(procCom.calls.length).toBeGreaterThanOrEqual(6);
        expect(procCom.calls.every(c => c.cancellable === null)).toBe(true);
    });

    it('applySettingsToNord, including its status probe', async () => {
        const procCom = createRecordingProcCom();
        const vpn = vpnWith(procCom, createFakeSettings({
            firewall: true, analytics: false, autoconnect: true, protection: false, killswitch: true,
            notify: false, 'lan-discovery': true, 'post-quantum': false, 'connection-protocol': 'openvpn_tcp',
        }));
        await vpn.applySettingsToNord();
        expect(procCom.calls).toHaveLength(11);
        expect(procCom.calls.every(c => c.cancellable === null)).toBe(true);
    });
});

describe('Vpn.destroy', () => {
    it('cancels the cancellable and aborts the HTTP session', () => {
        const vpn = vpnWith(createRecordingProcCom());
        vpn.destroy();
        expect(vpn._cancellable.is_cancelled()).toBe(true);
        expect(vpn._session.abort).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['getStatus', (v) => v.getStatus()],
        ['checkLogin', (v) => v.checkLogin()],
        ['getAccount', (v) => v.getAccount()],
        ['getCountries', (v) => v.getCountries(false, true)],
        ['getCities', (v) => v.getCities(true)],
        ['setSettingsFromNord', (v) => v.setSettingsFromNord()],
    ])('rejects a cancelled %s instead of resolving', async (name, call) => {
        const vpn = vpnWith(createRecordingProcCom());
        vpn.destroy();
        await expect(call(vpn)).rejects.toMatchObject({code: Gio.IOErrorEnum.CANCELLED});
    });

    it.each([
        ['getCountries with ids', (v) => v.getCountries(true, true)],
        ['getServers', (v) => v.getServers(true)],
    ])('rejects a cancelled HTTP lookup: %s', async (name, call) => {
        const settings = createFakeSettings({
            'number-servers-per-countries': 5, 'countries-selected-for-servers': [1], 'connection-protocol': 'nordlynx',
        });
        const vpn = vpnWith(createRecordingProcCom(), settings);
        vpn._httpGet = async () => { throw cancelledError(); };
        await expect(call(vpn)).rejects.toMatchObject({code: Gio.IOErrorEnum.CANCELLED});
    });

    it('keeps the existing failure results for non-cancel errors', async () => {
        const vpn = vpnWith(createRecordingProcCom({responses: {'nordvpn account': new Error('nope')}}));
        expect(await vpn.getAccount()).toEqual({emailAddress: undefined, vpnService: undefined});
        expect(await vpn.checkLogin()).toBe(false);
    });

    it('lets connectVpn(query) finish all three commands after destroy()', async () => {
        let release;
        const procCom = createRecordingProcCom({hold: {'nordvpn set autoconnect off': new Promise(r => { release = r; })}});
        const vpn = vpnWith(procCom);
        const pending = vpn.connectVpn('Albania');
        vpn.destroy();
        release();
        await pending;
        expect(procCom.cmds()).toEqual([
            'nordvpn set autoconnect off', 'nordvpn set autoconnect on  Albania', 'nordvpn c Albania',
        ]);
    });

    it('lets applySettingsToNord finish when destroy() lands during its status probe', async () => {
        let release;
        const procCom = createRecordingProcCom({hold: {[STATUS]: new Promise(r => { release = r; })}});
        const vpn = vpnWith(procCom, createFakeSettings({
            firewall: true, analytics: false, autoconnect: true, protection: false, killswitch: true,
            notify: false, 'lan-discovery': true, 'post-quantum': false, 'connection-protocol': 'openvpn_tcp',
        }));
        const pending = vpn.applySettingsToNord();
        vpn.destroy();
        release();
        await pending;
        expect(procCom.calls).toHaveLength(11);
    });
});

describe('Vpn.loginVpn', () => {
    it('suppresses a second login, even from a new instance, while the first is pending', async () => {
        Gio.app_info_launch_default_for_uri = () => {};
        let release;
        const first = createRecordingProcCom({hold: {'nordvpn login': new Promise(r => { release = r; })}});
        const second = createRecordingProcCom();
        const a = vpnWith(first);
        const b = vpnWith(second);
        const pending = a.loginVpn();
        a.destroy();
        await b.loginVpn();
        expect(second.calls).toHaveLength(0);
        release();
        await pending;
        await b.loginVpn();
        expect(second.cmds()).toEqual(['nordvpn login']);
    });
});
