import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';

import Vpn from '../Vpn.js';
import StylesManager from './StylesManager.js';
import ResetManager from './ResetManager.js';
import CountryPicker from './CountryPicker.js';
import * as Common from '../common.js';
import Logger from '../Logger.js';

const PANEL_POSITIONS = [['left', 'Left'], ['center', 'Center'], ['right', 'Right']];
const TECHNOLOGIES = [['OPENVPN', 'OpenVpn'], ['NORDLYNX', 'NordLynx']];
const PROTOCOLS = [['UDP', 'UDP'], ['TCP', 'TCP']];

export default class GnordVpnPrefs {
    constructor(settings, metadata = {}) {
        this._settings = settings;
        this._metadata = metadata;
        this._vpn = new Vpn(this._settings);
        this._log = new Logger('GnordVpnPrefs');
        this._techRow = null;
        this._protoRow = null;
        this._obfuscateRow = null;
        this._countryMapWithID = null;
        this._countryMap = null;
    }

    _createVersionRow() {
        const name = this._metadata.name ?? 'gNordVpn-Local';
        const version = this._metadata.version ?? 'unknown';
        const url = this._metadata.url ?? '';

        const row = new Adw.ActionRow({title: GLib.markup_escape_text(`${name}, v${version}`, -1)});
        if (url) {
            const escapedUrl = GLib.markup_escape_text(url, -1);
            row.subtitle = `<a href="${escapedUrl}">${escapedUrl}</a>`;
        }
        return row;
    }

