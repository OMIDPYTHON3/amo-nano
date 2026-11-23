import test from 'node:test';
import assert from 'node:assert/strict';
import { findMatches, replaceMatches, SearchState } from '../src/editor/search.js';

test('finds literal matches with positions', () => {
  const { matches, error } = findMatches('one two one\ntwo', 'one');
  assert.equal(error, null);
  assert.equal(matches.length, 2);
  assert.deepEqual(matches[0].start, { y: 0, x: 0 });
  assert.deepEqual(matches[1].start, { y: 0, x: 8 });
});

test('case sensitive and case insensitive search', () => {
  assert.equal(findMatches('Hello hello', 'hello', { caseSensitive: true }).matches.length, 1);
  assert.equal(findMatches('Hello hello', 'hello', { caseSensitive: false }).matches.length, 2);
});

test('regex search and invalid regex error', () => {
  const res = findMatches('a1 b22 c333', '[a-z]\\d+', { regex: true });
  assert.equal(res.matches.length, 3);
  assert.ok(findMatches('x', '[', { regex: true }).error);
});

test('whole word search', () => {
  assert.equal(findMatches('cat category cat', 'cat', { wholeWord: true }).matches.length, 2);
});

test('multiline regex matches map to correct positions', () => {
  const res = findMatches('a\nb\nc', 'b\\nc', { regex: true });
  assert.equal(res.matches.length, 1);
  assert.deepEqual(res.matches[0].start, { y: 1, x: 0 });
  assert.deepEqual(res.matches[0].end, { y: 2, x: 1 });
});

test('Unicode positions use code points', () => {
  const res = findMatches('😀 cat سلام cat', 'cat');
  assert.deepEqual(res.matches[0].start, { y: 0, x: 2 });
  assert.deepEqual(res.matches[1].start, { y: 0, x: 11 });
});

test('replace all literal and regex', () => {
  assert.equal(replaceMatches('a.b a.b', 'a.b', 'X').text, 'X X');
  const r = replaceMatches('a1 b2', '(\\w)(\\d)', '$2$1', { regex: true });
  assert.equal(r.text, '1a 2b');
  assert.equal(r.count, 2);
});

test('SearchState navigation', () => {
  const s = new SearchState();
  s.update('x x x', 'x');
  assert.equal(s.matches.length, 3);
  s.index = 0;
  assert.deepEqual(s.next().start, { y: 0, x: 2 });
  assert.deepEqual(s.previous().start, { y: 0, x: 0 });
});
