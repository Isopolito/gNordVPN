import {jest} from '@jest/globals';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

globalThis.log = () => {};
globalThis.logError = () => {};
GLib.get_monotonic_time = () => 0;
Gio._promisify = () => {};
Gio.Subprocess = {prototype: {}};
Gio.SubprocessFlags = {STDOUT_PIPE: 1, STDERR_PIPE: 2};

const {default: ProcCom} = await import('../../modules/ProcCom.js');

// A fake process whose communicate promise the test settles by hand.
function installProcess({successful = true, stdout = 'out', stderr = ''} = {}) {
    const proc = {
        force_exit: jest.fn(),
        get_successful: () => successful,
        settle: null,
        fail: null,
        communicate_utf8_async: jest.fn(() => new Promise((resolve, reject) => {
            proc.settle = () => resolve([stdout, stderr]);
            proc.fail = reject;
        })),
    };
    Gio.Subprocess.new = jest.fn(() => proc);
    return proc;
}

describe('ProcCom.execCommunicateAsync', () => {
    it('resolves with stdout and passes no cancellable by default', async () => {
        const proc = installProcess();
        const pending = new ProcCom().execCommunicateAsync('nordvpn status');
        proc.settle();
        expect(await pending).toBe('out');
        expect(Gio.Subprocess.new.mock.calls[0][0]).toEqual(['nordvpn', 'status']);
        expect(proc.communicate_utf8_async).toHaveBeenCalledWith(null, null);
    });

    it('rejects with stderr when the command exits non-zero', async () => {
        const proc = installProcess({successful: false, stderr: 'not logged in'});
        const pending = new ProcCom().execCommunicateAsync('nordvpn account');
        proc.settle();
        await expect(pending).rejects.toThrow('not logged in');
    });

    it('does not spawn when the cancellable is already cancelled', async () => {
        installProcess();
        const cancellable = new Gio.Cancellable();
        cancellable.cancel();
        await expect(new ProcCom().execCommunicateAsync('nordvpn status', cancellable))
            .rejects.toMatchObject({code: Gio.IOErrorEnum.CANCELLED});
        expect(Gio.Subprocess.new).not.toHaveBeenCalled();
    });

    it('kills the process when the cancellable is cancelled mid-call', async () => {
        const proc = installProcess();
        const cancellable = new Gio.Cancellable();
        const pending = new ProcCom().execCommunicateAsync('nordvpn status', cancellable);
        cancellable.cancel();
        expect(proc.force_exit).toHaveBeenCalledTimes(1);
        proc.fail(new GLib.Error(0, Gio.IOErrorEnum.CANCELLED, 'Operation was cancelled'));
        await expect(pending).rejects.toMatchObject({code: Gio.IOErrorEnum.CANCELLED});
    });

    it('stops listening to the cancellable once the command finished', async () => {
        const proc = installProcess();
        const cancellable = new Gio.Cancellable();
        const pending = new ProcCom().execCommunicateAsync('nordvpn status', cancellable);
        proc.settle();
        await pending;
        cancellable.cancel();
        expect(proc.force_exit).not.toHaveBeenCalled();
    });
});
