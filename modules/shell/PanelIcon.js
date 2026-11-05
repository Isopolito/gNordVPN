import St from 'gi://St';

import * as Constants from '../constants.js';
import * as PanelText from '../PanelText.js';

const PANEL_ICON_SIZE = 16;

export default class PanelIcon {
    constructor(settings) {
        this._settings = settings;

        this.uiMap = {};
        this.commonStyle = "";
        this.updateStyle();
    }

    updateStyle() {
        const savedStyle = this._settings.get_value('panel-styles').deep_unpack();

        this.uiMap = {};
        Object.keys(savedStyle).forEach(key => {
            this.uiMap[Constants.states[key]] = savedStyle[key];
        });

        this.commonStyle = this._settings.get_string(`common-panel-style`);
    }

    // Panel text template for a state name, or undefined if the state has no style.
    getTemplate(stateName) {
        return this.uiMap[stateName]?.panelText;
    }

    update(status, uptimeSec) {
        if (!status) return;

        const config = this.uiMap[status.currentState.stateName];
        const style = this.commonStyle + config.css;
        const iconName = PanelText.iconNameOf(config.panelText);
        this._icon.visible = iconName !== null;
        this._label.visible = iconName === null;

        if (iconName !== null) {
            this._icon.icon_name = iconName;
            this._icon.set_style(style);
            return;
        }

        let msg = config.panelText;
        if (status.currentState.stateName === Constants.states.CONNECTED)
            msg = PanelText.render(msg, status, {uptimeSec});

        this._label.text = msg || "Style Missing MSG";
        this._label.set_style(style);
    }

    button() {
        return this._button;
    }

    build() {
        this._button = new St.Bin({
            reactive: true,
            can_focus: true,
            x_expand: true,
            y_expand: false,
            track_hover: true
        });

        this._label = new St.Label();
        this._icon = new St.Icon({icon_size: PANEL_ICON_SIZE, visible: false});

        const content = new St.BoxLayout();
        content.add_child(this._label);
        content.add_child(this._icon);
        this._button.set_child(content);
    }
}