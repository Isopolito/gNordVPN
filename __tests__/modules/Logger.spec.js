import Logger, {setDebugLogging} from '../../modules/Logger.js';
import GLib from 'gi://GLib';

const capture = () => {
    const lines = [];
    globalThis.log = m => lines.push(m);
    globalThis.logError = (e, m) => lines.push(m);
    return lines;
};

afterEach(() => setDebugLogging(false));

describe('Logger with debug logging off (the default)', () => {
    it('logs only warnings and errors', () => {
        const lines = capture();
        const logger = new Logger('T');
        logger.debug('chatty');
        logger.warn('careful');
        logger.error('broken');
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain('[WRN]');
        expect(lines[1]).toContain('[ERR]');
    });

    it('stays silent for timers but still returns the duration', () => {
        const lines = capture();
        GLib.get_monotonic_time = () => 5000;
        expect(new Logger('T').endTimer(0, 'CALL', {cmd: 'nordvpn', success: true})).toBe(5);
        expect(lines).toHaveLength(0);
    });
});

describe('Logger with debug logging on', () => {
    it('logs debug lines and every timer, even fast successful calls', () => {
        setDebugLogging(true);
        const lines = capture();
        GLib.get_monotonic_time = () => 5000;
        const logger = new Logger('T');
        logger.debug('chatty');
        expect(logger.endTimer(0, 'CALL', {cmd: 'nordvpn', success: true})).toBe(5);
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain('[DBG]');
    });

    it('can be turned off again', () => {
        setDebugLogging(true);
        setDebugLogging(false);
        const lines = capture();
        new Logger('T').debug('chatty');
        expect(lines).toHaveLength(0);
    });
});
