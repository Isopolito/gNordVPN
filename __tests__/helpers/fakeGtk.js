import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {installGLibVariant, installGioBindFlags} from './FakeSettings.js';

// Not a spec: recording stand-ins for the Gtk/Adw widgets the prefs UI builds. Importing this
// module installs them onto the jest gi:// stubs (see __mocks__/gi), so the real
// modules/prefs/*.js can run unmodified.
//
// Widgets are Proxies: assigning any property emits `notify::<prop>` (as GObject does), which is
// what FakeSettings.bind listens to. Unknown snake_case setters/getters (set_hexpand, ...) are
// recorded no-ops, so UI code that only styles widgets doesn't need a stub per method.

export const registry = [];
export const resetRegistry = () => { registry.length = 0; };
export const findAll = (Class) => registry.filter(w => w instanceof Class);

const NOOP_METHOD = /^(set_|get_|add_|remove_|pack_|insert_|attach|append|prepend|show|hide|present)/;
let nextHandlerId = 1;

class Widget {
    constructor(props = {}) {
        Object.assign(this, props);
        Object.defineProperty(this, '_handlers', {value: [], enumerable: false});
        Object.defineProperty(this, 'calls', {value: [], enumerable: false});
        Object.defineProperty(this, 'children', {value: [], enumerable: false});
        if (this.sensitive === undefined) this.sensitive = true;
        const proxy = new Proxy(this, {
            set(target, prop, value, receiver) {
                const old = target[prop];
                Reflect.set(target, prop, value, receiver);
                if (typeof prop === 'string' && !prop.startsWith('_') && old !== value) {
                    proxy.emit(`notify::${prop}`);
                }
                return true;
            },
            get(target, prop, receiver) {
                if (prop in target || typeof prop !== 'string' || !NOOP_METHOD.test(prop)) {
                    return Reflect.get(target, prop, receiver);
                }
                return (...args) => { target.calls.push([prop, ...args]); };
            },
        });
        registry.push(proxy);
        return proxy;
    }

    connect(signal, cb) {
        const id = nextHandlerId++;
        this._handlers.push({id, signal, cb});
        return id;
    }
    disconnect(id) {
        const i = this._handlers.findIndex(h => h.id === id);
        if (i >= 0) this._handlers.splice(i, 1);
    }
    emit(signal, ...args) {
        let result;
        for (const h of [...this._handlers]) if (h.signal === signal) result = h.cb(this, ...args);
        return result;
    }
    set_sensitive(v) { this.sensitive = v; }
    get_sensitive() { return this.sensitive; }
    show() { this.visible = true; }
    set_child(c) { this.child = c; }
    append(c) { this.children.push(c); }
    add(c) { this.children.push(c); }
    add_row(c) { this.children.push(c); }
    remove(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); }
    add_suffix(c) { this.children.push(c); }
    add_css_class(name) { (this.cssClasses ??= []).push(name); }
}

class Label extends Widget {
    set_text(t) { this.label = t; this.text = t; }
}

class Button extends Widget {
    // Like GTK, a click on an insensitive button does nothing.
    click() { if (this.sensitive) this.emit('clicked'); }
}

class Adjustment extends Widget {}

class CheckButton extends Widget {
    // A user toggle: property change plus the toggled signal, like Gtk.CheckButton.
    userSet(v) { this.active = v; this.emit('toggled'); }
}

// Like Gtk.SearchEntry: typing sets the text and emits search-changed.
class SearchEntry extends Widget {
    get_text() { return this.text ?? ''; }
    type(text) { this.text = text; this.emit('search-changed'); }
}

// ---- Adwaita rows and color widgets ----

class StringList extends Widget {
    constructor(props) { super(props); this.strings = props?.strings ?? []; }
}

class ComboRow extends Widget {
    constructor(props) { super(props); if (this.selected === undefined) this.selected = 0; }
}

class SwitchRow extends Widget {
    constructor(props) { super(props); if (this.active === undefined) this.active = false; }
}

class SpinRow extends Widget {
    constructor(props) { super(props); if (this.value === undefined) this.value = this.adjustment?.value ?? 0; }
}

