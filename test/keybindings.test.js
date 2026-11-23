import test from 'node:test';
import assert from 'node:assert/strict';
import { InputParser, resolveAction } from '../src/editor/keybindings.js';

function feed(parser, hex) {
  return parser.push(Buffer.from(hex, 'hex'));
}

test('parses printable characters and spaces', () => {
  const p = new InputParser();
  const events = feed(p, '616220');
  assert.deepEqual(events.map(e => e.name), ['char', 'char', 'space']);
  assert.equal(events[0].char, 'a');
});

test('parses UTF-8 multibyte characters as single code points', () => {
  const p = new InputParser();
  const events = feed(p, 'f09f9880');
  assert.equal(events.length, 1);
  assert.equal(events[0].char, '😀');
});

test('parses split UTF-8 sequences across chunks', () => {
  const p = new InputParser();
  const a = feed(p, 'f09f');
  const b = feed(p, '9880');
  assert.equal(a.length, 0);
  assert.equal(b.length, 1);
  assert.equal(b[0].char, '😀');
});

test('parses control keys', () => {
  const p = new InputParser();
  const events = feed(p, '130d7f09');
  assert.deepEqual(events.map(e => e.name), ['ctrl+s', 'enter', 'backspace', 'tab']);
  assert.equal(resolveAction(events[0]), 'save');
});

test('parses arrow and function escape sequences', () => {
  const p = new InputParser();
  const events = feed(p, '1b5b411b5b421b5b431b5b441b5b357e1b4f50');
  assert.deepEqual(events.map(e => e.name), ['up', 'down', 'right', 'left', 'pageup', 'f1']);
});

test('parses modifier sequences from Termux extra keys', () => {
  const p = new InputParser();
  const events = feed(p, '1b5b313b35441b5b313b3241');
  assert.equal(events[0].name, 'left');
  assert.equal(events[0].ctrl, true);
  assert.equal(resolveAction(events[0]), 'wordLeft');
  assert.equal(events[1].name, 'shift+up');
});

test('parses bracketed paste', () => {
  const p = new InputParser();
  const events = feed(p, Buffer.from('\x1b[200~hello world\x1b[201~').toString('hex'));
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'paste');
  assert.equal(events[0].text, 'hello world');
});

test('parses focus in/out events', () => {
  const p = new InputParser();
  const events = feed(p, '1b5b491b5b4f');
  assert.deepEqual(events.map(e => e.name), ['focusin', 'focusout']);
});

test('resolves all required keyboard shortcuts', () => {
  const map = {
    'ctrl+s': 'save', 'ctrl+o': 'open', 'ctrl+n': 'new', 'ctrl+w': 'close',
    'ctrl+q': 'quit', 'ctrl+z': 'undo', 'ctrl+y': 'redo', 'ctrl+f': 'find',
    'ctrl+h': 'replace', 'ctrl+p': 'quickOpen', 'ctrl+g': 'gotoLine',
    'ctrl+a': 'selectAll', 'ctrl+c': 'copy', 'ctrl+x': 'cut', 'ctrl+v': 'paste',
    'ctrl+/': 'toggleComment', 'ctrl+d': 'duplicateLine', 'ctrl+l': 'deleteLine'
  };
  for (const [name, action] of Object.entries(map)) {
    assert.equal(resolveAction({ name, ctrl: true }), action, name);
  }
});