    // A switch row bound to the boolean setting `key`.
    _createSwitchRow(title, key, subtitle = '') {
        const row = new Adw.SwitchRow({title, subtitle});
        this._settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    // A combo row over `items` ([[settingValue, label], ...]) that writes `key` when the selection changes.
    _createChoiceRow(title, items, key, onChange = () => {}) {
        const row = new Adw.ComboRow({
            title,
            model: new Gtk.StringList({strings: items.map(([, label]) => label)}),
        });
        row.selected = this._choiceIndex(items, this._settings.get_string(key));
        row.connect('notify::selected', () => {
            const value = items[row.selected]?.[0];
            if (value === undefined) return;
            this._settings.set_string(key, value);
            onChange(value);
        });
        return row;
    }

    _choiceIndex(items, value) {
        return Math.max(0, items.findIndex(([v]) => v === value));
    }

    _createButtonGroup(buttons) {
        const box = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 12, halign: Gtk.Align.CENTER});
        buttons.forEach(button => box.append(button));
        const group = new Adw.PreferencesGroup();
        group.add(box);
        return group;
    }

    _createGeneralPage(page) {
        const versionGroup = new Adw.PreferencesGroup();
        versionGroup.add(this._createVersionRow());
        page.add(versionGroup);

        const group = new Adw.PreferencesGroup();
        group.add(this._createChoiceRow('Panel position', PANEL_POSITIONS, 'panel-position'));
        group.add(this._createSwitchRow('Show a Favorites submenu', 'commonfavorite'));
        group.add(this._createSwitchRow('Show a Groups submenu', 'showgroups'));

        const refreshRow = new Adw.SpinRow({
            title: 'Seconds between NordVPN status calls',
            adjustment: new Gtk.Adjustment({lower: 1, upper: 120, step_increment: 1, page_increment: 10, value: 1}),
        });
        this._settings.bind('refresh-timeout', refreshRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(refreshRow);

        group.add(this._createSwitchRow('Write debug messages to the log', 'debug-logging'));
        page.add(group);

        const resetAll = new Gtk.Button({label: 'Reset All Settings'});
        resetAll.add_css_class('destructive-action');
        page.add(this._createButtonGroup([resetAll]));
        return {resetAll};
    }

    _createAccountsPage(page) {
        const settingsGroup = new Adw.PreferencesGroup();
        settingsGroup.add(this._createSwitchRow('Show login button in menu', 'showlogin'));
        settingsGroup.add(this._createSwitchRow('Show logout button in menu', 'showlogout'));
        page.add(settingsGroup);

        const accountGroup = new Adw.PreferencesGroup({title: 'Account'});
        const accountEmail = new Adw.ActionRow({title: 'Email'});
        const accountStatus = new Adw.ActionRow({title: 'Status'});
        accountGroup.add(accountEmail);
        accountGroup.add(accountStatus);
        page.add(accountGroup);

        const loginButton = new Gtk.Button({label: 'Login'});
        loginButton.connect('clicked', () => this._vpn.loginVpn().catch(e => this._log.error('loginVpn failed', e)));
        loginButton.set_sensitive(false);

        const logoutButton = new Gtk.Button({label: 'Logout'});
        logoutButton.connect('clicked', () => this._vpn.logoutVpn().catch(e => this._log.error('logoutVpn failed', e)));
        logoutButton.set_sensitive(false);

        const refreshAccountButton = new Gtk.Button({label: 'Refresh'});
        const refreshAccount = async () => {
            const account = await this._vpn.getAccount();
            const loggedIn = !!account.emailAddress;
            accountEmail.subtitle = GLib.markup_escape_text(account.emailAddress || '', -1);
            accountStatus.subtitle = GLib.markup_escape_text(account.vpnService || '', -1);
            loginButton.set_sensitive(!loggedIn);
            logoutButton.set_sensitive(loggedIn);
        };
        refreshAccountButton.connect('clicked', () => refreshAccount().catch(e => this._log.error('getAccount failed', e)));
        page.add(this._createButtonGroup([loginButton, logoutButton, refreshAccountButton]));

        refreshAccount().catch(e => this._log.error('getAccount failed', e));
    }

    _createConnectionsPage(page) {
        const group = new Adw.PreferencesGroup({description: 'Changes are sent to NordVPN when you press Apply.'});

        const onTechChange = (technology) => {
            const isOpenVpn = technology === 'OPENVPN';
            this._obfuscateRow.sensitive = isOpenVpn;
            this._protoRow.sensitive = isOpenVpn;
        };

        this._techRow = this._createChoiceRow('Technology', TECHNOLOGIES, 'technology', onTechChange);
        this._protoRow = this._createChoiceRow('Protocol', PROTOCOLS, 'protocol');
        this._obfuscateRow = this._createSwitchRow('Obfuscate', 'obfuscate');

        group.add(this._techRow);
        group.add(this._createSwitchRow('Autoconnect to VPN on startup', 'autoconnect'));
        group.add(this._createSwitchRow('CyberSec', 'cybersec'));
        group.add(this._createSwitchRow('Firewall', 'firewall'));
        group.add(this._createSwitchRow('Killswitch', 'killswitch'));
        group.add(this._obfuscateRow);
        group.add(this._createSwitchRow('Analytics', 'analytics', 'Send anonymous usage data to NordVPN'));
        group.add(this._createSwitchRow('IPv6', 'ipv6'));
        group.add(this._protoRow);
        page.add(group);

        onTechChange(this._settings.get_string('technology'));

        const apply = new Gtk.Button({label: 'Apply'});
        apply.add_css_class('suggested-action');
        apply.connect('clicked', () => {
            apply.set_sensitive(false);
            this._vpn.applySettingsToNord()
                .catch(e => this._log.error('applySettingsToNord failed', e))
                .finally(() => apply.set_sensitive(true));
        });
        const resetConnection = new Gtk.Button({label: 'Reset Connection Settings'});
        page.add(this._createButtonGroup([apply, resetConnection]));
        return {resetConnection};
    }

    _createCountryPage(title, iconName, maxTitle, maxKey, picker) {
        const page = new Adw.PreferencesPage();
        page.set_title(title);
        page.set_icon_name(iconName);

        const maxRow = new Adw.SpinRow({
            title: maxTitle,
            adjustment: new Gtk.Adjustment({lower: 0, upper: 10000, step_increment: 1, page_increment: 10, value: 0}),
        });
        this._settings.bind(maxKey, maxRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        const settingsGroup = new Adw.PreferencesGroup();
        settingsGroup.add(maxRow);
        page.add(settingsGroup);
        page.add(picker.group);
        return page;
    }

    _setWindowSize(window) {
        const [pmWidth, pmHeight] = this._getPrimaryMonitorInfo();
        const width = pmWidth * .8;
        const height = pmHeight * .6;

        window.set_default_size(width > 900 ? 900 : width, height > 700 ?  700 : height);
    }

    _getPrimaryMonitorInfo() {
        const display = Gdk.Display.get_default();
        const pm = display.get_monitors().get_item(0);
        if (!pm) return [700, 500, 1];

        const geo = pm.get_geometry();
        const scale = pm.get_scale_factor();

        return [geo.width, geo.height, scale];
    }

    fillPreferencesWindow(window) {
        // Closing the window cancels the pending reads below. Apply, login and logout still run to completion.
        window.connect('destroy', () => this._vpn.destroy());

        // The rows read their keys at construction, so refresh them once the async sync resolves.
        this._vpn.setSettingsFromNord().then(() => {
            if (this._techRow) this._techRow.selected = this._choiceIndex(TECHNOLOGIES, this._settings.get_string('technology'));
            if (this._protoRow) this._protoRow.selected = this._choiceIndex(PROTOCOLS, this._settings.get_string('protocol'));
        }).catch(e => this._log.error('setSettingsFromNord failed', e));

        const generalPage = new Adw.PreferencesPage();
        generalPage.set_title("General");
        generalPage.set_icon_name("emblem-system-symbolic");
        const {resetAll} = this._createGeneralPage(generalPage);
        window.add(generalPage);

        const accountsPage = new Adw.PreferencesPage();
        accountsPage.set_title("Account");
        accountsPage.set_icon_name("user-home-symbolic");
        this._createAccountsPage(accountsPage);
        window.add(accountsPage);

        const stylesPage = new Adw.PreferencesPage();
        stylesPage.set_title("Styles");
        stylesPage.set_icon_name("edit-select-all-symbolic");
        new StylesManager(this._settings).fillStylesPage(stylesPage);
        window.add(stylesPage);

        const connectionsPage = new Adw.PreferencesPage();
        connectionsPage.set_title("Connection");
        connectionsPage.set_icon_name("network-server-symbolic");
        const {resetConnection} = this._createConnectionsPage(connectionsPage);
        window.add(connectionsPage);

        this._countryMap = {};
        this._countryMapWithID = {};

        this._cityPicker = new CountryPicker({
            settings: this._settings,
            title: 'Countries',
            settingKey: 'countries-selected-for-cities',
            variantType: 'as',
            selectionValue: (country) => this._countryMap[country],
        });
        window.add(this._createCountryPage('Cities', 'document-open-symbolic',
            'Max cities per country', 'number-cities-per-countries', this._cityPicker));

        this._serverPicker = new CountryPicker({
            settings: this._settings,
            title: 'Countries',
            settingKey: 'countries-selected-for-servers',
            variantType: 'ai',
            selectionValue: (country) => this._countryMapWithID[country],
        });
        window.add(this._createCountryPage('Servers', 'network-workgroup-symbolic',
            'Max servers per country', 'number-servers-per-countries', this._serverPicker));

        // A failed lookup leaves that map empty; a cancelled one (window closed) stops the whole population.
        const mapOrNull = (promise, what) => promise.catch(e => {
            if (Common.isCancelled(e)) throw e;
            this._log.error(`prefs ${what} load failed`, e);
            return null;
        });
        Promise.all([
            mapOrNull(this._vpn.getCountries(false, true), 'country'),
            mapOrNull(this._vpn.getCountries(true, true), 'country ID'),
        ]).then(([countryMap, countryMapWithID]) => {
            this._countryMap = countryMap || {};
            this._countryMapWithID = countryMapWithID || {};
            const countryNames = Common.safeObjectKeys(this._countryMap);

            this._cityPicker.populate(countryNames);
            this._serverPicker.populate(countryNames);
        }).catch(e => this._log.error('prefs country population failed', e));

        const resetManager = new ResetManager();
        resetAll.connect('clicked', () => {
            resetManager.resetAllSettings(this._settings, this._protoRow, this._techRow, this._cityPicker, this._serverPicker);
        });

        resetConnection.connect('clicked', () => {
            resetManager.resetConnectionSettings(this._settings, this._protoRow, this._techRow);
        });

        this._setWindowSize(window);
        return window;
    }
}
