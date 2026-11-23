import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Editor } from '../src/editor/editor.js';
import { Settings } from '../src/editor/settings.js';
import { getTheme } from '../src/editor/themes.js';
import { stringWidth } from '../src/editor/util.js';

const wait = ms => new Promise(r => setTimeout(r, ms));

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'amo-editor-')); }

async function makeEditor(paths = [], options = {}) {
  const dir = tmp();
  const settings = new Settings(dir);
  settings.values.autoSaveDelay = 80;
  const chunks = [];
  const editor = new Editor({
    settings, noTerminal: true, write: s => chunks.push(s), ...options
  });
  await editor.start(paths);
  editor.render();
  return { editor, chunks, dir, settings };
}

function type(editor, text) {
  for (const ch of text) editor.handleKey({ name: 'char', char: ch });
}
function key(editor, name, extra = {}) { editor.handleKey({ name, ...extra }); }
function ctrl(editor, letter, extra = {}) { editor.handleKey({ name: `ctrl+${letter}`, ctrl: true, ...extra }); }

test('amo with no arguments opens an empty editor', async () => {
  const { editor } = await makeEditor();
  assert.equal(editor.tabs.count, 1);
  assert.equal(editor.activeTab.buffer.getText(), '');
  assert.equal(editor.activeTab.filePath, null);
});

test('amo filename opens file content and detects language', async () => {
  const dir = tmp();
  const file = path.join(dir, 'main.go');
  fs.writeFileSync(file, 'package main\n');
  const { editor } = await makeEditor([file]);
  assert.equal(editor.activeTab.buffer.getText(), 'package main\n');
  assert.equal(editor.activeTab.language, 'go');
  assert.equal(editor.activeTab.displayName, 'main.go');
});

test('multiple files open in separate tabs and preserve cursor position', async () => {
  const dir = tmp();
  const a = path.join(dir, 'a.txt');
  const b = path.join(dir, 'b.py');
  fs.writeFileSync(a, 'alpha');
  fs.writeFileSync(b, 'beta\ngamma');
  const { editor } = await makeEditor([a, b]);
  assert.equal(editor.tabs.count, 2);
  assert.equal(editor.activeTab.displayName, 'b.py');
  editor.activeTab.cursor = { y: 1, x: 2 };
  ctrl(editor, 'tab');
  assert.equal(editor.activeTab.displayName, 'a.txt');
  ctrl(editor, 'tab');
  assert.deepEqual(editor.activeTab.cursor, { y: 1, x: 2 });
});

test('nonexistent file can be created, edited and saved', async () => {
  const dir = tmp();
  const file = path.join(dir, 'new.js');
  const { editor } = await makeEditor([file]);
  assert.equal(editor.activeTab.buffer.getText(), '');
  type(editor, 'const x = 1;');
  ctrl(editor, 's');
  await wait(60);
  assert.equal(fs.readFileSync(file, 'utf8'), 'const x = 1;');
  assert.equal(editor.activeTab.modified, false);
});

test('typing, backspace, word deletion and undo/redo', async () => {
  const { editor } = await makeEditor();
  type(editor, 'abcdef');
  assert.equal(editor.activeTab.buffer.getText(), 'abcdef');
  key(editor, 'backspace');
  assert.equal(editor.activeTab.buffer.getText(), 'abcde');
  key(editor, 'backspace');
  key(editor, 'backspace');
  assert.equal(editor.activeTab.buffer.getText(), 'abc');
  ctrl(editor, 'z');
  assert.equal(editor.activeTab.buffer.getText(), 'abcd');
  ctrl(editor, 'z');
  assert.equal(editor.activeTab.buffer.getText(), 'abcde');
  ctrl(editor, 'y');
  assert.equal(editor.activeTab.buffer.getText(), 'abcd');
});

