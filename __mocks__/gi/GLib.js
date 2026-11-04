// Minimal stub for gi://GLib. Tests that need behaviour install a controllable fake on this object.
class GError {
    constructor(domain, code, message) {
        this.domain = domain;
        this.code = code;
        this.message = message;
    }

    matches(domain, code) { return this.code === code; }
}

export default {Error: GError};
