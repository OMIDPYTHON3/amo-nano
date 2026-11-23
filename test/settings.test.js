import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Settings, DEFAULT_CONFIG } from '../src/editor/settings.js';
import { BUILTIN_THEMES, getTheme } from '../src/editor/themes.js';

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'amo-settings-')); }

test('defaults are loaded and persisted', () => {
  const dir = tmp();
  const s = new Settings(dir);
  assert.equal(s.get('theme'), DEFAULT_CONFIG.theme);
  assert.equal(s.get('autoSaveDelay'), 1000);
  assert.equal(s.set('tabSize', 2).ok, true);
  assert.equal(s.set('theme', 'dracula').ok, true);
  const s2 = new Settings(dir);
  assert.equal(s2.get('tabSize'), 2);
  assert.equal(s2.get('theme'), 'dracula');
});

test('invalid values are rejected with safe defaults retained', () => {
  const s = new Settings(tmp());
  assert.equal(s.set('tabSize', 99).ok, false);
  assert.equal(s.set('autoSave', 'yes').ok, false);
  assert.equal(s.set('unknown', true).ok, false);
  assert.equal(s.get('tabSize'), 4);
  assert.equal(s.get('autoSave'), true);
});

test('all 15 built-in themes define required colors', () => {
  assert.equal(Object.keys(BUILTIN_THEMES).length, 15);
  const keys = ['bg', 'fg', 'lineNumber', 'activeLine', 'cursor', 'selection', 'keyword', 'string',
    'function', 'comment', 'number', 'type', 'operator', 'statusBg', 'autocompleteBg',
    'searchHighlight', 'bracketMatch'];
  for (const [id, theme] of Object.entries(BUILTIN_THEMES)) {
    for (const key of keys) assert.ok(theme[key], `${id} missing ${key}`);
  }
  assert.equal(getTheme('nord').name, 'Nord');
  assert.equal(getTheme('unknown-id').id, 'catppuccin-mocha');
});

test('custom themes can be created, imported, exported and deleted', () => {
  const s = new Settings(tmp());
  const base = getTheme('dracula');
  const res = s.saveCustomTheme('my-theme', { ...base, name: 'My Theme', string: '#00ff00' });
  assert.equal(res.ok, true);
  assert.equal(s.customThemes['my-theme'].string, '#00ff00');
  const exported = s.exportTheme('my-theme');
  assert.equal(exported.ok, true);
  const s2 = new Settings(s.configDir);
  assert.ok(s2.customThemes['my-theme']);
  const imported = s2.importTheme(JSON.stringify({ ...base, id: 'imported', name: 'Imported' }));
  assert.equal(imported.ok, true);
  assert.ok(s2.customThemes['imported']);
  assert.equal(s2.deleteCustomTheme('my-theme').ok, true);
  assert.equal(s2.customThemes['my-theme'], undefined);
});

test('built-in themes cannot be overwritten', () => {
  const s = new Settings(tmp());
  const res = s.saveCustomTheme('dracula', { ...getTheme('dracula') });
  assert.equal(res.ok, false);
});
