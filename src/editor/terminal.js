import { InputParser } from './keybindings.js';

export const RESTORE_SEQUENCE = '\x1b[?2004l\x1b[?1004l\x1b[?1049l\x1b[?25h\x1b[0m\x1b]12;default\x1b\\';

export class Terminal {
  constructor({ input = process.stdin, output = process.stdout, onKey = () => { }, onResize = () => { }, onError = () => { } } = {}) {
    this.input = input;
    this.output = output;
    this.onKey = onKey;
    this.onResize = onResize;
    this.onError = onError;
    this.parser = new InputParser();
    this.started = false;
    this.escapeTimer = null;
    this.resizeTimer = null;
    this.pollTimer = null;
    this.handlers = {};
    this.originalRaw = null;
    this.lastSize = { cols: 0, rows: 0 };
  }

  write(data) {
    try { this.output.write(data); } catch { }
  }

  get rawSize() {
    const pick = (value) => (typeof value === 'number' && Number.isFinite(value) && value > 0) ? Math.floor(value) : 0;
    const output = this.output || process.stdout;
    return {
      cols: pick(output.columns) || pick(process.stdout.columns) || 0,
      rows: pick(output.rows) || pick(process.stdout.rows) || 0
    };
  }

  get size() {
    const raw = this.rawSize;
    return {
      cols: raw.cols || this.lastSize.cols || 80,
      rows: raw.rows || this.lastSize.rows || 24
    };
  }

  start() {
    if (this.started) return;
    this.started = true;
    try {
      this.originalRaw = this.input.isRaw;
      if (typeof this.input.setRawMode === 'function') this.input.setRawMode(true);
      else if (typeof this.input.resume === 'function') this.input.resume();
      this.input.resume?.();
      this.input.setEncoding?.('utf8');
    } catch (e) {
      this.onError(e);
    }
    const initial = this.rawSize;
    if (initial.cols && initial.rows) this.lastSize = initial;
    this.write('\x1b[?1049h\x1b[?25l\x1b[0m\x1b[2J\x1b[H');
    this.write('\x1b[?2004h\x1b[?1004h');
    this.write('\x1b[?1000l\x1b[?1002l\x1b[?1003l');

    this.handlers.data = (chunk) => {
      let events;
      try { events = this.parser.push(chunk); } catch (e) { this.onError(e); return; }
      for (const key of events) this._dispatch(key);
      this._armEscapeTimer();
    };
    this.input.on('data', this.handlers.data);

    this.handlers.resize = () => this._onResizeSignal();
    this.output?.on?.('resize', this.handlers.resize);
    if (this.output !== process.stdout) process.stdout.on?.('resize', this.handlers.resize);
    process.on?.('SIGWINCH', this.handlers.resize);

    this.handlers.sigint = () => {
      this.onKey({ name: 'ctrl+c', ctrl: true, shift: false, alt: false, meta: false });
    };
    this.handlers.sigterm = () => { this.stop(); process.exit(0); };
    this.handlers.sighup = () => { this.stop(); process.exit(0); };
    this.handlers.exit = () => { this.stop(false); };
    this.handlers.uncaught = (err) => {
      this.onError(err);
      try { process.stderr.write(`\namo: ${err?.stack || err}\n`); } catch { }
      this.stop(false);
    };
    process.on?.('SIGINT', this.handlers.sigint);
    process.on?.('SIGTERM', this.handlers.sigterm);
    process.on?.('SIGHUP', this.handlers.sighup);
    process.on?.('exit', this.handlers.exit);
    process.on?.('uncaughtException', this.handlers.uncaught);

    this.pollTimer = setInterval(() => this._checkResize(), 250);
    this.pollTimer.unref?.();
    this._armEscapeTimer();
  }

  _onResizeSignal() {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = null;
      this._checkResize();
    }, 20);
    this.resizeTimer.unref?.();
    setImmediate(() => this._checkResize());
  }

  _checkResize() {
    if (!this.started) return;
    const raw = this.rawSize;
    if (!raw.cols || !raw.rows) return;
    if (raw.cols === this.lastSize.cols && raw.rows === this.lastSize.rows) return;
    this.lastSize = raw;
    this.onResize(raw.cols, raw.rows);
  }

  _armEscapeTimer() {
    if (this.escapeTimer) clearTimeout(this.escapeTimer);
    if (!this.parser.pendingEscape()) return;
    this.escapeTimer = setTimeout(() => {
      this.escapeTimer = null;
      if (this.parser.consumePendingEscape()) {
        this._dispatch({ name: 'escape', ctrl: false, shift: false, alt: false, meta: false });
      }
    }, 45);
    this.escapeTimer.unref?.();
  }

  _dispatch(key) {
    if (this.escapeTimer) { clearTimeout(this.escapeTimer); this.escapeTimer = null; }
    this.onKey(key);
  }

  stop(restore = true) {
    if (!this.started) return;
    this.started = false;
    if (this.escapeTimer) { clearTimeout(this.escapeTimer); this.escapeTimer = null; }
    if (this.resizeTimer) { clearTimeout(this.resizeTimer); this.resizeTimer = null; }
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.handlers.data) this.input.off?.('data', this.handlers.data);
    if (this.handlers.resize) {
      this.output?.off?.('resize', this.handlers.resize);
      if (this.output !== process.stdout) process.stdout.off?.('resize', this.handlers.resize);
      process.off?.('SIGWINCH', this.handlers.resize);
    }
    if (this.handlers.sigint) process.off?.('SIGINT', this.handlers.sigint);
    if (this.handlers.sigterm) process.off?.('SIGTERM', this.handlers.sigterm);
    if (this.handlers.sighup) process.off?.('SIGHUP', this.handlers.sighup);
    if (this.handlers.exit) process.off?.('exit', this.handlers.exit);
    if (this.handlers.uncaught) process.off?.('uncaughtException', this.handlers.uncaught);
    try {
      if (typeof this.input.setRawMode === 'function') this.input.setRawMode(false);
    } catch { }
    if (restore) this.write(RESTORE_SEQUENCE);
    else {
      try { this.output.write(RESTORE_SEQUENCE + '\n'); } catch { }
    }
    try { this.input.pause?.(); } catch { }
  }
}
