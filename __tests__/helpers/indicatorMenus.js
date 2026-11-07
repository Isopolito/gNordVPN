import {jest} from '@jest/globals';

// Not a spec: the widgets _buildIndicatorMenu creates, for specs that drive VpnIndicator._refresh without building them.
export function installMenuFakes(indicator) {
    indicator._statusPopup = {
        get_label_actor: () => ({set_text: jest.fn()}),
        menu: {removeAll: jest.fn(), addMenuItem: jest.fn()},
        show: jest.fn(),
        hide: jest.fn(),
    };
    indicator._statusLabel = {text: 'Checking...', show: jest.fn(), hide: jest.fn()};
    indicator._updateMenuLabel = {};
    indicator._connectMenuItem = {};
    indicator._disconnectMenuItem = {};
    indicator._loginMenuItem = {};
    indicator._logoutMenuItem = {};
    indicator._groupMenu = {tryBuild: jest.fn(async () => {}), showHide: jest.fn(), rebuild: jest.fn(), updateFavorite: jest.fn(), destroy: jest.fn()};
    indicator._commonFavorite = {showHide: jest.fn()};
    indicator._extSettings.get_boolean = () => false;
}
