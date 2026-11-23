import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../src/editor/renderer.js';
import { getTheme } from '../src/editor/themes.js';
import { Settings } from '../src/editor/settings.js';
import { createTab } from '../src/editor/tabs.js';

function setup(cols = 80, rows = 24) {
  const chunks = [];
  const settings = new Settings('/tmp/amo-render-settings-' + process.pid);
  const theme = getTheme('dracula');
  const r = new Renderer(s => chunks.push(s), settings, theme);
  r.resize(cols, rows);
  chunks.length = 0;
  return { r, chunks, theme, settings };
}

function ctx(tab, extra = {}) {
  return {
    tab, tabs: [tab], activeIndex: 0,
    config: { lineNumbers: true, cursorLine: true, tabSize: 4, syntaxHighlighting: true },
    prompt: null, overlay: null, autocomplete: { visible: false, suggestions: [] },
    search: null, message: null, insertMode: false, mode: 'NORMAL',
    ...extra
  };
}

test('renderer emits 24-bit ANSI colors, line numbers and status bar', () => {
  const { r, chunks } = setup();
  const tab = createTab({ content: 'package main\nfunc main() {}', filePath: '/tmp/main.go', language: 'go' });
  r.render(ctx(tab));
  const out = chunks.join('');
  assert.match(out, /\x1b\[38;2;\d+;\d+;\d+m/);
  assert.match(out, /\x1b\[48;2;\d+;\d+;\d+m/);
  assert.match(out, /main\.go/);
  assert.match(out, /1:1|Ln 1, Col 1/);
  assert.match(out, /Go/);
  assert.match(out, /\x1b\[\?25l/);
  assert.match(out, /\x1b\[\?25h/);
});

test('renderer does differential updates — unchanged rows are not rewritten', () => {
  const { r, chunks } = setup();
  const tab = createTab({ content: 'line one\nline two', language: 'javascript' });
  r.render(ctx(tab));
  const first = chunks.join('');
  chunks.length = 0;
  r.render(ctx(tab));
  const second = chunks.join('');
  assert.ok(first.includes('line one'));
  assert.doesNotMatch(second, /line one/);
  assert.doesNotMatch(second, /\x1b\[1;1H/);
});

test('renderer positions cursor using escape sequences', () => {
  const { r, chunks } = setup();
  const tab = createTab({ content: 'abc\ndef', language: 'javascript' });
  tab.cursor = { y: 1, x: 2 };
  r.render(ctx(tab));
  assert.match(chunks.join(''), /\x1b\[\d+;\d+H/);
  assert.equal(r.cursorScreen.visible, true);
  assert.equal(r.cursorScreen.col, 8);
});

test('renderer shows tab modification marker and read-only status', () => {
  const { r, chunks } = setup();
  const tab = createTab({ content: 'x', filePath: '/tmp/x.go', language: 'go', readOnly: true });
  tab.modified = true;
  r.render(ctx(tab));
  assert.match(chunks.join(''), /●/);
  chunks.length = 0;
  tab.modified = false;
  r.forceFull = true;
  r.render(ctx(tab));
  assert.match(chunks.join(''), /READ-ONLY/);
});

test('renderer handles resize and unicode wide characters', () => {
  const { r, chunks } = setup(60, 14);
  const tab = createTab({ content: 'سلام 😀 person', language: 'go' });
  r.render(ctx(tab));
  assert.ok(chunks.join('').length > 0);
  r.resize(100, 30);
  assert.equal(r.forceFull, true);
});
