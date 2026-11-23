import path from 'node:path';
import { Settings } from './settings.js';
import { getTheme, listThemes, resolveThemeId } from './themes.js';
import { FileManager, resolvePath } from './file-manager.js';
import { AutoSave } from './autosave.js';
import { RecoveryManager } from './recovery.js';
import { TabManager, createTab } from './tabs.js';
import { Autocomplete } from './autocomplete.js';
import { SearchState } from './search.js';
import { Terminal, RESTORE_SEQUENCE } from './terminal.js';
import { Renderer } from './renderer.js';
import { resolveAction } from './keybindings.js';
import { LANGUAGES, detectLanguage, resolveLanguage, languageName, listLanguages } from './languages.js';
import { charWidth, clamp } from './util.js';
import { hasSelection, selectionRange, selectionText, clampCursor, makeSelection } from './cursor.js';
import { isWordChar } from './buffer.js';
import { SUGGESTED_FONTS, FONT_INSTRUCTIONS, detectTerminalFont, formatFontReport } from './fonts.js';

const PAIRS = { '{': '}', '[': ']', '(': ')', '"': '"', "'": "'", '`': '`' };
const CLOSERS = new Set(Object.values(PAIRS));

const COMMANDS = [
  { name: 'theme', detail: 'Choose color theme' },
  { name: 'settings', detail: 'Appearance & behavior' },
  { name: 'lang', detail: 'Set file language' },
  { name: 'font', detail: 'Font information' },
  { name: 'saveas', detail: 'Save file as…' },
  { name: 'reload', detail: 'Reload file from disk' },
  { name: 'closeall', detail: 'Close all tabs' },
  { name: 'new', detail: 'New file' },
  { name: 'help', detail: 'Keyboard help' },
  { name: 'about', detail: 'About AMO' }
];

export class Editor {
  constructor(options = {}) {
    this.settings = options.settings || new Settings(options.configDir);
    this.fileManager = options.fileManager || new FileManager();
    this.theme = getTheme(this.settings.get('theme'), this.settings.customThemes);
    this.tabs = new TabManager();
    this.search = new SearchState();
    this.autocomplete = new Autocomplete(this.settings);
    this.autosave = new AutoSave(this.settings, this.fileManager, (tab, status, msg) => this._onSaveStatus(tab, status, msg));
    this.recovery = new RecoveryManager(this.settings);
    this.clipboard = '';
    this.prompt = null;
    this.overlay = null;
    this.replaceState = null;
    this.message = null;
    this.messageType = 'info';
    this.messageTimer = null;
    this.insertMode = false;
    this.stopped = false;
    this.renderTimer = null;
    this.recoveryTimer = null;
    this.conflictTab = null;
    this.bracketMatch = null;
    this.lastKey = null;
    this.pasteGuardUntil = 0;
    this.pasteFragment = '';
    this.pasteTimer = null;
    this.recentCharTimes = [];

    this.write = options.write || ((s) => process.stdout.write(s));
    this.renderer = new Renderer(this.write, this.settings, this.theme);
    this.terminal = options.noTerminal ? null : new Terminal({
      input: options.input, output: options.output,
      onKey: (key) => this.handleKey(key),
      onResize: (cols, rows) => this.handleResize(cols, rows),
      onError: (err) => this._error(err)
    });
    this.render = this.render.bind(this);
  }

  get activeTab() { return this.tabs.active; }
  get config() { return this.settings.all(); }

  async start(initialPaths = []) {
    if (this.terminal) this.terminal.start();
    const size = this.terminal ? this.terminal.size : { cols: 100, rows: 30 };
    this.renderer.resize(size.cols, size.rows);
    this.recovery.startSession();
    await this.openPaths(initialPaths);
    const sessions = this.recovery.findRecoverable();
    if (sessions.length) this._offerRecovery(sessions[0]);
    this.requestRender();
    return this;
  }

  async openPaths(paths) {
    const list = (paths || []).filter(Boolean);
    if (!list.length) {
      this.tabs.addUntitled('');
      return;
    }
    for (const p of list) {
      const resolved = resolvePath(p, this.fileManager.cwd);
      const existing = this.tabs.findByPath(resolved);
      if (existing) { this.tabs.switchTo(this.tabs.indexOf(existing)); continue; }
      const result = await this.fileManager.load(resolved);
      if (result.ok) {
        const tab = createTab({
          content: result.text, filePath: resolved, displayName: path.basename(resolved),
          language: detectLanguage(resolved), readOnly: result.readOnly,
          fingerprint: result.fingerprint
        });
        this.tabs.add(tab);
      } else {
        const tab = createTab({
          content: '', filePath: resolved, displayName: path.basename(resolved),
          language: detectLanguage(resolved), modified: true, saveStatus: 'modified'
        });
        this.tabs.add(tab);
        this._setMessage(result.error, 'warning');
      }
    }
    this.autocomplete.noteBuffer(this.activeTab?.buffer);
  }

  _offerRecovery(session) {
    const items = session.files.map(f => ({
      label: `Recover ${f.filePath || 'untitled'}`,
      detail: new Date(f.savedAt).toLocaleString(),
      value: { session, entry: f },
      swatch: this.theme.string
    }));
    items.push({ label: 'Discard recovery data', detail: 'Delete all snapshots', value: { discard: true }, swatch: this.theme.error });
    this.overlay = {
      type: 'recovery', title: ' Crash recovery — unsaved session detected ',
      items, index: 0,
      onSelect: async (value) => {
        if (value.discard) { this.recovery.discard(session); this.overlay = null; this._setMessage('Recovery data discarded'); return; }
        const res = await this.recovery.applyEntry(value.entry, this.fileManager);
        if (!res.ok) { this._setMessage(res.error, 'error'); return; }
        let tab = res.filePath ? this.tabs.findByPath(res.filePath) : null;
        if (!tab) {
          tab = createTab({
            content: res.content, filePath: res.filePath,
            displayName: res.filePath ? path.basename(res.filePath) : 'recovered',
            language: res.language || detectLanguage(res.filePath), modified: true, saveStatus: 'modified'
          });
          this.tabs.add(tab);
        } else {
          tab.buffer.setText(res.content);
          tab.modified = true;
          tab.saveStatus = 'modified';
          this.autosave.schedule(tab);
        }
        if (res.cursor) tab.cursor = clampCursor(res.cursor, tab.buffer);
        this.recovery.discard(session);
        this.overlay = null;
        this._setMessage('Recovered unsaved changes');
        this.requestRender();
      },
      onCancel: () => { this.overlay = null; }
    };
  }

  requestRender() {
    if (this.renderTimer || this.stopped) return;
    this.renderTimer = setImmediate(() => {
      this.renderTimer = null;
      this.render();
    });
  }

  renderNow() {
    if (this.renderTimer) {
      clearImmediate(this.renderTimer);
      this.renderTimer = null;
    }
    this.render();
  }

  handleResize(cols, rows) {
    if (this.stopped) return;
    if (!this.renderer.resize(cols, rows)) return;
    if (this.activeTab) this._ensureVisible(this.activeTab);
    this.renderNow();
  }

  render() {
    if (this.stopped) return;
    const tab = this.activeTab;
    if (tab) {
      this._ensureVisible(tab);
      this.bracketMatch = this._findMatchingBracket(tab);
    }
    this.renderer.render({
      tabs: this.tabs.tabs, activeIndex: this.tabs.activeIndex, tab,
      config: this.config, theme: this.theme,
      prompt: this._promptLine(), overlay: this.overlay,
      autocomplete: this.autocomplete, search: this.search,
      message: this.message, messageType: this.messageType,
      insertMode: this.insertMode, mode: 'NORMAL',
      bracketMatch: this.bracketMatch
    });
  }

  _promptLine() {
    if (this.replaceState) {
      const rs = this.replaceState;
      return {
        mode: 'replace',
        value: rs.field === 'query' ? rs.query : rs.replacement,
        prefix: rs.field === 'query' ? 'FIND: ' : 'REPLACE: ',
        hint: `[F3 next] [Alt+Y replace] [Alt+A all] [Alt+C case:${rs.options?.caseSensitive ? 'on' : 'off'}] [Alt+E regex:${rs.options?.regex ? 'on' : 'off'}] [Tab field] [Esc close]${this.search.error ? ' ' + this.search.error : ''}`,
        message: rs.message, isError: rs.isError
      };
    }
    if (!this.prompt) return null;
    return {
      mode: this.prompt.mode, title: this.prompt.title, value: this.prompt.value,
      prefix: this.prompt.prefix || '', hint: this.prompt.hint || '',
      message: this.prompt.message, isError: this.prompt.isError,
      cursorVisible: true
    };
  }

