import St from 'gi://St';
import PanelIcon from '../../modules/shell/PanelIcon.js';
import * as Constants from '../../modules/constants.js';

class FakeActor {
    constructor(props = {}) {
        this.visible = true;
        this.children = [];
        Object.assign(this, props);
    }

    set_child(child) { this.child = child; }
    add_child(child) { this.children.push(child); }
    set_style(style) { this.style = style; }
}

const installSt = () => {
    St.Bin = class Bin extends FakeActor {};
    St.BoxLayout = class BoxLayout extends FakeActor {};
    St.Label = class Label extends FakeActor {};
    St.Icon = class Icon extends FakeActor {};
};

const settingsWith = (panelStyles) => ({
    get_value: () => ({deep_unpack: () => panelStyles}),
    get_string: () => 'font-weight: bold; ',
});

const statusIn = (key) => ({currentState: {stateName: Constants.states[key]}, country: 'France'});

const build = (panelStyles) => {
    installSt();
    const panelIcon = new PanelIcon(settingsWith(panelStyles));
    panelIcon.build();
    return panelIcon;
};

describe('PanelIcon', () => {
    it('shows an icon, with the state style, for an icon-only text', () => {
        const panelIcon = build({ERROR: {panelText: '{icon:dialog-warning-symbolic}', css: 'color: red;'}});
        panelIcon.update(statusIn('ERROR'));

        expect(panelIcon._icon.visible).toBe(true);
        expect(panelIcon._icon.icon_name).toBe('dialog-warning-symbolic');
        expect(panelIcon._icon.style).toBe('font-weight: bold; color: red;');
        expect(panelIcon._label.visible).toBe(false);
    });

    it('shows the label, with tokens rendered, for ordinary text', () => {
        const panelIcon = build({CONNECTED: {panelText: '{country}', css: 'color: green;'}});
        panelIcon.update(statusIn('CONNECTED'));

        expect(panelIcon._label.visible).toBe(true);
        expect(panelIcon._label.text).toBe('France');
        expect(panelIcon._label.style).toBe('font-weight: bold; color: green;');
        expect(panelIcon._icon.visible).toBe(false);
    });

    it('swaps back to the label when the state changes', () => {
        const panelIcon = build({
            ERROR: {panelText: '{icon:dialog-warning-symbolic}', css: ''},
            DISCONNECTED: {panelText: 'OFF', css: ''},
        });
        panelIcon.update(statusIn('ERROR'));
        panelIcon.update(statusIn('DISCONNECTED'));

        expect(panelIcon._label.visible).toBe(true);
        expect(panelIcon._label.text).toBe('OFF');
        expect(panelIcon._icon.visible).toBe(false);
    });
});