test('autoclosing brackets and quotes place cursor inside', async () => {
  const { editor } = await makeEditor();
  type(editor, '(');
  assert.equal(editor.activeTab.buffer.getText(), '()');
  assert.equal(editor.activeTab.cursor.x, 1);
  type(editor, 'x');
  assert.equal(editor.activeTab.buffer.getText(), '(x)');
  type(editor, '"');
  assert.equal(editor.activeTab.buffer.getText(), '(x"")');
  assert.equal(editor.activeTab.cursor.x, 3);
  key(editor, 'backspace');
  assert.equal(editor.activeTab.buffer.getText(), '(x)');
});

test('newline auto-indents and handles braces', async () => {
  const { editor } = await makeEditor();
  const tab = editor.activeTab;
  tab.language = 'go';
  type(editor, 'func f() {');
  key(editor, 'enter');
  assert.equal(tab.buffer.line(1), '    ');
  assert.equal(tab.cursor.y, 1);
  type(editor, 'return');
  key(editor, 'enter');
  assert.equal(tab.buffer.line(2), '    ');
});

test('newline between braces creates an indented block', async () => {
  const { editor } = await makeEditor();
  const tab = editor.activeTab;
  tab.buffer.setText('if x {}');
  tab.cursor = { y: 0, x: 6 };
  key(editor, 'enter');
  assert.deepEqual(tab.buffer.lines, ['if x {', '    ', '}']);
  assert.deepEqual(tab.cursor, { y: 1, x: 4 });
});

test('selection, copy, cut and paste work', async () => {
  const { editor } = await makeEditor();
  type(editor, 'hello world');
  ctrl(editor, 'a');
  ctrl(editor, 'c');
  assert.equal(editor.clipboard, 'hello world');
  key(editor, 'left');
  ctrl(editor, 'v');
  assert.ok(editor.activeTab.buffer.getText().includes('hello world'));
  ctrl(editor, 'a');
  ctrl(editor, 'x');
  assert.equal(editor.activeTab.buffer.getText(), '');
});

test('comment toggle, duplicate, delete line, move line and indent', async () => {
  const { editor } = await makeEditor();
  const tab = editor.activeTab;
  tab.buffer.setText('alpha\nbeta');
  tab.cursor = { y: 0, x: 0 };
  ctrl(editor, '/');
  assert.equal(tab.buffer.getText(), '// alpha\nbeta');
  ctrl(editor, '/');
  assert.equal(tab.buffer.getText(), 'alpha\nbeta');
  ctrl(editor, 'd');
  assert.equal(tab.buffer.getText(), 'alpha\nalpha\nbeta');
  ctrl(editor, 'l');
  assert.equal(tab.buffer.getText(), 'alpha\nbeta');
  editor.handleKey({ name: 'alt', alt: true, name: 'down', ctrl: false });
  tab.cursor = { y: 0, x: 0 };
  editor.moveLine(1);
  assert.equal(tab.buffer.getText(), 'beta\nalpha');
  ctrl(editor, 'a');
  key(editor, 'tab');
  assert.equal(tab.buffer.getText(), '    beta\n    alpha');
});

test('manual save and autosave after inactivity', async () => {
  const dir = tmp();
  const file = path.join(dir, 'auto.txt');
  fs.writeFileSync(file, 'start');
  const { editor } = await makeEditor([file]);
  const tab = editor.activeTab;
  type(editor, 'X');
  ctrl(editor, 's');
  await wait(60);
  assert.equal(fs.readFileSync(file, 'utf8'), 'Xstart');
  type(editor, 'Y');
  assert.equal(tab.modified, true);
  await wait(250);
  assert.equal(fs.readFileSync(file, 'utf8'), 'XYstart');
  assert.equal(tab.modified, false);
});

test('rapid typing in editor loses no characters', async () => {
  const { editor } = await makeEditor();
  const text = 'const result = compute(1, 2); // rapid typing test';
  for (const ch of text) editor.handleKey({ name: 'char', char: ch });
  assert.equal(editor.activeTab.buffer.getText(), text);
});

