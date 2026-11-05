import GLib from 'gi://GLib';

import {isCancelled} from './common.js';

// Debug and timing lines are off unless the debug-logging setting is on. Warnings and errors always log.
let debugEnabled = false;

export function setDebugLogging(enabled) {
    debugEnabled = enabled;
}

export default class Logger {
    constructor(component) {
        this._component = component;
    }

    _format(level, msg, fields = {}) {
        const suffix = Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : '';
        return `[gNordVpn][${level}][${this._component}] ${msg}${suffix}`;
    }

    debug(msg, fields = {}) {
        if (!debugEnabled) return;
        log(this._format('DBG', msg, fields));
    }

    warn(msg, fields = {}) {
        log(this._format('WRN', msg, fields));
    }

    error(msg, e = null, fields = {}) {
        // A cancelled call is the normal result of teardown, not an error.
        if (isCancelled(e)) {
            this.debug(`${msg}: cancelled`);
            return;
        }
        const payload = {
            ...fields,
            ...(e?.message ? {error: e.message} : {}),
        };
        logError(e ?? new Error(msg), this._format('ERR', msg, payload));
    }

    startTimer() {
        return GLib.get_monotonic_time();
    }

    // tag must be 'CALL' or 'SPAN'. CALL = one actual subprocess/HTTP call. SPAN = logical operation.
    endTimer(start, tag, fields = {}) {
        const ms = Math.round((GLib.get_monotonic_time() - start) / 1000);
        if (!debugEnabled) return ms;
        const level = tag === 'CALL' ? 'CALL' : 'SPAN';
        log(this._format(level, `${fields.operation ?? fields.cmd ?? '?'} ${ms}ms`, {
            ...fields,
            durationMs: ms,
        }));
        return ms;
    }
}
