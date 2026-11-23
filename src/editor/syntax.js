import { LANGUAGES } from './languages.js';

const WORD = /[\p{L}\p{N}_$]/u;
const DIGIT = /[0-9]/;
const HEX = /[0-9a-fA-F_]/;
const BIN = /[01_]/;
const OCT = /[0-7_]/;

function isWord(ch) { return !!ch && WORD.test(ch); }
function isDigit(ch) { return !!ch && DIGIT.test(ch); }

function pushToken(tokens, text, type) {
  if (!text) return;
  const last = tokens[tokens.length - 1];
  if (last && last.type === type) last.text += text;
  else tokens.push({ text, type: type || 'plain' });
}

function emptyState() { return { kind: null, quote: null, raw: false }; }
function stateKey(state) {
  return state && state.kind ? `${state.kind}:${state.quote || ''}` : '';
}

function scanNumber(cps, start) {
  let i = start;
  const first = cps[i];
  if (first === '0' && (cps[i + 1] === 'x' || cps[i + 1] === 'X')) {
    i += 2;
    while (i < cps.length && HEX.test(cps[i])) i++;
    return i;
  }
  if (first === '0' && (cps[i + 1] === 'b' || cps[i + 1] === 'B')) {
    i += 2;
    while (i < cps.length && BIN.test(cps[i])) i++;
    return i;
  }
  if (first === '0' && (cps[i + 1] === 'o' || cps[i + 1] === 'O')) {
    i += 2;
    while (i < cps.length && OCT.test(cps[i])) i++;
    return i;
  }
  if (first === '.') i++;
  while (i < cps.length && (DIGIT.test(cps[i]) || cps[i] === '_')) i++;
  if (cps[i] === '.') {
    i++;
    while (i < cps.length && (DIGIT.test(cps[i]) || cps[i] === '_')) i++;
  }
  if (cps[i] === 'e' || cps[i] === 'E') {
    i++;
    if (cps[i] === '+' || cps[i] === '-') i++;
    while (i < cps.length && DIGIT.test(cps[i])) i++;
  }
  if ([ 'f', 'F', 'l', 'L', 'd', 'D' ].includes(cps[i])) i++;
  return i > start ? i : start + 1;
}

function startsWith(cps, i, str) {
  const chars = Array.from(str);
  for (let k = 0; k < chars.length; k++) {
    if (cps[i + k] !== chars[k]) return false;
  }
  return true;
}

function indexOfSeq(cps, from, str) {
  const chars = Array.from(str);
  outer: for (let i = from; i <= cps.length - chars.length; i++) {
    for (let k = 0; k < chars.length; k++) if (cps[i + k] !== chars[k]) continue outer;
    return i;
  }
  return -1;
}

function findQuoteEnd(cps, from, quote, raw) {
  for (let i = from; i < cps.length; i++) {
    const ch = cps[i];
    if (!raw && ch === '\\') { i++; continue; }
    if (ch === quote) return i;
  }
  return -1;
}

export class SyntaxHighlighter {
  constructor() {
    this.cache = new Map();
    this.maxCache = 4000;
  }

  clearCache() { this.cache.clear(); }

  tokenizeLine(text, languageId, incomingState = null) {
    const lang = LANGUAGES[languageId] || null;
    if (!lang || !text) {
      return { tokens: text ? [{ text, type: 'plain' }] : [], state: incomingState || emptyState() };
    }
    const state = incomingState ? { ...incomingState } : emptyState();
    const key = `${languageId}\0${stateKey(state)}\0${text}`;
    const cached = this.cache.get(key);
    if (cached) return { tokens: cached.tokens, state: { ...cached.state } };

    const result = this._tokenize(text, lang, state);
    if (this.cache.size > this.maxCache) this.cache.clear();
    this.cache.set(key, { tokens: result.tokens, state: { ...result.state } });
    return { tokens: result.tokens, state: { ...result.state } };
  }

  highlightLines(lines, languageId) {
    const out = [];
    let state = emptyState();
    for (const line of lines) {
      const res = this.tokenizeLine(line, languageId, state);
      out.push(res.tokens);
      state = res.state;
    }
    return out;
  }

