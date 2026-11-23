import test from 'node:test';
import assert from 'node:assert/strict';
import { TextBuffer, History, isWordChar } from '../src/editor/buffer.js';

test('buffer initializes and normalizes line endings', () => {
  const b = new TextBuffer('a\r\nb\rc');
  assert.deepEqual(b.lines, ['a', 'b', 'c']);
  assert.equal(b.getText(), 'a\nb\nc');
  assert.equal(new TextBuffer('').lineCount, 1);
});

test('buffer inserts single and multiple lines', () => {
  const b = new TextBuffer('hello world');
  let pos = b.insert(0, 5, ' brave');
  assert.equal(b.getText(), 'hello brave world');
  assert.deepEqual(pos, { y: 0, x: 11 });
  pos = b.insert(0, 11, '\nsecond\nthird');
  assert.equal(b.lineCount, 3);
  assert.equal(b.line(1), 'second');
  assert.equal(b.line(2), 'third world');
  assert.deepEqual(pos, { y: 2, x: 5 });
});

test('buffer deletes ranges within and across lines', () => {
  const b = new TextBuffer('abcdef\nghijkl\nmnopqr');
  let res = b.deleteRange({ y: 0, x: 2 }, { y: 0, x: 4 });
  assert.equal(res.text, 'cd');
  assert.equal(b.line(0), 'abef');
  res = b.deleteRange({ y: 0, x: 4 }, { y: 2, x: 2 });
  assert.equal(res.text, '\nghijkl\nmn');
  assert.equal(b.getText(), 'abefopqr');
});

test('buffer backspace and deleteChar cross line boundaries', () => {
  const b = new TextBuffer('abc\ndef');
  let r = b.backspace(1, 0);
  assert.deepEqual(r.position, { y: 0, x: 3 });
  assert.equal(b.getText(), 'abcdef');
  r = b.deleteChar(0, 2);
  assert.equal(b.getText(), 'abdef');
});

test('buffer preserves Unicode code points and wide characters', () => {
  const b = new TextBuffer('سلام 😀 abc');
  assert.equal(b.lineLength(0), 10);
  assert.equal(b.charAt(0, 5), '😀');
  const r = b.deleteRange({ y: 0, x: 5 }, { y: 0, x: 6 });
  assert.equal(r.text, '😀');
  assert.equal(b.getText(), 'سلام  abc');
});

test('buffer getWord works with identifiers', () => {
  const b = new TextBuffer('const my_var2 = 1;');
  assert.deepEqual(b.getWord(0, 7), { start: 6, end: 13, text: 'my_var2', line: 0 });
  assert.equal(isWordChar('_'), true);
  assert.equal(isWordChar('+'), false);
});

test('history undo and redo restores snapshots', () => {
  const h = new History();
  const b = new TextBuffer('one');
  h.push({ lines: b.snapshot().lines });
  b.setText('two');
  assert.equal(h.canUndo, true);
  const prev = h.undo({ lines: b.snapshot().lines });
  b.restore(prev);
  assert.equal(b.getText(), 'one');
  const next = h.redo({ lines: b.snapshot().lines });
  b.restore(next);
  assert.equal(b.getText(), 'two');
});

test('rapid successive inserts never lose characters', () => {
  const b = new TextBuffer('');
  let x = 0;
  for (const ch of 'the quick brown fox jumps over the lazy dog') {
    const p = b.insert(0, x, ch);
    x = p.x;
  }
  assert.equal(b.getText(), 'the quick brown fox jumps over the lazy dog');
});
