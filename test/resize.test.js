import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Terminal, RESTORE_SEQUENCE } from '../src/editor/terminal.js';
import { Renderer } from '../src/editor/renderer.js';
import { Editor } from '../src/editor/editor.js';
import { Settings } from '../src/editor/settings.js';
import { getTheme } from '../src/editor/themes.js';

const wait = ms => new Promise(r => setTimeout(r, ms));

function renderer(chunks = []) {
  const settings = new Settings('/tmp/amo-resize-settings-' + process.pid);
  const r = new Renderer(s => chunks.push(s), settings, getTheme('dracula'));
  r.resize(100, 30);
  chunks.length = 0;
  return { r, chunks, settings };
}

function renderCtx(tab, cols, rows) {
  return {
    tab, tabs: [tab], activeIndex: 0,
    config: { lineNumbers: true, cursorLine: true, tabSize: 4, syntaxHighlighting: true },
    prompt: null, overlay: null, autocomplete: { visible: false, suggestions: [] },
    search: null, message: null, insertMode: false, mode: 'NORMAL'
  };
}

async function editorFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-resize-'));
  const settings = new Settings(dir);
  const chunks = [];
  const editor = new Editor({ settings, noTerminal: true, write: s => chunks.push(s) });
  await editor.start([]);
  editor.render();
  return { editor, chunks, dir };
}

test('renderer resize stores dimensions and clears before redraw only', () => {
  const { r, chunks } = renderer();
  assert.equal(r.resize(60, 22), true);
  assert.equal(r.cols, 60);
  assert.equal(r.rows, 22);
  assert.equal(chunks[0], '\x1b[2J\x1b[H');
  assert.equal(r.prevRows.length, 0);
  assert.equal(r.forceFull, true);
  assert.equal(r.resize(60, 22), false);
  assert.equal(chunks.length, 1);
});

test('footer stays at the real terminal bottom across many heights', () => {
  const { r, chunks } = renderer();
  for (const [cols, rows] of [[100, 30], [80, 18], [120, 40], [60, 12], [90, 24], [42, 8]]) {
    r.resize(cols, rows);
    chunks.length = 0;
    r.render(renderCtx({ buffer: { lineCount: 1, lines: ['x'], cps: () => ['x'], line: () => 'x' }, cursor: { y: 0, x: 0 }, selection: {}, scrollY: 0, scrollX: 0, displayName: 'a.go', language: 'go', modified: false, saveStatus: 'saved' }, cols, rows));
    const out = chunks.join('');
    assert.match(out, new RegExp(`\\x1b\\[${rows};1H`), `footer row for ${rows}`);
    assert.match(out, new RegExp(`\\x1b\\[${rows - 1};1H`), `status row for ${rows}`);
    assert.equal(r.prevRows.length, rows);
    assert.ok(!out.slice(out.lastIndexOf('\x1b[2J') + 4).includes('\x1b[2J'), 'no clear after drawing');
  }
});

test('shrinking viewport clears before drawing, never after', () => {
  const { r, chunks } = renderer();
  r.render(renderCtx({ buffer: { lineCount: 1, lines: ['x'], cps: () => ['x'], line: () => 'x' }, cursor: { y: 0, x: 0 }, selection: {}, scrollY: 0, scrollX: 0, displayName: 'a.go', language: 'go', modified: false, saveStatus: 'saved' }, 100, 30));
  r.resize(100, 14);
  chunks.length = 0;
  r.render(renderCtx({ buffer: { lineCount: 1, lines: ['x'], cps: () => ['x'], line: () => 'x' }, cursor: { y: 0, x: 0 }, selection: {}, scrollY: 0, scrollX: 0, displayName: 'a.go', language: 'go', modified: false, saveStatus: 'saved' }, 100, 14));
  const out = chunks.join('');
  assert.equal(out.includes('\x1b[2J'), false);
  assert.ok(out.includes('\x1b[14;1H'));
});

test('editor handleResize updates renderer and preserves editing state', async () => {
  const { editor, chunks } = await editorFixture();
  const tab = editor.activeTab;
  tab.buffer.setText('alpha\nbeta\ngamma');
  tab.cursor = { y: 2, x: 3 };
  tab.scrollY = 0;
  editor.activeTab.buffer.setText('draft');
  editor.handleKey({ name: 'char', char: 'x' });
  editor.handleKey({ name: 'char', char: 'y' });
  editor.handleKey({ name: 'ctrl+z' });
  tab.buffer.setText('alpha\nbeta\ngamma');
  tab.cursor = { y: 2, x: 3 };
  editor.handleResize(72, 11);
  assert.equal(editor.renderer.cols, 72);
  assert.equal(editor.renderer.rows, 11);
  assert.equal(tab.buffer.getText(), 'alpha\nbeta\ngamma');
  assert.deepEqual(tab.cursor, { y: 2, x: 3 });
  assert.equal(editor.tabs.count, 1);
  assert.ok(tab.history.canUndo);
  const out = chunks.join('');
  assert.ok(out.includes('\x1b[11;1H'));
  assert.ok(out.includes('\x1b[2J\x1b[H'));
});

