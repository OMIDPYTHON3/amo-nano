import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { InputParser } from '../src/editor/keybindings.js';
import { Editor } from '../src/editor/editor.js';
import { Settings } from '../src/editor/settings.js';

const wait = ms => new Promise(r => setTimeout(r, ms));

async function editorFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-paste-'));
  const editor = new Editor({ settings: new Settings(dir), noTerminal: true, write: () => { } });
  await editor.start([]);
  editor.render();
  return editor;
}

function key(editor, name, extra = {}) { editor.handleKey({ name, ...extra }); }
function chars(editor, text) {
  for (const ch of text) {
    if (ch === '\n') key(editor, 'enter');
    else if (ch === '\t') key(editor, 'tab');
    else key(editor, 'char', { char: ch });
  }
}

test('bulk clipboard chunk is emitted as one paste event', () => {
  const p = new InputParser();
  const text = 'func main() {\n\tfmt.Println("x:y") // note\n}';
  const events = p.push(Buffer.from(text, 'utf8'));
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'paste');
  assert.equal(events[0].text, text);
});

test('bracketed paste and normal key presses still work', () => {
  const p = new InputParser();
  const paste = p.push(Buffer.from('\x1b[200~a:b\n\tc\x1b[201~'));
  assert.equal(paste.length, 1);
  assert.equal(paste[0].name, 'paste');
  assert.equal(paste[0].text, 'a:b\n\tc');
  const keys = p.push(Buffer.from('xy:'));
  assert.deepEqual(keys.map(e => [e.name, e.char]), [['char', 'x'], ['char', 'y'], ['char', ':']]);
});

test('multiline paste inserts complete content verbatim, no command prompt', async () => {
  const editor = await editorFixture();
  const text = 'const url = "https://example.com/a:b"\n\tindented: true\nlast   ';
  key(editor, 'paste', { text });
  const tab = editor.activeTab;
  assert.equal(tab.buffer.getText(), text);
  assert.equal(editor.prompt, null);
  assert.equal(editor.activeTab.language, null);
  assert.deepEqual(tab.cursor, { y: 2, x: 7 });
});

test('paste normalizes CRLF without losing lines', async () => {
  const editor = await editorFixture();
  key(editor, 'paste', { text: 'one\r\n\ttwo\rthree' });
  assert.equal(editor.activeTab.buffer.getText(), 'one\n\ttwo\nthree');
  assert.equal(editor.prompt, null);
});

test('fragmented clipboard input with colon does not open command palette', async () => {
  const editor = await editorFixture();
  editor.pasteGuardUntil = Date.now() + 300;
  const text = 'map: value\n\tsecond: 2';
  chars(editor, text);
  assert.equal(editor.prompt, null);
  await wait(140);
  assert.equal(editor.activeTab.buffer.getText(), text);
});

test('typing colon normally still opens command palette', async () => {
  const editor = await editorFixture();
  key(editor, 'char', { char: ':' });
  assert.equal(editor.prompt?.mode, 'command');
});

test('colon inside a rapid character burst stays text', async () => {
  const editor = await editorFixture();
  key(editor, 'char', { char: 'a' });
  key(editor, 'char', { char: 'b' });
  key(editor, 'char', { char: ':' });
  assert.equal(editor.prompt, null);
  assert.equal(editor.activeTab.buffer.getText(), 'ab:');
});

test('pasting into a prompt inserts text instead of losing it', async () => {
  const editor = await editorFixture();
  key(editor, 'char', { char: ':' });
  assert.equal(editor.prompt.mode, 'command');
  key(editor, 'paste', { text: 'theme\nsettings' });
  assert.equal(editor.prompt.value, 'theme settings');
});
