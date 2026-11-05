import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as espree from 'espree';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function listJs(dir) {
    return fs.readdirSync(path.join(root, dir), {withFileTypes: true}).flatMap(entry => {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) return listJs(rel);
        return entry.name.endsWith('.js') ? [rel] : [];
    });
}

// Every module specifier a source loads: static imports, re-exports and dynamic import() calls, found by parsing.
function specifiersOf(source) {
    const found = [];
    const visit = (node) => {
        if (!node || typeof node.type !== 'string') return;
        if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(node.type) && node.source) {
            found.push(node.source.value);
        }
        Object.values(node).forEach(child => (Array.isArray(child) ? child.forEach(visit) : visit(child)));
    };
    visit(espree.parse(source, {ecmaVersion: 2022, sourceType: 'module'}));
    return found;
}

const importsOf = (file) => specifiersOf(fs.readFileSync(path.join(root, file), 'utf8'));
const resolved = (file) => importsOf(file).filter(i => i.startsWith('.')).map(i => path.normalize(path.join(path.dirname(file), i)));

// GNOME Shell and the preferences window are separate processes with conflicting libraries.
const SHELL_ONLY = /^(gi:\/\/(St|Clutter|Meta|Shell)|resource:\/\/\/org\/gnome\/shell\/)/;
const PREFS_ONLY = /^(gi:\/\/(Gtk|Gdk|Adw)|resource:\/\/\/org\/gnome\/Shell\/Extensions\/)/;

const shellFiles = ['extension.js', ...listJs(path.join('modules', 'shell'))];
const prefsFiles = ['prefs.js', ...listJs(path.join('modules', 'prefs'))];
const sharedFiles = listJs('modules').filter(f => path.dirname(f) === 'modules');

describe('import scanner', () => {
    it('finds multiline, side-effect, double-quoted, dynamic and oddly spaced imports', () => {
        expect(importsOf(path.join('modules', 'prefs', 'style', 'Presets.js'))).toEqual(expect.arrayContaining(['./AppearanceModel.js', './Color.js']));
        const sample = [
            "import 'gi://Gtk';", 'import X from "gi://St";', "const m = await import ('./a.js');",
            "export {y} from './b.js';", "import{Gdk}from 'gi://Gdk';", "export * from './c.js';",
        ].join('\n');
        expect(specifiersOf(sample)).toEqual(['gi://Gtk', 'gi://St', './a.js', './b.js', 'gi://Gdk', './c.js']);
    });
});

describe('process isolation', () => {
    it.each(shellFiles)('%s imports no preferences libraries and nothing from modules/prefs', (file) => {
        expect(importsOf(file).filter(i => PREFS_ONLY.test(i))).toEqual([]);
        expect(resolved(file).filter(i => i.startsWith(path.join('modules', 'prefs')))).toEqual([]);
    });

    it.each(prefsFiles)('%s imports no shell libraries and nothing from modules/shell', (file) => {
        expect(importsOf(file).filter(i => SHELL_ONLY.test(i))).toEqual([]);
        expect(resolved(file).filter(i => i.startsWith(path.join('modules', 'shell')))).toEqual([]);
    });

    it.each(sharedFiles)('%s, used by both processes, imports neither kind of library nor any process folder', (file) => {
        expect(importsOf(file).filter(i => SHELL_ONLY.test(i) || PREFS_ONLY.test(i))).toEqual([]);
        expect(resolved(file).filter(i => i.startsWith(path.join('modules', 'shell')) || i.startsWith(path.join('modules', 'prefs')))).toEqual([]);
    });
});
