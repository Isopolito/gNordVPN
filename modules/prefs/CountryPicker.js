import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

const LOADING = 'Loading countries…';
const FAILED = 'Couldn’t load countries — is nordvpnd running?';

// A searchable checklist of countries. The selection is written to `settingKey` as a GVariant of
// `variantType`, holding `selectionValue(countryName)` for each checked row. Countries whose
// `selectionValue` is undefined get no row.
export default class CountryPicker {
    constructor({settings, title, settingKey, variantType, selectionValue}) {
        this._settings = settings;
        this._settingKey = settingKey;
        this._variantType = variantType;
        this._selectionValue = selectionValue;
        this._rows = [];
        this._updating = false;

        this._search = new Gtk.SearchEntry();
        this._search.connect('search-changed', () => this._filter());

        this.group = new Adw.PreferencesGroup({title, header_suffix: this._search});
        this._status = null;
        this._showStatus(LOADING);
    }

    populate(countryNames) {
        this._clear();
        const saved = this._saved();
        const shown = countryNames.filter(name => this._selectionValue(name) !== undefined);
        if (!shown.length) {
            this._showStatus(FAILED);
            return;
        }

        const isSaved = name => saved.includes(this._selectionValue(name));
        const byName = (a, b) => a.localeCompare(b);
        const ordered = [...shown.filter(isSaved).sort(byName), ...shown.filter(n => !isSaved(n)).sort(byName)];

        this._updating = true;
        for (const name of ordered) {
            const check = new Gtk.CheckButton({active: isSaved(name), valign: Gtk.Align.CENTER});
            check.connect('toggled', () => this._onToggled());
            const row = new Adw.ActionRow({title: name, use_markup: false, activatable_widget: check});
            row.add_suffix(check);
            this.group.add(row);
            this._rows.push({name, check, row});
        }
        this._updating = false;
        this._filter();
        this._updateCount();
    }

    refresh() {
        const saved = this._saved();
        this._updating = true;
        for (const {name, check} of this._rows) check.active = saved.includes(this._selectionValue(name));
        this._updating = false;
        this._updateCount();
    }

    _clear() {
        this._rows.forEach(({row}) => this.group.remove(row));
        this._rows = [];
        if (this._status) this.group.remove(this._status);
        this._status = null;
    }

    _showStatus(title) {
        this._status = new Adw.ActionRow({title});
        this.group.add(this._status);
    }

    _saved() {
        return this._settings.get_value(this._settingKey).deep_unpack();
    }

    _filter() {
        const query = this._search.get_text().toLowerCase();
        this._rows.forEach(({name, row}) => { row.visible = name.toLowerCase().includes(query); });
    }

    _updateCount() {
        this.group.description = `${this._rows.filter(({check}) => check.active).length} selected`;
    }

    _onToggled() {
        if (this._updating) return;
        this._updateCount();
        const shown = this._rows.map(({name}) => this._selectionValue(name));
        const kept = this._saved().filter(value => !shown.includes(value));
        const checked = this._rows.filter(({check}) => check.active).map(({name}) => this._selectionValue(name));
        this._settings.set_value(this._settingKey, new GLib.Variant(this._variantType, [...kept, ...checked]));
    }
}
