import {jest} from '@jest/globals';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';
import {createVpn} from '../helpers/vpn.js';

Soup.Message = {new: jest.fn((method, url) => ({method, url, status: 200, get_status() { return this.status; }, get_reason_phrase: () => 'Not Found'}))};
Soup.Status = {OK: 200};

const bytesOf = (text) => ({get_data: () => new TextEncoder().encode(text)});

function vpnWithSession(send) {
    const vpn = createVpn();
    vpn._session = {send_and_read_async: jest.fn(send), abort: jest.fn()};
    return vpn;
}

describe('Vpn._httpGet', () => {
    it('parses the JSON body of a 200 response and passes the cancellable', async () => {
        const vpn = vpnWithSession(async () => bytesOf('[{"name":"Albania","id":2}]'));
        expect(await vpn._httpGet('https://api.nordvpn.com/v1/servers/countries')).toEqual([{name: 'Albania', id: 2}]);
        const [msg, , cancellable] = vpn._session.send_and_read_async.mock.calls[0];
        expect(msg.url).toBe('https://api.nordvpn.com/v1/servers/countries');
        expect(cancellable).toBe(vpn._cancellable);
    });

    it('returns null for a non-200 response', async () => {
        const vpn = vpnWithSession(async (msg) => { msg.status = 404; return bytesOf('{}'); });
        expect(await vpn._httpGet('https://api.nordvpn.com/x')).toBeNull();
    });

    it('rejects when the request fails, so callers keep their own handling', async () => {
        const vpn = vpnWithSession(async () => { throw new Error('network down'); });
        await expect(vpn._httpGet('https://api.nordvpn.com/x')).rejects.toThrow('network down');
    });

    it('rejects as cancelled once the Vpn is destroyed', async () => {
        const vpn = vpnWithSession(async () => { throw new GLib.Error(0, Gio.IOErrorEnum.CANCELLED, 'Operation was cancelled'); });
        vpn.destroy();
        await expect(vpn._httpGet('https://api.nordvpn.com/x')).rejects.toMatchObject({code: Gio.IOErrorEnum.CANCELLED});
    });
});
