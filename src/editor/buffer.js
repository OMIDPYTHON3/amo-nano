import { toCPs, cpLength, clamp } from './util.js';

export function isWordChar(ch) {
  if (!ch) return false;
  return /[\p{L}\p{N}_$]/u.test(ch);
}

export class TextBuffer {
  constructor(text = '') {
    this.setText(text);
  }

  setText(text) {
    let t = String(text ?? '');
    t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    this.lines = t.split('\n');
    if (this.lines.length === 0) this.lines = [''];
    this._cps = new Map();
    this.version = 0;
  }

  getText() { return this.lines.join('\n'); }
  get lineCount() { return this.lines.length; }

  line(i) { return this.lines[i] ?? ''; }

  cps(i) {
    if (i < 0 || i >= this.lines.length) return [];
    let c = this._cps.get(i);
    if (!c) {
      c = toCPs(this.lines[i]);
      this._cps.set(i, c);
    }
    return c;
  }

  lineLength(i) { return this.cps(i).length; }

  _invalidate() { this._cps.clear(); this.version = (this.version || 0) + 1; }

  setLine(i, text) {
    if (i < 0 || i >= this.lines.length) return;
    this.lines[i] = String(text);
    this._invalidate();
  }

  insertLine(i, text = '') {
    i = clamp(i, 0, this.lines.length);
    this.lines.splice(i, 0, String(text));
    this._invalidate();
  }

  removeLine(i) {
    if (this.lines.length <= 1) { this.lines[0] = ''; this._invalidate(); return; }
    if (i < 0 || i >= this.lines.length) return;
    this.lines.splice(i, 1);
    this._invalidate();
  }

  insert(y, x, text) {
    text = String(text ?? '');
    if (!text) return { y, x };
    const parts = text.split('\n');
    const c = this.cps(y);
    const head = c.slice(0, x).join('');
    const tail = c.slice(x).join('');
    if (parts.length === 1) {
      this.setLine(y, head + text + tail);
      return { y, x: x + cpLength(text) };
    }
    this.setLine(y, head + parts[0]);
    for (let i = 1; i < parts.length - 1; i++) {
      this.insertLine(y + i, parts[i]);
    }
    const last = parts[parts.length - 1];
    this.insertLine(y + parts.length - 1, last + tail);
    return { y: y + parts.length - 1, x: cpLength(last) };
  }

  deleteRange(start, end) {
    if (end.y < start.y || (end.y === start.y && end.x < start.x)) {
      [start, end] = [end, start];
    }
    if (start.y === end.y) {
      const c = this.cps(start.y);
      const deleted = c.slice(start.x, end.x).join('');
      this.setLine(start.y, c.slice(0, start.x).join('') + c.slice(end.x).join(''));
      return { text: deleted, position: { ...start } };
    }
    const c1 = this.cps(start.y);
    const c2 = this.cps(end.y);
    const middle = this.lines.slice(start.y + 1, end.y);
    const deleted = [
      c1.slice(start.x).join(''),
      ...middle,
      c2.slice(0, end.x).join('')
    ].join('\n');
    const merged = c1.slice(0, start.x).join('') + c2.slice(end.x).join('');
    const removeCount = end.y - start.y;
    for (let i = 0; i < removeCount; i++) this.removeLine(start.y + 1);
    this.setLine(start.y, merged);
    return { text: deleted, position: { ...start } };
  }

  deleteChar(y, x) {
    const len = this.lineLength(y);
    if (x < len) return this.deleteRange({ y, x }, { y, x: x + 1 });
    if (y < this.lineCount - 1) return this.deleteRange({ y, x }, { y: y + 1, x: 0 });
    return { text: '', position: { y, x } };
  }

  backspace(y, x) {
    if (x > 0) return this.deleteRange({ y, x: x - 1 }, { y, x });
    if (y > 0) return this.deleteRange({ y: y - 1, x: this.lineLength(y - 1) }, { y, x: 0 });
    return { text: '', position: { y, x } };
  }

  getWord(y, x) {
    const c = this.cps(y);
    if (x > c.length) x = c.length;
    let start = x, end = x;
    while (start > 0 && isWordChar(c[start - 1])) start--;
    while (end < c.length && isWordChar(c[end])) end++;
    return { start, end, text: c.slice(start, end).join(''), line: y };
  }

  charAt(y, x) {
    const c = this.cps(y);
    return x >= 0 && x < c.length ? c[x] : null;
  }

  snapshot() {
    return { lines: this.lines.slice(), length: this.lines.length };
  }

  restore(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.lines)) return;
    this.lines = snapshot.lines.slice();
    this._invalidate();
  }
}

export class History {
  constructor(limit = 400) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }

  push(state) {
    this.undoStack.push(state);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  undo(current) {
    const prev = this.undoStack.pop();
    if (!prev) return null;
    this.redoStack.push(current);
    return prev;
  }

  redo(current) {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(current);
    return next;
  }

  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
}
