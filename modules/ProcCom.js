import Gio from 'gi://Gio';

import Logger from './Logger.js';

function _cmdName(command) {
    return command.trim().split(/\s+/)[0].split('/').pop();
}

export default class ProcCom {
    constructor() {
        this._log = new Logger('ProcCom');
        Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');
    }

    // Only read-only commands pass a cancellable. Cancelling it rejects the call and kills the process.
    async execCommunicateAsync(command, cancellable = null) {
        let argv = command.split(/\s+/);
        const t = this._log.startTimer();
        const cmd = _cmdName(command);
        if (cancellable) cancellable.set_error_if_cancelled();
        const proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        const cancelledId = cancellable?.connect(() => proc.force_exit());
        const [stdout, stderr] = await proc.communicate_utf8_async(null, cancellable)
            .finally(() => cancellable?.disconnect(cancelledId));
        const success = proc.get_successful();
        this._log.endTimer(t, 'CALL', {cmd, blocking: false, success});
        if (!success) throw new Error(stderr);
        return stdout;
    }
}
