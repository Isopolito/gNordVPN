import Logger from './Logger.js';

export default class Favorites {
    constructor(settings) {
        this._settings = settings;
        this._log = new Logger('Favorites');
    }

    _getData(a) { return this._settings.get_string(a); }
    _setData(a, b) { return this._settings.set_string(a, b); }
    
    // The stored favorites object, or undefined when the stored text is not valid JSON or not an object.
    _read(favoriteType) {
        const data = this._getData(favoriteType) || '{}';
        let favorites;
        try {
            favorites = JSON.parse(data);
        } catch {
            return undefined;
        }
        return favorites !== null && typeof favorites === 'object' && !Array.isArray(favorites) ? favorites : undefined;
    }

    get(favoriteType, items=[]) {
        const favorites = this._read(favoriteType) ?? {};

        for (const key of Object.keys(favorites))
            if (key in items) delete items[key];

        return {
            favorites,
            itemsMinusFavorites: items,
        }
    }

    remove(favoriteType, item) {
        if (!item) return;

        const favorites = this._read(favoriteType);
        if (!favorites) {
            this._log.error('failed removing favorite');
            return;
        }

        delete favorites[item];
        this._setData(favoriteType, JSON.stringify(favorites));
    }

    add(favoriteType, item, item2) {
        if (!item || !item2) return;

        const favorites = this._read(favoriteType) ?? {};
        favorites[item] = item2;
        this._setData(favoriteType, JSON.stringify(favorites));
    }
}