  _tokenize(text, lang, state) {
    const cps = Array.from(text);
    const tokens = [];
    const kw = lang.caseInsensitive
      ? new Set(lang.keywords.map(k => k.toUpperCase()))
      : new Set(lang.keywords);
    const ty = new Set(lang.types);
    const bi = new Set(lang.builtins);
    const co = new Set(lang.constants);
    let i = 0;
    let lastSig = '';
    let tagDepth = 0;

    const lookup = (word) => {
      const w = lang.caseInsensitive ? word.toUpperCase() : word;
      if (kw.has(w)) return 'keyword';
      if (ty.has(w)) return 'type';
      if (co.has(w)) return 'constant';
      if (bi.has(w)) return 'function';
      return null;
    };

    if (state.kind === 'block' && lang.blockComment) {
      const end = indexOfSeq(cps, 0, lang.blockComment[1]);
      if (end === -1) {
        pushToken(tokens, text, 'comment');
        return { tokens, state };
      }
      pushToken(tokens, cps.slice(0, end + Array.from(lang.blockComment[1]).length).join(''), 'comment');
      i = end + Array.from(lang.blockComment[1]).length;
      state.kind = null;
    } else if (state.kind === 'string' && state.quote) {
      const end = findQuoteEnd(cps, 0, state.quote, state.raw);
      if (end === -1) {
        pushToken(tokens, text, 'string');
        return { tokens, state };
      }
      pushToken(tokens, cps.slice(0, end + 1).join(''), 'string');
      i = end + 1;
      state.kind = null;
    } else if (state.kind === 'triple' && state.quote) {
      const end = indexOfSeq(cps, 0, state.quote);
      if (end === -1) {
        pushToken(tokens, text, 'string');
        return { tokens, state };
      }
      pushToken(tokens, cps.slice(0, end + 3).join(''), 'string');
      i = end + 3;
      state.kind = null;
    }

    while (i < cps.length) {
      const ch = cps[i];

      if (ch === ' ' || ch === '\t') {
        pushToken(tokens, ch, 'plain');
        i++;
        continue;
      }

      if (lang.lineComment && startsWith(cps, i, lang.lineComment)) {
        pushToken(tokens, cps.slice(i).join(''), 'comment');
        i = cps.length;
        break;
      }

      if (lang.blockComment && startsWith(cps, i, lang.blockComment[0])) {
        const end = indexOfSeq(cps, i + Array.from(lang.blockComment[0]).length, lang.blockComment[1]);
        if (end === -1) {
          pushToken(tokens, cps.slice(i).join(''), 'comment');
          state.kind = 'block';
          i = cps.length;
        } else {
          pushToken(tokens, cps.slice(i, end + Array.from(lang.blockComment[1]).length).join(''), 'comment');
          i = end + Array.from(lang.blockComment[1]).length;
        }
        continue;
      }

      if (lang.mode === 'markdown') {
        this._markdown(cps, i, tokens, pushToken);
        break;
      }

      if (lang.mode === 'markup') {
        if (ch === '<') {
          if (tagDepth === 0) {
            pushToken(tokens, '<', 'punctuation');
            i++;
            if (cps[i] === '/') { pushToken(tokens, '/', 'punctuation'); i++; }
            let name = '';
            while (i < cps.length && /[A-Za-z0-9:._-]/.test(cps[i])) { name += cps[i]; i++; }
            if (name) pushToken(tokens, name, 'tag');
            tagDepth = 1;
            lastSig = '>';
            continue;
          }
          pushToken(tokens, '<', 'punctuation');
          i++;
          continue;
        }
        if (tagDepth > 0) {
          if (ch === '>') {
            pushToken(tokens, '>', 'punctuation');
            tagDepth = 0;
            i++;
            lastSig = '>';
            continue;
          }
          if (ch === '/' && cps[i + 1] === '>') {
            pushToken(tokens, '/>', 'punctuation');
            tagDepth = 0;
            i += 2;
            continue;
          }
          if (ch === '=') {
            pushToken(tokens, '=', 'operator');
            i++;
            continue;
          }
          if (lang.strings.includes(ch)) {
            const end = findQuoteEnd(cps, i + 1, ch, false);
            if (end === -1) {
              pushToken(tokens, cps.slice(i).join(''), 'string');
              state.kind = 'string'; state.quote = ch;
              i = cps.length;
            } else {
              pushToken(tokens, cps.slice(i, end + 1).join(''), 'string');
              i = end + 1;
            }
            continue;
          }
          if (isWord(ch) || ch === '-' || ch === ':') {
            let name = '';
            while (i < cps.length && (isWord(cps[i]) || cps[i] === '-' || cps[i] === ':')) { name += cps[i]; i++; }
            let j = i;
            while (cps[j] === ' ') j++;
            pushToken(tokens, name, cps[j] === '=' ? 'attribute' : 'plain');
            lastSig = name[name.length - 1];
            continue;
          }
          pushToken(tokens, ch, 'punctuation');
          i++;
          continue;
        }
        pushToken(tokens, ch, 'plain');
        i++;
        continue;
      }

      if (lang.strings.includes(ch)) {
        const triple = lang.tripleStrings.find(t => t[0] === ch && startsWith(cps, i, t));
        if (triple) {
          const end = indexOfSeq(cps, i + Array.from(triple).length, triple);
          if (end === -1) {
            pushToken(tokens, cps.slice(i).join(''), 'string');
            state.kind = 'triple'; state.quote = triple;
            i = cps.length;
          } else {
            pushToken(tokens, cps.slice(i, end + Array.from(triple).length).join(''), 'string');
            i = end + Array.from(triple).length;
          }
          continue;
        }
        const raw = (lang.rawStrings || []).includes(ch);
        const end = findQuoteEnd(cps, i + 1, ch, raw);
        if (end === -1) {
          pushToken(tokens, cps.slice(i).join(''), 'string');
          state.kind = 'string'; state.quote = ch; state.raw = raw;
          i = cps.length;
        } else {
          let stringType = 'string';
          if (lang.mode === 'json' || lang.mode === 'yaml') {
            let j = end + 1;
            while (cps[j] === ' ' || cps[j] === '\t') j++;
            if (cps[j] === ':' || cps[j] === '=') stringType = 'property';
          }
          pushToken(tokens, cps.slice(i, end + 1).join(''), stringType);
          i = end + 1;
          lastSig = ch;
        }
        continue;
      }

      if (lang.mode === 'yaml' && ch === '[' && i > 0 && cps.slice(0, i).join('').trim() === '') {
        const end = cps.indexOf(']', i);
        if (end !== -1) {
          pushToken(tokens, cps.slice(i, end + 1).join(''), 'type');
          i = end + 1;
          continue;
        }
      }

      if (lang.identifierPrefix && ch === lang.identifierPrefix) {
        let name = lang.identifierPrefix;
        i++;
        while (i < cps.length && isWord(cps[i])) { name += cps[i]; i++; }
        pushToken(tokens, name, 'variable');
        lastSig = name[name.length - 1];
        continue;
      }

      if (lang.mode === 'shell' && (ch === '$' || (ch === '$' && cps[i + 1] === '{'))) {
        let name = '$';
        i++;
        if (cps[i] === '{') {
          name += '{';
          i++;
          while (i < cps.length && cps[i] !== '}') { name += cps[i]; i++; }
          if (cps[i] === '}') { name += '}'; i++; }
        } else {
          while (i < cps.length && isWord(cps[i])) { name += cps[i]; i++; }
        }
        pushToken(tokens, name, 'variable');
        lastSig = name[name.length - 1];
        continue;
      }

      if (ch === '@' && isWord(cps[i + 1])) {
        let name = '@';
        i++;
        while (i < cps.length && isWord(cps[i])) { name += cps[i]; i++; }
        pushToken(tokens, name, 'keyword');
        lastSig = name[name.length - 1];
        continue;
      }

      if (isDigit(ch) || (ch === '.' && isDigit(cps[i + 1]))) {
        const end = scanNumber(cps, i);
        pushToken(tokens, cps.slice(i, end).join(''), 'number');
        i = end;
        lastSig = cps[end - 1];
        continue;
      }

      if (isWord(ch)) {
        let word = '';
        while (i < cps.length && isWord(cps[i])) { word += cps[i]; i++; }
        let type = lookup(word);
        if (!type) {
          let j = i;
          while (cps[j] === ' ' || cps[j] === '\t') j++;
          if (cps[j] === '(') type = 'function';
          else if (lastSig === '.') type = 'property';
          else if (lang.mode === 'css') type = 'property';
          else type = 'variable';
        }
        if (lang.mode === 'css' || lang.mode === 'json' || lang.mode === 'yaml') {
          let j = i;
          while (cps[j] === ' ') j++;
          if (cps[j] === ':' || cps[j] === '=') type = 'property';
        }
        pushToken(tokens, word, type);
        lastSig = word[word.length - 1];
        continue;
      }

      if ('+-*/%=<>!&|^~?:'.includes(ch)) {
        let op = '';
        while (i < cps.length && '+-*/%=<>!&|^~?:'.includes(cps[i])) { op += cps[i]; i++; }
        pushToken(tokens, op, 'operator');
        lastSig = op[op.length - 1];
        continue;
      }

      if ('{}[]().,;:'.includes(ch)) {
        pushToken(tokens, ch, 'punctuation');
        lastSig = ch;
        i++;
        continue;
      }

      if (ch === '#' && (lang.mode === 'data' || lang.mode === 'css') && i === 0) {
        let name = '#';
        i++;
        while (i < cps.length && /[0-9a-fA-F]/.test(cps[i])) { name += cps[i]; i++; }
        pushToken(tokens, name, 'number');
        continue;
      }

      pushToken(tokens, ch, 'plain');
      lastSig = ch;
      i++;
    }

    return { tokens, state };
  }

