import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';

import Vpn from '../Vpn.js';
import StylesManager from './StylesManager.js';
import ResetManager from './ResetManager.js';
import * as Common from '../common.js';
import Logger from '../Logger.js';

export default class GnordVpnPrefs {
    constructor(settings, metadata = {}) {
        this._settings = settings;
        this._metadata = metadata;
        this._vpn = new Vpn(this._settings);
        this._log = new Logger('GnordVpnPrefs');
        this._techCbox = null;
        this._protoCbox = null;
        this._countryMapWithID = null;
        this._countryNames = null;
        this._countryMap = null;
    }

    _createVersionRow() {
        const name = this._metadata.name ?? 'gNordVpn-Local';
        const version = this._metadata.version ?? 'unknown';
        const url = this._metadata.url ?? '';

        const frame = new Gtk.Frame({
            margin_top: 10,
            margin_bottom: 10,
            margin_start: 10,
            margin_end: 10,
        });

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 10,
            margin_bottom: 10,
            margin_start: 12,
            margin_end: 12,
        });

        const title = new Gtk.Label({
            label: `${name}, v${version}`,
            halign: Gtk.Align.START,
            xalign: 0,
        });
        box.append(title);

        if (url) {
            const escapedUrl = GLib.markup_escape_text(url, -1);
            const link = new Gtk.Label({
                use_markup: true,
                selectable: false,
                wrap: true,
                halign: Gtk.Align.START,
                xalign: 0,
                label: `<a href="${escapedUrl}">${escapedUrl}</a>`,
            });
            box.append(link);
        }

        frame.set_child(box);
        return frame;
    }

    _createGeneralPage() {
        const generalGrid = new Gtk.Grid({
            column_spacing: 12, row_spacing: 12, margin_top: 10, margin_bottom: 10, margin_start: 10, margin_end: 10
        });

        const panelPositionLabel = new Gtk.Label({label: "Select Panel Position:", halign: Gtk.Align.START});
        generalGrid.attach(panelPositionLabel, 0, 0, 1, 1);

        const panelPositionCombo = new Gtk.ComboBoxText();
        panelPositionCombo.append("left", "Left");
        panelPositionCombo.append("center", "Center");
        panelPositionCombo.append("right", "Right");
        generalGrid.attach(panelPositionCombo, 1, 0, 1, 1);

        const initialPosition = this._settings.get_string('panel-position');
        panelPositionCombo.set_active_id(initialPosition);

        panelPositionCombo.connect('changed', () => {
            const newPosition = panelPositionCombo.get_active_id();
            this._settings.set_string('panel-position', newPosition);
        });

        const commonFavLabel = new Gtk.Label({label: "Display a common favorite tab:", halign: Gtk.Align.START});
        const commonFavToggle = new Gtk.Switch({
            active: this._settings.get_boolean(`commonfavorite`),
            halign: Gtk.Align.START,
            visible: true
        });
        this._settings.bind(`commonfavorite`, commonFavToggle, `active`, Gio.SettingsBindFlags.DEFAULT);

        commonFavToggle.set_hexpand(false);  // Don't expand horizontally
        generalGrid.attach(commonFavLabel, 0, 2, 1, 1);
        generalGrid.attach(commonFavToggle, 1, 2, 1, 1);

        const timerRefreshLabel = new Gtk.Label({
            label: "Seconds between NordVpn status calls (will take affect on restart)",
            halign: Gtk.Align.START
        });

        const timeRefreshSpinner = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 120,
                step_increment: 1,
                page_increment: 10,
                value: this._settings.get_int('refresh-timeout')
            }),
            numeric: true,
            halign: Gtk.Align.START,
            visible: true
        });
        timeRefreshSpinner.set_hexpand(false);

        generalGrid.attach(timerRefreshLabel, 0, 3, 1, 1);
        generalGrid.attach(timeRefreshSpinner, 1, 3, 1, 1);

        this._settings.bind(
            'refresh-timeout',
            timeRefreshSpinner.get_adjustment(),
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        this._addToggleRow(generalGrid, 4, "Write debug messages to the log:", 'debug-logging');

        const resetAll = new Gtk.Button({label: "Reset All Settings"});
        generalGrid.attach(resetAll, 0, 5, 2, 1);

        return {generalGrid, resetAll};
    }

    _createAccountsPage() {
        const accountsGrid = new Gtk.Grid({
            column_spacing: 12, row_spacing: 12, margin_top: 10, margin_bottom: 10, margin_start: 10, margin_end: 10
        });

        const showLoginLabel = new Gtk.Label({label: "Show login button in menu:", halign: Gtk.Align.START});
        const showLoginToggle = new Gtk.Switch({
            active: this._settings.get_boolean('showlogin'),
            halign: Gtk.Align.START
        });
        this._settings.bind('showlogin', showLoginToggle, 'active', Gio.SettingsBindFlags.DEFAULT);
        accountsGrid.attach(showLoginLabel, 0, 0, 1, 1);
        accountsGrid.attach(showLoginToggle, 1, 0, 1, 1);

        const showLogoutLabel = new Gtk.Label({label: "Show logout button in menu:", halign: Gtk.Align.START});
        const showLogoutToggle = new Gtk.Switch({
            active: this._settings.get_boolean('showlogout'),
            halign: Gtk.Align.START
        });
        this._settings.bind('showlogout', showLogoutToggle, 'active', Gio.SettingsBindFlags.DEFAULT);
        accountsGrid.attach(showLogoutLabel, 0, 1, 1, 1);
        accountsGrid.attach(showLogoutToggle, 1, 1, 1, 1);

        const accountInfo = new Gtk.Label({
            label: "<b>Account Information</b>",
            use_markup: true,
            halign: Gtk.Align.START
        });
        accountsGrid.attach(accountInfo, 0, 2, 2, 1);

        const accountEmailLabel = new Gtk.Label({label: "Account email:", halign: Gtk.Align.START});
        const accountEmail = new Gtk.Label({halign: Gtk.Align.START});
        accountsGrid.attach(accountEmailLabel, 0, 3, 1, 1);
        accountsGrid.attach(accountEmail, 1, 3, 1, 1);

        const accountStatusLabel = new Gtk.Label({label: "Account status:", halign: Gtk.Align.START});
        const accountStatus = new Gtk.Label({halign: Gtk.Align.START});
        accountsGrid.attach(accountStatusLabel, 0, 4, 1, 1);
        accountsGrid.attach(accountStatus, 1, 4, 1, 1);

        const loginButton = new Gtk.Button({label: "Login"});
        loginButton.connect('clicked', () => this._vpn.loginVpn().catch(e => this._log.error('loginVpn failed', e)));
        loginButton.set_sensitive(false);
        accountsGrid.attach(loginButton, 0, 5, 1, 1);

        const logoutButton = new Gtk.Button({label: "Logout"});
        logoutButton.connect('clicked', () => this._vpn.logoutVpn().catch(e => this._log.error('logoutVpn failed', e)));
        logoutButton.set_sensitive(false);
        accountsGrid.attach(logoutButton, 1, 5, 1, 1);

        const refreshAccountButton = new Gtk.Button({label: "Refresh"});
        const refreshAccount = async () => {
            const account = await this._vpn.getAccount();
            const loggedIn = !!account.emailAddress;
            accountEmail.set_text(account.emailAddress || "");
            accountStatus.set_text(account.vpnService || "");
            loginButton.set_sensitive(!loggedIn);
            logoutButton.set_sensitive(loggedIn);
        };
        refreshAccountButton.connect('clicked', () => refreshAccount().catch(e => this._log.error('getAccount failed', e)));
        accountsGrid.attach(refreshAccountButton, 0, 6, 1, 1);

        refreshAccount().catch(e => this._log.error('getAccount failed', e));
        return accountsGrid;
    }

    // A "label: switch" row bound to the boolean setting `key`. Returns the switch.
    _addToggleRow(grid, row, labelText, key) {
        const label = new Gtk.Label({label: labelText, halign: Gtk.Align.START, visible: true});
        grid.attach(label, 0, row, 1, 1);

        const toggle = new Gtk.Switch({active: this._settings.get_boolean(key), halign: Gtk.Align.END, visible: true});
        grid.attach(toggle, 1, row, 1, 1);
        this._settings.bind(key, toggle, `active`, Gio.SettingsBindFlags.DEFAULT);
        return toggle;
    }

    _createConnectionsPage() {
        const connectionsGrid = new Gtk.Grid({
            margin_start: 18, margin_top: 10, column_spacing: 12, row_spacing: 12, visible: true
        });

        const techLabel = new Gtk.Label({
            label: `Select Technology:`,
            halign: Gtk.Align.START,
            visible: true
        });
        connectionsGrid.attach(techLabel, 0, 0, 1, 1);

        const techModel = new Gtk.ListStore();
        techModel.set_column_types([GObject.TYPE_STRING, GObject.TYPE_STRING]);
        this._techCbox = new Gtk.ComboBox({model: techModel});
        const techRenderer = new Gtk.CellRendererText();
        this._techCbox.pack_start(techRenderer, true);
        this._techCbox.add_attribute(techRenderer, 'text', 1);
        techModel.set(techModel.append(), [0, 1], ['OPENVPN', 'OpenVpn']);
        techModel.set(techModel.append(), [0, 1], ['NORDLYNX', 'NordLynx']);
        const tech = this._settings.get_string(`technology`);
        this._techCbox.set_active(tech === 'OPENVPN' ? 0 : 1);
        this._techCbox.connect('changed', (entry) => {
            const [success, iter] = this._techCbox.get_active_iter();
            if (!success) return;
            const selectedTech = techModel.get_value(iter, 0);
            this._settings.set_string(`technology`, selectedTech);
            onTechChange(selectedTech);
        });
        this._techCbox.show();
        connectionsGrid.attach(this._techCbox, 1, 0, 1, 1);

        const autoConnectLabel = new Gtk.Label({label: "Autoconnect to VPN on startup:", halign: Gtk.Align.START});
        const autoConnectToggle = new Gtk.Switch({
            active: this._settings.get_boolean(`autoconnect`),
            halign: Gtk.Align.END,
            visible: true
        });
        this._settings.bind(`autoconnect`, autoConnectToggle, `active`, Gio.SettingsBindFlags.DEFAULT);

        autoConnectToggle.connect('state-set', (widget, state) => this._settings.set_boolean('autoconnect', state));
        autoConnectToggle.set_hexpand(false);  // Don't expand horizontally
        connectionsGrid.attach(autoConnectLabel, 0, 1, 1, 1);
        connectionsGrid.attach(autoConnectToggle, 1, 1, 1, 1);

        const toggle = (row, label, key) => this._addToggleRow(connectionsGrid, row, label, key);
        toggle(2, `Enable CyberSec:`, `cybersec`);
        toggle(3, `Enable Firewall:`, `firewall`);
        toggle(4, `Enable Killswitch:`, `killswitch`);
        const obfuscateToggle = toggle(5, `Enable Obfuscate:`, `obfuscate`);
        toggle(6, `Enable Analyics (send anonymous usage to NordVpn):`, `analytics`);
        toggle(7, `Enable IPv6:`, `ipv6`);

        const protocolLabel = new Gtk.Label({
            label: `Select Protocol:`,
            halign: Gtk.Align.START,
            visible: true
        });
        connectionsGrid.attach(protocolLabel, 0, 8, 1, 1);

        const protoModel = new Gtk.ListStore();
        protoModel.set_column_types([GObject.TYPE_STRING, GObject.TYPE_STRING]);
        this._protoCbox = new Gtk.ComboBox({model: protoModel});
        const protoRenderer = new Gtk.CellRendererText();
        this._protoCbox.pack_start(protoRenderer, true);
        this._protoCbox.add_attribute(protoRenderer, 'text', 1);
        protoModel.set(protoModel.append(), [0, 1], ['UDP', 'UDP']);
        protoModel.set(protoModel.append(), [0, 1], ['TCP', 'TCP']);
        const protocol = this._settings.get_string(`protocol`);
        this._protoCbox.set_active(protocol === 'UDP' ? 0 : 1);
        this._protoCbox.connect('changed', (entry) => {
            const [success, iter] = this._protoCbox.get_active_iter();
            if (!success) return;
            const selectedProtocol = protoModel.get_value(iter, 0);
            this._settings.set_string(`protocol`, selectedProtocol);
        });
        this._protoCbox.show();
        connectionsGrid.attach(this._protoCbox, 1, 8, 1, 1);

        const resetConnection = new Gtk.Button({
            label: `Reset Connection Settings`,
            visible: true
        });
        connectionsGrid.attach(resetConnection, 0, 9, 1, 1);

        const onTechChange = (technology) => {
            const isOpenVpn = technology === 'OPENVPN';
            if (isOpenVpn) {
                obfuscateToggle.sensitive = true;
                this._protoCbox.sensitive = true;
            } else {
                obfuscateToggle.sensitive = false;
                this._protoCbox.sensitive = false;
            }
        };

        onTechChange(tech);
        return {connectionsGrid, resetConnection};
    }

    _createConnectionsSaveFooter() {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
            visible: true,
        });

        const button = new Gtk.Button({
            label: "Apply",
            visible: true,
        });

        button.get_style_context().add_class('suggested-action');

        button.set_size_request(80, -1);

        button.margin_top = 20;

        button.connect('clicked', () => {
            button.set_sensitive(false);
            this._vpn.applySettingsToNord()
                .catch(e => this._log.error('applySettingsToNord failed', e))
                .finally(() => button.set_sensitive(true));
        });

        box.append(button);  // Use append() in GTK 4

        return box;
    }

    // A "max per country" spinner and a multi-select list of country names. The selection is written to
    // `settingKey` as a GVariant of `variantType`, holding `selectionValue(countryName)` for each selected row.
    _createCountryTree({maxLabel, maxSettingKey, selectLabel, settingKey, variantType, selectionValue, rowHeight}) {
        const grid = new Gtk.Grid({
            margin_start: 18, margin_top: 10, column_spacing: 12, row_spacing: 12, visible: true
        });

        const maxLabelWidget = new Gtk.Label({label: maxLabel, halign: Gtk.Align.START, visible: true});
        grid.attach(maxLabelWidget, 0, 0, 1, 1);

        const maxInput = new Gtk.SpinButton();
        maxInput.set_sensitive(true);
        maxInput.set_range(0, 10000);
        maxInput.set_value(0);
        maxInput.set_increments(1, 2);
        grid.attach(maxInput, 1, 0, 1, 1);
        this._settings.bind(maxSettingKey, maxInput, `value`, Gio.SettingsBindFlags.DEFAULT);

        const selectLabelWidget = new Gtk.Label({
            label: selectLabel,
            use_markup: true,
            halign: Gtk.Align.START,
            visible: true
        });
        grid.attach(selectLabelWidget, 0, 1, 1, 1);

        const store = new Gtk.TreeStore();
        store.set_column_types([GObject.TYPE_STRING]);

        const renderer = new Gtk.CellRendererText();
        if (rowHeight) renderer.height = rowHeight;
        const column = new Gtk.TreeViewColumn({
            title: "Countries",
            expand: true,
            min_width: 200
        });
        column.pack_start(renderer, true);
        column.add_attribute(renderer, "text", 0);

        const treeView = new Gtk.TreeView({model: store});
        treeView.insert_column(column, 0);
        treeView.get_selection().set_mode(Gtk.SelectionMode.MULTIPLE);

        const tree = {grid, treeView, iterMap: {}, store, settingKey, selectionValue, populating: false};

        treeView.get_selection().connect('changed', () => {
            if (tree.populating) return;
            const [pathList] = treeView.get_selection().get_selected_rows();

            const selected = [];
            pathList.forEach(path => {
                const model = treeView.get_model();
                const [, iter] = model.get_iter(path);
                selected.push(selectionValue(model.get_value(iter, 0)));
            });

            this._settings.set_value(settingKey, new GLib.Variant(variantType, selected));
        });

        const scroll = new Gtk.ScrolledWindow();
        scroll.set_child(treeView);
        scroll.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC);
        scroll.set_min_content_height(400);
        grid.attach(scroll, 1, 1, 1, 1);

        return tree;
    }

    // Fills the tree with the country names and selects the rows saved in its setting, without writing the setting back.
    _populateCountryTree(tree) {
        const saved = this._settings.get_value(tree.settingKey).deep_unpack();
        tree.store.clear();
        tree.populating = true;
        this._countryNames.forEach(country => {
            const iter = tree.store.append(null);
            tree.store.set(iter, [0], [country]);
            tree.iterMap[country] = iter;
            if (saved.includes(tree.selectionValue(country)))
                tree.treeView.get_selection().select_iter(iter);
        });
        tree.populating = false;
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

        // Sync GSettings from NordVPN then refresh combo boxes — they use one-time reads
        // at construction so we must update them after the async fetch resolves.
        this._vpn.setSettingsFromNord().then(() => {
            if (this._techCbox) {
                const tech = this._settings.get_string('technology');
                this._techCbox.set_active(tech === 'OPENVPN' ? 0 : 1);
            }
            if (this._protoCbox) {
                const proto = this._settings.get_string('protocol');
                this._protoCbox.set_active(proto === 'UDP' ? 0 : 1);
            }
        }).catch(e => this._log.error('setSettingsFromNord failed', e));

        const generalPage = new Adw.PreferencesPage();
        generalPage.set_title("General");
        generalPage.set_icon_name("emblem-system-symbolic");
        const versionGroup = new Adw.PreferencesGroup();
        versionGroup.add(this._createVersionRow());
        generalPage.add(versionGroup);
        const generalGroup = new Adw.PreferencesGroup();
        const {generalGrid, resetAll} = this._createGeneralPage();
        generalGroup.add(generalGrid);
        generalPage.add(generalGroup);
        window.add(generalPage);

        const accountsPage = new Adw.PreferencesPage();
        accountsPage.set_title("Account");
        accountsPage.set_icon_name("user-home-symbolic");
        const accountsGroup = new Adw.PreferencesGroup();
        accountsGroup.add(this._createAccountsPage());
        accountsPage.add(accountsGroup);
        window.add(accountsPage);

        const stylesPage = new Adw.PreferencesPage();
        stylesPage.set_title("Styles");
        stylesPage.set_icon_name("edit-select-all-symbolic");
        new StylesManager(this._settings).fillStylesPage(stylesPage);
        window.add(stylesPage);

        const connectionsPage = new Adw.PreferencesPage();
        connectionsPage.set_title("Connection");
        connectionsPage.set_icon_name("network-server-symbolic");
        const connectionsGroup = new Adw.PreferencesGroup();
        const {connectionsGrid, resetConnection} = this._createConnectionsPage();
        connectionsGroup.add(connectionsGrid);
        connectionsGroup.add(this._createConnectionsSaveFooter());
        connectionsPage.add(connectionsGroup);
        window.add(connectionsPage);

        this._countryMap = {};
        this._countryMapWithID = {};
        this._countryNames = [];

        this._cityTree = this._createCountryTree({
            maxLabel: `Max cities per country displayed:`,
            maxSettingKey: `number-cities-per-countries`,
            selectLabel: `Select countries for cities tab:\n<small>Hold down CTRL to select multiple</small>`,
            settingKey: 'countries-selected-for-cities',
            variantType: 'as',
            selectionValue: (country) => this._countryMap[country],
            rowHeight: 30,
        });
        const cityPage = new Adw.PreferencesPage();
        cityPage.set_title("Cities");
        cityPage.set_icon_name("document-open-symbolic");
        const cityGroup = new Adw.PreferencesGroup();
        cityGroup.add(this._cityTree.grid);
        cityPage.add(cityGroup);
        window.add(cityPage);

        this._serverTree = this._createCountryTree({
            maxLabel: `Max servers per country displayed:`,
            maxSettingKey: `number-servers-per-countries`,
            selectLabel: `Select countries to list in servers tab:\n<small>Hold down CTRL to select multiple</small>`,
            settingKey: 'countries-selected-for-servers',
            variantType: 'ai',
            selectionValue: (country) => this._countryMapWithID[country],
        });
        const serverPage = new Adw.PreferencesPage();
        serverPage.set_title("Servers");
        serverPage.set_icon_name("network-workgroup-symbolic");
        const serverGroup = new Adw.PreferencesGroup();
        serverGroup.add(this._serverTree.grid);
        serverPage.add(serverGroup);
        window.add(serverPage);

        // Populate tree stores after async fetch — the pages exist but start empty.
        // Both stores need country names, so fetch both maps in parallel then populate.

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
            this._countryNames = Common.safeObjectKeys(this._countryMap);

            this._populateCountryTree(this._cityTree);
            this._populateCountryTree(this._serverTree);
        }).catch(e => this._log.error('prefs country population failed', e));

        const resetManager = new ResetManager();
        resetAll.connect('clicked', () => {
            resetManager.resetAllSettings(this._settings, this._protoCbox, this._techCbox, this._cityTree.treeView, this._cityTree.iterMap, this._serverTree.treeView, this._serverTree.iterMap);
        });

        resetConnection.connect('clicked', () => {
            resetManager.resetConnectionSettings(this._settings, this._protoCbox, this._techCbox);
        });

        this._setWindowSize(window);
        return window;
    }
}