// Like Gtk.Editable: set_text emits 'changed' only when the text differs.
class EntryRow extends Widget {
    constructor(props) { super(props); this._text = ''; this._pos = 0; }
    get_text() { return this._text; }
    set_text(t) {
        if (this._text === t) return;
        this._text = t;
        this.emit('changed');
    }
    get_position() { return this._pos; }
    set_position(p) { this._pos = p; }
}

class ExpanderRow extends Widget {}

// Gdk.RGBA: parse() understands rgb()/rgba() and a few names; to_string() matches GTK's format.
class RGBA {
    constructor() { this.red = 0; this.green = 0; this.blue = 0; this.alpha = 1; }
    parse(str) {
        const named = {white: [255, 255, 255, 1], black: [0, 0, 0, 1], red: [255, 0, 0, 1]};
        const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(String(str).trim());
        const v = m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : named[String(str).trim()];
        if (!v) return false;
        [this.red, this.green, this.blue] = [v[0] / 255, v[1] / 255, v[2] / 255];
        this.alpha = v[3];
        return true;
    }
    to_string() {
        const [r, g, b] = [this.red, this.green, this.blue].map(c => Math.round(c * 255));
        return this.alpha === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${+this.alpha.toFixed(2)})`;
    }
}

class ColorDialogButton extends Widget {
    constructor(props) { super(props); if (!this.rgba) this.rgba = new RGBA(); }
}

class CssProvider extends Widget {
    load_from_string(css) { this.css = css; }
}

// Gtk.StyleContext static provider registry, per display.
const providers = [];
const StyleContext = {
    add_provider_for_display: (display, provider, priority) => { providers.push({display, provider, priority}); },
    remove_provider_for_display: (display, provider) => {
        const i = providers.findIndex(p => p.display === display && p.provider === provider);
        if (i >= 0) providers.splice(i, 1);
    },
};
export const installedProviders = () => providers.map(p => p.provider);

class TextBuffer extends Widget {
    constructor(props) { super(props); if (this.text === undefined) this.text = ''; }
    set_text(t) {
        if (this.text === t) return;
        this.text = t;
        this.emit('changed');
    }
}

class TextView extends Widget {
    get_buffer() {
        if (!this._buffer) Object.defineProperty(this, '_buffer', {value: new TextBuffer(), enumerable: false});
        return this._buffer;
    }
}

class Window extends Widget {
    set_default_size() {}
}

const simple = (name) => ({[name]: class extends Widget {}})[name];

export const fakes = {CssProvider, TextView, StringList, ComboRow, SwitchRow, SpinRow, EntryRow, ExpanderRow, ColorDialogButton, RGBA, Label, Button, Adjustment, CheckButton, SearchEntry, Window};

Object.assign(Gtk, {
    Box: simple('Box'), Image: simple('Image'), ScrolledWindow: simple('ScrolledWindow'),
    ColorDialog: simple('ColorDialog'), Popover: class Popover extends Widget { popdown() { this.popped = false; } }, MenuButton: simple('MenuButton'),
    StringList, ColorDialogButton, CssProvider, StyleContext, TextView,
    STYLE_PROVIDER_PRIORITY_APPLICATION: 600,
    WrapMode: {WORD_CHAR: 3},
    Label, Button, Adjustment,
    CheckButton, SearchEntry,
    Orientation: {VERTICAL: 1, HORIZONTAL: 0},
    Align: {START: 1, END: 2, CENTER: 3},
    PolicyType: {NEVER: 2, AUTOMATIC: 1},
});
Object.assign(Adw, {
    PreferencesPage: simple('PreferencesPage'), PreferencesGroup: simple('PreferencesGroup'),
    ComboRow, SwitchRow, SpinRow, EntryRow, ExpanderRow, ActionRow: simple('ActionRow'), PreferencesRow: simple('PreferencesRow'),
});
Gdk.RGBA = RGBA;
Gdk.Display = {get_default: () => ({get_monitors: () => ({get_item: () => null})})};
GLib.markup_escape_text = (s) => s;
installGLibVariant(GLib);
installGioBindFlags(Gio);

export const createWindow = () => new Window();
