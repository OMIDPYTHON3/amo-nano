import { escapeRegex } from './util.js';

function buildIndexMap(text) {
  const map = new Array(text.length + 1);
  let y = 0, x = 0;
  for (let i = 0; i < text.length;) {
    map[i] = { y, x };
    const cp = text.codePointAt(i);
    const size = cp > 0xffff ? 2 : 1;
    for (let k = 1; k < size; k++) map[i + k] = { y, x };
    i += size;
    if (cp === 10) { y++; x = 0; } else x++;
  }
  map[text.length] = { y, x };
  return map;
}

export function findMatches(text, query, options = {}) {
  const result = [];
  if (!query) return { matches: result, error: null };
  const caseSensitive = !!options.caseSensitive;
  const useRegex = !!options.regex;
  const wholeWord = !!options.wholeWord;
  let re;
  try {
    if (useRegex) {
      re = new RegExp(query, `gm${caseSensitive ? '' : 'i'}`);
    } else {
      let escaped = escapeRegex(query);
      if (wholeWord) escaped = `\\b${escaped}\\b`;
      re = new RegExp(escaped, `gm${caseSensitive ? '' : 'i'}`);
    }
  } catch (e) {
    return { matches: result, error: e.message };
  }
  const map = buildIndexMap(text);
  let m;
  let guard = 0;
  while ((m = re.exec(text)) !== null && guard++ < 200000) {
    if (m[0].length === 0) { re.lastIndex++; continue; }
    const start = map[m.index] || { y: 0, x: 0 };
    const end = map[m.index + m[0].length] || start;
    result.push({ start, end, text: m[0], groups: m.slice(1) });
    if (!re.global) break;
  }
  return { matches: result, error: null };
}

export function replaceMatches(text, query, replacement, options = {}) {
  const found = findMatches(text, query, options);
  if (found.error) return { text, count: 0, error: found.error };
  if (!query || found.matches.length === 0) return { text, count: 0, error: null };
  const flags = `gm${options.caseSensitive ? '' : 'i'}`;
  let re;
  if (options.regex) re = new RegExp(query, flags);
  else {
    const escaped = escapeRegex(query);
    re = new RegExp(options.wholeWord ? `\\b${escaped}\\b` : escaped, flags);
  }
  let count = 0;
  const out = text.replace(re, (...args) => {
    count++;
    if (options.regex && replacement.includes('$')) {
      const match = args[0];
      const groups = args.slice(1, -2);
      const offset = args[args.length - 2];
      const full = args[args.length - 1];
      return replacement.replace(/\$(\d|\$&|&)/g, (tok, g) => {
        if (g === '$') return '$';
        if (g === '&') return match;
        const idx = Number(g);
        return groups[idx - 1] ?? '';
      });
    }
    return replacement;
  });
  return { text: out, count, error: null };
}

export class SearchState {
  constructor() {
    this.query = '';
    this.replacement = '';
    this.options = { caseSensitive: false, regex: false, wholeWord: false };
    this.matches = [];
    this.index = -1;
    this.error = null;
  }

  update(text, query = this.query, options = this.options) {
    this.query = query;
    this.options = { ...this.options, ...options };
    const res = findMatches(text, this.query, this.options);
    this.matches = res.matches;
    this.error = res.error;
    if (this.index >= this.matches.length) this.index = this.matches.length - 1;
    return res;
  }

  current() {
    if (!this.matches.length) return null;
    if (this.index < 0) this.index = 0;
    return this.matches[this.index];
  }

  next() {
    if (!this.matches.length) return null;
    this.index = (this.index + 1 + this.matches.length) % this.matches.length;
    return this.current();
  }

  previous() {
    if (!this.matches.length) return null;
    this.index = (this.index - 1 + this.matches.length) % this.matches.length;
    return this.current();
  }

  matchAt(pos) {
    return this.matches.findIndex(m =>
      (m.start.y === pos.y && m.start.x >= pos.x) ||
      m.start.y > pos.y
    );
  }

  replaceAll(text, replacement = this.replacement, options = this.options) {
    this.replacement = replacement;
    this.options = { ...this.options, ...options };
    const res = replaceMatches(text, this.query, replacement, this.options);
    if (!res.error) this.update(res.text);
    return res;
  }
}