  _setMessage(text, type = 'info', persist = false) {
    this.message = text;
    this.messageType = type;
    if (this.messageTimer) clearTimeout(this.messageTimer);
    if (!persist) {
      this.messageTimer = setTimeout(() => {
        if (this.message === text) { this.message = null; this.requestRender(); }
      }, 3500);
      this.messageTimer.unref?.();
    }
    this.requestRender();
  }

  _error(err) {
    this._setMessage(`Error: ${err?.message || err}`, 'error');
  }

  _onSaveStatus(tab, status, msg) {
    if (status === 'saved') this._setMessage(msg === 'exit' ? '' : `Saved ${path.basename(tab.filePath || '')} (${msg})`);
    else if (status === 'error') this._setMessage(`Save failed: ${msg}`, 'error', true);
    else if (status === 'conflict') { this.conflictTab = tab; this._setMessage(`${msg} — Alt+R reload, Alt+W overwrite`, 'error', true); }
    else if (status === 'dirty') this._setMessage('Changed while saving — will save again', 'warning');
    else if (status === 'saving') this._setMessage('Saving…', 'info');
    this.requestRender();
  }

  _touch(tab, options = {}) {
    if (!tab) return;
    tab.modified = true;
    tab.saveStatus = 'modified';
    tab.externalDirty = false;
    this.autosave.schedule(tab);
    this._scheduleRecovery(tab);
    if (options.autocomplete !== false) this._updateAutocomplete();
    this.requestRender();
  }

