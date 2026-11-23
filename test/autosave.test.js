import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Settings } from '../src/editor/settings.js';
import { FileManager } from '../src/editor/file-manager.js';
import { AutoSave } from '../src/editor/autosave.js';
import { createTab } from '../src/editor/tabs.js';

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'amo-autosave-')); }
const wait = ms => new Promise(r => setTimeout(r, ms));

test('autosave writes after inactivity and marks tab saved', async () => {
  const dir = tmp();
  const file = path.join(dir, 'a.txt');
  fs.writeFileSync(file, 'old');
  const settings = new Settings(dir);
  settings.values.autoSaveDelay = 80;
  const fm = new FileManager();
  const load = await fm.load(file);
  const tab = createTab({ content: load.text, filePath: file, fingerprint: load.fingerprint });
  const statuses = [];
  const as = new AutoSave(settings, fm, (_t, s) => statuses.push(s));
  tab.buffer.setText('new content');
  tab.modified = true;
  as.schedule(tab);
  await wait(250);
  assert.equal(fs.readFileSync(file, 'utf8'), 'new content');
  assert.equal(tab.modified, false);
  assert.ok(statuses.includes('saving'));
  assert.ok(statuses.includes('saved'));
  as.destroy();
});

test('autosave timer resets on continued typing', async () => {
  const dir = tmp();
  const file = path.join(dir, 'b.txt');
  fs.writeFileSync(file, '');
  const settings = new Settings(dir);
  settings.values.autoSaveDelay = 100;
  const fm = new FileManager();
  const load = await fm.load(file);
  const tab = createTab({ content: '', filePath: file, fingerprint: load.fingerprint });
  let saved = 0;
  const as = new AutoSave(settings, fm, (_t, s) => { if (s === 'saved') saved++; });
  for (let i = 0; i < 5; i++) {
    tab.buffer.setText('x'.repeat(i + 1));
    tab.modified = true;
    as.schedule(tab);
    await wait(40);
  }
  await wait(220);
  assert.equal(saved, 1);
  assert.equal(fs.readFileSync(file, 'utf8'), 'xxxxx');
  as.destroy();
});

test('autosave refuses to overwrite externally changed file', async () => {
  const dir = tmp();
  const file = path.join(dir, 'c.txt');
  fs.writeFileSync(file, 'original');
  const settings = new Settings(dir);
  const fm = new FileManager();
  const load = await fm.load(file);
  const tab = createTab({ content: 'original', filePath: file, fingerprint: load.fingerprint });
  const as = new AutoSave(settings, fm);
  fs.writeFileSync(file, 'modified by another process');
  tab.buffer.setText('my changes');
  tab.modified = true;
  const res = await as.flushOne(tab, 'manual');
  assert.equal(res.ok, false);
  assert.equal(res.conflict, true);
  assert.equal(fs.readFileSync(file, 'utf8'), 'modified by another process');
});

test('autosave skips unmodified files and honors force', async () => {
  const dir = tmp();
  const file = path.join(dir, 'd.txt');
  fs.writeFileSync(file, 'v1');
  const settings = new Settings(dir);
  const fm = new FileManager();
  const load = await fm.load(file);
  const tab = createTab({ content: 'v1', filePath: file, fingerprint: load.fingerprint });
  const as = new AutoSave(settings, fm);
  assert.equal((await as.flushOne(tab)).skipped, true);
  tab.buffer.setText('v2');
  tab.modified = true;
  fs.writeFileSync(file, 'external');
  const forced = await as.flushOne(tab, 'force', { force: true, ignoreConflict: true });
  assert.equal(forced.ok, true);
  assert.equal(fs.readFileSync(file, 'utf8'), 'v2');
});

test('autosave disabled does not schedule', async () => {
  const dir = tmp();
  const settings = new Settings(dir);
  settings.values.autoSave = false;
  const fm = new FileManager();
  const tab = createTab({ filePath: path.join(dir, 'e.txt') });
  const as = new AutoSave(settings, fm);
  as.schedule(tab);
  assert.equal(as.timers.size, 0);
});
