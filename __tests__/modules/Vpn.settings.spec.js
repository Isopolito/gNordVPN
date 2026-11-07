import {createVpn, createFakeProcCom, readFixture} from '../helpers/vpn.js';
import {FakeSettings} from '../helpers/FakeSettings.js';

const STATUS = 'nordvpn status';
const SETTINGS = 'nordvpn settings';

describe('Vpn.setSettingsFromNord', () => {
    it('writes the mapped keys from real `nordvpn settings` output', async () => {
        const settings = new FakeSettings();
        const procCom = createFakeProcCom({[STATUS]: 'Status: Disconnected', [SETTINGS]: readFixture('settings-current.txt')});
        await createVpn({procCom, settings}).setSettingsFromNord();

        expect(procCom.calls).toEqual([STATUS, SETTINGS]);
        // Only the lines resolveSettingsKey maps are written; Routing, Tray, DNS, ... are ignored.
        expect(settings.writes).toEqual([
            ['connection-protocol', 'nordlynx'],
            ['firewall', true],
            ['killswitch', false],
            ['protection', false],
            ['notify', true],
            ['autoconnect', true],
            ['lan-discovery', false],
            ['post-quantum', false],
        ]);
    });

    it('ignores retired legacy lines and an unmapped protocol string', async () => {
        const settings = new FakeSettings({firewall: true, autoconnect: true});
        const procCom = createFakeProcCom({[STATUS]: 'ok', [SETTINGS]: readFixture('settings-legacy.txt')});
        await createVpn({procCom, settings}).setSettingsFromNord();

        expect(settings.get_string('connection-protocol')).toBe('nordlynx');
        expect(settings.get_boolean('firewall')).toBe(false);
        expect(settings.get_boolean('killswitch')).toBe(true);
        expect(settings.get_boolean('notify')).toBe(false);
        expect(settings.get_boolean('autoconnect')).toBe(false);
        expect(settings.get_boolean('analytics')).toBe(true);
        expect(settings.writes.map(([k]) => k).sort()).toEqual([
            'analytics', 'autoconnect', 'firewall', 'killswitch', 'notify',
        ]);
    });

    it('writes nothing when the daemon is not running', async () => {
        const settings = new FakeSettings();
        const procCom = createFakeProcCom({[STATUS]: new Error('daemon down'), [SETTINGS]: readFixture('settings-current.txt')});
        await createVpn({procCom, settings}).setSettingsFromNord();

        expect(procCom.calls).toEqual([STATUS]);
        expect(settings.writes).toEqual([]);
    });

    it('writes nothing when `nordvpn settings` prints nothing', async () => {
        const settings = new FakeSettings();
        const procCom = createFakeProcCom({[STATUS]: 'ok', [SETTINGS]: ''});
        await createVpn({procCom, settings}).setSettingsFromNord();
        expect(settings.writes).toEqual([]);
    });
});

describe('Vpn.applySettingsToNord', () => {
    const CUSTOM = {
        firewall: true, analytics: false, autoconnect: true, protection: true, killswitch: true,
        notify: false, 'lan-discovery': true, 'post-quantum': false, 'connection-protocol': 'openvpn_tcp',
    };
    const COMMANDS = [
        'nordvpn s firewall true',
        'nordvpn s analytics false',
        'nordvpn s autoconnect true',
        'nordvpn s protection true',
        'nordvpn s killswitch true',
        'nordvpn s notify false',
        'nordvpn s lan-discovery true',
        'nordvpn s post-quantum false', // off before leaving NordLynx
        'nordvpn s protocol openvpn_tcp',
        'nordvpn s firewall true', // the trailing duplicate firewall call
    ];

    it('issues the exact command sequence after a status check', async () => {
        const procCom = createFakeProcCom();
        await createVpn({procCom, settings: new FakeSettings(CUSTOM)}).applySettingsToNord();
        expect(procCom.calls).toEqual([STATUS, ...COMMANDS]);
    });

    it('sets protocol before post-quantum when targeting NordLynx', async () => {
        const procCom = createFakeProcCom();
        const settings = new FakeSettings({...CUSTOM, 'connection-protocol': 'nordlynx', 'post-quantum': true});
        await createVpn({procCom, settings}).applySettingsToNord();
        expect(procCom.calls.slice(7, 10)).toEqual([
            'nordvpn s lan-discovery true', 'nordvpn s protocol nordlynx', 'nordvpn s post-quantum true',
        ]);
        expect(procCom.calls).toHaveLength(11);
    });

    it('forces post-quantum off before a non-NordLynx protocol even if enabled', async () => {
        const procCom = createFakeProcCom();
        const settings = new FakeSettings({...CUSTOM, 'post-quantum': true});
        await createVpn({procCom, settings}).applySettingsToNord();
        expect(procCom.calls.slice(8, 10)).toEqual(['nordvpn s post-quantum false', 'nordvpn s protocol openvpn_tcp']);
    });

    it('issues nothing but the status check when the daemon is not running', async () => {
        const procCom = createFakeProcCom({[STATUS]: new Error('daemon down')});
        await createVpn({procCom, settings: new FakeSettings(CUSTOM)}).applySettingsToNord();
        expect(procCom.calls).toEqual([STATUS]);
    });

    it('keeps going when one command is rejected', async () => {
        const procCom = createFakeProcCom({'nordvpn s post-quantum false': new Error('not supported with OpenVPN')});
        await createVpn({procCom, settings: new FakeSettings(CUSTOM)}).applySettingsToNord();
        expect(procCom.calls).toEqual([STATUS, ...COMMANDS]);
    });

    it('is not affected by a setting changed while the status check is in flight', async () => {
        const settings = new FakeSettings(CUSTOM);
        const inner = createFakeProcCom();
        let release;
        const gate = new Promise(r => { release = r; });
        const procCom = {
            calls: inner.calls,
            async execCommunicateAsync(cmd) {
                if (cmd === STATUS) await gate;
                return inner.execCommunicateAsync(cmd);
            },
        };

        const pending = createVpn({procCom, settings}).applySettingsToNord();
        settings.set_boolean('firewall', false);
        settings.set_string('connection-protocol', 'nordlynx');
        settings.set_boolean('lan-discovery', false);
        release();
        await pending;

        expect(inner.calls).toEqual([STATUS, ...COMMANDS]);
    });
});