test('search and replace with case/regex options', async () => {
  const { editor } = await makeEditor();
  const tab = editor.activeTab;
  tab.buffer.setText('cat Cat category\ncat');
  editor.search.update(tab.buffer.getText(), 'cat', { caseSensitive: false });
  assert.equal(editor.search.matches.length, 4);
  editor.replaceState = { query: 'cat', replacement: 'dog', field: 'query', message: '', isError: false };
  editor.search.options.regex = false;
  editor.replaceAll();
  assert.equal(tab.buffer.getText(), 'dog dog dogegory\ndog');
});

test('find prompt and replace prompt via keyboard', async () => {
  const { editor } = await makeEditor();
  type(editor, 'one two one');
  ctrl(editor, 'f');
  type(editor, 'one');
  key(editor, 'enter');
  assert.equal(editor.search.matches.length, 2);
  assert.equal(editor.activeTab.selection.head.x, 11);
  ctrl(editor, 'h');
  assert.ok(editor.replaceState);
  editor.replaceState.query = '';
  type(editor, 'one');
  editor.replaceState.field = 'replacement';
  type(editor, 'Y');
  editor.replaceCurrent();
  assert.ok(editor.activeTab.buffer.getText().includes('Y'));
  key(editor, 'escape');
  assert.equal(editor.replaceState, null);
});

test('autocomplete suggests language keywords and Tab accepts', async () => {
  const { editor } = await makeEditor();
  editor.activeTab.language = 'go';
  type(editor, 'fu');
  assert.equal(editor.autocomplete.visible, true);
  assert.ok(editor.autocomplete.suggestions.some(s => s.text === 'func'));
  key(editor, 'tab');
  assert.match(editor.activeTab.buffer.getText(), /^func/);
});

test('theme switching updates renderer theme and persists', async () => {
  const { editor, settings } = await makeEditor();
  editor.themePicker();
  const dracula = editor.overlay.items.findIndex(i => i.value === 'dracula');
  editor.overlay.index = dracula;
  key(editor, 'enter');
  assert.equal(editor.theme.name, 'Dracula');
  assert.equal(settings.get('theme'), 'dracula');
  assert.equal(editor.renderer.theme.name, 'Dracula');
});

test('settings panel toggles a boolean and previews immediately', async () => {
  const { editor, settings } = await makeEditor();
  editor.settingsPanel();
  const idx = editor.overlay.items.findIndex(i => i.value.key === 'relativeLineNumbers');
  editor.overlay.index = idx;
  key(editor, 'enter');
  assert.equal(settings.get('relativeLineNumbers'), true);
  assert.equal(editor.overlay.items[idx].detail, 'true');
  key(editor, 'escape');
});

test('Persian and English text with emoji keeps correct cursor positions', async () => {
  const { editor } = await makeEditor();
  type(editor, 'سلام');
  type(editor, ' ');
  type(editor, '😀');
  type(editor, ' world');
  const text = editor.activeTab.buffer.getText();
  assert.equal(text, 'سلام 😀 world');
  assert.equal(editor.activeTab.cursor.x, 12);
  assert.equal(stringWidth('😀'), 2);
  assert.equal(stringWidth('س'), 1);
  key(editor, 'home');
  assert.equal(editor.activeTab.cursor.x, 0);
  key(editor, 'end');
  assert.equal(editor.activeTab.cursor.x, 12);
});

test('read-only files cannot be edited', async () => {
  const dir = tmp();
  const file = path.join(dir, 'ro.txt');
  fs.writeFileSync(file, 'protected');
  fs.chmodSync(file, 0o444);
  const { editor } = await makeEditor([file]);
  assert.equal(editor.activeTab.readOnly, true);
  type(editor, 'X');
  assert.equal(editor.activeTab.buffer.getText(), 'protected');
  fs.chmodSync(file, 0o644);
});

test('external file modification is detected', async () => {
  const dir = tmp();
  const file = path.join(dir, 'ext.txt');
  fs.writeFileSync(file, 'original');
  const { editor } = await makeEditor([file]);
  const tab = editor.activeTab;
  fs.writeFileSync(file, 'changed outside');
  const future = new Date(Date.now() + 10000);
  fs.utimesSync(file, future, future);
  editor._checkExternal(tab);
  assert.equal(tab.externalDirty, true);
  assert.match(editor.message, /changed on disk/);
});