  _scheduleRecovery(tab) {
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      for (const t of this.tabs.tabs) if (t.modified) this.recovery.checkpoint(t);
    }, 400);
    this.recoveryTimer.unref?.();
    void tab;
  }

  _pushUndo(tab) {
    tab.history.push({
      lines: tab.buffer.snapshot().lines,
      cursor: { ...tab.cursor },
      selection: makeSelection(tab.selection.anchor, tab.selection.head)
    });
  }

  _restoreState(tab, state) {
    tab.buffer.restore({ lines: state.lines });
    tab.cursor = clampCursor(state.cursor, tab.buffer);
    tab.selection = makeSelection(state.selection?.anchor, state.selection?.head);
    this.autocomplete.hide();
    this.requestRender();
  }

  _updateAutocomplete() {
    const tab = this.activeTab;
    if (!tab || !this.settings.get('autocomplete')) { this.autocomplete.hide(); return; }
    const line = tab.buffer.line(tab.cursor.y);
    const before = tab.buffer.cps(tab.cursor.y).slice(0, tab.cursor.x).join('');
    const word = tab.buffer.getWord(tab.cursor.y, tab.cursor.x);
    const prefix = word.end > word.start && word.end >= tab.cursor.x ? word.text : '';
    this.autocomplete.update({
      prefix, cursor: { ...tab.cursor }, language: tab.language,
      enabled: prefix.length >= 1 && !tab.readOnly,
      buffers: this.tabs.tabs.map(t => t.buffer),
      before
    });
  }

  insertText(text, options = {}) {
    const tab = this.activeTab;
    if (!tab || tab.readOnly) {
      if (tab?.readOnly) this._setMessage('File is read-only', 'warning');
      return;
    }
    if (!options.noUndo) this._pushUndo(tab);
    const sel = tab.selection;
    let pos = { ...tab.cursor };
    if (hasSelection(sel) && !options.coalesce) {
      const range = selectionRange(sel);
      pos = tab.buffer.deleteRange(range.start, range.end).position;
      tab.selection = makeSelection();
    }
    const end = tab.buffer.insert(pos.y, pos.x, text);
    tab.cursor = end;
    tab.selection = makeSelection();
    this._touch(tab, options);
  }

  typeChar(ch) {
    const tab = this.activeTab;
    if (!tab || tab.readOnly) return;
    const next = tab.buffer.charAt(tab.cursor.y, tab.cursor.x);
    if (CLOSERS.has(ch) && next === ch && !hasSelection(tab.selection)) {
      tab.cursor.x++;
      this.autocomplete.hide();
      this.requestRender();
      return;
    }
    const canPair = !hasSelection(tab.selection) && (next === null || /[\s)\]}]/.test(next));
    const close = PAIRS[ch];
    if (close && canPair && !['"', "'", '`'].includes(ch) && this.config.bracketMatching) {
      this.insertText(ch + close);
      tab.cursor.x -= close.length;
      return;
    }
    if ((ch === '"' || ch === "'" || ch === '`') && canPair) {
      this.insertText(ch + ch);
      tab.cursor.x -= 1;
      return;
    }
    if (close && hasSelection(tab.selection)) {
      const selected = selectionText(tab.buffer, tab.selection);
      this.insertText(ch + selected + close, {});
      return;
    }
    this.insertText(ch);
  }

  newline() {
    const tab = this.activeTab;
    if (!tab || tab.readOnly) return;
    this._pushUndo(tab);
    if (hasSelection(tab.selection)) {
      const range = selectionRange(tab.selection);
      tab.buffer.deleteRange(range.start, range.end);
      tab.selection = makeSelection();
    }
    const y = tab.cursor.y, x = tab.cursor.x;
    const line = tab.buffer.line(y);
    const cps = tab.buffer.cps(y);
    const indent = (line.match(/^[\t ]*/) || [''])[0];
    const lang = LANGUAGES[tab.language];
    let extraIndent = '';
    const before = cps.slice(0, x).join('').trimEnd();
    const after = cps.slice(x).join('').trimStart();
    const opens = /[{([]$/.test(before);
    if (opens && lang) extraIndent = this._indentUnit();
    const unit = this._indentUnit();
    if (opens && after && /[}\])]/.test(after[0])) {
      tab.buffer.insert(y, x, '\n' + indent + unit + '\n' + indent);
      tab.cursor = { y: y + 1, x: (indent + unit).length };
    } else {
      const result = tab.buffer.insert(y, x, '\n' + indent + extraIndent);
      tab.cursor = result;
    }
    tab.selection = makeSelection();
    this._touch(tab, { autocomplete: false });
  }

  _indentUnit() {
    return this.config.indentStyle === 'tabs' ? '\t' : ' '.repeat(this.config.tabSize || 4);
  }

  backspace() {
    const tab = this.activeTab;
    if (!tab || tab.readOnly) return;
    this._pushUndo(tab);
    if (hasSelection(tab.selection)) {
      const range = selectionRange(tab.selection);
      tab.cursor = tab.buffer.deleteRange(range.start, range.end).position;
      tab.selection = makeSelection();
      this._touch(tab);
      return;
    }
    const y = tab.cursor.y, x = tab.cursor.x;
    const prev = tab.buffer.charAt(y, x - 1);
    const next = tab.buffer.charAt(y, x);
    if (prev && PAIRS[prev] === next && this.config.bracketMatching) {
      tab.buffer.deleteRange({ y, x: x - 1 }, { y, x: x + 1 });
      tab.cursor.x = x - 1;
    } else {
      const res = tab.buffer.backspace(y, x);
      tab.cursor = res.position;
    }
    this._touch(tab);
  }

  backspaceWord() {
    const tab = this.activeTab;
    if (!tab || tab.readOnly) return;
    this._pushUndo(tab);
    if (hasSelection(tab.selection)) return this.backspace();
    let { y, x } = tab.cursor;
    const cps = tab.buffer.cps(y);
    while (x > 0 && !isWordChar(cps[x - 1])) x--;
    while (x > 0 && isWordChar(cps[x - 1])) x--;
    tab.cursor = tab.buffer.deleteRange({ y, x }, { y, x: tab.cursor.x }).position;
    this._touch(tab);
  }

  deleteForward() {
    const tab = this.activeTab;
    if (!tab || tab.readOnly) return;
    this._pushUndo(tab);
    if (hasSelection(tab.selection)) {
      const range = selectionRange(tab.selection);
      tab.cursor = tab.buffer.deleteRange(range.start, range.end).position;
      tab.selection = makeSelection();
      this._touch(tab);
      return;
    }
    tab.cursor = tab.buffer.deleteChar(tab.cursor.y, tab.cursor.x).position;
    this._touch(tab);
  }

  deleteToEnd() {
    const tab = this.activeTab;
    if (!tab || tab.readOnly) return;
    this._pushUndo(tab);
    const len = tab.buffer.lineLength(tab.cursor.y);
    tab.buffer.deleteRange({ y: tab.cursor.y, x: tab.cursor.x }, { y: tab.cursor.y, x: len });
    this._touch(tab);
  }

  deleteToStart() {
    const tab = this.activeTab;
    if (!tab || tab.readOnly) return;
    this._pushUndo(tab);
    tab.buffer.deleteRange({ y: tab.cursor.y, x: 0 }, { y: tab.cursor.y, x: tab.cursor.x });
    tab.cursor.x = 0;
    this._touch(tab);
  }

  moveCursor(direction, extend = false, large = false) {
    const tab = this.activeTab;
    if (!tab) return;
    const b = tab.buffer;
    let c = { ...tab.cursor };
    const cps = b.cps(c.y);
    const page = Math.max(1, this.renderer.rows - 4);
    switch (direction) {
      case 'left':
        if (c.x > 0) c.x--;
        else if (c.y > 0) { c.y--; c.x = b.lineLength(c.y); }
        break;
      case 'right':
        if (c.x < cps.length) c.x++;
        else if (c.y < b.lineCount - 1) { c.y++; c.x = 0; }
        break;
      case 'up': c.y = Math.max(0, c.y - (large ? page : 1)); break;
      case 'down': c.y = Math.min(b.lineCount - 1, c.y + (large ? page : 1)); break;
      case 'home': {
        let target = 0;
        while (target < cps.length && (cps[target] === ' ' || cps[target] === '\t')) target++;
        c.x = c.x === target ? 0 : target;
        break;
      }
      case 'end': c.x = b.lineLength(c.y); break;
      case 'ctrlHome': c = { y: 0, x: 0 }; break;
      case 'ctrlEnd': c = { y: b.lineCount - 1, x: b.lineLength(b.lineCount - 1) }; break;
      case 'wordLeft': {
        let i = c.x;
        while (i > 0 && !isWordChar(cps[i - 1])) i--;
        while (i > 0 && isWordChar(cps[i - 1])) i--;
        c.x = i;
        break;
      }
      case 'wordRight': {
        let i = c.x;
        while (i < cps.length && isWordChar(cps[i])) i++;
        while (i < cps.length && !isWordChar(cps[i])) i++;
        c.x = i;
        break;
      }
    }
    c = clampCursor(c, b);
    if (extend) {
      if (!tab.selection.anchor) tab.selection = makeSelection(tab.cursor, c);
      else tab.selection.head = c;
    } else {
      tab.selection = makeSelection();
    }
    tab.cursor = c;
    this.autocomplete.hide();
    this._ensureVisible(tab);
    this.requestRender();
  }

  _moveWithSelection(dir, large) {
    this.moveCursor(dir, true, large);
  }

  _ensureVisible(tab) {
    const cols = this.renderer.cols;
    const rows = this.renderer.rows;
    const codeHeight = Math.max(1, rows - 3);
    const width = Math.max(1, cols - 8);
    const virtualY = this.config.wordWrap ? this.renderer.virtualRowFor(tab, width) : tab.cursor.y;
    if (virtualY < tab.scrollY) tab.scrollY = virtualY;
    if (virtualY >= tab.scrollY + codeHeight) tab.scrollY = virtualY - codeHeight + 1;
    const dispX = charWidth(tab.buffer.cps(tab.cursor.y).slice(0, tab.cursor.x).join(''));
    if (dispX < tab.scrollX) tab.scrollX = Math.max(0, dispX - 2);
    if (dispX >= tab.scrollX + width) tab.scrollX = dispX - width + 2;
    const maxScrollY = Math.max(0, this.renderer.virtualCount(tab, width) - codeHeight);
    tab.scrollY = Math.max(0, Math.min(tab.scrollY, maxScrollY));
    tab.scrollX = Math.max(0, tab.scrollX);
  }

  selectAll() {
    const tab = this.activeTab;
    if (!tab) return;
    tab.selection = makeSelection({ y: 0, x: 0 }, { y: tab.buffer.lineCount - 1, x: tab.buffer.lineLength(tab.buffer.lineCount - 1) });
    tab.cursor = { ...tab.selection.head };
    this.autocomplete.hide();
    this.requestRender();
  }

  copy() {
    const tab = this.activeTab;
    if (!tab) return;
    const text = selectionText(tab.buffer, tab.selection);
    if (!text) { this._setMessage('Nothing selected'); return; }
    this.clipboard = text;
    const b64 = Buffer.from(text, 'utf8').toString('base64');
    this.write(`\x1b]52;c;${b64}\x07`);
    this._setMessage(`Copied ${text.length} chars`);
  }

  cut() {
    const tab = this.activeTab;
    if (!tab || tab.readOnly) return;
    if (!hasSelection(tab.selection)) return;
    this.copy();
    this._pushUndo(tab);
    const range = selectionRange(tab.selection);
    tab.cursor = tab.buffer.deleteRange(range.start, range.end).position;
    tab.selection = makeSelection();
    this._touch(tab);
  }

  paste(text = this.clipboard) {
    if (!text) { this._setMessage('Clipboard empty'); return; }
    this._flushPasteFragment();
    const normalized = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    this.insertText(normalized, {});
    this.pasteGuardUntil = Date.now() + 300;
  }

  _fragmentChar(key) {
    if (!key) return null;
    if (key.name === 'char' && key.char) return key.char;
    if (key.name === 'space') return ' ';
    if (key.name === 'enter') return '\n';
    if (key.name === 'tab') return '\t';
    return null;
  }

  _collectPasteFragment(key) {
    const ch = this._fragmentChar(key);
    if (ch === null) return false;
    this.pasteFragment += ch;
    this.pasteGuardUntil = Date.now() + 300;
    if (this.pasteTimer) clearTimeout(this.pasteTimer);
    this.pasteTimer = setTimeout(() => {
      this.pasteTimer = null;
      this._flushPasteFragment();
    }, 80);
    this.pasteTimer.unref?.();
    return true;
  }

  _flushPasteFragment() {
    if (this.pasteTimer) { clearTimeout(this.pasteTimer); this.pasteTimer = null; }
    const text = this.pasteFragment;
    this.pasteFragment = '';
    if (!text) return;
    this.insertText(text.replace(/\r\n/g, '\n').replace(/\r/g, '\n'), {});
  }

  undo() {
    const tab = this.activeTab;
    if (!tab) return;
    const state = tab.history.undo({
      lines: tab.buffer.snapshot().lines, cursor: { ...tab.cursor },
      selection: makeSelection(tab.selection.anchor, tab.selection.head)
    });
    if (!state) { this._setMessage('Nothing to undo'); return; }
    this._restoreState(tab, state);
    tab.modified = true;
    tab.saveStatus = 'modified';
    this.autosave.schedule(tab);
  }

  redo() {
    const tab = this.activeTab;
    if (!tab) return;
    const state = tab.history.redo({
      lines: tab.buffer.snapshot().lines, cursor: { ...tab.cursor },
      selection: makeSelection(tab.selection.anchor, tab.selection.head)
    });
    if (!state) { this._setMessage('Nothing to redo'); return; }
    this._restoreState(tab, state);
    tab.modified = true;
    tab.saveStatus = 'modified';
    this.autosave.schedule(tab);
  }

  indent(outdent = false) {
    const tab = this.activeTab;
    if (!tab || tab.readOnly) return;
    this._pushUndo(tab);
    const b = tab.buffer;
    const unit = this._indentUnit();
    const sel = tab.selection;
    if (hasSelection(sel)) {
      const range = selectionRange(sel);
      for (let y = range.start.y; y <= range.end.y; y++) {
        const cps = b.cps(y);
        if (outdent) {
          let n = 0;
          while (n < cps.length && n < (this.config.tabSize || 4) && (cps[n] === ' ' || cps[n] === '\t')) n++;
          if (n) b.deleteRange({ y, x: 0 }, { y, x: n });
        } else b.insert(y, 0, unit);
      }
      tab.selection = makeSelection();
      this._touch(tab);
      return;
    }
    if (outdent) {
      const cps = b.cps(tab.cursor.y);
      let n = 0;
      while (n < cps.length && n < (this.config.tabSize || 4) && (cps[n] === ' ' || cps[n] === '\t')) n++;
      if (n) { b.deleteRange({ y: tab.cursor.y, x: 0 }, { y: tab.cursor.y, x: n }); tab.cursor.x = Math.max(0, tab.cursor.x - n); }
    } else {
      const res = b.insert(tab.cursor.y, tab.cursor.x, unit);
      tab.cursor = res;
      tab.selection = makeSelection();
    }
    this._touch(tab);
  }

  toggleComment() {
    const tab = this.activeTab;
    if (!tab || tab.readOnly) return;
    const lang = LANGUAGES[tab.language];
    const token = lang?.lineComment || (tab.language === 'python' || tab.language === 'bash' ? '#' : '//');
    if (!token) return;
    this._pushUndo(tab);
    const b = tab.buffer;
    const range = hasSelection(tab.selection) ? selectionRange(tab.selection) : { start: { y: tab.cursor.y }, end: { y: tab.cursor.y } };
    let minIndent = Infinity;
    for (let y = range.start.y; y <= range.end.y; y++) {
      const line = b.line(y);
      if (!line.trim()) continue;
      const m = line.match(/^[\t ]*/);
      minIndent = Math.min(minIndent, m ? m[0].length : 0);
    }
    if (!isFinite(minIndent)) minIndent = 0;
    const allCommented = Array.from({ length: range.end.y - range.start.y + 1 }, (_, i) => range.start.y + i)
      .filter(y => b.line(y).trim())
      .every(y => b.line(y).slice(minIndent, minIndent + token.length) === token);
    for (let y = range.start.y; y <= range.end.y; y++) {
      const line = b.line(y);
      if (!line.trim()) continue;
      if (allCommented) {
        let start = minIndent;
        if (b.line(y).slice(start, start + token.length) === token) {
          start += token.length;
          if (b.charAt(y, start) === ' ') start++;
          b.deleteRange({ y, x: minIndent }, { y, x: start });
        }
      } else {
        b.insert(y, minIndent, token + ' ');
      }
    }
    tab.cursor.x = Math.max(0, tab.cursor.x + (allCommented ? -(token.length + 1) : token.length + 1));
    tab.selection = makeSelection();
    this._touch(tab);
  }

  duplicateLine() {
    const tab = this.activeTab;
    if (!tab || tab.readOnly) return;
    this._pushUndo(tab);
    const b = tab.buffer;
    const range = hasSelection(tab.selection) ? selectionRange(tab.selection) : { start: { y: tab.cursor.y }, end: { y: tab.cursor.y } };
    const lines = [];
    for (let y = range.start.y; y <= range.end.y; y++) lines.push(b.line(y));
    const insertAt = range.end.y + 1;
    for (let i = 0; i < lines.length; i++) b.insertLine(insertAt + i, lines[i]);
    tab.cursor = { y: insertAt, x: Math.min(b.lineLength(insertAt), tab.cursor.x) };
    tab.selection = makeSelection();
    this._touch(tab);
  }

  deleteLine() {
    const tab = this.activeTab;
    if (!tab || tab.readOnly) return;
    this._pushUndo(tab);
    const b = tab.buffer;
    const range = hasSelection(tab.selection) ? selectionRange(tab.selection) : { start: { y: tab.cursor.y }, end: { y: tab.cursor.y } };
    for (let y = range.end.y; y >= range.start.y; y--) b.removeLine(y);
    tab.cursor = clampCursor({ y: range.start.y, x: 0 }, b);
    tab.selection = makeSelection();
    this._touch(tab);
  }

  moveLine(delta) {
    const tab = this.activeTab;
    if (!tab || tab.readOnly) return;
    const y = tab.cursor.y;
    const target = y + delta;
    if (target < 0 || target >= tab.buffer.lineCount) return;
    this._pushUndo(tab);
    const b = tab.buffer;
    const a = b.line(y), c = b.line(target);
    b.setLine(y, c);
    b.setLine(target, a);
    tab.cursor = { ...tab.cursor, y: target };
    this._touch(tab);
  }

  _findMatchingBracket(tab) {
    if (!this.settings.get('bracketMatching')) return null;
    const cps = tab.buffer.cps(tab.cursor.y);
    const pairs = { ')': '(', ']': '[', '}': '{', '(': ')', '[': ']', '{': '}' };
    const here = cps[tab.cursor.x];
    const before = cps[tab.cursor.x - 1];
    let bracket = null;
    if (here && pairs[here]) bracket = { ch: here, x: tab.cursor.x, dir: 'back' };
    else if (before && pairs[before]) bracket = { ch: before, x: tab.cursor.x - 1, dir: 'fwd' };
    if (!bracket) return null;
    const open = '{(['.includes(bracket.ch) ? bracket.ch : pairs[bracket.ch];
    const close = pairs[open];
    let depth = 0;
    if (bracket.dir === 'fwd') {
      for (let i = bracket.x; i < cps.length; i++) {
        if (cps[i] === open) depth++;
        else if (cps[i] === close) { depth--; if (depth === 0) return { y: tab.cursor.y, x: i }; }
      }
    } else {
      for (let i = bracket.x; i >= 0; i--) {
        if (cps[i] === close) depth++;
        else if (cps[i] === open) { depth--; if (depth === 0) return { y: tab.cursor.y, x: i }; }
      }
    }
    return null;
  }

  async save(tab = this.activeTab, options = {}) {
    if (!tab) return;
    if (!tab.filePath) { this.saveAs(); return; }
    if (tab.readOnly && !options.force) { this._setMessage('File is read-only — use Save As', 'warning'); return; }
    if (this.fileManager.isExternallyModified(tab) && !options.force) {
      this.conflictTab = tab;
      this._setMessage('File changed on disk — Alt+R reload, Alt+W overwrite', 'error', true);
      return;
    }
    const result = await this.autosave.flushOne(tab, 'manual', options);
    if (result.ok) this._setMessage(`Saved ${path.basename(tab.filePath)}`);
    else if (!result.conflict) this._setMessage(`Save failed: ${result.error}`, 'error');
    return result;
  }

  saveAs() {
    const tab = this.activeTab;
    if (!tab) return;
    this.prompt = {
      mode: 'saveas', title: 'Save As', value: tab.filePath || '',
      hint: 'Enter save · Esc cancel',
      onAccept: async (value) => {
        const target = resolvePath(value, this.fileManager.cwd);
        tab.filePath = target;
        tab.displayName = path.basename(target);
        tab.readOnly = false;
        tab.fingerprint = null;
        this.prompt = null;
        await this.save(tab, { force: true });
        this.requestRender();
      },
      onCancel: () => { this.prompt = null; }
    };
    this.requestRender();
  }

  async reload(tab = this.activeTab) {
    if (!tab?.filePath) return;
    const result = await this.fileManager.load(tab.filePath);
    if (!result.ok) { this._setMessage(result.error, 'error'); return; }
    tab.buffer.setText(result.text);
    tab.fingerprint = result.fingerprint;
    tab.readOnly = result.readOnly;
    tab.modified = false;
    tab.saveStatus = 'saved';
    tab.externalDirty = false;
    tab.history.clear();
    tab.cursor = clampCursor(tab.cursor, tab.buffer);
    this.conflictTab = null;
    this._setMessage('Reloaded from disk');
    this.requestRender();
  }

  async forceOverwrite(tab = this.conflictTab || this.activeTab) {
    if (!tab) return;
    const result = await this.autosave.flushOne(tab, 'force', { force: true, ignoreConflict: true });
    this.conflictTab = null;
    if (result.ok) this._setMessage(`Overwritten ${path.basename(tab.filePath)}`);
    else this._setMessage(`Overwrite failed: ${result.error}`, 'error');
    this.requestRender();
  }

  async openFilePrompt() {
    const tab = this.activeTab;
    this.prompt = {
      mode: 'open', title: 'Open File', value: tab?.filePath ? path.dirname(tab.filePath) + '/' : '',
      hint: 'Enter open · Tab complete · Esc cancel',
      completer: async (value) => {
        const dir = value.endsWith('/') ? value : path.dirname(value || '.');
        const base = value.endsWith('/') ? '' : path.basename(value);
        const list = await this.fileManager.listFiles(dir, 1, 60);
        return list.filter(p => p.startsWith(base)).slice(0, 12).map(p => ({ text: (dir === '.' ? '' : dir.replace(/\/$/, '') + '/') + p, value: (dir === '.' ? '' : dir.replace(/\/$/, '') + '/') + p }));
      },
      onAccept: async (value) => {
        if (!value) { this.prompt = null; return; }
        const resolved = resolvePath(value, this.fileManager.cwd);
        const existing = this.tabs.findByPath(resolved);
        if (existing) this.tabs.switchTo(this.tabs.indexOf(existing));
        else await this.openPaths([resolved]);
        this.prompt = null;
        this.requestRender();
      },
      onCancel: () => { this.prompt = null; }
    };
    this._refreshCompletions();
    this.requestRender();
  }

  async quickOpen() {
    this.prompt = {
      mode: 'picker', title: 'Quick File Picker', value: '',
      hint: 'Type to filter · Enter open · Esc cancel',
      completer: async (value) => {
        const list = await this.fileManager.listFiles('.', 5, 300);
        const q = value.toLowerCase();
        return list.filter(p => p.toLowerCase().includes(q)).slice(0, 12).map(p => ({ text: p, value: p }));
      },
      onAccept: async (value) => {
        const chosen = value || this.prompt?.items?.[this.prompt.selectedIndex]?.value;
        if (chosen) await this.openPaths([chosen]);
        this.prompt = null;
        this.requestRender();
      },
      onCancel: () => { this.prompt = null; }
    };
    this._refreshCompletions();
    this.requestRender();
  }

  async _refreshCompletions() {
    const p = this.prompt;
    if (!p?.completer) return;
    try {
      const items = await p.completer(p.value);
      if (this.prompt !== p) return;
      p.items = items || [];
      p.selectedIndex = 0;
    } catch { }
    this.requestRender();
  }

  findPrompt(replace = false) {
    const tab = this.activeTab;
    if (replace) {
      this.prompt = null;
      this.replaceState = {
        query: this.search.query || '', replacement: this.search.replacement || '',
        field: 'query', message: '', isError: false, options: { ...this.search.options }
      };
      this._updateReplaceSearch();
    } else {
      this.search.update(tab?.buffer.getText() || '', this.search.query || '');
      this.prompt = {
        mode: 'find', title: 'Find', value: this.search.query,
        hint: 'Enter next · ↑↓ navigate · c case · e regex · Esc close',
        onAccept: () => {
          const m = this.search.next();
          if (m) this._gotoMatch(m);
          this.prompt = null;
          this.requestRender();
        },
        onCancel: () => { this.prompt = null; this.search.matches = []; }
      };
    }
    this.requestRender();
  }

  _updateReplaceSearch() {
    const rs = this.replaceState;
    const tab = this.activeTab;
    if (!rs || !tab) return;
    this.search.update(tab.buffer.getText(), rs.query, this.search.options);
    rs.message = this.search.error ? this.search.error : `${this.search.matches.length} match${this.search.matches.length === 1 ? '' : 'es'}`;
    rs.isError = !!this.search.error;
    const m = this.search.current();
    if (m) this._gotoMatch(m, false);
    this.requestRender();
  }

  _gotoMatch(match, render = true) {
    const tab = this.activeTab;
    if (!tab || !match) return;
    tab.cursor = { ...match.start };
    tab.selection = makeSelection(match.start, match.end);
    this._ensureVisible(tab);
    if (render) this.requestRender();
  }

  replaceCurrent() {
    const tab = this.activeTab;
    const rs = this.replaceState;
    if (!tab || !rs || tab.readOnly) return;
    const match = this.search.current();
    if (!match) { rs.message = 'No matches'; rs.isError = true; this.requestRender(); return; }
    this._pushUndo(tab);
    const text = tab.buffer.getText();
    const before = text.slice(0, this._utf16Index(tab.buffer, match.start));
    const after = text.slice(this._utf16Index(tab.buffer, match.end));
    let rep = rs.replacement;
    if (this.search.options.regex && rep.includes('$')) {
      rep = rep.replace(/\$(\d)/g, (_, d) => match.groups?.[Number(d) - 1] ?? '');
    }
    tab.buffer.setText(before + rep + after);
    tab.cursor = { ...match.start };
    tab.selection = makeSelection();
    this._touch(tab);
    this._updateReplaceSearch();
  }

  _utf16Index(buffer, pos) {
    let idx = 0;
    for (let y = 0; y < pos.y; y++) { idx += buffer.line(y).length + 1; }
    idx += Array.from(buffer.line(pos.y)).slice(0, pos.x).join('').length;
    return idx;
  }

  replaceAll() {
    const tab = this.activeTab;
    const rs = this.replaceState;
    if (!tab || !rs || tab.readOnly) return;
    this._pushUndo(tab);
    const result = this.search.replaceAll(tab.buffer.getText(), rs.replacement);
    if (result.error) { rs.message = result.error; rs.isError = true; this.requestRender(); return; }
    tab.buffer.setText(result.text);
    tab.cursor = clampCursor(tab.cursor, tab.buffer);
    tab.selection = makeSelection();
    this._touch(tab);
    rs.message = `Replaced ${result.count} occurrence${result.count === 1 ? '' : 's'}`;
    this.requestRender();
  }

  gotoLinePrompt() {
    this.prompt = {
      mode: 'goto', title: 'Go to Line', value: '',
      hint: 'Enter jump · Esc cancel',
      onAccept: (value) => {
        const n = parseInt(value, 10);
        if (!Number.isFinite(n)) { this.prompt.message = 'Enter a line number'; this.prompt.isError = true; this.requestRender(); return; }
        const tab = this.activeTab;
        if (!tab) return;
        tab.cursor = clampCursor({ y: n - 1, x: 0 }, tab.buffer);
        tab.selection = makeSelection();
        this._ensureVisible(tab);
        this.prompt = null;
        this.requestRender();
      },
      onCancel: () => { this.prompt = null; }
    };
    this.requestRender();
  }

  changeLanguage() {
    const tab = this.activeTab;
    if (!tab) return;
    this.overlay = {
      type: 'language', title: ' Set Language ',
      items: listLanguages().map(l => ({ label: l.name, detail: l.id, value: l.id, swatch: this.theme.type })),
      index: Math.max(0, listLanguages().findIndex(l => l.id === tab.language)),
      onSelect: (id) => {
        tab.language = resolveLanguage(id) || id;
        this.overlay = null;
        this.autocomplete.clearCache?.();
        this.renderer.reset();
        this._setMessage(`Language: ${languageName(tab.language)}`);
        this.requestRender();
      },
      onCancel: () => { this.overlay = null; }
    };
    this.requestRender();
  }

  themePicker() {
    const items = listThemes(this.settings.customThemes).map(t => {
      const theme = getTheme(t.id, this.settings.customThemes);
      return {
        label: theme.name, detail: t.builtin ? 'built-in' : 'custom', value: t.id,
        swatch: theme.keyword, swatch2: theme.string, swatch3: theme.function
      };
    });
    const current = this.settings.get('theme');
    this.overlay = {
      type: 'theme', title: ' Color Themes — ↑↓ select · Enter apply · n new · e export · i import ',
      items, index: Math.max(0, items.findIndex(i => i.value === current)),
      onSelect: (id) => {
        this.settings.set('theme', id);
        this.applyTheme();
        this.overlay = null;
        this._setMessage(`Theme: ${getTheme(id, this.settings.customThemes).name}`);
        this.requestRender();
      },
      onCancel: () => { this.overlay = null; }
    };
    this.requestRender();
  }

  applyTheme() {
    this.theme = getTheme(this.settings.get('theme'), this.settings.customThemes);
    this.renderer.setTheme(this.theme);
    this.renderer.reset();
  }

  settingsPanel() {
    const defs = [
      { key: 'theme', label: 'Theme', type: 'theme' },
      { key: 'font', label: 'Font preference', type: 'font' },
      { key: 'fontSize', label: 'Font size', type: 'info' },
      { key: 'lineNumbers', label: 'Line numbers', type: 'bool' },
      { key: 'relativeLineNumbers', label: 'Relative line numbers', type: 'bool' },
      { key: 'cursorLine', label: 'Active line highlight', type: 'bool' },
      { key: 'cursorStyle', label: 'Cursor style', type: 'enum', values: ['block', 'underline', 'bar'] },
      { key: 'syntaxHighlighting', label: 'Syntax highlighting', type: 'bool' },
      { key: 'wordWrap', label: 'Word wrap', type: 'bool' },
      { key: 'tabSize', label: 'Tab width', type: 'number', min: 1, max: 16 },
      { key: 'indentStyle', label: 'Indent style', type: 'enum', values: ['spaces', 'tabs'] },
      { key: 'autoSave', label: 'Auto save', type: 'bool' },
      { key: 'autoSaveDelay', label: 'Auto save delay (ms)', type: 'number', min: 100, max: 60000, step: 100 },
      { key: 'autoSaveOnFocusLost', label: 'Save on focus lost', type: 'bool' },
      { key: 'autoSaveOnTabSwitch', label: 'Save on tab switch', type: 'bool' },
      { key: 'autoSaveOnExit', label: 'Save on exit', type: 'bool' },
      { key: 'autocomplete', label: 'Autocomplete', type: 'bool' },
      { key: 'bracketMatching', label: 'Bracket matching', type: 'bool' },
      { key: 'showWhitespace', label: 'Show whitespace', type: 'bool' },
      { key: 'highlightTrailingWhitespace', label: 'Trailing spaces', type: 'bool' }
    ];
    const buildItems = () => defs.map(d => {
      const value = this.settings.get(d.key);
      return {
        label: d.label, detail: String(value), value: d,
        swatch: typeof value === 'boolean' ? (value ? this.theme.string : this.theme.comment) : this.theme.type
      };
    });
    this.overlay = {
      type: 'settings', title: ' AMO Settings — ↑↓ select · ←→/Enter change · Esc close ',
      items: buildItems(), index: 0,
      refresh: () => { this.overlay.items = buildItems(); },
      onSelect: (d) => this._changeSetting(d, 0),
      onAdjust: (d, delta) => this._changeSetting(d, delta),
      onCancel: () => { this.overlay = null; this.requestRender(); }
    };
    this.requestRender();
  }

  _changeSetting(def, delta) {
    const cfg = this.config;
    const current = cfg[def.key];
    let value;
    if (def.type === 'bool') value = delta === 0 ? !current : (delta > 0 ? true : false);
    else if (def.type === 'enum') {
      const i = def.values.indexOf(current);
      value = def.values[(i + (delta || 1) + def.values.length) % def.values.length];
    } else if (def.type === 'number') {
      value = clamp(Number(current) + (delta || def.step || 1) * (delta === 0 ? 1 : 1), def.min, def.max);
    } else if (def.type === 'theme') { this.themePicker(); return; }
    else if (def.type === 'font') { this.fontInfo(); return; }
    else return;
    const res = this.settings.set(def.key, value);
    if (res.ok) {
      if (def.key === 'theme') this.applyTheme();
      if (def.key === 'syntaxHighlighting') this.renderer.reset();
      this.overlay.refresh?.();
      this._setMessage(`${def.label}: ${value}`);
    } else this._setMessage(res.error, 'error');
    this.requestRender();
  }

  fontInfo() {
    this.overlay = {
      type: 'font', title: ' Font Information ',
      items: [
        ...SUGGESTED_FONTS.map(f => ({ label: f, detail: this.config.font === f ? 'preferred' : '', value: f, swatch: this.theme.type })),
        { label: 'terminal-default', detail: this.config.font === 'terminal-default' ? 'preferred' : '', value: 'terminal-default', swatch: this.theme.comment }
      ],
      index: 0,
      onSelect: (font) => {
        this.settings.set('font', font);
        this.overlay = null;
        this._setMessage(`Preference saved: ${font} (terminal font unchanged)`);
        this.requestRender();
      },
      onCancel: () => { this.overlay = null; this.requestRender(); }
    };
    this.requestRender();
  }

  commandPrompt() {
    this.prompt = {
      mode: 'command', title: 'Command', value: '',
      hint: 'Enter run · Esc cancel',
      completer: (value) => {
        const q = value.toLowerCase();
        return COMMANDS.filter(c => c.name.includes(q) || c.detail.toLowerCase().includes(q))
          .slice(0, 12).map(c => ({ text: c.name, detail: c.detail, value: c.name }));
      },
      onAccept: (value) => {
        const cmd = (value || this.prompt?.items?.[this.prompt.selectedIndex]?.value || '').trim().toLowerCase();
        this.prompt = null;
        this.runCommand(cmd);
        this.requestRender();
      },
      onCancel: () => { this.prompt = null; }
    };
    this._refreshCompletions();
    this.requestRender();
  }

  runCommand(cmd) {
    switch (cmd) {
      case 'theme': this.themePicker(); break;
      case 'settings': this.settingsPanel(); break;
      case 'lang': this.changeLanguage(); break;
      case 'font': this.fontInfo(); break;
      case 'saveas': this.saveAs(); break;
      case 'reload': this.reload(); break;
      case 'closeall': this.closeAll(); break;
      case 'new': this.newFile(); break;
      case 'help': this.helpOverlay(); break;
      case 'about': this._setMessage(`AMO Editor 1.0.0 · Node ${process.version} · ${this.tabs.count} tab(s)`); break;
      default: if (cmd) this._setMessage(`Unknown command: ${cmd}`, 'error');
    }
  }

  helpOverlay() {
    const items = [
      { label: 'Ctrl+S / Ctrl+Shift+S', detail: 'Save / Save As' },
      { label: 'Ctrl+O / Ctrl+N / Ctrl+W', detail: 'Open / New / Close' },
      { label: 'Ctrl+Z / Ctrl+Y', detail: 'Undo / Redo' },
      { label: 'Ctrl+F / Ctrl+H / Ctrl+G', detail: 'Find / Replace / Go to line' },
      { label: 'Ctrl+P / Ctrl+/', detail: 'File picker / Toggle comment' },
      { label: 'Ctrl+D / Ctrl+L', detail: 'Duplicate / Delete line' },
      { label: 'Alt+↑ / Alt+↓', detail: 'Move line up / down' },
      { label: 'Alt+T / Alt+S / Alt+L', detail: 'Theme / Settings / Language' },
      { label: 'Alt+R / Alt+W', detail: 'Reload / Force overwrite after conflict' },
      { label: 'Ctrl+Q', detail: 'Quit' },
      { label: 'Shift+Arrows', detail: 'Select text' },
      { label: 'Tab / Shift+Tab', detail: 'Indent / Outdent (accept suggestion)' }
    ].map(i => ({ ...i, value: null, swatch: this.theme.function }));
    this.overlay = {
      type: 'help', title: ' AMO Help — Esc close ', items, index: 0,
      onSelect: () => { }, onCancel: () => { this.overlay = null; this.requestRender(); }
    };
    this.requestRender();
  }

  newFile() {
    this.tabs.addUntitled('');
    this.autocomplete.noteBuffer(this.activeTab.buffer);
    this._setMessage('New file');
    this.requestRender();
  }

  async closeTab(force = false) {
    const tab = this.activeTab;
    if (!tab) return;
    if (tab.modified && !force) {
      if (this.config.autoSave && tab.filePath) {
        await this.autosave.flushOne(tab, 'close');
        if (!tab.modified) { this._removeTab(); return; }
      }
      this.prompt = {
        mode: 'confirm', title: 'Unsaved changes', value: '',
        hint: `Close ${tab.displayName} anyway? [y/N]`,
        onAccept: () => { this.prompt = null; this.closeTab(true); },
        onCancel: () => { this.prompt = null; this.requestRender(); }
      };
      this.requestRender();
      return;
    }
    this._removeTab();
  }

  _removeTab() {
    const tab = this.tabs.close();
    if (tab) { this.autosave.cancel(tab); this.recovery.checkpoint(tab); }
    if (!this.tabs.count) this.tabs.addUntitled('');
    this.renderer.reset();
    this.requestRender();
  }

  async closeAll(force = false) {
    const modified = this.tabs.tabs.filter(t => t.modified);
    if (!force && modified.length) {
      if (this.config.autoSave) await this.autosave.flushAll(modified, 'close-all');
      if (this.tabs.tabs.some(t => t.modified)) {
        this.prompt = {
          mode: 'confirm', title: 'Unsaved changes', value: '',
          hint: 'Some files are unsaved. Close all anyway? [y/N]',
          onAccept: () => { this.prompt = null; this.closeAll(true); },
          onCancel: () => { this.prompt = null; this.requestRender(); }
        };
        this.requestRender();
        return;
      }
    }
    for (const tab of this.tabs.tabs) this.autosave.cancel(tab);
    this.tabs.closeAll();
    this.tabs.addUntitled('');
    this.renderer.reset();
    this._setMessage('All tabs closed');
  }

  switchTab(delta) {
    if (!this.tabs.switchRelative(delta)) return;
    const prev = this.activeTab;
    if (prev && this.config.autoSaveOnTabSwitch) this.autosave.trigger(prev, 'tab-switch');
    this._checkExternal(this.activeTab);
    this.autocomplete.hide();
    this.renderer.reset();
    this.requestRender();
  }

  _checkExternal(tab) {
    if (!tab || !this.fileManager.isExternallyModified(tab) || tab.externalDirty) return;
    tab.externalDirty = true;
    this._setMessage(`${tab.displayName} changed on disk — Alt+R to reload`, 'warning');
  }

  async quit(force = false) {
    const tabs = this.tabs.tabs.filter(t => t.modified);
    if (!force && tabs.length) {
      if (this.config.autoSaveOnExit) {
        await this.autosave.flushAll(tabs, 'exit');
      }
      const remaining = this.tabs.tabs.filter(t => t.modified);
      if (!remaining.length) { this._doQuit(); return; }
      this.prompt = {
        mode: 'confirm', title: 'Unsaved changes', value: '',
        hint: `${remaining.length} file(s) unsaved. Quit anyway? [y/N]`,
        onAccept: () => { this.prompt = null; this.quit(true); },
        onCancel: () => { this.prompt = null; this.requestRender(); }
      };
      this.requestRender();
      return;
    }
    this._doQuit();
  }

  async _doQuit() {
    if (this.config.autoSaveOnExit) await this.autosave.flushAll(this.tabs.tabs, 'exit');
    for (const tab of this.tabs.tabs) if (tab.modified) this.recovery.checkpoint(tab);
    this.autosave.destroy();
    this.recovery.cleanExit();
    this.stopped = true;
    if (this.terminal) this.terminal.stop(true);
    else this.write(RESTORE_SEQUENCE);
    if (this.onQuit) this.onQuit();
  }

  handleKey(key) {
    if (!key) return;
    this.lastKey = key;
    if (this.stopped) return;

    if (key.name === 'focusout') {
      if (this.config.autoSaveOnFocusLost && this.activeTab) this.autosave.trigger(this.activeTab, 'focus');
      return;
    }
    if (key.name === 'focusin') return;

    if (this.overlay) return this._handleOverlayKey(key);
    if (this.replaceState) return this._handleReplaceKey(key);
    if (this.prompt) return this._handlePromptKey(key);

    if (Date.now() < this.pasteGuardUntil || this.pasteFragment) {
      if (this._collectPasteFragment(key)) return;
      this._flushPasteFragment();
    }

    if (key.name === 'ctrl+c' && !hasSelection(this.activeTab?.selection)) {
      this._setMessage('Use Ctrl+Q to quit · Esc closes prompts');
      return;
    }

    const ac = this.autocomplete;
    if (ac.visible && ac.suggestions.length && !hasSelection(this.activeTab?.selection)) {
      if (key.name === 'down') { ac.next(); this.requestRender(); return; }
      if (key.name === 'up') { ac.previous(); this.requestRender(); return; }
      if (key.name === 'escape') { ac.hide(); this.requestRender(); return; }
      if (key.name === 'tab' && !key.ctrl) { this._acceptSuggestion(); return; }
      if (key.name === 'enter' && ac.navigated) { this._acceptSuggestion(); return; }
    }

    const name = key.name;
    if (key.shift && ['left', 'right', 'up', 'down', 'home', 'end', 'pageup', 'pagedown'].includes(name)) {
      this._moveWithSelection(name === 'pageup' ? 'up' : name === 'pagedown' ? 'down' : name, name === 'pageup' || name === 'pagedown');
      return;
    }

    if (key.alt && !key.ctrl) {
      const alt = name;
      if (alt === 't') { this.themePicker(); return; }
      if (alt === 's') { this.settingsPanel(); return; }
      if (alt === 'l') { this.changeLanguage(); return; }
      if (alt === 'r') { this.reload(); return; }
      if (alt === 'w') { this.forceOverwrite(); return; }
      if (alt === 'f') { this.fontInfo(); return; }
      if (alt === 'v') { this.paste(); return; }
    }
    if (name === 'ctrl+alt+s' || (key.ctrl && key.alt && name === 's')) { this.saveAs(); return; }
    if (name === 'f3') { if (this.search.matches.length) this._gotoMatch(key.shift ? this.search.previous() : this.search.next()); return; }

    const action = resolveAction(key);
    if (action) { this._dispatchAction(action, key); return; }

    if (name === 'char' && key.char && !key.ctrl && !key.alt) {
      const now = Date.now();
      this.recentCharTimes = this.recentCharTimes.filter(t => now - t < 60);
      if (key.char === ':' && this.recentCharTimes.length < 2) {
        this.commandPrompt();
        return;
      }
      this.recentCharTimes.push(now);
      this.typeChar(key.char);
      return;
    }
    if (name === 'space') { this.typeChar(' '); return; }
  }

  _acceptSuggestion() {
    const item = this.autocomplete.accept();
    if (!item) return;
    const tab = this.activeTab;
    if (!tab) return;
    let text = item.insertText || item.text;
    const line = tab.buffer.line(tab.cursor.y);
    const word = tab.buffer.getWord(tab.cursor.y, tab.cursor.x);
    if (!item.insertText && word.end > word.start) {
      const cps = tab.buffer.cps(tab.cursor.y);
      tab.buffer.deleteRange({ y: tab.cursor.y, x: word.start }, { y: tab.cursor.y, x: word.end });
      tab.cursor = { ...tab.cursor, x: word.start };
      void cps;
      void line;
    }
    this.insertText(text, { autocomplete: false });
    if (text.includes('${')) this._expandSnippet(text);
    this.autocomplete.hide();
    this.requestRender();
  }

  _expandSnippet(text) {
    const tab = this.activeTab;
    if (!tab) return;
    const first = text.indexOf('${');
    if (first === -1) return;
    const end = text.indexOf('}', first);
    if (end === -1) return;
    const placeholder = text.slice(first + 2, end).replace(/^\d+:/, '');
    const startX = tab.cursor.x - Array.from(text.slice(end + 1)).length;
    const targetX = startX + Array.from(text.slice(0, first)).length;
    tab.cursor = { ...tab.cursor, x: targetX };
    tab.selection = makeSelection(tab.cursor, { ...tab.cursor, x: targetX + placeholder.length });
    this.requestRender();
  }

  _dispatchAction(action, key) {
    void key;
    switch (action) {
      case 'save': this.save(); break;
      case 'saveAs': this.saveAs(); break;
      case 'open': this.openFilePrompt(); break;
      case 'new': this.newFile(); break;
      case 'close': this.closeTab(); break;
      case 'quit': this.quit(); break;
      case 'undo': this.undo(); break;
      case 'redo': this.redo(); break;
      case 'find': this.findPrompt(false); break;
      case 'replace': this.findPrompt(true); break;
      case 'quickOpen': this.quickOpen(); break;
      case 'gotoLine': this.gotoLinePrompt(); break;
      case 'selectAll': this.selectAll(); break;
      case 'copy': this.copy(); break;
      case 'cut': this.cut(); break;
      case 'paste': this.paste(key.text || this.clipboard); break;
      case 'toggleComment': this.toggleComment(); break;
      case 'nextTab': this.switchTab(1); break;
      case 'prevTab': this.switchTab(-1); break;
      case 'duplicateLine': this.duplicateLine(); break;
      case 'deleteLine': this.deleteLine(); break;
      case 'moveLineUp': this.moveLine(-1); break;
      case 'moveLineDown': this.moveLine(1); break;
      case 'indent': this.indent(); break;
      case 'outdent': this.indent(true); break;
      case 'newline': this.newline(); break;
      case 'backspace': this.backspace(); break;
      case 'backspaceWord': this.backspaceWord(); break;
      case 'delete': this.deleteForward(); break;
      case 'deleteToEnd': this.deleteToEnd(); break;
      case 'deleteToStart': this.deleteToStart(); break;
      case 'up': this.moveCursor('up'); break;
      case 'down': this.moveCursor('down'); break;
      case 'left': this.moveCursor('left'); break;
      case 'right': this.moveCursor('right'); break;
      case 'wordLeft': this.moveCursor('wordLeft'); break;
      case 'wordRight': this.moveCursor('wordRight'); break;
      case 'home': this.moveCursor('home'); break;
      case 'end': this.moveCursor('end'); break;
      case 'pageUp': this.moveCursor('up', false, true); break;
      case 'pageDown': this.moveCursor('down', false, true); break;
      case 'ctrlHome': this.moveCursor('ctrlHome'); break;
      case 'ctrlEnd': this.moveCursor('ctrlEnd'); break;
      case 'cancel': if (this.search.matches.length) this.search.matches = []; break;
      default: break;
    }
  }

  _handlePromptKey(key) {
    const p = this.prompt;
    if (!p) return;
    if (key.name === 'paste' && key.text) {
      p.value = (p.value || '') + key.text.replace(/[\r\n]+/g, ' ');
      if (p.mode === 'find') this._liveFind();
      this._refreshCompletions();
      this.requestRender();
      return;
    }
    if (key.name === 'escape') {
      if (p.mode === 'picker' || p.mode === 'open' || p.mode === 'saveas' || p.mode === 'command') {
        p.onCancel?.();
      } else {
        this.prompt = null;
        this.search.matches = [];
      }
      this.requestRender();
      return;
    }
    if (key.name === 'enter') {
      if (p.mode === 'confirm') {
        if ((p.value || '').toLowerCase() === 'y') p.onAccept?.();
        else p.onCancel?.();
      } else p.onAccept?.(p.value);
      return;
    }
    if (key.name === 'up' || key.name === 'down') {
      if (p.items?.length) {
        p.selectedIndex = (p.selectedIndex + (key.name === 'down' ? 1 : -1) + p.items.length) % p.items.length;
        if (p.mode === 'find') {
          const m = key.name === 'down' ? this.search.next() : this.search.previous();
          if (m) this._gotoMatch(m, false);
        }
        this.requestRender();
      } else if (p.mode === 'find' && this.search.matches.length) {
        const m = key.name === 'down' ? this.search.next() : this.search.previous();
        if (m) this._gotoMatch(m);
      }
      return;
    }
    if (key.name === 'tab' && p.items?.length) {
      const item = p.items[p.selectedIndex || 0];
      if (item) { p.value = item.value || item.text || ''; this._refreshCompletions(); }
      return;
    }
    if (key.name === 'backspace') {
      p.value = Array.from(p.value || '').slice(0, -1).join('');
      if (p.mode === 'find') this._liveFind();
      this._refreshCompletions();
      this.requestRender();
      return;
    }
    if (key.name === 'left' || key.name === 'right' || key.name === 'home' || key.name === 'end') return;
    if (p.mode === 'confirm') {
      if (/^[yn]$/i.test(key.char || '')) {
        p.value = key.char;
        if (key.char.toLowerCase() === 'n') p.onCancel?.();
        else p.onAccept?.();
      }
      return;
    }
    if (key.name === 'char' && key.char && !key.ctrl && !key.alt) {
      p.value = (p.value || '') + key.char;
      if (p.mode === 'find') this._liveFind();
      this._refreshCompletions();
      this.requestRender();
      return;
    }
    if (key.name === 'space') {
      p.value = (p.value || '') + ' ';
      if (p.mode === 'find') this._liveFind();
      this._refreshCompletions();
      this.requestRender();
    }
  }

  _liveFind() {
    const tab = this.activeTab;
    if (!tab || !this.prompt) return;
    this.search.update(tab.buffer.getText(), this.prompt.value);
    const m = this.search.current();
    if (m) this._gotoMatch(m, false);
    this.prompt.message = this.search.error ? this.search.error : `${this.search.matches.length} match(es)`;
    this.prompt.isError = !!this.search.error;
  }

  _handleReplaceKey(key) {
    const rs = this.replaceState;
    if (key.name === 'paste' && key.text) {
      const clean = key.text.replace(/[\r\n]+/g, ' ');
      if (rs.field === 'query') rs.query += clean;
      else rs.replacement += clean;
      this._updateReplaceSearch();
      return;
    }
    if (key.name === 'escape') {
      this.replaceState = null;
      this.search.matches = [];
      this.requestRender();
      return;
    }
    if (key.name === 'tab') {
      rs.field = rs.field === 'query' ? 'replacement' : 'query';
      this.requestRender();
      return;
    }
    if (key.name === 'enter' || key.name === 'f3') {
      const m = key.name === 'f3' && key.shift ? this.search.previous() : this.search.next();
      if (m) this._gotoMatch(m);
      return;
    }
    if (key.alt && ['c', 'e', 'y', 'a'].includes(key.name)) {
      if (key.name === 'c') this.search.options.caseSensitive = !this.search.options.caseSensitive;
      else if (key.name === 'e') this.search.options.regex = !this.search.options.regex;
      else if (key.name === 'y') { this.replaceCurrent(); return; }
      else if (key.name === 'a') { this.replaceAll(); return; }
      this._updateReplaceSearch();
      return;
    }
    if (key.name === 'char' && !key.ctrl && !key.alt) {
      const ch = key.char;
      if (rs.field === 'query') rs.query += ch;
      else rs.replacement += ch;
      this._updateReplaceSearch();
      return;
    }
    if (key.name === 'space') {
      if (rs.field === 'query') rs.query += ' ';
      else rs.replacement += ' ';
      this._updateReplaceSearch();
      return;
    }
    if (key.name === 'backspace') {
      if (rs.field === 'query') rs.query = rs.query.slice(0, -1);
      else rs.replacement = rs.replacement.slice(0, -1);
      this._updateReplaceSearch();
    }
  }

  _handleOverlayKey(key) {
    const o = this.overlay;
    if (key.name === 'escape') { o.onCancel?.(); return; }
    if (key.name === 'up') { o.index = (o.index - 1 + o.items.length) % o.items.length; this.requestRender(); return; }
    if (key.name === 'down') { o.index = (o.index + 1) % o.items.length; this.requestRender(); return; }
    if (key.name === 'left' || key.name === 'right') {
      const item = o.items[o.index];
      if (item && o.onAdjust) o.onAdjust(item.value, key.name === 'right' ? 1 : -1);
      else this.requestRender();
      return;
    }
    if (key.name === 'enter') {
      const item = o.items[o.index];
      if (item && o.onSelect) o.onSelect(item.value);
      else o.onCancel?.();
      return;
    }
    if (o.type === 'theme') {
      if (key.name === 'char' && key.char === 'n') { this._newThemePrompt(); return; }
      if (key.name === 'char' && key.char === 'e') { this._exportThemePrompt(); return; }
      if (key.name === 'char' && key.char === 'i') { this._importThemePrompt(); return; }
    }
  }

  _newThemePrompt() {
    const base = this.theme;
    this.overlay = null;
    this.prompt = {
      mode: 'newtheme', title: 'New Theme Name', value: '',
      hint: 'Enter create · Esc cancel',
      onAccept: (name) => {
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (!id) { this._setMessage('Invalid theme name', 'error'); return; }
        const colors = { ...base };
        delete colors.id; delete colors.name; delete colors.description;
        const res = this.settings.saveCustomTheme(id, { ...colors, name, description: 'Custom theme' });
        this.prompt = null;
        if (res.ok) { this.settings.set('theme', id); this.applyTheme(); this._setMessage(`Created theme ${id}`); }
        else this._setMessage(res.error, 'error');
        this.requestRender();
      },
      onCancel: () => { this.prompt = null; this.requestRender(); }
    };
    this.requestRender();
  }

  _exportThemePrompt() {
    const item = this.overlay.items[this.overlay.index];
    const exported = this.settings.exportTheme(item.value);
    if (!exported.ok) { this._setMessage(exported.error, 'error'); return; }
    this.overlay = null;
    this.prompt = {
      mode: 'export', title: 'Export Theme (JSON)', value: exported.json.slice(0, 120) + '…',
      hint: 'Full JSON copied to clipboard · Esc close',
      onAccept: () => { this.prompt = null; }, onCancel: () => { this.prompt = null; this.requestRender(); }
    };
    this.clipboard = exported.json;
    this.write(`\x1b]52;c;${Buffer.from(exported.json).toString('base64')}\x07`);
    this.requestRender();
  }

  _importThemePrompt() {
    this.overlay = null;
    this.prompt = {
      mode: 'import', title: 'Import Theme (JSON or path)', value: '',
      hint: 'Enter import · Esc cancel',
      onAccept: (value) => {
        const res = this.settings.importTheme(value);
        this.prompt = null;
        if (res.ok) { this.applyTheme(); this._setMessage('Theme imported'); }
        else this._setMessage(res.error, 'error');
        this.requestRender();
      },
      onCancel: () => { this.prompt = null; this.requestRender(); }
    };
    this.requestRender();
  }
}

export function createEditor(options) { return new Editor(options); }
