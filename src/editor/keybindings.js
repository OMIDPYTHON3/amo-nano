import { StringDecoder } from 'node:string_decoder';

const CTRL_NAMES = {
  0: 'ctrl+space', 1: 'ctrl+a', 2: 'ctrl+b', 3: 'ctrl+c', 4: 'ctrl+d', 5: 'ctrl+e',
  6: 'ctrl+f', 7: 'ctrl+g', 8: 'ctrl+h', 9: 'tab', 10: 'ctrl+j', 11: 'ctrl+k', 12: 'ctrl+l', 13: 'ctrl+m',
  14: 'ctrl+n', 15: 'ctrl+o', 16: 'ctrl+p', 17: 'ctrl+q', 18: 'ctrl+r', 19: 'ctrl+s',
  20: 'ctrl+t', 21: 'ctrl+u', 22: 'ctrl+v', 23: 'ctrl+w', 24: 'ctrl+x', 25: 'ctrl+y',
  26: 'ctrl+z', 27: 'escape', 28: 'ctrl+\\', 29: 'ctrl+]', 30: 'ctrl+^', 31: 'ctrl+_'
};

const TILDE_KEYS = {
  1: 'home', 2: 'insert', 3: 'delete', 4: 'end', 5: 'pageup', 6: 'pagedown',
  7: 'home', 8: 'end', 11: 'f1', 12: 'f2', 13: 'f3', 14: 'f4', 15: 'f5',
  17: 'f6', 18: 'f7', 19: 'f8', 20: 'f9', 21: 'f10', 23: 'f11', 24: 'f12'
};

const SS3_KEYS = { A: 'up', B: 'down', C: 'right', D: 'left', H: 'home', F: 'end', P: 'f1', Q: 'f2', R: 'f3', S: 'f4' };
const CSI_FINAL = { A: 'up', B: 'down', C: 'right', D: 'left', H: 'home', F: 'end', E: 'clear', Z: 'shift+tab' };

export class InputParser {
  constructor() {
    this.decoder = new StringDecoder('utf8');
    this.buf = '';
    this.events = [];
  }

  push(chunk) {
    const decoded = this.decoder.write(chunk);
    if (decoded && !this.buf && this._isBulkText(decoded)) {
      this.events.push({ name: 'paste', text: decoded, ctrl: false, shift: false, alt: false, meta: false });
      const events = this.events;
      this.events = [];
      return events;
    }
    this.buf += decoded;
    this._parse();
    const events = this.events;
    this.events = [];
    return events;
  }

  _isBulkText(text) {
    if (text.includes('\x1b')) return false;
    const chars = Array.from(text);
    const printable = chars.filter(ch => /[\p{L}\p{N}\p{P}\p{S}\p{M} ]/u.test(ch)).length;
    if (printable === 0) return false;
    if (chars.length >= 4 && printable >= 3) return true;
    return (text.includes('\n') || text.includes('\r') || text.includes('\t')) && printable >= 2;
  }

  flush() {
    const rest = this.decoder.end();
    if (rest) this.buf += rest;
    this._parse(true);
    const events = this.events;
    this.events = [];
    return events;
  }

  pendingEscape() { return this.buf === '\x1b'; }
  consumePendingEscape() {
    if (this.buf === '\x1b') { this.buf = ''; return true; }
    return false;
  }
  clear() { this.buf = ''; this.events = []; }

  _emit(name, mods = {}) {
    this.events.push({ name, ctrl: !!mods.ctrl, shift: !!mods.shift, alt: !!mods.alt, meta: !!mods.meta });
  }

  _parse(final = false) {
    let guard = 0;
    while (this.buf.length && guard++ < 100000) {
      const first = this.buf[0];
      const code = this.buf.charCodeAt(0);

      if (first === '\x1b') {
        if (this.buf.startsWith('\x1b[200~')) {
          const end = this.buf.indexOf('\x1b[201~', 6);
          if (end === -1) { if (final) { this.buf = ''; } return; }
          const text = this.buf.slice(6, end);
          this.buf = this.buf.slice(end + 6);
          this.events.push({ name: 'paste', text, ctrl: false, shift: false, alt: false, meta: false });
          continue;
        }
        if (this.buf.startsWith('\x1b[I')) { this._emit('focusin'); this.buf = this.buf.slice(3); continue; }
        if (this.buf.startsWith('\x1b[O')) { this._emit('focusout'); this.buf = this.buf.slice(3); continue; }
        if (this.buf.startsWith('\x1b[')) {
          const end = this._findCsiEnd(this.buf);
          if (end === -1) return;
          const body = this.buf.slice(2, end + 1);
          this.buf = this.buf.slice(end + 1);
          this._parseCsi(body);
          continue;
        }
        if (this.buf.startsWith('\x1bO')) {
          if (this.buf.length < 3) return;
          const ch = this.buf[2];
          this.buf = this.buf.slice(3);
          const name = SS3_KEYS[ch];
          if (name) this._emit(name);
          else this._emit('char', { alt: true });
          continue;
        }
        if (this.buf.length === 1) {
          if (final) { this.buf = ''; this._emit('escape'); }
          return;
        }
        const ch = Array.from(this.buf.slice(1))[0];
        this.buf = this.buf.slice(1 + ch.length);
        if (ch === '\x1b') { this._emit('escape'); continue; }
        this._emit(ch.toLowerCase(), { alt: true, shift: ch !== ch.toLowerCase() });
        continue;
      }

      if (code < 32 || code === 127) {
        this.buf = this.buf.slice(1);
        if (code === 127) { this._emit('backspace'); continue; }
        const name = CTRL_NAMES[code];
        if (name === 'ctrl+m') this._emit('enter');
        else if (name === 'tab') this._emit('tab');
        else if (name) this._emit(name, { ctrl: name.startsWith('ctrl+') });
        else this._emit('char', { ctrl: true });
        continue;
      }

      if (first === ' ') { this.buf = this.buf.slice(1); this._emit('space'); continue; }
      const ch = Array.from(this.buf)[0];
      this.buf = this.buf.slice(ch.length);
      this.events.push({ name: 'char', char: ch, ctrl: false, shift: ch !== ch.toLowerCase(), alt: false, meta: false });
    }
  }

