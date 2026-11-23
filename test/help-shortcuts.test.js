import test from 'node:test';
import assert from 'node:assert/strict';
import { HELP } from '../src/cli/index.js';
import { buildShortcuts, SHORTCUTS } from '../src/editor/statusbar.js';

const flat = segments => segments.map(s => s.text).join('');

test('amo --help documents the Alt+T theme shortcut', () => {
  assert.ok(HELP.includes('Alt+T: Change Theme'));
  assert.ok(SHORTCUTS.some(([key, label]) => key === 'Alt+T' && label === 'Theme'));
});

test('bottom toolbar shows Alt+T on wide and narrow termux screens', () => {
  for (const cols of [100, 80, 50, 40, 30, 24, 20]) {
    const text = flat(buildShortcuts(cols));
    assert.ok(text.includes('Alt+T'), `Alt+T missing at ${cols} columns: ${text}`);
    assert.ok(text.length <= cols, `toolbar overflow at ${cols} columns: ${text.length}`);
  }
});

test('toolbar keeps other shortcuts on normal width', () => {
  const text = flat(buildShortcuts(100));
  for (const label of ['Save', 'Open', 'Find', 'Theme']) {
    assert.ok(text.includes(label), `${label} missing`);
  }
});