test('terminal resize does not break rendering', async () => {
  const { editor, chunks } = await makeEditor();
  type(editor, 'hello');
  editor.renderer.resize(40, 10);
  editor.render();
  assert.ok(chunks.join('').includes('hello'));
});

test('go to line and quick file picker work', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'a.txt'), 'first');
  fs.writeFileSync(path.join(dir, 'b.txt'), 'second');
  const { editor } = await makeEditor([path.join(dir, 'a.txt')]);
  ctrl(editor, 'g');
  type(editor, '1');
  key(editor, 'enter');
  assert.deepEqual(editor.activeTab.cursor, { y: 0, x: 0 });
  ctrl(editor, 'p');
  assert.equal(editor.prompt.mode, 'picker');
  key(editor, 'escape');
  assert.equal(editor.prompt, null);
});

test('command palette opens theme and settings panels', async () => {
  const { editor } = await makeEditor();
  editor.handleKey({ name: 'char', char: ':', shift: true });
  assert.equal(editor.prompt.mode, 'command');
  type(editor, 'theme');
  key(editor, 'enter');
  assert.equal(editor.overlay.type, 'theme');
});

test('save as updates the current file path', async () => {
  const dir = tmp();
  const { editor } = await makeEditor();
  type(editor, 'content');
  editor.saveAs();
  const target = path.join(dir, 'renamed.txt');
  editor.prompt.value = target;
  key(editor, 'enter');
  await wait(250);
  assert.equal(editor.activeTab.filePath, target);
  assert.equal(fs.readFileSync(target, 'utf8'), 'content');
});

test('manual language selection changes the active tab language', async () => {
  const { editor } = await makeEditor();
  editor.changeLanguage();
  assert.equal(editor.overlay.type, 'language');
  const idx = editor.overlay.items.findIndex(i => i.value === 'rust');
  editor.overlay.index = idx;
  key(editor, 'enter');
  assert.equal(editor.activeTab.language, 'rust');
  assert.equal(editor.overlay, null);
});

test('word wrap keeps the cursor visible on long lines', async () => {
  const { editor, chunks } = await makeEditor();
  editor.settings.set('wordWrap', true);
  const tab = editor.activeTab;
  tab.buffer.setText('x'.repeat(300));
  tab.cursor = { y: 0, x: 299 };
  editor.render();
  assert.equal(tab.scrollY >= 0, true);
  assert.equal(tab.scrollX >= 0, true);
  assert.ok(chunks.join('').length > 100);
  key(editor, 'left');
  assert.equal(tab.cursor.x, 298);
});

test('autocomplete Enter accepts after explicit navigation', async () => {
  const { editor } = await makeEditor();
  editor.activeTab.language = 'go';
  type(editor, 'fu');
  assert.equal(editor.autocomplete.visible, true);
  key(editor, 'down');
  assert.equal(editor.autocomplete.navigated, true);
  key(editor, 'enter');
  assert.ok(editor.activeTab.buffer.getText().length > 2);
  assert.equal(editor.autocomplete.visible, false);
});

test('save failure to invalid path is reported without losing data', async () => {
  const dir = tmp();
  const { editor } = await makeEditor();
  type(editor, 'keep this');
  editor.saveAs();
  editor.prompt.value = dir;
  key(editor, 'enter');
  await wait(120);
  assert.equal(editor.activeTab.buffer.getText(), 'keep this');
  assert.ok(editor.message && /failed|directory|denied/i.test(editor.message), editor.message);
});

test('quit restores the terminal and cleans recovery data', async () => {
  const { editor, chunks, settings } = await makeEditor();
  await editor.quit(true);
  assert.equal(editor.stopped, true);
  assert.match(chunks.join(''), /\x1b\[\?1049l/);
  assert.equal(fs.readdirSync(settings.recoveryDir).length, 0);
});