  _findCsiEnd(buf) {
    for (let i = 2; i < buf.length; i++) {
      const c = buf.charCodeAt(i);
      if (c >= 0x40 && c <= 0x7e) return i;
    }
    return -1;
  }

  _parseCsi(body) {
    const final = body.slice(-1);
    const paramStr = body.slice(0, -1);
    const parts = paramStr === '' ? [] : paramStr.split(';').map(p => p === '' ? 0 : Number(p));
    let code = parts[0] ?? 0;
    let modRaw = parts.length > 1 ? parts[1] : null;
    const mods = { ctrl: false, shift: false, alt: false, meta: false };
    const applyMods = (m) => {
      mods.shift = !!(m & 1); mods.alt = !!(m & 2); mods.ctrl = !!(m & 4); mods.meta = !!(m & 8);
    };
    if (modRaw != null && modRaw > 1) applyMods(modRaw - 1);
    else if (final !== '~' && code > 1 && code < 17) { applyMods(code - 1); code = 1; }

    if (final === '~') {
      const name = TILDE_KEYS[code];
      if (name) this._emit(name, mods);
      else if (code === 200) { }
      return;
    }
    if (final === 'Z') { this._emit(mods.ctrl ? 'ctrl+shift+tab' : 'shift+tab'); return; }
    if (final === 'I') { this._emit('ctrl+tab'); return; }
    const name = CSI_FINAL[final];
    if (name) {
      if (final === 'A' && mods.shift) this._emit('shift+up', mods);
      else if (final === 'B' && mods.shift) this._emit('shift+down', mods);
      else if (final === 'C' && mods.shift) this._emit('shift+right', mods);
      else if (final === 'D' && mods.shift) this._emit('shift+left', mods);
      else this._emit(name, mods);
    }
  }
}

export function resolveAction(key) {
  if (!key) return null;
  const c = key.ctrl && !key.alt;
  if (key.name === 'paste') return 'paste';
  if (key.name === 'escape') return 'cancel';
  if (key.name === 'ctrl+tab') return 'nextTab';
  if (key.name === 'ctrl+shift+tab') return 'prevTab';
  if (key.name === 'shift+tab') return 'outdent';
  if (key.name === 'tab') return c ? 'nextTab' : 'indent';
  if (key.name === 'enter') return 'newline';
  if (key.name === 'backspace') return c ? 'backspaceWord' : 'backspace';
  if (key.name === 'delete') return 'delete';
  if (key.name === 'up') return c ? 'moveLineUp' : 'up';
  if (key.name === 'down') return c ? 'moveLineDown' : 'down';
  if (key.name === 'left') return c ? 'wordLeft' : 'left';
  if (key.name === 'right') return c ? 'wordRight' : 'right';
  if (key.name === 'home') return c ? 'ctrlHome' : 'home';
  if (key.name === 'end') return c ? 'ctrlEnd' : 'end';
  if (key.name === 'pageup') return 'pageUp';
  if (key.name === 'pagedown') return 'pageDown';
  if (key.name === 'focusin') return 'focusIn';
  if (key.name === 'focusout') return 'focusOut';
  const map = {
    'ctrl+s': 'save', 'ctrl+shift+s': 'saveAs', 'ctrl+o': 'open', 'ctrl+n': 'new',
    'ctrl+w': 'close', 'ctrl+q': 'quit', 'ctrl+z': 'undo', 'ctrl+y': 'redo',
    'ctrl+f': 'find', 'ctrl+h': 'replace', 'ctrl+p': 'quickOpen', 'ctrl+g': 'gotoLine',
    'ctrl+a': 'selectAll', 'ctrl+c': 'copy', 'ctrl+x': 'cut', 'ctrl+v': 'paste',
    'ctrl+/': 'toggleComment', 'ctrl+_': 'toggleComment', 'ctrl+d': 'duplicateLine', 'ctrl+l': 'deleteLine',
    'ctrl+k': 'deleteToEnd', 'ctrl+u': 'deleteToStart', 'ctrl+b': 'toggleLeftPanel',
    'ctrl+insert': 'copy', 'shift+insert': 'paste'
  };
  if (key.name === 'ctrl+/' || key.name === 'ctrl+_') return 'toggleComment';
  if (key.name === '_' && c) return 'toggleComment';
  if (key.name === '/' && c) return 'toggleComment';
  if (key.name === 'insert') return key.shift ? 'paste' : null;
  if (key.name === 'shift+insert') return 'paste';
  const name = key.name.toLowerCase();
  if (map[name]) return map[name];
  if (c && key.shift && name === 'ctrl+s') return 'saveAs';
  if (c && /^ctrl\+.$/.test(name)) return null;
  if (key.alt && /^[a-z]$/.test(name)) return null;
  return null;
}

export function keyLabel(key) {
  if (!key) return '';
  const parts = [];
  if (key.ctrl) parts.push('Ctrl');
  if (key.alt) parts.push('Alt');
  if (key.shift) parts.push('Shift');
  let n = key.name;
  if (n === 'char' && key.char) n = key.char;
  if (n === 'space') n = 'Space';
  parts.push(n);
  return parts.join('+');
}
