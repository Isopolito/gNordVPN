import {FakeSettings, FakeVariant} from '../../helpers/FakeSettings.js';
import {fakes} from '../../helpers/fakeGtk.js';
import CountryPicker from '../../../modules/prefs/CountryPicker.js';

const {CheckButton} = fakes;

const NAMES = ['United States', 'Canada', 'Germany', 'Japan', 'France'];
const IDS = {Canada: 38, France: 74, Germany: 81, Japan: 108, 'United States': 228};
const CITIES_KEY = 'countries-selected-for-cities';
const SERVERS_KEY = 'countries-selected-for-servers';

const cityPicker = (settings) => new CountryPicker({
    settings, title: 'Countries', settingKey: CITIES_KEY, variantType: 'as',
    selectionValue: name => name.replace(/ /g, '_'),
});
const serverPicker = (settings, ids = IDS) => new CountryPicker({
    settings, title: 'Countries', settingKey: SERVERS_KEY, variantType: 'ai',
    selectionValue: name => ids[name],
});

const rows = (picker) => picker.group.children;
const titles = (picker) => rows(picker).map(r => r.title);
const rowFor = (picker, title) => rows(picker).find(r => r.title === title);
const checkOf = (picker, title) => rowFor(picker, title).children.find(c => c instanceof CheckButton);
const checked = (picker) => rows(picker).filter(r => r.children[0].active).map(r => r.title);

describe('CountryPicker', () => {
    it('shows a loading row until populated', () => {
        const picker = cityPicker(new FakeSettings());
        expect(titles(picker)).toEqual(['Loading countries…']);
        picker.populate(NAMES);
        expect(titles(picker)).not.toContain('Loading countries…');
    });

    it('shows a failed row when there are no countries', () => {
        const picker = cityPicker(new FakeSettings());
        picker.populate([]);
        expect(titles(picker)).toEqual(['Couldn’t load countries — is nordvpnd running?']);
    });

    it('lists saved countries first, each part alphabetical', () => {
        const picker = cityPicker(new FakeSettings({[CITIES_KEY]: ['United_States', 'Germany']}));
        picker.populate(NAMES);
        expect(titles(picker)).toEqual(['Germany', 'United States', 'Canada', 'France', 'Japan']);
        expect(checked(picker)).toEqual(['Germany', 'United States']);
    });

    it('shows the selected count and updates it on every toggle', () => {
        const picker = cityPicker(new FakeSettings({[CITIES_KEY]: ['Japan']}));
        picker.populate(NAMES);
        expect(picker.group.description).toBe('1 selected');
        checkOf(picker, 'Canada').userSet(true);
        expect(picker.group.description).toBe('2 selected');
        checkOf(picker, 'Japan').userSet(false);
        expect(picker.group.description).toBe('1 selected');
    });

    it('keeps the row order when toggled', () => {
        const picker = cityPicker(new FakeSettings());
        picker.populate(NAMES);
        checkOf(picker, 'Japan').userSet(true);
        expect(titles(picker)).toEqual(['Canada', 'France', 'Germany', 'Japan', 'United States']);
    });

    it('makes clicking a row toggle its check button', () => {
        const picker = cityPicker(new FakeSettings());
        picker.populate(NAMES);
        expect(rowFor(picker, 'Canada').activatable_widget).toBe(checkOf(picker, 'Canada'));
    });

    it('filters rows case-insensitively on the display name', () => {
        const picker = cityPicker(new FakeSettings());
        picker.populate(NAMES);
        picker._search.type('AN');
        const visible = rows(picker).filter(r => r.visible !== false).map(r => r.title);
        expect(visible).toEqual(['Canada', 'France', 'Germany', 'Japan']);
        picker._search.type('');
        expect(rows(picker).every(r => r.visible !== false)).toBe(true);
    });

    it('writes country names as "as" on toggle', () => {
        const settings = new FakeSettings();
        const picker = cityPicker(settings);
        picker.populate(NAMES);
        checkOf(picker, 'United States').userSet(true);
        checkOf(picker, 'Canada').userSet(true);
        expect(settings.get_value(CITIES_KEY).deep_unpack()).toEqual(['Canada', 'United_States']);
        checkOf(picker, 'Canada').userSet(false);
        expect(settings.get_value(CITIES_KEY).deep_unpack()).toEqual(['United_States']);
    });

    it('writes country ids as "ai" on toggle', () => {
        const settings = new FakeSettings();
        const picker = serverPicker(settings);
        picker.populate(NAMES);
        checkOf(picker, 'Germany').userSet(true);
        checkOf(picker, 'Japan').userSet(true);
        expect(settings.get_value(SERVERS_KEY).deep_unpack()).toEqual([81, 108]);
    });

    it('does not write while populating or refreshing', () => {
        const settings = new FakeSettings({[CITIES_KEY]: ['Japan']});
        const picker = cityPicker(settings);
        picker.populate(NAMES);
        settings.set_value(CITIES_KEY, settings.get_default_value(CITIES_KEY));
        settings.writes.length = 0;
        picker.refresh();
        picker.populate(NAMES);
        expect(settings.writes).toEqual([]);
    });

    it('refresh follows an external change to the setting', () => {
        const settings = new FakeSettings({[CITIES_KEY]: ['Japan']});
        const picker = cityPicker(settings);
        picker.populate(NAMES);
        settings.set_value(CITIES_KEY, settings.get_default_value(CITIES_KEY));
        picker.refresh();
        expect(checked(picker)).toEqual([]);
        expect(picker.group.description).toBe('0 selected');
        settings.set_value(CITIES_KEY, new FakeVariant('as', ['France']));
        picker.refresh();
        expect(checked(picker)).toEqual(['France']);
    });

    it('preserves saved values that have no row across a toggle', () => {
        const settings = new FakeSettings({[CITIES_KEY]: ['Atlantis', 'Japan'], [SERVERS_KEY]: [999, 108]});
        const cities = cityPicker(settings);
        cities.populate(NAMES);
        checkOf(cities, 'Canada').userSet(true);
        expect(settings.get_value(CITIES_KEY).deep_unpack()).toEqual(['Atlantis', 'Japan', 'Canada']);

        const servers = serverPicker(settings);
        servers.populate(NAMES);
        checkOf(servers, 'Japan').userSet(false);
        expect(settings.get_value(SERVERS_KEY).deep_unpack()).toEqual([999]);
    });

    it('hides countries without an id from the servers picker', () => {
        const picker = serverPicker(new FakeSettings(), {Canada: 38, Japan: 108});
        picker.populate(NAMES);
        expect(titles(picker)).toEqual(['Canada', 'Japan']);
    });
});
