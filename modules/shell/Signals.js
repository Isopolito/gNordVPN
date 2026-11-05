export default class Signals {
    constructor() {
        this._ids = {};
    }

    register(id, callback) {
        if (this._ids[id]) this._ids[id]();

        this._ids[id] = callback;
    }

    // Connects `signal` on `widget` and registers the matching disconnect. Returns the handler id.
    connect(widget, signal, callback) {
        const id = widget.connect(signal, callback);
        this.register(id, () => widget.disconnect(id));
        return id;
    }

    disconnect(ids) {
        for (const id of Array.isArray(ids) ? ids : [ids]) {
            const callback = this._ids[id];
            if (!callback) continue;
            delete this._ids[id];
            callback();
        }
    }

    disconnectAll() {
        for (const callback of Object.values(this._ids)) {
            callback();
        }

        this._ids = {};
    }
}
