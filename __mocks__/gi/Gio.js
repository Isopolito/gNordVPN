import GLib from 'gi://GLib';

// Minimal stub for gi://Gio. Tests that need behaviour install a controllable fake on this object.
class Cancellable {
    constructor() {
        this._cancelled = false;
        this._handlers = new Map();
        this._nextId = 1;
    }

    is_cancelled() { return this._cancelled; }

    cancel() {
        if (this._cancelled) return;
        this._cancelled = true;
        [...this._handlers.values()].forEach(cb => cb());
    }

    connect(cb) {
        const id = this._nextId++;
        this._handlers.set(id, cb);
        if (this._cancelled) cb();
        return id;
    }

    disconnect(id) { this._handlers.delete(id); }

    set_error_if_cancelled() {
        if (this._cancelled) throw new GLib.Error(0, IOErrorEnum.CANCELLED, 'Operation was cancelled');
    }
}

const IOErrorEnum = {CANCELLED: 19, FAILED: 0};

export default {Cancellable, IOErrorEnum};
