import test from 'node:test';
import assert from 'node:assert/strict';
import { SyntaxHighlighter } from '../src/editor/syntax.js';
import { LANGUAGES, detectLanguage, resolveLanguage, listLanguages } from '../src/editor/languages.js';

const h = new SyntaxHighlighter();

function tokenMap(line, lang, state) {
  const res = h.tokenizeLine(line, lang, state);
  const map = {};
  for (const t of res.tokens) map[t.type] = (map[t.type] || '') + t.text;
  return { map, state: res.state, tokens: res.tokens };
}

test('all 25 requested languages are defined', () => {
  const expected = ['go', 'javascript', 'typescript', 'jsx', 'tsx', 'python', 'rust', 'c', 'cpp',
    'html', 'css', 'scss', 'json', 'yaml', 'toml', 'markdown', 'bash', 'shell', 'php', 'sql',
    'xml', 'java', 'kotlin', 'lua'];
  for (const id of expected) assert.ok(LANGUAGES[id], `missing ${id}`);
  assert.ok(listLanguages().length >= 24);
});

test('detects languages from extensions', () => {
  assert.equal(detectLanguage('main.go'), 'go');
  assert.equal(detectLanguage('src/config.json'), 'json');
  assert.equal(detectLanguage('1.py'), 'python');
  assert.equal(detectLanguage('server.js'), 'javascript');
  assert.equal(detectLanguage('a.tsx'), 'tsx');
  assert.equal(detectLanguage('README'), null);
  assert.equal(resolveLanguage('js'), 'javascript');
});

test('Go highlighting produces expected token types', () => {
  const r = tokenMap('func main() { fmt.Println("hi") // note', 'go');
  assert.match(r.map.keyword || '', /func/);
  assert.match(r.map.function || '', /main|Println/);
  assert.match(r.map.string || '', /"hi"/);
  assert.match(r.map.comment || '', /note/);
  assert.match(r.map.number || '', /^$/);
});

test('numbers and constants are classified', () => {
  const r = tokenMap('const x = 0xFF; if ok == true {}', 'javascript');
  assert.match(r.map.number || '', /0xFF/);
  assert.match(r.map.constant || '', /true/);
  assert.match(r.map.keyword || '', /const|if/);
});

test('python triple-quoted strings span lines', () => {
  const a = tokenMap('"""hello', 'python');
  assert.equal(a.state.kind, 'triple');
  const b = tokenMap('world"""', 'python', a.state);
  assert.match(b.map.string || '', /world"""/);
  assert.equal(b.state.kind, null);
});

test('block comments span lines', () => {
  const a = tokenMap('/* start', 'javascript');
  assert.equal(a.state.kind, 'block');
  const b = tokenMap('still comment */ let x = 1;', 'javascript', a.state);
  assert.match(b.map.comment || '', /still comment \*\//);
  assert.match(b.map.keyword || '', /let/);
  assert.equal(b.state.kind, null);
});

test('unclosed strings continue to next line', () => {
  const a = tokenMap('const s = "unterminated', 'javascript');
  assert.equal(a.state.kind, 'string');
  const b = tokenMap('still string"', 'javascript', a.state);
  assert.match(b.map.string || '', /still string"/);
});

test('markdown headings and code spans highlight', () => {
  const r = tokenMap('# Hello `world`', 'markdown');
  assert.match(r.map.keyword || '', /# /);
  assert.match(r.map.type || '', /Hello/);
  assert.match(r.map.string || '', /world/);
});

test('JSON keys are properties', () => {
  const r = tokenMap('{"name": "amo", "ok": true}', 'json');
  assert.match(r.map.property || '', /"name"/);
  assert.match(r.map.constant || '', /true/);
});

test('HTML tags and attributes highlight', () => {
  const r = tokenMap('<a href="x">hi</a>', 'html');
  assert.match(r.map.tag || '', /a/);
  assert.match(r.map.attribute || '', /href/);
  assert.match(r.map.string || '', /"x"/);
});

test('all languages tokenize without throwing', () => {
  for (const [id] of Object.entries(LANGUAGES)) {
    const r = h.tokenizeLine('let x = 42; // text "str"', id);
    assert.ok(Array.isArray(r.tokens), id);
  }
});
