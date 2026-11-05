import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const safeObjectKeys = function(obj) {
    return obj ? Object.keys(obj) : [];
};

// True for the error a cancelled Gio.Cancellable raises from an async call.
export const isCancelled = (e) => e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
