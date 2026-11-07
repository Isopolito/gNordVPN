import Gio from 'gi://Gio';
import Soup from 'gi://Soup';
import * as helpers from '../helpers/vpn.js';

// Vpn.js talks to GNOME through gi:// modules, which jest maps to the stubs in __mocks__/gi.
// The constructor needs a few fakes on those stubs; ProcCom is replaced per test.
globalThis.log = () => {};
Soup.Session = {new: () => ({}), prototype: {}};
Soup.get_major_version = () => 3;
Gio._promisify = () => {};
Gio.Subprocess = {prototype: {}};

const {default: Vpn} = await import('../../modules/Vpn.js');

function createTrackedProcCom({ rejects } = {}) {
    const calls = [];
    return {
        async execCommunicateAsync(cmd) {
            calls.push(cmd);
            if (rejects) throw rejects;
        },
        calls
    };
}

function createVpn(procCom) {
    const vpn = new Vpn({});
    vpn._procCom = procCom;
    return vpn;
}

describe('checkLogin', () => {
    it('should return true when nordvpn account succeeds (logged in)', async () => {
        const mockProcCom = createTrackedProcCom();
        const vpn = createVpn(mockProcCom);
        expect(await vpn.checkLogin()).toBe(true);
        expect(mockProcCom.calls).toContain('nordvpn account');
    });

    it('should return false when nordvpn account throws a plain Error (logged out)', async () => {
        const mockProcCom = createTrackedProcCom({ rejects: new Error("You're not logged in.") });
        const vpn = createVpn(mockProcCom);
        expect(await vpn.checkLogin()).toBe(false);
        expect(mockProcCom.calls).toContain('nordvpn account');
    });

    it('should re-throw GLib errors (infrastructure failures)', async () => {
        const glibErr = new Error('spawn failed');
        glibErr.code = 2;
        const mockProcCom = createTrackedProcCom({ rejects: glibErr });
        const vpn = createVpn(mockProcCom);
        await expect(vpn.checkLogin()).rejects.toBe(glibErr);
    });

    it('should use nordvpn account command, not nordvpn login', async () => {
        const mockProcCom = createTrackedProcCom();
        const vpn = createVpn(mockProcCom);
        await vpn.checkLogin();
        expect(mockProcCom.calls).not.toContain('nordvpn login');
        expect(mockProcCom.calls).toContain('nordvpn account');
    });
});

describe('getGroups', () => {
    const GROUPS = 'nordvpn groups';
    const groupsVpn = (out) => helpers.createVpn({procCom: helpers.createFakeProcCom({[GROUPS]: out})});

    it('parses the real `nordvpn groups` output into display names', async () => {
        expect(await groupsVpn(helpers.readFixture('groups.txt')).getGroups()).toEqual({
            'Dedicated IP': 'Dedicated_IP',
            'Double VPN': 'Double_VPN',
            'Onion Over VPN': 'Onion_Over_VPN',
            'Standard VPN Servers': 'Standard_VPN_Servers',
            'Dedicated Server': 'Dedicated_Server',
        });
    });

    it('accepts one group per line', async () => {
        expect(await groupsVpn('Double_VPN\nOnion_Over_VPN\n').getGroups()).toEqual({'Double VPN': 'Double_VPN', 'Onion Over VPN': 'Onion_Over_VPN'});
    });

    it('drops a "new version available" notice', async () => {
        const out = `A new version of NordVPN is available! Please update the application.\n${helpers.readFixture('groups.txt')}`;
        const groups = await groupsVpn(out).getGroups();
        expect(Object.values(groups)).toEqual(['Dedicated_IP', 'Double_VPN', 'Onion_Over_VPN', 'Standard_VPN_Servers', 'Dedicated_Server']);
    });

    it('returns null for empty output or output with only a notice', async () => {
        expect(await groupsVpn('').getGroups()).toBeNull();
        expect(await groupsVpn('A new version of NordVPN is available! Please update the application.\n').getGroups()).toBeNull();
    });

    it('returns null without running nordvpn when the daemon is not running', async () => {
        const procCom = helpers.createFakeProcCom({[GROUPS]: 'Double_VPN'});
        expect(await helpers.createVpn({procCom}).getGroups(false)).toBeNull();
        expect(procCom.calls).toEqual([]);
    });

    it('is what getConnectionList returns for groups', async () => {
        expect(await groupsVpn('Double_VPN').getConnectionList('groups')).toEqual({'Double VPN': 'Double_VPN'});
    });
});