  _markdown(cps, start, tokens, pushToken) {
    const line = cps.slice(start).join('');
    const add = (text, type) => pushToken(tokens, text, type);
    const inline = (text, plainType) => {
      let i = 0;
      let buf = '';
      const flush = () => { if (buf) { add(buf, plainType); buf = ''; } };
      while (i < text.length) {
        if (text[i] === '`') {
          flush();
          let j = i + 1;
          let code = '';
          while (j < text.length && text[j] !== '`') { code += text[j]; j++; }
          add('`', 'punctuation');
          add(code, 'string');
          if (j < text.length) add('`', 'punctuation');
          i = j + 1;
          continue;
        }
        if (text[i] === '*' || text[i] === '_') {
          flush();
          const mark = text[i];
          const double = text[i + 1] === mark;
          const delim = double ? mark + mark : mark;
          add(delim, 'keyword');
          i += delim.length;
          let j = i;
          while (j < text.length && !(text[j] === mark && (!double || text[j + 1] === mark))) j++;
          add(text.slice(i, j), double ? 'type' : 'variable');
          i = j;
          if (i < text.length) { add(delim, 'keyword'); i += delim.length; }
          continue;
        }
        if (text[i] === '[') {
          flush();
          let j = i + 1;
          while (j < text.length && text[j] !== ']') j++;
          add(text.slice(i, j + 1), 'function');
          if (text[j + 1] === '(') {
            let k = j + 2;
            while (k < text.length && text[k] !== ')') k++;
            add(text.slice(j + 1, k + 1), 'string');
            i = k + 1;
          } else i = j + 1;
          continue;
        }
        buf += text[i];
        i++;
      }
      flush();
    };

    if (/^\s{0,3}#{1,6}\s/.test(line)) {
      const m = line.match(/^(\s{0,3}#{1,6}\s)(.*)$/);
      add(m[1], 'keyword');
      inline(m[2], 'type');
      return;
    }
    if (/^\s*>\s?/.test(line)) {
      const m = line.match(/^(\s*>)(\s?)(.*)$/);
      add(m[1], 'keyword');
      add(m[2], 'plain');
      inline(m[3], 'comment');
      return;
    }
    if (/^\s*(```|~~~)/.test(line)) {
      add(line, 'string');
      return;
    }
    inline(line, 'plain');
  }
}

export const sharedHighlighter = new SyntaxHighlighter();

export function tokenizeLine(text, languageId, state) {
  return sharedHighlighter.tokenizeLine(text, languageId, state);
}