test('editor handleResize clamps stale scroll and keeps cursor visible', async () => {
  const { editor } = await editorFixture();
  const tab = editor.activeTab;
  tab.buffer.setText(Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n'));
  tab.cursor = { y: 55, x: 2 };
  editor.render();
  assert.ok(tab.scrollY > 0);
  editor.handleResize(80, 40);
  assert.ok(tab.scrollY <= 60 - 3);
  assert.ok(tab.scrollY >= 0);
  assert.deepEqual(tab.cursor, { y: 55, x: 2 });
  editor.handleResize(80, 12);
  assert.ok(tab.scrollY + (12 - 3) > tab.cursor.y);
});

test('rapid repeated resizes coalesce into correct final layout', async () => {
  const { editor } = await editorFixture();
  for (const [cols, rows] of [[80, 20], [80, 12], [80, 28], [60, 16], [90, 34]]) {
    editor.handleResize(cols, rows);
  }
  assert.equal(editor.renderer.cols, 90);
  assert.equal(editor.renderer.rows, 34);
  assert.equal(editor.renderer.prevRows.length, 34);
});

function fakeTerminal(onResize) {
  const output = new EventEmitter();
  output.columns = 80;
  output.rows = 24;
  output.write = () => { };
  const input = new EventEmitter();
  input.isRaw = false;
  input.setRawMode = () => { };
  input.resume = () => { };
  input.setEncoding = () => { };
  input.pause = () => { };
  const calls = [];
  const term = new Terminal({
    input, output,
    onResize: (...args) => { calls.push(args); onResize?.(...args); }
  });
  return { term, output, input, calls };
}

test('terminal listens once for SIGWINCH and reports real dimensions', async () => {
  const before = process.listenerCount('SIGWINCH');
  const { term, output, calls } = fakeTerminal();
  term.start();
  assert.equal(process.listenerCount('SIGWINCH'), before + 1);
  term.start();
  assert.equal(process.listenerCount('SIGWINCH'), before + 1);
  output.rows = 32;
  output.columns = 78;
  process.emit('SIGWINCH');
  await wait(60);
  assert.deepEqual(calls[calls.length - 1], [78, 32]);
  assert.equal(calls.length, 1);
  term.stop();
  assert.equal(process.listenerCount('SIGWINCH'), before);
});

test('terminal coalesces duplicate resize signals', async () => {
  const { term, output, calls } = fakeTerminal();
  term.start();
  output.rows = 30;
  process.emit('SIGWINCH');
  output.emit('resize');
  process.emit('SIGWINCH');
  await wait(70);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [80, 30]);
  term.stop();
});

test('terminal ignores unchanged dimensions and catches missed signals by polling', async () => {
  const { term, output, calls } = fakeTerminal();
  term.start();
  process.emit('SIGWINCH');
  await wait(40);
  assert.equal(calls.length, 0);
  output.rows = 26;
  await wait(400);
  assert.ok(calls.length >= 1);
  assert.deepEqual(calls[calls.length - 1], [80, 26]);
  term.stop();
});

test('exit restores terminal without clearing or homing cursor', () => {
  const written = [];
  const output = new EventEmitter();
  output.columns = 80;
  output.rows = 24;
  output.write = data => written.push(data);
  const input = new EventEmitter();
  let rawMode = false;
  input.isRaw = false;
  input.setRawMode = value => { rawMode = value; };
  input.resume = () => { };
  input.setEncoding = () => { };
  input.pause = () => { };
  const term = new Terminal({ input, output, onResize: () => { } });
  term.start();
  assert.equal(rawMode, true);
  written.length = 0;
  const sigwinBefore = process.listenerCount('SIGWINCH');
  term.stop();
  assert.equal(rawMode, false);
  assert.equal(written.join(''), RESTORE_SEQUENCE);
  assert.ok(!written.join('').includes('\x1b[2J'));
  assert.ok(!written.join('').includes('\x1b[H'));
  assert.equal(process.listenerCount('SIGWINCH'), sigwinBefore - 1);
  assert.equal(term.pollTimer, null);
  assert.equal(term.resizeTimer, null);
});

test('terminal size re-reads process.stdout each access', () => {
  const { term, output } = fakeTerminal();
  assert.equal(term.size.rows, 24);
  output.rows = 36;
  assert.equal(term.size.rows, 36);
  output.rows = 0;
  assert.ok(term.size.rows > 0);
});
